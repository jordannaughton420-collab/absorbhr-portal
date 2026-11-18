"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { safeError, type ActionResult } from "@/lib/errors";
import { shiftError } from "@/lib/shift-errors";
import { LEFT_OUT, shiftWhenFromParts } from "@/lib/shifts";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  createShiftSchema,
  groupMemberSchema,
  openShiftSchema,
  removeMemberSchema,
  shiftIdSchema,
  shiftSettingsSchema,
} from "@/lib/validation/shifts";

const INVALID = "Please check the highlighted fields.";

function refresh() {
  revalidatePath("/rota");
  revalidatePath("/shifts");
  revalidatePath("/calendar");
  revalidatePath("/", "layout");
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export async function createShift(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(createShiftSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_shift", {
    p_employee: v.employee_id,
    p_date: v.date,
    p_start: v.start_time,
    p_end: v.end_time,
    p_role: v.role_label,
    p_location: v.location_id,
    p_notes: v.notes,
    p_allow_short_rest: v.allow_short_rest,
  });
  if (error) return shiftError(error, "shifts.create");
  refresh();
  return {
    ok: true,
    message: `Shift added: ${shiftWhenFromParts(v.date, v.start_time, v.end_time)}.`,
  };
}

export async function postOpenShift(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(openShiftSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const people = v.employee_ids.length ? v.employee_ids : undefined;
  const { data: candidates, error: previewError } = await supabase.rpc("open_shift_candidates", {
    p_date: v.date,
    p_start: v.start_time,
    p_end: v.end_time,
    p_group: v.group_id,
    p_employees: people,
  });
  if (previewError) return shiftError(previewError, "shifts.candidates");
  const { error } = await supabase.rpc("post_open_shift", {
    p_date: v.date,
    p_start: v.start_time,
    p_end: v.end_time,
    p_role: v.role_label,
    p_location: v.location_id,
    p_notes: v.notes,
    p_group: v.group_id,
    p_employees: people,
  });
  if (error) return shiftError(error, "shifts.post");
  refresh();
  const sent = (candidates ?? []).filter((c) => c.available).map((c) => c.name);
  const left = (candidates ?? [])
    .filter((c) => !c.available)
    .map((c) => `${c.name} (${LEFT_OUT[c.reason ?? ""] ?? "not available"})`);
  return {
    ok: true,
    message:
      `Open shift posted for ${shiftWhenFromParts(v.date, v.start_time, v.end_time)}. ` +
      `Emailed ${listNames(sent)}; the first to accept gets it.` +
      (left.length ? ` Not sent to ${listNames(left)}.` : ""),
  };
}

export async function cancelShift(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftIdSchema, formData);
  if (!parsed.success) return { ok: false, error: "That shift couldn't be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_shift", { p_shift: parsed.data.shift_id });
  if (error) return shiftError(error, "shifts.cancel");
  refresh();
  return { ok: true, message: "Shift cancelled." };
}

export async function claimOpenShift(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftIdSchema, formData);
  if (!parsed.success) return { ok: false, error: "That shift couldn't be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_open_shift", { p_shift: parsed.data.shift_id });
  if (error) return shiftError(error, "shifts.claim");
  refresh();
  return { ok: true, message: "It's yours. The shift is now on your rota." };
}

export async function declineOpenShift(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftIdSchema, formData);
  if (!parsed.success) return { ok: false, error: "That shift couldn't be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_open_shift", { p_shift: parsed.data.shift_id });
  if (error) return shiftError(error, "shifts.decline");
  refresh();
  return { ok: true, message: "No problem. You can still accept it later while it's open." };
}

export async function addToShiftGroup(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(groupMemberSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_to_shift_group", {
    p_employee: parsed.data.employee_id,
    p_group_name: parsed.data.group_name,
  });
  if (error) return shiftError(error, "shifts.group_add");
  refresh();
  return { ok: true, message: `Added to “${parsed.data.group_name}”.` };
}

export async function removeFromShiftGroup(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(removeMemberSchema, formData);
  if (!parsed.success) return { ok: false, error: "That person couldn't be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_from_shift_group", {
    p_employee: parsed.data.employee_id,
    p_group: parsed.data.group_id,
  });
  if (error) return shiftError(error, "shifts.group_remove");
  refresh();
  return { ok: true, message: "Removed from the group." };
}

export async function updateShiftSettings(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftSettingsSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID };
  const ctx = await getContext();
  if (!ctx?.tenantId || !ctx.isClientAdmin || ctx.supportSession)
    return { ok: false, error: "Only the company's Client Admin can change this." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_settings")
    .update(parsed.data)
    .eq("tenant_id", ctx.tenantId)
    .select("tenant_id");
  if (error) return safeError(error, "settings.shifts");
  if (!data?.length)
    return { ok: false, error: "Only the company's Client Admin can change this." };
  refresh();
  return { ok: true, message: "Settings saved." };
}
