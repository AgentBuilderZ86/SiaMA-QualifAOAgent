import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { extractDocumentBuffer } from "@/lib/documents";
import { extractPdfTextVision } from "@/lib/llmChat";
import { logger } from "@/lib/logger";
import type { QualificationDocumentKind } from "@/lib/aoTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function kindFromField(field: string): QualificationDocumentKind {
  if (field === "documentAvis") return "Avis";
  if (field === "documentCps") return "CPS";
  if (field === "documentRc") return "RC";
  return "Autre";
}

function isPdfOrImage(name: string, contentType: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "pdf" || contentType.includes("pdf") || ["png", "jpg", "jpeg", "tif", "tiff"].includes(ext);
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
    const result = await extractDocumentBuffer({
      name: file.name,
      buffer,
      contentType: file.type || "",
      kind
    });

    // Scanned PDFs have no native text layer — try Claude vision as fallback
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || (file.type || "").includes("pdf");
    const isScanned = !result.text.trim() && isPdf;

    if (isScanned) {
      // Race contre le timeout Netlify (60s max) — on laisse 45s à Claude Vision
      const VISION_TIMEOUT_MS = 45_000;
      const visionText = await Promise.race([
        extractPdfTextVision(buffer).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), VISION_TIMEOUT_MS))
      ]);
      if (visionText) {
        return NextResponse.json({
          text: visionText,
          warning: "PDF scanné — texte extrait par analyse IA (Claude vision).",
          kind: result.kind ?? kind,
          ocrUsed: true,
          extractionMode: "ocr"
        });
      }
      // Vision non disponible, échouée ou timeout — guider l'utilisateur
      return NextResponse.json({
        text: "",
        warning: "PDF scanné : extraction IA indisponible ou délai dépassé. Collez le texte clé dans la zone ci-dessous.",
        kind: result.kind ?? kind,
        ocrUsed: false,
        extractionMode: "unreadable"
      });
    }

    return NextResponse.json({
      text: result.text,
      warning: result.warning,
      kind: result.kind ?? kind,
      ocrUsed: false,
      extractionMode: result.text.trim() ? "native" : "unreadable"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur lors de l'extraction.";
    logger.error("api/qual-extract", message, { error: String(error) });
    return NextResponse.json({ text: "", warning: message }, { status: 400 });
  }
}

