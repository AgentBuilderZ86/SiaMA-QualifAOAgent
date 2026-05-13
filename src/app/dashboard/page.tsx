import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { delayLabel, numericDelaiJours, urgentByDeadline } from "@/lib/aoDeadline";
import { logoutAction, refreshAoSourcesAction } from "./actions";
import { AppShell, PageHeader, Pill, RecoBadge } from "@/components/shell";
import {
  dashboardPathWithFilters,
  filterDashboardRecords,
  groupRecordsByManager,
  parsePipelineFilters,
  patchPipelineFilters,
  sortByDelay,
  type DashboardPipelineFilters
} from "./dashboardFilters";
import { buildDashboardRail } from "./dashboardRail";
import { DashboardClientSearchForm } from "./DashboardExtendFilter";
import { DashboardMobileFilters } from "./DashboardMobileFilters";
import { RefreshSourcesFlash } from "./RefreshSourcesFlash";

export const dynamic = "force-dynamic";

type DashSearchParams = Record<string, string | string[] | undefined>;

function setEqStatuts(filters: DashboardPipelineFilters, expected: string[]) {
  const a = [...filters.statuts].sort().join("|");
  const b = [...expected].sort().join("|");
  return a === b;
}

function hasSecondaryFilters(filters: DashboardPipelineFilters) {
  return Boolean(filters.manager || filters.client || filters.reco || filters.delaiMax !== undefined);
}

type DashboardAo = Awaited<ReturnType<typeof getDashboardData>>["records"][number];
const PIPELINE_STATUSES = ["A QUALIFIER", "GO", "BO", "P2P", "PS", "PITCH", "PW", "PL", "NO GO"] as const;

