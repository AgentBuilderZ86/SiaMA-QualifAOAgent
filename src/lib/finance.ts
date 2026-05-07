import type { FinancialSimulation, ReferentielItem } from "@/lib/aoTypes";

const DEFAULT_PHASES = [
  { phase: "Diagnostic et cadrage", ratio: 0.2 },
  { phase: "Analyse et recommandations", ratio: 0.5 },
  { phase: "Livrables et restitution", ratio: 0.3 }
];

const DEFAULT_PROFILES = [
  { profil: "Senior Manager / Chef projet", ratio: 0.15 },
  { profil: "Manager / PMO", ratio: 0.25 },
  { profil: "Senior Consultant", ratio: 0.35 },
  { profil: "Consultant", ratio: 0.25 }
];

export function parseAmount(value: string) {
  const cleaned = String(value || "").replace(/[^\d.,]/g, "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildTjmMap(referentials: ReferentielItem[]) {
  const entries = referentials
    .filter((item) => item.type.toUpperCase() === "TJM")
    .map((item) => [item.name, parseAmount(item.value)] as const)
    .filter(([, value]) => value > 0);
  return new Map(entries);
}

export function getTvaRate(referentials: ReferentielItem[]) {
  const tva = referentials.find((item) => item.type.toUpperCase() === "FISCAL" && item.name.toLowerCase().includes("tva"));
  const value = tva ? parseAmount(tva.value) : 20;
  return value > 1 ? value / 100 : value;
}

export function simulateFinancials(budgetInput: string, referentials: ReferentielItem[]): FinancialSimulation {
  const budgetCible = parseAmount(budgetInput);
  const tjmMap = buildTjmMap(referentials);
  const tvaRate = getTvaRate(referentials);
  const weightedTjm = DEFAULT_PROFILES.reduce((sum, item) => sum + (tjmMap.get(item.profil) || 0) * item.ratio, 0);
  const effectiveTjm = weightedTjm || 6500;
  const totalJours = budgetCible > 0 ? Math.max(20, Math.floor((budgetCible * 0.75) / effectiveTjm)) : 60;

  const rows = DEFAULT_PHASES.flatMap(({ phase, ratio: phaseRatio }) => {
    const phaseDays = Math.max(5, Math.floor(totalJours * phaseRatio));
    return DEFAULT_PROFILES.map(({ profil, ratio }) => {
      const jours = Math.max(1, Math.floor(phaseDays * ratio));
      const tjm = tjmMap.get(profil) || Math.round(effectiveTjm);
      return { phase, profil, jours, tjm, montantHt: jours * tjm };
    });
  });

  const totalHt = rows.reduce((sum, row) => sum + row.montantHt, 0);
  const totalTtc = Math.round(totalHt * (1 + tvaRate));

  return {
    budgetCible,
    totalJours: rows.reduce((sum, row) => sum + row.jours, 0),
    totalHt,
    tvaRate,
    totalTtc,
    marge: budgetCible > 0 ? budgetCible - totalTtc : 0,
    rows,
    source:
      referentials
        .filter((item) => item.type.toUpperCase() === "TJM" || item.type.toUpperCase() === "FISCAL")
        .map((item) => item.source)
        .filter(Boolean)[0] || "Référentiel interne non sourcé"
  };
}
