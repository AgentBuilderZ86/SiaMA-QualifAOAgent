import { aoRepository } from "@/lib/aoRepository";
import {
  ATELIER_STRATEGIE_COLUMN,
  appendWorkshopMessages,
  atelierCommitPayloadSchema,
  extractDraftFromAssistant,
  mergeLastDraft,
  parseAtelierStrategie,
  serializeAtelierStrategie,
  stripDraftMarkerForDisplay,
  type AtelierCommitPayload
} from "@/lib/atelierStrategie";
import { buildAtelierSystemPrompt, buildAtelierUserPayload } from "@/lib/atelierPrompt";
import {
  extractDocumentSections,
  extractUploadedDocument,
  extractUploadedDocuments,
  isServerlessRuntime,
  summarizeDocumentText
} from "@/lib/documents";
import { QUALIFICATION_BUDGET_MS } from "@/lib/constants";
import { buildCvAdaptation, parseQualificationForCvScoring, type CvAdaptationResult, type UploadedCvForAdaptation } from "@/lib/cvScoring";
import { extractKeyMetadata, isPlaceholderSection } from "@/lib/qualification/documentMetadata";
import { filenameSignalsPrefix, parseFilenameSignals } from "@/lib/qualification/filenameSignals";
import { simulateFinancials } from "@/lib/finance";
import { generateProposalSection, generateQualificationRecommendation } from "@/lib/llm";
import { completeChat, hasConfiguredLlm } from "@/lib/llmChat";
import { getSheetsConfigStatus } from "@/lib/google";
import { readAoCache } from "@/lib/aoSources/cache";
import { readAoDocumentCache } from "@/lib/aoSources/documentCache";
import { generateIntelligentQualification } from "@/lib/qualification/intelligence";
import { operationalDeadlineSubset, urgentByDeadline } from "@/lib/aoDeadline";
import type { SheetRow } from "@/lib/google";
import {
  AO_STATUSES,
  type AoRecord,
  type AoStatus,
  type ClosureReport,
  type FinancialSimulation,
  type QualificationDocumentExtraction,
  type QualificationDocumentKind,
  type QualificationFiche
} from "@/lib/aoTypes";
import {
  buildManagerFeedbackDecision,
  isDifferentManager,
  isPendingReassignment,
  reassignmentStatusFromDecision,
  type OpportunityGovernanceInput,
  type ReassignmentDecision
} from "@/lib/managerGovernance";

export type DashboardData = {
  configured: boolean;
  missingConfig: string[];
  loadError: string;
  generatedAt: string;
  sourceMode: "native" | "google" | "hybrid" | "unconfigured";
  sourceReport: Array<{ sourceName: string; collectedAt: string; count: number; errors: string[] }>;
  totals: {
    all: number;
    go: number;
    aQualifier: number;
    noGo: number;
    activePipeline: number;
    won: number;
    lost: number;
    urgent: number;
  };
  byManager: Array<{ manager: string; total: number; go: number; urgent: number }>;
  urgent: AoRecord[];
  recent: AoRecord[];
  records: AoRecord[];
  googleSheetRecords: AoRecord[];
  scrapedRecords: AoRecord[];
};

function emptyDashboard(status = getSheetsConfigStatus(), loadError = ""): DashboardData {
  return {
    configured: status.configured,
    missingConfig: status.missing,
    loadError,
    generatedAt: new Date().toISOString(),
    sourceMode: status.configured ? "google" : "unconfigured",
    sourceReport: [],
    totals: { all: 0, go: 0, aQualifier: 0, noGo: 0, activePipeline: 0, won: 0, lost: 0, urgent: 0 },
    byManager: [],
    urgent: [],
    recent: [],
    records: [],
    googleSheetRecords: [],
    scrapedRecords: []
  };
}

