import Link from "next/link";
import { readSheet } from "@/lib/google";
import { requireUser } from "@/lib/auth";
import { AppShell, PageHeader, type SideRailGroup } from "@/components/shell";

export default async function AuditPage() {
  const user = await requireUser();
  const rows = await readSheet(process.env.SHEET_HIST || "Historique").catch(() => []);

  const rail: SideRailGroup[] = [
    {
      title: "Pilotage",
      items: [
        { label: "📊 Pipeline", href: "/dashboard" },
        { label: "💬 SiaGPT", href: "/chat" }
      ]
    },
    {
      title: "Audit & gouvernance",
      items: [
        { label: "📋 Historique transitions", href: "/audit", active: true },
        { label: "🛡 Règles scoring", href: "/rules" },
        { label: "⚙ Référentiels", href: "/settings" }
      ]
    }
  ];

  return (
    <AppShell user={user} product="Audit" rail={rail}>
      <PageHeader
        eyebrow="Audit"
        title="Historique des transitions"
        sub="Journal des changements de statut, générations et décisions enregistrées."
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
                <th>Date</th>
                <th>AO</th>
                <th>Ancien statut</th>
                <th>Nouveau statut</th>
                <th>Acteur</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(-100)
                .reverse()
                .map((row, index) => (
                  <tr key={`${row.Timestamp}-${index}`}>
                    <td className="t-mono-sm">{row.Timestamp || row.timestamp}</td>
                    <td>
                      <span className="ao-num">{row["N° AO"]}</span>
                    </td>
                    <td>{row["Ancien statut"]}</td>
                    <td>{row["Nouveau statut"]}</td>
                    <td>{row.Acteur}</td>
                    <td>{row.Note}</td>
                  </tr>
                ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Aucun enregistrement disponible. Configurez Google Sheets pour activer l'historique.
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
