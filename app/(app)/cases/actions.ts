"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import { caseEventSchema, openCaseSchema, updateCaseSchema } from "@/lib/validation/people";

const INVALID = "Please check the highlighted fields.";

// All case data goes through permission-checked database functions; nothing is read or written directly.
export async function openCase(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(openCaseSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_case", {
    p_employee: parsed.data.employee_id,
    p_type: parsed.data.case_type,
    p_summary: parsed.data.summary,
    p_opened_on: parsed.data.opened_on,
  });
  if (error) {
    if (error.code === "42501")
      return {
        ok: false,
        error: "You can't open a case for this person (you can never see a case about yourself).",
      };
    return safeError(error, "cases.open");
  }
  revalidatePath("/cases");
  redirect(`/cases/${data}`);
}

export async function updateCase(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(updateCaseSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_case", {
    p_case: v.case_id,
    p_status: v.status,
    p_outcome: v.outcome ?? null,
    p_summary: v.summary,
    p_closed_on: v.closed_on ?? null,
  } as never);
  if (error) return safeError(error, "cases.update");
  revalidatePath("/cases");
  revalidatePath(`/cases/${v.case_id}`);
  return { ok: true, message: "Case updated." };
}

export async function addCaseEvent(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(caseEventSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_case_event", {
    p_case: parsed.data.case_id,
    p_date: parsed.data.event_date,
    p_type: parsed.data.event_type,
    p_details: parsed.data.details,
  });
  if (error) return safeError(error, "cases.event");
  revalidatePath(`/cases/${parsed.data.case_id}`);
  return { ok: true, message: "Added to the timeline." };
}
