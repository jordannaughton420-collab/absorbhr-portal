"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/audit";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  loginSchema,
  magicLinkSchema,
  mfaCodeSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const INVALID = "Please check the highlighted fields.";
const TOO_MANY = "Too many attempts. Please wait 15 minutes and try again.";

export async function signInWithPassword(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimit("login", parsed.data.email))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message whether the email exists or not, so accounts can't be discovered.
  if (error) return { ok: false, error: "That email and password combination is not recognised." };

  await logEvent("login", "auth", { metadata: { method: "password" } });
  redirect("/dashboard");
}

export async function sendMagicLink(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(magicLinkSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimit("magicLink", parsed.data.email))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${SITE_URL}/auth/confirm?next=/dashboard`,
    },
  });
  return {
    ok: true,
    message:
      "If that email belongs to an account, a sign-in link is on its way. It expires in 15 minutes.",
  };
}

export async function sendPasswordReset(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(magicLinkSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimit("passwordReset", parsed.data.email))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${SITE_URL}/auth/confirm?next=/auth/reset-password`,
  });
  return { ok: true, message: "If that email belongs to an account, a reset link is on its way." };
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(resetPasswordSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password") {
      return {
        ok: false,
        error: "Please choose a different, stronger password.",
        fieldErrors: { password: "Choose a different password" },
      };
    }
    return safeError(error, "auth.updatePassword");
  }
  redirect("/dashboard");
}

export async function signOut(reason?: "timeout") {
  const supabase = await createClient();
  await logEvent("logout", "auth", reason ? { metadata: { reason } } : {});
  await supabase.auth.signOut();
  redirect(reason ? `/login?reason=${reason}` : "/login");
}

// ---------------------------------------------------------------- MFA (TOTP)

export async function startMfaEnrolment(): Promise<
  ActionResult<{ factorId: string; qrCode: string; secret: string }>
> {
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Clear abandoned, never-verified enrolments so a fresh QR code can be issued.
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    issuer: "AbsorbHR Portal",
  });
  if (error || !data) return safeError(error, "auth.mfaEnroll");
  return {
    ok: true,
    data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  };
}

export async function verifyMfa(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(mfaCodeSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimit("mfaVerify"))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolling = formData.get("factorId");
  const factor =
    (factors?.all ?? []).find((f) => f.id === enrolling && f.factor_type === "totp") ??
    factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { ok: false, error: "No authenticator app is set up. Please start again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data.code,
  });
  if (error)
    return {
      ok: false,
      error: "That code didn't work. Codes change every 30 seconds — try the latest one.",
      fieldErrors: { code: "Incorrect code" },
    };

  await logEvent(factor.status === "verified" ? "mfa_verified" : "mfa_enrolled", "auth");
  redirect("/dashboard");
}
