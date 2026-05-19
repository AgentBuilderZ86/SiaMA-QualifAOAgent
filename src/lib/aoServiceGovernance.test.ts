import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AoRecord } from "@/lib/aoTypes";

const repo = vi.hoisted(() => ({
  findAo: vi.fn(),
  transition: vi.fn(),
  appendRuleFeedback: vi.fn(),
  upsertPipeline: vi.fn(),
  appendHistory: vi.fn()
}));

vi.mock("@/lib/aoRepository", () => ({
  aoRepository: repo
}));

function ao(partial: Partial<AoRecord> = {}): AoRecord {
  return {
    aoNum: "AO-1",
    displayAoNum: "AO-1",
    client: "Client",
    sujet: "Mission data",
    manager: "Alice Martin",
    budget: "NC",
    delaiJours: null,
    dateLimite: "",
    decisionIa: "WATCH",
    justificationIa: "",
    statut: "BO",
    sourceTab: "Pipeline",
    raw: {},
    ...partial
  };
}

describe("aoService governance manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.transition.mockResolvedValue(undefined);
    repo.appendRuleFeedback.mockResolvedValue(undefined);
    repo.upsertPipeline.mockResolvedValue(undefined);
    repo.appendHistory.mockResolvedValue(undefined);
  });

  it("écrit le changement de statut, la justification et la proposition de réaffectation", async () => {
    repo.findAo.mockResolvedValue(ao());
    const { updateOpportunityGovernance } = await import("@/lib/aoService");

    await updateOpportunityGovernance("AO-1", "manager@siapartners.com", {
      status: "P2P",
      justification: "Karim couvre mieux le périmètre data.",
      recommendedManager: "Karim Benali"
    });

    expect(repo.transition).toHaveBeenCalledWith(
      "AO-1",
      "P2P",
      "manager@siapartners.com",
      "P2P · réaffectation proposée à Karim Benali",
      expect.objectContaining({
        "Justification changement statut": "Karim couvre mieux le périmètre data.",
        "Manager recommandé": "Karim Benali",
        "Manager précédent": "Alice Martin",
        "Statut réaffectation": "À valider"
      })
    );
    expect(repo.appendRuleFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        ao_num: "AO-1",
        decision_ia: "WATCH",
        decision_manager: "P2P · réaffectation proposée à Karim Benali",
        manager_actuel: "Alice Martin",
        manager_recommande: "Karim Benali",
        type_feedback: "changement_statut_reaffectation"
      })
    );
  });

  it("accepte une réaffectation en attente et conserve la trace feedback", async () => {
    repo.findAo.mockResolvedValue(
      ao({
        recommendedManager: "Karim Benali",
        reassignmentStatus: "À valider",
        reassignmentJustification: "Karim couvre mieux le périmètre data."
      })
    );
    const { decideOpportunityReassignment } = await import("@/lib/aoService");

    await decideOpportunityReassignment("AO-1", "karim.benali@siapartners.com", "accept", "Pertinent pour expertise data.");

    expect(repo.upsertPipeline).toHaveBeenCalledWith(
      expect.any(Object),
      "BO",
      expect.objectContaining({
        Manager: "Karim Benali",
        "Manager recommandé": "Karim Benali",
        "Manager précédent": "Alice Martin",
        "Statut réaffectation": "Acceptée",
        "Décision réaffectation par": "karim.benali@siapartners.com"
      })
    );
    expect(repo.appendRuleFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        decision_manager: "Réaffectation acceptée · Karim Benali",
        motif_manager: "Pertinent pour expertise data.",
        type_feedback: "reaffectation_acceptee"
      })
    );
  });
});
