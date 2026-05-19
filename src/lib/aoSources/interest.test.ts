import { describe, expect, it } from "vitest";
import type { AoRecord } from "@/lib/aoTypes";
import { scoreAoInterest, selectInterestingAoRecords } from "@/lib/aoSources/interest";

function ao(partial: Partial<AoRecord>): AoRecord {
  return {
    aoNum: "AO-1",
    displayAoNum: "AO-1",
    client: "Client",
    sujet: "Mission data gouvernance SI",
    manager: "Non assigné",
    budget: "NC",
    delaiJours: 20,
    dateLimite: "2026-06-15",
    decisionIa: "",
    justificationIa: "",
    statut: "A QUALIFIER",
    sourceTab: "Source",
    sourceUrl: "https://example.test/ao-1",
    raw: {},
    ...partial
  };
}

describe("aoSources interest", () => {
  it("score les AO sur des signaux présents dans les données source", () => {
    const scored = scoreAoInterest(ao({}));

    expect(scored.isInteresting).toBe(true);
    expect(scored.reasons.join(" ")).toContain("Mots-clés détectés");
    expect(scored.reasons.join(" ")).toContain("Statut retenu");
  });

  it("écarte les AO sans signal métier suffisant", () => {
    const records = [
      ao({ aoNum: "AO-data", sujet: "Architecture data platform" }),
      ao({ aoNum: "AO-cleaning", sujet: "Nettoyage bureaux", statut: "PL", sourceUrl: "" })
    ];

    expect(selectInterestingAoRecords(records).map((record) => record.aoNum)).toEqual(["AO-data"]);
  });
});
