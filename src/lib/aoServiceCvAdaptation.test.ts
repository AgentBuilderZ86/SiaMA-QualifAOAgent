import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AoRecord } from "@/lib/aoTypes";

const repo = vi.hoisted(() => ({
  findAo: vi.fn(),
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
    sujet: "Mission data governance",
    manager: "Alice Martin",
    budget: "NC",
    delaiJours: 10,
    dateLimite: "2026-06-15",
    decisionIa: "",
    justificationIa: "",
    statut: "BO",
    sourceTab: "Pipeline",
    raw: {
      "Fiche qualification": JSON.stringify({
        profils: "Architecte SI; Chef de projet data",
        criteres: "Références similaires exigées.",
        documentExtract: "Les CV doivent répondre au format imposé en annexe.",
        sources: ["RC.pdf"]
      })
    },
    ...partial
  };
}

describe("aoService saveCvAdaptations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findAo.mockResolvedValue(ao());
    repo.upsertPipeline.mockResolvedValue(undefined);
    repo.appendHistory.mockResolvedValue(undefined);
  });

  it("extrait un CV uploadé, génère l'adaptation et la stocke dans le pipeline", async () => {
    const { saveCvAdaptations } = await import("@/lib/aoService");
    const formData = new FormData();
    formData.set("targetRole", "Architecte SI");
    formData.append(
      "cv",
      new File(
        [
          [
            "Architecte SI senior",
            "Expérience data governance et urbanisation SI.",
            "Référence projet : refonte data platform et pilotage PMO."
          ].join("\n")
        ],
        "cv-architecte.txt",
        { type: "text/plain" }
      )
    );

    const adaptations = await saveCvAdaptations("AO-1", "manager@siapartners.com", formData);

    expect(adaptations).toHaveLength(1);
    expect(adaptations[0].cvName).toBe("cv-architecte.txt");
    expect(adaptations[0].targetRole).toBe("Architecte SI");
    expect(repo.upsertPipeline).toHaveBeenCalledWith(
      expect.any(Object),
      "BO",
      expect.objectContaining({
        "Adaptations CV": expect.stringContaining("cv-architecte.txt")
      })
    );
    expect(repo.appendHistory).toHaveBeenCalledWith(expect.objectContaining({ note: expect.stringContaining("Adaptations CV générées") }));
  });
});
