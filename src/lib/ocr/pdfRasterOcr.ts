import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { recognizeImageBuffer } from "@/lib/ocr/tesseractOcr";

const RENDER_SCALE = 1.4;

function maxOcrPages() {
  const configured = Number(process.env.AO_OCR_MAX_PDF_PAGES || "");
  if (Number.isFinite(configured) && configured > 0) return Math.min(configured, 8);
  if (process.env.NETLIFY === "true" || process.env.NETLIFY === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return 2;
  }
  return 4;
}

export type OcrPdfOptions = { documentKind?: string };

function resolvePdfPageLimit(buffer: Buffer, documentKind?: string) {
  const configured = Number(process.env.AO_OCR_MAX_PDF_PAGES || "");
  if (Number.isFinite(configured) && configured > 0) return Math.min(configured, 10);
  const serverless =
    process.env.NETLIFY === "true" || process.env.NETLIFY === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (documentKind === "RC") return serverless ? 4 : 6;
  if (documentKind === "Avis") return serverless ? 2 : 4;
  if (documentKind === "CPS" && buffer.length > 700_000) return 1;
  return maxOcrPages();
}

export async function ocrPdfBuffer(buffer: Buffer, options: OcrPdfOptions = {}): Promise<{ text: string; warning: string }> {
  if (!buffer.length) return { text: "", warning: "PDF vide." };

  const warnings: string[] = [];
  const parts: string[] = [];
  const pageLimit = resolvePdfPageLimit(buffer, options.documentKind);

  try {
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true
    }).promise;

    const total = doc.numPages;
    const pages = Math.min(total, pageLimit);
    if (total > pageLimit) {
      warnings.push(`OCR PDF : ${pageLimit}/${total} pages analysées (limite performance).`);
    }

    for (let pageNum = 1; pageNum <= pages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport
      }).promise;
      const png = canvas.toBuffer("image/png");
      const ocr = await recognizeImageBuffer(png, `pdf-p${pageNum}`);
      if (ocr.text.trim()) parts.push(ocr.text);
      if (ocr.warning) warnings.push(ocr.warning);
    }

    await doc.destroy();
  } catch (error) {
    return {
      text: "",
      warning: `OCR PDF échoué : ${error instanceof Error ? error.message : "erreur inconnue"}`
    };
  }

  return {
    text: parts.join("\n\n"),
    warning: warnings.join(" ")
  };
}
