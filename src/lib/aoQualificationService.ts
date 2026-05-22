import { aoRepository } from "@/lib/aoRepository";
import {
  extractDocumentSections,
  extractUploadedDocuments,
  isServerlessRuntime,
  summarizeDocumentText
} from "@/lib/documents";
import { QUALIFICATION_BUDGET_MS } from "@/lib/constants";
import { extractKeyMetadata, isPlaceholderSection } from "@/lib/qualification/documentMetadata";
import { filenameSignalsPrefix, parseFilenameSignals } from "@/lib/qualification/filenameSignals";
import { generateQualificationRecommendation } from "@/lib/llm";
import { readAoDocumentCache } from "@/lib/aoSources/documentCache";
import { generateIntelligentQualification } from "@/lib/qualification/intelligence";
import type {
  AoRecord,
  QualificationDocumentExtraction,
  QualificationDocumentKind,
  QualificationFiche
} from "@/lib/aoTypes";

// ─── Private helpers ────────────────────────────────────────────────────────

function parseQualificationFiche(value: unknown): QualificationFiche | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value) as QualificationFiche;
  } catch {
    return null;
  }
}

function legacyDocumentFromFiche(fiche: QualificationFiche | null): QualificationDocumentExtraction[] {
  if (!fiche?.documentExtract || fiche.documentExtract === "Non trouvé dans le document.") return [];
  return [
    {
      kind: "Autre",
      name: fiche.documentName || "Document de qualification existant",
      text: fiche.documentExtract,
      warning: fiche.extractionStatus === "Document analysé" ? "" : fiche.extractionStatus || "",
      extractionMode: "native",
      extractedAt: new Date().toISOString()
    }
  ];
}

function normalizeDocumentKind(kind: string): QualificationDocumentKind {
  if (kind === "Avis" || kind === "CPS" || kind === "RC") return kind;
  return "Autre";
}

async function cachedQualificationDocuments(ao: AoRecord): Promise<QualificationDocumentExtraction[]> {
  const cache = await readAoDocumentCache();
  return cache.documents
    .filter((document) => document.aoNum === ao.aoNum)
    .slice(0, 6)
    .map((document) => ({
      kind: normalizeDocumentKind(document.kind),
      name: document.filename || document.label,
      text: document.text,
      warning: document.warning,
      extractionMode: "cache" as const,
      sha256: document.sha256,
      sourceUrl: document.documentUrl,
      extractedAt: document.extractedAt
    }));
}

function documentSeparator(
  document: Pick<QualificationDocumentExtraction, "kind" | "name" | "sourceUrl">
) {
  const source = document.sourceUrl ? ` · ${document.sourceUrl}` : "";
  return `--- Document ${document.kind} : ${document.name}${source} ---`;
}

function joinQualificationDocuments(
  documents: QualificationDocumentExtraction[],
  manualExtract: string
) {
  const parts = documents
    .filter((document) => document.text.trim())
    .map((document) => `${documentSeparator(document)}\n${document.text.trim()}`);
  if (manualExtract.trim()) {
    parts.push(`--- Extrait manuel utilisateur ---\n${manualExtract.trim()}`);
  }
  return parts.join("\n\n");
}

