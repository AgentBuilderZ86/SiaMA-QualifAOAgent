import { NextResponse } from "next/server";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { parseJsonField } from "@/app/ao/[aoNum]/proposalArtifacts";
import { buildQualificationFicheHtml } from "@/lib/qualification/htmlFiche";
import type { QualificationFiche } from "@/lib/aoTypes";

export const runtime = "nodejs";

function fileName(value: string) {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 80) || "qualification";
}

export async function GET(request: Request, { params }: { params: Promise<{ aoNum: string }> }) {
  await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) {
    return new NextResponse("AO introuvable", { status: 404 });
  }
  const qualification = parseJsonField(detail.pipeline?.["Fiche qualification"]) as Partial<QualificationFiche> | null;
  const intelligence = qualification?.intelligence;
  if (!qualification || !intelligence) {
    const url = new URL(request.url);
    url.pathname = `/ao/${encodeURIComponent(decodeURIComponent(aoNum))}/qualification`;
    url.searchParams.set("error", "fiche-ia-manquante");
    return NextResponse.redirect(url);
  }
  const html = buildQualificationFicheHtml(detail.ao, intelligence);
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="fiche_qualification_${fileName(detail.ao.displayAoNum || detail.ao.aoNum)}.html"`,
      "cache-control": "no-store"
    }
  });
}
