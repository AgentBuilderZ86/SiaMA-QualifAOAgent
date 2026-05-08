import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { AppShell, type SideRailGroup } from "@/components/shell";
import { delayLabel, urgentByDeadline } from "@/lib/aoDeadline";
import type { AoRecord } from "@/lib/aoTypes";

const PIPELINE_DISPLAY_LIMIT = 4;

function formatBudget(value: string | undefined): string {
  if (!value) return "—";
  return value;
}

function delayLabelUi(ao: AoRecord) {
  const base = delayLabel(ao.delaiJours);
  return urgentByDeadline(ao) ? `${base} ⚠` : base;
}

function pillClassFromStatus(status: string): string {
  const map: Record<string, string> = {
    BO: "pill--bo",
    P2P: "pill--p2p",
    PS: "pill--ps",
    PITCH: "pill--pitch",
    PW: "pill--pw",
    PL: "pill--pl"
  };
  return map[status.toUpperCase()] || "pill--aq";
}

function pillGlyph(status: string): string {
  const map: Record<string, string> = {
    BO: "🔵",
    P2P: "📝",
    PS: "📤",
    PITCH: "🎤",
    PW: "✅",
    PL: "❌",
    "A QUALIFIER": "⏳",
    "NO GO": "🚫"
  };
  return map[status.toUpperCase()] || "";
}

