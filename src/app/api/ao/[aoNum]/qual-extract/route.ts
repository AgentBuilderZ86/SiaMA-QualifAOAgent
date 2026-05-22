import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { extractDocumentBuffer } from "@/lib/documents";
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

    // Scanned PDFs / images have no native text — guide the user
    const isScanned = !result.text.trim() && isPdfOrImage(file.name, file.type || "");
    const warning = isScanned
      ? "PDF scanné ou sans texte natif. Collez le texte clé (objet, périmètre, budget, critères) dans la zone d'extrait manuel."
      : result.warning;

    return NextResponse.json({
      text: result.text,
      warning,
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

