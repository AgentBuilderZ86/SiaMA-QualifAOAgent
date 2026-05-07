import type { AoDataQuality, AoRecord } from "@/lib/aoTypes";
import type { CollectedAo } from "@/lib/aoSources/types";

const REQUIRED_FIELDS: Array<keyof Pick<CollectedAo, "sourceUrl" | "sourceNoticeId" | "title" | "buyer" | "deadline">> = [
  "sourceUrl",
  "sourceNoticeId",
  "title",
  "buyer",
  "deadline"
];

export function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableId(sourceName: string, sourceNoticeId: string) {
  return `${sourceName}:${sourceNoticeId}`.replace(/\s+/g, "-");
}

export function calculateDeadlineDays(deadline: string, now = new Date()) {
  const parsed = Date.parse(deadline);
  if (Number.isNaN(parsed)) return null;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.UTC(new Date(parsed).getUTCFullYear(), new Date(parsed).getUTCMonth(), new Date(parsed).getUTCDate());
  return Math.ceil((end - start) / 86_400_000);
}

export function assessQuality(ao: CollectedAo): AoDataQuality {
  const missingFields = REQUIRED_FIELDS.filter((field) => !cleanText(ao[field]));
  const warnings = [...(ao.dataQuality?.warnings ?? [])];
  if (!ao.sourceUrl.startsWith("http")) warnings.push("URL source non exploitable");
  if (!ao.deadline) warnings.push("Date limite absente de la source");
  if (!ao.estimatedBudget) warnings.push("Budget non publié par la source");

  const completenessScore = Math.max(0, Math.round(((REQUIRED_FIELDS.length - missingFields.length) / REQUIRED_FIELDS.length) * 100));
  return { completenessScore, missingFields: missingFields.map(String), warnings: [...new Set(warnings)] };
}

export function normalizeCollectedAo(ao: CollectedAo): CollectedAo | null {
  const normalized: CollectedAo = {
    ...ao,
    sourceName: cleanText(ao.sourceName),
    sourceUrl: cleanText(ao.sourceUrl),
    sourceNoticeId: cleanText(ao.sourceNoticeId),
    title: cleanText(ao.title),
    buyer: cleanText(ao.buyer),
    country: cleanText(ao.country) || "Non renseigné",
    publishedAt: cleanText(ao.publishedAt),
    deadline: cleanText(ao.deadline),
    procedureType: cleanText(ao.procedureType),
    estimatedBudget: cleanText(ao.estimatedBudget),
    currency: cleanText(ao.currency),
    collectedAt: cleanText(ao.collectedAt) || new Date().toISOString(),
    raw: ao.raw
  };
  normalized.dataQuality = assessQuality(normalized);
  if (!normalized.sourceUrl || !normalized.sourceNoticeId || !normalized.sourceUrl.startsWith("http")) return null;
  return normalized;
}

export function dedupeCollectedAos(records: CollectedAo[]) {
  const byStrictKey = new Map<string, CollectedAo>();
  for (const ao of records) {
    const normalized = normalizeCollectedAo(ao);
    if (!normalized) continue;
    const strictKey = `${normalized.sourceName}:${normalized.sourceNoticeId}`.toLowerCase();
    const softKey = `${normalized.buyer}:${normalized.title}:${normalized.deadline}`.toLowerCase();
    if ([...byStrictKey.values()].some((existing) => `${existing.buyer}:${existing.title}:${existing.deadline}`.toLowerCase() === softKey)) {
      continue;
    }
    byStrictKey.set(strictKey, normalized);
  }
  return [...byStrictKey.values()];
}

export function collectedAoToRecord(ao: CollectedAo): AoRecord {
  const quality = assessQuality(ao);
  return {
    aoNum: stableId(ao.sourceName, ao.sourceNoticeId),
    displayAoNum: ao.sourceNoticeId,
    client: ao.buyer || "Client non renseigné",
    sujet: ao.title || "Sujet non renseigné",
    manager: "Non assigné",
    budget: ao.estimatedBudget || "NC",
    delaiJours: calculateDeadlineDays(ao.deadline),
    dateLimite: ao.deadline,
    decisionIa: "",
    justificationIa: "",
    statut: "A QUALIFIER",
    sourceTab: ao.sourceName,
    sourceKind: ao.sourceKind,
    sourceName: ao.sourceName,
    sourceUrl: ao.sourceUrl,
    sourceNoticeId: ao.sourceNoticeId,
    publishedAt: ao.publishedAt,
    collectedAt: ao.collectedAt,
    country: ao.country,
    buyer: ao.buyer,
    procedureType: ao.procedureType,
    estimatedBudget: ao.estimatedBudget,
    currency: ao.currency,
    dataQuality: quality,
    raw: ao.raw
  };
}
