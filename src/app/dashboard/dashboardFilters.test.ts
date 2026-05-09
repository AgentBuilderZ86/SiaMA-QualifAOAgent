import { describe, expect, it } from "vitest";
import {
  filterDashboardRecords,
  managersMatch,
  normalizeManagerKey,
  parsePipelineFilters,
  type DashboardPipelineFilters
} from "./dashboardFilters";
import type { AoRecord } from "@/lib/aoTypes";

function ao(partial: Partial<AoRecord> & Pick<AoRecord, "aoNum" | "statut" | "sourceTab">): AoRecord {
  return {
    displayAoNum: partial.displayAoNum ?? partial.aoNum,
    client: partial.client ?? "C",
    sujet: partial.sujet ?? "S",
    manager: partial.manager ?? "M",
    budget: partial.budget ?? "NC",
    delaiJours: partial.delaiJours ?? null,
    dateLimite: partial.dateLimite ?? "",
    decisionIa: partial.decisionIa ?? "",
    justificationIa: partial.justificationIa ?? "",
    raw: partial.raw ?? {},
    ...partial
  };
}

describe("filterDashboardRecords", () => {
  const rows = [
    ao({ aoNum: "1", statut: "BO", sourceTab: "t", manager: "Alice Dupont", delaiJours: 3 }),
    ao({ aoNum: "2", statut: "GO", sourceTab: "t", manager: "Bob", delaiJours: 20 })
  ];

  it("filtre par statut", () => {
    const f: DashboardPipelineFilters = { statuts: ["BO"], manager: undefined, client: undefined, reco: undefined, delaiMax: undefined };
    expect(filterDashboardRecords(rows, f)).toHaveLength(1);
  });

  it("filtre manager avec normalisation", () => {
    const f: DashboardPipelineFilters = {
      statuts: [],
      manager: "alice dupont",
      client: undefined,
      reco: undefined,
      delaiMax: undefined
    };
    const hit = filterDashboardRecords(rows, f);
    expect(hit).toHaveLength(1);
    expect(hit[0].aoNum).toBe("1");
  });
});

describe("managersMatch", () => {
  it("accepte accents / casse", () => {
    expect(managersMatch("Éléonore Martin", "eleonore martin")).toBe(true);
  });
});

describe("normalizeManagerKey", () => {
  it("retire les accents", () => {
    expect(normalizeManagerKey("Élise")).toBe("elise");
  });
});

describe("parsePipelineFilters", () => {
  it("parse statuts multiples", () => {
    const r = parsePipelineFilters({ statuts: "BO,P2P" });
    expect(r.statuts).toEqual(["BO", "P2P"]);
  });
});
