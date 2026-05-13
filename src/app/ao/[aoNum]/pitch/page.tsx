import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { pitchAction } from "../../actions";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { buildAoRail } from "../aoRail";

export default async function PitchPage({ params }: { params: Promise<{ aoNum: string }> }) {
  const user = await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao, pipeline } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "pitch", ao.statut)}>
      <PageHeader
        eyebrow={
          <>
            Pitch · soutenance · <span className="ao-num">{ao.displayAoNum}</span>
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

      <form action={pitchAction} className="card section form-grid">
        <input type="hidden" name="aoNum" value={ao.aoNum} />
        <h2>Notes de préparation</h2>
        <p className="muted">
          Participants, messages clés, questions probables, différenciants, objections, prochaines actions.
        </p>
        <div className="field">
          <label htmlFor="notes">Storyline et points de vigilance</label>
          <textarea
            id="notes"
            name="notes"
            rows={14}
            defaultValue={String(pipeline?.["Pitch notes"] || "")}
            placeholder="Participants, messages clés, questions probables, différenciants, objections, prochaines actions"
          />
        </div>
        <div>
          <button className="btn btn--accent" type="submit">
            🎤 Enregistrer et marquer PITCH
          </button>
        </div>
      </form>
    </AppShell>
  );
}
