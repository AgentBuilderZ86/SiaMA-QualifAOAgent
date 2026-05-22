"""
PaddleOCR microservice — expose /ocr via HTTP POST.

Payload (multipart/form-data):
  file   : bytes  — image (PNG/JPEG/TIFF/BMP/WebP) ou PDF
  lang   : str    — langue PaddleOCR (fr, en, …)  [optionnel, défaut: fr]

Réponse JSON:
  { "text": "...", "warning": "" }
  { "text": "", "warning": "message d'erreur" }
"""

from __future__ import annotations

import io
import os
import tempfile
import traceback
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR

app = FastAPI(title="PaddleOCR Service", version="1.0.0")

# Instanciation unique du moteur OCR (coûteuse au démarrage)
_ocr_cache: dict[str, PaddleOCR] = {}

SUPPORTED_LANGS = {"fr", "en", "arabic", "chinese_cht", "japan", "korean"}
DEFAULT_LANG = os.getenv("PADDLE_OCR_LANG", "fr")


def get_engine(lang: str) -> PaddleOCR:
    if lang not in _ocr_cache:
        _ocr_cache[lang] = PaddleOCR(
            use_angle_cls=True,
            lang=lang,
            show_log=False,
            use_gpu=False,
        )
    return _ocr_cache[lang]


def _ocr_image_bytes(data: bytes, lang: str) -> tuple[str, str]:
    engine = get_engine(lang)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        result = engine.ocr(tmp_path, cls=True)
        lines: list[str] = []
        if result:
            for page in result:
                if not page:
                    continue
                for box in page:
                    if box and len(box) >= 2:
                        text_info = box[1]
                        if text_info and text_info[0]:
                            lines.append(str(text_info[0]))
        text = "\n".join(lines).strip()
        return text, ""
    except Exception as exc:
        return "", f"PaddleOCR image échoué : {exc}"
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _ocr_pdf_bytes(data: bytes, lang: str) -> tuple[str, str]:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return "", "PyMuPDF non installé — impossible d'OCRiser un PDF avec PaddleOCR."

    max_pages = int(os.getenv("PADDLE_OCR_MAX_PDF_PAGES", "4"))
    doc = fitz.open(stream=data, filetype="pdf")
    total = doc.page_count
    pages = min(total, max_pages)
    warnings: list[str] = []
    if total > max_pages:
        warnings.append(f"PaddleOCR PDF : {max_pages}/{total} pages analysées (limite performance).")

    parts: list[str] = []
    for page_num in range(pages):
        page = doc[page_num]
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        text, warn = _ocr_image_bytes(png_bytes, lang)
        if text:
            parts.append(text)
        if warn:
            warnings.append(warn)
    doc.close()

    return "\n\n".join(parts), " ".join(warnings)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_endpoint(
    file: UploadFile = File(...),
    lang: Optional[str] = Form(None),
):
    effective_lang = (lang or DEFAULT_LANG).strip().lower()
    if effective_lang not in SUPPORTED_LANGS:
        effective_lang = DEFAULT_LANG

    try:
        data = await file.read()
        if not data:
            return JSONResponse({"text": "", "warning": "Fichier vide."})

        filename = (file.filename or "").lower()
        content_type = (file.content_type or "").lower()

        is_pdf = filename.endswith(".pdf") or "pdf" in content_type
        if is_pdf:
            text, warning = _ocr_pdf_bytes(data, effective_lang)
        else:
            text, warning = _ocr_image_bytes(data, effective_lang)

        return JSONResponse({"text": text, "warning": warning})

    except Exception:
        tb = traceback.format_exc()
        return JSONResponse({"text": "", "warning": f"Erreur PaddleOCR : {tb}"}, status_code=500)


if __name__ == "__main__":
    port = int(os.getenv("PADDLE_OCR_PORT", "8070"))
    uvicorn.run(app, host="0.0.0.0", port=port)
