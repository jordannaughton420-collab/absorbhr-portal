"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actingTenantId, getContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  cycleSchema,
  managerReviewSchema,
  reviewSettingsSchema,
  selfAssessmentSchema,
  signSchema,
  startReviewSchema,
} from "@/lib/validation/people";

const INVALID = "Please check the highlighted fields.";
const LOCKED = "This part has already been submitted and can't be changed.";

function refresh(id?: string) {
  revalidatePath("/reviews");
  if (id) revalidatePath(`/reviews/${id}`);
  revalidatePath("/dashboard");
}

function hint(error: { hint?: string } | null) {
  return error?.hint === "locked";
}

export async function createCycle(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(cycleSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  const tenantId = ctx ? actingTenantId(ctx) : null;
  if (!tenantId) return { ok: false, error: "You can't do that." };
  const supabase = await createClient();
  const { data: cycle, error } = await supabase
    .from("review_cycles")
    .insert({ ...parsed.data, tenant_id: tenantId })
    .select("id")
    .single();
  if (error) return safeError(error, "reviews.cycle");
  const { data: n, error: launchError } = await supabase.rpc("launch_review_cycle", {
    p_cycle: cycle.id,
  });
  if (launchError) return safeError(launchError, "reviews.launch");
  refresh();
  return {
    ok: true,
    message: `Review round started: ${n ?? 0} reviews created (everyone with a line manager).`,
  };
}

export async function closeCycle(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("review_cycles")
    .update({ status: "closed" })
    .eq("id", id.data);
  if (error) safeError(error, "reviews.closeCycle");
  refresh();
}

export async function startReview(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(startReviewSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_review", {
    p_employee: parsed.data.employee_id,
    p_title: parsed.data.title,
  });
  if (error) return safeError(error, "reviews.start");
  refresh();
  redirect(`/reviews/${data}`);
}

export async function saveSelfAssessment(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(selfAssessmentSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const submit = parsed.data.submit === "true";
  if (submit && parsed.data.self_assessment.length < 10) {
    return {
      ok: false,
      error: INVALID,
      fieldErrors: { self_assessment: "Write a little more before submitting" },
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_self_assessment", {
    p_review: parsed.data.review_id,
    p_text: parsed.data.self_assessment,
    p_submit: submit,
  });
  if (error) return hint(error) ? { ok: false, error: LOCKED } : safeError(error, "reviews.self");
  refresh(parsed.data.review_id);
  return { ok: true, message: submit ? "Submitted to your manager." : "Draft saved." };
}

export async function saveManagerReview(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(managerReviewSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const submit = parsed.data.submit === "true";
  if (submit && parsed.data.manager_assessment.length < 10) {
    return {
      ok: false,
      error: INVALID,
      fieldErrors: { manager_assessment: "Write a little more before sharing" },
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_manager_review", {
    p_review: parsed.data.review_id,
    p_assessment: parsed.data.manager_assessment,
    p_rating: parsed.data.rating ?? null,
    p_objectives: parsed.data.objectives ?? null,
    p_submit: submit,
  } as never);
  if (error)
    return hint(error) ? { ok: false, error: LOCKED } : safeError(error, "reviews.manager");
  refresh(parsed.data.review_id);
  return {
    ok: true,
    message: submit
      ? "Shared with the employee for discussion and sign-off."
      : "Draft saved (not visible to the employee).",
  };
}

export async function signReview(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(signSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_review", {
    p_review: parsed.data.review_id,
    p_comments: parsed.data.employee_comments,
  });
  if (error) return safeError(error, "reviews.sign");
  refresh(parsed.data.review_id);
  return { ok: true, message: "Signed." };
}

export async function saveReviewSettings(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(reviewSettingsSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  const tenantId = ctx ? actingTenantId(ctx) : null;
  if (!tenantId) return { ok: false, error: "You can't do that." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_settings")
    .update({
      review_rating_scale: v.review_rating_scale === "true",
      review_rating_labels: [v.label_1, v.label_2, v.label_3, v.label_4, v.label_5],
    })
    .eq("tenant_id", tenantId)
    .select("tenant_id");
  if (error) return safeError(error, "reviews.settings");
  if (!data?.length) return { ok: false, error: "Only Client Admins can change this." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Review settings saved." };
}
