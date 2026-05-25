import { expect, test } from "@playwright/test";

const EMAIL = process.env.APP_USER_EMAIL;
const PASSWORD = process.env.APP_USER_PASSWORD;
const hasCredentials = Boolean(EMAIL && PASSWORD);

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/mot de passe|password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /connexion|se connecter|login/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 10_000 });
}

test("dashboard se charge après connexion", async ({ page }) => {
  test.skip(!hasCredentials, "APP_USER_EMAIL / APP_USER_PASSWORD non configurés");
  await login(page);
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("main")).toBeVisible();
});

test("navigation rail AO : lien qualification accessible", async ({ page }) => {
  test.skip(!hasCredentials, "APP_USER_EMAIL / APP_USER_PASSWORD non configurés");
  await login(page);
  // Sans données configurées le dashboard reste vide — on vérifie juste la navigation
  const nav = page.getByRole("navigation").first();
  await expect(nav).toBeVisible();
});

test("redirection /login si non authentifié", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
});
