import { getDashboardData } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { logoutAction, refreshAoSourcesAction } from "./actions";
import Link from "next/link";

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

type DashboardAo = Awaited<ReturnType<typeof getDashboardData>>["records"][number];
const PIPELINE_STATUSES = ["A QUALIFIER", "GO", "BO", "P2P", "PS", "PITCH", "PW", "PL", "NO GO"] as const;

function AoTable({ records, emptyLabel }: { records: DashboardAo[]; emptyLabel: string }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>N° AO</th>
          <th>Client</th>
          <th>Sujet</th>
          <th>Manager</th>
          <th>Statut</th>
          <th>Budget</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {records.map((ao, index) => (
          <tr key={`${ao.sourceTab}-${ao.aoNum}-${index}`}>
            <td>
              <Link href={`/ao/${encodeURIComponent(ao.aoNum)}`}>{ao.displayAoNum}</Link>
            </td>
            <td>{ao.client}</td>
            <td>{ao.sujet}</td>
            <td>{ao.manager}</td>
            <td>
              <span className={`badge ${statusClass(ao.statut)}`}>{ao.statut}</span>
            </td>
            <td>{ao.budget}</td>
            <td>
              {ao.sourceUrl ? (
                <a href={ao.sourceUrl} target="_blank" rel="noreferrer">
                  {ao.sourceName || ao.sourceTab}
                </a>
              ) : (
                ao.sourceName || ao.sourceTab
              )}
            </td>
          </tr>
        ))}
        {records.length === 0 ? (
          <tr>
            <td colSpan={7} className="muted">
              {emptyLabel}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function PipelineBoard({ records }: { records: DashboardAo[] }) {
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="section-header">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h2>Opportunités par phase</h2>
        </div>
      </div>
      <div className="pipeline-board">
        {PIPELINE_STATUSES.map((status) => {
          const items = records.filter((ao) => ao.statut === status);
          return (
            <div className="pipeline-column" key={status}>
              <div className="pipeline-column-header">
                <span className={`badge ${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>
                <strong>{items.length}</strong>
              </div>
              {items
                .sort((a, b) => (a.delaiJours ?? 999) - (b.delaiJours ?? 999))
                .slice(0, 5)
                .map((ao) => (
                  <Link className="pipeline-card" href={`/ao/${encodeURIComponent(ao.aoNum)}`} key={`${ao.sourceTab}-${ao.aoNum}`}>
                    <strong>{ao.client}</strong>
                    <span>{ao.sujet}</span>
                    <small>{ao.delaiJours !== null ? `J+${ao.delaiJours}` : "Délai NC"} · {ao.sourceKind === "google-sheet" ? "Google" : "Scrappé"}</small>
                  </Link>
                ))}
              {items.length === 0 ? <p className="muted">Aucune opportunité</p> : null}
            </div>
          );
        })}
      </div>
    </section>
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

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">Dashboard AO</p>
            <h1>Qualification et pipeline</h1>
            <p className="muted">
              Données calculées depuis {sourceLabel}. Dernière lecture : {generatedAt}.
            </p>
          </div>
          <div>
            <p className="muted">{user}</p>
            <form action={refreshAoSourcesAction} style={{ display: "inline", marginRight: 8 }}>
              <button className="button" type="submit">
                Rafraîchir sources AO
              </button>
            </form>
            <Link className="button ghost" href="/rules" style={{ marginRight: 8 }}>
              Règles
            </Link>
            <Link className="button ghost" href="/audit" style={{ marginRight: 8 }}>
              Audit
            </Link>
            <Link className="button ghost" href="/settings" style={{ marginRight: 8 }}>
              Référentiels
            </Link>
            <form action={logoutAction} style={{ display: "inline" }}>
              <button className="button ghost" type="submit">
                Déconnexion
              </button>
            </form>
          </div>
        </section>

        {!data.configured ? (
          <section className="card section" style={{ marginTop: 20 }}>
            <h2>Aucune source AO chargée</h2>
            <p className="muted">
              Lancez un rafraîchissement des sources publiques ou configurez Google Sheets pour afficher les AO suivis.
            </p>
            {data.missingConfig.length ? <div className="alert">Variables Google manquantes : {data.missingConfig.join(", ")}</div> : null}
          </section>
        ) : data.loadError ? (
          <section className="card section" style={{ marginTop: 20 }}>
            <h2>Connexion Google à finaliser</h2>
            <p className="muted">
              L'ID du Google Sheet est configuré, mais le serveur local n'a pas encore de droits API pour le lire.
            </p>
            <div className="alert">{data.loadError}</div>
          </section>
        ) : (
          <>
            <section className="grid stats">
              <div className="card stat">
                <strong>{data.totals.all}</strong>
                <span>Total AOs suivis</span>
              </div>
              <div className="card stat">
                <strong>{data.totals.go}</strong>
                <span>GO / En cours</span>
              </div>
              <div className="card stat">
                <strong>{data.totals.activePipeline}</strong>
                <span>Pipeline actif</span>
              </div>
              <div className="card stat">
                <strong>{data.totals.urgent}</strong>
                <span>Délais ≤ 7 jours</span>
              </div>
            </section>

            <section className="grid two-col">
              <div className="card section">
                <h2>AOs urgents</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>N° AO</th>
                      <th>Client</th>
                      <th>Sujet</th>
                      <th>Délai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.urgent.map((ao, index) => (
                      <tr key={`${ao.sourceTab}-${ao.aoNum}-${index}`}>
                        <td>
                          <Link href={`/ao/${encodeURIComponent(ao.aoNum)}`}>{ao.displayAoNum}</Link>
                        </td>
                        <td>{ao.client}</td>
                        <td>{ao.sujet}</td>
                        <td>
                          <span className="badge urgent">J+{ao.delaiJours}</span>
                        </td>
                      </tr>
                    ))}
                    {data.urgent.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          Aucun délai critique dans les données chargées.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="card section">
                <h2>Charge par manager</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Manager</th>
                      <th>Total</th>
                      <th>Urgent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byManager.map((item) => (
                      <tr key={item.manager}>
                        <td>{item.manager}</td>
                        <td>{item.total}</td>
                        <td>{item.urgent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <PipelineBoard records={data.records} />

            <section className="card section" style={{ marginTop: 16 }}>
              <h2>AO fichier Google Sheets ({data.googleSheetRecords.length})</h2>
              <p className="muted">Source interne prioritaire : si un AO scrappé correspond à cette liste, il est retiré du groupe scrappé.</p>
              <AoTable records={data.googleSheetRecords.slice(0, 50)} emptyLabel="Aucun AO Google Sheets chargé." />
            </section>

            <section className="card section" style={{ marginTop: 16 }}>
              <h2>AO scrappés dédoublonnés ({data.scrapedRecords.length})</h2>
              <p className="muted">Avis publics collectés depuis les sources natives, hors doublons déjà présents dans le fichier Google Sheets.</p>
              <AoTable records={data.scrapedRecords.slice(0, 50)} emptyLabel="Aucun AO scrappé distinct du fichier Google Sheets." />
            </section>

            <section className="card section" style={{ marginTop: 16 }}>
              <h2>Vue combinée dédoublonnée récente</h2>
              <AoTable records={data.recent} emptyLabel="Aucun AO chargé." />
            </section>
            {data.sourceReport.length ? (
              <section className="card section" style={{ marginTop: 16 }}>
                <h2>Journal de collecte</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Avis retenus</th>
                      <th>Dernière collecte</th>
                      <th>Alertes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sourceReport.map((item) => (
                      <tr key={`${item.sourceName}-${item.collectedAt}`}>
                        <td>{item.sourceName}</td>
                        <td>{item.count}</td>
                        <td>{item.collectedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.collectedAt)) : "NC"}</td>
                        <td>{item.errors.length ? item.errors.join(" | ") : "Aucune"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
