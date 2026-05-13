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
import { extractDocumentSections, extractUploadedDocument, summarizeDocumentText } from "@/lib/documents";
import { extractKeyMetadata, isPlaceholderSection } from "@/lib/qualification/documentMetadata";
import { filenameSignalsPrefix, parseFilenameSignals } from "@/lib/qualification/filenameSignals";
import { simulateFinancials } from "@/lib/finance";
import { generateProposalSection, generateQualificationRecommendation } from "@/lib/llm";
import { completeChat, hasConfiguredLlm } from "@/lib/llmChat";
import { getSheetsConfigStatus } from "@/lib/google";
import { readAoCache } from "@/lib/aoSources/cache";
import { generateIntelligentQualification } from "@/lib/qualification/intelligence";
import { operationalDeadlineSubset, urgentByDeadline } from "@/lib/aoDeadline";
import type { SheetRow } from "@/lib/google";
import type { AoRecord, AoStatus, ClosureReport, FinancialSimulation, QualificationFiche } from "@/lib/aoTypes";

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

export async function saveQualification(aoNum: string, actor: string, formData: FormData) {
  const ao = await aoRepository.findAo(aoNum);
  if (!ao) throw new Error(`AO ${aoNum} introuvable.`);

  const uploaded = await extractUploadedDocument(formData.get("document") as File | null);
  const filenameSignals = parseFilenameSignals(uploaded.name || "");
  const manualExtract = String(formData.get("documentExtract") || "");
  const prefixedDocText = filenameSignalsPrefix(filenameSignals) + uploaded.text;
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

  const pipelineNotes = (() => {
    const base = uploaded.warning || "";
    const hint = meta.matchNotes[0];
    if (hint && base.length < 350) return [base, hint].filter(Boolean).join(" · ");
    return base;
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
    documentName: uploaded.name,
    documentExtract,
    extractionStatus: uploaded.warning || "Document analysé",
    recommendation: "À générer",
    sources: ["Google Sheets AO", uploaded.name || "Saisie qualification"].filter(Boolean),
    filenameSignals: Object.keys(filenameSignals).length ? filenameSignals : undefined,
    extractionEvidence
  };
  fiche.recommendation = await generateQualificationRecommendation(ao, fiche);
  fiche.intelligence = await generateIntelligentQualification(ao, fiche, referentials, formData.get("enrichWeb") === "yes");

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
