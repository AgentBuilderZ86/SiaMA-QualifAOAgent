import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { FinancialSimulationView, parseJsonField, ProposalSectionView } from "./proposalArtifacts";
import { QualificationIntelligenceView } from "./qualificationView";
import { DecisionPanel } from "./decisionPanel";
import { ManagerGovernancePanel } from "./managerGovernance";
import { WorkflowFlow } from "./workflow";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { delayLabel } from "@/lib/aoDeadline";
import { buildAoRail } from "./aoRail";
import type { QualificationDocumentExtraction, QualificationFiche } from "@/lib/aoTypes";

export const dynamic = "force-dynamic";

function field(label: string, value: string | number | null | undefined) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value || "Non renseigné"}</strong>
    </div>
  );
}

function delayClass(jours: number | null | undefined): string {
  if (typeof jours !== "number") return "";
  if (jours < 0) return " crit";
  if (jours <= 5) return " crit";
  if (jours <= 10) return " warn";
  return "";
}

function QualificationDocumentsPanel({ documents }: { documents: QualificationDocumentExtraction[] }) {
  if (!documents.length) return null;
  return (
    <div className="qualification-documents">
      {documents.map((document) => (
        <div className="qualification-document-card" key={`${document.kind}-${document.name}-${document.sha256 || ""}`}>
          <span>{document.kind}</span>
          <strong>{document.name}</strong>
          <small>
            {document.extractionMode === "ocr" ? "OCR" : document.extractionMode === "cache" ? "Source AO" : "Extraction native"}
            {document.warning ? ` · ${document.warning}` : ""}
          </small>
        </div>
      ))}
    </div>
  );
}

