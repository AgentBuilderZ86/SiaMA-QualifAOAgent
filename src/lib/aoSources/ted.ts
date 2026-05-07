import type { AoSourceConnector, CollectedAo } from "@/lib/aoSources/types";
import { cleanText } from "@/lib/aoSources/normalize";
import { fetchWithTimeout, fieldFromObject, maxRecords, sourceResult } from "@/lib/aoSources/utils";

const SOURCE_NAME = "TED Europe";
const API_URL = "https://api.ted.europa.eu/v3/notices/search";

function rowsFromPayload(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["notices", "results", "data", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function textFromNested(row: unknown, candidates: string[]) {
  const direct = fieldFromObject(row, candidates);
  if (direct) return direct;
  if (!row || typeof row !== "object") return "";
  for (const value of Object.values(row as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const nested = fieldFromObject(value, candidates);
      if (nested) return nested;
    }
  }
  return "";
}

function mapRow(row: unknown, collectedAt: string): CollectedAo | null {
  const id = textFromNested(row, ["publication-number", "publicationNumber", "notice-number", "noticeId", "id"]);
  const title = textFromNested(row, ["title", "notice-title", "description"]);
  if (!id || !title) return null;
  const sourceUrl = textFromNested(row, ["uri", "url", "links"]);

  return {
    sourceKind: "public-api",
    sourceName: SOURCE_NAME,
    sourceUrl: sourceUrl.startsWith("http") ? sourceUrl : `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(id)}`,
    sourceNoticeId: id,
    title,
    buyer: textFromNested(row, ["buyer-name", "buyerName", "organisation-name", "organizationName"]) || "Client non renseigné",
    country: textFromNested(row, ["place-of-performance-country", "country", "buyer-country"]),
    publishedAt: textFromNested(row, ["publication-date", "publicationDate", "dispatch-date"]),
    deadline: textFromNested(row, ["deadline-receipt-tenders", "deadline", "submission-deadline"]),
    procedureType: textFromNested(row, ["procedure-type", "notice-type", "form-type"]),
    estimatedBudget: textFromNested(row, ["estimated-value", "total-value", "value"]),
    currency: textFromNested(row, ["currency"]),
    collectedAt,
    raw: Object.fromEntries(Object.entries((row as Record<string, unknown>) ?? {}).map(([key, value]) => [key, cleanText(value)]))
  };
}

export const tedConnector: AoSourceConnector = {
  name: SOURCE_NAME,
  kind: "public-api",
  homepage: "https://docs.ted.europa.eu/api/latest/search.html",
  async fetchAos() {
    const collectedAt = new Date().toISOString();
    const query = process.env.AO_TED_QUERY || "classification-cpv IN (72000000, 73000000, 79000000)";
    try {
      const response = await fetchWithTimeout(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          pagination: { limit: maxRecords(), offset: 0 },
          fields: [
            "publication-number",
            "notice-title",
            "buyer-name",
            "publication-date",
            "deadline-receipt-tenders",
            "place-of-performance-country",
            "procedure-type",
            "estimated-value",
            "currency"
          ]
        })
      });
      if (!response.ok) return sourceResult(SOURCE_NAME, [], [`HTTP ${response.status} sur ${API_URL}`]);
      const payload = await response.json();
      return sourceResult(SOURCE_NAME, rowsFromPayload(payload).map((row) => mapRow(row, collectedAt)));
    } catch (error) {
      return sourceResult(SOURCE_NAME, [], [error instanceof Error ? error.message : "Erreur inconnue TED"]);
    }
  }
};
