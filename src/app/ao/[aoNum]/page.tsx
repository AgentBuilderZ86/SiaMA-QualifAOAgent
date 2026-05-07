import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { FinancialSimulationView, parseJsonField, ProposalSectionView } from "./proposalArtifacts";
import { QualificationIntelligenceView } from "./qualificationView";
import { DecisionPanel } from "./decisionPanel";
import { WorkflowFlow } from "./workflow";

function field(label: string, value: string | number | null | undefined) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value || "Non renseigné"}</strong>
    </div>
  );
}

export default async function AoDetailPage({ params }: { params: Promise<{ aoNum: string }> }) {
  await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();

  const { ao, pipeline } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);
  const workflowAvailable = Boolean(process.env.GOOGLE_SHEET_ID);
  const qualification = parseJsonField(pipeline?.["Fiche qualification"]);
  const simulation = parseJsonField(pipeline?.["Simulation financière"]);
  const proposal = parseJsonField(pipeline?.["Sections propale"]);

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">AO {ao.displayAoNum}</p>
            <h1>{ao.client}</h1>
            <p className="muted">{ao.sujet}</p>
          </div>
          <Link className="button ghost" href="/dashboard">
            Retour dashboard
          </Link>
        </section>

        <section className="grid stats">
          <div className="card stat">
            <strong>{ao.statut}</strong>
            <span>Statut courant</span>
          </div>
          <div className="card stat">
            <strong>{ao.delaiJours ?? "NC"}</strong>
            <span>Délai jours</span>
          </div>
          <div className="card stat">
            <strong>{ao.budget}</strong>
            <span>Budget</span>
          </div>
          <div className="card stat">
            <strong>{ao.manager}</strong>
            <span>Manager</span>
          </div>
        </section>

        <DecisionPanel ao={ao} qualification={qualification} />

        <section className="grid two-col" style={{ marginTop: 16 }}>
          <WorkflowFlow ao={ao} enabled={workflowAvailable} />
          <div className="card section">
            <div className="section-header">
              <div>
                <p className="eyebrow">Actions</p>
                <h2>Prochaines étapes</h2>
              </div>
            </div>
            <div className="actions-grid" style={{ marginBottom: 16 }}>
              <Link className="button ghost" href={`/ao/${aoHref}/qualification`}>
                Qualification
              </Link>
              <Link className="button ghost" href={`/ao/${aoHref}/proposal`}>
                Simulation & propale
              </Link>
              <Link className="button ghost" href={`/ao/${aoHref}/pitch`}>
                Pitch
              </Link>
              <Link className="button ghost" href={`/ao/${aoHref}/closure`}>
                Clôture
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
                  <h2>{ao.client} - {ao.sujet}</h2>
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

              <div className="source-row">
                {(qualification.sources || []).map((source: string) => (
                  <span className="source-chip" key={source}>{source}</span>
                ))}
              </div>

              <details className="extract-panel">
                <summary>Voir l’extrait documentaire analysé</summary>
                <pre className="pre">{qualification.documentExtract}</pre>
              </details>
            </>
          ) : (
            <div className="card section">
              <h2>Qualification et livrables</h2>
              <p className="muted">Aucune fiche enregistrée.</p>
            </div>
          )}
        </section>

        <section className="card section compact-section" style={{ marginTop: 16 }}>
          <div className="section-header">
            <div>
              <p className="eyebrow">P2P</p>
              <h2>Simulation & propale</h2>
            </div>
            <Link className="button ghost" href={`/ao/${aoHref}/proposal`}>
              Ouvrir l’atelier propale
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
      </div>
    </main>
  );
}
