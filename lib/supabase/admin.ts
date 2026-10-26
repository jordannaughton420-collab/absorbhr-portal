import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Service-role client. BYPASSES Row Level Security — use only for the few
// server-side jobs that need it (inviting users, rate limiting), and always
// check the caller's permissions first. Never import this into client code.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hasAdminClient() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