function statusCounts(records: AoRecord[]) {
  return {
    all: records.length,
    go: records.filter((ao) => ao.statut === "GO").length,
    aQualifier: records.filter((ao) => ao.statut === "A QUALIFIER").length,
    noGo: records.filter((ao) => ao.statut === "NO GO").length,
    activePipeline: records.filter((ao) => ["BO", "P2P", "PS", "PITCH"].includes(ao.statut)).length,
    won: records.filter((ao) => ao.statut === "PW").length,
    lost: records.filter((ao) => ao.statut === "PL").length,
    urgent: records.filter(urgentByDeadline).length
  };
}

function groupByManager(records: AoRecord[]) {
  const groups = new Map<string, AoRecord[]>();
  records.forEach((ao) => groups.set(ao.manager, [...(groups.get(ao.manager) ?? []), ao]));
  return [...groups.entries()]
    .map(([manager, aos]) => ({
      manager,
      total: aos.length,
      go: aos.filter((ao) => ao.statut === "GO").length,
      urgent: aos.filter(urgentByDeadline).length
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getDashboardData(): Promise<DashboardData> {
  const status = getSheetsConfigStatus();

  try {
    const cache = await readAoCache();
    const groups = await aoRepository.listGroupedAos();
    const combined = groups.combined;
    const records = operationalDeadlineSubset(combined);
    if (!status.configured && combined.length === 0) {
      return {
        ...emptyDashboard(status),
        generatedAt: cache.generatedAt || new Date().toISOString(),
        sourceReport: cache.report
      };
    }
    const urgent = records.filter(urgentByDeadline).sort((a, b) => (a.delaiJours ?? 999) - (b.delaiJours ?? 999)).slice(0, 12);
    return {
      configured: status.configured || combined.length > 0,
      missingConfig: status.configured ? [] : status.missing,
      loadError: "",
      generatedAt: cache.generatedAt || new Date().toISOString(),
      sourceMode: status.configured && cache.records.length > 0 ? "hybrid" : status.configured ? "google" : "native",
      sourceReport: cache.report,
      totals: statusCounts(records),
      byManager: groupByManager(records).slice(0, 8),
      urgent,
      recent: [...records].sort((a, b) => (a.delaiJours ?? 999) - (b.delaiJours ?? 999)).slice(0, 20),
      records,
      googleSheetRecords: operationalDeadlineSubset(groups.googleSheet),
      scrapedRecords: operationalDeadlineSubset(groups.scraped)
    };
  } catch (error) {
    return emptyDashboard(status, error instanceof Error ? error.message : "Erreur inconnue pendant la lecture Google Sheets.");
  }
}

export async function getAoDetail(aoNum: string) {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) return null;
  const pipeline = await aoRepository.getPipelineRecord(aoNum).catch(() => null);
  const referentials = await aoRepository.readReferentials();
  return { ao, pipeline, referentials };
}

export async function transitionAo(aoNum: string, toStatus: AoStatus, actor: string, note = "") {
  await aoRepository.transition(aoNum, toStatus, actor, note);
}

function assertStatus(value: string): AoStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (!AO_STATUSES.includes(normalized as AoStatus)) {
    throw new Error("Statut opportunité invalide.");
  }
  return normalized as AoStatus;
}

function requiredJustification(value: string) {
  const text = String(value || "").trim();
  if (text.length < 8) {
    throw new Error("La justification manager doit contenir au moins 8 caractères.");
  }
  return text;
}

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
      extractionMode: "cache",
      sha256: document.sha256,
      sourceUrl: document.documentUrl,
      extractedAt: document.extractedAt
    }));
}

function documentSeparator(document: Pick<QualificationDocumentExtraction, "kind" | "name" | "sourceUrl">) {
  const source = document.sourceUrl ? ` · ${document.sourceUrl}` : "";
  return `--- Document ${document.kind} : ${document.name}${source} ---`;
}

function joinQualificationDocuments(documents: QualificationDocumentExtraction[], manualExtract: string) {
  const parts = documents
    .filter((document) => document.text.trim())
    .map((document) => `${documentSeparator(document)}\n${document.text.trim()}`);
  if (manualExtract.trim()) {
    parts.push(`--- Extrait manuel utilisateur ---\n${manualExtract.trim()}`);
  }
  return parts.join("\n\n");
}

