"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/audit";
import { safeError, type ActionResult } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  anonymiseSchema,
  holdSchema,
  retentionSettingsSchema,
  sarIdSchema,
  sarSchema,
} from "@/lib/validation/gdpr";
import { buildSarZip } from "@/lib/sar";

const INVALID = "Please check the highlighted fields.";
const SAR_BUCKET = "sar-exports";
const DOC_BUCKET = "employee-documents";

// Everything here is HR-only, never in an AbsorbHR support session (the database enforces the same).
async function hrContext() {
  const ctx = await getContext();
  if (!ctx?.isHr || ctx.supportSession || ctx.aal !== "aal2") return null;
  return ctx;
}

type SarJson = {
  company?: string;
  employment_record?: { first_name?: string; last_name?: string };
  documents?: {
    id: string;
    title: string;
    file_name: string;
    storage_path: string;
    case_document: boolean;
  }[];
  one_to_one_notes?: { private: boolean }[];
  cases?: unknown[];
};

export async function createSarExport(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(sarSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await hrContext();
  if (!ctx || !ctx.tenantId)
    return { ok: false, error: "Only HR (signed in with two-step verification) can do this." };
  if (!hasAdminClient())
    return { ok: false, error: "File storage isn't configured on this server." };
  const { employee_id, request_received_on } = parsed.data;
  const supabase = await createClient();

  // 1. The database checks permission, decrypts and records the export in the audit log.
  const { data, error } = await supabase.rpc("sar_data", { p_employee: employee_id });
  if (error || !data) return safeError(error, "sar.data");
  const sar = data as SarJson;
  const needsReview =
    (sar.cases?.length ?? 0) > 0 ||
    (sar.one_to_one_notes ?? []).some((n) => n.private) ||
    (sar.documents ?? []).some((d) => d.case_document);

  // 2. Record the export (RLS re-checks access).
  const { data: row, error: insErr } = await supabase
    .from("sar_exports")
    .insert({
      tenant_id: ctx.tenantId,
      employee_id,
      request_received_on,
      requested_by: ctx.userId,
      needs_redaction_review: needsReview,
    })
    .select("id")
    .single();
  if (insErr || !row) return safeError(insErr, "sar.insert");

  // 3. Copy the person's documents into the ZIP and upload it to private storage.
  const admin = createAdminClient();
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const d of sar.documents ?? []) {
    const { data: blob } = await admin.storage.from(DOC_BUCKET).download(d.storage_path);
    if (blob)
      files.push({
        name: `${d.case_document ? "CASE - " : ""}${d.file_name}`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
  }
  const name =
    `${sar.employment_record?.first_name ?? ""} ${sar.employment_record?.last_name ?? ""}`.trim();
  const zip = await buildSarZip(data as Record<string, never>, files, {
    name,
    company: sar.company ?? "",
    received: formatDate(request_received_on),
    generated: formatDate(new Date().toISOString().slice(0, 10)),
  });
  const path = `${ctx.tenantId}/${row.id}.zip`;
  const { error: upErr } = await admin.storage
    .from(SAR_BUCKET)
    .upload(path, zip, { contentType: "application/zip" });
  if (upErr) {
    await supabase.from("sar_exports").update({ status: "expired" }).eq("id", row.id);
    return safeError(upErr, "sar.upload");
  }
  await supabase
    .from("sar_exports")
    .update({ storage_path: path, size_bytes: zip.byteLength })
    .eq("id", row.id);
  revalidatePath("/privacy-tools");
  return {
    ok: true,
    message: needsReview
      ? "Export ready. It contains case records or private notes — check them for other people's data before you send it."
      : "Export ready. Check it before you send it.",
  };
}

export async function getSarExportUrl(id: string): Promise<ActionResult<{ url: string }>> {
  if (!sarIdSchema.safeParse({ id }).success) return { ok: false, error: "Export not found." };
  const ctx = await hrContext();
  if (!ctx) return { ok: false, error: "Export not found." };
  const supabase = await createClient();
  // RLS decides whether this person may see the export record at all.
  const { data: exp } = await supabase
    .from("sar_exports")
    .select("id, employee_id, storage_path, status, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!exp?.storage_path || exp.status === "expired" || new Date(exp.expires_at) < new Date())
    return { ok: false, error: "This export has expired. Create a new one." };
  const expectedPrefix = `${ctx.tenantId}/${exp.id}.zip`;
  if (exp.storage_path !== expectedPrefix) return { ok: false, error: "Export not found." };
  const { data, error } = await createAdminClient()
    .storage.from(SAR_BUCKET)
    .createSignedUrl(exp.storage_path, 60, {
      download: `subject-access-request-${formatDate(new Date().toISOString().slice(0, 10)).replace(/ /g, "-")}.zip`,
    });
  if (error || !data) return safeError(error, "sar.url");
  await logEvent("export", "sar_exports", { entityId: exp.id, subjectEmployeeId: exp.employee_id });
  return { ok: true, data: { url: data.signedUrl } };
}

export async function releaseSarExport(formData: FormData) {
  const parsed = sarIdSchema.safeParse({ id: formData.get("id") });
  const ctx = await hrContext();
  if (!parsed.success || !ctx) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("sar_exports")
    .update({ status: "released", released_by: ctx.userId, released_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("status", "review");
  if (error) safeError(error, "sar.release");
  revalidatePath("/privacy-tools");
}

export async function setHold(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(holdSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  if (!(await hrContext())) return { ok: false, error: "You can't do that." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_retention_hold", {
    p_employee: parsed.data.employee_id,
    p_reason: parsed.data.reason,
  });
  if (error) return safeError(error, "retention.hold");
  revalidatePath("/privacy-tools");
  return { ok: true, message: "Hold added. This record won't be anonymised until you lift it." };
}

export async function liftHold(formData: FormData) {
  const id = sarIdSchema.safeParse({ id: formData.get("employee_id") });
  if (!id.success || !(await hrContext())) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_retention_hold", {
    p_employee: id.data.id,
    p_reason: "",
  });
  if (error) safeError(error, "retention.lift");
  revalidatePath("/privacy-tools");
}

const ANONYMISE_ERRORS: Record<string, string> = {
  not_due: "This person's retention period hasn't ended yet.",
  on_hold: "This record is on hold. Lift the hold first.",
  already_done: "This record has already been anonymised.",
  reason: "Give a reason of at least 20 characters.",
  not_leaver: "Only leavers, or people who never started, can be erased.",
};

export async function anonymise(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(anonymiseSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await hrContext();
  if (!ctx) return { ok: false, error: "You can't do that." };
  if (parsed.data.early && !ctx.isClientAdmin)
    return {
      ok: false,
      error: "Only Client Admins can erase a record before the retention period ends.",
    };
  const supabase = await createClient();
  const { error } = await supabase.rpc("anonymise_employee", {
    p_employee: parsed.data.employee_id,
    p_reason: parsed.data.reason ?? "",
    p_early: parsed.data.early,
  });
  if (error) {
    const known = error.hint && ANONYMISE_ERRORS[error.hint];
    return known ? { ok: false, error: known } : safeError(error, "retention.anonymise");
  }
  revalidatePath("/privacy-tools");
  return {
    ok: true,
    message: "Anonymised. Their files and login will be deleted within a few minutes.",
  };
}

export async function saveRetentionSettings(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(retentionSettingsSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  if (!ctx?.isClientAdmin || ctx.supportSession || !ctx.tenantId)
    return { ok: false, error: "Only Client Admins can change this." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_settings")
    .update({ retention_years: parsed.data.retention_years })
    .eq("tenant_id", ctx.tenantId)
    .select("tenant_id");
  if (error) return safeError(error, "retention.settings");
  if (!data?.length) return { ok: false, error: "Only Client Admins can change this." };
  revalidatePath("/privacy-tools");
  return { ok: true, message: "Retention period saved." };
}
