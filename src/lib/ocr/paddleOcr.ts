const PADDLE_OCR_URL = (process.env.PADDLE_OCR_URL || "").trim().replace(/\/+$/, "");
const PADDLE_OCR_LANG = (process.env.PADDLE_OCR_LANG || "fr").trim();
const PADDLE_OCR_TIMEOUT_MS = Number(process.env.PADDLE_OCR_TIMEOUT_MS || "30000");

function paddleOcrConfigured(): boolean {
  return Boolean(PADDLE_OCR_URL);
}

export { paddleOcrConfigured };

export async function extractWithPaddleOcr(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<{ text: string; warning: string }> {
  if (!paddleOcrConfigured()) {
    return { text: "", warning: "PaddleOCR non configuré (PADDLE_OCR_URL manquant)." };
  }

  const form = new FormData();
  const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
  form.append("file", blob, filename);
  form.append("lang", PADDLE_OCR_LANG);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PADDLE_OCR_TIMEOUT_MS);

  try {
    const response = await fetch(`${PADDLE_OCR_URL}/ocr`, {
      method: "POST",
      body: form,
      signal: controller.signal
    });

    if (!response.ok) {
      return { text: "", warning: `PaddleOCR HTTP ${response.status}.` };
    }

    const payload = (await response.json()) as { text?: string; warning?: string };
    return {
      text: String(payload.text || "").trim(),
      warning: String(payload.warning || "")
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "erreur inconnue";
    return { text: "", warning: `PaddleOCR échoué : ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
