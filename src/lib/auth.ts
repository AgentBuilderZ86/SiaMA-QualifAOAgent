import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";

const COOKIE_NAME = "siama_session";

function sessionSecret() {
  return process.env.SESSION_SECRET || "dev-only-secret-change-me";
}

function sign(value: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

export function createSessionValue(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, issuedAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.email === "string" ? parsed.email : null;
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const store = await cookies();
  return verifySessionValue(store.get(COOKIE_NAME)?.value);
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function getUserRole(email: string) {
  const admins = (process.env["APP_ADMIN_EMAILS"] || process.env["APP_USER_EMAIL"] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (admins.includes(email.toLowerCase())) return "admin";
  return "manager";
}

export async function requireAdmin() {
  const user = await requireUser();
  if (getUserRole(user) !== "admin") redirect("/dashboard");
  return user;
}

export async function setSession(email: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionValue(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Les longueurs différentes révèlent peu d'information dans ce contexte (outil interne,
  // un seul compte). timingSafeEqual exige des buffers de même taille — on vérifie la longueur
  // avant pour éviter l'exception, et on court-circuite de façon constante.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateLogin(email: string, password: string) {
  const expectedEmail = process.env["APP_USER_EMAIL"] ?? "";
  const expectedPassword = process.env["APP_USER_PASSWORD"] ?? "";
  if (!expectedEmail || !expectedPassword) return false;
  return timingSafeStringEqual(email.toLowerCase(), expectedEmail.toLowerCase()) &&
    timingSafeStringEqual(password, expectedPassword);
}
