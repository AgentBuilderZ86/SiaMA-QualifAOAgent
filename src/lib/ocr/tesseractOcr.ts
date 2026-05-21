import { createWorker, type Worker } from "tesseract.js";

const OCR_LANGS = "fra+eng";
const OCR_CACHE_DIR = "/tmp/tesseract-cache";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

let workerInit: Promise<Worker> | null = null;
let ocrChain: Promise<unknown> = Promise.resolve();

function scheduleOcr<T>(task: () => Promise<T>): Promise<T> {
  const run = ocrChain.then(task, task);
  ocrChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function getWorker() {
  if (!workerInit) {
    workerInit = createWorker(OCR_LANGS, 1, {
      cachePath: OCR_CACHE_DIR,
      gzip: true
    });
  }
  return workerInit;
}

export async function recognizeImageBuffer(buffer: Buffer, label = "image"): Promise<{ text: string; warning: string }> {
  if (!buffer.length) return { text: "", warning: "Image vide." };
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { text: "", warning: `Image trop volumineuse pour OCR (${label}).` };
  }

  return scheduleOcr(async () => {
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(buffer);
      const text = String(data.text || "").trim();
      if (!text) return { text: "", warning: `OCR sans texte détecté (${label}).` };
      return { text, warning: "" };
    } catch (error) {
      return {
        text: "",
        warning: `OCR Tesseract échoué (${label}) : ${error instanceof Error ? error.message : "erreur inconnue"}`
      };
    }
  });
}
