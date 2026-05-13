import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { promisify } from "node:util";

import type { AoDeckPayload } from "./aoDeckData";

const execFileAsync = promisify(execFile);

export type DeckEngineMode = "auto" | "python" | "pptxgen";

function pythonCmd() {
  return process.env.PYTHON_BIN?.trim() || (process.platform === "win32" ? "python" : "python3");
}

function timeoutMs() {
  const raw = process.env.QUALIFICATION_DECK_PYTHON_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 90_000;
}

function profile() {
  const p = process.env.QUALIFICATION_DECK_PROFILE?.trim();
  return p || "standard";
}

/** True si une tentative précédente a échoué faute de binaire Python (évite de respawner à chaque requête). */
let pythonBinaryMissing = false;

export function deckEngineFromEnv(): DeckEngineMode {
  const v = (process.env.QUALIFICATION_DECK_ENGINE || "auto").toLowerCase();
  if (v === "python" || v === "pptxgen") return v;
  return "auto";
}

/**
 * Génère le deck via `scripts/generate_ao_ppt.py` et le template `config/templates/Sia_Template_Master.pptx`.
 * Retourne null si Python / dépendances / template sont indisponibles ou en cas d’erreur.
 */
export async function runPythonQualificationDeck(payload: AoDeckPayload): Promise<Buffer | null> {
  if (pythonBinaryMissing) return null;
  const root = process.cwd();
  const script = join(root, "scripts", "generate_ao_ppt.py");
  const config = join(root, "config", "ppt-sections.json");
  const dir = await mkdtemp(join(tmpdir(), "siama-deck-"));
  const inputPath = join(dir, "payload.json");
  const outputPath = join(dir, "deck.pptx");
  try {
    await writeFile(inputPath, JSON.stringify(payload), "utf8");
    const py = pythonCmd();
    const args = [script, "--input", inputPath, "--output", outputPath, "--config", config, "--profile", profile()];
    await execFileAsync(py, args, {
      cwd: root,
      timeout: timeoutMs(),
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return await readFile(outputPath);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stderr?: Buffer | string };
    const code = e.code;
    if (code === "ENOENT") {
      pythonBinaryMissing = true;
    }
    if (process.env.NODE_ENV !== "production") {
      const stderr = e.stderr ? String(e.stderr) : "";
      console.error("[runPythonQualificationDeck]", e.message || err, stderr);
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
