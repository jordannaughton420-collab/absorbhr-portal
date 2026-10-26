"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actingTenantId, getContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import { companySchema, locationSchema, nameSchema, roleSchema, securitySettingsSchema } from "@/lib/validation/settings";

const INVALID = "Please check the highlighted fields.";
const DENIED: ActionResult = { ok: false, error: "You don't have permission to change this." };

async function tenant() {
  const ctx = await getContext();
  return ctx ? actingTenantId(ctx) : null;
}

// RLS decides who may change what; an update that matches no rows means "not permitted".
export async function updateCompany(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(companySchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const tenantId = await tenant();
  if (!tenantId) return DENIED;
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").update(parsed.data).eq("id", tenantId).select("id");
  if (error) return safeError(error, "settings.company");
  if (!data?.length) return DENIED;
  revalidatePath("/", "layout");
  return { ok: true, message: "Company details saved." };
}

export async function updateSecuritySettings(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(securitySettingsSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const tenantId = await tenant();
  if (!tenantId) return DENIED;
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenant_settings").update(parsed.data).eq("tenant_id", tenantId).select("tenant_id");
  if (error) return safeError(error, "settings.security");
  if (!data?.length) return DENIED;
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function addDepartment(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(nameSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const tenantId = await tenant();
  if (!tenantId) return DENIED;
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ ...parsed.data, tenant_id: tenantId });
  if (error) return safeError(error, "settings.addDepartment");
  revalidatePath("/settings");
  return { ok: true, message: "Department added." };
}

export async function addLocation(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(locationSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const tenantId = await tenant();
  if (!tenantId) return DENIED;
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({ ...parsed.data, tenant_id: tenantId });
  if (error) return safeError(error, "settings.addLocation");
  revalidatePath("/settings");
  return { ok: true, message: "Location added." };
}

const deleteSchema = z.object({ id: z.uuid(), kind: z.enum(["departments", "locations"]) });

export async function deleteOrgUnit(formData: FormData) {
  const parsed = deleteSchema.safeParse({ id: formData.get("id"), kind: formData.get("kind") });
  if (!parsed.success) return;
  const supabase = await createClient();
  // Employees in it are kept; their department/location is simply cleared.
  const { error } = await supabase.from(parsed.data.kind).delete().eq("id", parsed.data.id);
  if (error) safeError(error, "settings.deleteOrgUnit");
  revalidatePath("/settings");
}

export async function updateRole(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(roleSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { membership_id, ...values } = parsed.data;
  const { data, error } = await supabase.from("memberships").update(values).eq("id", membership_id).select("id");
  if (error) return safeError(error, "settings.role");
  if (!data?.length) return { ok: false, error: "You can't change this account (you can't change your own role)." };
  revalidatePath("/settings");
  return { ok: true, message: "Access updated." };
}
