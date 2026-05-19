import type { SideRailGroup, SideRailItem } from "@/components/shell";

export type AoRailActive = "overview" | "qualification" | "proposal" | "atelier" | "pitch" | "closure";

export function buildAoRail(aoHref: string, active: AoRailActive, workflowStatut?: string): SideRailGroup[] {
  const showAtelier = workflowStatut === "BO" || workflowStatut === "P2P";
  const items: SideRailItem[] = [
    { label: "📋 Vue d'ensemble", href: `/ao/${aoHref}`, active: active === "overview" },
    { label: "🔁 Réaffecter / statuer", href: `/ao/${aoHref}#pilotage-manager` },
    { label: "📑 Qualification", href: `/ao/${aoHref}/qualification`, active: active === "qualification" },
    { label: "💰 Simulation & propale", href: `/ao/${aoHref}/proposal`, active: active === "proposal" }
  ];
  if (showAtelier) {
    items.push({
      label: "🧭 Atelier réponse",
      href: `/ao/${aoHref}/atelier-reponse`,
      active: active === "atelier"
    });
  }
  items.push(
    { label: "🎤 Pitch", href: `/ao/${aoHref}/pitch`, active: active === "pitch" },
    { label: "✅ Clôture", href: `/ao/${aoHref}/closure`, active: active === "closure" }
  );
  return [
    {
      title: "AO en cours",
      items
    },
    {
      title: "Navigation",
      items: [
        { label: "📊 Pipeline", href: "/dashboard" },
        { label: "🧑‍💼 Office Manager", href: "/office-manager" },
        { label: "💬 SiaGPT", href: "/chat" },
        { label: "📋 Audit", href: "/audit" }
      ]
    }
  ];
}
