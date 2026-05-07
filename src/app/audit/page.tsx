import Link from "next/link";
import { readSheet } from "@/lib/google";
import { requireUser } from "@/lib/auth";

export default async function AuditPage() {
  await requireUser();
  const rows = await readSheet(process.env.SHEET_HIST || "Historique").catch(() => []);

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">Audit</p>
            <h1>Historique des transitions</h1>
            <p className="muted">Journal des changements de statut, générations et décisions enregistrées.</p>
          </div>
          <Link className="button ghost" href="/dashboard">
            Retour dashboard
          </Link>
        </section>

        <section className="card section" style={{ marginTop: 16 }}>
          <table className="table">
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
              {rows.slice(-100).reverse().map((row, index) => (
                <tr key={`${row.Timestamp}-${index}`}>
                  <td>{row.Timestamp || row.timestamp}</td>
                  <td>{row["N° AO"] || row["N° AO"]}</td>
                  <td>{row["Ancien statut"]}</td>
                  <td>{row["Nouveau statut"]}</td>
                  <td>{row.Acteur}</td>
                  <td>{row.Note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
