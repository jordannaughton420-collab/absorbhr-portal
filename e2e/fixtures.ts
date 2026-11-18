import { test as base, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Made-up demo logins from supabase/seed.sql. Admin and HR roles must use 2-step verification. */
export const USERS = {
  bwAdmin: { email: "brightwater.admin@example.com", name: "Dana Director", mfa: true },
  bwHr: { email: "brightwater.hr@example.com", name: "Harper Peopleton", mfa: true },
  bwManager: { email: "brightwater.manager@example.com", name: "Morgan Bakewell", mfa: false },
  bwEmployee: { email: "brightwater.employee@example.com", name: "Jamie Crumb", mfa: false },
  ngAdmin: { email: "northgate.admin@example.com", name: "Fiona Gateway", mfa: true },
  // Never saved: tests that sign out use this one (signing out ends every session for that user).
  ngEmployee: { email: "northgate.employee@example.com", name: "Callum Forklift", mfa: false },
} as const;
export type Role = keyof typeof USERS;
export const SAVED_ROLES = ["bwAdmin", "bwHr", "bwManager", "bwEmployee", "ngAdmin"] as const;

export const AUTH_DIR = "e2e/.auth";
export const statePath = (role: Role) => `${AUTH_DIR}/${role}.json`;
const TOTP_FILE = `${AUTH_DIR}/totp.json`;

export function readTotpSecrets(): Record<string, string> {
  return existsSync(TOTP_FILE) ? JSON.parse(readFileSync(TOTP_FILE, "utf8")) : {};
}
export { TOTP_FILE };

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Signs in with email and password on the real login page. */
export async function signInWithPassword(
  page: Page,
  email: string,
  password = process.env.SEED_PASSWORD!,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Clicks through the privacy notice if the portal asks for it. */
export async function acceptPrivacyNoticeIfShown(page: Page) {
  const button = page.getByRole("button", { name: "I have read and understood this notice" });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await expect(button).toBeHidden();
  }
}

/** Every test page refuses to reach the live portal, as a second safety net. */
export const test = base.extend<{ blockLive: void }>({
  blockLive: [
    async ({ context }, use) => {
      await context.route(/absorbhr-portal\.co\.uk/, (route) => route.abort("blockedbyclient"));
      await use();
    },
    { auto: true },
  ],
});

export const as = (role: Role) => ({ storageState: statePath(role) });
export { expect };
