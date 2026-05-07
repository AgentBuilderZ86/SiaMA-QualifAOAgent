import type {
  AoRecord,
  FinancialSimulation,
  IntelligentQualificationFiche,
  ProposalSection,
  QualificationFiche,
  ReferentielItem
} from "@/lib/ao";
import type { SheetRecord } from "@/lib/google";
import { buildFallbackIntelligence } from "@/lib/qualification/intelligence";

export type AoDeckPayload = {
  generatedAt: string;
  ao: {
    aoNum: string;
    displayAoNum: string;
    client: string;
    subject: string;
    manager: string;
    status: string;
    budget: string;
    deadline: string;
    deadlineDays: number | null;
    sourceName: string;
    sourceKind: string;
    sourceUrl: string;
    buyer: string;
    country: string;
  };
  decision: {
    recommendation: string;
    score: number | null;
    confidence: string;
    reasons: string[];
    vigilances: string[];
    nextAction: string;
  };
  qualification: {
    executiveSummary: string;
    clientContext: string;
    scopeSynthesis: string;
    businessIssues: string[];
    winThemes: string[];
    risks: Array<{ label: string; severity: string; mitigation: string; source: string }>;
    clarificationQuestions: string[];
    responseStrategy: string;
    differentiators: string[];
    assumptions: string[];
    documentName: string;
    extractionStatus: string;
    identification?: IntelligentQualificationFiche["identification"];
    missionPhases?: IntelligentQualificationFiche["missionPhases"];
    expectedDeliverables?: string[];
    requiredProfile?: string[];
    qualificationSignals?: IntelligentQualificationFiche["qualificationSignals"];
    managerRecommendation?: IntelligentQualificationFiche["managerRecommendation"];
    decisionWatchpoints?: IntelligentQualificationFiche["decisionWatchpoints"];
    nextSteps?: IntelligentQualificationFiche["nextSteps"];
  };
  simulation: FinancialSimulation | null;
  proposal: ProposalSection | null;
  storyboard: Array<{ title: string; keyMessage: string; bullets: string[]; speakerNotes: string }>;
  referentials: Array<{ type: string; name: string; value: string; unit: string; source: string }>;
  sources: Array<{ title: string; url: string; excerpt: string; consultedAt: string }>;
};

function text(value: unknown, fallback = "À confirmer") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function arrayText(values: unknown, fallback: string[] = []) {
  return Array.isArray(values) ? values.map((value) => text(value)).filter(Boolean) : fallback;
}

