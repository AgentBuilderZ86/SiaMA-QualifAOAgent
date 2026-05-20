import type { AoRecord } from "@/lib/aoTypes";

export type ProductionOfferStageStatus = "done" | "attention" | "pending";

export type ProductionOfferStage = {
  id: "cv-references" | "technical-offer" | "financial-offer" | "review-send";
  title: string;
  subtitle: string;
  timeline: string;
  checks: string[];
  proposalSections: string[];
};

export type ProductionOfferStageState = ProductionOfferStage & {
  status: ProductionOfferStageStatus;
  statusLabel: string;
  evidence: string;
};

export const PRODUCTION_OFFER_STAGES: ProductionOfferStage[] = [
  {
    id: "cv-references",
    title: "CV & références",
    subtitle: "Sélection bench · Format Sia · Format AO",
    timeline: "J+3 à J+7",
    checks: [
      "Sélectionner le bench CV adapté aux critères du RC/CPS.",
      "Qualifier les références similaires et preuves demandées.",
      "Préparer deux formats : gabarit Sia et format imposé par l'AO.",
      "Contrôler le module scoring CV avant revue finale."
    ],
    proposalSections: ["Équipe et références", "CV & références"]
  },
  {
    id: "technical-offer",
    title: "Offre technique",
    subtitle: "Cadrage · Suivi · Staffage · Fermeture",
    timeline: "J+7 à J+10",
    checks: [
      "Cadrer l'approche technique et les livrables.",
      "Décrire le dispositif de suivi, gouvernance et reporting.",
      "Verrouiller staffage, rôles, responsabilités et fermeture de mission."
    ],
    proposalSections: ["Offre technique", "Approche méthodologique", "Livrables et planning"]
  },
  {
    id: "financial-offer",
    title: "Offre financière",
    subtitle: "Simulation · Marges · Groupement · Freelance",
    timeline: "J+7 à J+10",
    checks: [
      "Calculer la simulation financière depuis les référentiels sourcés.",
      "Contrôler marge, budget cible, TJM et charges.",
      "Arbitrer groupement, sous-traitance ou freelance si nécessaire."
    ],
    proposalSections: ["Offre financière", "Proposition financière"]
  },
  {
    id: "review-send",
    title: "Revue & envoi",
    subtitle: "J+10-15 cross-check · J+16 envoi · J+17 relance",
    timeline: "J+10 à J+17",
    checks: [
      "Organiser cross-check technique, financier et administratif.",
      "Envoyer la proposition à J+16 selon le canal imposé.",
      "Planifier la relance J+17 et tracer destinataires, version et points ouverts."
    ],
    proposalSections: ["Revue & envoi", "Synthèse exécutive"]
  }
];

function text(value: unknown) {
  return String(value || "").trim();
}

function rawValue(ao: AoRecord, key: string) {
  return text(ao.raw?.[key]);
}

function includesAny(haystack: string, needles: string[]) {
  const normalized = haystack
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return needles.some((needle) =>
    normalized.includes(
      needle
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    )
  );
}

function proposalEvidence(ao: AoRecord, stage: ProductionOfferStage) {
  const raw = rawValue(ao, "Sections propale");
  if (!raw) return "";
  return includesAny(raw, stage.proposalSections) ? "Section propale générée." : "";
}

function statusForStage(ao: AoRecord, stage: ProductionOfferStage): Pick<ProductionOfferStageState, "status" | "statusLabel" | "evidence"> {
  const fiche = rawValue(ao, "Fiche qualification");
  const simulation = rawValue(ao, "Simulation financière");
  const proposal = proposalEvidence(ao, stage);
  const sent = ["PS", "PITCH", "PW", "PL"].includes(ao.statut);

  if (stage.id === "cv-references") {
    if (proposal) return { status: "done", statusLabel: "Couvert", evidence: proposal };
    if (fiche) return { status: "attention", statusLabel: "À compléter", evidence: "Fiche qualification disponible, références à formaliser." };
  }

  if (stage.id === "technical-offer") {
    if (proposal) return { status: "done", statusLabel: "Couvert", evidence: proposal };
    if (fiche) return { status: "attention", statusLabel: "À rédiger", evidence: "Fiche qualification disponible pour cadrage technique." };
  }

  if (stage.id === "financial-offer") {
    if (simulation && proposal) return { status: "done", statusLabel: "Couvert", evidence: "Simulation et section financière disponibles." };
    if (simulation) return { status: "attention", statusLabel: "Section à générer", evidence: "Simulation financière disponible." };
  }

  if (stage.id === "review-send") {
    if (sent) return { status: "done", statusLabel: "Envoyé / post-envoi", evidence: `Statut ${ao.statut}.` };
    if (simulation || proposal) return { status: "attention", statusLabel: "Revue à planifier", evidence: "Production offre commencée." };
  }

  return { status: "pending", statusLabel: "À faire", evidence: "Aucune preuve enregistrée." };
}

export function buildProductionOfferChecklist(ao: AoRecord): ProductionOfferStageState[] {
  return PRODUCTION_OFFER_STAGES.map((stage) => ({
    ...stage,
    ...statusForStage(ao, stage)
  }));
}

export function openProductionOfferStages(ao: AoRecord) {
  return buildProductionOfferChecklist(ao).filter((stage) => stage.status !== "done");
}
