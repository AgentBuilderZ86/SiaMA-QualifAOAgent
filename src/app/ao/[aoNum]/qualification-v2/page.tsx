import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { buildAoRail } from "../aoRail";
import { QualificationV2Form } from "./QualificationV2Form";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function QualificationV2Page({
  params
}: {
  params: Promise<{ aoNum: string }>;
}) {
  const user = await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();

  const { ao } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "qualification-v2", ao.statut)}>
      <PageHeader
        eyebrow={
          <>
            Qualification BO V2 · <span className="ao-num">{ao.displayAoNum}</span>
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
      <QualificationV2Form aoNum={ao.aoNum} hasSourceUrl={Boolean(ao.sourceUrl)} />
    </AppShell>
  );
}
