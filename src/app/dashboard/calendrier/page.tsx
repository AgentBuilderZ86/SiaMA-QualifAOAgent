import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { logoutAction, refreshAoSourcesAction } from "../actions";
import { buildDashboardRail } from "../dashboardRail";

function delayClass(jours: number | null | undefined): string {
  if (typeof jours !== "number") return "";
  if (jours <= 5) return " crit";
  if (jours <= 10) return " warn";
  return "";
}

function delayLabel(jours: number | null | undefined): string {
  if (typeof jours !== "number") return "NC";
  return `J+${jours}`;
}

export default async function DashboardCalendrierPage() {
  const user = await requireUser();
  const data = await getDashboardData();
  const rail = buildDashboardRail(data, "calendrier");

  const sorted = [...data.records].sort((a, b) => {
    const da = a.delaiJours ?? 9999;
    const db = b.delaiJours ?? 9999;
    if (da !== db) return da - db;
    return (a.dateLimite || "").localeCompare(b.dateLimite || "") || a.client.localeCompare(b.client);
  });

  return (
    <AppShell user={user} product="AO Agent" rail={rail}>
      <PageHeader
        eyebrow="Vue calendrier"
        title="Échéances et délais"
        sub={`${data.totals.all} AOs · tri par délai croissant (J+N). Les dates limites affichées proviennent des sources chargées.`}
        actions={
          <>
            <form action={refreshAoSourcesAction}>
              <button className="btn btn--ghost" type="submit">
                ↻ Rafraîchir sources
              </button>
            </form>
            <form action={logoutAction}>
              <button className="btn btn--ghost" type="submit">
                Déconnexion
              </button>
            </form>
          </>
        }
      />

      <section className="card section">
        <div className="pipe-wrap">
          <table className="pipe">
            <thead>
              <tr>
                <th>Date limite</th>
                <th>Délai</th>
                <th>Statut</th>
                <th>N° AO · Sujet</th>
                <th>Client</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ao, index) => (
                <tr key={`${ao.aoNum}-${index}`}>
                  <td className="t-mono-sm">{ao.dateLimite?.trim() || "—"}</td>
                  <td className="num">
                    <span className={`delay${delayClass(ao.delaiJours)}`}>{delayLabel(ao.delaiJours)}</span>
                  </td>
                  <td>
                    <Pill status={ao.statut} />
                  </td>
                  <td>
                    <Link href={`/ao/${encodeURIComponent(ao.aoNum)}`}>
                      <div className="sujet">{ao.sujet || "—"}</div>
                      <div className="client">
                        <span className="ao-num">{ao.displayAoNum}</span>
                      </div>
                    </Link>
                  </td>
                  <td>{ao.client}</td>
                </tr>
              ))}
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Aucun AO chargé.
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