function documentExtractionStatus(documents: QualificationDocumentExtraction[], manualExtract: string) {
  if (!documents.length && !manualExtract.trim()) return "Aucun document transmis.";
  const warnings = documents.map((document) => document.warning).filter(Boolean);
  const unreadable = documents.filter((document) => document.extractionMode === "unreadable").map((document) => document.name);
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

async function appendGovernanceFeedback(params: {
  ao: AoRecord;
  actor: string;
  decisionManager: string;
  motif: string;
  statut: string;
  recommendedManager?: string;
  typeFeedback: string;
}) {
  const qualityScore = params.ao.dataQuality?.completenessScore;
  const acquisitionSignals = [
    params.typeFeedback,
    params.ao.sourceKind ? `source_kind=${params.ao.sourceKind}` : "",
    params.ao.sourceName ? `source_name=${params.ao.sourceName}` : "",
    typeof qualityScore === "number" ? `quality=${qualityScore}` : "",
    params.ao.dataQuality?.warnings.length ? `warnings=${params.ao.dataQuality.warnings.join("|")}` : ""
  ].filter(Boolean);

  await aoRepository.appendRuleFeedback({
    timestamp: new Date().toISOString(),
    ao_num: params.ao.aoNum,
    decision_ia: params.ao.decisionIa || "Non renseigné",
    decision_manager: params.decisionManager,
    motif_manager: params.motif,
    statut: params.statut,
    manager_actuel: params.ao.manager || "Non assigné",
    manager_recommande: params.recommendedManager || params.ao.recommendedManager || "",
    type_feedback: params.typeFeedback,
    source_kind: params.ao.sourceKind || "",
    source_name: params.ao.sourceName || params.ao.sourceTab || "",
    data_quality_score: typeof qualityScore === "number" ? String(qualityScore) : "",
    acquisition_signal: acquisitionSignals.join(" ; "),
    acteur: params.actor,
    source: "SiaGPT AO Agent"
  });
}

export async function updateOpportunityGovernance(aoNum: string, actor: string, input: OpportunityGovernanceInput) {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);

  const status = assertStatus(input.status);
  const justification = requiredJustification(input.justification);
  const recommendedManager = String(input.recommendedManager || "").trim();
  const updates: SheetRow = {
    "Justification changement statut": justification
  };

  if (recommendedManager) {
    updates["Manager recommandé"] = recommendedManager;
  }

  if (isDifferentManager(ao.manager, recommendedManager)) {
    updates["Manager précédent"] = ao.manager || "Non assigné";
    updates["Statut réaffectation"] = "À valider";
    updates["Réaffectation proposée par"] = actor;
    updates["Justification réaffectation"] = justification;
    updates["Décision réaffectation par"] = "";
    updates["Justification décision réaffectation"] = "";
  }

  const feedbackDecision = buildManagerFeedbackDecision(status, recommendedManager);
  await aoRepository.transition(ao.aoNum, status, actor, feedbackDecision, updates);
  await appendGovernanceFeedback({
    ao,
    actor,
    decisionManager: feedbackDecision,
    motif: justification,
    statut: status,
    recommendedManager,
    typeFeedback: recommendedManager ? "changement_statut_reaffectation" : "changement_statut"
  });
}

