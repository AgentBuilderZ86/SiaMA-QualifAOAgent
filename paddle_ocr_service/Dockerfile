FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV PADDLE_OCR_LANG=fr
ENV PADDLE_OCR_MAX_PDF_PAGES=4
ENV PADDLE_OCR_PORT=8070

EXPOSE 8070

CMD ["python", "main.py"]
