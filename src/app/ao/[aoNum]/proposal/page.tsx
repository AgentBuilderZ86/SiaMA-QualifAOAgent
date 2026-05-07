import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { proposalAction, simulationAction, transitionAction } from "../../actions";
import { FinancialSimulationView, parseJsonField, ProposalSectionView } from "../proposalArtifacts";

export default async function ProposalPage({ params }: { params: Promise<{ aoNum: string }> }) {
  await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao, pipeline } = detail;
  const simulation = parseJsonField(pipeline?.["Simulation financière"]);
  const proposal = parseJsonField(pipeline?.["Sections propale"]);

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">P2P et propale</p>
            <h1>{ao.client}</h1>
            <p className="muted">{ao.sujet}</p>
          </div>
          <Link className="button ghost" href={`/ao/${ao.aoNum}`}>
            Retour AO
          </Link>
        </section>

        <section className="grid two-col" style={{ marginTop: 16 }}>
          <form action={simulationAction} className="card section form-grid">
            <h2>Simulation financière</h2>
            <input type="hidden" name="aoNum" value={ao.aoNum} />
            <div className="field">
              <label htmlFor="budget">Budget cible TTC</label>
              <input id="budget" name="budget" defaultValue={ao.budget} />
            </div>
            <button className="button" type="submit">
              Calculer et passer P2P
            </button>
          </form>

          <form action={proposalAction} className="card section form-grid">
            <h2>Génération propale</h2>
            <input type="hidden" name="aoNum" value={ao.aoNum} />
            <div className="field">
              <label htmlFor="section">Section</label>
              <select id="section" name="section">
                <option>Introduction</option>
                <option>Enjeux et problématique</option>
                <option>Approche méthodologique</option>
                <option>Livrables et planning</option>
                <option>Équipe et références</option>
                <option>Proposition financière</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="context">Contexte spécifique et sources</label>
              <textarea id="context" name="context" rows={6} defaultValue={String(pipeline?.["Fiche qualification"] || "")} />
            </div>
            <button className="button" type="submit">
              Générer la section
            </button>
          </form>
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

        <form action={transitionAction} className="card section" style={{ marginTop: 16 }}>
          <input type="hidden" name="aoNum" value={ao.aoNum} />
          <input type="hidden" name="status" value="PS" />
          <div className="field">
            <label htmlFor="note">Note d’envoi proposition</label>
            <textarea id="note" name="note" rows={3} placeholder="Date d’envoi, destinataires, version, points ouverts" />
          </div>
          <button className="button" type="submit">
            Marquer proposition envoyée PS
          </button>
        </form>
      </div>
    </main>
  );
}
