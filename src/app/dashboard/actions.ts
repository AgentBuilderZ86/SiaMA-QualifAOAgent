"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clearSession } from "@/lib/auth";
import { refreshAoCache } from "@/lib/aoSources/cache";
import { normalizeDashboardReturnPathFromReferer } from "./refreshReturnPath";

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function refreshAoSourcesAction() {
  const h = await headers();
  const base = normalizeDashboardReturnPathFromReferer(h.get("referer"));

  try {
    await refreshAoCache();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Échec du rafraîchissement des sources.";
    console.error("[refreshAoSourcesAction]", message, cause);
    const sep = base.includes("?") ? "&" : "?";
    redirect(`${base}${sep}refreshSources=error&refreshMsg=${encodeURIComponent(message.slice(0, 500))}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendrier");
  revalidatePath("/dashboard/stats");
  redirect(base);
}
