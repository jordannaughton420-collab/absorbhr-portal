import * as OTPAuth from "otpauth";
import { test, expect, USERS, adminClient, readTotpSecrets, signInWithPassword } from "./fixtures";

const code = (secret: string) =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();

test("an admin with two-step verification can set a new password (code asked for too)", async ({
  page,
}) => {
  const email = USERS.ngAdmin.email;
  const secret = readTotpSecrets()[email];
  test.skip(!secret, "needs the sign-in set-up to have run");
  const admin = adminClient();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = list.users.find((u) => u.email === email)!;

  try {
    // Signed in with a password but not yet past two-step: the same state a reset link leaves you in.
    await signInWithPassword(page, email);
    await expect(page).toHaveURL(/\/auth\/mfa/);
    await page.goto("/auth/reset-password");
    const codeBox = page.getByLabel("6-digit code from your authenticator app");
    await expect(codeBox).toBeVisible();
    await expect(page.getByRole("button", { name: "Save password" })).toBeEnabled();
    await page.getByLabel("New password", { exact: true }).fill("Temporary-e2e-Pass-42");
    await page.getByLabel("Confirm new password").fill("Temporary-e2e-Pass-42");
    await codeBox.fill(code(secret));
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  } finally {
    // Put the test password back for every other test.
    await admin.auth.admin.updateUserById(user.id, { password: process.env.SEED_PASSWORD! });
  }
});
