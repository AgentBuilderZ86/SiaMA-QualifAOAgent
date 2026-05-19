import { describe, expect, it } from "vitest";
import type { AoRecord, AoStatus } from "@/lib/aoTypes";
import { filterOfficeManagerTodoRecords, isOfficeManagerTodoStatus } from "@/lib/officeManagerTodoScope";

function ao(statut: AoStatus): AoRecord {
  return {
    aoNum: `AO-${statut}`,
    displayAoNum: `AO-${statut}`,
    client: "Client",
    sujet: "Sujet",
    manager: "Alice Martin",
    budget: "NC",
    delaiJours: null,
    dateLimite: "",
    decisionIa: "",
    justificationIa: "",
    statut,
    sourceTab: "Pipeline",
    raw: {}
  };
}

describe("officeManagerTodoScope", () => {
  it("conserve uniquement les AO BO et P2P dans la todolist Office Manager", () => {
    const records = ["P2P", "BO", "A QUALIFIER", "GO", "PW", "PL"].map((status) => ao(status as AoStatus));

    expect(filterOfficeManagerTodoRecords(records).map((record) => record.statut)).toEqual(["P2P", "BO"]);
    expect(isOfficeManagerTodoStatus("P2P")).toBe(true);
    expect(isOfficeManagerTodoStatus("BO")).toBe(true);
    expect(isOfficeManagerTodoStatus("A QUALIFIER")).toBe(false);
    expect(isOfficeManagerTodoStatus("PW")).toBe(false);
  });
});
