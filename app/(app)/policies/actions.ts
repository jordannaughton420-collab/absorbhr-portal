"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actingTenantId, getContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { contentMatchesType, MAX_FILE_BYTES, safeFileName } from "@/lib/files";
import { fieldErrors, parseForm } from "@/lib/validation/form";
import {
  draftSchema,
  newPolicySchema,
  policyDetailsSchema,
  publishSchema,
} from "@/lib/validation/policy";

const INVALID = "Please check the highlighted fields.";
const BUCKET = "policy-documents";
const POLICY_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function refresh(id?: string) {
  revalidatePath("/policies");
  if (id) revalidatePath(`/policies/${id}`);
  revalidatePath("/dashboard");
}

export async function createPolicy(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(newPolicySchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await getContext();
  if (!ctx) return { ok: false, error: "Please sign in again." };
  const asTemplate = parsed.data.template === "true" && ctx.isPlatformAdmin && !ctx.supportSession;
  const tenantId = asTemplate ? null : actingTenantId(ctx);
  const { body, template: _t, ...details } = parsed.data; // eslint-disable-line @typescript-eslint/no-unused-vars
  const supabase = await createClient();
  const id = randomUUID();
  const { error } = await supabase.from("policies").insert({
    id,
    tenant_id: tenantId,
    ...details,
    department_ids: details.audience === "all" ? [] : details.department_ids,
  });
  if (error) return safeError(error, "policies.create");
  const { error: vError } = await supabase
    .from("policy_versions")
    .insert({ tenant_id: tenantId, policy_id: id, version: 1, body });
  if (vError) return safeError(vError, "policies.createVersion");
  refresh();
  redirect(`/policies/${id}`);
}

export async function updatePolicyDetails(formData: FormData): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = parseForm(policyDetailsSchema, formData);
  if (!id.success) return { ok: false, error: "Policy not found." };
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policies")
    .update({
      ...parsed.data,
      department_ids: parsed.data.audience === "all" ? [] : parsed.data.department_ids,
    })
    .eq("id", id.data)
    .select("id");
  if (error) return safeError(error, "policies.update");
  if (!data?.length) return { ok: false, error: "You can't change this policy." };
  refresh(id.data);
  return { ok: true, message: "Details saved." };
}

/** Saves the working draft: edits the unpublished draft, or starts a new version after the last published one. */
export async function saveDraft(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(draftSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: policy } = await supabase
    .from("policies")
    .select("id, tenant_id")
    .eq("id", parsed.data.policy_id)
    .maybeSingle();
  if (!policy) return { ok: false, error: "Policy not found." };
  const { data: latest } = await supabase
    .from("policy_versions")
    .select("id, version, published_at")
    .eq("policy_id", policy.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } =
    latest && !latest.published_at
      ? await supabase
          .from("policy_versions")
          .update({ body: parsed.data.body, change_summary: parsed.data.change_summary ?? null })
          .eq("id", latest.id)
      : await supabase.from("policy_versions").insert({
          tenant_id: policy.tenant_id,
          policy_id: policy.id,
          version: (latest?.version ?? 0) + 1,
          body: parsed.data.body,
          change_summary: parsed.data.change_summary,
        });
  if (error) return safeError(error, "policies.draft");
  refresh(policy.id);
  return { ok: true, message: "Draft saved. Publish it when you're ready." };
}

export async function publishDraft(formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(publishSchema, formData);
  if (!parsed.success) return { ok: false, error: INVALID };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_policy_version", {
    p_version: parsed.data.version_id,
    p_require_reack: parsed.data.require_reack,
  });
  if (error) return safeError(error, "policies.publish");
  const policyId = String(formData.get("policy_id") ?? "");
  refresh(policyId);
  return { ok: true, message: "Published." };
}

export async function setPolicyArchived(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  const archived = formData.get("archived") === "true";
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("policies")
    .update({ status: archived ? "archived" : "published" })
    .eq("id", id.data);
  if (error) safeError(error, "policies.archive");
  refresh(id.data);
}

