"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import { noteSchema } from "@/lib/validation/people";

export async function addNote(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(noteSchema, formData);
  if (!parsed.success)
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", parsed.data.employee_id)
    .maybeSingle();
  if (!emp) return { ok: false, error: "You can't add notes for this person." };
  const { error } = await supabase
    .from("one_to_one_notes")
    .insert({ ...parsed.data, tenant_id: emp.tenant_id });
  if (error) return safeError(error, "notes.add");
  revalidatePath(`/employees/${parsed.data.employee_id}`);
  return {
    ok: true,
    message: parsed.data.is_private
      ? "Private note saved."
      : "Note saved and shared with the employee.",
  };
}

export async function deleteNote(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("one_to_one_notes")
    .delete()
    .eq("id", id.data)
    .select("employee_id");
  if (error) safeError(error, "notes.delete");
  if (data?.length) revalidatePath(`/employees/${data[0].employee_id}`);
}
