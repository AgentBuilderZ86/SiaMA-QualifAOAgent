import type { AoSourceConnector, CollectedAo } from "@/lib/aoSources/types";
import { cleanText } from "@/lib/aoSources/normalize";
import { fetchWithTimeout, fieldFromObject, maxRecords, sourceResult } from "@/lib/aoSources/utils";

const SOURCE_NAME = "World Bank Procurement Notices";
const API_URL = "https://search.worldbank.org/api/procnotices";

function rowsFromPayload(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["procnotices", "notices", "rows", "data", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value as Record<string, unknown>);
  }
  return [];
}

function mapRow(row: unknown, collectedAt: string): CollectedAo | null {
  const id = fieldFromObject(row, ["id", "noticeid", "notice_id", "guid", "url"]);
  const title = fieldFromObject(row, ["title", "notice_title", "procurement_method", "project_name"]);
  const sourceUrl = fieldFromObject(row, ["url", "notice_url", "link"]);
  const buyer = fieldFromObject(row, ["borrower", "agency", "implementing_agency", "organization", "project_name"]);
  if (!id || !title) return null;

  return {
    sourceKind: "public-api",
    sourceName: SOURCE_NAME,
    sourceUrl: sourceUrl || `${API_URL}?format=json&id=${encodeURIComponent(id)}`,
    sourceNoticeId: id,
    title,
    buyer: buyer || "Client non renseigné",
    country: fieldFromObject(row, ["country", "countryname", "borrower_country"]),
    publishedAt: fieldFromObject(row, ["notice_date", "published_date", "publication_date", "date"]),
    deadline: fieldFromObject(row, ["submission_deadline_date", "deadline", "closing_date"]),
    procedureType: fieldFromObject(row, ["notice_type", "procurement_method", "method"]),
    estimatedBudget: fieldFromObject(row, ["amount", "contract_amount", "estimated_amount"]),
    currency: fieldFromObject(row, ["currency"]),
    collectedAt,
    raw: Object.fromEntries(Object.entries((row as Record<string, unknown>) ?? {}).map(([key, value]) => [key, cleanText(value)]))
  };
}

export const worldBankConnector: AoSourceConnector = {
  name: SOURCE_NAME,
  kind: "public-api",
  homepage: "https://datacatalog.worldbank.org/search/dataset/0037795/world-bank-procurement-notices",
  async fetchAos() {
    const collectedAt = new Date().toISOString();
    try {
      const url = `${API_URL}?format=json&rows=${maxRecords()}&os=0`;
      const response = await fetchWithTimeout(url);
      if (!response.ok) return sourceResult(SOURCE_NAME, [], [`HTTP ${response.status} sur ${url}`]);
      const payload = await response.json();
      return sourceResult(SOURCE_NAME, rowsFromPayload(payload).map((row) => mapRow(row, collectedAt)));
    } catch (error) {
      return sourceResult(SOURCE_NAME, [], [error instanceof Error ? error.message : "Erreur inconnue World Bank"]);
    }
  }
};
