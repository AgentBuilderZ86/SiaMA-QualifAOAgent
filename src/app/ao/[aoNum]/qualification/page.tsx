import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { qualificationAction } from "../../actions";

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
  await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao } = detail;

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">Qualification BO</p>
            <h1>{ao.client}</h1>
            <p className="muted">
              {ao.sujet}. Chargez le CPS/RC/Avis : les champs ci-dessous sont optionnels et servent à corriger ou compléter
              l’extraction automatique.
            </p>
          </div>
          <Link className="button ghost" href={`/ao/${ao.aoNum}`}>
            Retour AO
          </Link>
        </section>

        <form action={qualificationAction} className="card section form-grid" style={{ marginTop: 16 }}>
          <input type="hidden" name="aoNum" value={ao.aoNum} />
          {questions.map(([name, label]) => (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}</label>
              <textarea id={name} name={name} rows={3} placeholder="À confirmer" />
            </div>
          ))}
          <div className="field">
            <label htmlFor="document">Document CPS/RC/Avis</label>
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
          <button className="button" type="submit">
            Générer la fiche intelligente et le deck PowerPoint
          </button>
        </form>
      </div>
    </main>
  );
}
