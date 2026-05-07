/**
 * Pré-scoring à froid depuis le nom de fichier (ZIP / DOCX / etc.).
 * Ne remplace pas les données AO Google Sheet : indices fusionnés dans la fiche et préfixe optionnel du texte analysé.
 */

export type FilenameSignals = {
  /** Numéro AO probable (ex. 15086292 depuis 15086292_PNUD.zip) */
  aoNumGuess?: string;
  /** Jeton client probable (segment alphabétique majeur du nom) */
  clientToken?: string;
  /** Indices thématiques extraits du nom (ex. Gouvernance_Data) */
  topicHints?: string[];
  /** Mois/année détectés dans le nom (texte brut, ex. Avril 2026) */
  dateFromName?: string;
};

const MONTHS_FR =
  "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";

/** Début de chaîne : N° AO numérique (6+ chiffres) avant underscore ou tiret */
const LEADING_AO = /^(\d{6,})(?:[_\-.]|$)/i;

/** Pattern RFP_Client_Topic_... */
const RFP_PREFIX = /^RFP[_\s-]+([^_\-.]+)/i;

/** Mois français + année */
const MONTH_YEAR = new RegExp(`\\b(${MONTHS_FR})\\s+(20\\d{2})\\b`, "i");

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

function splitTopicSegments(nameWithoutExt: string): string[] {
  const cleaned = nameWithoutExt.replace(/^RFP[_\s-]+/i, "").replace(/^\d+[_\-.]+/, "");
  return cleaned
    .split(/[_\s-.]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !/^\d+$/.test(s) && !MONTHS_FR.split("|").includes(s.toLowerCase()));
}

/**
 * Extrait les signaux depuis le nom du fichier uploadé (ou premier fichier dans un ZIP déjà normalisé côté appelant).
 */
export function parseFilenameSignals(originalName: string): FilenameSignals {
  const file = basename(originalName);
  const withoutExt = file.replace(/\.[^.]+$/i, "").trim();
  if (!withoutExt) return {};

  const out: FilenameSignals = {};

  const leadingAo = withoutExt.match(LEADING_AO);
  if (leadingAo) {
    out.aoNumGuess = leadingAo[1];
  }

  const rfp = withoutExt.match(RFP_PREFIX);
  if (rfp?.[1]) {
    out.clientToken = rfp[1].replace(/_/g, " ").trim();
  }

  const my = withoutExt.match(MONTH_YEAR);
  if (my) {
    out.dateFromName = `${my[1]} ${my[2]}`;
  }

  const segments = splitTopicSegments(withoutExt);
  const topics = segments.filter((s) => s.toLowerCase() !== out.clientToken?.toLowerCase()).slice(0, 6);
  if (topics.length) {
    out.topicHints = topics;
  }

  if (!out.clientToken && segments.length > 0) {
    const firstAlpha = segments.find((s) => /^[A-Za-zÀ-ÿ]/.test(s));
    if (firstAlpha && firstAlpha.length >= 3) {
      out.clientToken = firstAlpha;
    }
  }

  return out;
}

/** Bloc court préfixé au texte documentaire pour scoring patterns / LLM (sans écraser l’AO sheet). */
export function filenameSignalsPrefix(signals: FilenameSignals): string {
  const parts: string[] = [];
  if (signals.aoNumGuess) parts.push(`N° AO probable (nom fichier): ${signals.aoNumGuess}`);
  if (signals.clientToken) parts.push(`Client probable (nom fichier): ${signals.clientToken}`);
  if (signals.topicHints?.length) parts.push(`Thèmes (nom fichier): ${signals.topicHints.join(", ")}`);
  if (signals.dateFromName) parts.push(`Période (nom fichier): ${signals.dateFromName}`);
  if (!parts.length) return "";
  return `[Indices nom de fichier]\n${parts.join("\n")}\n\n`;
}
