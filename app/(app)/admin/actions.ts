"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { getContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import { newTenantSchema, supportSessionSchema } from "@/lib/validation/settings";

const INVALID = "Please check the highlighted fields.";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function createTenantWithAdmin(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(newTenantSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  if (!ctx?.isPlatformAdmin || ctx.aal !== "aal2")
    return { ok: false, error: "Only AbsorbHR admins can onboard clients." };
  if (!hasAdminClient())
    return { ok: false, error: "Inviting users isn't configured yet (server key missing)." };

  // The tenant is created by the database function, which re-checks platform-admin status.
  const supabase = await createClient();
  const { data: tenantId, error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_region: parsed.data.bank_holiday_region,
  });
  if (error || !tenantId) return safeError(error, "admin.createTenant");

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.admin_email,
    {
      redirectTo: `${SITE_URL}/auth/confirm?next=/auth/reset-password`,
    },
  );
  if (inviteError || !invited.user) return safeError(inviteError, "admin.inviteClientAdmin");

  const { error: memberError } = await admin
    .from("memberships")
    .insert({ tenant_id: tenantId, user_id: invited.user.id, role: "client_admin" });
  if (memberError) return safeError(memberError, "admin.clientAdminMembership");
  const { error: empError } = await admin.from("employees").insert({
    tenant_id: tenantId,
    user_id: invited.user.id,
    first_name: parsed.data.admin_first_name,
    last_name: parsed.data.admin_last_name,
    work_email: parsed.data.admin_email,
    start_date: new Date().toISOString().slice(0, 10),
  });
  if (empError) return safeError(empError, "admin.clientAdminEmployee");

  revalidatePath("/admin");
  return { ok: true, message: "Client created. Their admin has been emailed an invitation." };
}

export async function startSupportSession(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(supportSessionSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_support_session", {
    p_tenant: parsed.data.tenant_id,
    p_reason: parsed.data.reason,
    p_minutes: parsed.data.minutes,
  });
  if (error) return safeError(error, "admin.startSupport");
  redirect("/dashboard");
}

export async function endSupportSession() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_support_session");
  if (error) safeError(error, "admin.endSupport");
  revalidatePath("/", "layout");
  redirect("/admin");
}
