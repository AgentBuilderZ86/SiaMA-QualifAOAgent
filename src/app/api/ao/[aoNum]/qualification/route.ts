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

    await saveQualification(aoNum, actor, formData);

    const aoPath = pathFor(aoNum);
    const qualificationPath = `${aoPath}/qualification`;
    revalidatePath("/dashboard");
    revalidatePath(aoPath);
    revalidatePath(qualificationPath);

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
