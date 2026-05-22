import crypto from "node:crypto";
import { ocrPdfBuffer } from "@/lib/ocr/pdfRasterOcr";
import { recognizeImageBuffer } from "@/lib/ocr/tesseractOcr";
import { extractWithPaddleOcr, paddleOcrConfigured } from "@/lib/ocr/paddleOcr";
import type { QualificationDocumentExtraction, QualificationDocumentKind } from "@/lib/aoTypes";
import {
  DOCUMENT_LIMITS,
  OCR_MAX_POLLS,
  OCR_POLL_INTERVAL_MS,
} from "@/lib/constants";

export type ExtractedDocument = {
  name: string;
  text: string;
  warning: string;
  kind?: QualificationDocumentKind;
  extractionMode?: QualificationDocumentExtraction["extractionMode"];
  ocrUsed?: boolean;
  sha256?: string;
  sourceUrl?: string;
};

export type DocumentSections = {
  contexte: string;
  objet: string;
  perimetre: string;
  livrables: string;
  duree: string;
  profils: string;
  criteres: string;
  budget: string;
  risques: string;
  pointsVigilance: string[];
};

type DocumentBufferInput = {
  name: string;
  buffer: Buffer;
  contentType?: string;
  kind?: QualificationDocumentKind;
  sourceUrl?: string;
};

export const MAX_EXTRACT_CHARS = DOCUMENT_LIMITS.maxExtractChars;
export const MAX_ZIP_UPLOAD_BYTES = DOCUMENT_LIMITS.maxZipUploadBytes;

const MAX_ZIP_ENTRY_CHARS = DOCUMENT_LIMITS.maxZipEntryChars;
const MAX_ZIP_ENTRIES_LOCAL = DOCUMENT_LIMITS.maxZipEntriesLocal;
const MAX_ZIP_ENTRIES_SERVERLESS = DOCUMENT_LIMITS.maxZipEntriesServerless;
const MAX_ZIP_DEFERRED_OCR_SERVERLESS = DOCUMENT_LIMITS.maxZipDeferredOcrServerless;
const MAX_ZIP_DEFERRED_OCR_LOCAL = DOCUMENT_LIMITS.maxZipDeferredOcrLocal;
const MAX_PDF_BYTES = DOCUMENT_LIMITS.maxPdfBytes;
const MIN_TEXT_CHARS_BEFORE_OCR = DOCUMENT_LIMITS.minTextCharsBeforeOcr;

