import type { SideRailGroup } from "@/components/shell";

export type AoRailActive = "overview" | "qualification" | "proposal" | "pitch" | "closure";

export function buildAoRail(aoHref: string, active: AoRailActive): SideRailGroup[] {
  return [
    {
      title: "AO en cours",
      items: [
        { label: "📋 Vue d'ensemble", href: `/ao/${aoHref}`, active: active === "overview" },
        { label: "📑 Qualification", href: `/ao/${aoHref}/qualification`, active: active === "qualification" },
        { label: "💰 Simulation & propale", href: `/ao/${aoHref}/proposal`, active: active === "proposal" },
        { label: "🎤 Pitch", href: `/ao/${aoHref}/pitch`, active: active === "pitch" },
        { label: "✅ Clôture", href: `/ao/${aoHref}/closure`, active: active === "closure" }
      ]
    },
    {
      title: "Navigation",
      items: [
        { label: "📊 Pipeline", href: "/dashboard" },
        { label: "💬 SiaGPT", href: "/chat" },
        { label: "📋 Audit", href: "/audit" }
      ]
    }
  ];
}
