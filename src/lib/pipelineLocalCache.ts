import fs from "node:fs/promises";
import path from "node:path";
import type { SheetRow } from "@/lib/google";

type LocalPipelineStore = {
  updatedAt: string;
  rows: Record<string, SheetRow>;
};

const TMP_PATH = path.join("/tmp", "ao-pipeline-local.json");
const DATA_PATH = path.join(process.cwd(), "data", "ao-pipeline-local.json");

function shouldWriteToTmp() {
  if (process.env.PIPELINE_LOCAL_CACHE_PATH?.trim()) return false;
  if (process.env.NETLIFY === "true" || process.env.NETLIFY === "1") return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  const cwd = process.cwd();
  return cwd === "/var/task" || cwd.startsWith("/var/task/");
}

function writePathPrimary() {
  if (process.env.PIPELINE_LOCAL_CACHE_PATH?.trim()) return process.env.PIPELINE_LOCAL_CACHE_PATH.trim();
  return shouldWriteToTmp() ? TMP_PATH : DATA_PATH;
}

function readCandidates() {
  if (process.env.PIPELINE_LOCAL_CACHE_PATH?.trim()) return [process.env.PIPELINE_LOCAL_CACHE_PATH.trim()];
  return [TMP_PATH, DATA_PATH];
}

function emptyStore(): LocalPipelineStore {
  return { updatedAt: "", rows: {} };
}

async function readStore(): Promise<LocalPipelineStore> {
  for (const filePath of readCandidates()) {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as LocalPipelineStore;
      return {
        updatedAt: parsed.updatedAt || "",
        rows: parsed.rows && typeof parsed.rows === "object" ? parsed.rows : {}
      };
    } catch {
      /* candidat suivant */
    }
  }
  return emptyStore();
}

async function writeStore(store: LocalPipelineStore) {
  const body = `${JSON.stringify(store, null, 2)}\n`;
  const primary = writePathPrimary();
  const candidates = primary === TMP_PATH ? [TMP_PATH] : [primary, TMP_PATH];
  for (let i = 0; i < candidates.length; i += 1) {
    const filePath = candidates[i];
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, body, "utf8");
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (["EACCES", "EROFS", "EPERM", "ENOENT"].includes(String(code)) && i < candidates.length - 1) continue;
      throw e;
    }
  }
}

function normalizeAoKey(aoNum: string) {
  return String(aoNum || "").trim();
}

export async function readLocalPipelineRow(aoNum: string): Promise<SheetRow | null> {
  const key = normalizeAoKey(aoNum);
  if (!key) return null;
  const store = await readStore();
  return store.rows[key] ?? null;
}

export async function upsertLocalPipelineRow(aoNum: string, row: SheetRow) {
  const key = normalizeAoKey(aoNum);
  if (!key) return;
  const store = await readStore();
  store.rows[key] = { ...store.rows[key], ...row, "N° AO": key };
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
}
