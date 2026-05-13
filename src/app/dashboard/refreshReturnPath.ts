/**
 * Chemin de retour après Server Action « Rafraîchir sources » (Referer + nettoyage query).
 */

const REFRESH_KEYS = ["refreshSources", "refreshMsg"] as const;

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Retire les paramètres de flash refresh pour éviter qu’ils persistent dans l’URL. */
export function stripRefreshQueryFromSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return "";
  const params = new URLSearchParams(raw);
  for (const k of REFRESH_KEYS) params.delete(k);
  const q = params.toString();
  return q ? `?${q}` : "";
}

/**
 * À partir du header Referer : chemin relatif dashboard à réutiliser après redirect.
 * Hors `/dashboard*`, retombe sur `/dashboard`.
 */
export function normalizeDashboardReturnPathFromReferer(referer: string | null | undefined): string {
  if (!referer?.trim()) return "/dashboard";
  try {
    const u = new URL(referer);
    if (!u.pathname.startsWith("/dashboard")) return "/dashboard";
    return `${u.pathname}${stripRefreshQueryFromSearch(u.search)}`;
  } catch {
    return "/dashboard";
  }
}

export type RefreshSourcesFlash = { kind: "error"; message: string } | null;

export function parseRefreshSourcesFlash(sp: Record<string, string | string[] | undefined>): RefreshSourcesFlash {
  const status = pick(sp, "refreshSources")?.trim();
  if (status !== "error") return null;
  const raw = pick(sp, "refreshMsg")?.trim();
  if (!raw) return { kind: "error", message: "Le rafraîchissement des sources a échoué." };
  try {
    return { kind: "error", message: decodeURIComponent(raw) };
  } catch {
    return { kind: "error", message: raw };
  }
}
