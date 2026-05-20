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

export type CvProfileCoverage = {
  profile: string;
  icon: string;
  status: "required" | "missing";
  statusLabel: string;
  evidence: string;
};

export type CvScoringSummary = {
  score: number;
  status: CvScoringStatus;
  statusLabel: string;
  items: CvScoringItem[];
  requiredProfiles: string[];
  profileCoverage: CvProfileCoverage[];
};

export type UploadedCvForAdaptation = {
  name: string;
  text: string;
  warning?: string;
  targetRole?: string;
};

export type CvAdaptationRequirement = {
  requirement: string;
  matched: boolean;
  evidence: string;
  adaptation: string;
};

export type CvAdaptationResult = {
  cvName: string;
  targetRole: string;
  scoreBefore: number;
  scoreAfter: number;
  targetScore: number;
  adaptedTitle: string;
  adaptedSummary: string;
  rewrittenBlocks: Array<{ title: string; bullets: string[] }>;
  requirements: CvAdaptationRequirement[];
  warnings: string[];
  sourceExcerpt: string;
  generatedAt: string;
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

function lines(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8);
}

function compact(value: string, max = 220) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function keywordTokens(value: string) {
  return [
    ...new Set(
      normalize(value)
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4 && !["avec", "pour", "dans", "plus", "mission", "profil"].includes(token))
    )
  ];
}

function bestEvidence(cvLines: string[], requirement: string) {
  const tokens = keywordTokens(requirement);
  let best = "";
  let bestScore = 0;
  for (const line of cvLines) {
    const normalizedLine = normalize(line);
    const score = tokens.filter((token) => normalizedLine.includes(token)).length;
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }
  return bestScore > 0 ? compact(best) : "";
}

function evidenceLines(cvLines: string[], requirements: string[], fallbackTerms: string[]) {
  const terms = [...requirements.flatMap(keywordTokens), ...fallbackTerms.map(normalize)];
  const hits = cvLines.filter((line) => {
    const normalizedLine = normalize(line);
    return terms.some((term) => term && normalizedLine.includes(term));
  });
  return [...new Set(hits)].slice(0, 8).map((line) => compact(line, 180));
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

function iconForProfile(profile: string) {
  const normalized = normalize(profile);
  if (/(architect|urbanis|si|solution)/.test(normalized)) return "🧭";
  if (/(chef|directeur|manager|pmo|pilotage|projet)/.test(normalized)) return "📋";
  if (/(data|donnee|gouvernance|bi|analytics|mdm)/.test(normalized)) return "🧠";
  if (/(cyber|secur|risque|audit)/.test(normalized)) return "🛡️";
  if (/(finance|budget|controle|tjm)/.test(normalized)) return "💰";
  if (/(dev|develop|ingenieur|technique)/.test(normalized)) return "🛠️";
  return "👤";
}

function buildProfileCoverage(requiredProfiles: string[]): CvProfileCoverage[] {
  if (!requiredProfiles.length) {
    return [
      {
        profile: "Profils à confirmer",
        icon: "⚠️",
        status: "missing",
        statusLabel: "Non détecté",
        evidence: "Aucun profil requis n'a été isolé dans les documents chargés."
      }
    ];
  }

  return requiredProfiles.map((profile) => ({
    profile,
    icon: iconForProfile(profile),
    status: "required",
    statusLabel: "À couvrir",
    evidence: "Profil exigé extrait de la fiche qualification / documents AO."
  }));
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
    requiredProfiles,
    profileCoverage: buildProfileCoverage(requiredProfiles)
  };
}

export function buildCvAdaptation(
  ao: AoRecord,
  qualification: QualificationFiche | null | undefined,
  uploaded: UploadedCvForAdaptation
): CvAdaptationResult {
  const scoring = buildCvScoringSummary(ao, qualification);
  const cvText = text(uploaded.text);
  const cvLines = lines(cvText);
  const requirements = scoring.requiredProfiles.length
    ? scoring.requiredProfiles
    : splitRequirements(qualification?.profils, qualification?.criteres, qualification?.documentExtract).slice(0, 8);
  const normalizedCv = normalize(cvText);
  const requirementRows: CvAdaptationRequirement[] = requirements.map((requirement) => {
    const tokens = keywordTokens(requirement);
    const matchedTokens = tokens.filter((token) => normalizedCv.includes(token));
    const evidence = bestEvidence(cvLines, requirement);
    return {
      requirement,
      matched: matchedTokens.length > 0,
      evidence: evidence || "Aucune preuve textuelle détectée dans le CV uploadé.",
      adaptation: evidence
        ? `Reformuler autour de l'exigence "${requirement}" en s'appuyant sur : ${evidence}`
        : `Ne pas inventer : ajouter une preuve réelle ou marquer "${requirement}" comme non couvert.`
    };
  });
  const matchedRatio = requirementRows.length
    ? requirementRows.filter((row) => row.matched).length / requirementRows.length
    : cvText
      ? 0.25
      : 0;
  const scoreBefore = Math.round(matchedRatio * 100);
  const scoreAfter = Math.min(100, scoreBefore + (cvText ? 20 : 0) + (requirementRows.some((row) => row.evidence) ? 10 : 0));
  const role = text(uploaded.targetRole) || requirements[0] || "Profil à positionner";
  const experienceBullets = evidenceLines(cvLines, requirements, ["data", "si", "pmo", "gouvernance", "architecture", "projet"]);
  const referenceBullets = evidenceLines(cvLines, requirements, ["client", "reference", "référence", "projet", "mission", "secteur"]);
  const warnings = [
    uploaded.warning || "",
    cvText ? "" : "CV vide ou non lisible.",
    requirementRows.length ? "" : "Exigences AO insuffisantes : adaptation limitée aux informations disponibles.",
    ...requirementRows.filter((row) => !row.matched).map((row) => `Exigence non couverte par preuve CV : ${row.requirement}`)
  ].filter(Boolean);

  return {
    cvName: uploaded.name || "CV sans nom",
    targetRole: role,
    scoreBefore,
    scoreAfter,
    targetScore: 100,
    adaptedTitle: `${role} — CV adapté pour ${ao.client || "client"} / ${ao.displayAoNum || ao.aoNum}`,
    adaptedSummary: experienceBullets.length
      ? `Profil à positionner sur ${ao.sujet}. Les éléments ci-dessous reformulent uniquement des preuves présentes dans le CV uploadé pour répondre aux exigences AO détectées.`
      : "Adaptation limitée : aucune ligne probante exploitable n'a été détectée dans le CV uploadé.",
    rewrittenBlocks: [
      {
        title: "Accroche ciblée",
        bullets: experienceBullets.length
          ? experienceBullets.slice(0, 3).map((line) => `Mettre en avant pour l'AO : ${line}`)
          : ["À compléter avec une preuve réelle issue du CV."]
      },
      {
        title: "Expériences à prioriser",
        bullets: experienceBullets.length ? experienceBullets.slice(0, 5).map((line) => `Reformulation proposée : ${line}`) : ["Aucune expérience pertinente détectée automatiquement."]
      },
      {
        title: "Références et preuves",
        bullets: referenceBullets.length ? referenceBullets.slice(0, 4).map((line) => `Preuve à citer : ${line}`) : ["Références similaires à confirmer sans invention."]
      },
      {
        title: "Adaptations format AO",
        bullets: scoring.items.find((item) => item.id === "ao-format")?.adaptations ?? []
      }
    ],
    requirements: requirementRows,
    warnings,
    sourceExcerpt: cvLines.slice(0, 12).map((line) => compact(line, 180)).join("\n"),
    generatedAt: new Date().toISOString()
  };
}
