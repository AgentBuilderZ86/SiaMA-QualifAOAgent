import type { SheetRecord, SheetRow } from "@/lib/google";
import { normalizeAoDeadlines } from "@/lib/aoDeadline";
import type { FilenameSignals } from "@/lib/qualification/filenameSignals";
import type { PatternScoreResult } from "@/lib/qualification/patterns";

export const AO_STATUSES = ["A QUALIFIER", "GO", "NO GO", "BO", "P2P", "PS", "PITCH", "PW", "PL", "AUTRE"] as const;
export type AoStatus = (typeof AO_STATUSES)[number];

export type AoRecord = {
  aoNum: string;
  displayAoNum: string;
  client: string;
  sujet: string;
  manager: string;
  recommendedManager?: string;
  previousManager?: string;
  reassignmentStatus?: ReassignmentStatus | "";
  reassignmentProposedBy?: string;
  reassignmentJustification?: string;
  reassignmentDecisionBy?: string;
  reassignmentDecisionJustification?: string;
  statusJustification?: string;
  budget: string;
  delaiJours: number | null;
  dateLimite: string;
  decisionIa: string;
  justificationIa: string;
  statut: AoStatus;
  sourceTab: string;
  rowIndex?: number;
  sourceKind?: AoSourceKind;
  sourceName?: string;
  sourceUrl?: string;
  sourceNoticeId?: string;
  publishedAt?: string;
  collectedAt?: string;
  country?: string;
  buyer?: string;
  procedureType?: string;
  estimatedBudget?: string;
  currency?: string;
  dataQuality?: AoDataQuality;
  raw: SheetRow;
};

export type AoSourceKind = "google-sheet" | "public-api" | "public-web" | "manual";

export type AoDataQuality = {
  completenessScore: number;
  missingFields: string[];
  warnings: string[];
};

export type PipelineEvent = {
  timestamp: string;
  aoNum: string;
  fromStatus: string;
  toStatus: string;
  actor: string;
  note: string;
};

export type ReassignmentStatus = "À valider" | "Acceptée" | "Refusée";

/** Indices regex / audit extraction (ne remplace pas les champs AO Sheet). */
export type QualificationExtractionEvidence = {
  metadataMatchNotes?: string[];
  emailsDetected?: string[];
  dateLimiteRegex?: string;
  lieuRegex?: string;
  maitreOuvrageRegex?: string;
};

export type QualificationDocumentKind = "Avis" | "CPS" | "RC" | "Autre";

export type QualificationDocumentExtraction = {
  kind: QualificationDocumentKind;
  name: string;
  text: string;
  warning: string;
  extractionMode: "native" | "ocr" | "manual" | "cache" | "unreadable";
  ocrUsed?: boolean;
  sha256?: string;
  sourceUrl?: string;
  extractedAt: string;
};

export type QualificationFiche = {
  contexte: string;
  objet: string;
  perimetre: string;
  livrables: string;
  duree: string;
  profils: string;
  criteres: string;
  concurrence: string;
  relation: string;
  budget: string;
  chances: string;
  risques: string;
  pointsVigilance: string[];
  documentName: string;
  documentExtract: string;
  extractionStatus: string;
  documents?: QualificationDocumentExtraction[];
  recommendation: string;
  sources: string[];
  intelligence?: IntelligentQualificationFiche;
  /** Indices dérivés du nom de fichier uploadé (sans écraser client AO Sheet). */
  filenameSignals?: FilenameSignals;
  extractionEvidence?: QualificationExtractionEvidence;
};

/**
 * Overwrites the base fiche text fields with clean LLM-generated content from intelligence.
 * Mutates fiche in place (call only after intelligence is set).
 */
