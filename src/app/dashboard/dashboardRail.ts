import type { DashboardData } from "@/lib/aoService";
import type { SideRailGroup } from "@/components/shell";
import {
  dashboardPathWithFilters,
  managersMatch,
  patchPipelineFilters,
  type DashboardPipelineFilters
} from "./dashboardFilters";

export type DashboardActiveView = "pipeline" | "calendrier" | "stats";

/** Exporté pour le panneau filtres mobile (même liste que le rail). */
export const DASHBOARD_STATUS_FILTER_ITEMS = [
  { label: "⏳ A qualifier", statut: "A QUALIFIER" },
  { label: "🔵 BO", statut: "BO" },
  { label: "📝 P2P", statut: "P2P" },
  { label: "📤 PS", statut: "PS" },
  { label: "🎤 PITCH", statut: "PITCH" },
  { label: "✅ PW", statut: "PW" },
  { label: "❌ PL", statut: "PL" }
] as const;

const STATUS_KEYS = DASHBOARD_STATUS_FILTER_ITEMS;

/** Compteurs statut pour rail et panneau mobile (même source). */
export function computeDashboardStatusCounts(data: DashboardData) {
  return {
    aq: data.totals.aQualifier,
    bo: data.records.filter((ao) => ao.statut === "BO").length,
    p2p: data.records.filter((ao) => ao.statut === "P2P").length,
    ps: data.records.filter((ao) => ao.statut === "PS").length,
    pitch: data.records.filter((ao) => ao.statut === "PITCH").length,
    pw: data.totals.won,
    pl: data.totals.lost
  };
}

type StatusCounts = ReturnType<typeof computeDashboardStatusCounts>;

export function statusCountFor(statut: string, c: StatusCounts): number {
  switch (statut) {
    case "A QUALIFIER":
      return c.aq;
    case "BO":
      return c.bo;
    case "P2P":
      return c.p2p;
    case "PS":
      return c.ps;
    case "PITCH":
      return c.pitch;
    case "PW":
      return c.pw;
    case "PL":
      return c.pl;
    default:
      return 0;
  }
}

function basePathForView(active: DashboardActiveView): string {
  if (active === "calendrier") return "/dashboard/calendrier";
  if (active === "stats") return "/dashboard/stats";
  return "/dashboard";
}

/** Rail pour les vues pipeline / calendrier / stats : liens filtres avec query préservée. */
export function buildDashboardRail(
  data: DashboardData,
  active: DashboardActiveView,
  filters: DashboardPipelineFilters
): SideRailGroup[] {
  const path = basePathForView(active);
  const statusCounts = computeDashboardStatusCounts(data);
  const countsByStatut = new Map(STATUS_KEYS.map(({ statut }) => [statut, statusCountFor(statut, statusCounts)]));

  const isStatutActive = (st: string) => filters.statuts.length === 1 && filters.statuts[0] === st;

  return [
    {
      title: "Vue",
      items: [
        {
          label: "📊 Pipeline",
          href: dashboardPathWithFilters("/dashboard", filters),
          count: data.totals.all,
          active: active === "pipeline"
        },
        {
          label: "📅 Calendrier",
          href: dashboardPathWithFilters("/dashboard/calendrier", filters),
          active: active === "calendrier"
        },
        {
          label: "📈 Stats & KPIs",
          href: dashboardPathWithFilters("/dashboard/stats", filters),
          active: active === "stats"
        },
        { label: "🗂 Historique runs", href: "/audit" }
      ]
    },
    {
      title: "Statuts",
      items: STATUS_KEYS.map(({ label, statut }) => {
        const merged = patchPipelineFilters(filters, { statuts: [statut], manager: null, client: null, reco: null, delaiMax: null });
        return {
          label,
          count: countsByStatut.get(statut) ?? 0,
          href: dashboardPathWithFilters(path, merged),
          active: isStatutActive(statut)
        };
      })
    },
    {
      title: "Managers",
      items: data.byManager.slice(0, 6).map((m) => {
        const merged = patchPipelineFilters(filters, { manager: m.manager, reco: null, delaiMax: null });
        return {
          label: m.manager,
          count: m.total,
          href: dashboardPathWithFilters(path, merged),
          active: Boolean(filters.manager && managersMatch(m.manager, filters.manager))
        };
      })
    },
    {
      title: "Outils",
      items: [
        { label: "💬 Ouvrir SiaGPT", href: "/chat" },
        { label: "⚙ Référentiels", href: "/settings" },
        { label: "🛡 Règles", href: "/rules" },
        { label: "📋 Audit", href: "/audit" }
      ]
    }
  ];
}
