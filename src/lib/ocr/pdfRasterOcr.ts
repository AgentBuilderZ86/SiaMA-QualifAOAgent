import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { recognizeImageBuffer } from "@/lib/ocr/tesseractOcr";

const MAX_OCR_PAGES = 4;
const RENDER_SCALE = 1.4;

export async function ocrPdfBuffer(buffer: Buffer): Promise<{ text: string; warning: string }> {
  if (!buffer.length) return { text: "", warning: "PDF vide." };

  const warnings: string[] = [];
  const parts: string[] = [];

  try {
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true
    }).promise;

    const total = doc.numPages;
    const pages = Math.min(total, MAX_OCR_PAGES);
    if (total > MAX_OCR_PAGES) {
      warnings.push(`OCR PDF : ${MAX_OCR_PAGES}/${total} pages analysées (limite performance).`);
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
