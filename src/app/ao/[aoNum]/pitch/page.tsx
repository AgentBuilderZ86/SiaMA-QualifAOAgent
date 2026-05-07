import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { pitchAction } from "../../actions";

export default async function PitchPage({ params }: { params: Promise<{ aoNum: string }> }) {
  await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao, pipeline } = detail;

  return (
    <main className="page">
      <div className="shell">
        <section className="card hero">
          <div>
            <p className="eyebrow">Pitch et soutenance</p>
            <h1>{ao.client}</h1>
            <p className="muted">{ao.sujet}</p>
          </div>
          <Link className="button ghost" href={`/ao/${ao.aoNum}`}>
            Retour AO
          </Link>
        </section>

        <form action={pitchAction} className="card section form-grid" style={{ marginTop: 16 }}>
          <input type="hidden" name="aoNum" value={ao.aoNum} />
          <div className="field">
            <label htmlFor="notes">Notes de préparation</label>
            <textarea
              id="notes"
              name="notes"
              rows={12}
              defaultValue={String(pipeline?.["Pitch notes"] || "")}
              placeholder="Participants, messages clés, questions probables, différenciants, objections, prochaines actions"
            />
          </div>
          <button className="button" type="submit">
            Enregistrer et marquer PITCH
          </button>
        </form>
      </div>
    </main>
  );
}