export function remapFicheFromIntelligence(fiche: QualificationFiche): void {
  const intel = fiche.intelligence;
  if (!intel) return;

  const ident = intel.identification;
  if (intel.clientContext) fiche.contexte = intel.clientContext;
  if (ident?.object) fiche.objet = ident.object;
  if (intel.scopeSynthesis) fiche.perimetre = intel.scopeSynthesis;
  if (intel.expectedDeliverables?.length)
    fiche.livrables = intel.expectedDeliverables.map((d) => `• ${d}`).join("\n");
  if (ident?.duration) fiche.duree = ident.duration;
  if (intel.requiredProfile?.length)
    fiche.profils = intel.requiredProfile.map((p) => `• ${p}`).join("\n");
  if (ident?.budget) fiche.budget = ident.budget;
  if (intel.winThemes?.length)
    fiche.chances = intel.winThemes.map((w) => `• ${w}`).join("\n");
  if (intel.risks?.length)
    fiche.risques = intel.risks.map((r) => `• ${r.label} (${r.severity}) : ${r.mitigation}`).join("\n");
  if (intel.decisionWatchpoints?.length)
    fiche.pointsVigilance = intel.decisionWatchpoints.map((w) => w.point);

  // Rebuild documentExtract as a clean LLM-generated summary (replaces raw PDF block)
  const summaryParts: string[] = [];
  if (intel.executiveSummary) summaryParts.push(`[Synthèse]\n${intel.executiveSummary}`);
  if (intel.clientContext) summaryParts.push(`[Contexte client]\n${intel.clientContext}`);
  if (intel.scopeSynthesis) summaryParts.push(`[Périmètre]\n${intel.scopeSynthesis}`);
  if (intel.businessIssues?.length)
    summaryParts.push(`[Enjeux]\n${intel.businessIssues.map((i) => `• ${i}`).join("\n")}`);
  if (intel.expectedDeliverables?.length)
    summaryParts.push(`[Livrables]\n${intel.expectedDeliverables.map((d) => `• ${d}`).join("\n")}`);
  if (summaryParts.length) fiche.documentExtract = summaryParts.join("\n\n").slice(0, 3000);
}

const GSHEETS_CELL_LIMIT = 49_000;

/**
 * Returns a copy of the fiche safe to serialize into a single Google Sheets cell.
 * Strips raw document text (large) and the derived pptCopyBlock (regenerated on read).
 * Falls back to hard-truncating the JSON string if the result is still too large.
 */
export function ficheForGSheets(fiche: QualificationFiche): QualificationFiche {
  const stripped: QualificationFiche = {
    ...fiche,
    documentExtract: fiche.documentExtract?.slice(0, 3000) || "",
    documents: fiche.documents?.map(({ text: _text, ...rest }) => ({ ...rest, text: "" })),
    intelligence: fiche.intelligence
      ? { ...fiche.intelligence, pptCopyBlock: "" }
      : undefined,
  };

  const json = JSON.stringify(stripped);
  if (json.length <= GSHEETS_CELL_LIMIT) return stripped;

  // Last-resort: strip slideStoryboard speaker notes and source excerpts
  const trimmed: QualificationFiche = {
    ...stripped,
    intelligence: stripped.intelligence
      ? {
          ...stripped.intelligence,
          slideStoryboard: stripped.intelligence.slideStoryboard?.map((s) => ({
            ...s,
            speakerNotes: ""
          })),
          sources: stripped.intelligence.sources?.map(({ excerpt: _e, ...s }) => ({
            ...s,
            excerpt: ""
          })),
        }
      : undefined,
  };

  const json2 = JSON.stringify(trimmed);
  if (json2.length <= GSHEETS_CELL_LIMIT) return trimmed;

  // Absolute fallback: drop intelligence entirely (will be blank on re-read, but avoids a crash)
  return { ...trimmed, intelligence: undefined };
}

export type SourcedFact = {
  title: string;
  url: string;
  excerpt: string;
  consultedAt: string;
};

export type QualificationScoreItem = {
  criterion: string;
  score: number;
  rationale: string;
  source: string;
};

export type QualificationRisk = {
  label: string;
  severity: "Faible" | "Moyen" | "Élevé";
  mitigation: string;
  source: string;
};

export type QualificationSlide = {
  title: string;
  keyMessage: string;
  bullets: string[];
  speakerNotes: string;
};

export type QualificationIdentification = {
  reference: string;
  internalNumber: string;
  buyer: string;
  program: string;
  geography: string;
  object: string;
  missionType: string;
  duration: string;
  deadline: string;
  submission: string;
  budget: string;
  filiales?: string;
  ecosystemeSI?: string;
  contacts?: string;
  mailSubject?: string;
  confidentiality?: string;
};

export type QualificationContextHighlight = {
  problems: string[];
  objectives: string[];
  keyPoint: string;
};

