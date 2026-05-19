import fs from "node:fs/promises";
import path from "node:path";
import type { AoRecord } from "@/lib/aoTypes";
import { selectInterestingAoRecords } from "@/lib/aoSources/interest";
import {
  discoverAoDocumentCandidates,
  downloadAndExtractAoDocument,
  type AoDocumentCandidate,
  type AoDocumentExtraction
} from "@/lib/aoSources/documentLinks";

export type AoDocumentCachePayload = {
  generatedAt: string;
  documents: AoDocumentExtraction[];
  report: Array<{ aoNum: string; sourceUrl: string; discovered: number; extracted: number; errors: string[] }>;
};

const EMPTY_DOCUMENT_CACHE: AoDocumentCachePayload = {
  generatedAt: "",
  documents: [],
  report: []
};

const TMP_DOCUMENT_CACHE = path.join("/tmp", "ao-documents-cache.json");

function bundledDocumentCachePath() {
  return path.join(process.cwd(), "data", "ao-documents-cache.json");
}

function shouldWriteCacheToTmp() {
  if (process.env.AO_DOCUMENT_CACHE_PATH?.trim()) return false;
  if (process.env.NETLIFY === "true" || process.env.NETLIFY === "1") return true;
  if (Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)) return true;
  const cwd = process.cwd();
  return cwd === "/var/task" || cwd.startsWith("/var/task/");
}

function documentCacheWritePathPrimary() {
  if (process.env.AO_DOCUMENT_CACHE_PATH?.trim()) return process.env.AO_DOCUMENT_CACHE_PATH.trim();
  if (shouldWriteCacheToTmp()) return TMP_DOCUMENT_CACHE;
  return bundledDocumentCachePath();
}

function documentCacheReadCandidates() {
  if (process.env.AO_DOCUMENT_CACHE_PATH?.trim()) return [process.env.AO_DOCUMENT_CACHE_PATH.trim()];
  return [TMP_DOCUMENT_CACHE, bundledDocumentCachePath()];
}

function parseDocumentCache(content: string): AoDocumentCachePayload {
  const parsed = JSON.parse(content) as AoDocumentCachePayload;
  return {
    generatedAt: parsed.generatedAt || "",
    documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    report: Array.isArray(parsed.report) ? parsed.report : []
  };
}

export async function readAoDocumentCache(): Promise<AoDocumentCachePayload> {
  for (const filePath of documentCacheReadCandidates()) {
    try {
      return parseDocumentCache(await fs.readFile(filePath, "utf8"));
    } catch {
      /* essayer le candidat suivant */
    }
  }
  return EMPTY_DOCUMENT_CACHE;
}

export async function writeAoDocumentCache(payload: AoDocumentCachePayload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const primary = documentCacheWritePathPrimary();
  const candidates = primary === TMP_DOCUMENT_CACHE ? [TMP_DOCUMENT_CACHE] : [primary, TMP_DOCUMENT_CACHE];

  for (let i = 0; i < candidates.length; i++) {
    const filePath = candidates[i];
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, body, "utf8");
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (["EACCES", "EROFS", "EPERM", "ENOENT"].includes(String(code)) && i < candidates.length - 1) continue;
      throw error;
    }
  }
}

function maxDocumentsPerAo() {
  const configured = Number(process.env.AO_DOCUMENT_MAX_PER_AO || 3);
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

async function extractCandidates(candidates: AoDocumentCandidate[]) {
  const documents: AoDocumentExtraction[] = [];
  const errors: string[] = [];
  for (const candidate of candidates.slice(0, maxDocumentsPerAo())) {
    try {
      documents.push(await downloadAndExtractAoDocument(candidate));
    } catch (error) {
      errors.push(`${candidate.documentUrl}: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    }
  }
  return { documents, errors };
}

export async function refreshAoDocumentCache(records: AoRecord[]): Promise<AoDocumentCachePayload> {
  const interesting = selectInterestingAoRecords(records);
  const documents: AoDocumentExtraction[] = [];
  const report: AoDocumentCachePayload["report"] = [];

  for (const ao of interesting) {
    const errors: string[] = [];
    let candidates: AoDocumentCandidate[] = [];
    try {
      candidates = await discoverAoDocumentCandidates(ao);
      const extracted = await extractCandidates(candidates);
      documents.push(...extracted.documents);
      errors.push(...extracted.errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Erreur inconnue");
    }
    report.push({
      aoNum: ao.aoNum,
      sourceUrl: ao.sourceUrl || "",
      discovered: candidates.length,
      extracted: documents.filter((document) => document.aoNum === ao.aoNum).length,
      errors
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    documents,
    report
  };
  await writeAoDocumentCache(payload);
  return payload;
}
