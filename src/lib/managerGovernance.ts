import type { AoRecord, ReassignmentStatus } from "@/lib/aoTypes";

export type OpportunityGovernanceInput = {
  status: string;
  justification: string;
  recommendedManager?: string;
};

export type ReassignmentDecision = "accept" | "reject";

export function normalizeManagerKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isDifferentManager(currentManager: string, recommendedManager: string) {
  const current = normalizeManagerKey(currentManager);
  const next = normalizeManagerKey(recommendedManager);
  return Boolean(next && current !== next);
}

export function isPendingReassignment(ao: Pick<AoRecord, "reassignmentStatus" | "recommendedManager" | "manager">) {
  return ao.reassignmentStatus === "À valider" && isDifferentManager(ao.manager, ao.recommendedManager || "");
}

export function managerMatchesUser(managerName: string, userEmail: string) {
  const manager = normalizeManagerKey(managerName);
  const localPart = normalizeManagerKey(String(userEmail || "").split("@")[0] || "");
  if (!manager || !localPart) return false;
  const managerTokens = manager.split(" ").filter((token) => token.length >= 2);
  return managerTokens.every((token) => localPart.includes(token)) || localPart.includes(manager.replace(/\s+/g, ""));
}

export function reassignmentStatusFromDecision(decision: ReassignmentDecision): ReassignmentStatus {
  return decision === "accept" ? "Acceptée" : "Refusée";
}

export function buildManagerFeedbackDecision(status: string, recommendedManager?: string) {
  const manager = String(recommendedManager || "").trim();
  return manager ? `${status} · réaffectation proposée à ${manager}` : status;
}
