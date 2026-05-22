"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setSession, validateLogin } from "@/lib/auth";
import { recordLoginAttempt, resetLoginAttempts } from "@/lib/loginRateLimit";

export type LoginState = {
  error: string;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "unknown";
  const rateLimitKey = `login:${ip}`;
  const { allowed, attemptsLeft } = recordLoginAttempt(rateLimitKey);

  if (!allowed) {
    return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  }

  if (!validateLogin(email, password)) {
    const hint = attemptsLeft > 0 ? ` (${attemptsLeft} tentative(s) restante(s))` : "";
    return { error: `Identifiants invalides ou variables APP_USER_EMAIL / APP_USER_PASSWORD non configurées.${hint}` };
  }

  resetLoginAttempts(rateLimitKey);
  await setSession(email);
  redirect("/dashboard");
}