export function isServerlessRuntime() {
  return Boolean(process.env.NETLIFY === "true" || process.env.NETLIFY === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

const KIND_OCR_PRIORITY: Record<QualificationDocumentKind, number> = {
  Avis: 0,
  CPS: 1,
  RC: 2,
  Autre: 9
};
const SERVERLESS_SKIP_OCR_IF_NATIVE_CHARS = DOCUMENT_LIMITS.serverlessSkipOcrIfNativeChars;

function maxZipEntries() {
  return isServerlessRuntime() ? MAX_ZIP_ENTRIES_SERVERLESS : MAX_ZIP_ENTRIES_LOCAL;
}

function maxZipDeferredOcr() {
  return isServerlessRuntime() ? MAX_ZIP_DEFERRED_OCR_SERVERLESS : MAX_ZIP_DEFERRED_OCR_LOCAL;
}

function zipEntryPriority(path: string) {
  const lower = path.toLowerCase();
  if (/avis|aao|appel.?off/i.test(lower)) return 0;
  if (/cps|cctp|dce|cahier/i.test(lower)) return 1;
  if (/(^|\/)(rc|reglement)[^a-z]|consultation/i.test(lower)) return 2;
  if (/bpu|financ|prix/i.test(lower)) return 4;
  return 5;
}

function cleanText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function linesOf(text: string) {
  return cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function findSection(
  lines: string[],
  keywords: string[],
  maxChars = 1200,
  maxLines = 18
) {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].toLowerCase();
    if (normalizedKeywords.some((keyword) => line.includes(keyword))) {
      const collected = [lines[index]];
      for (let next = index + 1; next < Math.min(lines.length, index + maxLines); next += 1) {
        const nextLine = lines[next];
        const looksLikeHeading = nextLine.length < 90 && /^\d+(\.\d+)*\.?\s+[A-ZÉÈÀÂÎÏÔÙÛÇ]/.test(nextLine);
        if (looksLikeHeading && collected.length > 2) break;
        collected.push(nextLine);
      }
      return collected.join("\n").slice(0, maxChars);
    }
  }
  return "";
}

function detectWarnings(text: string) {
  const lower = text.toLowerCase();
  const warnings = [
    ["groupement interdit", "Groupement potentiellement interdit ou contraint"],
    ["certification", "Certification ou attestation spécifique à vérifier"],
    ["références similaires", "Références similaires exigées"],
    ["pénalité", "Pénalités contractuelles à analyser"],
    ["délai", "Délai de réalisation à confirmer"],
    ["budget", "Budget ou enveloppe financière à confirmer"]
  ];
  return warnings.filter(([keyword]) => lower.includes(keyword)).map(([, label]) => label);
}

export function extractDocumentSections(text: string): DocumentSections {
  const cleaned = cleanText(text);
  const lines = linesOf(cleaned);
  return {
    contexte: findSection(lines, [
      "introduction",
      "contexte",
      "présentation de l'organisation",
      "presentation de l'organisation",
      "contact",
      "coordonnées",
      "coordination",
      "référent",
      "referent",
      "représentant"
    ]),
    objet: findSection(lines, [
      "objet",
      "objectif",
      "mission",
      "appel d'offres",
      "cahier des charges",
      "besoin exprimé",
      "besoins"
    ]),
    perimetre: findSection(lines, [
      "périmètre",
      "perimetre",
      "scope",
      "prestations attendues",
      "besoins",
      "lieu",
      "localisation",
      "ville",
      "site",
      "adresse",
      "géographique",
      "geographique"
    ]),
    livrables: findSection(lines, ["livrables", "deliverables", "restitution", "rapport", "documents attendus"]),
    duree: findSection(lines, [
      "durée",
      "duree",
      "planning",
      "calendrier",
      "délai",
      "delai",
      "remise des offres",
      "clôture",
      "echeance",
      "échéance"
    ]),
    profils: findSection(lines, [
      "profil",
      "expert",
      "consultant",
      "équipe",
      "equipe",
      "qualification",
      "contact",
      "interlocuteur",
      "référent technique"
    ]),
    criteres: findSection(lines, ["critères", "criteres", "évaluation", "evaluation", "notation", "pondération", "ponderation"]),
    budget: findSection(lines, ["budget", "enveloppe", "montant", "prix", "financière", "financiere", "tenders"]),
    risques: findSection(lines, [
      "risques",
      "contraintes",
      "sécurité",
      "securite",
      "exigences",
      "pénalité",
      "penalite",
      "soumission"
    ]),
    pointsVigilance: detectWarnings(cleaned)
  };
}

type PdfParseFn = (data: Buffer) => Promise<{ text: string; numpages: number }>;
let cachedPdfParse: PdfParseFn | null = null;

async function loadPdfParse(): Promise<PdfParseFn> {
  if (cachedPdfParse) return cachedPdfParse;
  // pdf-parse/index.js lance un readFileSync de test quand module.parent est absent (ESM / serverless).
  const pdfParseMod = await import("pdf-parse/lib/pdf-parse.js");
  cachedPdfParse = (pdfParseMod.default ?? pdfParseMod) as PdfParseFn;
  return cachedPdfParse;
}

async function extractPdfBuffer(buffer: Buffer): Promise<{ text: string; warning: string }> {
  if (buffer.length > MAX_PDF_BYTES) {
    return { text: "", warning: `PDF trop volumineux (max ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} Mo).` };
  }
  try {
    const pdfParse = await loadPdfParse();
    const data = await pdfParse(buffer);
    const raw = cleanText(data.text || "").slice(0, MAX_ZIP_ENTRY_CHARS);
    let warning = "";
    if (data.numpages > 100) warning = `PDF très long (${data.numpages} p.), extrait tronqué pour analyse.`;
    return { text: raw, warning };
  } catch (error) {
    return {
      text: "",
      warning: `Erreur extraction PDF : ${error instanceof Error ? error.message : "erreur inconnue"}`
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp", "gif"];

function isImageFile(ext: string, contentType = "") {
  const type = contentType.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext) || type.startsWith("image/");
}

function supportsOcr(name: string, contentType = "") {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const type = contentType.toLowerCase();
  return ext === "pdf" || type.includes("pdf") || isImageFile(ext, contentType);
}

function azureOcrConfig() {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim().replace(/\/+$/, "");
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim();
  const model = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL?.trim() || "prebuilt-read";
  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION?.trim() || "2024-11-30";
  return endpoint && key ? { endpoint, key, model, apiVersion } : null;
}

async function extractWithAzureDocumentIntelligence(buffer: Buffer, contentType: string) {
  const config = azureOcrConfig();
  if (!config) {
    return { text: "", warning: "OCR requis, mais Azure Document Intelligence n'est pas configuré." };
  }

  const analyzeUrl = `${config.endpoint}/documentintelligence/documentModels/${encodeURIComponent(
    config.model
  )}:analyze?api-version=${encodeURIComponent(config.apiVersion)}`;
  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.key,
      "Content-Type": contentType || "application/pdf"
    },
    body: new Uint8Array(buffer)
  });

  if (!analyzeResponse.ok) {
    return { text: "", warning: `OCR Azure refusé : HTTP ${analyzeResponse.status}.` };
  }

  const operationLocation = analyzeResponse.headers.get("operation-location");
  if (!operationLocation) {
    return { text: "", warning: "OCR Azure sans URL de résultat." };
  }

  for (let attempt = 0; attempt < OCR_MAX_POLLS; attempt += 1) {
    await sleep(OCR_POLL_INTERVAL_MS);
    const resultResponse = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": config.key }
    });
    if (!resultResponse.ok) {
      return { text: "", warning: `Résultat OCR Azure indisponible : HTTP ${resultResponse.status}.` };
    }
    const payload = (await resultResponse.json()) as { status?: string; analyzeResult?: { content?: string }; error?: { message?: string } };
    if (payload.status === "succeeded") {
      return { text: cleanText(payload.analyzeResult?.content || ""), warning: "" };
    }
    if (payload.status === "failed") {
      return { text: "", warning: `OCR Azure échoué : ${payload.error?.message || "erreur inconnue"}.` };
    }
  }

  return { text: "", warning: "OCR Azure expiré avant résultat." };
}

