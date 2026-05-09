import { describe, expect, it } from "vitest";
import { dedupeByPrimaryAoKey, mergeSourcesWithPipelineTab, normalizeAoLookupKey } from "@/lib/aoMergeForDashboard";
import type { AoRecord } from "@/lib/aoTypes";

function ao(partial: Partial<AoRecord> & Pick<AoRecord, "aoNum" | "statut" | "sourceTab">): AoRecord {
  return {
    displayAoNum: partial.displayAoNum ?? partial.aoNum,
    client: partial.client ?? "Client",
    sujet: partial.sujet ?? "Sujet",
    manager: partial.manager ?? "Non assigné",
    budget: partial.budget ?? "NC",
    delaiJours: partial.delaiJours ?? null,
    dateLimite: partial.dateLimite ?? "",
    decisionIa: partial.decisionIa ?? "",
    justificationIa: partial.justificationIa ?? "",
    raw: partial.raw ?? {},
    ...partial
  };
}

describe("normalizeAoLookupKey", () => {
  it("normalise casse", () => {
    expect(normalizeAoLookupKey("  OP-123  ")).toBe("op-123");
  });
});

describe("mergeSourcesWithPipelineTab", () => {
  it("priorise le statut pipeline", () => {
    const source = ao({ aoNum: "OP1", statut: "GO", sourceTab: "En cours" });
    const pipe = ao({ aoNum: "OP1", statut: "BO", sourceTab: "Pipeline" });
    const out = mergeSourcesWithPipelineTab([source], [pipe]);
    expect(out).toHaveLength(1);
    expect(out[0].statut).toBe("BO");
  });
});

describe("dedupeByPrimaryAoKey", () => {
  it("dédoublonne par aoNum", () => {
    const a = ao({ aoNum: "X", statut: "GO", sourceTab: "t1" });
    const b = ao({ aoNum: "X", statut: "BO", sourceTab: "t2" });
    const out = dedupeByPrimaryAoKey([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].statut).toBe("GO");
  });
});
