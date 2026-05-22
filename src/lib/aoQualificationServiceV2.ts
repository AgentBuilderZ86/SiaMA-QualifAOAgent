import { aoRepository } from "@/lib/aoRepository";
import {
  extractDocumentSections,
  summarizeDocumentText,
  isServerlessRuntime
} from "@/lib/documents";
import { NETLIFY_MAX_DURATION_MS, QUALIFICATION_BUDGET_MS } from "@/lib/constants";
import { extractKeyMetadata, isPlaceholderSection } from "@/lib/qualification/documentMetadata";
import { filenameSignalsPrefix, parseFilenameSignals } from "@/lib/qualification/filenameSignals";
import { generateQualificationRecommendation } from "@/lib/llm";
import { generateIntelligentQualification } from "@/lib/qualification/intelligence";
import type {
  QualificationDocumentExtraction,
  QualificationDocumentKind,
  QualificationFiche
} from "@/lib/aoTypes";
import { ficheForGSheets, remapFicheFromIntelligence } from "@/lib/aoTypes";

export type DocumentInput = {
  name: string;
  kind: QualificationDocumentKind;
  text: string;
  warning?: string;
  ocrUsed?: boolean;
  extractionMode?: QualificationDocumentExtraction["extractionMode"];
};

export type QualificationV2Body = {
  documents: DocumentInput[];
  manualExtract?: string;
  enrichWeb?: boolean;
  fields?: {
    contexte?: string;
    perimetre?: string;
    profils?: string;
    concurrence?: string;
    relation?: string;
    budget?: string;
    chances?: string;
    risques?: string;
  };
};

function buildCorpus(documents: DocumentInput[], manualExtract: string): string {
  const parts = documents
    .filter((d) => d.text.trim())
    .map((d) => `--- Document ${d.kind} : ${d.name} ---\n${d.text.trim()}`);
  if (manualExtract.trim()) {
    parts.push(`--- Extrait manuel utilisateur ---\n${manualExtract.trim()}`);
  }
  return parts.join("\n\n");
}

function extractionStatus(documents: DocumentInput[], manualExtract: string): string {
  if (!documents.length && !manualExtract.trim()) return "Aucun document transmis.";
  const ocr = documents.filter((d) => d.ocrUsed).map((d) => d.name);
  const unreadable = documents.filter((d) => d.extractionMode === "unreadable").map((d) => d.name);
  const warnings = documents.map((d) => d.warning).filter(Boolean) as string[];
  return [
    documents.length ? `${documents.length} document(s) analysé(s).` : "",
    ocr.length ? `OCR utilisé : ${ocr.join(", ")}.` : "",
    unreadable.length ? `Document(s) peu lisible(s) : ${unreadable.join(", ")}.` : "",
    ...warnings
  ]
    .filter(Boolean)
    .join(" ");
}