async function runOcrFallback(buffer: Buffer, name: string, contentType: string) {
  if (!supportsOcr(name, contentType)) {
    return { text: "", warning: "OCR non applicable à ce format." };
  }

  const provider = (process.env.OCR_PROVIDER || process.env.AO_OCR_PROVIDER || "tesseract").trim().toLowerCase();
  if (provider === "none") {
    return { text: "", warning: "OCR désactivé (OCR_PROVIDER=none)." };
  }

  if (provider === "paddle" || provider === "paddleocr") {
    const paddle = await extractWithPaddleOcr(buffer, name, contentType);
    if (paddle.text.trim()) return paddle;
    // PaddleOCR configuré mais résultat vide → fallback Tesseract
    const fallbackWarning = paddle.warning ? `${paddle.warning} ` : "";
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const type = contentType.toLowerCase();
    const tesseract =
      ext === "pdf" || type.includes("pdf")
        ? await ocrPdfBuffer(buffer)
        : await recognizeImageBuffer(buffer, name);
    return { text: tesseract.text, warning: `${fallbackWarning}${tesseract.warning}`.trim() };
  }

  if (provider === "azure" || provider === "azure-document-intelligence") {
    const azure = await extractWithAzureDocumentIntelligence(buffer, contentType);
    if (azure.text.trim()) return azure;
    // Azure configuré mais résultat vide → essai PaddleOCR si disponible, sinon Tesseract
    if (paddleOcrConfigured()) {
      const paddle = await extractWithPaddleOcr(buffer, name, contentType);
      if (paddle.text.trim()) return { text: paddle.text, warning: `${azure.warning} ${paddle.warning}`.trim() };
    }
  }

  const ext = name.split(".").pop()?.toLowerCase() || "";
  const type = contentType.toLowerCase();
  if (ext === "pdf" || type.includes("pdf")) {
    return ocrPdfBuffer(buffer);
  }
  return recognizeImageBuffer(buffer, name);
}

