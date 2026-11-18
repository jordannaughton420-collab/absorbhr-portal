import { test, expect, USERS, signInWithPassword, acceptPrivacyNoticeIfShown } from "./fixtures";

test.describe("signing in", () => {
  test("a signed-out visitor is sent to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("a wrong password is refused", async ({ page }) => {
    await signInWithPassword(page, "nobody@example.com", "Not-the-right-password-1");
    await expect(
      page.getByText("That email and password combination is not recognised."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("an employee signs in without 2-step and can sign out", async ({ page }) => {
    await signInWithPassword(page, USERS.ngEmployee.email);
    await expect(page).toHaveURL(/\/dashboard/);
    await acceptPrivacyNoticeIfShown(page);
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("an admin must pass 2-step before seeing anything", async ({ page }) => {
    await signInWithPassword(page, USERS.bwAdmin.email);
    await expect(page).toHaveURL(/\/auth\/mfa/);
    for (const path of ["/dashboard", "/employees", "/reports"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/mfa/);
    }
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText(/That code didn't work/)).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/mfa/);
  });

  test("an idle user is warned, then signed out", async ({ page }) => {
    await page.clock.install();
    await signInWithPassword(page, USERS.ngEmployee.email);
    await expect(page).toHaveURL(/\/dashboard/);
    await acceptPrivacyNoticeIfShown(page);
    // Northgate uses the default 30-minute idle limit, with a warning 2 minutes before.
    await page.clock.fastForward("28:30");
    const warning = page.getByRole("alertdialog");
    await expect(warning).toBeVisible();
    await expect(warning.getByRole("button", { name: "Stay signed in" })).toBeFocused();
    await page.clock.fastForward("02:00");
    await expect(page).toHaveURL(/\/login\?reason=timeout/);
  });
});
