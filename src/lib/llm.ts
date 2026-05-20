import type { AoRecord, ProposalSection, QualificationFiche } from "@/lib/aoTypes";
import { completeChat, hasConfiguredLlm } from "@/lib/llmChat";

type GenerateInput = {
  task: string;
  ao: AoRecord;
  context: string;
  sources: string[];
};

function fallbackText(input: GenerateInput) {
  return [
    `Objectif : ${input.task}`,
    `AO : ${input.ao.aoNum} - ${input.ao.client}`,
    `Sujet : ${input.ao.sujet}`,
    "",
    input.context || "Contexte non trouvé. Compléter avec les éléments du CPS/RC.",
    "",
    `Sources utilisées : ${input.sources.length ? input.sources.join(", ") : "Données Google Sheets et saisie utilisateur"}`
  ].join("\n");
}

function proposalDiagram() {
  return [
    "flowchart LR",
    "  contexte[Contexte] --> enjeux[Enjeux]",
    "  enjeux --> approche[Approche]",
    "  approche --> livrables[Livrables]",
    "  livrables --> valeur[Valeur]"
  ].join("\n");
}

function buildPptCopyBlock(section: Omit<ProposalSection, "pptCopyBlock">) {
  return [
    `Titre slide : ${section.slideTitle}`,
    "",
    "Messages clés :",
    ...section.keyMessages.map((message) => `- ${message}`),
    "",
    "Texte de slide :",
    section.bodyText,
    "",
    `${section.diagramTitle} :`,
    section.diagramMermaid,
    "",
    `Sources : ${section.sources.join(", ")}`
  ].join("\n");
}

function fallbackProposalSection(ao: AoRecord, section: string, context: string, sources: string[]): ProposalSection {
  const keyMessages = [
    `Client : ${ao.client || "À confirmer"}`,
    `Besoin : ${ao.sujet || "À confirmer"}`,
    "Périmètre, planning et critères à confirmer à partir du CPS/RC"
  ];
  const base = {
    section,
    content: fallbackText({ task: `Rédiger la section de propale : ${section}`, ao, context, sources }),
    slideTitle: `${section} - ${ao.client || "Client à confirmer"}`,
    keyMessages,
    bodyText: [
      `Cette section présente ${section.toLowerCase()} pour l'appel d'offres ${ao.displayAoNum || ao.aoNum}.`,
      `Le besoin identifié est : ${ao.sujet || "À confirmer"}.`,
      context || "Les éléments de contexte doivent être confirmés à partir de la fiche qualification et du dossier de consultation."
    ].join("\n\n"),
    diagramTitle: "Schéma de synthèse",
    diagramMermaid: proposalDiagram(),
    sources
  };
  return { ...base, pptCopyBlock: buildPptCopyBlock(base) };
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Partial<ProposalSection>;
  } catch {
    return null;
  }
}

function normalizeProposalSection(
  ao: AoRecord,
  section: string,
  raw: Partial<ProposalSection> | null,
  fallbackContent: string,
  sources: string[]
): ProposalSection {
  const fallback = fallbackProposalSection(ao, section, fallbackContent, sources);
  const keyMessages = Array.isArray(raw?.keyMessages) && raw.keyMessages.length ? raw.keyMessages : fallback.keyMessages;
  const base = {
    section: raw?.section || section,
    content: raw?.content || raw?.bodyText || fallbackContent || fallback.content,
    slideTitle: raw?.slideTitle || fallback.slideTitle,
    keyMessages,
    bodyText: raw?.bodyText || raw?.content || fallback.bodyText,
    diagramTitle: raw?.diagramTitle || fallback.diagramTitle,
    diagramMermaid: raw?.diagramMermaid || fallback.diagramMermaid,
    sources: Array.isArray(raw?.sources) && raw.sources.length ? raw.sources : sources
  };
  return { ...base, pptCopyBlock: raw?.pptCopyBlock || buildPptCopyBlock(base) };
}

export async function generateWithGuardrails(input: GenerateInput) {
  if (!hasConfiguredLlm()) return fallbackText(input);

  const system = [
    "Tu es un assistant pour qualification d'appels d'offres.",
    "Réponds en français professionnel.",
    "N'invente aucun chiffre, aucune référence et aucun fait.",
    "Si une information manque, écris explicitement 'À confirmer' ou 'Non trouvé'.",
    "Cite toujours les sources internes reçues."
  ].join(" ");

  const text = await completeChat({
    system,
    user: JSON.stringify({
      task: input.task,
      ao: input.ao,
      context: input.context,
      sources: input.sources
    }),
    temperature: 0.2,
    maxOutputTokens: 4096
  });

  return text || fallbackText(input);
}

export async function generateQualificationRecommendation(ao: AoRecord, fiche: QualificationFiche) {
  if (!hasConfiguredLlm()) {
    const strengths = [
      fiche.contexte !== "À confirmer" ? "contexte client documenté" : "",
      fiche.perimetre !== "À confirmer" ? "périmètre identifié" : "",
      fiche.livrables !== "À confirmer" ? "livrables repérés" : "",
      fiche.criteres !== "À confirmer" ? "critères d’évaluation disponibles" : "",
      fiche.budget !== "À confirmer" && fiche.budget !== "NC" ? "budget ou éléments financiers présents" : ""
    ].filter(Boolean);
    const vigilance = fiche.pointsVigilance.length ? fiche.pointsVigilance : ["Budget, délai et critères à confirmer si absents du document."];
    const label = strengths.length >= 3 ? "WATCH à approfondir" : "À qualifier avant décision";
    return [
      `Recommandation : ${label}.`,
      `Arguments : ${strengths.length ? strengths.join("; ") : "informations structurantes encore insuffisantes"}.`,
      `Points de vigilance : ${vigilance.join("; ")}.`,
      `Sources utilisées : ${fiche.sources.join(", ")}.`
    ].join("\n");
  }

  return generateWithGuardrails({
    task: "Produire une recommandation GO/WATCH/NO GO argumentée pour la qualification.",
    ao,
    context: JSON.stringify(fiche),
    sources: ["Google Sheets AO", fiche.documentName || "Saisie qualification"]
  });
}

export async function generateProposalSection(ao: AoRecord, section: string, context: string): Promise<ProposalSection> {
  const sources = ["Google Sheets AO", "Fiche qualification", "Référentiels internes sourcés"];
  const content = await generateWithGuardrails({
    task: [
      `Rédiger la section de propale : ${section}`,
      "Si la section relève de la production offre, traiter explicitement les points suivants selon le libellé demandé : CV & références (sélection bench, format Sia, format AO), offre technique (cadrage, suivi, staffage, fermeture), offre financière (simulation, marges, groupement, freelance), revue & envoi (cross-check J+10-15, envoi J+16, relance J+17).",
      "Retourne exclusivement un objet JSON valide avec les clés suivantes :",
      "section, content, slideTitle, keyMessages, bodyText, diagramTitle, diagramMermaid, pptCopyBlock, sources.",
      "Le contenu doit être directement copiable dans PowerPoint.",
      "diagramMermaid doit être un schéma Mermaid simple en flowchart LR, avec des IDs sans espaces.",
      "N'invente aucun chiffre, aucune référence et aucun fait ; écris À confirmer lorsque l'information manque."
    ].join("\n"),
    ao,
    context,
    sources
  });
  return normalizeProposalSection(ao, section, extractJsonObject(content), content, sources);
}
