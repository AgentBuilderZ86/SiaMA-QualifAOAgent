import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { saveQualification } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function pathFor(aoNum: string) {
  return `/ao/${encodeURIComponent(aoNum)}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ aoNum: string }> }) {
  const { aoNum: aoNumParam } = await params;
  const aoNum = decodeURIComponent(aoNumParam);

  try {
    const actor = await requireUser();
    const formData = await request.formData();
    formData.set("aoNum", aoNum);

    const result = await saveQualification(aoNum, actor, formData);

    // L'étape "extract" retourne sans appels LLM — on évite le coût revalidatePath
    // (~1-3 s sur Netlify) avant le retour partiel pour tenir dans le budget de 60 s.
    if (typeof result === "object" && "extractOnly" in result) {
      return NextResponse.json({ ok: true as const, nextStage: "analyze" as const });
    }

    const aoPath = pathFor(aoNum);
    revalidatePath("/dashboard");
    revalidatePath(aoPath);
    revalidatePath(`${aoPath}/qualification`);
    return NextResponse.json({ ok: true as const, redirectTo: aoPath });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Erreur inconnue pendant la génération de la fiche.";
    logger.error("api/qualification", message, { aoNum, error: String(error) });
    return NextResponse.json({ ok: false as const, error: message }, { status: 400 });
  }
}
