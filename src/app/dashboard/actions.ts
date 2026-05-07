"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession } from "@/lib/auth";
import { refreshAoCache } from "@/lib/aoSources/cache";

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function refreshAoSourcesAction() {
  await refreshAoCache();
  revalidatePath("/dashboard");
}
