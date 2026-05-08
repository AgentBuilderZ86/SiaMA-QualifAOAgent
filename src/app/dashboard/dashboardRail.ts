import type { DashboardData } from "@/lib/aoService";
import type { SideRailGroup } from "@/components/shell";
import {
  dashboardPathWithFilters,
  patchPipelineFilters,
  type DashboardPipelineFilters
} from "./dashboardFilters";

export type DashboardActiveView = "pipeline" | "calendrier" | "stats";

const STATUS_KEYS = [
  { label: "⏳ A qualifier", statut: "A QUALIFIER" },
  { label: "🔵 BO", statut: "BO" },
  { label: "📝 P2P", statut: "P2P" },
  { label: "📤 PS", statut: "PS" },
  { label: "🎤 PITCH", statut: "PITCH" },
  { label: "✅ PW", statut: "PW" },
  { label: "❌ PL", statut: "PL" }
] as const;

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
  const statusCounts = {
    aq: data.totals.aQualifier,
    bo: data.records.filter((ao) => ao.statut === "BO").length,
    p2p: data.records.filter((ao) => ao.statut === "P2P").length,
    ps: data.records.filter((ao) => ao.statut === "PS").length,
    pitch: data.records.filter((ao) => ao.statut === "PITCH").length,
    pw: data.totals.won,
    pl: data.totals.lost
  };
  const countsByStatut = new Map(
    STATUS_KEYS.map(({ statut }) => [
      statut,
      statut === "A QUALIFIER"
        ? statusCounts.aq
        : statut === "BO"
          ? statusCounts.bo
          : statut === "P2P"
            ? statusCounts.p2p
            : statut === "PS"
              ? statusCounts.ps
              : statut === "PITCH"
                ? statusCounts.pitch
                : statut === "PW"
                  ? statusCounts.pw
                  : statut === "PL"
                    ? statusCounts.pl
                    : 0
    ])
  );

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
          active: Boolean(filters.manager && filters.manager.trim() === m.manager.trim())
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
