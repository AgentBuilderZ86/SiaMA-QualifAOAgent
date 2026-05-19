import Link from "next/link";
import { aoRepository } from "@/lib/aoRepository";
import { requireAdmin } from "@/lib/auth";
import { AppShell, PageHeader, type SideRailGroup } from "@/components/shell";

export default async function SettingsPage() {
  const user = await requireAdmin();
  const referentials = await aoRepository.readReferentials();

  const rail: SideRailGroup[] = [
    {
      title: "Pilotage",
      items: [
        { label: "📊 Pipeline", href: "/dashboard" },
        { label: "🧑‍💼 Office Manager", href: "/office-manager" },
        { label: "💬 SiaGPT", href: "/chat" }
      ]
    },
    {
      title: "Audit & gouvernance",
      items: [
        { label: "📋 Historique transitions", href: "/audit" },
        { label: "🛡 Règles scoring", href: "/rules" },
        { label: "⚙ Référentiels", href: "/settings", active: true }
      ]
    }
  ];

  return (
    <AppShell user={user} product="Référentiels" rail={rail}>
      <PageHeader
        eyebrow="Paramètres"
        title="Référentiels sourcés"
        sub="Les calculs financiers utilisent ces valeurs. Toute hypothèse doit avoir une source renseignée."
        actions={
          <Link className="btn btn--ghost" href="/dashboard">
            ← Pipeline
          </Link>
        }
      />

      <section className="card section">
        <div className="pipe-wrap">
          <table className="pipe">
            <thead>
              <tr>
                <th>Type</th>
                <th>Nom</th>
                <th className="r">Valeur</th>
                <th>Unité</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {referentials.map((item) => (
                <tr key={`${item.type}-${item.name}`}>
                  <td>{item.type}</td>
                  <td>{item.name}</td>
                  <td className="num">{item.value}</td>
                  <td>{item.unit}</td>
                  <td>{item.source}</td>
                </tr>
              ))}
              {referentials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Aucun référentiel disponible.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