export async function decideOpportunityReassignment(
  aoNum: string,
  actor: string,
  decision: ReassignmentDecision,
  justificationValue: string
) {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  if (!isPendingReassignment(ao)) {
    throw new Error("Aucune proposition de réaffectation en attente pour cet AO.");
  }

  const justification = requiredJustification(justificationValue);
  const status = reassignmentStatusFromDecision(decision);
  const recommendedManager = ao.recommendedManager || "";
  const updates: SheetRow = {
    "Statut réaffectation": status,
    "Décision réaffectation par": actor,
    "Justification décision réaffectation": justification
  };

  if (decision === "accept") {
    updates.Manager = recommendedManager;
    updates["Manager recommandé"] = recommendedManager;
    updates["Manager précédent"] = ao.manager || "Non assigné";
  }

  await aoRepository.upsertPipeline(ao, ao.statut, updates);
  await aoRepository.appendHistory({
    timestamp: new Date().toISOString(),
    aoNum: ao.aoNum,
    fromStatus: ao.statut,
    toStatus: ao.statut,
    actor,
    note: `Réaffectation ${status.toLowerCase()} par le manager recommandé`
  });
  await appendGovernanceFeedback({
    ao,
    actor,
    decisionManager: `Réaffectation ${status.toLowerCase()} · ${recommendedManager}`,
    motif: justification,
    statut: ao.statut,
    recommendedManager,
    typeFeedback: decision === "accept" ? "reaffectation_acceptee" : "reaffectation_refusee"
  });
}

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
  const previousDocuments = existingFiche?.documents?.length ? existingFiche.documents : legacyDocumentFromFiche(existingFiche);
  const documents = freshDocuments.length || forceDocumentExtraction ? freshDocuments : previousDocuments;
  const documentName = documents.map((document) => document.name).filter(Boolean).join(", ");
  const filenameSignals = documents.reduce(
    (acc, document) => ({ ...acc, ...parseFilenameSignals(document.name || "") }),
    parseFilenameSignals(documentName || "")
  );
  const documentCorpus = joinQualificationDocuments(documents, manualExtract);
  if (!documentCorpus.trim() && !existingFiche?.documentExtract) {
    throw new Error("Ajoutez au moins un document AO (Avis, CPS, RC), importez les pièces source ou collez un extrait manuel.");
  }
  const prefixedDocText = filenameSignalsPrefix(filenameSignals) + (documentCorpus || existingFiche?.documentExtract || "");
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
  const fromForm = (name: string, fallback: string) => String(formData.get(name) || "").trim() || fallback || "À confirmer";

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
    const enrichNote = zipMode && enrichWebRequested ? "Enrichissement web ignoré pour respecter le délai serveur." : "";
    const hint = meta.matchNotes[0];
    const merged = [base, zipNote, enrichNote, hint && base.length < 350 ? hint : ""].filter(Boolean).join(" · ");
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
  const recTimeoutMs = serverless
    ? recBudget.serverless
    : zipMode
      ? recBudget.zip
      : recBudget.local;
  const llmTimeoutMs = serverless
    ? Math.max(0, intBudget.serverless - Math.max(0, elapsedMs - 10_000))
    : zipMode
      ? intBudget.zip
      : intBudget.local;

  fiche.recommendation = "Analyse documentaire enregistrée — génération IA en cours.";
  fiche.intelligence = undefined;

  await aoRepository.upsertPipeline(ao, "BO", {
    "Fiche qualification": JSON.stringify(fiche),
    Recommandation: fiche.recommendation,
    Notes: pipelineNotes
  });

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

export async function saveSimulation(aoNum: string, actor: string, budgetInput: string): Promise<FinancialSimulation> {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  const referentials = await aoRepository.readReferentials();
  const simulation = simulateFinancials(budgetInput || ao.budget, referentials);
  await aoRepository.upsertPipeline(ao, "P2P", {
    "Simulation financière": JSON.stringify(simulation),
    Recommandation: `Simulation basée sur : ${simulation.source}`
  });
  await aoRepository.appendHistory({
    timestamp: new Date().toISOString(),
    aoNum,
    fromStatus: ao.statut,
    toStatus: "P2P",
    actor,
    note: "Simulation financière enregistrée"
  });
  return simulation;
}

export async function saveProposalSection(aoNum: string, actor: string, section: string, context: string) {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  const proposal = await generateProposalSection(ao, section, context);
  await aoRepository.upsertPipeline(ao, "P2P", {
    "Sections propale": JSON.stringify(proposal)
  });
  await aoRepository.appendHistory({
    timestamp: new Date().toISOString(),
    aoNum,
    fromStatus: ao.statut,
    toStatus: "P2P",
    actor,
    note: `Section propale générée : ${section}`
  });
  return proposal;
}

