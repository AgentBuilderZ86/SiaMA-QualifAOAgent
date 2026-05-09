import type { AoRecord } from "@/lib/aoTypes";
import { mergeAoRecords } from "@/lib/aoTypes";

/** Clé stable pour corréler source / pipeline / URL (casse, accents, espaces). */
export function normalizeAoLookupKey(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function lookupKeysForAo(ao: AoRecord): string[] {
  const keys = new Set<string>();
  const a = normalizeAoLookupKey(ao.aoNum);
  const d = normalizeAoLookupKey(ao.displayAoNum);
  if (a) keys.add(a);
  if (d) keys.add(d);
  return [...keys];
}

export function buildPipelineByAoLookup(pipelineRecords: AoRecord[]): Map<string, AoRecord> {
  const map = new Map<string, AoRecord>();
  for (const p of pipelineRecords) {
    for (const k of lookupKeysForAo(p)) {
      if (k) map.set(k, p);
    }
  }
  return map;
}

export function findPipelineRowForSource(source: AoRecord, pipelineByKey: Map<string, AoRecord>): AoRecord | null {
  for (const k of lookupKeysForAo(source)) {
    const hit = pipelineByKey.get(k);
    if (hit) return hit;
  }
  return null;
}

function primaryDedupeKey(ao: AoRecord): string | null {
  const a = normalizeAoLookupKey(ao.aoNum);
  if (a) return a;
  const d = normalizeAoLookupKey(ao.displayAoNum);
  return d || null;
}

/** Une entrée par N° AO / displayAoNum canonique (première occurrence conservée). */
export function dedupeByPrimaryAoKey(records: AoRecord[]): AoRecord[] {
  const seen = new Set<string>();
  const out: AoRecord[] = [];
  for (const r of records) {
    const key = primaryDedupeKey(r);
    if (!key) {
      out.push(r);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Fusionne les lignes des onglets source (AQ, EC, NG) avec l’onglet pipeline :
 * même logique que `findAo` → statut / manager pipeline prioritaires.
 * Ajoute les lignes pipeline orphelines (pas de ligne source correspondante).
 */
export function mergeSourcesWithPipelineTab(sourceTabRecords: AoRecord[], pipelineTabRecords: AoRecord[]): AoRecord[] {
  const pipelineByKey = buildPipelineByAoLookup(pipelineTabRecords);
  const consumedPipelineKeys = new Set<string>();

  const merged: AoRecord[] = [];

  for (const source of sourceTabRecords) {
    const pipe = findPipelineRowForSource(source, pipelineByKey);
    if (pipe) {
      for (const k of lookupKeysForAo(pipe)) consumedPipelineKeys.add(k);
    }
    merged.push(mergeAoRecords(source, pipe)!);
  }

  for (const p of pipelineTabRecords) {
    const keys = lookupKeysForAo(p);
    if (keys.some((k) => consumedPipelineKeys.has(k))) continue;
    const num = String(p.aoNum || "").trim();
    if (!num || num === "NC") continue;
    merged.push(mergeAoRecords(null, p)!);
  }

  return dedupeByPrimaryAoKey(merged);
}

/** Applique la même fusion pipeline qu’en liste Sheets pour un AO scrappé. */
export function mergeScrapedWithPipeline(scraped: AoRecord[], pipelineByKey: Map<string, AoRecord>): AoRecord[] {
  return scraped.map((s) => mergeAoRecords(s, findPipelineRowForSource(s, pipelineByKey))!);
}