export type QualificationKeyQuestion = {
  index: number;
  theme: string;
  vigilance: string;
  level: "GO" | "WARN" | "BLUE" | "GRAY";
};

export type QualificationCalendarEntry = {
  dayLabel: string;
  label: string;
  milestone?: "deadline" | "kickoff" | "soutenance" | null;
};

export type QualificationResponseDocument = {
  label: string;
  format: string;
  detail: string;
  isStarred?: boolean;
};

export type QualificationResponseSection = {
  number: number;
  title: string;
  isStarred?: boolean;
};

export type QualificationResponseFormat = {
  documents: QualificationResponseDocument[];
  technicalSections: QualificationResponseSection[];
};

export type QualificationFinanceRow = {
  phase: string;
  profil: string;
  jours: number | string;
  tjm: number | string;
  montantHt: number | string;
};

export type QualificationFinanceIndicative = {
  rows: QualificationFinanceRow[];
  totalHt: string;
  totalWithFees: string;
  fees: string;
  note: string;
};

export type QualificationMissionPhase = {
  phase: string;
  objective: string;
  deliverables: string[];
};

export type QualificationSignal = {
  label: string;
  detail: string;
  impact: "Positif" | "Attention" | "Bloquant" | "Neutre";
  scoreImpact?: string;
  source: string;
};

export type QualificationManagerRecommendation = {
  primaryManager: string;
  coReviewers: string[];
  rationale: string;
  decisionOwner: string;
};

export type QualificationDecisionWatchpoint = {
  point: string;
  level: "Opportunité" | "À évaluer" | "Critique" | "Éliminatoire";
  question: string;
};

export type QualificationNextStep = {
  action: string;
  deadline: string;
  owner: string;
  workflowCommand: string;
};

export type IntelligentQualificationFiche = {
  executiveSummary: string;
  clientContext: string;
  businessIssues: string[];
  scopeSynthesis: string;
  winThemes: string[];
  goNoGoScore: number;
  scoreBreakdown: QualificationScoreItem[];
  recommendation: "GO" | "NO GO" | "WATCH";
  confidenceLevel: "Faible" | "Moyen" | "Élevé";
  risks: QualificationRisk[];
  clarificationQuestions: string[];
  responseStrategy: string;
  differentiators: string[];
  slideStoryboard: QualificationSlide[];
  pptCopyBlock: string;
  sources: SourcedFact[];
  assumptions: string[];
  generatedAt: string;
  identification?: QualificationIdentification;
  missionPhases?: QualificationMissionPhase[];
  expectedDeliverables?: string[];
  requiredProfile?: string[];
  qualificationSignals?: QualificationSignal[];
  managerRecommendation?: QualificationManagerRecommendation;
  decisionWatchpoints?: QualificationDecisionWatchpoint[];
  nextSteps?: QualificationNextStep[];
  patternScore?: PatternScoreResult;
  contextHighlight?: QualificationContextHighlight;
  keyQuestions?: QualificationKeyQuestion[];
  aoCalendar?: QualificationCalendarEntry[];
  responseFormat?: QualificationResponseFormat;
  financeIndicative?: QualificationFinanceIndicative;
};

export type FinancialSimulation = {
  budgetCible: number;
  totalJours: number;
  totalHt: number;
  tvaRate: number;
  totalTtc: number;
  marge: number;
  rows: Array<{ phase: string; profil: string; jours: number; tjm: number; montantHt: number }>;
  source: string;
};

export type ProposalSection = {
  section: string;
  content: string;
  slideTitle: string;
  keyMessages: string[];
  bodyText: string;
  diagramTitle: string;
  diagramMermaid: string;
  pptCopyBlock: string;
  sources: string[];
};

export type ClosureReport = {
  result: "PW" | "PL";
  finalAmount: string;
  competitor: string;
  reason: string;
  lessons: string;
};

export type ReferentielItem = {
  type: string;
  name: string;
  value: string;
  unit: string;
  source: string;
  active: string;
};

