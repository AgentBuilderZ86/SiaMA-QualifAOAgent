import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { refreshAoCache } from "@/lib/aoSources/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.AO_REFRESH_SECRET?.trim();
  if (!secret) return true;
  const header = request.headers.get("x-ao-refresh-secret") || "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return header === secret || bearer === secret;
}

async function refresh(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const payload = await refreshAoCache();
  ["/dashboard", "/dashboard/calendrier", "/dashboard/stats", "/office-manager"].forEach((path) => {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("[refresh-ao-sources] revalidatePath", path, error);
    }
  });

  return NextResponse.json({
    ok: true,
    generatedAt: payload.generatedAt,
    records: payload.records.length,
    sources: payload.report.map((source) => ({
      sourceName: source.sourceName,
      count: source.count,
      errors: source.errors
    })),
    durationMs: Date.now() - startedAt
  });
}

export async function GET(request: Request) {
  return refresh(request);
}

export async function POST(request: Request) {
  return refresh(request);
}
