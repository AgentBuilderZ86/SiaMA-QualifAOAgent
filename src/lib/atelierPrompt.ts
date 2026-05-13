import type { AoRecord, ReferentielItem } from "@/lib/aoTypes";
import type { AtelierStrategieV1 } from "@/lib/atelierStrategie";
import { buildAtelierAssistantInstruction } from "@/lib/atelierStrategie";

export function buildAtelierSystemPrompt(): string {
  return [
    "Tu es un conseiller senior pour les réponses aux appels d'offres au Maroc (consulting / transformation).",
    "Tu aides le manager à structurer stratégie, équipe et chiffrage indicatif aligné sur le dossier.",
    "Ne jamais inventer de chiffres, TJM, marges ou références non présents dans le contexte fourni ; utilise « À confirmer » ou demande explicitement une validation humaine.",
    "Réponds en français, de façon concise et actionnable.",
    buildAtelierAssistantInstruction()
  ].join("\n\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…(tronqué)`;
}

function referentialsSummary(ref: ReferentielItem[]): string {
  return ref
    .filter((r) => String(r.active || "").toUpperCase() !== "FALSE")
    .slice(0, 80)
    .map((r) => `- ${r.type} · ${r.name} = ${r.value} ${r.unit} (${r.source})`)
    .join("\n");
}

export function buildAtelierUserPayload(opts: {
  ao: AoRecord;
  ficheQualifJson: string;
  simulationJson: string;
  referentials: ReferentielItem[];
  state: AtelierStrategieV1;
}): string {
  const history = opts.state.messages
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"} (${m.at}):\n${m.content}`)
    .join("\n\n---\n\n");
  const aoCtx = JSON.stringify({
    aoNum: opts.ao.aoNum,
    displayAoNum: opts.ao.displayAoNum,
    client: opts.ao.client,
    sujet: opts.ao.sujet,
    budget: opts.ao.budget,
    dateLimite: opts.ao.dateLimite,
    statut: opts.ao.statut,
    manager: opts.ao.manager,
    decisionIa: opts.ao.decisionIa,
    justificationIa: opts.ao.justificationIa
  });
  return [
    "## Contexte AO (JSON)",
    truncate(aoCtx, 6000),
    "## Fiche qualification (tronquée)",
    truncate(opts.ficheQualifJson || "{}", 14_000),
    "## Simulation financière enregistrée (tronquée)",
    truncate(opts.simulationJson || "{}", 10_000),
    "## Référentiels",
    truncate(referentialsSummary(opts.referentials), 8000),
    "## Historique atelier",
    history || "(vide)",
    "## Brouillon structuré courant (lastDraft)",
    opts.state.lastDraft ? truncate(JSON.stringify(opts.state.lastDraft), 4000) : "(aucun)"
  ].join("\n\n");
}
