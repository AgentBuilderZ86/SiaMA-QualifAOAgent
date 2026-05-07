"use server";

import { redirect } from "next/navigation";
import { setSession, validateLogin } from "@/lib/auth";

export type LoginState = {
  error: string;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!validateLogin(email, password)) {
    return { error: "Identifiants invalides ou variables APP_USER_EMAIL / APP_USER_PASSWORD non configurées." };
  }

  await setSession(email);
  redirect("/dashboard");
}