export async function acknowledgePolicy(formData: FormData) {
  const versionId = z.uuid().safeParse(formData.get("version_id"));
  if (!versionId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_policy", { p_version: versionId.data });
  if (error) safeError(error, "policies.acknowledge");
  refresh(String(formData.get("policy_id") ?? ""));
}

export async function copyTemplate(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("template_id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_policy_template", { p_template: id.data });
  if (error || !data) {
    safeError(error, "policies.copyTemplate");
    return;
  }
  refresh();
  redirect(`/policies/${data}`);
}

// ---------------------------------------------------------------- optional attached file (PDF/Word)

const fileSchema = z.object({
  version_id: z.uuid(),
  file_name: z.string().min(1).max(255),
  mime_type: z.enum(
    POLICY_FILE_TYPES as [string, ...string[]],
    "Attach a PDF or Word (.docx) file",
  ),
  size: z.number().int().min(1).max(MAX_FILE_BYTES, "Files must be 10 MB or smaller"),
});

export async function startPolicyFileUpload(
  input: z.input<typeof fileSchema>,
): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid file." };
  const supabase = await createClient();
  // Only someone who can edit this draft gets it back here (RLS: HR / AbsorbHR for templates).
  const { data: ver } = await supabase
    .from("policy_versions")
    .select("id, policy_id, tenant_id, published_at")
    .eq("id", parsed.data.version_id)
    .maybeSingle();
  const ctx = await getContext();
  const canManage = ver && (ver.tenant_id ? ctx?.isHr : ctx?.isPlatformAdmin);
  if (!ver || ver.published_at || !canManage)
    return { ok: false, error: "Files can only be attached to a draft you manage." };
  const path = `${ver.tenant_id ?? "templates"}/${ver.policy_id}/${randomUUID()}`;
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return safeError(error, "policies.signUpload");
  return { ok: true, data: { path, token: data.token } };
}

export async function finishPolicyFileUpload(input: {
  version_id: string;
  path: string;
  file_name: string;
  mime_type: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({
      version_id: z.uuid(),
      path: z.string().max(300),
      file_name: z.string().max(255),
      mime_type: z.enum(POLICY_FILE_TYPES as [string, ...string[]]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  const supabase = await createClient();
  // Check the path belongs to a draft this person can edit BEFORE touching storage, so a
  // forged path can never make the server read or delete someone else's file.
  const { data: before } = await supabase
    .from("policy_versions")
    .select("file_path, policy_id, tenant_id, published_at")
    .eq("id", parsed.data.version_id)
    .maybeSingle();
  const ctx = await getContext();
  const canManage = before && (before.tenant_id ? ctx?.isHr : ctx?.isPlatformAdmin);
  const folder = before ? `${before.tenant_id ?? "templates"}/${before.policy_id}/` : "";
  const fileId = parsed.data.path.slice(folder.length);
  if (
    !before ||
    before.published_at ||
    !canManage ||
    !parsed.data.path.startsWith(folder) ||
    !z.uuid().safeParse(fileId).success
  ) {
    return { ok: false, error: "Files can only be attached to a draft you manage." };
  }
  const admin = createAdminClient();
  const { data: blob } = await admin.storage.from(BUCKET).download(parsed.data.path);
  const bytes = blob ? Buffer.from(await blob.arrayBuffer()) : null;
  if (
    !bytes ||
    bytes.length > MAX_FILE_BYTES ||
    !contentMatchesType(bytes, parsed.data.mime_type)
  ) {
    await admin.storage.from(BUCKET).remove([parsed.data.path]);
    return {
      ok: false,
      error: "That file doesn't look like a PDF or Word document, so it wasn't saved.",
    };
  }
  // RLS + trigger re-check: only an editable draft, and only a path inside this policy's own folder.
  const { data, error } = await supabase
    .from("policy_versions")
    .update({
      file_path: parsed.data.path,
      file_name: safeFileName(parsed.data.file_name),
      file_mime: parsed.data.mime_type,
    })
    .eq("id", parsed.data.version_id)
    .select("id");
  if (error || !data?.length) {
    await admin.storage.from(BUCKET).remove([parsed.data.path]);
    return error
      ? safeError(error, "policies.attach")
      : { ok: false, error: "You can't change this draft." };
  }
  if (before?.file_path) await admin.storage.from(BUCKET).remove([before.file_path]);
  refresh(before?.policy_id);
  return { ok: true, message: "File attached." };
}

export async function getPolicyFileUrl(versionId: string): Promise<ActionResult<{ url: string }>> {
  if (!z.uuid().safeParse(versionId).success) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { data: ver } = await supabase
    .from("policy_versions")
    .select("file_path, file_name")
    .eq("id", versionId)
    .maybeSingle();
  if (!ver?.file_path) return { ok: false, error: "Not found." };
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(ver.file_path, 60, { download: ver.file_name ?? "policy" });
  if (error || !data) return safeError(error, "policies.fileUrl");
  return { ok: true, data: { url: data.signedUrl } };
}
