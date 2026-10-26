"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { safeError, type ActionResult } from "@/lib/errors";
import { londonLocalToIso } from "@/lib/format";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import { breachSchema } from "@/lib/validation/gdpr";

export async function saveBreach(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(breachSchema, formData);
  if (!parsed.success)
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  const ctx = await getContext();
  if (!ctx?.isClientAdmin || ctx.supportSession || !ctx.tenantId)
    return { ok: false, error: "Only Client Admins can update the breach log." };
  const v = parsed.data;
  const iso = (s?: string) => (s ? londonLocalToIso(s) : null);
  const fields = {
    title: v.title,
    discovered_at: londonLocalToIso(v.discovered_at),
    occurred_at: iso(v.occurred_at),
    description: v.description,
    data_types: v.data_types ?? null,
    people_affected: v.people_affected ?? null,
    special_category: v.special_category,
    risk_level: v.risk_level,
    ico_reportable: v.ico_decision === "undecided" ? null : v.ico_decision === "yes",
    decision_reason: v.decision_reason ?? null,
    ico_reported_at: iso(v.ico_reported_at),
    ico_reference: v.ico_reference ?? null,
    individuals_informed_at: iso(v.individuals_informed_at),
    actions_taken: v.actions_taken ?? null,
    status: v.closed ? "closed" : "open",
  };
  const supabase = await createClient();
  const { error } = v.id
    ? await supabase.from("data_breaches").update(fields).eq("id", v.id)
    : await supabase
        .from("data_breaches")
        .insert({ ...fields, tenant_id: ctx.tenantId, created_by: ctx.userId });
  if (error) return safeError(error, "breaches.save");
  revalidatePath("/breaches");
  return { ok: true, message: v.id ? "Breach record updated." : "Breach recorded." };
}
