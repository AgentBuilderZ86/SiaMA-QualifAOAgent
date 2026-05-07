/**
 * Extraction de métadonnées par regex sur le texte brut du dossier (ordre de priorité documentaire).
 * Complète extractDocumentSections ; ne remplace pas une section déjà renseignée par findSection.
 */

export type KeyDocumentMetadata = {
  dateLimite?: string;
  budget?: string;
  duree?: string;
  maitreOuvrage?: string;
  lieu?: string;
  emails: string[];
  /** Résumés courts des correspondances (audit interne) */
  matchNotes: string[];
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Dates type JJ/MM/AAAA ou JJ.MM.AAAA */
const DATE_SLASH = /\b(\d{1,2})[/.\s](\d{1,2})[/.\s](\d{2,4})\b/g;

function pushNote(notes: string[], msg: string) {
  if (!notes.includes(msg)) notes.push(msg);
}

function findFirstBudget(text: string, notes: string[]): string | undefined {
  const patterns: RegExp[] = [
    /\b(\d[\d\s]{2,})\s*(dh|mad|dirhams?)\b/gi,
    /budget\s*[:\s]+(\d[\d\s]+)/gi,
    /montant\s*[:\s]+(\d[\d\s]+)/gi,
    /enveloppe\s*[:\s]+(\d[\d\s]+)/gi
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      const raw = m[1] ?? m[0];
      const cleaned = String(raw).replace(/\s+/g, " ").trim();
      if (cleaned.length >= 2) {
        pushNote(notes, `Budget (regex): ${cleaned}`);
        return cleaned + (m[2] ? ` ${String(m[2]).toUpperCase()}` : "");
      }
    }
  }
  return undefined;
}

function findDateLimite(text: string, notes: string[]): string | undefined {
  const snippets = [
    /date\s+limite\s*[:\s]+(.{0,80}?)(?:\n|$)/i,
    /avant\s+le\s*[:\s]*(.{0,40})/i,
    /remise\s+des\s+offres\s*[:\s]*(.{0,80}?)(?:\n|$)/i
  ];
  for (const re of snippets) {
    const m = text.match(re);
    if (m?.[1]) {
      const slice = m[1].trim().slice(0, 120);
      pushNote(notes, `Date limite (contexte): ${slice}`);
      return slice;
    }
  }
  let best = "";
  DATE_SLASH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_SLASH.exec(text)) !== null) {
    const candidate = `${match[1]}/${match[2]}/${match[3].length === 2 ? "20" + match[3] : match[3]}`;
    if (candidate.length > best.length) best = candidate;
  }
  if (best) {
    pushNote(notes, `Date (regex): ${best}`);
    return best;
  }
  return undefined;
}

function findDuree(text: string, notes: string[]): string | undefined {
  const jour = text.match(/\b(\d{1,4})\s*jours?\s*(ouvrables?|calendaires?)?/i);
  if (jour) {
    const s = `${jour[1]} jour(s)${jour[2] ? " " + jour[2] : ""}`;
    pushNote(notes, `Durée: ${s}`);
    return s;
  }
  const mois = text.match(/\bdurée\s*[:\s]+(\d+)\s*(mois|semaines?)/i);
  if (mois) {
    const s = `${mois[1]} ${mois[2]}`;
    pushNote(notes, `Durée: ${s}`);
    return s;
  }
  return undefined;
}

function findMaitreOuvrage(text: string, notes: string[]): string | undefined {
  const patterns = [
    /maître\s*d['']ouvrage\s*[:\s]+(.{1,120}?)(?:\n|\.|;)/i,
    /maitre\s*d['']ouvrage\s*[:\s]+(.{1,120}?)(?:\n|\.|;)/i,
    /commanditaire\s*[:\s]+(.{1,120}?)(?:\n|\.|;)/i,
    /client\s*[:\s]+(.{1,80}?)(?:\n|\.|;)/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim().replace(/\s+/g, " ").slice(0, 200);
      if (v.length > 3) {
        pushNote(notes, `MO/client (regex): ${v.slice(0, 60)}…`);
        return v;
      }
    }
  }
  return undefined;
}

function findLieu(text: string, notes: string[]): string | undefined {
  const patterns = [
    /lieu\s*(?:de\s*)?(?:réunion|exécution|prestation)\s*[:\s]+(.{1,100}?)(?:\n|\.|;)/i,
    /\b(?:à|résidence)\s+([A-ZÉÈÀÂ][a-zéèàâôûç\-]+(?:\s+[A-ZÉÈÀÂ][a-zéèàâôûç\-]+)?)\b/
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim().slice(0, 120);
      if (v.length > 2) {
        pushNote(notes, `Lieu: ${v}`);
        return v;
      }
    }
  }
  return undefined;
}

function collectEmails(text: string, notes: string[]): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(EMAIL_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    const e = m[0].toLowerCase();
    if (!e.endsWith(".png") && !e.endsWith(".jpg")) set.add(e);
  }
  const arr = [...set].slice(0, 12);
  if (arr.length) pushNote(notes, `${arr.length} email(s) détecté(s)`);
  return arr;
}

export function extractKeyMetadata(fullText: string): KeyDocumentMetadata {
  const notes: string[] = [];
  const emails = collectEmails(fullText, notes);
  return {
    dateLimite: findDateLimite(fullText, notes),
    budget: findFirstBudget(fullText, notes),
    duree: findDuree(fullText, notes),
    maitreOuvrage: findMaitreOuvrage(fullText, notes),
    lieu: findLieu(fullText, notes),
    emails,
    matchNotes: notes
  };
}

/** True si la valeur section est vide ou placeholder */
export function isPlaceholderSection(value: string): boolean {
  const v = value.trim().toLowerCase();
  return !v || v === "à confirmer" || v === "nc" || v === "non trouvé dans le document." || v.length < 4;
}
