"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  diversitySchema,
  rectificationSchema,
  resolveRectificationSchema,
} from "@/lib/validation/people";

const INVALID = "Please check the highlighted fields.";

export async function submitRectification(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(rectificationSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  if (!ctx?.employeeId || !ctx.tenantId)
    return { ok: false, error: "Only employees can raise correction requests." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("rectification_requests")
    .insert({ ...parsed.data, employee_id: ctx.employeeId, tenant_id: ctx.tenantId });
  if (error) return safeError(error, "requests.submit");
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  return { ok: true, message: "Sent to HR. You'll see their reply here." };
}

export async function resolveRectification(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(resolveRectificationSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rectification_requests")
    .update({
      status: parsed.data.status,
      resolution_note: parsed.data.resolution_note,
      resolved_by: ctx?.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return safeError(error, "requests.resolve");
  if (!data?.length) return { ok: false, error: "Only HR can resolve requests." };
  revalidatePath("/requests");
  return { ok: true, message: "Saved. The employee can now see your reply." };
}

export async function saveDiversity(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(diversitySchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  if (!ctx?.employeeId) return { ok: false, error: "Only employees can complete this." };
  const answers = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_sensitive", {
    p_employee: ctx.employeeId,
    p_data: answers,
  });
  if (error) return safeError(error, "requests.diversity");
  revalidatePath(`/employees/${ctx.employeeId}`);
  return {
    ok: true,
    message: Object.keys(answers).length
      ? "Thank you — saved securely."
      : "Your answers have been removed.",
  };
}
