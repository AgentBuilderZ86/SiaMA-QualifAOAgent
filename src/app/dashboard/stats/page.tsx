import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { AppShell, PageHeader, Pill, RecoBadge } from "@/components/shell";
import { logoutAction, refreshAoSourcesAction } from "../actions";
import { buildDashboardRail } from "../dashboardRail";
import { dashboardPathWithFilters, filterDashboardRecords, parsePipelineFilters } from "../dashboardFilters";

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const data = await getDashboardData();
  const filters = parsePipelineFilters(await searchParams);
  const rail = buildDashboardRail(data, "stats", filters);

  const scoped = filterDashboardRecords(data.records, filters);
  const byStatus = (s: string) => scoped.filter((ao) => ao.statut === s).length;
  const recoGo = scoped.filter((ao) => (ao.decisionIa || "").toUpperCase() === "GO").length;
  const recoNogo = scoped.filter((ao) => (ao.decisionIa || "").toUpperCase() === "NO GO").length;
  const recoWatch = scoped.length - recoGo - recoNogo;
  const urgentFiltered = scoped.filter((ao) => ao.delaiJours !== null && ao.delaiJours <= 7).length;
  const activeFiltered = scoped.filter((ao) => ["BO", "P2P", "PS", "PITCH"].includes(ao.statut)).length;

  const subScope =
    scoped.length !== data.records.length
      ? `${scoped.length} AOs après filtre (sur ${data.records.length})`
      : `${data.totals.all} AOs suivis`;

  return (
    <AppShell user={user} product="AO Agent" rail={rail}>
      <PageHeader
        eyebrow="Pilotage"
        title="Statistiques et KPIs"
        sub={`${subScope} · dernière sync ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt))}`}
        actions={
          <>
            <form action={refreshAoSourcesAction}>
              <button className="btn btn--ghost" type="submit">
                ↻ Rafraîchir sources
              </button>
            </form>
            <Link className="btn btn--ghost" href={dashboardPathWithFilters("/dashboard", filters)}>
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
          <div className="num">{scoped.length}</div>
          <div className="delta">AOs suivis</div>
        </div>
        <div className="kpi">
          <div className="lbl">Pipeline actif</div>
          <div className="num">{activeFiltered}</div>
          <div className="delta">BO → PITCH</div>
        </div>
        <div className="kpi">
          <div className="lbl">Urgents</div>
          <div className="num">{urgentFiltered}</div>
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
              {scoped
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
              {scoped.every((ao) => !(ao.decisionIa || "").trim()) ? (
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