async function extractZipBuffer(buffer: Buffer, outerName: string): Promise<ExtractedDocument> {
  if (buffer.length > MAX_ZIP_UPLOAD_BYTES) {
    return {
      name: outerName,
      text: "",
      warning: `ZIP trop volumineux (max ${Math.round(MAX_ZIP_UPLOAD_BYTES / (1024 * 1024))} Mo).`
    };
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const parts: string[] = [];
  const warnings: string[] = [];
  let totalLen = 0;

  const names = Object.keys(zip.files)
    .filter((n) => !zip.files[n].dir)
    .sort();

  const zipSupportedExtensions = ["pdf", "docx", "txt", ...IMAGE_EXTENSIONS];

  const supported = names.filter((path) => {
    const base = path.split("/").pop() || path;
    const ext = base.split(".").pop()?.toLowerCase() || "";
    return zipSupportedExtensions.includes(ext);
  });
  const zipEntryLimit = maxZipEntries();
  if (supported.length > zipEntryLimit) {
    warnings.push(`Archive : seuls les ${zipEntryLimit} premiers fichiers PDF/DOCX/TXT sont traités.`);
  }

  const ocrCandidates: Array<{ path: string; base: string; buffer: Buffer; contentType: string }> = [];
  let processed = 0;
  for (const path of names) {
    const entry = zip.files[path];
    const base = path.split("/").pop() || path;
    const ext = base.split(".").pop()?.toLowerCase() || "";

    if (!zipSupportedExtensions.includes(ext)) continue;
    if (processed >= zipEntryLimit) break;
    processed += 1;

    let buf: Buffer;
    try {
      buf = await entry.async("nodebuffer");
    } catch {
      warnings.push(`Lecture impossible : ${path}`);
      continue;
    }

    if (buf.length > 15 * 1024 * 1024) {
      warnings.push(`Fichier ignoré (trop lourd) : ${path}`);
      continue;
    }

    let chunk = "";
    let localWarning = "";

    if (ext === "txt") {
      chunk = cleanText(buf.toString("utf8"));
    } else if (ext === "docx") {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: buf });
        chunk = cleanText(result.value || "");
        if (result.messages?.length) {
          localWarning = `DOCX ${base} : ${result.messages.length} avertissement(s).`;
        }
      } catch (error) {
        warnings.push(`DOCX ${path} : ${error instanceof Error ? error.message : "erreur"}`);
        continue;
      }
    } else if (ext === "pdf") {
      const r = await extractPdfBuffer(buf);
      chunk = r.text;
      if (r.warning) localWarning = `${base}: ${r.warning}`;
      if (chunk.trim().length < MIN_TEXT_CHARS_BEFORE_OCR) {
        ocrCandidates.push({
          path,
          base,
          buffer: buf,
          contentType: "application/pdf"
        });
      }
    } else if (isImageFile(ext)) {
      if (isServerlessRuntime()) {
        warnings.push(`Image ${path} : OCR ZIP désactivé sur serverless (déposez en fichier séparé si besoin).`);
        continue;
      }
      ocrCandidates.push({
        path,
        base,
        buffer: buf,
        contentType: `image/${ext === "jpg" ? "jpeg" : ext}`
      });
    }

    chunk = chunk.slice(0, MAX_ZIP_ENTRY_CHARS);
    const sep = `\n\n--- Fichier ZIP : ${path} ---\n\n`;
    if (totalLen + sep.length + chunk.length > MAX_EXTRACT_CHARS) {
      warnings.push("Archive tronquée : limite de texte globale atteinte.");
      break;
    }
    parts.push(sep + chunk);
    totalLen += sep.length + chunk.length;
    if (localWarning) warnings.push(localWarning);
  }

  const deferredLimit = maxZipDeferredOcr();
  const sortedCandidates = ocrCandidates.sort((a, b) => zipEntryPriority(a.path) - zipEntryPriority(b.path));
  for (const candidate of sortedCandidates.slice(0, deferredLimit)) {
    const ocr = await extractDocumentBufferWithOcr({
      name: candidate.base,
      buffer: candidate.buffer,
      contentType: candidate.contentType
    });
    const chunk = ocr.text.slice(0, MAX_ZIP_ENTRY_CHARS);
    if (!chunk.trim()) {
      if (ocr.warning) warnings.push(`${candidate.path}: ${ocr.warning}`);
      continue;
    }
    const sep = `\n\n--- Fichier ZIP (OCR) : ${candidate.path} ---\n\n`;
    if (totalLen + sep.length + chunk.length > MAX_EXTRACT_CHARS) {
      warnings.push("Archive tronquée après OCR : limite de texte globale atteinte.");
      break;
    }
    parts.push(sep + chunk);
    totalLen += sep.length + chunk.length;
  }
  if (ocrCandidates.length > deferredLimit) {
    warnings.push(`OCR ZIP : ${deferredLimit}/${ocrCandidates.length} fichiers scannés traités (limite Netlify).`);
  }

  const text = parts.join("").slice(0, MAX_EXTRACT_CHARS);
  const warning = warnings.join(" ");
  if (!text.trim()) {
    return {
      name: outerName,
      text: "",
      warning: warning || "ZIP sans fichier .pdf / .docx / .txt / image exploitable."
    };
  }
  return { name: outerName, text, warning };
}