function normalizeUrl(value: unknown) {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function fallbackFiche(ao: AoRecord): QualificationFiche {
  return {
    contexte: "À confirmer",
    objet: ao.sujet,
    perimetre: "À confirmer",
    livrables: "À confirmer",
    duree: "À confirmer",
    profils: "À confirmer",
    criteres: "À confirmer",
    concurrence: "À confirmer",
    relation: "À confirmer",
    budget: ao.budget,
    chances: "À confirmer",
    risques: "À confirmer",
    pointsVigilance: [],
    documentName: "Aucun document de qualification",
    documentExtract: "",
    extractionStatus: "Fiche qualification non renseignée",
    recommendation: ao.decisionIa || "À confirmer",
    sources: [ao.sourceName || ao.sourceTab].filter(Boolean)
  };
}

function collectSources(ao: AoRecord, fiche: QualificationFiche | null, intelligence: IntelligentQualificationFiche) {
  const sources = intelligence.sources.map((source) => ({
    title: text(source.title, "Source qualification"),
    url: normalizeUrl(source.url),
    excerpt: text(source.excerpt, "Élément source consulté."),
    consultedAt: text(source.consultedAt, intelligence.generatedAt)
  }));

  if (ao.sourceUrl) {
    sources.unshift({
      title: text(ao.sourceName || ao.sourceTab, "Source AO"),
      url: normalizeUrl(ao.sourceUrl),
      excerpt: text(ao.sujet, "Avis AO source."),
      consultedAt: text(ao.collectedAt || ao.publishedAt, new Date().toISOString())
    });
  }

  (fiche?.sources || []).forEach((source) => {
    if (!sources.some((item) => item.title === source)) {
      sources.push({
        title: text(source, "Source documentaire"),
        url: "",
        excerpt: "Source issue de la fiche qualification.",
        consultedAt: text(intelligence.generatedAt)
      });
    }
  });

  return sources;
}

export function parseQualification(value: unknown): QualificationFiche | null {
  return parseJson<QualificationFiche>(value);
}

export function buildAoDeckPayload(
  ao: AoRecord,
  pipeline: SheetRecord | null | undefined,
  referentials: ReferentielItem[] = []
): AoDeckPayload {
  const fiche = parseQualification(pipeline?.["Fiche qualification"]);
  const resolvedFiche = fiche || fallbackFiche(ao);
  const intelligence =
    resolvedFiche.intelligence || buildFallbackIntelligence(ao, resolvedFiche, [], ["Analyse IA indisponible ou ancienne."]);
  const simulation = parseJson<FinancialSimulation>(pipeline?.["Simulation financière"]);
  const proposal = parseJson<ProposalSection>(pipeline?.["Sections propale"]);
  const sources = collectSources(ao, resolvedFiche, intelligence);

  return {
    generatedAt: new Date().toISOString(),
    ao: {
      aoNum: text(ao.aoNum),
      displayAoNum: text(ao.displayAoNum),
      client: text(ao.client),
      subject: text(ao.sujet),
      manager: text(ao.manager),
      status: text(ao.statut),
      budget: text(ao.budget),
      deadline: text(ao.dateLimite),
      deadlineDays: ao.delaiJours,
      sourceName: text(ao.sourceName || ao.sourceTab),
      sourceKind: text(ao.sourceKind),
      sourceUrl: normalizeUrl(ao.sourceUrl),
      buyer: text(ao.buyer || ao.client),
      country: text(ao.country)
    },
    decision: {
      recommendation: intelligence.recommendation,
      score: intelligence.goNoGoScore,
      confidence: intelligence.confidenceLevel,
      reasons: intelligence.winThemes.slice(0, 4),
      vigilances: intelligence.risks.map((risk) => `${risk.label} : ${risk.mitigation}`).slice(0, 4),
      nextAction: intelligence.responseStrategy
    },
    qualification: {
      executiveSummary: text(intelligence.executiveSummary),
      clientContext: text(intelligence.clientContext),
      scopeSynthesis: text(intelligence.scopeSynthesis),
      businessIssues: arrayText(intelligence.businessIssues).slice(0, 5),
      winThemes: arrayText(intelligence.winThemes).slice(0, 5),
      risks: intelligence.risks.slice(0, 6),
      clarificationQuestions: arrayText(intelligence.clarificationQuestions).slice(0, 6),
      responseStrategy: text(intelligence.responseStrategy),
      differentiators: arrayText(intelligence.differentiators).slice(0, 5),
      assumptions: arrayText(intelligence.assumptions).slice(0, 6),
      documentName: text(resolvedFiche.documentName),
      extractionStatus: text(resolvedFiche.extractionStatus),
      identification: intelligence.identification,
      missionPhases: intelligence.missionPhases,
      expectedDeliverables: intelligence.expectedDeliverables,
      requiredProfile: intelligence.requiredProfile,
      qualificationSignals: intelligence.qualificationSignals,
      managerRecommendation: intelligence.managerRecommendation,
      decisionWatchpoints: intelligence.decisionWatchpoints,
      nextSteps: intelligence.nextSteps
    },
    simulation,
    proposal,
    storyboard: intelligence.slideStoryboard.slice(0, 8),
    referentials: referentials.map((item) => ({
      type: item.type,
      name: item.name,
      value: item.value,
      unit: item.unit,
      source: item.source
    })),
    sources
  };
}
