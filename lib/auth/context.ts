import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type SessionContext = {
  userId: string;
  aal: "aal1" | "aal2";
  hasMfaFactor: boolean;
  isPlatformAdmin: boolean;
  tenantId: string | null;
  tenantName: string | null;
  role: AppRole | null;
  employeeId: string | null;
  displayName: string;
  settings: Database["public"]["Tables"]["tenant_settings"]["Row"] | null;
  supportSession: { id: string; tenantId: string; tenantName: string; expiresAt: string } | null;
  /** Roles that must use MFA before they can do anything. */
  mfaRequired: boolean;
  /** HR-level powers are active (role allows it AND MFA is verified), or a support session is open. */
  isHr: boolean;
  isClientAdmin: boolean;
};

// One lookup per request, shared by layouts, pages and actions.
export const getContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: aalData }, { data: factors }, { data: membership }, { data: platform }, { data: employee }] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
      supabase.from("memberships").select("tenant_id, role, is_active, tenants(name)").eq("user_id", user.id).maybeSingle(),
      supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("employees").select("id, first_name, preferred_name, last_name").eq("user_id", user.id).maybeSingle(),
    ]);

  const aal = aalData?.currentLevel === "aal2" ? "aal2" : "aal1";
  const tenantId = membership?.is_active ? membership.tenant_id : null;
  const role = membership?.is_active ? membership.role : null;

  const { data: settings } = tenantId
    ? await supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle()
    : { data: null };

  let supportSession: SessionContext["supportSession"] = null;
  if (platform && aal === "aal2") {
    const { data: s } = await supabase
      .from("support_sessions")
      .select("id, tenant_id, expires_at, tenants(name)")
      .eq("admin_user_id", user.id)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (s) supportSession = { id: s.id, tenantId: s.tenant_id, tenantName: s.tenants?.name ?? "", expiresAt: s.expires_at };
  }

  const adminRole = role === "client_admin" || role === "hr_manager";
  const mfaRequired = Boolean(platform) || adminRole || Boolean(settings?.require_mfa_for_all);

  return {
    userId: user.id,
    aal,
    hasMfaFactor: (factors?.totp ?? []).some((f) => f.status === "verified"),
    isPlatformAdmin: Boolean(platform),
    tenantId,
    tenantName: membership?.tenants?.name ?? null,
    role,
    employeeId: employee?.id ?? null,
    displayName: employee ? `${employee.preferred_name || employee.first_name} ${employee.last_name}` : "AbsorbHR admin",
    settings: settings ?? null,
    supportSession,
    mfaRequired,
    isHr: (adminRole && aal === "aal2") || Boolean(supportSession),
    isClientAdmin: (role === "client_admin" && aal === "aal2") || Boolean(supportSession),
  };
});

/** For pages inside the signed-in app: guarantees a context with MFA satisfied. */
export async function requireContext() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.mfaRequired && ctx.aal !== "aal2") redirect("/auth/mfa");
  return ctx;
}

export async function requireHr() {
  const ctx = await requireContext();
  if (!ctx.isHr) redirect("/dashboard");
  return ctx;
}

export async function requireClientAdmin() {
  const ctx = await requireContext();
  if (!ctx.isClientAdmin) redirect("/dashboard");
  return ctx;
}

export async function requirePlatformAdmin() {
  const ctx = await requireContext();
  if (!ctx.isPlatformAdmin) redirect("/dashboard");
  return ctx;
}

/** Tenant the user is currently acting in: their own, or the support-session company. */
export function actingTenantId(ctx: SessionContext) {
  return ctx.supportSession?.tenantId ?? ctx.tenantId;
}
