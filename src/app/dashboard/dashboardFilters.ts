/**
 * Filtres du pipeline (/dashboard…) via query string : statuts, manager, client, reco, délai max.
 */

import { numericDelaiJours } from "@/lib/aoDeadline";
import type { AoRecord } from "@/lib/aoTypes";

export type DashboardRecoFilter = "go" | "watch" | "nogo";

export type DashboardPipelineFilters = {
  statuts: string[];
  manager?: string;
  client?: string;
  reco?: DashboardRecoFilter;
  delaiMax?: number;
};

/** `null` efface la clé correspondante (revenir à la valeur par défaut). */
export type DashboardPipelineFiltersPatch = {
  statuts?: string[] | null;
  manager?: string | null;
  client?: string | null;
  reco?: DashboardRecoFilter | null;
  delaiMax?: number | null;
};

function first(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function parseStatuts(statutsRaw: string | undefined, statutRaw: string | undefined): string[] {
  const fromPlural = statutsRaw
    ?.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (fromPlural?.length) return fromPlural;
  const one = statutRaw?.trim().toUpperCase();
  return one ? [one] : [];
}

function parseReco(v: string | undefined): DashboardRecoFilter | undefined {
  const x = v?.trim().toLowerCase();
  if (x === "go" || x === "watch" || x === "nogo") return x;
  return undefined;
}

function parsePositiveInt(v: string | undefined): number | undefined {
  if (!v?.trim()) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function parsePipelineFilters(searchParams: Record<string, string | string[] | undefined>): DashboardPipelineFilters {
  const statuts = parseStatuts(first(searchParams, "statuts"), first(searchParams, "statut"));
  const manager = first(searchParams, "manager")?.trim() || undefined;
  const client = first(searchParams, "client")?.trim() || undefined;
  const reco = parseReco(first(searchParams, "reco"));
  const delaiMax = parsePositiveInt(first(searchParams, "delai"));

  return { statuts, manager, client, reco, delaiMax };
}

export function serializedPipelineQuery(filters: DashboardPipelineFilters): string {
  const p = new URLSearchParams();
  if (filters.statuts.length) p.set("statuts", filters.statuts.join(","));
  if (filters.manager) p.set("manager", filters.manager);
  if (filters.client) p.set("client", filters.client);
  if (filters.reco) p.set("reco", filters.reco);
  if (filters.delaiMax !== undefined) p.set("delai", String(filters.delaiMax));

  const s = p.toString();
  return s.length ? `?${s}` : "";
}

/** Fusionne filtres courants avec un patch (clé absente = inchangé, `null` = effacer). */
export function patchPipelineFilters(current: DashboardPipelineFilters, patch: DashboardPipelineFiltersPatch): DashboardPipelineFilters {
  const next: DashboardPipelineFilters = { ...current };
  if ("statuts" in patch && patch.statuts !== undefined) next.statuts = patch.statuts === null ? [] : patch.statuts;
  if ("manager" in patch) next.manager = patch.manager === null ? undefined : patch.manager;
  if ("client" in patch) next.client = patch.client === null ? undefined : patch.client;
  if ("reco" in patch) next.reco = patch.reco === null ? undefined : patch.reco;
  if ("delaiMax" in patch) next.delaiMax = patch.delaiMax === null ? undefined : patch.delaiMax;
  return next;
}

export function dashboardPathWithFilters(path: string, filters: DashboardPipelineFilters): string {
  const q = serializedPipelineQuery(filters);
  return `${path}${q}`;
}

function matchesReco(ao: AoRecord, reco: DashboardRecoFilter | undefined): boolean {
  if (!reco) return true;
  const v = (ao.decisionIa || "").trim().toUpperCase();
  if (reco === "go") return v === "GO";
  if (reco === "nogo") return v === "NO GO";
  /** watch : reco renseignée mais ni GO ni NO GO */
  return Boolean(v) && v !== "GO" && v !== "NO GO";
}

export function filterDashboardRecords(records: AoRecord[], filters: DashboardPipelineFilters): AoRecord[] {
  return records.filter((ao) => {
    if (filters.statuts.length && !filters.statuts.includes(ao.statut)) return false;
    if (filters.manager && (ao.manager || "").trim() !== filters.manager.trim()) return false;
    if (filters.client) {
      const q = filters.client.toLowerCase();
      const hay = `${ao.client || ""} ${ao.sujet || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (!matchesReco(ao, filters.reco)) return false;
    if (filters.delaiMax !== undefined) {
      const dj = numericDelaiJours(ao.delaiJours);
      if (dj === null || dj < 0 || dj > filters.delaiMax) return false;
    }
    return true;
  });
}

export function sortByDelay(records: AoRecord[]): AoRecord[] {
  return [...records].sort((a, b) => (numericDelaiJours(a.delaiJours) ?? 999) - (numericDelaiJours(b.delaiJours) ?? 999));
}
