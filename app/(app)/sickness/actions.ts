"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/errors";
import { leaveError } from "@/lib/leave-errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  endSicknessSchema,
  exclusionSchema,
  returnToWorkSchema,
  sicknessReasonSchema,
  sicknessSchema,
} from "@/lib/validation/leave";

const INVALID = "Please check the highlighted fields.";

function refresh(id?: string) {
  revalidatePath("/sickness");
  if (id) revalidatePath(`/sickness/${id}`);
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function recordSickness(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(sicknessSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_sickness", {
    p_employee: v.employee_id,
    p_start: v.start_date,
    p_end: v.end_date,
    p_half_start: v.half_day_start,
    p_half_end: v.half_day_end,
    p_reason_category: v.reason_category,
    p_notes: v.notes,
  });
  if (error) return leaveError(error, "sickness.record");
  refresh();
  redirect(`/sickness/${data}`);
}

export async function endSickness(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(endSicknessSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_sickness", {
    p_absence: parsed.data.absence_id,
    p_end: parsed.data.end_date,
    p_half_end: parsed.data.half_day_end,
  });
  if (error) return leaveError(error, "sickness.end");
  refresh(parsed.data.absence_id);
  return { ok: true, message: "Return date saved." };
}

export async function updateSicknessReason(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(sicknessReasonSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_sickness_reason", {
    p_absence: parsed.data.absence_id,
    p_reason_category: parsed.data.reason_category ?? null,
    p_notes: parsed.data.notes ?? null,
  } as never);
  if (error) return leaveError(error, "sickness.reason");
  refresh(parsed.data.absence_id);
  return { ok: true, message: "Reason saved." };
}

export async function saveReturnToWork(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(returnToWorkSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const { absence_id, meeting_date, ...form } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_return_to_work", {
    p_absence: absence_id,
    p_meeting_date: meeting_date,
    p_form: Object.fromEntries(Object.entries(form).filter(([, v]) => v !== undefined)),
  });
  if (error) return leaveError(error, "sickness.rtw");
  refresh(absence_id);
  return {
    ok: true,
    message: "Return-to-work form saved. The employee will be asked to confirm it.",
  };
}

export async function acknowledgeReturnToWork(formData: FormData) {
  const id = String(formData.get("absence_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_return_to_work", { p_absence: id });
  if (error) leaveError(error, "sickness.rtwAck");
  refresh(id);
}

export async function setExclusion(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(exclusionSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_sickness_exclusion", {
    p_absence: parsed.data.absence_id,
    p_basis: parsed.data.basis === "none" ? null : parsed.data.basis,
  } as never);
  if (error) return leaveError(error, "sickness.exclusion");
  refresh(parsed.data.absence_id);
  return { ok: true, message: "Saved." };
}

export type SicknessDetails = {
  details: { reason_category?: string; notes?: string } | null;
  rtw: {
    meeting_date: string;
    fit_to_return?: string;
    gp_seen?: string;
    fit_note_received?: string;
    adjustments?: string;
    support_offered?: string;
    notes?: string;
    employee_acknowledged_at: string | null;
  } | null;
};

/** Decrypts reason + return-to-work notes on request. Each call is written to the audit log. */
export async function getSicknessDetails(absenceId: string): Promise<SicknessDetails | null> {
  if (!/^[0-9a-f-]{36}$/i.test(absenceId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_sickness_details", { p_absence: absenceId });
  if (error) {
    leaveError(error, "sickness.details");
    return null;
  }
  return data as SicknessDetails;
}
