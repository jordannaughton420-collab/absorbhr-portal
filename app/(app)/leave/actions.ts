"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actingTenantId, getContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { leaveError } from "@/lib/leave-errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  adjustmentSchema,
  decisionSchema,
  holidayPolicySchema,
  leaveRequestSchema,
} from "@/lib/validation/leave";

const INVALID = "Please check the highlighted fields.";

function refresh() {
  revalidatePath("/leave", "layout");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/employees", "layout");
}

export async function requestLeave(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(leaveRequestSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_leave", {
    p_employee: v.employee_id,
    p_leave_type: v.leave_type_id,
    p_start: v.start_date,
    p_end: v.end_date,
    p_half_start: v.half_day_start,
    p_half_end: v.half_day_end,
    p_note: v.note,
  });
  if (error) return leaveError(error, "leave.request");
  refresh();
  return { ok: true, message: "Request sent. You'll see it update here once it's been decided." };
}

const previewSchema = z.object({
  employee_id: z.uuid(),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  half_day_start: z.boolean(),
  half_day_end: z.boolean(),
});

/** Live "this will use N days" preview for the request form. */
export async function previewLeaveDays(
  input: z.infer<typeof previewSchema>,
): Promise<number | null> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success || parsed.data.end_date < parsed.data.start_date) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_leave_days", {
    p_employee: parsed.data.employee_id,
    p_start: parsed.data.start_date,
    p_end: parsed.data.end_date,
    p_half_start: parsed.data.half_day_start,
    p_half_end: parsed.data.half_day_end,
  });
  return error ? null : Number(data);
}

export async function decideLeave(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(decisionSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const approve = parsed.data.approve === "true";
  const { error } = await supabase.rpc("decide_leave", {
    p_request: parsed.data.request_id,
    p_approve: approve,
    p_note: parsed.data.decision_note,
  });
  if (error) return leaveError(error, "leave.decide");
  refresh();
  return { ok: true, message: approve ? "Approved." : "Declined." };
}

export async function cancelLeave(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("request_id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave", { p_request: id.data });
  if (error) leaveError(error, "leave.cancel");
  refresh();
}

export async function addAdjustment(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(adjustmentSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", parsed.data.employee_id)
    .maybeSingle();
  if (!emp) return { ok: false, error: "You don't have permission to change this record." };
  const { error } = await supabase
    .from("leave_adjustments")
    .insert({ ...parsed.data, tenant_id: emp.tenant_id, kind: "manual" });
  if (error) return safeError(error, "leave.adjustment");
  refresh();
  return { ok: true, message: "Adjustment saved." };
}

export async function saveHolidayPolicy(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(holidayPolicySchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  const tenantId = ctx ? actingTenantId(ctx) : null;
  if (!tenantId) return { ok: false, error: "You don't have permission to change this." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holiday_policies")
    .update({
      full_time_entitlement_days: v.full_time_entitlement_days,
      full_time_days_per_week: v.full_time_days_per_week,
      bank_holidays_in_allowance: v.bank_holidays_in_allowance === "true",
      carry_over_max_days: v.carry_over_max_days,
      carry_over_expiry_months:
        v.carry_over_max_days > 0 && v.carry_over_expiry_months > 0
          ? v.carry_over_expiry_months
          : null,
      configured_at: new Date().toISOString(),
      configured_by: ctx!.userId,
    })
    .eq("tenant_id", tenantId)
    .select("tenant_id");
  if (error) return safeError(error, "leave.policy");
  if (!data?.length)
    return { ok: false, error: "Only Client Admins can change the holiday rules." };
  const { error: yearError } = await supabase
    .from("tenant_settings")
    .update({
      leave_year_start_month: v.leave_year_start_month,
      leave_year_start_day: v.leave_year_start_day,
    })
    .eq("tenant_id", tenantId);
  if (yearError) return safeError(yearError, "leave.policyYear");
  revalidatePath("/", "layout");
  return { ok: true, message: "Holiday rules saved. Staff can now book holiday." };
}

export async function processCarryOver(formData: FormData): Promise<ActionResult> {
  const year = z.iso.date().safeParse(formData.get("leave_year_start"));
  if (!year.success) return { ok: false, error: "Choose a leave year." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("process_carry_over", { p_year_start: year.data });
  if (error) return leaveError(error, "leave.carryOver");
  refresh();
  return { ok: true, message: `Carry-over recorded for ${data ?? 0} people.` };
}