function delayClass(jours: number | null | undefined): string {
  if (typeof jours !== "number") return "";
  if (jours < 0) return " crit";
  if (jours <= 5) return " crit";
  if (jours <= 10) return " warn";
  return "";
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
              .sort((a, b) => (numericDelaiJours(a.delaiJours) ?? 999) - (numericDelaiJours(b.delaiJours) ?? 999))
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
                    {delayLabel(ao.delaiJours)} · {ao.sourceKind === "google-sheet" ? "Google" : "Scrappé"}
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashSearchParams> }) {
  const user = await requireUser();
  const data = await getDashboardData();
  const sp = await searchParams;
  const filters = parsePipelineFilters(sp);

  const scopedRecords = filterDashboardRecords(data.records, filters);
  const filteredPipeline = sortByDelay(scopedRecords).slice(0, 20);
  const scopedUrgent = sortByDelay(scopedRecords.filter(urgentByDeadline)).slice(0, 12);
  const scopedByManager = groupRecordsByManager(scopedRecords).slice(0, 8);

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

  const rail = buildDashboardRail(data, "pipeline", filters);

  const noPipelineFilters = filters.statuts.length === 0 && !hasSecondaryFilters(filters);
  const hasAnyFilter =
    filters.statuts.length > 0 ||
    Boolean(filters.manager) ||
    Boolean(filters.client) ||
    Boolean(filters.reco) ||
    filters.delaiMax !== undefined;
  const isBoP2p =
    filters.statuts.length === 2 &&
    setEqStatuts(filters, ["BO", "P2P"]) &&
    !hasSecondaryFilters(filters);
  const kpiExclusive =
    filters.statuts.length === 1 &&
    !hasSecondaryFilters(filters) ? filters.statuts[0] : null;

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

      <RefreshSourcesFlash searchParams={sp} />

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
          <DashboardMobileFilters data={data} active="pipeline" filters={filters} />

          {/* KPI strip dark — liens vers filtres par statut */}
          <div className="kpi-strip">
            <Link
              className={`kpi${kpiExclusive === "A QUALIFIER" ? " active" : ""}`}
              href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: ["A QUALIFIER"], manager: null, client: null, reco: null, delaiMax: null }))}
            >
              <div className="lbl">⏳ A qualifier</div>
              <div className="num">{statusCounts.aq}</div>
              <div className="delta">{data.totals.urgent} urgents</div>
            </Link>
            <Link
              className={`kpi${kpiExclusive === "BO" ? " active" : ""}`}
              href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: ["BO"], manager: null, client: null, reco: null, delaiMax: null }))}
            >
              <div className="lbl">🔵 BO</div>
              <div className="num">{statusCounts.bo}</div>
              <div className="delta">Pipeline qualifié</div>
            </Link>
            <Link
              className={`kpi${kpiExclusive === "P2P" ? " active" : ""}`}
              href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: ["P2P"], manager: null, client: null, reco: null, delaiMax: null }))}
            >
              <div className="lbl">📝 P2P</div>
              <div className="num">{statusCounts.p2p}</div>
              <div className="delta">{recoCounts.watch} WATCH</div>
            </Link>
            <Link
              className={`kpi${kpiExclusive === "PS" ? " active" : ""}`}
              href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: ["PS"], manager: null, client: null, reco: null, delaiMax: null }))}
            >
              <div className="lbl">📤 PS</div>
              <div className="num">{statusCounts.ps}</div>
              <div className="delta">en attente client</div>
            </Link>
            <Link
              className={`kpi${kpiExclusive === "PITCH" ? " active" : ""}`}
              href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: ["PITCH"], manager: null, client: null, reco: null, delaiMax: null }))}
            >
              <div className="lbl">🎤 PITCH</div>
              <div className="num">{statusCounts.pitch}</div>
              <div className="delta">soutenances</div>
            </Link>
            <Link
              className={`kpi${kpiExclusive === "PW" ? " active" : ""}`}
              href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: ["PW"], manager: null, client: null, reco: null, delaiMax: null }))}
            >
              <div className="lbl">✅ PW</div>
              <div className="num">{statusCounts.pw}</div>
              <div className="delta">remportés</div>
            </Link>
            <Link
              className={`kpi${kpiExclusive === "PL" ? " active" : ""}`}
              href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: ["PL"], manager: null, client: null, reco: null, delaiMax: null }))}
            >
              <div className="lbl">❌ PL</div>
              <div className="num">{statusCounts.pl}</div>
              <div className="delta">perdus</div>
            </Link>
          </div>

          {/* Filter bar */}
          <div className="filter-bar">
            <Link className={`fchip${noPipelineFilters ? " on" : ""}`} href="/dashboard">
              Tous
            </Link>
            <Link
              className={`fchip${isBoP2p ? " on" : ""}`}
              href={dashboardPathWithFilters(
                "/dashboard",
                patchPipelineFilters(filters, { statuts: ["BO", "P2P"], manager: null, client: null, reco: null, delaiMax: null })
              )}
            >
              🔵 BO + P2P
            </Link>
            <details className="filter-dd">
              <summary className={`fchip${filters.manager ? " on" : ""}`}>＋ Manager</summary>
              <div className="filter-dd-panel" role="menu">
                <Link
                  role="menuitem"
                  className="filter-dd-link"
                  href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { manager: null }))}
                >
                  Effacer manager
                </Link>
                {data.byManager.map((item) => (
                  <Link
                    key={item.manager}
                    role="menuitem"
                    className="filter-dd-link"
                    href={dashboardPathWithFilters(
                      "/dashboard",
                      patchPipelineFilters(filters, { manager: item.manager, reco: null, delaiMax: null })
                    )}
                  >
                    {item.manager} ({item.total})
                  </Link>
                ))}
              </div>
            </details>
            <details className="filter-dd">
              <summary className={`fchip${filters.client ? " on" : ""}`}>＋ Client</summary>
              <div className="filter-dd-panel" style={{ padding: "12px" }}>
                <DashboardClientSearchForm filters={filters} defaultClient={filters.client} embedded />
              </div>
            </details>
            <details className="filter-dd">
              <summary className={`fchip${filters.delaiMax !== undefined ? " on" : ""}`}>＋ Délai</summary>
              <div className="filter-dd-panel" role="menu">
                <Link
                  className="filter-dd-link"
                  href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { delaiMax: null }))}
                >
                  Effacer délai
                </Link>
                {[
                  { label: "≤ J+7", max: 7 },
                  { label: "≤ J+14", max: 14 },
                  { label: "≤ J+30", max: 30 }
                ].map((row) => (
                  <Link
                    key={row.max}
                    className="filter-dd-link"
                    href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { delaiMax: row.max }))}
                  >
                    {row.label}
                  </Link>
                ))}
              </div>
            </details>
            <details className="filter-dd">
              <summary className={`fchip${filters.reco ? " on" : ""}`}>＋ Recommandation</summary>
              <div className="filter-dd-panel" role="menu">
                <Link className="filter-dd-link" href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { reco: null }))}>
                  Effacer reco
                </Link>
                <Link
                  className="filter-dd-link"
                  href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { reco: "go", delaiMax: null }))}
                >
                  GO
                </Link>
                <Link
                  className="filter-dd-link"
                  href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { reco: "watch", delaiMax: null }))}
                >
                  WATCH
                </Link>
                <Link
                  className="filter-dd-link"
                  href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { reco: "nogo", delaiMax: null }))}
                >
                  NO GO
                </Link>
              </div>
            </details>
            <span className="spacer" />
            <span className="view">
              {filteredPipeline.length} résultat(s) affiché(s) · tri par délai croissant · filtre depuis l&apos;URL
            </span>
          </div>

          {/* Résumé filtres actifs sous forme de liens */}
          {hasAnyFilter ? (
            <p className="t-meta" style={{ marginBottom: 12 }}>
              Filtres :{" "}
              {filters.statuts.length ? (
                <Link href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { statuts: [] }))}>
                  statuts [{filters.statuts.join(", ")}] ✕
                </Link>
              ) : (
                <span>tous statuts · </span>
              )}
              {filters.manager ? (
                <>
                  {" "}
                  <Link href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { manager: null }))}>manager {filters.manager} ✕</Link>
                </>
              ) : null}
              {filters.client ? (
                <>
                  {" "}
                  <Link href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { client: null }))}>« {filters.client} » ✕</Link>
                </>
              ) : null}
              {filters.reco ? (
                <>
                  {" "}
                  <Link href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { reco: null }))}>{filters.reco} ✕</Link>
                </>
              ) : null}
              {filters.delaiMax !== undefined ? (
                <>
                  {" "}
                  <Link href={dashboardPathWithFilters("/dashboard", patchPipelineFilters(filters, { delaiMax: null }))}>délai ≤ J+{filters.delaiMax} ✕</Link>
                </>
              ) : null}{" "}
              <Link href="/dashboard">Tout effacer</Link>
            </p>
          ) : null}

          {/* Pipeline principal */}
          <section className="card section" style={{ padding: 0, marginBottom: 16 }}>
            <div style={{ padding: "16px 18px 0" }}>
              <p className="eyebrow">Pipeline opérationnel</p>
              <h2>AOs actifs · les 20 plus récents</h2>
            </div>
            <div style={{ padding: "12px 18px 18px" }}>
              <PipelineTable
                records={filteredPipeline}
                emptyLabel={hasAnyFilter ? "Aucun AO ne correspond à ces filtres." : "Aucun AO chargé."}
              />
            </div>
          </section>

          {/* AOs urgents + charge par manager */}
          <section className="grid two-col">
            <div className="card section">
              <p className="eyebrow">Vigilance délai</p>
              <h2>AOs urgents (≤ 7 jours)</h2>
              {hasAnyFilter ? (
                <p className="t-meta" style={{ marginTop: 6 }}>
                  Sous-ensemble après filtres URL · {scopedRecords.length} AO(s) dans la vue
                </p>
              ) : null}
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
                    {scopedUrgent.map((ao, index) => (
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
                    {scopedUrgent.length === 0 ? (
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
              {hasAnyFilter ? (
                <p className="t-meta" style={{ marginTop: 6 }}>
                  Répartition sur les AO visibles après filtres (pas le périmètre global).
                </p>
              ) : null}
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
                    {scopedByManager.map((item) => (
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
                    {scopedByManager.length === 0 ? (
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
              <PipelineKanban records={scopedRecords} />
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
