import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { extractDocumentBufferWithOcr } from "@/lib/documents";
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
        warning: `Fichier trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} Mo — limite 5 Mo). Collez le texte clé dans la zone d'extrait manuel.`
      });
    }

    const kind = kindFromField(fieldName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractDocumentBufferWithOcr({
      name: file.name,
      buffer,
      contentType: file.type || "",
      kind
    });

    return NextResponse.json({
      text: result.text,
      warning: result.warning,
      kind: result.kind ?? kind,
      ocrUsed: result.ocrUsed ?? false,
      extractionMode: result.extractionMode ?? (result.text ? "native" : "unreadable")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur lors de l'extraction.";
    logger.error("api/qual-extract", message, { error: String(error) });
    return NextResponse.json({ text: "", warning: message }, { status: 400 });
  }
}
