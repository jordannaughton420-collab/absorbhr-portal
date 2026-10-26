"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/audit";
import { safeError, type ActionResult } from "@/lib/errors";
import { contentMatchesType, MAX_FILE_BYTES, safeFileName, sha256 } from "@/lib/files";
import { fieldErrors } from "@/lib/validation/form";
import { startUploadSchema, updateDocumentSchema } from "@/lib/validation/documents";

const BUCKET = "employee-documents";

/**
 * Step 1 of an upload. The database (RLS) decides whether this person may add this kind of
 * document for this employee. If so, we return a single-use signed URL so the browser can send
 * the file straight to private storage (it never passes through our web server).
 */
export async function startDocumentUpload(
  input: z.input<typeof startUploadSchema>,
): Promise<ActionResult<{ id: string; path: string; token: string }>> {
  const parsed = startUploadSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Please check the details.",
      fieldErrors: fieldErrors(parsed.error),
    };
  const v = parsed.data;
  const supabase = await createClient();
  // RLS: returns the record only to HR, the employee themself or their direct line manager.
  const { data: emp } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", v.employee_id)
    .maybeSingle();
  if (!emp?.tenant_id) return { ok: false, error: "You can't add documents for this person." };

  const id = randomUUID();
  const path = `${emp.tenant_id}/${v.employee_id}/${id}`;
  const { error } = await supabase.from("documents").insert({
    id,
    tenant_id: emp.tenant_id,
    employee_id: v.employee_id,
    category: v.category,
    title: v.title,
    file_name: safeFileName(v.file_name),
    mime_type: v.mime_type,
    visibility: v.visibility,
    storage_path: path,
    case_id: v.case_id ?? null,
  });
  if (error) {
    if (error.code === "42501")
      return { ok: false, error: "You can't add that kind of document for this person." };
    return safeError(error, "documents.start");
  }
  const { data: signed, error: signError } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) return safeError(signError, "documents.sign");
  return { ok: true, data: { id, path, token: signed.token } };
}

/** Step 2: check the uploaded file really is what it claims to be, then make it available. */
export async function finishDocumentUpload(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Upload not found." };
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type, status, employee_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc || doc.status !== "uploading") return { ok: false, error: "Upload not found." };

  const admin = createAdminClient();
  const discard = async (message: string) => {
    await admin.storage.from(BUCKET).remove([doc.storage_path]);
    await admin.from("documents").delete().eq("id", id);
    return { ok: false as const, error: message };
  };
  const { data: blob, error } = await admin.storage.from(BUCKET).download(doc.storage_path);
  if (error || !blob) return discard("The upload didn't complete. Please try again.");
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES)
    return discard("Files must be 10 MB or smaller.");
  if (!contentMatchesType(bytes, doc.mime_type)) {
    return discard("That file doesn't look like the type it claims to be, so it wasn't saved.");
  }
  const { error: updError } = await admin
    .from("documents")
    .update({ status: "available", size_bytes: bytes.length, sha256: sha256(bytes) })
    .eq("id", id);
  if (updError) return safeError(updError, "documents.finish");
  revalidatePath(`/employees/${doc.employee_id}`);
  return { ok: true, message: "Document uploaded." };
}

/** A 60-second download link, only for documents this person is allowed to see. Logged. */
export async function getDocumentUrl(id: string): Promise<ActionResult<{ url: string }>> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Document not found." };
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, file_name, employee_id, status")
    .eq("id", id)
    .eq("status", "available")
    .maybeSingle();
  if (!doc) return { ok: false, error: "Document not found." };
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !data) return safeError(error, "documents.url");
  await logEvent("view", "documents", { entityId: doc.id, subjectEmployeeId: doc.employee_id });
  return { ok: true, data: { url: data.signedUrl } };
}

export async function updateDocumentVisibility(formData: FormData): Promise<ActionResult> {
  const parsed = updateDocumentSchema.safeParse({
    id: formData.get("id"),
    visibility: formData.get("visibility"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the details." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ visibility: parsed.data.visibility })
    .eq("id", parsed.data.id)
    .select("employee_id");
  if (error) return safeError(error, "documents.visibility");
  if (!data?.length) return { ok: false, error: "Only HR can change who sees a document." };
  revalidatePath(`/employees/${data[0].employee_id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteDocument(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  // RLS allows only HR to delete; the file is removed only if the row was.
  const { data } = await supabase
    .from("documents")
    .delete()
    .eq("id", id.data)
    .select("storage_path, employee_id");
  if (data?.length) {
    await createAdminClient().storage.from(BUCKET).remove([data[0].storage_path]);
    revalidatePath(`/employees/${data[0].employee_id}`);
  }
}
