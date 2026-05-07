import type { SheetRecord, SheetRow } from "@/lib/google";
import type { PatternScoreResult } from "@/lib/qualification/patterns";

export const AO_STATUSES = ["A QUALIFIER", "GO", "NO GO", "BO", "P2P", "PS", "PITCH", "PW", "PL", "AUTRE"] as const;
export type AoStatus = (typeof AO_STATUSES)[number];

export type AoRecord = {
  aoNum: string;
  displayAoNum: string;
  client: string;
  sujet: string;
  manager: string;
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
  recommendation: string;
  sources: string[];
  intelligence?: IntelligentQualificationFiche;
};

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
  "Budget",
  "Date limite",
  "Statut workflow",
  "Date entrée statut",
  "Probabilité %",
  "Notes",
  "Fiche qualification",
  "Simulation financière",
  "Recommandation",
  "Sections propale",
  "Run ID création",
  "Pitch notes",
  "Résultat clôture",
  "Montant final",
  "Concurrent retenu",
  "Motif clôture",
  "Leçons apprises"
];

export const HIST_HEADERS = ["Timestamp", "N° AO", "Ancien statut", "Nouveau statut", "Acteur", "Note"];
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

  const displayAoNum = row["N° d'ordre"] || row["N° AO"] || "";
  const syntheticAoNum = rowIndexRaw ? `ROW:${sourceTab}:${rowIndexRaw}` : "NC";

  return {
    aoNum: displayAoNum || syntheticAoNum,
    displayAoNum: displayAoNum || "Non renseigné",
    client: row.CLIENT || row.Client || "Client non renseigné",
    sujet: row.SUJET || row.Sujet || "Sujet non renseigné",
    manager: row["RESP."] || row.Manager || row["Manager recommandé"] || "Non assigné",
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
  };
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

  return {
    ...source,
    aoNum: firstMeaningful(source.aoNum, pipeline.aoNum) || source.aoNum,
    displayAoNum: firstMeaningful(source.displayAoNum, pipeline.displayAoNum) || source.displayAoNum,
    client: firstMeaningful(source.client, pipeline.client) || source.client,
    sujet: firstMeaningful(source.sujet, pipeline.sujet) || source.sujet,
    manager: firstMeaningful(pipeline.manager, source.manager) || source.manager,
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
  };
}