function uploadedCvFiles(formData: FormData) {
  return formData.getAll("cv").filter((file): file is File => file instanceof File && file.size > 0);
}

export async function saveCvAdaptations(aoNum: string, actor: string, formData: FormData): Promise<CvAdaptationResult[]> {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  const files = uploadedCvFiles(formData);
  if (!files.length) throw new Error("Ajoutez au moins un CV à adapter.");

  const targetRole = String(formData.get("targetRole") || "");
  const qualification = parseQualificationForCvScoring(ao.raw?.["Fiche qualification"]);
  const uploaded: UploadedCvForAdaptation[] = await Promise.all(
    files.map(async (file) => {
      const extracted = await extractUploadedDocument(file);
      return {
        name: extracted.name || file.name,
        text: extracted.text,
        warning: extracted.warning,
        targetRole
      };
    })
  );
  const adaptations = uploaded.map((cv) => buildCvAdaptation(ao, qualification, cv));

  await aoRepository.upsertPipeline(ao, ao.statut, {
    "Adaptations CV": JSON.stringify(adaptations)
  });
  await aoRepository.appendHistory({
    timestamp: new Date().toISOString(),
    aoNum,
    fromStatus: ao.statut,
    toStatus: ao.statut,
    actor,
    note: `Adaptations CV générées : ${adaptations.map((item) => item.cvName).join(", ")}`
  });
  return adaptations;
}

export async function savePitchNotes(aoNum: string, actor: string, notes: string) {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  await aoRepository.transition(aoNum, "PITCH", actor, "Préparation pitch enregistrée", { "Pitch notes": notes });
}

export async function closeAo(aoNum: string, actor: string, report: ClosureReport) {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  await aoRepository.transition(aoNum, report.result, actor, report.reason, {
    "Résultat clôture": report.result,
    "Montant final": report.finalAmount,
    "Concurrent retenu": report.competitor,
    "Motif clôture": report.reason,
    "Leçons apprises": report.lessons
  });
}

const ATELIER_STATUTS: AoStatus[] = ["BO", "P2P"];
const ATELIER_USER_MSG_MAX = 8000;

function assertAtelierPhase(ao: AoRecord) {
  if (!ATELIER_STATUTS.includes(ao.statut)) {
    throw new Error("L'atelier stratégie est réservé aux AO en phase BO ou P2P.");
  }
}

export function atelierStrategieFromPipeline(pipeline: SheetRow | null | undefined) {
  const raw = pipeline?.[ATELIER_STRATEGIE_COLUMN];
  return parseAtelierStrategie(typeof raw === "string" ? raw : undefined);
}

export async function runAtelierChat(aoNum: string, actorEmail: string, newUserMessage: string) {
  const trimmed = newUserMessage.trim();
  if (!trimmed) throw new Error("Message vide.");
  if (trimmed.length > ATELIER_USER_MSG_MAX) {
    throw new Error(`Message trop long (max ${ATELIER_USER_MSG_MAX} caractères).`);
  }
  if (!hasConfiguredLlm()) {
    throw new Error("Aucun fournisseur LLM configuré (clés API).");
  }
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  assertAtelierPhase(ao);
  const pipeline = await aoRepository.getPipelineRecord(ao.aoNum);
  const referentials = await aoRepository.readReferentials();
  let state = parseAtelierStrategie(typeof pipeline?.[ATELIER_STRATEGIE_COLUMN] === "string" ? pipeline[ATELIER_STRATEGIE_COLUMN] : undefined);
  state = appendWorkshopMessages(state, [{ role: "user", content: trimmed }], actorEmail);
  const ficheQualifJson = typeof pipeline?.["Fiche qualification"] === "string" ? pipeline["Fiche qualification"] : "{}";
  const simulationJson = typeof pipeline?.["Simulation financière"] === "string" ? pipeline["Simulation financière"] : "{}";
  const userPayload = buildAtelierUserPayload({
    ao,
    ficheQualifJson,
    simulationJson,
    referentials,
    state
  });
  const maxOut = Math.min(
    Math.max(parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || "8192", 10), 2048),
    32_000
  );
  const assistantRaw = await completeChat({
    system: buildAtelierSystemPrompt(),
    user: userPayload,
    temperature: 0.25,
    maxOutputTokens: maxOut
  });
  if (!assistantRaw?.trim()) {
    throw new Error("Réponse LLM vide ou indisponible.");
  }
  const draft = extractDraftFromAssistant(assistantRaw);
  const assistantDisplay = stripDraftMarkerForDisplay(assistantRaw).slice(0, 24_000);
  state = appendWorkshopMessages(state, [{ role: "assistant", content: assistantDisplay }], actorEmail);
  if (draft) {
    state = mergeLastDraft(state, draft);
  }
  await aoRepository.upsertPipeline(ao, ao.statut, {
    [ATELIER_STRATEGIE_COLUMN]: serializeAtelierStrategie(state)
  });
  return { messages: state.messages, lastDraft: state.lastDraft };
}

