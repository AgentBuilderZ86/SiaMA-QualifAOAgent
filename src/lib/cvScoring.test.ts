import { describe, expect, it } from "vitest";
import type { AoRecord, QualificationFiche } from "@/lib/aoTypes";
import { buildCvAdaptation, buildCvScoringSummary, parseQualificationForCvScoring } from "@/lib/cvScoring";

function ao(partial: Partial<AoRecord> = {}): AoRecord {
  return {
    aoNum: "AO-1",
    displayAoNum: "AO-1",
    client: "Client",
    sujet: "Mission data",
    manager: "Alice Martin",
    budget: "NC",
    delaiJours: 10,
    dateLimite: "2026-06-15",
    decisionIa: "",
    justificationIa: "",
    statut: "BO",
    sourceTab: "Pipeline",
    raw: {},
    ...partial
  };
}

function fiche(partial: Partial<QualificationFiche> = {}): QualificationFiche {
  return {
    contexte: "Contexte",
    objet: "Objet",
    perimetre: "Périmètre",
    livrables: "Livrables",
    duree: "Durée",
    profils: "Chef de projet data; Architecte SI; Consultant data governance",
    criteres: "Références similaires exigées et CV au format annexe.",
    concurrence: "",
    relation: "",
    budget: "NC",
    chances: "",
    risques: "",
    pointsVigilance: [],
    documentName: "RC.pdf",
    documentExtract: "Les CV doivent respecter le format imposé en annexe. Références similaires attendues.",
    extractionStatus: "Document analysé",
    recommendation: "WATCH",
    sources: ["RC.pdf"],
    ...partial
  };
}

describe("cvScoring", () => {
  it("score les profils, références et formats depuis des preuves AO", () => {
    const summary = buildCvScoringSummary(ao(), fiche());

    expect(summary.score).toBeGreaterThanOrEqual(50);
    expect(summary.requiredProfiles).toContain("Architecte SI");
    expect(summary.profileCoverage.map((profile) => profile.profile)).toContain("Architecte SI");
    expect(summary.profileCoverage.find((profile) => profile.profile === "Architecte SI")?.icon).toBe("🧭");
    expect(summary.items.find((item) => item.id === "similar-references")?.evidence).toContain("références similaires");
    expect(summary.items.find((item) => item.id === "ao-format")?.adaptations.join(" ")).toContain("RC/CPS");
  });

  it("reste prudent quand aucune preuve CV n'existe", () => {
    const summary = buildCvScoringSummary(ao());

    expect(summary.status).toBe("missing");
    expect(summary.requiredProfiles).toEqual([]);
    expect(summary.profileCoverage[0]).toMatchObject({ profile: "Profils à confirmer", icon: "⚠️", status: "missing" });
    expect(summary.items.every((item) => item.evidence.length > 0)).toBe(true);
  });

  it("parse la fiche qualification JSON pour le scoring", () => {
    const parsed = parseQualificationForCvScoring(JSON.stringify(fiche()));

    expect(parsed?.profils).toContain("Chef de projet data");
  });

  it("adapte un CV uploadé sans inventer les exigences non couvertes", () => {
    const adaptation = buildCvAdaptation(ao(), fiche(), {
      name: "cv-consultant.txt",
      targetRole: "Architecte SI",
      text: [
        "Architecte SI avec expérience de cadrage data governance.",
        "Mission client bancaire : cartographie applicative, urbanisation SI et pilotage projet.",
        "Référence projet : refonte data platform et accompagnement PMO."
      ].join("\n")
    });

    expect(adaptation.cvName).toBe("cv-consultant.txt");
    expect(adaptation.targetRole).toBe("Architecte SI");
    expect(adaptation.scoreAfter).toBeGreaterThanOrEqual(adaptation.scoreBefore);
    expect(adaptation.rewrittenBlocks.flatMap((block) => block.bullets).join(" ")).toContain("Architecte SI");
    expect(adaptation.requirements.some((row) => row.matched)).toBe(true);
  });
});
