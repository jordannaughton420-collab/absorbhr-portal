"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPT_ATTRIBUTE,
  DOCUMENT_CATEGORIES,
  DOCUMENT_VISIBILITY,
  MAX_UPLOAD_MB,
  mimeFor,
  startUploadSchema,
} from "@/lib/validation/documents";
import { fieldErrors } from "@/lib/validation/form";
import {
  finishDocumentUpload,
  getDocumentUrl,
  startDocumentUpload,
  updateDocumentVisibility,
} from "./actions";

type Category = keyof typeof DOCUMENT_CATEGORIES;
type Visibility = keyof typeof DOCUMENT_VISIBILITY;

export function DocumentUpload({
  employeeId,
  caseId,
  categories,
  visibilities,
  defaultVisibility,
}: {
  employeeId: string;
  caseId?: string;
  categories: Category[];
  visibilities: Visibility[];
  defaultVisibility: Visibility;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );
  const [step, setStep] = React.useState<"idle" | "uploading" | "checking">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setErrors({ file: "Choose a file to upload" });
      return;
    }
    const input = {
      employee_id: employeeId,
      ...(caseId ? { case_id: caseId } : {}),
      category: String(fd.get("category") ?? ""),
      visibility: String(fd.get("visibility") ?? defaultVisibility),
      title: String(fd.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, ""),
      file_name: file.name,
      mime_type: mimeFor(file.name, file.type),
      size: file.size,
    };
    const parsed = startUploadSchema.safeParse(input);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors({ ...errs, file: errs.mime_type ?? errs.size ?? errs.file });
      return;
    }
    setErrors({});
    setStep("uploading");
    try {
      const started = await startDocumentUpload(parsed.data);
      if (!started.ok || !started.data) {
        setStatus({ kind: "error", text: started.ok ? "Upload failed." : started.error });
        return;
      }
      const { error } = await createClient()
        .storage.from("employee-documents")
        .uploadToSignedUrl(started.data.path, started.data.token, file, {
          contentType: parsed.data.mime_type,
        });
      if (error) {
        setStatus({ kind: "error", text: "The upload didn't complete. Please try again." });
        return;
      }
      setStep("checking");
      const finished = await finishDocumentUpload(started.data.id);
      if (!finished.ok) {
        setStatus({ kind: "error", text: finished.error });
        return;
      }
      setStatus({ kind: "success", text: "Document uploaded." });
      formRef.current?.reset();
      router.refresh();
    } finally {
      setStep("idle");
    }
  }

  return (
    <form ref={formRef} method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {status && <Alert variant={status.kind}>{status.text}</Alert>}
      <Field
        name="file"
        label="File"
        error={errors.file}
        hint={`PDF, Word (.docx), JPEG, PNG or iPhone photo (HEIC), up to ${MAX_UPLOAD_MB} MB.`}
      >
        {(p) => <Input {...p} type="file" accept={ACCEPT_ATTRIBUTE} className="h-auto py-2" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="title"
          label="Title"
          optional
          error={errors.title}
          hint="Defaults to the file name."
        >
          {(p) => <Input {...p} maxLength={200} />}
        </Field>
        <Field name="category" label="Type of document" error={errors.category}>
          {(p) => (
            <Select {...p} defaultValue={categories.length === 1 ? categories[0] : ""}>
              <option value="" disabled>
                Choose
              </option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORIES[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {visibilities.length > 1 ? (
          <Field
            name="visibility"
            label="Who can see it"
            error={errors.visibility}
            className="sm:col-span-2"
          >
            {(p) => (
              <Select {...p} defaultValue={defaultVisibility}>
                {visibilities.map((v) => (
                  <option key={v} value={v}>
                    {DOCUMENT_VISIBILITY[v]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <input type="hidden" name="visibility" value={visibilities[0]} />
        )}
      </div>
      <Button type="submit" disabled={step !== "idle"}>
        <Upload aria-hidden="true" />
        {step === "uploading" ? "Uploading…" : step === "checking" ? "Checking file…" : "Upload"}
      </Button>
    </form>
  );
}

export function DownloadButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`Download ${label}`}
        onClick={() =>
          start(async () => {
            const res = await getDocumentUrl(id);
            if (res.ok && res.data) window.location.assign(res.data.url);
            else setError(res.ok ? "Couldn't download." : res.error);
          })
        }
      >
        <Download aria-hidden="true" /> {pending ? "Preparing…" : "Download"}
      </Button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

export function VisibilitySelect({
  id,
  value,
  label,
}: {
  id: string;
  value: Visibility;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Select
      aria-label={`Who can see ${label}`}
      defaultValue={value}
      disabled={pending}
      className="h-9 w-auto text-xs"
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("visibility", e.target.value);
        start(async () => {
          await updateDocumentVisibility(fd);
          router.refresh();
        });
      }}
    >
      {Object.entries(DOCUMENT_VISIBILITY).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}
