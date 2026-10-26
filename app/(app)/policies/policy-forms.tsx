"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Paperclip } from "lucide-react";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { createClient } from "@/lib/supabase/client";
import { mimeFor } from "@/lib/validation/documents";
import {
  draftSchema,
  newPolicySchema,
  POLICY_CATEGORIES,
  policyDetailsSchema,
  publishSchema,
} from "@/lib/validation/policy";
import {
  createPolicy,
  finishPolicyFileUpload,
  getPolicyFileUrl,
  publishDraft,
  saveDraft,
  startPolicyFileUpload,
  updatePolicyDetails,
} from "./actions";

type Department = { id: string; name: string };
type Details = {
  id?: string;
  title?: string;
  category?: string;
  summary?: string | null;
  audience?: string;
  department_ids?: string[];
  requires_acknowledgement?: boolean;
};

function DetailsFields({
  errors,
  values,
  departments,
  isTemplate,
}: {
  errors: Record<string, string>;
  values: Details;
  departments: Department[];
  isTemplate: boolean;
}) {
  const [audience, setAudience] = React.useState(values.audience ?? "all");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="title" label="Title" error={errors.title}>
          {(p) => <Input {...p} defaultValue={values.title} maxLength={200} />}
        </Field>
        <Field name="category" label="Category" error={errors.category}>
          {(p) => (
            <Select {...p} defaultValue={values.category ?? "general"}>
              {Object.entries(POLICY_CATEGORIES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field
        name="summary"
        label="Short summary"
        optional
        error={errors.summary}
        hint="Shown in the policy list."
      >
        {(p) => <Input {...p} defaultValue={values.summary ?? ""} maxLength={500} />}
      </Field>
      {isTemplate ? (
        <input type="hidden" name="audience" value="all" />
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Who it applies to</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                value="all"
                checked={audience === "all"}
                onChange={() => setAudience("all")}
                className="size-4 accent-primary"
              />
              Everyone
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                value="departments"
                checked={audience === "departments"}
                onChange={() => setAudience("departments")}
                className="size-4 accent-primary"
              />
              Selected departments
            </label>
          </div>
          {audience === "departments" && (
            <div className="flex flex-wrap gap-3">
              <input type="hidden" name="department_ids" value="" />
              {departments.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="department_ids"
                    value={d.id}
                    defaultChecked={values.department_ids?.includes(d.id)}
                    className="size-4 accent-primary"
                  />
                  {d.name}
                </label>
              ))}
            </div>
          )}
          {errors.department_ids && (
            <p className="text-xs font-medium text-destructive">{errors.department_ids}</p>
          )}
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requires_acknowledgement"
          defaultChecked={values.requires_acknowledgement ?? true}
          className="size-4 accent-primary"
        />
        Staff must confirm they have read it
      </label>
    </>
  );
}

const MARKDOWN_HINT = "Use ## for headings, - for bullet points and **text** for bold.";

export function NewPolicyForm({
  departments,
  isTemplate,
}: {
  departments: Department[];
  isTemplate: boolean;
}) {
  return (
    <ZodForm
      schema={newPolicySchema}
      action={createPolicy}
      submitLabel={isTemplate ? "Create template draft" : "Create draft"}
    >
      {({ errors }) => (
        <>
          {isTemplate && <input type="hidden" name="template" value="true" />}
          <DetailsFields
            errors={errors}
            values={{}}
            departments={departments}
            isTemplate={isTemplate}
          />
          <Field name="body" label="Policy text" error={errors.body} hint={MARKDOWN_HINT}>
            {(p) => <Textarea {...p} rows={14} className="font-mono text-sm" />}
          </Field>
          <p className="text-sm text-muted-foreground">
            You can attach a PDF or Word copy and publish it on the next screen.
          </p>
        </>
      )}
    </ZodForm>
  );
}

export function PolicyDetailsForm({
  values,
  departments,
  isTemplate,
}: {
  values: Details;
  departments: Department[];
  isTemplate: boolean;
}) {
  return (
    <ZodForm schema={policyDetailsSchema} action={updatePolicyDetails} submitLabel="Save details">
      {({ errors }) => (
        <>
          <input type="hidden" name="id" value={values.id} />
          <DetailsFields
            errors={errors}
            values={values}
            departments={departments}
            isTemplate={isTemplate}
          />
        </>
      )}
    </ZodForm>
  );
}

export function DraftForm({
  policyId,
  body,
  changeSummary,
  isNewVersion,
}: {
  policyId: string;
  body: string;
  changeSummary: string;
  isNewVersion: boolean;
}) {
  return (
    <ZodForm
      schema={draftSchema}
      action={saveDraft}
      submitLabel={isNewVersion ? "Start new version" : "Save draft"}
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="policy_id" value={policyId} />
          <Field name="body" label="Policy text" error={errors.body} hint={MARKDOWN_HINT}>
            {(p) => <Textarea {...p} rows={16} defaultValue={body} className="font-mono text-sm" />}
          </Field>
          <Field
            name="change_summary"
            label="What changed?"
            optional
            error={errors.change_summary}
            hint="Shown to staff with the new version."
          >
            {(p) => <Input {...p} defaultValue={changeSummary} maxLength={500} />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function PublishForm({
  policyId,
  versionId,
  version,
}: {
  policyId: string;
  versionId: string;
  version: number;
}) {
  return (
    <ZodForm
      schema={publishSchema}
      action={publishDraft}
      submitLabel={`Publish version ${version}`}
      pendingLabel="Publishing…"
    >
      {() => (
        <>
          <input type="hidden" name="version_id" value={versionId} />
          <input type="hidden" name="policy_id" value={policyId} />
          {version > 1 ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="require_reack"
                defaultChecked
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                Everyone must read and confirm this version again
                <span className="block text-xs text-muted-foreground">
                  Untick for small changes such as typos — existing confirmations will still count.
                </span>
              </span>
            </label>
          ) : (
            <input type="hidden" name="require_reack" value="true" />
          )}
        </>
      )}
    </ZodForm>
  );
}

export function PolicyFileUpload({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function upload(file: File) {
    setMsg(null);
    setBusy(true);
    try {
      const mime = mimeFor(file.name, file.type);
      const started = await startPolicyFileUpload({
        version_id: versionId,
        file_name: file.name,
        mime_type: mime,
        size: file.size,
      });
      if (!started.ok || !started.data)
        return setMsg({ kind: "error", text: started.ok ? "Upload failed." : started.error });
      const { error } = await createClient()
        .storage.from("policy-documents")
        .uploadToSignedUrl(started.data.path, started.data.token, file, { contentType: mime });
      if (error)
        return setMsg({ kind: "error", text: "The upload didn't complete. Please try again." });
      const done = await finishPolicyFileUpload({
        version_id: versionId,
        path: started.data.path,
        file_name: file.name,
        mime_type: mime,
      });
      setMsg(
        done.ok ? { kind: "success", text: "File attached." } : { kind: "error", text: done.error },
      );
      if (done.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      {msg && <Alert variant={msg.kind}>{msg.text}</Alert>}
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted focus-within:outline focus-within:outline-3 focus-within:outline-ring">
        <Paperclip className="size-4" aria-hidden="true" />
        {busy ? "Uploading…" : "Attach a PDF or Word copy (optional)"}
        <input
          type="file"
          accept=".pdf,.docx"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

export function PolicyFileDownload({
  versionId,
  fileName,
}: {
  versionId: string;
  fileName: string;
}) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await getPolicyFileUrl(versionId);
          if (res.ok && res.data) window.location.assign(res.data.url);
        })
      }
    >
      <Download aria-hidden="true" /> {pending ? "Preparing…" : `Download ${fileName}`}
    </Button>
  );
}
