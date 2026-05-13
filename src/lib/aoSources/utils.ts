import type { AoSourceRunResult, CollectedAo } from "@/lib/aoSources/types";
import { cleanText, normalizeCollectedAo } from "@/lib/aoSources/normalize";

export const DEFAULT_TIMEOUT_MS = 12_000;
export const DEFAULT_MAX_RECORDS = 50;

/** Timeout HTTP des connecteurs (Netlify : garder une marge sous la limite de la fonction serverless). */
export function resolveFetchTimeoutMs(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) return override;
  const fromEnv = Number(process.env.AO_FETCH_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (process.env.NETLIFY === "true") return 8_000;
  return DEFAULT_TIMEOUT_MS;
}

export function maxRecords() {
  const configured = Number(process.env.AO_SOURCE_MAX_PER_SOURCE || DEFAULT_MAX_RECORDS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_RECORDS;
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs?: number) {
  const ms = resolveFetchTimeoutMs(timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "SiaMA-QualifAOAgent/0.1 (+source verification)",
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        ...(init.headers ?? {})
      },
      next: { revalidate: 0 }
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function sourceResult(sourceName: string, records: Array<CollectedAo | null>, errors: string[] = []): AoSourceRunResult {
  return {
    sourceName,
    collectedAt: new Date().toISOString(),
    records: records.flatMap((record) => {
      const normalized = record ? normalizeCollectedAo(record) : null;
      return normalized ? [normalized] : [];
    }),
    errors
  };
}

export function fieldFromObject(value: unknown, candidates: string[]) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const candidate of candidates) {
    const direct = cleanText(record[candidate]);
    if (direct) return direct;
    const lowerKey = Object.keys(record).find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (lowerKey) {
      const lowerValue = cleanText(record[lowerKey]);
      if (lowerValue) return lowerValue;
    }
  }
  return "";
}

export function stripHtml(value: string) {
  return cleanText(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

export function absoluteUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

export function extractPublicNoticeLinks(html: string, baseUrl: string) {
  const links = new Map<string, string>();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html))) {
    const href = absoluteUrl(baseUrl, match[1]);
    const label = stripHtml(match[2]);
    const searchable = `${href} ${label}`.toLowerCase();
    if (!href || !href.startsWith("http")) continue;
    if (!/(appel|offre|ao-|tender|procurement|sourcing|consultation|march[eé])/.test(searchable)) continue;
    links.set(href, label || href);
  }
  return [...links.entries()].map(([url, label]) => ({ url, label }));
}
