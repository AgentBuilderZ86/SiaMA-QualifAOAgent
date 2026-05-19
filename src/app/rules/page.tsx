import Link from "next/link";
import { readSheet } from "@/lib/google";
import { requireUser } from "@/lib/auth";
import { AppShell, PageHeader, type SideRailGroup } from "@/components/shell";

export default async function RulesPage() {
  const user = await requireUser();
  let rules: Record<string, string>[] = [];
  let feedback: Record<string, string>[] = [];
  let error = "";

  try {
    rules = await readSheet(process.env.SHEET_RULES || "Règles_Scoring");
    feedback = await readSheet(process.env.SHEET_FEEDBACK || "Feedback_Règles");
  } catch (err) {
    error = err instanceof Error ? err.message : "Règles non disponibles.";
  }

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
        { label: "🛡 Règles scoring", href: "/rules", active: true },
        { label: "⚙ Référentiels", href: "/settings" }
      ]
    }
  ];

  return (
    <AppShell user={user} product="Règles" rail={rail}>
      <PageHeader
        eyebrow="Scoring"
        title="Règles et apprentissage"
        sub="Lecture des règles actives et feedback manager depuis Google Sheets."
        actions={
          <Link className="btn btn--ghost" href="/dashboard">
            ← Pipeline
          </Link>
        }
      />

      {error ? <div className="alert" style={{ marginBottom: 16 }}>{error}</div> : null}

      <section className="card section">
        <h2>Règles scoring</h2>
        <p className="muted">{rules.length} règle(s) actives</p>
        <div className="pipe-wrap" style={{ marginTop: 12 }}>
          <table className="pipe">
            <thead>
              <tr>
                <th>Type</th>
                <th>Keywords</th>
                <th className="r">Score</th>
                <th>Manager</th>
                <th>Source / raison</th>
              </tr>
            </thead>
            <tbody>
              {rules.slice(0, 80).map((rule, index) => (
                <tr key={`${rule.type}-${index}`}>
                  <td>{rule.type}</td>
                  <td>{rule.keywords}</td>
                  <td className="num">{rule.score}</td>
                  <td className="mgr">{rule.manager}</td>
                  <td>{rule.reason}</td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Aucune règle disponible.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>Feedback manager</h2>
        <p className="muted">{feedback.length} retour(s) enregistré(s)</p>
        <div className="pipe-wrap" style={{ marginTop: 12 }}>
          <table className="pipe">
            <thead>
              <tr>
                <th>AO</th>
                <th>Décision IA</th>
                <th>Décision manager</th>
                <th>Motif</th>
                <th>Statut</th>
                <th>Manager actuel</th>
                <th>Manager recommandé</th>
                <th>Type</th>
                <th>Signal acquisition</th>
              </tr>
            </thead>
            <tbody>
              {feedback.slice(0, 80).map((row, index) => (
                <tr key={`${row.ao_num}-${index}`}>
                  <td>
                    <span className="ao-num">{row.ao_num}</span>
                  </td>
                  <td>{row.decision_ia}</td>
                  <td>{row.decision_manager}</td>
                  <td>{row.motif_manager}</td>
                  <td>{row.statut}</td>
                  <td>{row.manager_actuel}</td>
                  <td>{row.manager_recommande}</td>
                  <td>{row.type_feedback}</td>
                  <td>{row.acquisition_signal || row.source_name || ""}</td>
                </tr>
              ))}
              {feedback.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted">
                    Aucun feedback enregistré.
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
