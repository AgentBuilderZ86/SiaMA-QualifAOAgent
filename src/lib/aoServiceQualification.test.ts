import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AoRecord } from "@/lib/aoTypes";

const repo = vi.hoisted(() => ({
  findAo: vi.fn(),
  upsertPipeline: vi.fn(),
  appendHistory: vi.fn(),
  readReferentials: vi.fn()
}));

vi.mock("@/lib/aoRepository", () => ({
  aoRepository: repo
}));

vi.mock("@/lib/llm", () => ({
  generateProposalSection: vi.fn(),
  generateQualificationRecommendation: vi.fn(async () => "GO sous réserve de compléments.")
}));

vi.mock("@/lib/qualification/intelligence", () => ({
  generateIntelligentQualification: vi.fn(async () => ({
    executiveSummary: "Synthèse test",
    recommendation: "GO",
    goNoGoScore: 75,
    confidenceLevel: "Moyenne",
    clientContext: "Contexte test",
    scopeSynthesis: "Périmètre test",
    businessIssues: ["Enjeu test"],
    winThemes: ["Thème test"],
    risks: [],
    clarificationQuestions: [],
    responseStrategy: "Stratégie test",
    differentiators: [],
    slideStoryboard: [],
    sources: [],
    assumptions: [],
    generatedAt: "2026-05-21T00:00:00.000Z",
    pptCopyBlock: "PPT test"
  }))
}));

vi.mock("@/lib/aoSources/documentCache", () => ({
  readAoDocumentCache: vi.fn(async () => ({
    generatedAt: "2026-05-21T00:00:00.000Z",
    documents: [
      {
        aoNum: "AO-1",
        sourceUrl: "https://marches.example/ao-1",
        documentUrl: "https://marches.example/ao-1/rc.pdf",
        label: "RC",
        kind: "RC",
        confidence: 100,
        filename: "rc-source.pdf",
        contentType: "application/pdf",
        sha256: "abc",
        text: "Critères : références similaires exigées depuis le RC source.",
        warning: "",
        extractedAt: "2026-05-21T00:00:00.000Z"
      }
    ],
    report: []
  }))
}));

function ao(partial: Partial<AoRecord> = {}): AoRecord {
  return {
    aoNum: "AO-1",
    displayAoNum: "AO-1",
    client: "Office des Changes",
    sujet: "Urbanisation SI",
    manager: "Alice Martin",
    budget: "NC",
    delaiJours: 10,
    dateLimite: "2026-06-15",
    decisionIa: "",
    justificationIa: "",
    statut: "A QUALIFIER",
    sourceTab: "Pipeline",
    sourceUrl: "https://marches.example/ao-1",
    raw: {},
    ...partial
  };
}

describe("aoService saveQualification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findAo.mockResolvedValue(ao());
    repo.upsertPipeline.mockResolvedValue(undefined);
    repo.appendHistory.mockResolvedValue(undefined);
    repo.readReferentials.mockResolvedValue([]);
  });

  it("agrège Avis, CPS, RC et documents source dans la fiche qualification", async () => {
    const { saveQualification } = await import("@/lib/aoService");
    const formData = new FormData();
    formData.set("aoNum", "AO-1");
    formData.set("includeSourceDocuments", "yes");
    formData.set("forceDocumentExtraction", "yes");
    formData.append("documentAvis", new File(["Avis : appel d'offres urbanisation SI."], "avis.txt", { type: "text/plain" }));
    formData.append("documentCps", new File(["CPS : cadrage, architecture cible et schéma directeur."], "cps.txt", { type: "text/plain" }));
    formData.append("documentRc", new File(["RC : notation technique et dossier administratif."], "rc.txt", { type: "text/plain" }));

    const fiche = await saveQualification("AO-1", "manager@siapartners.com", formData);

    expect(fiche.documents).toHaveLength(4);
    expect(fiche.documents?.map((document) => document.kind)).toEqual(["Avis", "CPS", "RC", "RC"]);
    expect(fiche.documentExtract).toContain("--- Document Avis : avis.txt ---");
    expect(fiche.documentExtract).toContain("--- Document CPS : cps.txt ---");
    expect(fiche.documentExtract).toContain("--- Document RC : rc.txt ---");
    expect(fiche.documentExtract).toContain("rc-source.pdf");
    expect(fiche.extractionStatus).toContain("4 document(s) analysé(s)");
    expect(repo.upsertPipeline).toHaveBeenCalledWith(
      expect.any(Object),
      "BO",
      expect.objectContaining({
        "Fiche qualification": expect.stringContaining("\"documents\""),
        Notes: expect.stringContaining("4 document(s) analysé(s)")
      })
    );
  });

  it("conserve le document existant quand aucun nouveau fichier n'est transmis", async () => {
    repo.findAo.mockResolvedValue(
      ao({
        raw: {
          "Fiche qualification": JSON.stringify({
            contexte: "Ancien contexte",
            objet: "Ancien objet",
            perimetre: "Ancien périmètre",
            livrables: "Ancien livrable",
            duree: "À confirmer",
            profils: "À confirmer",
            criteres: "À confirmer",
            concurrence: "",
            relation: "",
            budget: "NC",
            chances: "",
            risques: "À confirmer",
            pointsVigilance: [],
            documentName: "ancien-rc.pdf",
            documentExtract: "Ancien extrait documentaire fiable.",
            extractionStatus: "Document analysé",
            recommendation: "À générer",
            sources: ["ancien-rc.pdf"]
          })
        }
      })
    );
    const { saveQualification } = await import("@/lib/aoService");
    const formData = new FormData();
    formData.set("forceDocumentExtraction", "no");

    const fiche = await saveQualification("AO-1", "manager@siapartners.com", formData);

    expect(fiche.documentName).toBe("ancien-rc.pdf");
    expect(fiche.documentExtract).toContain("Ancien extrait documentaire fiable");
    expect(fiche.documents?.[0]?.name).toBe("ancien-rc.pdf");
  });
});
