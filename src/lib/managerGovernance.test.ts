import { describe, expect, it } from "vitest";
import { isDifferentManager, isPendingReassignment, managerMatchesUser } from "@/lib/managerGovernance";
import type { AoRecord } from "@/lib/aoTypes";

function ao(partial: Partial<AoRecord>): AoRecord {
  return {
    aoNum: "AO-1",
    displayAoNum: "AO-1",
    client: "Client",
    sujet: "Sujet",
    manager: "Alice Martin",
    budget: "NC",
    delaiJours: null,
    dateLimite: "",
    decisionIa: "",
    justificationIa: "",
    statut: "BO",
    sourceTab: "Pipeline",
    raw: {},
    ...partial
  };
}

describe("managerGovernance", () => {
  it("détecte une proposition vers un manager différent", () => {
    expect(isDifferentManager("Élodie Martin", "Elodie Martin")).toBe(false);
    expect(isDifferentManager("Alice Martin", "Karim Benali")).toBe(true);
  });

  it("identifie une réaffectation en attente uniquement si le manager change", () => {
    expect(isPendingReassignment(ao({ recommendedManager: "Karim Benali", reassignmentStatus: "À valider" }))).toBe(true);
    expect(isPendingReassignment(ao({ recommendedManager: "Alice Martin", reassignmentStatus: "À valider" }))).toBe(false);
    expect(isPendingReassignment(ao({ recommendedManager: "Karim Benali", reassignmentStatus: "Acceptée" }))).toBe(false);
  });

  it("rapproche un manager recommandé d'un email utilisateur", () => {
    expect(managerMatchesUser("Karim Benali", "karim.benali@siapartners.com")).toBe(true);
    expect(managerMatchesUser("Karim Benali", "alice.martin@siapartners.com")).toBe(false);
  });
});
