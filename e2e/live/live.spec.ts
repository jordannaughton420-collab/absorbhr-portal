// Read-only check of the LIVE portal. It never signs in and never changes anything.
// Run with: npm run test:live
import { test, expect } from "@playwright/test";

test("the login page loads", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signed-out visitors can't reach the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("security settings are in place", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["cache-control"]).toContain("no-store");
  expect(h["x-powered-by"]).toBeUndefined();
});
