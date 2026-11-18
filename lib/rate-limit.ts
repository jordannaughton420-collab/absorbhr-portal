import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { clientIpFromForwardedFor, trustedProxyHops } from "@/lib/client-ip";

// Fixed-window rate limiting stored in Postgres. The bucket key is an HMAC of the
// client IP (and optionally an email), so no IP addresses or emails are stored.

/**
 * The visitor's address, as recorded by our own proxy (see lib/client-ip.ts).
 * Never the left-most X-Forwarded-For value or X-Real-IP: the visitor can set those.
 */
export async function clientIp() {
  const h = await headers();
  return clientIpFromForwardedFor(h.get("x-forwarded-for"), trustedProxyHops());
}

export function hashKey(...parts: string[]) {
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) throw new Error("IP_HASH_SECRET is not configured");
  return createHmac("sha256", secret).update(parts.join("|")).digest("hex");
}

export const LIMITS = {
  login: { max: 10, windowSeconds: 15 * 60 },
  // Per account, from every address together: stops one login being guessed from many
  // machines. Higher than `login` so a stranger can't easily lock a real user out.
  loginAccount: { max: 30, windowSeconds: 15 * 60 },
  magicLink: { max: 5, windowSeconds: 15 * 60 },
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  mfaVerify: { max: 10, windowSeconds: 15 * 60 },
  // Per signed-in user: a guesser here already has the password, so lock-out is fine.
  mfaVerifyAccount: { max: 10, windowSeconds: 15 * 60 },
  api: { max: 120, windowSeconds: 60 },
  // Each assistant message is a paid AI call: caps cost if a login is misused.
  assistant: { max: 40, windowSeconds: 60 * 60 },
} as const;

type Action = keyof typeof LIMITS;

async function hit(action: Action, bucket: string) {
  const { max, windowSeconds } = LIMITS[action];
  if (!hasAdminClient()) {
    // Fail closed in production; in development allow but warn (Supabase Auth still rate-limits itself).
    if (process.env.NODE_ENV === "production") return false;
    console.warn(
      JSON.stringify({ level: "warn", context: "rate-limit", msg: "service key missing, skipped" }),
    );
    return true;
  }
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(JSON.stringify({ level: "error", context: "rate-limit", code: error.code }));
    return process.env.NODE_ENV !== "production";
  }
  return data === true;
}

/** Per address (plus any identity given). Returns true when the request is allowed. */
export async function rateLimit(action: Action, ...identity: string[]) {
  return hit(action, hashKey(action, await clientIp(), ...identity.map((s) => s.toLowerCase())));
}

/** Per account only, whatever address it comes from. Returns true when allowed. */
export async function rateLimitAccount(action: Action, identity: string) {
  return hit(action, hashKey(action, "account", identity.toLowerCase()));
}

export async function ipHash() {
  return hashKey("ip", await clientIp());
}
