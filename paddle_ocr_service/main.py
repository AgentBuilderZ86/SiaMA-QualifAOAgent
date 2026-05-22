"""
EasyOCR microservice — expose /ocr via HTTP POST.

PaddleOCR est la référence mais nécessite le CDN Baidu (bj.bcebos.com).
Ce service utilise EasyOCR (modèles téléchargés depuis GitHub) qui offre
des performances comparables sur les documents français/anglais.

Payload (multipart/form-data):
  file   : bytes  — image (PNG/JPEG/TIFF/BMP/WebP) ou PDF
  lang   : str    — codes langues séparés par virgule, ex "fr,en" [optionnel]

Réponse JSON:
  { "text": "...", "warning": "" }
  { "text": "", "warning": "message d'erreur" }
"""

from __future__ import annotations

import os
import tempfile
import traceback
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="EasyOCR Service (PaddleOCR-compatible)", version="2.0.0")

# Langues supportées par EasyOCR
DEFAULT_LANGS_STR = os.getenv("PADDLE_OCR_LANG", "fr,en")
DEFAULT_LANGS = [l.strip() for l in DEFAULT_LANGS_STR.split(",") if l.strip()]

_reader_cache: dict[str, object] = {}


def get_reader(langs: list[str]):
    key = ",".join(sorted(langs))
    if key not in _reader_cache:
        import easyocr
        _reader_cache[key] = easyocr.Reader(langs, gpu=False, verbose=False)
    return _reader_cache[key]


def _ocr_image_bytes(data: bytes, langs: list[str]) -> tuple[str, str]:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        reader = get_reader(langs)
        results = reader.readtext(tmp_path)
        lines = [item[1] for item in results if item and len(item) >= 2]
        return "\n".join(lines).strip(), ""
    except Exception as exc:
        return "", f"EasyOCR image échoué : {exc}"
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _ocr_pdf_bytes(data: bytes, langs: list[str]) -> tuple[str, str]:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return "", "PyMuPDF non installé — impossible d'OCRiser un PDF."

    max_pages = int(os.getenv("PADDLE_OCR_MAX_PDF_PAGES", "4"))
    doc = fitz.open(stream=data, filetype="pdf")
    total = doc.page_count
    pages = min(total, max_pages)
    warnings: list[str] = []
    if total > max_pages:
        warnings.append(f"OCR PDF : {max_pages}/{total} pages analysées (limite performance).")

    parts: list[str] = []
    for page_num in range(pages):
        page = doc[page_num]
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        text, warn = _ocr_image_bytes(png_bytes, langs)
        if text:
            parts.append(text)
        if warn:
            warnings.append(warn)
    doc.close()

    return "\n\n".join(parts), " ".join(warnings)


@app.get("/health")
async def health():
    return {"status": "ok", "engine": "easyocr"}


@app.post("/ocr")
async def ocr_endpoint(
    file: UploadFile = File(...),
    lang: Optional[str] = Form(None),
):
    if lang:
        langs = [l.strip() for l in lang.replace("+", ",").split(",") if l.strip()]
    else:
        langs = DEFAULT_LANGS

    try:
        data = await file.read()
        if not data:
            return JSONResponse({"text": "", "warning": "Fichier vide."})

        filename = (file.filename or "").lower()
        content_type = (file.content_type or "").lower()

        is_pdf = filename.endswith(".pdf") or "pdf" in content_type
        if is_pdf:
            text, warning = _ocr_pdf_bytes(data, langs)
        else:
            text, warning = _ocr_image_bytes(data, langs)

        return JSONResponse({"text": text, "warning": warning})

    except Exception:
        tb = traceback.format_exc()
        return JSONResponse({"text": "", "warning": f"Erreur OCR : {tb}"}, status_code=500)


if __name__ == "__main__":
    port = int(os.getenv("PADDLE_OCR_PORT", "8070"))
    uvicorn.run(app, host="0.0.0.0", port=port)
