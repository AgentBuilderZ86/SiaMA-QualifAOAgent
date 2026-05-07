import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { logoutAction, refreshAoSourcesAction } from "./actions";
import { AppShell, PageHeader, Pill, RecoBadge } from "@/components/shell";
import { buildDashboardRail } from "./dashboardRail";

type DashboardAo = Awaited<ReturnType<typeof getDashboardData>>["records"][number];
const PIPELINE_STATUSES = ["A QUALIFIER", "GO", "BO", "P2P", "PS", "PITCH", "PW", "PL", "NO GO"] as const;

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

function managerInitials(name: string): string {
  if (!name) return "··";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatBudget(value: string | undefined): string {
  if (!value) return "—";
  return value;
}

function PipelineTable({ records, emptyLabel }: { records: DashboardAo[]; emptyLabel: string }) {
  return (
    <div className="pipe-wrap">
      <table className="pipe">
        <thead>
          <tr>
            <th>Statut</th>
            <th>N° AO · Sujet</th>
            <th>Manager</th>
            <th>Reco</th>
            <th className="r">Budget</th>
            <th className="r">Délai</th>
          </tr>
        </thead>
        <tbody>
          {records.map((ao, index) => (
            <tr key={`${ao.sourceTab}-${ao.aoNum}-${index}`}>
              <td>
                <Pill status={ao.statut} />
              </td>
              <td>
                <Link href={`/ao/${encodeURIComponent(ao.aoNum)}`}>
                  <div className="sujet">{ao.sujet || ao.client}</div>
                  <div className="client">
                    {ao.client} · <span className="ao-num">{ao.displayAoNum}</span>
                  </div>
                </Link>
              </td>
              <td>
                <div className="mgr-cell">
                  <span className="sw">{managerInitials(ao.manager)}</span>
                  <span className="mgr">{ao.manager || "—"}</span>
                </div>
              </td>
              <td>
                <RecoBadge recommendation={ao.decisionIa} showGlyph={false} />
              </td>
              <td className="num">{formatBudget(ao.budget)}</td>
              <td className="num">
                <span className={`delay${delayClass(ao.delaiJours)}`}>{delayLabel(ao.delaiJours)}</span>
              </td>
            </tr>
          ))}
          {records.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PipelineKanban({ records }: { records: DashboardAo[] }) {
  return (
    <div className="pipeline-board">
      {PIPELINE_STATUSES.map((status) => {
        const items = records.filter((ao) => ao.statut === status);
        return (
          <div className="pipeline-column" key={status}>
            <div className="pipeline-column-header">
              <Pill status={status} />
              <strong>{items.length}</strong>
            </div>
            {items
              .sort((a, b) => (a.delaiJours ?? 999) - (b.delaiJours ?? 999))
              .slice(0, 5)
              .map((ao) => (
                <Link
                  className="pipeline-card"
                  href={`/ao/${encodeURIComponent(ao.aoNum)}`}
                  key={`${ao.sourceTab}-${ao.aoNum}`}
                >
                  <strong>{ao.client}</strong>
                  <span>{ao.sujet}</span>
                  <small>
                    {ao.delaiJours !== null ? `J+${ao.delaiJours}` : "Délai NC"} ·{" "}
                    {ao.sourceKind === "google-sheet" ? "Google" : "Scrappé"}
                  </small>
                </Link>
              ))}
            {items.length === 0 ? <p className="muted t-meta">Aucune opportunité</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData();

  const generatedAt = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(data.generatedAt));

  const sourceLabel =
    data.sourceMode === "hybrid"
      ? "sources publiques et Google Sheets"
      : data.sourceMode === "native"
        ? "sources publiques natives"
        : data.sourceMode === "google"
          ? "Google Sheets"
          : "aucune source configurée";

  const statusCounts = {
    aq: data.totals.aQualifier,
    bo: data.records.filter((ao) => ao.statut === "BO").length,
    p2p: data.records.filter((ao) => ao.statut === "P2P").length,
    ps: data.records.filter((ao) => ao.statut === "PS").length,
    pitch: data.records.filter((ao) => ao.statut === "PITCH").length,
    pw: data.totals.won,
    pl: data.totals.lost
  };

  const recoCounts = {
    go: data.records.filter((ao) => (ao.decisionIa || "").toUpperCase() === "GO").length,
    watch: data.records.filter((ao) => {
      const v = (ao.decisionIa || "").toUpperCase();
      return v && v !== "GO" && v !== "NO GO";
    }).length,
    nogo: data.records.filter((ao) => (ao.decisionIa || "").toUpperCase() === "NO GO").length
  };

  const rail = buildDashboardRail(data, "pipeline");

  return (
    <AppShell user={user} product="AO Agent" rail={rail}>
      <PageHeader
        eyebrow="Pipeline AO · Maroc"
        title="Pipeline AO"
        sub={`${data.totals.all} AOs suivis · ${recoCounts.go} GO · ${recoCounts.watch} WATCH · ${recoCounts.nogo} NO GO · sync ${generatedAt}`}
        actions={
          <>
            <form action={refreshAoSourcesAction}>
              <button className="btn btn--ghost" type="submit">
                ↻ Rafraîchir sources
              </button>
            </form>
            <Link className="btn btn--ghost" href="/settings">
              Référentiels
            </Link>
            <Link className="btn btn--ghost" href="/rules">
              Règles
            </Link>
            <Link className="btn btn--ghost" href="/audit">
              Audit
            </Link>
            <form action={logoutAction}>
              <button className="btn btn--ghost" type="submit">
                Déconnexion
              </button>
            </form>
          </>
        }
      />

      {!data.configured ? (
        <section className="card section">
          <h2>Aucune source AO chargée</h2>
          <p className="muted">
            Lancez un rafraîchissement des sources publiques ou configurez Google Sheets pour afficher les AOs suivis (
            {sourceLabel}).
          </p>
          {data.missingConfig.length ? (
            <div className="alert" style={{ marginTop: 12 }}>
              Variables Google manquantes : {data.missingConfig.join(", ")}
            </div>
          ) : null}
        </section>
      ) : data.loadError ? (
        <section className="card section">
          <h2>Connexion Google à finaliser</h2>
          <p className="muted">L'ID du Google Sheet est configuré, mais le serveur n'a pas encore de droits API pour le lire.</p>
          <div className="alert" style={{ marginTop: 12 }}>
            {data.loadError}
          </div>
        </section>
      ) : (
        <>
          {/* KPI strip dark */}
          <div className="kpi-strip">
            <div className="kpi">
              <div className="lbl">⏳ A qualifier</div>
              <div className="num">{statusCounts.aq}</div>
              <div className="delta">{data.totals.urgent} urgents</div>
            </div>
            <div className="kpi active">
              <div className="lbl">🔵 BO</div>
              <div className="num">{statusCounts.bo}</div>
              <div className="delta">Pipeline qualifié</div>
            </div>
            <div className="kpi">
              <div className="lbl">📝 P2P</div>
              <div className="num">{statusCounts.p2p}</div>
              <div className="delta">{recoCounts.watch} WATCH</div>
            </div>
            <div className="kpi">
              <div className="lbl">📤 PS</div>
              <div className="num">{statusCounts.ps}</div>
              <div className="delta">en attente client</div>
            </div>
            <div className="kpi">
              <div className="lbl">🎤 PITCH</div>
              <div className="num">{statusCounts.pitch}</div>
              <div className="delta">soutenances</div>
            </div>
            <div className="kpi">
              <div className="lbl">✅ PW</div>
              <div className="num">{statusCounts.pw}</div>
              <div className="delta">remportés</div>
            </div>
            <div className="kpi">
              <div className="lbl">❌ PL</div>
              <div className="num">{statusCounts.pl}</div>
              <div className="delta">perdus</div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="filter-bar">
            <span className="fchip on">
              🔵 BO + P2P <span className="x">×</span>
            </span>
            <span className="fchip">＋ Manager</span>
            <span className="fchip">＋ Client</span>
            <span className="fchip">＋ Délai</span>
            <span className="fchip">＋ Recommandation</span>
            <span className="spacer" />
            <span className="view">
              {data.recent.length} résultats · trié par délai croissant
            </span>
          </div>

          {/* Pipeline principal */}
          <section className="card section" style={{ padding: 0, marginBottom: 16 }}>
            <div style={{ padding: "16px 18px 0" }}>
              <p className="eyebrow">Pipeline opérationnel</p>
              <h2>AOs actifs · les 20 plus récents</h2>
            </div>
            <div style={{ padding: "12px 18px 18px" }}>
              <PipelineTable
                records={data.recent.slice(0, 20)}
                emptyLabel="Aucun AO chargé."
              />
            </div>
          </section>

          {/* AOs urgents + charge par manager */}
          <section className="grid two-col">
            <div className="card section">
              <p className="eyebrow">Vigilance délai</p>
              <h2>AOs urgents (≤ 7 jours)</h2>
              <div className="pipe-wrap" style={{ marginTop: 12 }}>
                <table className="pipe">
                  <thead>
                    <tr>
                      <th>Statut</th>
                      <th>N° AO · Sujet</th>
                      <th className="r">Délai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.urgent.map((ao, index) => (
                      <tr key={`urgent-${ao.aoNum}-${index}`}>
                        <td>
                          <Pill status={ao.statut} />
                        </td>
                        <td>
                          <Link href={`/ao/${encodeURIComponent(ao.aoNum)}`}>
                            <div className="sujet">{ao.sujet || ao.client}</div>
                            <div className="client">
                              {ao.client} · <span className="ao-num">{ao.displayAoNum}</span>
                            </div>
                          </Link>
                        </td>
                        <td className="num">
                          <span className={`delay${delayClass(ao.delaiJours)}`}>{delayLabel(ao.delaiJours)}</span>
                        </td>
                      </tr>
                    ))}
                    {data.urgent.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="muted">
                          Aucun délai critique dans les données chargées.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card section">
              <p className="eyebrow">Charge équipe</p>
              <h2>Charge par manager</h2>
              <div className="pipe-wrap" style={{ marginTop: 12 }}>
                <table className="pipe">
                  <thead>
                    <tr>
                      <th>Manager</th>
                      <th className="r">Total</th>
                      <th className="r">GO</th>
                      <th className="r">Urgent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byManager.map((item) => (
                      <tr key={item.manager}>
                        <td>
                          <div className="mgr-cell">
                            <span className="sw">{managerInitials(item.manager)}</span>
                            <span className="mgr">{item.manager || "—"}</span>
                          </div>
                        </td>
                        <td className="num">{item.total}</td>
                        <td className="num">{item.go}</td>
                        <td className="num">{item.urgent}</td>
                      </tr>
                    ))}
                    {data.byManager.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          Aucun manager renseigné.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Vue par phase (kanban replié) */}
          <details className="collapsible-panel" style={{ marginTop: 16 }}>
            <summary>Vue par phase · pipeline kanban</summary>
            <div style={{ marginTop: 14 }}>
              <PipelineKanban records={data.records} />
            </div>
          </details>

          {/* Source breakdown */}
          <details className="collapsible-panel" style={{ marginTop: 16 }}>
            <summary>Sources · {data.googleSheetRecords.length} Google Sheets · {data.scrapedRecords.length} scrappés</summary>
            <div style={{ marginTop: 14 }}>
              <p className="t-meta">Source interne prioritaire : si un AO scrappé correspond à cette liste, il est retiré du groupe scrappé.</p>
              <PipelineTable
                records={data.googleSheetRecords.slice(0, 30)}
                emptyLabel="Aucun AO Google Sheets chargé."
              />
              <h3 style={{ marginTop: 16 }}>AO scrappés dédoublonnés</h3>
              <PipelineTable
                records={data.scrapedRecords.slice(0, 30)}
                emptyLabel="Aucun AO scrappé distinct du fichier Google Sheets."
              />
            </div>
          </details>

          {/* Journal de collecte */}
          {data.sourceReport.length ? (
            <details className="collapsible-panel" style={{ marginTop: 16 }}>
              <summary>Journal de collecte · {data.sourceReport.length} sources</summary>
              <div className="pipe-wrap" style={{ marginTop: 14 }}>
                <table className="pipe">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th className="r">Avis retenus</th>
                      <th>Dernière collecte</th>
                      <th>Alertes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sourceReport.map((item) => (
                      <tr key={`${item.sourceName}-${item.collectedAt}`}>
                        <td>{item.sourceName}</td>
                        <td className="num">{item.count}</td>
                        <td>
                          {item.collectedAt
                            ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(
                                new Date(item.collectedAt)
                              )
                            : "NC"}
                        </td>
                        <td>{item.errors.length ? item.errors.join(" | ") : "Aucune"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
