import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { saveQualificationV2 } from "@/lib/aoQualificationServiceV2";
import type { QualificationV2Body } from "@/lib/aoQualificationServiceV2";

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
    const body = (await request.json()) as QualificationV2Body;

    const fiche = await saveQualificationV2(aoNum, actor, body);

    const aoPath = pathFor(aoNum);
    revalidatePath("/dashboard");
    revalidatePath(aoPath);
    revalidatePath(`${aoPath}/qualification`);
    revalidatePath(`${aoPath}/qualification-v2`);

    return NextResponse.json({
      ok: true as const,
      redirectTo: aoPath,
      goNoGoScore: fiche.intelligence?.goNoGoScore,
      recommendation: fiche.intelligence?.recommendation
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Erreur inconnue pendant la génération de la fiche.";
    logger.error("api/qualification-v2", message, { aoNum, error: String(error) });
    return NextResponse.json({ ok: false as const, error: message }, { status: 400 });
  }
}
