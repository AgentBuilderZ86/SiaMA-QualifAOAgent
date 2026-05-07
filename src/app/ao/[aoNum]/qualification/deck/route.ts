import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { buildAoDeckPayload } from "@/lib/pptx/aoDeckData";

export const runtime = "nodejs";

function fileName(value: string) {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 80) || "qualification";
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

function pythonCandidates() {
  const localAppData = process.env.LOCALAPPDATA;
  return [
    "python",
    "py",
    ...(localAppData ? [path.join(localAppData, "Programs", "Python", "Python312", "python.exe")] : [])
  ];
}

async function generateDeckWithPython(payload: unknown) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "siama-ao-ppt-"));
  const inputPath = path.join(tempDir, "ao.json");
  const outputPath = path.join(tempDir, `${randomUUID()}.pptx`);
  const scriptPath = path.join(process.cwd(), "scripts", "generate_ao_ppt.py");
  try {
    await writeFile(inputPath, JSON.stringify(payload), "utf-8");
    const args = [scriptPath, "--input", inputPath, "--output", outputPath, "--profile", "standard"];
    const attempts = [];
    for (const command of pythonCandidates()) {
      const attempt = await runCommand(command, args);
      attempts.push(attempt);
      if (attempt.ok) {
        return await readFile(outputPath);
      }
    }
    {
      const message = attempts.map((attempt) => attempt.stderr || attempt.stdout).filter(Boolean).join("\n");
      throw new Error(
        `Génération Python indisponible. Installez Python puis python-pptx avec "python -m pip install python-pptx". ${message}`
      );
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ aoNum: string }> }) {
  await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) return NextResponse.json({ error: "AO introuvable" }, { status: 404 });

  const payload = buildAoDeckPayload(detail.ao, detail.pipeline, detail.referentials);
  let buffer: Buffer;
  try {
    buffer = await generateDeckWithPython(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue pendant la génération PowerPoint." },
      { status: 500 }
    );
  }
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${fileName(`qualification-${detail.ao.displayAoNum}`)}.pptx"`
    }
  });
}