export default async function ChatPage() {
  const user = await requireUser();
  const data = await getDashboardData();

  const goCount = data.records.filter((ao) => (ao.decisionIa || "").toUpperCase() === "GO").length;
  const nogoCount = data.records.filter((ao) => (ao.decisionIa || "").toUpperCase() === "NO GO").length;
  const watchCount = data.records.length - goCount - nogoCount;

  const pipelineRows = data.recent
    .filter((ao) => ["BO", "P2P", "PS", "PITCH"].includes(ao.statut))
    .slice(0, PIPELINE_DISPLAY_LIMIT);

  const focusAo = data.urgent[0] ?? data.recent.find((ao) => ao.statut === "BO" || ao.statut === "P2P") ?? data.recent[0];

  const rail: SideRailGroup[] = [
    {
      topSlot: undefined,
      title: undefined,
      items: [{ label: "＋ Nouvelle conversation", href: "/chat" }]
    },
    {
      title: "Pipeline — aujourd'hui",
      items: [
        { label: "🔵 BO", count: data.records.filter((ao) => ao.statut === "BO").length, active: true },
        { label: "📝 P2P", count: data.records.filter((ao) => ao.statut === "P2P").length },
        { label: "📤 PS", count: data.records.filter((ao) => ao.statut === "PS").length },
        { label: "🎤 PITCH", count: data.records.filter((ao) => ao.statut === "PITCH").length },
        { label: "⏳ A qualifier", count: data.totals.aQualifier }
      ]
    },
    {
      title: "Conversations récentes",
      items: data.recent.slice(0, 8).map((ao) => ({
        label: `${ao.client} · ${ao.displayAoNum}`,
        href: `/ao/${encodeURIComponent(ao.aoNum)}`
      }))
    },
    {
      title: "Outils",
      items: [
        { label: "📊 Pipeline", href: "/dashboard" },
        { label: "📋 Audit", href: "/audit" },
        { label: "🛡 Règles", href: "/rules" },
        { label: "⚙ Référentiels", href: "/settings" }
      ]
    }
  ];

  return (
    <AppShell user={user} product="SiaGPT" rail={rail} fullBleed>
      <section className="convo">
        <div className="stream">
          <div className="stream-inner">
            <div className="preview-banner">Aperçu — interface non interactive (preview server-rendered)</div>

            <div className="sys-banner">
              <span className="dot" />
              Pipeline synchronisé · {data.totals.all} AOs suivis · {data.totals.aQualifier} à qualifier · {data.totals.urgent} urgents
            </div>

            <div className="turn user">
              <div className="bubble">run</div>
            </div>

            <div className="turn">
              <div className="bubble">
                <h2>🗂 Pipeline BO / Propale</h2>
                <p className="meta">
                  {data.totals.all} AOs analysés · {goCount} GO · {watchCount} WATCH · {nogoCount} NO GO
                </p>
                <hr />
                {pipelineRows.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Statut</th>
                        <th>N° AO</th>
                        <th>Client</th>
                        <th>Sujet</th>
                        <th style={{ textAlign: "right" }}>Budget</th>
                        <th style={{ textAlign: "right" }}>Délai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineRows.map((ao, idx) => (
                        <tr key={`${ao.aoNum}-${idx}`}>
                          <td>
                            <span className={`pill ${pillClassFromStatus(ao.statut)}`}>
                              {pillGlyph(ao.statut)} {ao.statut}
                            </span>
                          </td>
                          <td>
                            <code>{ao.displayAoNum}</code>
                          </td>
                          <td>{ao.client}</td>
                          <td>{ao.sujet || "—"}</td>
                          <td className="num">{formatBudget(ao.budget)}</td>
                          <td className="num" style={{ color: urgentByDeadline(ao) ? "var(--reco-nogo)" : undefined }}>
                            {delayLabelUi(ao)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted">Aucun AO en pipeline qualifié pour le moment.</p>
                )}
                <div className="suggest">
                  <Link href="/dashboard">Voir tout le pipeline</Link>
                  <Link href="/audit">Tableau urgents</Link>
                  <Link href="/rules">Règles scoring</Link>
                </div>
              </div>
            </div>

            {focusAo ? (
              <>
                <div className="turn user">
                  <div className="bubble">
                    {focusAo.statut} {focusAo.displayAoNum}
                  </div>
                </div>

                <div className="turn">
                  <div className="bubble">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className={`pill ${pillClassFromStatus(focusAo.statut)}`}>
                        {pillGlyph(focusAo.statut)} {focusAo.statut}
                      </span>
                      <span className="t-mono-sm muted">AO {focusAo.displayAoNum} — focus</span>
                    </div>
                    <div className="ident" style={{ marginTop: 8 }}>{focusAo.sujet || "Sujet à confirmer"}</div>
                    <div className="meta">
                      {focusAo.client} · {focusAo.manager || "Manager non assigné"} ·{" "}
                      {formatBudget(focusAo.budget)} · {delayLabelUi(focusAo)}
                    </div>
                    <p style={{ marginTop: 10 }}>
                      <i>
                        Justification IA initiale :{" "}
                        {focusAo.justificationIa
                          ? focusAo.justificationIa
                          : "patterns Sia à activer après chargement du CPS."}
                      </i>
                    </p>
                    <hr />
                    <h3>Prochaine étape — Analyse approfondie du dossier</h3>
                    <p>Pour produire la fiche de qualification, j&#39;ai besoin des documents de consultation :</p>
                    <ul className="steps">
                      <li>📎 Téléversez le <b>CPS</b> (Cahier des Prescriptions Spéciales)</li>
                      <li>📎 Téléversez le <b>RC</b> (Règlement de la Consultation) si disponible</li>
                      <li>📎 Téléversez l&#39;<b>Avis</b> ou tout document complémentaire</li>
                    </ul>
                    <div className="suggest">
                      <Link href={`/ao/${encodeURIComponent(focusAo.aoNum)}/qualification`}>
                        📑 Démarrer la qualification
                      </Link>
                      <Link href={`/ao/${encodeURIComponent(focusAo.aoNum)}/proposal`}>
                        💰 Simulation financière
                      </Link>
                      <Link href={`/ao/${encodeURIComponent(focusAo.aoNum)}`}>📋 Vue d&#39;ensemble AO</Link>
                    </div>
                  </div>
                </div>

                <div className="turn">
                  <div className="bubble">
                    <h2>💰 Simulation financière — AO {focusAo.displayAoNum}</h2>
                    <p className="meta">
                      {focusAo.sujet || "Sujet à confirmer"} · {focusAo.client}
                    </p>
                    <hr />
                    <table>
                      <thead>
                        <tr>
                          <th>Profil</th>
                          <th style={{ textAlign: "right" }}>JH</th>
                          <th style={{ textAlign: "right" }}>TJM Maroc (DH)</th>
                          <th style={{ textAlign: "right" }}>Total HT (DH)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Directeur / Partner</td>
                          <td className="num">15</td>
                          <td className="num">9 500</td>
                          <td className="num">142 500</td>
                        </tr>
                        <tr>
                          <td>Senior Manager</td>
                          <td className="num">40</td>
                          <td className="num">8 000</td>
                          <td className="num">320 000</td>
                        </tr>
                        <tr>
                          <td>Manager / PMO</td>
                          <td className="num">60</td>
                          <td className="num">7 000</td>
                          <td className="num">420 000</td>
                        </tr>
                        <tr>
                          <td>Senior Consultant</td>
                          <td className="num">120</td>
                          <td className="num">6 000</td>
                          <td className="num">720 000</td>
                        </tr>
                        <tr>
                          <td>Consultant</td>
                          <td className="num">90</td>
                          <td className="num">5 000</td>
                          <td className="num">450 000</td>
                        </tr>
                        <tr style={{ background: "var(--surface-1)", fontWeight: 600 }}>
                          <td>Total</td>
                          <td className="num">325 JH</td>
                          <td className="num">—</td>
                          <td className="num">
                            2 052 500 DH<span className="caret" />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style={{ marginTop: 10 }}>
                      Référentiels : Sia Maroc 2024 (TJM publiés). Ces estimations sont indicatives — ouvrez la simulation officielle pour
                      valider la marge contre le budget client.
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="composer-wrap">
          <div className="composer">
            <div className="composer-row">
              <button type="button" className="iconbtn" title="Joindre" aria-label="Joindre">📎</button>
              <textarea
                placeholder="Tapez « run » pour lancer le pipeline · « BO 30106324 » pour activer un AO · « simu 30106324 » pour simuler…"
                aria-label="Composer un message"
              />
              <button type="button" className="send">↩ Envoyer</button>
            </div>
            <div className="composer-foot">
              <div className="cmds">
                <span><code>run</code> pipeline</span>
                <span><code>BO N°</code> activer</span>
                <span><code>P2P N°</code> simuler</span>
                <span><code>PS N°</code> envoyée</span>
                <span><code>PITCH N°</code> soutenance</span>
                <span><code>PW</code> / <code>PL</code> clôture</span>
                <span><code>simu N°</code></span>
                <span><code>section approche N°</code></span>
              </div>
              <span className="t-meta">SiaGPT v8 · ⌘ + ↩ pour envoyer</span>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