export async function extractDocumentBuffer({ name, buffer, contentType = "" }: DocumentBufferInput): Promise<ExtractedDocument> {
  if (!buffer.length) {
    return { name, text: "", warning: "Document vide." };
  }

  const ext = name.split(".").pop()?.toLowerCase() || "";
  const normalizedType = contentType.toLowerCase();

  if (ext === "zip" || normalizedType.includes("zip")) {
    if (buffer.length > MAX_ZIP_UPLOAD_BYTES) {
      return {
        name,
        text: "",
        warning: `ZIP trop volumineux (max ${Math.round(MAX_ZIP_UPLOAD_BYTES / (1024 * 1024))} Mo).`
      };
    }
    return extractZipBuffer(buffer, name);
  }

  if (ext === "txt" || normalizedType.startsWith("text/")) {
    return { name, text: cleanText(buffer.toString("utf8")).slice(0, MAX_EXTRACT_CHARS), warning: "" };
  }

  if (ext === "pdf" || normalizedType.includes("pdf")) {
    const { text, warning } = await extractPdfBuffer(buffer);
    return {
      name,
      text: text.slice(0, MAX_EXTRACT_CHARS),
      warning
    };
  }

  if (isImageFile(ext, normalizedType)) {
    return { name, text: "", warning: "" };
  }

  if (ext === "docx" || normalizedType.includes("wordprocessingml.document")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return {
        name,
        text: cleanText(result.value || "").slice(0, MAX_EXTRACT_CHARS),
        warning: result.messages?.length ? `DOCX lu avec ${result.messages.length} avertissement(s).` : ""
      };
    } catch (error) {
      return {
        name,
        text: "",
        warning: `Erreur extraction DOCX : ${error instanceof Error ? error.message : "erreur inconnue"}`
      };
    }
  }

  return {
    name,
    text: "",
    warning: `Extraction automatique non disponible pour .${ext || "inconnu"}. Formats pris en charge : .txt, .docx, .pdf, images, .zip (PDF/DOCX/TXT/images).`
  };
}

export async function extractDocumentBufferWithOcr({
  name,
  buffer,
  contentType = "",
  kind = "Autre",
  sourceUrl
}: DocumentBufferInput): Promise<ExtractedDocument> {
  const native = await extractDocumentBuffer({ name, buffer, contentType, kind, sourceUrl });
  const base = {
    ...native,
    kind,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    sourceUrl,
    extractionMode: native.text.trim() ? ("native" as const) : ("unreadable" as const),
    ocrUsed: false
  };
  if (native.text.trim().length >= MIN_TEXT_CHARS_BEFORE_OCR || !supportsOcr(name, contentType)) return base;

  const ocr = await runOcrFallback(buffer, name, contentType);
  if (ocr.text.trim()) {
    return {
      ...base,
      text: ocr.text.slice(0, MAX_EXTRACT_CHARS),
      warning: [native.warning, ocr.warning].filter(Boolean).join(" "),
      extractionMode: "ocr",
      ocrUsed: true
    };
  }
  return {
    ...base,
    warning: [native.warning, ocr.warning].filter(Boolean).join(" ") || "Document peu lisible, OCR sans résultat.",
    extractionMode: native.text.trim() ? "native" : "unreadable"
  };
}

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  "pdf", "docx", "doc", "txt", "zip", "png", "jpg", "jpeg", "tif", "tiff"
]);

