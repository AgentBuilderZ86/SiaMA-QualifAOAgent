import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { cvAdaptationAction, proposalAction, simulationAction, transitionAction } from "../../actions";
import { CvAdaptationView, FinancialSimulationView, parseJsonField, ProposalSectionView } from "../proposalArtifacts";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { buildAoRail } from "../aoRail";
import { buildProductionOfferChecklist, PRODUCTION_OFFER_STAGES } from "@/lib/productionOffer";
import { buildCvScoringSummary, parseQualificationForCvScoring } from "@/lib/cvScoring";

export default async function ProposalPage({ params }: { params: Promise<{ aoNum: string }> }) {
  const user = await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao, pipeline } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);
  const simulation = parseJsonField(pipeline?.["Simulation financière"]);
  const proposal = parseJsonField(pipeline?.["Sections propale"]);
  const cvAdaptations = parseJsonField(pipeline?.["Adaptations CV"]);
  const productionOffer = buildProductionOfferChecklist(ao);
  const cvScoring = buildCvScoringSummary(ao, parseQualificationForCvScoring(pipeline?.["Fiche qualification"]));

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "proposal", ao.statut)}>
      <PageHeader
        eyebrow={
          <>
            P2P · <span className="ao-num">{ao.displayAoNum}</span>
          </>
        }
        title={ao.client}
        sub={ao.sujet}
        actions={
          <>
            <Pill status={ao.statut} />
            <Link className="btn btn--ghost" href={`/ao/${aoHref}`}>
              ← Retour AO
            </Link>
          </>
        }
      />

      <section className="card section" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <p className="eyebrow">Production offre</p>
            <h2>Checklist de production complète</h2>
          </div>
          <span className="muted">CV · technique · financier · revue/envoi</span>
        </div>
        <div className="office-action-grid office-action-grid--compact" style={{ marginTop: 12 }}>
          {productionOffer.map((stage) => (
            <div className={`office-action-card ${stage.status === "done" ? "is-todo" : stage.status === "attention" ? "is-reassign" : "is-unassigned"}`} key={stage.id}>
              <span>{stage.title}</span>
              <strong>{stage.statusLabel}</strong>
              <em>{stage.subtitle}</em>
            </div>
          ))}
        </div>
        <div className="grid two-col" style={{ marginTop: 14 }}>
          {productionOffer.map((stage) => (
            <div className="info-item" key={`${stage.id}-checks`}>
              <span>{stage.timeline} · {stage.evidence}</span>
              <strong>{stage.title}</strong>
              <ul>
                {stage.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card section" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <p className="eyebrow">Scoring CV</p>
            <h2>Adaptations CV & références</h2>
          </div>
          <span className="office-priority office-priority--follow">{cvScoring.score}/100 · {cvScoring.statusLabel}</span>
        </div>
        <div className="grid two-col" style={{ marginTop: 12 }}>
          {cvScoring.items.map((entry) => (
            <div className="info-item" key={entry.id}>
              <span>{entry.score}/100 · {entry.evidence}</span>
              <strong>{entry.label}</strong>
              <ul>
                {entry.adaptations.map((adaptation) => (
                  <li key={adaptation}>{adaptation}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="muted t-meta" style={{ marginTop: 12 }}>
          Profils détectés : {cvScoring.requiredProfiles.length ? cvScoring.requiredProfiles.slice(0, 6).join(" · ") : "à confirmer depuis RC/CPS"}
        </p>
      </section>

      <section className="grid two-col">
        <form action={simulationAction} className="card section form-grid">
          <h2>Simulation financière</h2>
          <input type="hidden" name="aoNum" value={ao.aoNum} />
          <div className="field">
            <label htmlFor="budget">Budget cible TTC</label>
            <input id="budget" name="budget" defaultValue={ao.budget} />
          </div>
          <div>
            <button className="btn btn--accent" type="submit">
              Calculer et passer P2P
            </button>
          </div>
        </form>

        <form action={proposalAction} className="card section form-grid">
          <h2>Génération propale</h2>
          <input type="hidden" name="aoNum" value={ao.aoNum} />
          <div className="field">
            <label htmlFor="section">Section</label>
            <select id="section" name="section">
              <optgroup label="Production offre">
                {PRODUCTION_OFFER_STAGES.flatMap((stage) => stage.proposalSections).map((section) => (
                  <option key={section}>{section}</option>
                ))}
              </optgroup>
              <optgroup label="Sections standard">
                <option>Introduction</option>
                <option>Enjeux et problématique</option>
                <option>Approche méthodologique</option>
                <option>Livrables et planning</option>
                <option>Équipe et références</option>
                <option>Proposition financière</option>
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label htmlFor="context">Contexte spécifique et sources</label>
            <textarea
              id="context"
              name="context"
              rows={6}
              defaultValue={String(pipeline?.["Fiche qualification"] || "")}
            />
          </div>
          <div>
            <button className="btn btn--accent" type="submit">
              Générer la section
            </button>
          </div>
        </form>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="section-header">
          <div>
            <p className="eyebrow">Adaptation CV uploadés</p>
            <h2>Reformuler les CV pour maximiser la conformité AO</h2>
          </div>
          <span className="muted">Aucune expérience inventée · preuves CV conservées</span>
        </div>
        <form action={cvAdaptationAction} className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="aoNum" value={ao.aoNum} />
          <div className="field">
            <label htmlFor="targetRole">Rôle cible / lot visé</label>
            <input id="targetRole" name="targetRole" placeholder="Ex. Chef de projet data, Architecte SI…" />
          </div>
          <div className="field">
            <label htmlFor="cv">CV à adapter (.pdf, .docx, .txt, .zip)</label>
            <input id="cv" name="cv" type="file" multiple required />
          </div>
          <div>
            <button className="btn btn--accent" type="submit">
              Adapter les CV pour cet AO
            </button>
          </div>
        </form>
        <div style={{ marginTop: 16 }}>
          <CvAdaptationView adaptations={cvAdaptations} />
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>Tableau de simulation financière</h2>
        <FinancialSimulationView simulation={simulation} />
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>Contenu PowerPoint généré</h2>
        <p className="muted">
          Les blocs ci-dessous sont pensés pour être copiés dans PowerPoint : titre, messages clés, texte de slide et schéma.
        </p>
        <ProposalSectionView proposal={proposal} />
      </section>

      <form action={transitionAction} className="card section form-grid" style={{ marginTop: 16 }}>
        <input type="hidden" name="aoNum" value={ao.aoNum} />
        <input type="hidden" name="status" value="PS" />
        <h2>Marquer la proposition envoyée</h2>
        <div className="field">
          <label htmlFor="note">Note d'envoi proposition</label>
          <textarea id="note" name="note" rows={3} placeholder="Date d'envoi, destinataires, version, points ouverts" />
        </div>
        <div>
          <button className="btn btn--primary" type="submit">
            📤 Marquer proposition envoyée (PS)
          </button>
        </div>
      </form>
    </AppShell>
  );
}
