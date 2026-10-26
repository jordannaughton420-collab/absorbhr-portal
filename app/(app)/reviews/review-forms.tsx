"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { ZodForm } from "@/components/forms/zod-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { fieldErrors, formToObject } from "@/lib/validation/form";
import type { ActionResult } from "@/lib/errors";
import {
  cycleSchema,
  managerReviewSchema,
  reviewSettingsSchema,
  selfAssessmentSchema,
  signSchema,
  startReviewSchema,
} from "@/lib/validation/people";
import {
  createCycle,
  saveManagerReview,
  saveReviewSettings,
  saveSelfAssessment,
  signReview,
  startReview,
} from "./actions";

// A form with "Save draft" and "Submit" buttons; the choice is sent as submit=true/false.
function DraftOrSubmitForm({
  schema,
  action,
  submitLabel,
  confirmText,
  children,
}: {
  schema: z.ZodType;
  action: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  confirmText: string;
  children: (errors: Record<string, string>) => React.ReactNode;
}) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);

  function send(form: HTMLFormElement, submit: boolean) {
    if (submit && !window.confirm(confirmText)) return;
    const fd = new FormData(form);
    fd.set("submit", String(submit));
    const parsed = schema.safeParse(formToObject(fd));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    start(async () => {
      const res = await action(fd);
      if (res.ok) {
        setMsg({ kind: "success", text: res.message ?? "Saved." });
        router.refresh();
      } else {
        setMsg({ kind: "error", text: res.error });
        setErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <form method="post" onSubmit={(e) => e.preventDefault()} className="space-y-4" noValidate>
      {msg && <Alert variant={msg.kind}>{msg.text}</Alert>}
      {children(errors)}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || !ready}
          onClick={(e) => send(e.currentTarget.form!, false)}
        >
          Save draft
        </Button>
        <Button
          type="button"
          disabled={pending || !ready}
          onClick={(e) => send(e.currentTarget.form!, true)}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function SelfAssessmentForm({ reviewId, value }: { reviewId: string; value: string }) {
  return (
    <DraftOrSubmitForm
      schema={selfAssessmentSchema}
      action={saveSelfAssessment}
      submitLabel="Submit to my manager"
      confirmText="Submit your self-assessment? You won't be able to change it afterwards."
    >
      {(errors) => (
        <>
          <input type="hidden" name="review_id" value={reviewId} />
          <Field
            name="self_assessment"
            label="Your self-assessment"
            error={errors.self_assessment}
            hint="What went well, what was difficult, and what support or development would help you."
          >
            {(p) => <Textarea {...p} rows={10} defaultValue={value} />}
          </Field>
        </>
      )}
    </DraftOrSubmitForm>
  );
}

export function ManagerReviewForm({
  reviewId,
  values,
  ratingLabels,
}: {
  reviewId: string;
  values: { manager_assessment: string; rating: number | null; objectives: string };
  ratingLabels: string[] | null;
}) {
  return (
    <DraftOrSubmitForm
      schema={managerReviewSchema}
      action={saveManagerReview}
      submitLabel="Share with the employee"
      confirmText="Share your assessment with the employee? You won't be able to change it afterwards."
    >
      {(errors) => (
        <>
          <input type="hidden" name="review_id" value={reviewId} />
          <Field
            name="manager_assessment"
            label="Your assessment"
            error={errors.manager_assessment}
            hint="Drafts are not visible to the employee."
          >
            {(p) => <Textarea {...p} rows={10} defaultValue={values.manager_assessment} />}
          </Field>
          {ratingLabels && (
            <Field name="rating" label="Overall rating" optional error={errors.rating}>
              {(p) => (
                <Select {...p} defaultValue={values.rating ? String(values.rating) : ""}>
                  <option value="">No rating</option>
                  {ratingLabels.map((l, i) => (
                    <option key={l} value={i + 1}>
                      {i + 1} — {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field
            name="objectives"
            label="Objectives for the next period"
            optional
            error={errors.objectives}
          >
            {(p) => (
              <Textarea
                {...p}
                rows={5}
                defaultValue={values.objectives}
                placeholder="One per line"
              />
            )}
          </Field>
        </>
      )}
    </DraftOrSubmitForm>
  );
}

export function SignForm({ reviewId, asEmployee }: { reviewId: string; asEmployee: boolean }) {
  return (
    <ZodForm
      schema={signSchema}
      action={signReview}
      submitLabel={asEmployee ? "Sign my review" : "Sign as reviewer"}
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="review_id" value={reviewId} />
          {asEmployee && (
            <Field
              name="employee_comments"
              label="Your comments"
              optional
              error={errors.employee_comments}
              hint="Anything you'd like recorded alongside the review."
            >
              {(p) => <Textarea {...p} rows={3} />}
            </Field>
          )}
        </>
      )}
    </ZodForm>
  );
}

export function CycleForm() {
  return (
    <ZodForm
      schema={cycleSchema}
      action={createCycle}
      submitLabel="Start review round"
      resetOnSuccess
    >
      {({ errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name" error={errors.name} className="sm:col-span-2">
            {(p) => <Input {...p} placeholder="e.g. Annual review 2026" />}
          </Field>
          <Field name="period_start" label="Period from" error={errors.period_start}>
            {(p) => <Input {...p} type="date" />}
          </Field>
          <Field name="period_end" label="Period to" error={errors.period_end}>
            {(p) => <Input {...p} type="date" />}
          </Field>
          <Field name="self_due" label="Self-assessments due" optional error={errors.self_due}>
            {(p) => <Input {...p} type="date" />}
          </Field>
          <Field name="manager_due" label="Manager reviews due" optional error={errors.manager_due}>
            {(p) => <Input {...p} type="date" />}
          </Field>
        </div>
      )}
    </ZodForm>
  );
}

export function StartReviewForm({ people }: { people: { id: string; name: string }[] }) {
  return (
    <ZodForm schema={startReviewSchema} action={startReview} submitLabel="Start review">
      {({ errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="employee_id" label="Person" error={errors.employee_id}>
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose
                </option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field name="title" label="Title" error={errors.title}>
            {(p) => <Input {...p} defaultValue="Probation review" />}
          </Field>
        </div>
      )}
    </ZodForm>
  );
}

export function ReviewSettingsForm({ scale, labels }: { scale: boolean; labels: string[] }) {
  return (
    <ZodForm
      schema={reviewSettingsSchema}
      action={saveReviewSettings}
      submitLabel="Save review settings"
    >
      {({ errors }) => (
        <>
          <Field
            name="review_rating_scale"
            label="How are reviews scored?"
            error={errors.review_rating_scale}
          >
            {(p) => (
              <Select {...p} defaultValue={String(scale)}>
                <option value="false">Written feedback only</option>
                <option value="true">Written feedback plus a 1–5 rating</option>
              </Select>
            )}
          </Field>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Rating labels (used only if ratings are on)
            </legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <Field key={n} name={`label_${n}`} label={`Rating ${n}`} error={errors[`label_${n}`]}>
                {(p) => <Input {...p} defaultValue={labels[n - 1] ?? ""} maxLength={60} />}
              </Field>
            ))}
          </fieldset>
        </>
      )}
    </ZodForm>
  );
}
