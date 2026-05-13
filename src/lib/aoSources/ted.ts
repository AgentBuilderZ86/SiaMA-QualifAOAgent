import type { AoSourceConnector, CollectedAo } from "@/lib/aoSources/types";
import { cleanText } from "@/lib/aoSources/normalize";
import { fetchWithTimeout, maxRecords, sourceResult } from "@/lib/aoSources/utils";

const SOURCE_NAME = "TED Europe";
const API_URL = "https://api.ted.europa.eu/v3/notices/search";

/** Champs supportés par l’API v3 (cf. réponse 400 « unsupported value ») — pas de `pagination` : utiliser `page` + `limit`. */
const TED_SEARCH_FIELDS = [
  "publication-number",
  "links",
  "organisation-name-buyer",
  "organisation-country-buyer",
  "BT-21-Part",
  "BT-131(t)-Lot",
  "BT-24-Part",
  "result-framework-maximum-value-cur-notice"
] as const;

function rowsFromPayload(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["notices", "results", "data", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

/** Extrait du texte depuis structures TED (chaînes, tableaux, objets par langue). */
function tedDeepText(value: unknown, maxLen = 800): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return cleanText(String(value)).slice(0, maxLen);
  }
  if (Array.isArray(value)) {
    const joined = value.map((v) => tedDeepText(v, maxLen)).filter(Boolean).join(" · ");
    return joined.slice(0, maxLen);
  }
  if (typeof value === "object") {
    const joined = Object.values(value as Record<string, unknown>)
      .map((v) => tedDeepText(v, maxLen))
      .filter(Boolean)
      .join(" · ");
    return joined.slice(0, maxLen);
  }
  return "";
}

function tedHtmlDetailUrl(links: unknown): string {
  if (!links || typeof links !== "object") return "";
  const html = (links as Record<string, unknown>).html;
  if (!html || typeof html !== "object") return "";
  const h = html as Record<string, string>;
  return h.FRA || h.ENG || h.DEU || Object.values(h).find((u) => typeof u === "string" && u.startsWith("http")) || "";
}

/** Réduit `links` (énorme objet multilingue) pour le champ `raw` du cache. */
function trimTedLinksForRaw(links: unknown): unknown {
  if (!links || typeof links !== "object") return links;
  const L = links as Record<string, unknown>;
  const html = L.html;
  if (!html || typeof html !== "object") return { html: {} };
  const h = html as Record<string, string>;
  return { html: { FRA: h.FRA, ENG: h.ENG } };
}

function mapRow(row: unknown, collectedAt: string): CollectedAo | null {
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  const id = cleanText(rec["publication-number"]);
  if (!id) return null;

  const titleFromBt21 = tedDeepText(rec["BT-21-Part"], 600);
  const title = titleFromBt21 || `Avis TED ${id}`;
  const sourceUrl = tedHtmlDetailUrl(rec.links);
  const buyer =
    tedDeepText(rec["organisation-name-buyer"], 400) || "Client non renseigné";
  const country = tedDeepText(rec["organisation-country-buyer"], 120);
  const publishedAt = tedDeepText(rec["BT-24-Part"], 120);
  const deadline = tedDeepText(rec["BT-131(t)-Lot"], 120);
  const estimatedBudget = tedDeepText(rec["result-framework-maximum-value-cur-notice"], 120);

  const safeJson = (v: unknown) => {
    try {
      return cleanText(JSON.stringify(v ?? null)).slice(0, 12_000);
    } catch {
      return "";
    }
  };

  return {
    sourceKind: "public-api",
    sourceName: SOURCE_NAME,
    sourceUrl: sourceUrl || `https://ted.europa.eu/fr/notice/-/detail/${encodeURIComponent(id)}`,
    sourceNoticeId: id,
    title,
    buyer,
    country: country || "",
    publishedAt: publishedAt || "",
    deadline: deadline || "",
    procedureType: "",
    estimatedBudget: estimatedBudget || "",
    currency: "",
    collectedAt,
    raw: {
      "publication-number": id,
      links: safeJson(trimTedLinksForRaw(rec.links)),
      "BT-21-Part": safeJson(rec["BT-21-Part"]),
      "organisation-name-buyer": safeJson(rec["organisation-name-buyer"]),
      "organisation-country-buyer": safeJson(rec["organisation-country-buyer"]),
      "BT-131(t)-Lot": safeJson(rec["BT-131(t)-Lot"]),
      "BT-24-Part": safeJson(rec["BT-24-Part"]),
      "result-framework-maximum-value-cur-notice": safeJson(rec["result-framework-maximum-value-cur-notice"])
    }
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
          page: 1,
          limit: maxRecords(),
          fields: [...TED_SEARCH_FIELDS]
        })
      });
      if (!response.ok) return sourceResult(SOURCE_NAME, [], [`HTTP ${response.status} sur ${API_URL}`]);
      const payload = await response.json();
      return sourceResult(SOURCE_NAME, rowsFromPayload(payload).map((r) => mapRow(r, collectedAt)));
    } catch (error) {
      return sourceResult(SOURCE_NAME, [], [error instanceof Error ? error.message : "Erreur inconnue TED"]);
    }
  }
};
