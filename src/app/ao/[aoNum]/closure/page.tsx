import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { closureAction } from "../../actions";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { buildAoRail } from "../aoRail";

export default async function ClosurePage({ params }: { params: Promise<{ aoNum: string }> }) {
  const user = await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao, pipeline } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "closure")}>
      <PageHeader
        eyebrow={
          <>
            Clôture · Win / Loss · <span className="ao-num">{ao.displayAoNum}</span>
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

      <form action={closureAction} className="card section form-grid">
        <input type="hidden" name="aoNum" value={ao.aoNum} />
        <h2>Synthèse de clôture</h2>

        <div className="grid two-col">
          <div className="field">
            <label htmlFor="result">Résultat</label>
            <select id="result" name="result" defaultValue={String(pipeline?.["Résultat clôture"] || "PL")}>
              <option value="PW">✅ Win / PW</option>
              <option value="PL">❌ Loss / PL</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="finalAmount">Montant final</label>
            <input
              id="finalAmount"
              name="finalAmount"
              defaultValue={String(pipeline?.["Montant final"] || "")}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="competitor">Concurrent retenu si connu</label>
          <input
            id="competitor"
            name="competitor"
            defaultValue={String(pipeline?.["Concurrent retenu"] || "")}
          />
        </div>
        <div className="field">
          <label htmlFor="reason">Motif de clôture</label>
          <textarea id="reason" name="reason" rows={4} defaultValue={String(pipeline?.["Motif clôture"] || "")} />
        </div>
        <div className="field">
          <label htmlFor="lessons">Leçons apprises</label>
          <textarea id="lessons" name="lessons" rows={5} defaultValue={String(pipeline?.["Leçons apprises"] || "")} />
        </div>
        <div>
          <button className="btn btn--accent" type="submit">
            Clôturer l'AO
          </button>
        </div>
      </form>
    </AppShell>
  );
}
