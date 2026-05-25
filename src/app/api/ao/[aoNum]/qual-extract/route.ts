import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { extractPdfTextVision } from "@/lib/llmChat";
import { logger } from "@/lib/logger";
import type { QualificationDocumentKind } from "@/lib/aoTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Sur Netlify, la fonction dispose de ~26s (Pro) ou ~10s (Starter) par défaut.
// On vise une réponse < 25s pour rester dans le budget.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const VISION_TIMEOUT_MS = 22_000;    // 22s pour Claude Vision
const MAX_VISION_PAGES = 5;          // Tronquer à 5 pages avant Vision

function kindFromField(field: string): QualificationDocumentKind {
  if (field === "documentAvis") return "Avis";
  if (field === "documentCps") return "CPS";
  if (field === "documentRc") return "RC";
  return "Autre";
}

async function extractNativePdfText(buffer: Buffer): Promise<string> {
  try {
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse: (data: Buffer) => Promise<{ text: string }> = mod.default ?? mod;
    const result = await pdfParse(buffer);
    return (result.text || "")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return "";
  }
}

// Tronquer le PDF aux N premières pages (pdf-lib — pur JS, pas de modules natifs)
async function truncatePdfToPages(buffer: Buffer, maxPages: number): Promise<Buffer> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = src.getPageCount();
    if (total <= maxPages) return buffer;

    const dst = await PDFDocument.create();
    const indices = Array.from({ length: Math.min(maxPages, total) }, (_, i) => i);
    const copied = await dst.copyPages(src, indices);
    copied.forEach((p) => dst.addPage(p));
    const bytes = await dst.save();
    return Buffer.from(bytes);
  } catch {
    // Si pdf-lib ne peut pas manipuler ce PDF (JBIG2 non supporté), retourner tel quel
    return buffer;
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
    const nameLower = file.name.toLowerCase();
    const mimeType = (file.type || "").toLowerCase();
    const isPdf = nameLower.endsWith(".pdf") || mimeType.includes("pdf");
    const isTxt = nameLower.endsWith(".txt") || mimeType.startsWith("text/");
    const isDocx = nameLower.endsWith(".docx") || mimeType.includes("wordprocessingml");

    // Fichiers texte brut
    if (isTxt) {
      const text = buffer.toString("utf8").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
      return NextResponse.json({
        text: text.slice(0, 50_000),
        warning: text ? "" : "Fichier texte vide.",
        kind,
        ocrUsed: false,
        extractionMode: text ? "native" : "unreadable"
      });
    }

    // Fichiers Word DOCX
    if (isDocx) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        const text = (result.value || "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
        return NextResponse.json({
          text: text.slice(0, 50_000),
          warning: text ? "" : "DOCX sans contenu texte lisible.",
          kind,
          ocrUsed: false,
          extractionMode: text ? "native" : "unreadable"
        });
      } catch {
        return NextResponse.json({ text: "", warning: "Erreur extraction DOCX.", kind, ocrUsed: false, extractionMode: "unreadable" });
      }
    }

    // 1. Extraction native (texte intégré dans le PDF)
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

    // 2. PDF scanné — tronquer aux N premières pages pour Claude Vision
    const truncated = await truncatePdfToPages(buffer, MAX_VISION_PAGES);
    const isTruncated = truncated.length < buffer.length;

    // 3. Claude Vision avec timeout strict
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

    let visionText: string | null = null;
    try {
      visionText = await extractPdfTextVision(truncated, controller.signal);
    } catch {
      visionText = null;
    } finally {
      clearTimeout(timer);
    }

    if (visionText) {
      const pageNote = isTruncated ? ` (${MAX_VISION_PAGES} premières pages analysées)` : "";
      return NextResponse.json({
        text: visionText,
        warning: `PDF scanné — texte extrait par analyse IA (Claude vision)${pageNote}.`,
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
