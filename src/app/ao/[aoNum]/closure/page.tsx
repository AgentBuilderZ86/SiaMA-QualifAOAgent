import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { closureAction } from "../../actions";

export default async function ClosurePage({ params }: { params: Promise<{ aoNum: string }> }) {
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
            <p className="eyebrow">Clôture Win / Loose</p>
            <h1>{ao.client}</h1>
            <p className="muted">{ao.sujet}</p>
          </div>
          <Link className="button ghost" href={`/ao/${ao.aoNum}`}>
            Retour AO
          </Link>
        </section>

        <form action={closureAction} className="card section form-grid" style={{ marginTop: 16 }}>
          <input type="hidden" name="aoNum" value={ao.aoNum} />
          <div className="field">
            <label htmlFor="result">Résultat</label>
            <select id="result" name="result" defaultValue={String(pipeline?.["Résultat clôture"] || "PL")}>
              <option value="PW">Win / PW</option>
              <option value="PL">Loose / PL</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="finalAmount">Montant final</label>
            <input id="finalAmount" name="finalAmount" defaultValue={String(pipeline?.["Montant final"] || "")} />
          </div>
          <div className="field">
            <label htmlFor="competitor">Concurrent retenu si connu</label>
            <input id="competitor" name="competitor" defaultValue={String(pipeline?.["Concurrent retenu"] || "")} />
          </div>
          <div className="field">
            <label htmlFor="reason">Motif de clôture</label>
            <textarea id="reason" name="reason" rows={4} defaultValue={String(pipeline?.["Motif clôture"] || "")} />
          </div>
          <div className="field">
            <label htmlFor="lessons">Leçons apprises</label>
            <textarea id="lessons" name="lessons" rows={5} defaultValue={String(pipeline?.["Leçons apprises"] || "")} />
          </div>
          <button className="button" type="submit">
            Clôturer l’AO
          </button>
        </form>
      </div>
    </main>
  );
}
