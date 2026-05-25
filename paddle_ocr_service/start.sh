#!/usr/bin/env bash
# Démarre le service EasyOCR si PADDLE_OCR_URL pointe vers localhost.
# Ignoré silencieusement si le service externe est utilisé ou désactivé.

set -euo pipefail

VENV_DIR="$(dirname "$0")/../paddle_ocr_service/.venv"
SERVICE="$(dirname "$0")/main.py"
PORT="${PADDLE_OCR_PORT:-8070}"
URL="${PADDLE_OCR_URL:-}"

# Pas de démarrage si PADDLE_OCR_URL n'est pas localhost ou n'est pas défini
if [[ -z "$URL" ]] || ! echo "$URL" | grep -qE "localhost|127\.0\.0\.1"; then
  echo "[ocr] PADDLE_OCR_URL n'est pas localhost — service non démarré localement."
  exit 0
fi

# Créer le venv si absent
if [[ ! -d "$VENV_DIR" ]]; then
  echo "[ocr] Création du virtualenv Python..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --quiet -r "$(dirname "$0")/requirements.txt"
fi

echo "[ocr] Démarrage EasyOCR sur le port $PORT..."
exec "$VENV_DIR/bin/python" "$SERVICE"
