import Link from "next/link";
import { readSheet } from "@/lib/google";
import { requireUser } from "@/lib/auth";

export default async function RulesPage() {
  await requireUser();
  let rules: Record<string, string>[] = [];
  let feedback: Record<string, string>[] = [];
  let error = "";

  try {
    rules = await readSheet(process.env.SHEET_RULES || "Règles_Scoring");
    feedback = await readSheet(process.env.SHEET_FEEDBACK || "Feedback_Règles");
  } catch (err) {
    error = err instanceof Error ? err.message : "Règles non disponibles.";
  }

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">Scoring</p>
            <h1>Règles et apprentissage</h1>
            <p className="muted">Lecture des règles actives et feedback manager depuis Google Sheets.</p>
          </div>
          <Link className="button ghost" href="/dashboard">
            Retour dashboard
          </Link>
        </section>

        {error ? <div className="alert" style={{ marginTop: 16 }}>{error}</div> : null}

        <section className="card section" style={{ marginTop: 16 }}>
          <h2>Règles scoring</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Keywords</th>
                <th>Score</th>
                <th>Manager</th>
                <th>Source / raison</th>
              </tr>
            </thead>
            <tbody>
              {rules.slice(0, 80).map((rule, index) => (
                <tr key={`${rule.type}-${index}`}>
                  <td>{rule.type}</td>
                  <td>{rule.keywords}</td>
                  <td>{rule.score}</td>
                  <td>{rule.manager}</td>
                  <td>{rule.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card section" style={{ marginTop: 16 }}>
          <h2>Feedback manager</h2>
          <table className="table">
            <thead>
              <tr>
                <th>AO</th>
                <th>Décision IA</th>
                <th>Décision manager</th>
                <th>Motif</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {feedback.slice(0, 80).map((row, index) => (
                <tr key={`${row.ao_num}-${index}`}>
                  <td>{row.ao_num}</td>
                  <td>{row.decision_ia}</td>
                  <td>{row.decision_manager}</td>
                  <td>{row.motif_manager}</td>
                  <td>{row.statut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
