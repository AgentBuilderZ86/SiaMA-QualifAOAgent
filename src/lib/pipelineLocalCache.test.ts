import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLocalPipelineRow, upsertLocalPipelineRow } from "@/lib/pipelineLocalCache";

describe("pipelineLocalCache", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ao-pipeline-local-"));
    process.env.PIPELINE_LOCAL_CACHE_PATH = path.join(tmpDir, "cache.json");
  });

  afterEach(async () => {
    delete process.env.PIPELINE_LOCAL_CACHE_PATH;
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("persiste une fiche qualification sans Google Sheets", async () => {
    await upsertLocalPipelineRow("AO-LOCAL-1", {
      "N° AO": "AO-LOCAL-1",
      "Fiche qualification": "{\"objet\":\"Test local\"}",
      "Statut workflow": "BO"
    });
    const row = await readLocalPipelineRow("AO-LOCAL-1");
    expect(row?.["Fiche qualification"]).toContain("Test local");
    expect(row?.["Statut workflow"]).toBe("BO");
  });
});
