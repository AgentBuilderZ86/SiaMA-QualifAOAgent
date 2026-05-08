/**
 * Parsing des dates « remise / réponse » et jours restants J+N cohérents (à partir du texte, pas d’invention).
 * Fuseau / jour : même logique que calculateDeadlineDays (mi-nuit UTC sur les dates locales affichées).
 */

import type { AoRecord } from "@/lib/aoTypes";

function trim(value: unknown) {
  return String(value ?? "").trim();
}

/** Mi-nuit UTC du jour civile représentée par cette date locale (setUTC...). */
function utcMidnight(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcTodayStart(now = new Date()) {
  return utcMidnight(now.getTime());
}

/**
 * Tente de parser DATE DE REPONSE / date limite (ISO, JJ/MM/AAAA, JJ.MM.AAAA…).
 */
export function parseDateLimiteText(raw: string): number | null {
  const sRaw = trim(raw).replace(/^le\s+/i, "");
  if (!sRaw) return null;
  /** Garde JJ/MM/AAAA même si horaire ou suffixe après espace */
  const s = (sRaw.split(/\s*T/)[0] ?? sRaw).split(/\s+/)[0] ?? sRaw;

  const iso = Date.parse(sRaw);
  if (!Number.isNaN(iso)) return utcMidnight(iso);

  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (fr) {
    const dd = Number(fr[1]);
    const mm = Number(fr[2]) - 1;
    let yyyy = Number(fr[3]);
    if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000;
    if (!Number.isFinite(mm) || mm < 0 || mm > 11 || dd < 1 || dd > 31 || !Number.isFinite(yyyy)) return null;
    const guess = Date.UTC(yyyy, mm, dd);
    return Number.isNaN(guess) ? null : guess;
  }

  const frLong = s.match(/^(\d{1,2})\s+(janv|janvier|fév|fev|mars|avr|mai|juin|juil|juillet|août|aout|sept|oct|nov|déc|dec)[a-zÉéà]*\.?\s+(\d{4})/i);
  if (!frLong) return null;

  const day = Number(frLong[1]);
  const ym = Number(frLong[3]);
  const monthStr = frLong[2].toLowerCase();
  const months: Record<string, number> = {
    janv: 0,
    janvier: 0,
    fév: 1,
    fev: 1,
    mars: 2,
    avr: 3,
    mai: 4,
    juin: 5,
    juil: 6,
    juillet: 6,
    août: 7,
    aout: 7,
    sept: 8,
    oct: 9,
    nov: 10,
    déc: 11,
    dec: 11
  };
  const mi = months[monthStr];
  if (mi === undefined || !Number.isFinite(day)) return null;
  const t = Date.UTC(ym, mi, day);
  return Number.isNaN(t) ? null : t;
}

/**
 * J+N restants jusqu’à la date limite (-3 = trois jours dépassés, 0 = aujourd’hui).
 */
export function daysRemainingUntil(dateUtcMidnight: number, now = new Date()): number {
  const t0 = utcTodayStart(now);
  return Math.round((dateUtcMidnight - t0) / 86_400_000);
}

export function deriveDelaiJoursFromDateLimite(dateLimite: string, now = new Date()): number | null {
  const end = parseDateLimiteText(dateLimite);
  if (end === null) return null;
  return daysRemainingUntil(end, now);
}

/**
 * Recalcule `delaiJours` depuis `dateLimite` si elle est lisible ; sinon garde la valeur existante uniquement si ≥ -7 (erreur évidente hors plausibilité métier courte).
 */
export function normalizeAoDeadlines<T extends AoRecord>(ao: T, now = new Date()): T {
  const dl = deriveDelaiJoursFromDateLimite(ao.dateLimite, now);
  if (dl !== null) {
    return { ...ao, delaiJours: dl };
  }
  const sj = ao.delaiJours;
  if (typeof sj !== "number" || Number.isNaN(sj)) return { ...ao, delaiJours: null };
  /** Colonne Excel parfois négative large sans date lisible → on neutralise pour l’UX */
  if (sj < -30) return { ...ao, delaiJours: null };
  return ao;
}

/** AO à afficher dans le pilotage tableau de bord : date lisible ⇒ remise dans le futur incluant ce jour-J ; sinon gardé pour ne pas faire disparaître les dossiers sans date parsée. */
export function isOperationalAoByDeadline(ao: AoRecord, now = new Date()): boolean {
  const parsed = parseDateLimiteText(ao.dateLimite);
  if (parsed === null) return true;
  return parsed >= utcTodayStart(now);
}

export function operationalDeadlineSubset(records: AoRecord[], now = new Date()): AoRecord[] {
  const normalized = records.map((ao) => normalizeAoDeadlines(ao, now));
  return normalized.filter((ao) => isOperationalAoByDeadline(ao, now));
}

export function delayLabel(delaiJours: number | null | undefined): string {
  if (typeof delaiJours !== "number" || Number.isNaN(delaiJours)) return "NC";
  if (delaiJours < 0) return "Échu";
  return `J+${delaiJours}`;
}

export function urgentByDeadline(ao: AoRecord): boolean {
  return ao.delaiJours !== null && ao.delaiJours >= 0 && ao.delaiJours <= 7;
}
