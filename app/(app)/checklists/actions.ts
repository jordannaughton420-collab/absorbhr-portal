"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import { startChecklistSchema, templateItemSchema } from "@/lib/validation/people";

const INVALID = "Please check the highlighted fields.";

export async function startChecklist(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(startChecklistSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_checklist", {
    p_employee: parsed.data.employee_id,
    p_template: parsed.data.template_id,
    p_anchor: parsed.data.anchor_date,
  });
  if (error) return safeError(error, "checklists.start");
  revalidatePath("/checklists");
  redirect(`/checklists/${data}`);
}

export async function setItem(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("item_id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_checklist_item", {
    p_item: id.data,
    p_done: formData.get("done") === "true",
  });
  if (error) safeError(error, "checklists.item");
  revalidatePath("/checklists", "layout");
  revalidatePath("/dashboard");
}

export async function deleteChecklist(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("checklists").delete().eq("id", id.data);
  if (error) safeError(error, "checklists.delete");
  revalidatePath("/checklists");
  redirect("/checklists");
}

export async function addTemplateItem(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(templateItemSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: tpl } = await supabase
    .from("checklist_templates")
    .select("tenant_id")
    .eq("id", parsed.data.template_id)
    .maybeSingle();
  if (!tpl) return { ok: false, error: "Template not found." };
  const { count } = await supabase
    .from("checklist_template_items")
    .select("id", { count: "exact", head: true })
    .eq("template_id", parsed.data.template_id);
  const { error } = await supabase
    .from("checklist_template_items")
    .insert({ ...parsed.data, tenant_id: tpl.tenant_id, position: (count ?? 0) + 1 });
  if (error) return safeError(error, "checklists.addTemplateItem");
  revalidatePath("/checklists/templates");
  return { ok: true, message: "Task added to the template." };
}

export async function deleteTemplateItem(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_template_items").delete().eq("id", id.data);
  if (error) safeError(error, "checklists.deleteTemplateItem");
  revalidatePath("/checklists/templates");
}
