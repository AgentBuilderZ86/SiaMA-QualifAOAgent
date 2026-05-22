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
import { extractUploadedDocument } from "@/lib/documents";
import {
  buildCvAdaptation,
  parseQualificationForCvScoring,
  type CvAdaptationResult,
  type UploadedCvForAdaptation
} from "@/lib/cvScoring";
import { simulateFinancials } from "@/lib/finance";
import { generateProposalSection } from "@/lib/llm";
import { completeChat, hasConfiguredLlm } from "@/lib/llmChat";
import type { SheetRow } from "@/lib/google";
import {
  AO_STATUSES,
  type AoRecord,
  type AoStatus,
  type ClosureReport,
  type FinancialSimulation
} from "@/lib/aoTypes";
import {
  buildManagerFeedbackDecision,
  isDifferentManager,
  isPendingReassignment,
  reassignmentStatusFromDecision,
  type OpportunityGovernanceInput,
  type ReassignmentDecision
} from "@/lib/managerGovernance";

// Re-exports pour rétrocompatibilité (consommateurs qui importent depuis @/lib/ao ou @/lib/aoService)
export type { DashboardData } from "@/lib/aoDashboardService";
export { getDashboardData } from "@/lib/aoDashboardService";
export { saveQualification } from "@/lib/aoQualificationService";

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
    params.ao.dataQuality?.warnings.length
      ? `warnings=${params.ao.dataQuality.warnings.join("|")}`
      : ""
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

export async function updateOpportunityGovernance(
  aoNum: string,
  actor: string,
  input: OpportunityGovernanceInput
) {
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

export async function saveSimulation(
  aoNum: string,
  actor: string,
  budgetInput: string
): Promise<FinancialSimulation> {
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

export async function saveProposalSection(
  aoNum: string,
  actor: string,
  section: string,
  context: string
) {
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
  return formData
    .getAll("cv")
    .filter((file): file is File => file instanceof File && file.size > 0);
}

export async function saveCvAdaptations(
  aoNum: string,
  actor: string,
  formData: FormData
): Promise<CvAdaptationResult[]> {
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
  await aoRepository.transition(aoNum, "PITCH", actor, "Préparation pitch enregistrée", {
    "Pitch notes": notes
  });
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

export async function runAtelierChat(
  aoNum: string,
  actorEmail: string,
  newUserMessage: string
) {
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
  let state = parseAtelierStrategie(
    typeof pipeline?.[ATELIER_STRATEGIE_COLUMN] === "string"
      ? pipeline[ATELIER_STRATEGIE_COLUMN]
      : undefined
  );
  state = appendWorkshopMessages(state, [{ role: "user", content: trimmed }], actorEmail);
  const ficheQualifJson =
    typeof pipeline?.["Fiche qualification"] === "string" ? pipeline["Fiche qualification"] : "{}";
  const simulationJson =
    typeof pipeline?.["Simulation financière"] === "string"
      ? pipeline["Simulation financière"]
      : "{}";
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
  state = appendWorkshopMessages(
    state,
    [{ role: "assistant", content: assistantDisplay }],
    actorEmail
  );
  if (draft) {
    state = mergeLastDraft(state, draft);
  }
  await aoRepository.upsertPipeline(ao, ao.statut, {
    [ATELIER_STRATEGIE_COLUMN]: serializeAtelierStrategie(state)
  });
  return { messages: state.messages, lastDraft: state.lastDraft };
}

export async function commitAtelierDraft(
  aoNum: string,
  actor: string,
  payload: AtelierCommitPayload
) {
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
    noteBlocks.push(
      `[Atelier ${nowIso}] Équipe / chiffrage :\n${p.equipeChiffrageNarratif.trim()}`
    );
  }
  if (p.sectionsPropaleCibles?.length) {
    noteBlocks.push(
      `[Atelier ${nowIso}] Sections propale cibles : ${p.sectionsPropaleCibles.join(", ")}`
    );
  }
  if (noteBlocks.length) {
    const prev = typeof pipeline?.Notes === "string" ? pipeline.Notes.trim() : "";
    updates.Notes = [prev, ...noteBlocks].filter(Boolean).join("\n\n---\n");
  }

  let state = parseAtelierStrategie(
    typeof pipeline?.[ATELIER_STRATEGIE_COLUMN] === "string"
      ? pipeline[ATELIER_STRATEGIE_COLUMN]
      : undefined
  );
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
