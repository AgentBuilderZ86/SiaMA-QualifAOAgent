import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { AppShell, PageHeader, Pill, RecoBadge } from "@/components/shell";
import { logoutAction, refreshAoSourcesAction } from "../actions";
import { buildDashboardRail } from "../dashboardRail";

export default async function DashboardStatsPage() {
  const user = await requireUser();
  const data = await getDashboardData();
  const rail = buildDashboardRail(data, "stats");

  const byStatus = (s: string) => data.records.filter((ao) => ao.statut === s).length;
  const recoGo = data.records.filter((ao) => (ao.decisionIa || "").toUpperCase() === "GO").length;
  const recoNogo = data.records.filter((ao) => (ao.decisionIa || "").toUpperCase() === "NO GO").length;
  const recoWatch = data.records.length - recoGo - recoNogo;

  return (
    <AppShell user={user} product="AO Agent" rail={rail}>
      <PageHeader
        eyebrow="Pilotage"
        title="Statistiques et KPIs"
        sub={`Synthèse sur ${data.totals.all} AOs suivis · dernière sync ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt))}`}
        actions={
          <>
            <form action={refreshAoSourcesAction}>
              <button className="btn btn--ghost" type="submit">
                ↻ Rafraîchir sources
              </button>
            </form>
            <Link className="btn btn--ghost" href="/dashboard">
              Pipeline
            </Link>
            <form action={logoutAction}>
              <button className="btn btn--ghost" type="submit">
                Déconnexion
              </button>
            </form>
          </>
        }
      />

      <div className="kpi-strip" style={{ marginBottom: 18 }}>
        <div className="kpi active">
          <div className="lbl">Volume total</div>
          <div className="num">{data.totals.all}</div>
          <div className="delta">AOs suivis</div>
        </div>
        <div className="kpi">
          <div className="lbl">Pipeline actif</div>
          <div className="num">{data.totals.activePipeline}</div>
          <div className="delta">BO → PITCH</div>
        </div>
        <div className="kpi">
          <div className="lbl">Urgents</div>
          <div className="num">{data.totals.urgent}</div>
          <div className="delta">≤ 7 jours</div>
        </div>
        <div className="kpi">
          <div className="lbl">Reco IA</div>
          <div className="num" style={{ fontSize: 18 }}>
            {recoGo} GO · {recoWatch} WATCH · {recoNogo} NO GO
          </div>
          <div className="delta">sur décisions renseignées</div>
        </div>
      </div>

      <section className="card section">
        <h2>Répartition par statut</h2>
        <div className="pipe-wrap" style={{ marginTop: 12 }}>
          <table className="pipe">
            <thead>
              <tr>
                <th>Statut</th>
                <th className="r">Nombre</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  "A QUALIFIER",
                  "GO",
                  "NO GO",
                  "BO",
                  "P2P",
                  "PS",
                  "PITCH",
                  "PW",
                  "PL",
                  "AUTRE"
                ] as const
              ).map((st) => (
                <tr key={st}>
                  <td>
                    <Pill status={st} />
                  </td>
                  <td className="num">{byStatus(st)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>Recommandations IA (échantillon)</h2>
        <p className="muted t-meta">Les 15 premiers AOs avec une décision IA renseignée.</p>
        <div className="pipe-wrap" style={{ marginTop: 12 }}>
          <table className="pipe">
            <thead>
              <tr>
                <th>AO</th>
                <th>Client</th>
                <th>Reco</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.records
                .filter((ao) => (ao.decisionIa || "").trim())
                .slice(0, 15)
                .map((ao, i) => (
                  <tr key={`${ao.aoNum}-${i}`}>
                    <td>
                      <Link href={`/ao/${encodeURIComponent(ao.aoNum)}`}>
                        <span className="ao-num">{ao.displayAoNum}</span>
                      </Link>
                    </td>
                    <td>{ao.client}</td>
                    <td>
                      <RecoBadge recommendation={ao.decisionIa} showGlyph={false} />
                    </td>
                    <td>
                      <Pill status={ao.statut} />
                    </td>
                  </tr>
                ))}
              {data.records.every((ao) => !(ao.decisionIa || "").trim()) ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Aucune décision IA enregistrée sur les AOs chargés.
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
