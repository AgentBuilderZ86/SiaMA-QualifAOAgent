import { describe, expect, it } from "vitest";
import type { AoRecord } from "@/lib/aoTypes";
import { buildProductionOfferChecklist, openProductionOfferStages, PRODUCTION_OFFER_STAGES } from "@/lib/productionOffer";

function ao(partial: Partial<AoRecord> = {}): AoRecord {
  return {
    aoNum: "AO-1",
    displayAoNum: "AO-1",
    client: "Client",
    sujet: "Mission SI",
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

describe("productionOffer", () => {
  it("couvre les quatre blocs de production offre demandés", () => {
    expect(PRODUCTION_OFFER_STAGES.map((stage) => stage.title)).toEqual([
      "CV & références",
      "Offre technique",
      "Offre financière",
      "Revue & envoi"
    ]);
    expect(PRODUCTION_OFFER_STAGES.flatMap((stage) => stage.checks).join(" ")).toContain("groupement");
    expect(PRODUCTION_OFFER_STAGES.flatMap((stage) => stage.checks).join(" ")).toContain("relance J+17");
  });

  it("marque la production financière en attention quand la simulation existe sans section financière", () => {
    const checklist = buildProductionOfferChecklist(
      ao({
        raw: {
          "Simulation financière": JSON.stringify({ totalTtc: 1000 })
        }
      })
    );

    expect(checklist.find((stage) => stage.id === "financial-offer")?.status).toBe("attention");
    expect(openProductionOfferStages(ao({ raw: { "Simulation financière": "{}" } })).map((stage) => stage.id)).toContain("financial-offer");
  });

  it("marque revue et envoi comme couvert dès que la proposition est envoyée", () => {
    const review = buildProductionOfferChecklist(ao({ statut: "PS" })).find((stage) => stage.id === "review-send");

    expect(review?.status).toBe("done");
    expect(review?.evidence).toContain("PS");
  });
});