export const PIPELINE_HEADERS = [
  "N° AO",
  "Sujet",
  "Client",
  "Manager",
  "Manager recommandé",
  "Manager précédent",
  "Statut réaffectation",
  "Réaffectation proposée par",
  "Justification réaffectation",
  "Décision réaffectation par",
  "Justification décision réaffectation",
  "Budget",
  "Date limite",
  "Statut workflow",
  "Date entrée statut",
  "Justification changement statut",
  "Probabilité %",
  "Notes",
  "Fiche qualification",
  "Simulation financière",
  "Recommandation",
  "Sections propale",
  "Adaptations CV",
  "Atelier stratégie",
  "Run ID création",
  "Pitch notes",
  "Résultat clôture",
  "Montant final",
  "Concurrent retenu",
  "Motif clôture",
  "Leçons apprises"
];

export const HIST_HEADERS = ["Timestamp", "N° AO", "Ancien statut", "Nouveau statut", "Acteur", "Note"];
export const FEEDBACK_RULE_HEADERS = [
  "timestamp",
  "ao_num",
  "decision_ia",
  "decision_manager",
  "motif_manager",
  "statut",
  "manager_actuel",
  "manager_recommande",
  "type_feedback",
  "source_kind",
  "source_name",
  "data_quality_score",
  "acquisition_signal",
  "acteur",
  "source"
];
export const REF_HEADERS = ["type", "name", "value", "unit", "source", "active"];

export const DEFAULT_REFERENTIELS: ReferentielItem[] = [
  {
    type: "TJM",
    name: "Consultant",
    value: "5000",
    unit: "DH HT/jour",
    source: "Référentiel interne Sia Maroc à valider par Finance",
    active: "TRUE"
  },
  {
    type: "TJM",
    name: "Senior Consultant",
    value: "6000",
    unit: "DH HT/jour",
    source: "Référentiel interne Sia Maroc à valider par Finance",
    active: "TRUE"
  },
  {
    type: "TJM",
    name: "Manager / PMO",
    value: "7000",
    unit: "DH HT/jour",
    source: "Référentiel interne Sia Maroc à valider par Finance",
    active: "TRUE"
  },
  {
    type: "TJM",
    name: "Senior Manager / Chef projet",
    value: "8000",
    unit: "DH HT/jour",
    source: "Référentiel interne Sia Maroc à valider par Finance",
    active: "TRUE"
  },
  {
    type: "FISCAL",
    name: "TVA Maroc standard",
    value: "20",
    unit: "%",
    source: "Code Général des Impôts Maroc, taux normal de TVA à vérifier pour la prestation",
    active: "TRUE"
  }
];

export function parseDays(value: string) {
  const cleaned = String(value || "").replace(",", ".").trim();
  if (!cleaned || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

export function normalizeStatus(value: string, fallback: AoStatus): AoStatus {
  const normalized = String(value || "").trim().toUpperCase().replace("QUALIFIÉ", "GO").replace("QUALIFIE", "GO");
  if (AO_STATUSES.includes(normalized as AoStatus)) return normalized as AoStatus;
  if (normalized === "NOGO") return "NO GO";
  return fallback;
}

export function sheetRecordToAo(row: SheetRecord | SheetRow, sourceTab: string, fallbackStatus: AoStatus): AoRecord {
  const pipelineStatus = row["Statut workflow"] || row["STATUT"] || "";
  const statut = normalizeStatus(pipelineStatus, fallbackStatus);
  const rowIndexRaw = (row as SheetRecord)._rowIndex;
  const reassignmentStatus = normalizeReassignmentStatus(row["Statut réaffectation"] || "");

  const displayAoNum = row["N° d'ordre"] || row["N° AO"] || "";
  const syntheticAoNum = rowIndexRaw ? `ROW:${sourceTab}:${rowIndexRaw}` : "NC";

  return normalizeAoDeadlines({
    aoNum: displayAoNum || syntheticAoNum,
    displayAoNum: displayAoNum || "Non renseigné",
    client: row.CLIENT || row.Client || "Client non renseigné",
    sujet: row.SUJET || row.Sujet || "Sujet non renseigné",
    manager: row["RESP."] || row.Manager || row["Manager recommandé"] || "Non assigné",
    recommendedManager: row["Manager recommandé"] || "",
    previousManager: row["Manager précédent"] || "",
    reassignmentStatus,
    reassignmentProposedBy: row["Réaffectation proposée par"] || "",
    reassignmentJustification: row["Justification réaffectation"] || "",
    reassignmentDecisionBy: row["Décision réaffectation par"] || "",
    reassignmentDecisionJustification: row["Justification décision réaffectation"] || "",
    statusJustification: row["Justification changement statut"] || "",
    budget: row["BUDGET "] || row["BUDGET TTC"] || row.Budget || "NC",
    delaiJours: parseDays(row["COMPTE A REBOURS/JOURS"] || ""),
    dateLimite: row["DATE DE REPONSE"] || row["Date limite"] || "",
    decisionIa: row["Décision IA"] || row.Recommandation || "",
    justificationIa: row["Justification IA"] || "",
    statut,
    sourceTab,
    rowIndex: rowIndexRaw ? Number(rowIndexRaw) : undefined,
    sourceKind: "google-sheet",
    sourceName: sourceTab,
    raw: row
  });
}

export function normalizeReassignmentStatus(value: string): ReassignmentStatus | "" {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  if (["A VALIDER", "À VALIDER"].includes(normalized)) return "À valider";
  if (["ACCEPTEE", "ACCEPTÉE", "ACCEPTE", "ACCEPTÉ"].includes(normalized)) return "Acceptée";
  if (["REFUSEE", "REFUSÉE", "REFUSE", "REFUSÉ"].includes(normalized)) return "Refusée";
  return "";
}

function firstMeaningful(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && !["NC", "Non renseigné", "Client non renseigné", "Sujet non renseigné", "Non assigné"].includes(text)) {
      return text;
    }
  }
  return String(values.find((value) => value !== undefined && value !== null) ?? "");
}

