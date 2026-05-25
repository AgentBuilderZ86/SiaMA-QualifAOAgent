import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { extractPdfTextVision } from "@/lib/llmChat";
import { logger } from "@/lib/logger";
import type { QualificationDocumentKind } from "@/lib/aoTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const VISION_TIMEOUT_MS = 45_000;

function kindFromField(field: string): QualificationDocumentKind {
  if (field === "documentAvis") return "Avis";
  if (field === "documentCps") return "CPS";
  if (field === "documentRc") return "RC";
  return "Autre";
}

async function extractNativePdfText(buffer: Buffer): Promise<string> {
  try {
    // Import dynamique — évite de charger pdf-parse au démarrage du module
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse: (data: Buffer) => Promise<{ text: string }> = mod.default ?? mod;
    const result = await pdfParse(buffer);
    return (result.text || "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ aoNum: string }> }
) {
  await params;
  try {
    await requireUser();
    const formData = await request.formData();
    const fieldName = String(formData.get("fieldName") || "document");
    const file = formData.get("document");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ text: "", warning: "Aucun fichier reçu." });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({
        text: "",
        warning: `Fichier trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} Mo — limite 5 Mo). Collez le texte clé dans la zone d'extrait manuel ci-dessous.`,
        extractionMode: "unreadable"
      });
    }

    const kind = kindFromField(fieldName);
    const buffer = Buffer.from(await file.arrayBuffer());

    const isPdf = file.name.toLowerCase().endsWith(".pdf") || (file.type || "").includes("pdf");

    // Extraction native (texte intégré dans le PDF)
    let nativeText = "";
    if (isPdf) {
      nativeText = await extractNativePdfText(buffer);
    }

    const isScanned = isPdf && nativeText.length < 180;

    if (!isScanned) {
      return NextResponse.json({
        text: nativeText.slice(0, 50_000),
        warning: "",
        kind,
        ocrUsed: false,
        extractionMode: nativeText.trim() ? "native" : "unreadable"
      });
    }

    // PDF scanné — fallback Claude Vision avec race timeout
    const visionText = await Promise.race([
      extractPdfTextVision(buffer).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), VISION_TIMEOUT_MS))
    ]);

    if (visionText) {
      return NextResponse.json({
        text: visionText,
        warning: "PDF scanné — texte extrait par analyse IA (Claude vision).",
        kind,
        ocrUsed: true,
        extractionMode: "ocr"
      });
    }

    return NextResponse.json({
      text: "",
      warning: "PDF scanné : extraction IA indisponible ou délai dépassé. Collez le texte clé dans la zone ci-dessous.",
      kind,
      ocrUsed: false,
      extractionMode: "unreadable"
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur lors de l'extraction.";
    logger.error("api/qual-extract", message, { error: String(error) });
    return NextResponse.json({ text: "", warning: message }, { status: 400 });
  }
}
