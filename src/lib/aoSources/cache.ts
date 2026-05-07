import fs from "node:fs/promises";
import path from "node:path";
import type { AoCachePayload } from "@/lib/aoSources/types";
import { dedupeCollectedAos } from "@/lib/aoSources/normalize";
import { activeAoSourceConnectors } from "@/lib/aoSources/registry";

const EMPTY_CACHE: AoCachePayload = {
  generatedAt: "",
  records: [],
  report: []
};

function cachePath() {
  return process.env.AO_CACHE_PATH || path.join(process.cwd(), "data", "ao-cache.json");
}

export async function readAoCache(): Promise<AoCachePayload> {
  try {
    const content = await fs.readFile(cachePath(), "utf8");
    const parsed = JSON.parse(content) as AoCachePayload;
    return {
      generatedAt: parsed.generatedAt || "",
      records: Array.isArray(parsed.records) ? parsed.records : [],
      report: Array.isArray(parsed.report) ? parsed.report : []
    };
  } catch {
    return EMPTY_CACHE;
  }
}

export async function writeAoCache(payload: AoCachePayload) {
  const filePath = cachePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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
  return payload;
}
