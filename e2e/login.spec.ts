import { expect, test } from "@playwright/test";

test("page de connexion se charge", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
