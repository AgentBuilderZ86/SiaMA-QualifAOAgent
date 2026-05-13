import { NextResponse } from "next/server";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import type { AoRecord, QualificationFiche } from "@/lib/aoTypes";
import { buildAoDeckPayload } from "@/lib/pptx/aoDeckData";
import { buildQualificationDeck } from "@/lib/pptx/qualificationDeck";
import { deckEngineFromEnv, runPythonQualificationDeck } from "@/lib/pptx/runPythonDeck";
import { buildFallbackIntelligence } from "@/lib/qualification/intelligence";

export const runtime = "nodejs";

function fileName(value: string) {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 80) || "qualification";
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function fallbackFiche(ao: AoRecord): QualificationFiche {
  return {
    contexte: "À confirmer",
    objet: ao.sujet,
    perimetre: "À confirmer",
    livrables: "À confirmer",
    duree: "À confirmer",
    profils: "À confirmer",
    criteres: "À confirmer",
    concurrence: "À confirmer",
    relation: "À confirmer",
    budget: ao.budget,
    chances: "À confirmer",
    risques: "À confirmer",
    pointsVigilance: [],
    documentName: "Aucun document de qualification",
    documentExtract: "",
    extractionStatus: "Fiche qualification non renseignée",
    recommendation: ao.decisionIa || "À confirmer",
    sources: [ao.sourceName || ao.sourceTab].filter(Boolean)
  };
}

function forcedEngineFromRequest(request: Request): "python" | "pptxgen" | null {
  const raw = new URL(request.url).searchParams.get("engine");
  if (raw === "python" || raw === "pptxgen") return raw;
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ aoNum: string }> }) {
  await requireUser();
  const { aoNum } = await params;
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) return NextResponse.json({ error: "AO introuvable" }, { status: 404 });

  const fiche = parseJson<QualificationFiche>(detail.pipeline?.["Fiche qualification"]) || fallbackFiche(detail.ao);
  const intelligence = fiche.intelligence || buildFallbackIntelligence(detail.ao, fiche, [], ["Analyse IA indisponible ou ancienne."]);
  const forced = forcedEngineFromRequest(request);
  const envEngine = deckEngineFromEnv();
  const payload = buildAoDeckPayload(detail.ao, detail.pipeline, detail.referentials);

  let buffer: Buffer;
  let fileStem = `qualification-${detail.ao.displayAoNum}`;

  if (forced === "python") {
    const fromPython = await runPythonQualificationDeck(payload);
    if (!fromPython) {
      return NextResponse.json(
        { error: "Génération deck Python indisponible (Python, python-pptx ou template)." },
        { status: 503 }
      );
    }
    buffer = fromPython;
    fileStem = `${fileStem}-modele-sia`;
  } else if (forced === "pptxgen") {
    buffer = await buildQualificationDeck(detail.ao, fiche, intelligence);
    fileStem = `${fileStem}-charte-web`;
  } else if (envEngine === "pptxgen") {
    buffer = await buildQualificationDeck(detail.ao, fiche, intelligence);
  } else if (envEngine === "python") {
    const fromPython = await runPythonQualificationDeck(payload);
    if (!fromPython) {
      return NextResponse.json(
        { error: "Génération deck Python indisponible (Python, python-pptx ou template)." },
        { status: 503 }
      );
    }
    buffer = fromPython;
  } else {
    const fromPython = await runPythonQualificationDeck(payload);
    buffer = fromPython ?? (await buildQualificationDeck(detail.ao, fiche, intelligence));
  }

  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${fileName(fileStem)}.pptx"`
    }
  });
}