export async function commitAtelierDraft(aoNum: string, actor: string, payload: AtelierCommitPayload) {
  const parsed = atelierCommitPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Données de validation invalides.");
  }
  const p = parsed.data;
  const hasField =
    Boolean(p.budgetTtcPropose?.trim()) ||
    Boolean(p.strategieResume?.trim()) ||
    Boolean(p.equipeChiffrageNarratif?.trim()) ||
    Boolean(p.sectionsPropaleCibles?.length) ||
    Boolean(p.recommandation?.trim()) ||
    Boolean(p.appendNote?.trim());
  if (!hasField) {
    throw new Error("Aucun champ à enregistrer : renseignez au moins une valeur.");
  }
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
  assertAtelierPhase(ao);
  const pipeline = await aoRepository.getPipelineRecord(ao.aoNum);
  const referentials = await aoRepository.readReferentials();
  const updates: Record<string, string> = {};
  const nowIso = new Date().toISOString();

  if (p.budgetTtcPropose?.trim()) {
    const b = p.budgetTtcPropose.trim();
    updates.Budget = b;
    const sim = simulateFinancials(b, referentials);
    updates["Simulation financière"] = JSON.stringify(sim);
  }
  if (p.recommandation?.trim()) {
    updates.Recommandation = p.recommandation.trim();
  }

  const noteBlocks: string[] = [];
  if (p.appendNote?.trim()) noteBlocks.push(p.appendNote.trim());
  if (p.strategieResume?.trim()) {
    noteBlocks.push(`[Atelier ${nowIso}] Stratégie :\n${p.strategieResume.trim()}`);
  }
  if (p.equipeChiffrageNarratif?.trim()) {
    noteBlocks.push(`[Atelier ${nowIso}] Équipe / chiffrage :\n${p.equipeChiffrageNarratif.trim()}`);
  }
  if (p.sectionsPropaleCibles?.length) {
    noteBlocks.push(`[Atelier ${nowIso}] Sections propale cibles : ${p.sectionsPropaleCibles.join(", ")}`);
  }
  if (noteBlocks.length) {
    const prev = typeof pipeline?.Notes === "string" ? pipeline.Notes.trim() : "";
    updates.Notes = [prev, ...noteBlocks].filter(Boolean).join("\n\n---\n");
  }

  let state = parseAtelierStrategie(typeof pipeline?.[ATELIER_STRATEGIE_COLUMN] === "string" ? pipeline[ATELIER_STRATEGIE_COLUMN] : undefined);
  state = {
    ...state,
    updatedAt: nowIso,
    lastDraft: undefined,
    committedAt: nowIso
  };
  updates[ATELIER_STRATEGIE_COLUMN] = serializeAtelierStrategie(state);

  await aoRepository.upsertPipeline(ao, ao.statut, updates);
  await aoRepository.appendHistory({
    timestamp: nowIso,
    aoNum,
    fromStatus: ao.statut,
    toStatus: ao.statut,
    actor,
    note: "Validation atelier stratégie (mise à jour fiche opportunité)"
  });
}