function documentExtractionStatus(
  documents: QualificationDocumentExtraction[],
  manualExtract: string
) {
  if (!documents.length && !manualExtract.trim()) return "Aucun document transmis.";
  const warnings = documents.map((document) => document.warning).filter(Boolean);
  const unreadable = documents
    .filter((document) => document.extractionMode === "unreadable")
    .map((document) => document.name);
  const ocr = documents.filter((document) => document.ocrUsed).map((document) => document.name);
  return [
    documents.length ? `${documents.length} document(s) analysé(s).` : "",
    ocr.length ? `OCR utilisé : ${ocr.join(", ")}.` : "",
    unreadable.length ? `Document(s) illisible(s) : ${unreadable.join(", ")}.` : "",
    ...warnings
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function saveQualification(aoNum: string, actor: string, formData: FormData) {
  const pipelineStartMs = Date.now();
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);

  const existingFiche = parseQualificationFiche(ao.raw?.["Fiche qualification"]);
  const manualExtract = String(formData.get("documentExtract") || "");
  const forceDocumentExtraction = formData.get("forceDocumentExtraction") === "yes";
  const uploadedDocuments = await extractUploadedDocuments(formData);
  const includeSourceDocuments = formData.get("includeSourceDocuments") === "yes";
  const skipSourceCache = isServerlessRuntime() && uploadedDocuments.length > 0;
  const cacheDocuments =
    includeSourceDocuments && !skipSourceCache ? await cachedQualificationDocuments(ao) : [];
  const freshDocuments = [...uploadedDocuments, ...cacheDocuments];
  const previousDocuments = existingFiche?.documents?.length
    ? existingFiche.documents
    : legacyDocumentFromFiche(existingFiche);
  const documents =
    freshDocuments.length || forceDocumentExtraction ? freshDocuments : previousDocuments;
  const documentName = documents.map((document) => document.name).filter(Boolean).join(", ");
  const filenameSignals = documents.reduce(
    (acc, document) => ({ ...acc, ...parseFilenameSignals(document.name || "") }),
    parseFilenameSignals(documentName || "")
  );
  const documentCorpus = joinQualificationDocuments(documents, manualExtract);
  if (!documentCorpus.trim() && !existingFiche?.documentExtract) {
    throw new Error(
      "Ajoutez au moins un document AO (Avis, CPS, RC), importez les pièces source ou collez un extrait manuel."
    );
  }
  const prefixedDocText =
    filenameSignalsPrefix(filenameSignals) +
    (documentCorpus || existingFiche?.documentExtract || "");
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

  const referentials = await aoRepository.readReferentials();
  const fromForm = (name: string, fallback: string) =>
    String(formData.get(name) || "").trim() || fallback || "À confirmer";

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

  const zipMode = documents.some((document) => /\.zip$/i.test(document.name || ""));
  const enrichWebRequested = formData.get("enrichWeb") === "yes";
  const enrichWeb = zipMode ? false : enrichWebRequested;

  const pipelineNotes = (() => {
    const base = documentExtractionStatus(documents, manualExtract);
    const zipNote = zipMode
      ? "Mode archive ZIP : extraction native prioritaire, OCR limité (2 fichiers), enrichWeb désactivé."
      : "";
    const enrichNote =
      zipMode && enrichWebRequested ? "Enrichissement web ignoré pour respecter le délai serveur." : "";
    const hint = meta.matchNotes[0];
    const merged = [base, zipNote, enrichNote, hint && base.length < 350 ? hint : ""]
      .filter(Boolean)
      .join(" · ");
    return merged;
  })();

  const fiche: QualificationFiche = {
    contexte: fromForm("contexte", sections.contexte),
    objet: sections.objet || ao.sujet,
    perimetre: fromForm("perimetre", sections.perimetre),
    livrables: sections.livrables || "À confirmer",
    duree: sections.duree || "À confirmer",
    profils: fromForm("profils", sections.profils),
    criteres: sections.criteres || "À confirmer",
    concurrence: fromForm("concurrence", ""),
    relation: fromForm("relation", ""),
    budget: fromForm("budget", sections.budget || ao.budget),
    chances: fromForm("chances", ""),
    risques: fromForm("risques", sections.risques),
    pointsVigilance: sections.pointsVigilance,
    documentName: documentName || existingFiche?.documentName || "",
    documentExtract,
    extractionStatus: pipelineNotes || "Document analysé",
    documents: documents.length ? documents : previousDocuments,
    recommendation: "À générer",
    sources: [
      "Google Sheets AO",
      ...documents.map((document) => document.name || document.sourceUrl || ""),
      manualExtract.trim() ? "Saisie qualification" : ""
    ].filter(Boolean),
    filenameSignals: Object.keys(filenameSignals).length ? filenameSignals : undefined,
    extractionEvidence
  };

  const serverless = isServerlessRuntime();
  const elapsedMs = Date.now() - pipelineStartMs;
  const { recommendation: recBudget, intelligence: intBudget } = QUALIFICATION_BUDGET_MS;
  const recTimeoutMs = serverless ? recBudget.serverless : zipMode ? recBudget.zip : recBudget.local;
  const llmTimeoutMs = serverless
    ? Math.max(0, intBudget.serverless - Math.max(0, elapsedMs - 10_000))
    : zipMode
      ? intBudget.zip
      : intBudget.local;

  // Étape 1 : sauvegarde intermédiaire avant les appels LLM
  fiche.recommendation = "Analyse documentaire enregistrée — génération IA en cours.";
  fiche.intelligence = undefined;

  await aoRepository.upsertPipeline(ao, "BO", {
    "Fiche qualification": JSON.stringify(fiche),
    Recommandation: fiche.recommendation,
    Notes: pipelineNotes
  });

  // Étape 2 : appels LLM avec timeout adaptatif
  fiche.recommendation = await Promise.race([
    generateQualificationRecommendation(ao, fiche),
    new Promise<string>((resolve) =>
      setTimeout(
        () =>
          resolve(
            serverless || zipMode
              ? "Recommandation : basée sur l'extraction documentaire (IA tronquée — délai Netlify)."
              : "Recommandation : analyse documentaire disponible."
          ),
        recTimeoutMs
      )
    )
  ]);
  fiche.intelligence = await generateIntelligentQualification(ao, fiche, referentials, enrichWeb, {
    llmTimeoutMs
  });

  await aoRepository.upsertPipeline(ao, "BO", {
    "Fiche qualification": JSON.stringify(fiche),
    Recommandation: fiche.recommendation,
    Notes: pipelineNotes
  });
  await aoRepository.appendHistory({
    timestamp: new Date().toISOString(),
    aoNum,
    fromStatus: ao.statut,
    toStatus: "BO",
    actor,
    note: "Fiche qualification enregistrée"
  });
  return fiche;
}