export function mergeAoRecords(source: AoRecord | null, pipeline: AoRecord | null): AoRecord | null {
  if (!source && !pipeline) return null;
  if (!source) return pipeline;
  if (!pipeline) return source;

  return normalizeAoDeadlines({
    ...source,
    aoNum: firstMeaningful(source.aoNum, pipeline.aoNum) || source.aoNum,
    displayAoNum: firstMeaningful(source.displayAoNum, pipeline.displayAoNum) || source.displayAoNum,
    client: firstMeaningful(source.client, pipeline.client) || source.client,
    sujet: firstMeaningful(source.sujet, pipeline.sujet) || source.sujet,
    manager: firstMeaningful(pipeline.manager, source.manager) || source.manager,
    recommendedManager: firstMeaningful(pipeline.recommendedManager, source.recommendedManager),
    previousManager: firstMeaningful(pipeline.previousManager, source.previousManager),
    reassignmentStatus: pipeline.reassignmentStatus || source.reassignmentStatus || "",
    reassignmentProposedBy: firstMeaningful(pipeline.reassignmentProposedBy, source.reassignmentProposedBy),
    reassignmentJustification: firstMeaningful(pipeline.reassignmentJustification, source.reassignmentJustification),
    reassignmentDecisionBy: firstMeaningful(pipeline.reassignmentDecisionBy, source.reassignmentDecisionBy),
    reassignmentDecisionJustification: firstMeaningful(
      pipeline.reassignmentDecisionJustification,
      source.reassignmentDecisionJustification
    ),
    statusJustification: firstMeaningful(pipeline.statusJustification, source.statusJustification),
    budget: firstMeaningful(source.budget, pipeline.budget) || source.budget,
    delaiJours: source.delaiJours ?? pipeline.delaiJours,
    dateLimite: firstMeaningful(source.dateLimite, pipeline.dateLimite),
    decisionIa: firstMeaningful(source.decisionIa, pipeline.decisionIa),
    justificationIa: firstMeaningful(source.justificationIa, pipeline.justificationIa),
    statut: pipeline.statut === "AUTRE" ? source.statut : pipeline.statut,
    sourceTab: source.sourceTab,
    rowIndex: source.rowIndex,
    sourceKind: source.sourceKind,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    sourceNoticeId: source.sourceNoticeId,
    publishedAt: source.publishedAt,
    collectedAt: source.collectedAt,
    country: source.country,
    buyer: source.buyer,
    procedureType: source.procedureType,
    estimatedBudget: source.estimatedBudget,
    currency: source.currency,
    dataQuality: source.dataQuality,
    raw: { ...source.raw, ...pipeline.raw }
  });
}
