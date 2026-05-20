import type { AoRecord, QualificationFiche } from "@/lib/aoTypes";

export type CvScoringStatus = "covered" | "attention" | "missing";

export type CvScoringItem = {
  id: "required-profiles" | "similar-references" | "sia-format" | "ao-format";
  label: string;
  score: number;
  status: CvScoringStatus;
  evidence: string;
  adaptations: string[];
};

export type CvScoringSummary = {
  score: number;
  status: CvScoringStatus;
  statusLabel: string;
  items: CvScoringItem[];
  requiredProfiles: string[];
};

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function includesAny(haystack: string, needles: string[]) {
  const normalized = normalize(haystack);
  return needles.some((needle) => normalized.includes(normalize(needle)));
}

export function parseQualificationForCvScoring(raw: unknown): QualificationFiche | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as QualificationFiche;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function splitRequirements(...values: unknown[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => text(value).split(/\n|;|,|·|\|/g))
        .map((item) => item.replace(/^[-•\d.)\s]+/, "").trim())
        .filter((item) => item.length >= 4)
        .slice(0, 12)
    )
  ];
}

function proposalHasCvSection(ao: AoRecord) {
  const raw = text(ao.raw?.["Sections propale"]);
  return includesAny(raw, ["Équipe et références", "CV & références", "references", "curriculum", "profil"]);
}

function scoreStatus(score: number): CvScoringStatus {
  if (score >= 80) return "covered";
  if (score >= 40) return "attention";
  return "missing";
}

function item(params: Omit<CvScoringItem, "status">): CvScoringItem {
  return {
    ...params,
    status: scoreStatus(params.score)
  };
}

export function buildCvScoringSummary(ao: AoRecord, qualification?: QualificationFiche | null): CvScoringSummary {
  const fiche = qualification ?? parseQualificationForCvScoring(ao.raw?.["Fiche qualification"]);
  const intelligence = fiche?.intelligence;
  const documentText = text(fiche?.documentExtract);
  const profileText = [fiche?.profils, fiche?.criteres, ...(intelligence?.requiredProfile ?? [])].filter(Boolean).join("\n");
  const requiredProfiles = splitRequirements(fiche?.profils, ...(intelligence?.requiredProfile ?? []));
  const hasProfiles = requiredProfiles.length > 0 && !includesAny(requiredProfiles.join(" "), ["à confirmer", "non trouve"]);
  const hasReferencesRequirement = includesAny(`${documentText}\n${fiche?.criteres || ""}`, [
    "références similaires",
    "references similaires",
    "expériences similaires",
    "experiences similaires",
    "attestation de référence",
    "attestations de reference"
  ]);
  const hasCvFormat = includesAny(documentText, ["format cv", "modèle cv", "modele cv", "annexe cv", "curriculum vitae"]);
  const hasAoFormat = includesAny(documentText, ["format imposé", "format impose", "cadre de réponse", "cadre de reponse", "annexe", "bordereau"]);
  const cvSectionDone = proposalHasCvSection(ao);

  const items: CvScoringItem[] = [
    item({
      id: "required-profiles",
      label: "Profils requis",
      score: cvSectionDone && hasProfiles ? 100 : hasProfiles ? 65 : 20,
      evidence: hasProfiles ? requiredProfiles.slice(0, 4).join(" · ") : "Profils requis non isolés dans les données AO.",
      adaptations: [
        "Mapper chaque profil requis vers un CV bench disponible.",
        "Aligner intitulé, séniorité, rôle et mots-clés du CV sur le RC/CPS.",
        "Signaler tout profil manquant avant génération finale."
      ]
    }),
    item({
      id: "similar-references",
      label: "Références similaires",
      score: cvSectionDone && hasReferencesRequirement ? 100 : hasReferencesRequirement ? 60 : 35,
      evidence: hasReferencesRequirement ? "Exigence de références similaires détectée dans le document." : "Aucune exigence explicite de références similaires détectée.",
      adaptations: [
        "Associer 2 à 3 références comparables par secteur, mission et complexité.",
        "Conserver uniquement des références vérifiables et sourcées en interne.",
        "Préparer une version courte si le format AO limite la taille."
      ]
    }),
    item({
      id: "sia-format",
      label: "Format Sia",
      score: cvSectionDone ? 75 : 35,
      evidence: cvSectionDone ? "Section CV/références présente dans la propale." : "Section CV/références non générée.",
      adaptations: [
        "Préparer un format Sia homogène : titre, expertise, expériences, références.",
        "Limiter les éléments non pertinents pour garder une lecture AO directe.",
        "Contrôler cohérence avec le staffing proposé."
      ]
    }),
    item({
      id: "ao-format",
      label: "Format AO",
      score: hasAoFormat || hasCvFormat ? 65 : 30,
      evidence: hasAoFormat || hasCvFormat ? "Contrainte de format ou annexe détectée." : "Format AO spécifique non détecté automatiquement.",
      adaptations: [
        "Vérifier si le RC/CPS impose une annexe CV ou un cadre de réponse.",
        "Adapter les rubriques au format acheteur sans changer les faits.",
        "Documenter les champs impossibles à renseigner plutôt que les inventer."
      ]
    })
  ];

  const score = Math.round(items.reduce((sum, entry) => sum + entry.score, 0) / items.length);
  const status = scoreStatus(score);
  return {
    score,
    status,
    statusLabel: status === "covered" ? "CV prêts" : status === "attention" ? "Adaptations à finaliser" : "À cadrer",
    items,
    requiredProfiles
  };
}
