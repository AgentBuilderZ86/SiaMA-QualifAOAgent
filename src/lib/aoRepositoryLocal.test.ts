import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AoRecord } from "@/lib/aoTypes";

vi.mock("@/lib/google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google")>();
  return {
    ...actual,
    getSheetsConfigStatus: () => ({ configured: false, missing: ["GOOGLE_SHEET_ID"], authMode: "missing" as const }),
    ensureSheet: vi.fn(),
    readSheetWithMeta: vi.fn(),
    appendRow: vi.fn(),
    updateRow: vi.fn()
  };
});

function ao(): AoRecord {
  return {
    aoNum: "AO-SHEETLESS",
    displayAoNum: "AO-SHEETLESS",
    client: "Client test",
    sujet: "Mission test",
    manager: "Manager",
    budget: "NC",
    delaiJours: 10,
    dateLimite: "2026-12-01",
    decisionIa: "",
    justificationIa: "",
    statut: "A QUALIFIER",
    sourceTab: "Scraped",
    raw: {}
  };
}

describe("GoogleSheetsAoRepository sans GOOGLE_SHEET_ID", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ao-repo-local-"));
    process.env.PIPELINE_LOCAL_CACHE_PATH = path.join(tmpDir, "cache.json");
  });

  afterEach(async () => {
    delete process.env.PIPELINE_LOCAL_CACHE_PATH;
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("upsertPipeline n'explose pas et écrit en cache local", async () => {
    const { aoRepository } = await import("@/lib/aoRepository");
    await aoRepository.upsertPipeline(ao(), "BO", {
      "Fiche qualification": JSON.stringify({ objet: "Sans Sheets" })
    });
    const row = await aoRepository.getPipelineRecord("AO-SHEETLESS");
    expect(row?.["Fiche qualification"]).toContain("Sans Sheets");
  });
});
