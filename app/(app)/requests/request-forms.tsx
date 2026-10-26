"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Select, Textarea } from "@/components/ui/form";
import {
  DIVERSITY_LABELS,
  DIVERSITY_OPTIONS,
  RECTIFICATION_AREAS,
  diversitySchema,
  rectificationSchema,
  resolveRectificationSchema,
} from "@/lib/validation/people";
import { resolveRectification, saveDiversity, submitRectification } from "./actions";

export function RectificationForm() {
  return (
    <ZodForm
      schema={rectificationSchema}
      action={submitRectification}
      submitLabel="Send to HR"
      resetOnSuccess
    >
      {({ errors }) => (
        <>
          <Field name="area" label="What's it about?" error={errors.area}>
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose
                </option>
                {Object.entries(RECTIFICATION_AREAS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            name="details"
            label="What's wrong, and what should it say?"
            error={errors.details}
          >
            {(p) => <Textarea {...p} rows={4} maxLength={2000} />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function ResolveForm({ id }: { id: string }) {
  return (
    <ZodForm
      schema={resolveRectificationSchema}
      action={resolveRectification}
      submitLabel="Send reply"
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <Field name="status" id={`status-${id}`} label="Outcome" error={errors.status}>
              {(p) => (
                <Select {...p} defaultValue="resolved">
                  <option value="resolved">Corrected</option>
                  <option value="declined">Not changed</option>
                </Select>
              )}
            </Field>
            <Field
              name="resolution_note"
              id={`note-${id}`}
              label="Reply to the employee"
              error={errors.resolution_note}
              hint="If you don't change it, explain why — they can ask the ICO to review."
            >
              {(p) => <Textarea {...p} rows={2} />}
            </Field>
          </div>
        </>
      )}
    </ZodForm>
  );
}

export function DiversityForm({ values }: { values: Record<string, string | undefined> }) {
  return (
    <ZodForm schema={diversitySchema} action={saveDiversity} submitLabel="Save my answers">
      {({ errors }) => (
        <>
          <p className="text-sm text-muted-foreground">
            Completely optional. Your answers are encrypted and only used for equality monitoring.
            Only you and HR can see them — never your manager. Leave every answer blank and save to
            remove them.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(DIVERSITY_OPTIONS) as (keyof typeof DIVERSITY_OPTIONS)[]).map((k) => (
              <Field key={k} name={k} label={DIVERSITY_LABELS[k]} optional error={errors[k]}>
                {(p) => (
                  <Select {...p} defaultValue={values[k] ?? ""}>
                    <option value="">— No answer —</option>
                    {DIVERSITY_OPTIONS[k].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
        </>
      )}
    </ZodForm>
  );
}