export default async function AoDetailPage({ params }: { params: Promise<{ aoNum: string }> }) {
  const user = await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();

  const { ao, pipeline } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);
  const workflowAvailable = Boolean(process.env.GOOGLE_SHEET_ID);
  const qualification = parseJsonField(pipeline?.["Fiche qualification"]) as Partial<QualificationFiche> | null;
  const simulation = parseJsonField(pipeline?.["Simulation financière"]);
  const proposal = parseJsonField(pipeline?.["Sections propale"]);

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "overview", ao.statut)}>
      <PageHeader
        eyebrow={<>AO <span className="ao-num">{ao.displayAoNum}</span></>}
        title={ao.client}
        sub={ao.sujet}
        actions={
          <>
            <Link className="btn btn--ghost" href="/dashboard">
              ← Pipeline
            </Link>
            <Link className="btn btn--ghost" href={`/ao/${aoHref}#pilotage-manager`}>
              Réaffecter / statuer
            </Link>
            <Link className="btn btn--accent" href={`/ao/${aoHref}/qualification`}>
              Ouvrir la qualification
            </Link>
          </>
        }
      />

      {/* KPI strip 4 colonnes */}
      <div className="kpi-strip">
        <div className="kpi active">
          <div className="lbl">Statut</div>
          <div className="num" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pill status={ao.statut} />
          </div>
          <div className="delta">{ao.decisionIa ? `Reco : ${ao.decisionIa}` : "Reco à venir"}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Délai</div>
          <div className="num">
            <span className={`delay${delayClass(ao.delaiJours)}`} style={{ fontSize: 22, padding: "0 12px", height: 30 }}>
              {delayLabel(ao.delaiJours)}
            </span>
          </div>
          <div className="delta">{ao.dateLimite || "Date limite NC"}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Budget</div>
          <div className="num" style={{ fontFamily: "var(--font-mono)" }}>{ao.budget || "—"}</div>
          <div className="delta">{ao.country || ao.buyer || "Source : " + (ao.sourceTab || "NC")}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Manager</div>
          <div className="num" style={{ fontSize: 20, letterSpacing: "0.04em" }}>{ao.manager || "Non assigné"}</div>
          <div className="delta">Source : {ao.sourceTab || "NC"}</div>
        </div>
      </div>

      <section className="manager-action-banner">
        <div>
          <p className="eyebrow">Action manager</p>
          <h2>Changer le statut ou proposer une réaffectation</h2>
          <p className="muted">La décision est historisée et alimente les règles via le feedback manager.</p>
        </div>
        <Link className="btn btn--accent" href={`/ao/${aoHref}#pilotage-manager`}>
          Réaffecter / statuer
        </Link>
      </section>

      <DecisionPanel ao={ao} qualification={qualification} />

      <section className="grid two-col" style={{ marginTop: 16 }}>
        <WorkflowFlow ao={ao} enabled={workflowAvailable} />
        <ManagerGovernancePanel ao={ao} enabled={workflowAvailable} user={user} />
      </section>

      <section className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Actions</p>
              <h2>Prochaines étapes</h2>
            </div>
          </div>
          <div className="actions-grid" style={{ marginBottom: 16 }}>
            <Link className="btn btn--ghost" href={`/ao/${aoHref}/qualification`}>
              📑 Qualification
            </Link>
            <Link className="btn btn--ghost" href={`/ao/${aoHref}/proposal`}>
              💰 Simulation & propale
            </Link>
            <Link className="btn btn--ghost" href={`/ao/${aoHref}/pitch`}>
              🎤 Pitch
            </Link>
            <Link className="btn btn--ghost" href={`/ao/${aoHref}/closure`}>
              ✅ Clôture
            </Link>
          </div>
          <div className="info-grid">
            {field("N° AO", ao.displayAoNum)}
            {field("Date limite", ao.dateLimite)}
            {field("Source", ao.sourceTab)}
          </div>
        </div>
      </section>

      <section className="qualif-shell" style={{ marginTop: 16 }}>
        {qualification ? (
          <>
            <div className="qualif-hero">
              <div>
                <p className="eyebrow inverse">Fiche qualification</p>
                <h2>{ao.client} — {ao.sujet}</h2>
                <p>{qualification.documentName || "Document non renseigné"}</p>
              </div>
              <div className="qualif-status">
                <strong>{ao.statut}</strong>
                <span>{qualification.extractionStatus || "Document analysé"}</span>
              </div>
            </div>

            <div style={{ padding: 22 }}>
              <QualificationIntelligenceView
                fiche={qualification}
                ao={ao}
                deckHref={`/ao/${aoHref}/qualification/deck`}
                htmlHref={`/ao/${aoHref}/qualification/fiche.html`}
              />
            </div>

            {(qualification.sources || []).length ? (
              <div className="source-row">
                {(qualification.sources || []).map((source: string) => (
                  <span className="source-chip" key={source}>
                    {source}
                  </span>
                ))}
              </div>
            ) : null}

            <QualificationDocumentsPanel documents={qualification.documents || []} />

            <details className="extract-panel">
              <summary>Voir l'extrait documentaire analysé</summary>
              <pre className="pre">{qualification.documentExtract}</pre>
            </details>
          </>
        ) : (
          <div className="card section">
            <h2>Qualification et livrables</h2>
            <p className="muted">Aucune fiche enregistrée. Lancez la qualification depuis l'onglet dédié.</p>
            <Link className="btn btn--accent" href={`/ao/${aoHref}/qualification`} style={{ marginTop: 12 }}>
              Démarrer la qualification
            </Link>
          </div>
        )}
      </section>

      <section className="card section compact-section" style={{ marginTop: 16 }}>
        <div className="section-header">
          <div>
            <p className="eyebrow">P2P</p>
            <h2>Simulation & propale</h2>
          </div>
          <Link className="btn btn--ghost" href={`/ao/${aoHref}/proposal`}>
            Ouvrir l'atelier propale
          </Link>
        </div>
        <FinancialSimulationView simulation={simulation} />
        <details className="collapsible-panel" style={{ marginTop: 12 }}>
          <summary>Section propale PowerPoint</summary>
          <ProposalSectionView proposal={proposal} />
        </details>
      </section>

      <details className="card section collapsible-panel" style={{ marginTop: 16 }}>
        <summary>Sources et traçabilité</summary>
        <div className="info-grid" style={{ marginTop: 16 }}>
          {field("Nom source", ao.sourceName || ao.sourceTab)}
          {field("Type source", ao.sourceKind)}
          {field("Identifiant source", ao.sourceNoticeId || ao.displayAoNum)}
          {ao.sourceUrl ? (
            <div className="info-item">
              <span>URL source</span>
              <a href={ao.sourceUrl} target="_blank" rel="noreferrer">
                {ao.sourceUrl}
              </a>
            </div>
          ) : null}
          {field("Pays", ao.country)}
          {field("Acheteur", ao.buyer)}
          {field("Date publication", ao.publishedAt)}
          {field("Date collecte", ao.collectedAt)}
          {field("Qualité", ao.dataQuality ? `${ao.dataQuality.completenessScore}%` : "")}
        </div>
      </details>
    </AppShell>
  );
}
