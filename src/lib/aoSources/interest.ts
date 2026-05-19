import type { AoRecord } from "@/lib/aoTypes";

const DEFAULT_INTEREST_KEYWORDS = [
  "architecture",
  "amoa",
  "conseil",
  "cyber",
  "data",
  "digital",
  "erp",
  "gouvernance",
  "pmo",
  "sap",
  "schema directeur",
  "si",
  "strategie",
  "transformation"
] as const;

const DEFAULT_INTEREST_STATUSES = ["A QUALIFIER", "BO", "P2P"] as const;

type InterestOptions = {
  keywords?: readonly string[];
  statuses?: readonly string[];
  minScore?: number;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function configuredList(envName: string) {
  return (process.env[envName] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function effectiveKeywords(options: InterestOptions) {
  return options.keywords?.length ? options.keywords : configuredList("AO_INTEREST_KEYWORDS").length ? configuredList("AO_INTEREST_KEYWORDS") : DEFAULT_INTEREST_KEYWORDS;
}

function effectiveStatuses(options: InterestOptions) {
  return options.statuses?.length ? options.statuses : configuredList("AO_INTEREST_STATUSES").length ? configuredList("AO_INTEREST_STATUSES") : DEFAULT_INTEREST_STATUSES;
}

export function scoreAoInterest(ao: AoRecord, options: InterestOptions = {}) {
  const haystack = normalize([ao.client, ao.sujet, ao.procedureType, ao.buyer, ao.raw?.Objet, ao.raw?.Description].filter(Boolean).join(" "));
  const keywordHits = effectiveKeywords(options).filter((keyword) => haystack.includes(normalize(keyword)));
  const statusAllowed = effectiveStatuses(options).includes(ao.statut);
  const hasSource = Boolean(ao.sourceUrl?.startsWith("http"));
  const deadlineSignal = typeof ao.delaiJours === "number" && ao.delaiJours >= 0 ? 10 : 0;
  const score = keywordHits.length * 20 + (statusAllowed ? 20 : 0) + (hasSource ? 10 : 0) + deadlineSignal;

  return {
    score,
    isInteresting: score >= (options.minScore ?? Number(process.env.AO_INTEREST_MIN_SCORE || 30)),
    reasons: [
      keywordHits.length ? `Mots-clés détectés : ${keywordHits.join(", ")}` : "",
      statusAllowed ? `Statut retenu : ${ao.statut}` : "",
      hasSource ? "URL source disponible" : "",
      deadlineSignal ? "Échéance exploitable" : ""
    ].filter(Boolean)
  };
}

export function selectInterestingAoRecords(records: AoRecord[], options: InterestOptions = {}) {
  return records
    .map((ao) => ({ ao, interest: scoreAoInterest(ao, options) }))
    .filter(({ interest }) => interest.isInteresting)
    .sort((a, b) => b.interest.score - a.interest.score)
    .map(({ ao, interest }) => ({ ...ao, raw: { ...ao.raw, "Score intérêt scraping": String(interest.score), "Raisons intérêt scraping": interest.reasons.join(" · ") } }));
}
