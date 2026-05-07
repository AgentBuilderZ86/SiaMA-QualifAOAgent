import Link from "next/link";
import { aoRepository } from "@/lib/aoRepository";
import { requireAdmin } from "@/lib/auth";

export default async function SettingsPage() {
  await requireAdmin();
  const referentials = await aoRepository.readReferentials();

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">Paramètres</p>
            <h1>Référentiels sourcés</h1>
            <p className="muted">
              Les calculs financiers utilisent ces valeurs. Toute hypothèse doit avoir une source renseignée.
            </p>
          </div>
          <Link className="button ghost" href="/dashboard">
            Retour dashboard
          </Link>
        </section>

        <section className="card section" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Nom</th>
                <th>Valeur</th>
                <th>Unité</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {referentials.map((item) => (
                <tr key={`${item.type}-${item.name}`}>
                  <td>{item.type}</td>
                  <td>{item.name}</td>
                  <td>{item.value}</td>
                  <td>{item.unit}</td>
                  <td>{item.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