export async function extractUploadedDocument(file: File | null, kind: QualificationDocumentKind = "Autre"): Promise<ExtractedDocument> {
  if (!file || file.size === 0) {
    return { name: "", text: "", warning: "Aucun document transmis.", kind, extractionMode: "unreadable" };
  }

  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    return {
      name,
      text: "",
      warning: `Extension .${ext || "inconnue"} non autorisée. Formats acceptés : PDF, DOCX, TXT, ZIP, images (PNG/JPG/TIF).`,
      kind,
      extractionMode: "unreadable"
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return extractDocumentBufferWithOcr({ name, buffer, contentType: file.type, kind });
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0;
}

const DOCUMENT_UPLOAD_FIELDS: Array<{ field: string; kind: QualificationDocumentKind }> = [
  { field: "documentAvis", kind: "Avis" },
  { field: "documentCps", kind: "CPS" },
  { field: "documentRc", kind: "RC" },
  { field: "documentAutres", kind: "Autre" },
  { field: "document", kind: "Autre" }
];

function toQualificationExtraction(doc: ExtractedDocument): QualificationDocumentExtraction {
  return {
    kind: doc.kind || "Autre",
    name: doc.name,
    text: doc.text,
    warning: doc.warning,
    extractionMode: doc.extractionMode || (doc.text.trim() ? "native" : "unreadable"),
    ocrUsed: doc.ocrUsed,
    sha256: doc.sha256,
    sourceUrl: doc.sourceUrl,
    extractedAt: new Date().toISOString()
  };
}

export async function extractUploadedDocuments(formData: FormData): Promise<QualificationDocumentExtraction[]> {
  const files = DOCUMENT_UPLOAD_FIELDS.flatMap(({ field, kind }) =>
    formData
      .getAll(field)
      .filter(isUploadedFile)
      .map((file) => ({ file, kind }))
  );

  if (!files.length) return [];

  const natives = await Promise.all(
    files.map(async ({ file, kind }) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const native = await extractDocumentBuffer({
        name: file.name,
        buffer,
        contentType: file.type,
        kind
      });
      return { file, kind, buffer, native };
    })
  );

  const results: ExtractedDocument[] = natives.map(({ file, kind, buffer, native }) => ({
    ...native,
    kind,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    extractionMode: native.text.trim() ? ("native" as const) : ("unreadable" as const),
    ocrUsed: false
  }));

  const totalNativeChars = results.reduce((sum, doc) => sum + doc.text.trim().length, 0);
  const serverless = isServerlessRuntime();
  const skipOcr = serverless && totalNativeChars >= SERVERLESS_SKIP_OCR_IF_NATIVE_CHARS;
  const maxOcrRuns = serverless ? (skipOcr ? 0 : 1) : 3;

  if (skipOcr) {
    for (const doc of results) {
      if (!doc.text.trim()) {
        doc.warning = [doc.warning, "OCR non exécuté : texte Avis suffisant pour la qualification (délai Netlify)."]
          .filter(Boolean)
          .join(" ");
      }
    }
  } else if (maxOcrRuns > 0) {
    const ocrTargets = natives
      .map((item, index) => ({ ...item, index }))
      .filter(
        ({ native, file }) =>
          native.text.trim().length < MIN_TEXT_CHARS_BEFORE_OCR && supportsOcr(file.name, file.type)
      )
      .sort((a, b) => KIND_OCR_PRIORITY[a.kind] - KIND_OCR_PRIORITY[b.kind]);

    let ocrRuns = 0;
    for (const target of ocrTargets) {
      if (ocrRuns >= maxOcrRuns) break;
      const ocr = await extractDocumentBufferWithOcr({
        name: target.file.name,
        buffer: target.buffer,
        contentType: target.file.type,
        kind: target.kind
      });
      if (ocr.text.trim() || ocr.warning) {
        results[target.index] = ocr;
        ocrRuns += 1;
      }
    }
    if (ocrTargets.length > ocrRuns && serverless) {
      const note = `OCR limité : ${ocrRuns}/${ocrTargets.length} pièce(s) scannée(s) traitée(s) (priorité Avis/CPS/RC).`;
      if (results[0]) results[0].warning = [results[0].warning, note].filter(Boolean).join(" ");
    }
  }

  return results.filter((doc) => doc.name || doc.text.trim()).map(toQualificationExtraction);
}

export function summarizeDocumentText(text: string, fallback: string) {
  const normalized = cleanText(text || fallback || "");
  if (!normalized) return "Non trouvé dans le document.";
  return normalized.slice(0, 6000);
}
