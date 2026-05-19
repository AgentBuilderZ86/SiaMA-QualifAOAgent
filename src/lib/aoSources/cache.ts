import fs from "node:fs/promises";
import path from "node:path";
import type { AoCachePayload } from "@/lib/aoSources/types";
import { collectedAoToRecord, dedupeCollectedAos } from "@/lib/aoSources/normalize";
import { activeAoSourceConnectors } from "@/lib/aoSources/registry";
import { refreshAoDocumentCache } from "@/lib/aoSources/documentCache";

const EMPTY_CACHE: AoCachePayload = {
  generatedAt: "",
  records: [],
  report: []
};

function bundledCachePath() {
  return path.join(process.cwd(), "data", "ao-cache.json");
}

const TMP_CACHE = path.join("/tmp", "ao-cache.json");

/** Netlify / Lambda : pas d’écriture fiable sous `process.cwd()` (souvent `/var/task`). */
function shouldWriteCacheToTmp() {
  if (process.env.AO_CACHE_PATH?.trim()) return false;
  if (process.env.NETLIFY === "true" || process.env.NETLIFY === "1") return true;
  if (Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)) return true;
  const cwd = process.cwd();
  return cwd === "/var/task" || cwd.startsWith("/var/task/");
}

/** Cible d’écriture préférée (sans AO_CACHE_PATH : `data/` en local ; serverless → `/tmp`). */
function cacheWritePathPrimary() {
  if (process.env.AO_CACHE_PATH?.trim()) return process.env.AO_CACHE_PATH.trim();
  if (shouldWriteCacheToTmp()) return TMP_CACHE;
  return bundledCachePath();
}

/** Ordre de lecture : cache chaud (`/tmp`) puis snapshot versionné (`data/`). */
function cacheReadCandidates(): string[] {
  if (process.env.AO_CACHE_PATH?.trim()) return [process.env.AO_CACHE_PATH.trim()];
  return [TMP_CACHE, bundledCachePath()];
}

function parseCachePayload(content: string): AoCachePayload {
  const parsed = JSON.parse(content) as AoCachePayload;
  return {
    generatedAt: parsed.generatedAt || "",
    records: Array.isArray(parsed.records) ? parsed.records : [],
    report: Array.isArray(parsed.report) ? parsed.report : []
  };
}

export async function readAoCache(): Promise<AoCachePayload> {
  for (const filePath of cacheReadCandidates()) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return parseCachePayload(content);
    } catch {
      /* essayer le candidat suivant */
    }
  }
  return EMPTY_CACHE;
}

function isWriteRetryableErr(code: string | undefined) {
  /** ENOENT : ex. mkdir sur `/var/task/data` quand l’arborescence n’est pas créable côté serverless. */
  return code === "EACCES" || code === "EROFS" || code === "EPERM" || code === "ENOENT";
}

export async function writeAoCache(payload: AoCachePayload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const primary = cacheWritePathPrimary();
  const candidates = primary === TMP_CACHE ? [TMP_CACHE] : [primary, TMP_CACHE];

  for (let i = 0; i < candidates.length; i++) {
    const filePath = candidates[i];
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, body, "utf8");
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      const canRetry = isWriteRetryableErr(code) && i < candidates.length - 1;
      if (canRetry) continue;
      throw e;
    }
  }
}

export async function refreshAoCache(): Promise<AoCachePayload> {
  const results = await Promise.all(activeAoSourceConnectors().map((connector) => connector.fetchAos()));
  const records = dedupeCollectedAos(results.flatMap((result) => result.records));
  const payload: AoCachePayload = {
    generatedAt: new Date().toISOString(),
    records,
    report: results.map((result) => ({
      sourceName: result.sourceName,
      collectedAt: result.collectedAt,
      count: result.records.length,
      errors: result.errors
    }))
  };
  await writeAoCache(payload);
  if (process.env.AO_DOCUMENT_SCRAPE_ON_REFRESH === "true") {
    await refreshAoDocumentCache(records.map(collectedAoToRecord));
  }
  return payload;
}
