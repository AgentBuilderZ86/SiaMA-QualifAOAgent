/** Durée maximale d'une fonction Netlify (ms) — 60 s avec 2 s de marge. */
export const NETLIFY_MAX_DURATION_MS = 58_000;

/**
 * Budget de timeout par étape du pipeline de qualification sur Netlify.
 * La somme des étapes doit rester en-dessous de NETLIFY_MAX_DURATION_MS.
 *
 * Budget nominal :
 *   extraction docs  ≈  2–5 s
 *   OCR Tesseract    ≈  0–20 s  (sauté si texte natif suffisant)
 *   save intermédiaire ≈ 2 s
 *   recommandation LLM ≈ 8 s
 *   intelligence LLM  ≈ 28 s
 *   save final         ≈ 2 s
 *   ────────────────────────
 *   total             ≈ 42–65 s  → on bride via les timeouts ci-dessous
 */
export const QUALIFICATION_BUDGET_MS = {
  /** Timeout pour l'appel LLM de recommandation (rapide, prompt court). */
  recommendation: {
    serverless: 8_000,
    zip: 10_000,
    local: 60_000,
  },
  /** Timeout pour l'appel LLM d'intelligence (complexe, réponse structurée). */
  intelligence: {
    serverless: 44_000,
    zip: 30_000,
    local: 0, // pas de timeout en local
  },
} as const;

/** Limites d'extraction documentaire. */
export const DOCUMENT_LIMITS = {
  /** Caractères maximum conservés pour scoring / LLM (évite OOM serverless). */
  maxExtractChars: 50_000,
  /** Texte max par entrée dans une archive avant concaténation globale. */
  maxZipEntryChars: 25_000,
  /** Taille max d'un ZIP uploadé (bytes). */
  maxZipUploadBytes: 25 * 1024 * 1024,
  /** Nombre max d'entrées traitées dans une archive (local). */
  maxZipEntriesLocal: 24,
  /** Nombre max d'entrées traitées dans une archive (serverless). */
  maxZipEntriesServerless: 10,
  /** OCR différé dans un ZIP : max N fichiers sur Netlify (Tesseract lent). */
  maxZipDeferredOcrServerless: 2,
  /** OCR différé dans un ZIP : max N fichiers en local. */
  maxZipDeferredOcrLocal: 4,
  /** Taille max d'un PDF brut avant extraction. */
  maxPdfBytes: 20 * 1024 * 1024,
  /** Seuil de texte natif minimum avant déclenchement OCR. */
  minTextCharsBeforeOcr: 180,
  /** Si le texte natif cumulé dépasse ce seuil, OCR ignoré sur Netlify (gain 10–30 s). */
  serverlessSkipOcrIfNativeChars: 1_200,
} as const;

/** Polling OCR (Tesseract.js est asynchrone). */
export const OCR_POLL_INTERVAL_MS = 1_000;
export const OCR_MAX_POLLS = 30;