export async function saveQualificationV2(
  aoNum: string,
  actor: string,
  body: QualificationV2Body
): Promise<QualificationFiche> {
  const startMs = Date.now();

  // Parallel Sheets reads — saves 5-10 s vs sequential
  const [ao, referentials] = await Promise.all([
    aoRepository.findAo(aoNum),
    aoRepository.readReferentials()
  ]);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);

  const manualExtract = body.manualExtract?.trim() ?? "";
  const documents = body.documents ?? [];
  const documentCorpus = buildCorpus(documents, manualExtract);

  if (!documentCorpus.trim()) {
    throw new Error(
      "Ajoutez au moins un document AO (Avis, CPS, RC) ou collez un extrait manuel."
    );
  }

  const documentName = documents
    .map((d) => d.name)
    .filter(Boolean)
    .join(", ");
  const filenameSignals = documents.reduce(
    (acc, d) => ({ ...acc, ...parseFilenameSignals(d.name || "") }),
    parseFilenameSignals(documentName || "")
  );
  const prefixedDocText = filenameSignalsPrefix(filenameSignals) + documentCorpus;
  const documentExtract = summarizeDocumentText(prefixedDocText, manualExtract);
  const sectionsRaw = extractDocumentSections(documentExtract);
  const meta = extractKeyMetadata(documentExtract);

  let mergedBudget = sectionsRaw.budget;
  if (isPlaceholderSection(mergedBudget) && meta.budget) mergedBudget = meta.budget;

  let mergedDuree = sectionsRaw.duree;
  if (isPlaceholderSection(mergedDuree) && meta.duree) mergedDuree = meta.duree;

  let mergedPerimetre = sectionsRaw.perimetre;
  if (isPlaceholderSection(mergedPerimetre) && meta.lieu) {
    mergedPerimetre = `Lieu (détection texte) : ${meta.lieu}`;
  }

  let mergedProfils = sectionsRaw.profils;
  if (isPlaceholderSection(mergedProfils) && meta.maitreOuvrage) {
    mergedProfils = `Maître d'ouvrage / commanditaire (détection texte) : ${meta.maitreOuvrage}`;
  }

  const sections = {
    ...sectionsRaw,
    budget: mergedBudget,
    duree: mergedDuree,
    perimetre: mergedPerimetre,
    profils: mergedProfils
  };

  const fromField = (key: keyof NonNullable<QualificationV2Body["fields"]>, fallback: string) =>
    body.fields?.[key]?.trim() || fallback || "À confirmer";

  const extractionEvidence =
    meta.matchNotes.length || meta.emails.length || meta.dateLimite || meta.lieu || meta.maitreOuvrage
      ? {
          metadataMatchNotes: meta.matchNotes.length ? meta.matchNotes : undefined,
          emailsDetected: meta.emails.length ? meta.emails : undefined,
          dateLimiteRegex: meta.dateLimite,
          lieuRegex: meta.lieu,
          maitreOuvrageRegex: meta.maitreOuvrage
        }
      : undefined;

  const pipelineNotes = extractionStatus(documents, manualExtract);
  const docsAsExtractions: QualificationDocumentExtraction[] = documents.map((d) => ({
    kind: d.kind,
    name: d.name,
    text: d.text,
    warning: d.warning ?? "",
    extractionMode: d.extractionMode ?? "native",
    ocrUsed: d.ocrUsed,
    extractedAt: new Date().toISOString()
  }));

  const fiche: QualificationFiche = {
    contexte: fromField("contexte", sections.contexte),
    objet: sections.objet || ao.sujet,
    perimetre: fromField("perimetre", sections.perimetre),
    livrables: sections.livrables || "À confirmer",
    duree: sections.duree || "À confirmer",
    profils: fromField("profils", sections.profils),
    criteres: sections.criteres || "À confirmer",
    concurrence: fromField("concurrence", ""),
    relation: fromField("relation", ""),
    budget: fromField("budget", sections.budget || ao.budget),
    chances: fromField("chances", ""),
    risques: fromField("risques", sections.risques),
    pointsVigilance: sections.pointsVigilance,
    documentName,
    documentExtract,
    extractionStatus: pipelineNotes || "Document analysé",
    documents: docsAsExtractions,
    recommendation: "À générer",
    sources: [
      "Google Sheets AO",
      ...documents.map((d) => d.name).filter(Boolean),
      manualExtract ? "Saisie qualification" : ""
    ].filter(Boolean),
    filenameSignals: Object.keys(filenameSignals).length ? filenameSignals : undefined,
    extractionEvidence
  };

  // Adaptive LLM budget — based on elapsed time after Sheets reads
  const serverless = isServerlessRuntime();
  const elapsedMs = Date.now() - startMs;
  const POST_LLM_RESERVE_MS = 4_000;
  const remainingMs = serverless
    ? Math.max(0, NETLIFY_MAX_DURATION_MS - elapsedMs - POST_LLM_RESERVE_MS)
    : 0;
  const { recommendation: recBudget, intelligence: intBudget } = QUALIFICATION_BUDGET_MS;
  // Both LLM calls run in parallel — each gets independent budget from remaining
  const adaptiveRecMs = serverless ? Math.min(recBudget.serverless, remainingMs) : recBudget.local;
  const adaptiveIntMs = serverless ? Math.min(intBudget.serverless, remainingMs) : intBudget.local;

  const [recommendation, intelligence] = await Promise.all([
    Promise.race([
      generateQualificationRecommendation(ao, fiche),
      new Promise<string>((resolve) =>
        setTimeout(
          () =>
            resolve(
              serverless
                ? "Recommandation : basée sur l'extraction documentaire (IA tronquée — délai Netlify)."
                : "Recommandation : analyse documentaire disponible."
            ),
          adaptiveRecMs
        )
      )
    ]),
    generateIntelligentQualification(ao, fiche, referentials, body.enrichWeb ?? false, {
      llmTimeoutMs: adaptiveIntMs
    })
  ]);

  fiche.recommendation = recommendation;
  fiche.intelligence = intelligence;
  remapFicheFromIntelligence(fiche);

  await aoRepository.upsertPipeline(ao, "BO", {
    "Fiche qualification": JSON.stringify(ficheForGSheets(fiche)),
    Recommandation: fiche.recommendation,
    Notes: pipelineNotes
  });

  void aoRepository.appendHistory({
    timestamp: new Date().toISOString(),
    aoNum,
    fromStatus: ao.statut,
    toStatus: "BO",
    actor,
    note: "Fiche qualification V2 enregistrée"
  });

  return fiche;
}
