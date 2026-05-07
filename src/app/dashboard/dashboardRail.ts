import type { DashboardData } from "@/lib/aoService";
import type { SideRailGroup } from "@/components/shell";

export type DashboardActiveView = "pipeline" | "calendrier" | "stats";

export function buildDashboardRail(data: DashboardData, active: DashboardActiveView): SideRailGroup[] {
  const statusCounts = {
    aq: data.totals.aQualifier,
    bo: data.records.filter((ao) => ao.statut === "BO").length,
    p2p: data.records.filter((ao) => ao.statut === "P2P").length,
    ps: data.records.filter((ao) => ao.statut === "PS").length,
    pitch: data.records.filter((ao) => ao.statut === "PITCH").length,
    pw: data.totals.won,
    pl: data.totals.lost
  };

  return [
    {
      title: "Vue",
      items: [
        { label: "📊 Pipeline", href: "/dashboard", count: data.totals.all, active: active === "pipeline" },
        { label: "📅 Calendrier", href: "/dashboard/calendrier", active: active === "calendrier" },
        { label: "📈 Stats & KPIs", href: "/dashboard/stats", active: active === "stats" },
        { label: "🗂 Historique runs", href: "/audit" }
      ]
    },
    {
      title: "Statuts",
      items: [
        { label: "⏳ A qualifier", count: statusCounts.aq },
        { label: "🔵 BO", count: statusCounts.bo },
        { label: "📝 P2P", count: statusCounts.p2p },
        { label: "📤 PS", count: statusCounts.ps },
        { label: "🎤 PITCH", count: statusCounts.pitch },
        { label: "✅ PW", count: statusCounts.pw },
        { label: "❌ PL", count: statusCounts.pl }
      ]
    },
    {
      title: "Managers",
      items: data.byManager.slice(0, 6).map((m) => ({ label: m.manager, count: m.total }))
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
