import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Fixed-window rate limiting stored in Postgres. The bucket key is an HMAC of the
// client IP (and optionally an email), so no IP addresses or emails are stored.

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export function hashKey(...parts: string[]) {
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) throw new Error("IP_HASH_SECRET is not configured");
  return createHmac("sha256", secret).update(parts.join("|")).digest("hex");
}

export const LIMITS = {
  login: { max: 10, windowSeconds: 15 * 60 },
  magicLink: { max: 5, windowSeconds: 15 * 60 },
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  mfaVerify: { max: 10, windowSeconds: 15 * 60 },
  api: { max: 120, windowSeconds: 60 },
} as const;

/** Returns true when the request is allowed. */
export async function rateLimit(action: keyof typeof LIMITS, ...identity: string[]) {
  const { max, windowSeconds } = LIMITS[action];
  if (!hasAdminClient()) {
    // Fail closed in production; in development allow but warn (Supabase Auth still rate-limits itself).
    if (process.env.NODE_ENV === "production") return false;
    console.warn(JSON.stringify({ level: "warn", context: "rate-limit", msg: "service key missing, skipped" }));
    return true;
  }
  const bucket = hashKey(action, await clientIp(), ...identity.map((s) => s.toLowerCase()));
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

export async function ipHash() {
  return hashKey("ip", await clientIp());
}
