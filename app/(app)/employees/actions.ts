"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { getContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  emergencyContactSchema,
  employeeSchema,
  idSchema,
  personalSchema,
  rtwSchema,
  salarySchema,
} from "@/lib/validation/employee";

const INVALID = "Please check the highlighted fields.";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Every field present in the form is written; blank optional fields become NULL so they can be cleared.
function withNulls<T extends Record<string, unknown>>(data: T, formData: FormData) {
  const out: Record<string, unknown> = { ...data };
  for (const key of formData.keys()) {
    if (key === "id" || key === "employee_id" || key.startsWith("$ACTION")) continue;
    out[key] = data[key] ?? null;
  }
  return out as T;
}

function idFrom(formData: FormData, field = "id") {
  const parsed = idSchema.safeParse({ id: formData.get(field) });
  return parsed.success ? parsed.data.id : null;
}

// ---------------------------------------------------------------- core record (HR only, enforced by RLS)

export async function createEmployee(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(employeeSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const ctx = await getContext();
  const tenantId = ctx?.supportSession?.tenantId ?? ctx?.tenantId;
  const { data, error } = await supabase
    .from("employees")
    .insert({ ...parsed.data, tenant_id: tenantId ?? undefined })
    .select("id")
    .single();
  if (error) return safeError(error, "employees.create");
  redirect(`/employees/${data.id}`);
}

export async function updateEmployee(formData: FormData): Promise<ActionResult> {
  const id = idFrom(formData);
  const parsed = parseForm(employeeSchema, formData);
  if (!id) return { ok: false, error: "Missing record." };
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const values = withNulls(parsed.data, formData);
  // These inputs are hidden unless relevant, so clear them explicitly when they no longer apply.
  if (values.contract_type !== "fixed_term") values.fixed_term_end_date = null as never;
  if (values.status !== "leaver") values.end_date = null as never;
  const { data, error } = await supabase.from("employees").update(values).eq("id", id).select("id");
  if (error) return safeError(error, "employees.update");
  if (!data?.length)
    return { ok: false, error: "You don't have permission to change this record." };
  revalidatePath(`/employees/${id}`);
  return { ok: true, message: "Employment details saved." };
}

// ---------------------------------------------------------------- personal details (self or HR)

export async function savePersonal(formData: FormData): Promise<ActionResult> {
  const employeeId = idFrom(formData, "employee_id");
  const parsed = parseForm(personalSchema, formData);
  if (!employeeId) return { ok: false, error: "Missing record." };
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "You don't have permission to change this record." };
  const { error } = await supabase.from("employee_personal").upsert({
    employee_id: employeeId,
    tenant_id: emp.tenant_id,
    ...withNulls(parsed.data, formData),
  });
  if (error) return safeError(error, "employees.personal");
  revalidatePath(`/employees/${employeeId}`);
  return { ok: true, message: "Personal details saved." };
}

export async function addEmergencyContact(formData: FormData): Promise<ActionResult> {
  const employeeId = idFrom(formData, "employee_id");
  const parsed = parseForm(emergencyContactSchema, formData);
  if (!employeeId) return { ok: false, error: "Missing record." };
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "You don't have permission to change this record." };
  const { error } = await supabase
    .from("emergency_contacts")
    .insert({ ...parsed.data, employee_id: employeeId, tenant_id: emp.tenant_id });
  if (error) return safeError(error, "employees.emergencyContact");
  revalidatePath(`/employees/${employeeId}`);
  return { ok: true, message: "Emergency contact added." };
}

export async function deleteEmergencyContact(formData: FormData) {
  const id = idFrom(formData);
  const employeeId = idFrom(formData, "employee_id");
  if (!id || !employeeId) return;
  const supabase = await createClient();
  const { error } = await supabase.from("emergency_contacts").delete().eq("id", id);
  if (error) safeError(error, "employees.deleteEmergencyContact");
  revalidatePath(`/employees/${employeeId}`);
}

// ---------------------------------------------------------------- HR-only records

export async function addSalary(formData: FormData): Promise<ActionResult> {
  const employeeId = idFrom(formData, "employee_id");
  const parsed = parseForm(salarySchema, formData);
  if (!employeeId) return { ok: false, error: "Missing record." };
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "You don't have permission to change this record." };
  const { error } = await supabase
    .from("salary_history")
    .insert({ ...parsed.data, employee_id: employeeId, tenant_id: emp.tenant_id });
  if (error) return safeError(error, "employees.salary");
  revalidatePath(`/employees/${employeeId}`);
  return { ok: true, message: "Salary change recorded." };
}

export async function addRtwCheck(formData: FormData): Promise<ActionResult> {
  const employeeId = idFrom(formData, "employee_id");
  const parsed = parseForm(rtwSchema, formData);
  if (!employeeId) return { ok: false, error: "Missing record." };
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "You don't have permission to change this record." };
  const { error } = await supabase
    .from("right_to_work_checks")
    .insert({ ...parsed.data, employee_id: employeeId, tenant_id: emp.tenant_id });
  if (error) return safeError(error, "employees.rtw");
  revalidatePath(`/employees/${employeeId}`);
  return { ok: true, message: "Right-to-work check recorded." };
}

// ---------------------------------------------------------------- portal access

export async function inviteToPortal(formData: FormData): Promise<ActionResult> {
  const employeeId = idFrom(formData, "employee_id");
  if (!employeeId) return { ok: false, error: "Missing record." };
  const ctx = await getContext();
  if (!ctx?.isClientAdmin)
    return { ok: false, error: "Only Client Admins can give people portal access." };
  if (!hasAdminClient())
    return { ok: false, error: "Inviting users isn't configured yet (server key missing)." };

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id, work_email, user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "You don't have permission to change this record." };
  if (emp.user_id) return { ok: false, error: "This person already has portal access." };
  if (!emp.work_email) return { ok: false, error: "Add a work email address first." };

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    emp.work_email,
    {
      redirectTo: `${SITE_URL}/auth/confirm?next=/auth/reset-password`,
    },
  );
  if (inviteError || !invited.user) return safeError(inviteError, "employees.invite");

  // Membership is created with the caller's own client, so RLS re-checks they are a Client Admin.
  const { error: memberError } = await supabase
    .from("memberships")
    .insert({ tenant_id: emp.tenant_id, user_id: invited.user.id, role: "employee" });
  if (memberError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return safeError(memberError, "employees.inviteMembership");
  }
  const { error: linkError } = await supabase
    .from("employees")
    .update({ user_id: invited.user.id })
    .eq("id", employeeId);
  if (linkError) return safeError(linkError, "employees.inviteLink");

  revalidatePath(`/employees/${employeeId}`);
  return { ok: true, message: "Invitation sent. They'll receive an email to set their password." };
}
