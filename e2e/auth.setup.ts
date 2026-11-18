// Signs each made-up user in once, through the real login and 2-step pages, and saves
// the signed-in browser so the other tests can start already signed in.
// A saved sign-in is reused for up to 40 minutes (sign-ins are rate limited).

import { test as setup, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import * as OTPAuth from "otpauth";
import {
  AUTH_DIR,
  SAVED_ROLES,
  TOTP_FILE,
  USERS,
  acceptPrivacyNoticeIfShown,
  adminClient,
  readTotpSecrets,
  signInWithPassword,
  statePath,
  type Role,
} from "./fixtures";

const REUSE_MINUTES = 40;

export function totpCode(secret: string) {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    digits: 6,
    period: 30,
  }).generate();
}

/** Removes a user's authenticator so the test can set up a fresh one it knows the key for. */
async function resetAuthenticator(email: string) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`Test user ${email} not found — run npm run test:e2e:reset`);
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const f of factors?.factors ?? [])
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
}

async function passTwoStep(page: Page, role: Role) {
  const email = USERS[role].email;
  const secrets = readTotpSecrets();
  await page.waitForURL(/\/auth\/mfa/);

  const setupKey = page.getByText("Can't scan? Enter a setup key instead");
  const enrolled = !(await setupKey.isVisible({ timeout: 10_000 }).catch(() => false));
  if (enrolled && !secrets[email]) {
    // Someone set up an authenticator we don't have the key for: start again.
    await resetAuthenticator(email);
    await page.reload();
  }
  if (!enrolled || !secrets[email]) {
    await setupKey.click();
    const secret = (await page.locator("details code").innerText()).trim();
    secrets[email] = secret;
    writeFileSync(TOTP_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel("6-digit code").fill(totpCode(secrets[email]));
    await page.getByRole("button", { name: "Verify" }).click();
    const ok = await page.waitForURL(/\/dashboard/, { timeout: 15_000 }).then(
      () => true,
      () => false,
    );
    if (ok) return;
    // A code can expire mid-check: wait for the next one and try once more.
    await page.waitForTimeout(31_000);
  }
  throw new Error(`2-step verification failed for ${email}`);
}

async function stillSignedIn(page: Page) {
  await page.goto("/dashboard");
  return /\/dashboard/.test(page.url());
}

for (const role of SAVED_ROLES) {
  setup(`sign in as ${USERS[role].name}`, async ({ browser }) => {
    mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
    const file = statePath(role);
    const fresh = existsSync(file) && Date.now() - statSync(file).mtimeMs < REUSE_MINUTES * 60_000;

    if (fresh) {
      const ctx = await browser.newContext({ storageState: file });
      const ok = await stillSignedIn(await ctx.newPage());
      await ctx.close();
      if (ok) return;
    }

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInWithPassword(page, USERS[role].email);
    if (USERS[role].mfa) await passTwoStep(page, role);
    await page.waitForURL(/\/dashboard/);
    await acceptPrivacyNoticeIfShown(page);
    await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeAttached();
    await ctx.storageState({ path: file });
    await ctx.close();
  });
}
