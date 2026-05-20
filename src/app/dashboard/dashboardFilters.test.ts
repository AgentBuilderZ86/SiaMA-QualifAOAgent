import { describe, expect, it } from "vitest";
import {
  dashboardPathWithFilters,
  filterDashboardRecords,
  managersMatch,
  normalizeManagerKey,
  parsePipelineFilters,
  patchPipelineFilters,
  sourceLabelForAo,
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
    ao({ aoNum: "1", statut: "BO", sourceTab: "t", sourceName: "PMMP", manager: "Alice Dupont", delaiJours: 3 }),
    ao({ aoNum: "2", statut: "GO", sourceTab: "t", sourceName: "ADM Achats", manager: "Bob", delaiJours: 20 })
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

  it("filtre par source avec normalisation", () => {
    const f: DashboardPipelineFilters = {
      statuts: [],
      source: "pmmp",
      manager: undefined,
      client: undefined,
      reco: undefined,
      delaiMax: undefined
    };
    expect(filterDashboardRecords(rows, f).map((record) => record.aoNum)).toEqual(["1"]);
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

  it("parse et sérialise le filtre source", () => {
    const r = parsePipelineFilters({ source: "ADM Achats" });
    expect(r.source).toBe("ADM Achats");
    expect(dashboardPathWithFilters("/dashboard", r)).toBe("/dashboard?source=ADM+Achats");
  });

  it("préserve ou efface la source via patch", () => {
    const base = parsePipelineFilters({ source: "PMMP", manager: "Alice" });
    expect(patchPipelineFilters(base, { manager: "Bob" }).source).toBe("PMMP");
    expect(patchPipelineFilters(base, { source: null }).source).toBeUndefined();
  });
});

describe("sourceLabelForAo", () => {
  it("privilégie sourceName puis sourceTab", () => {
    expect(sourceLabelForAo(ao({ aoNum: "3", statut: "BO", sourceTab: "Tab", sourceName: "Source nommée" }))).toBe("Source nommée");
    expect(sourceLabelForAo(ao({ aoNum: "4", statut: "BO", sourceTab: "Tab" }))).toBe("Tab");
  });
});
