import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { qualificationAction } from "../../actions";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { buildAoRail } from "../aoRail";

/** Évite toute optimisation statique qui pourrait retarder la mise à jour d’URL côté client au changement d’onglet rail. */
export const dynamic = "force-dynamic";

const questions = [
  ["contexte", "Contexte métier et enjeux stratégiques"],
  ["perimetre", "Périmètre exact, activités et livrables"],
  ["profils", "Profils requis et expertises spécifiques"],
  ["concurrence", "Concurrence probable"],
  ["relation", "Relation client et track record"],
  ["budget", "Budget indiqué ou estimé"],
  ["chances", "Probabilité de gain argumentée"],
  ["risques", "Risques et points de vigilance"]
];

export default async function QualificationPage({ params }: { params: Promise<{ aoNum: string }> }) {
  const user = await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "qualification")}>
      <PageHeader
        eyebrow={
          <>
            Qualification BO · <span className="ao-num">{ao.displayAoNum}</span>
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

      <div className="alert" style={{ marginBottom: 16 }}>
        Chargez le CPS / RC / Avis pour générer la fiche intelligente. Les champs ci-dessous sont optionnels et permettent de
        compléter ou corriger l'extraction automatique.
      </div>

      <form action={qualificationAction} className="card section form-grid">
        <input type="hidden" name="aoNum" value={ao.aoNum} />
        {questions.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={name}>{label}</label>
            <textarea id={name} name={name} rows={3} placeholder="À confirmer" />
          </div>
        ))}
        <div className="field">
          <label htmlFor="document">Document CPS / RC / Avis</label>
          <input id="document" name="document" type="file" />
        </div>
        <div className="field">
          <label htmlFor="documentExtract">Extrait manuel si PDF/DOCX non lisible</label>
          <textarea id="documentExtract" name="documentExtract" rows={5} />
        </div>
        <div className="field">
          <label>
            <input name="forceDocumentExtraction" type="checkbox" value="yes" defaultChecked /> Régénérer la fiche depuis le document chargé
          </label>
        </div>
        <div className="field">
          <label>
            <input name="enrichWeb" type="checkbox" value="yes" defaultChecked /> Enrichir avec recherche web sourcée client / secteur / concurrents
          </label>
        </div>
        <div>
          <button className="btn btn--accent" type="submit">
            Générer la fiche intelligente et le deck PowerPoint
          </button>
        </div>
      </form>
    </AppShell>
  );
}
