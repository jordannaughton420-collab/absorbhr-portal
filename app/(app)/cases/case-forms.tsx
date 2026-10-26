"use client";

import * as React from "react";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  CASE_EVENTS,
  CASE_OUTCOMES,
  CASE_STATUSES,
  CASE_TYPES,
  caseEventSchema,
  openCaseSchema,
  updateCaseSchema,
} from "@/lib/validation/people";
import { addCaseEvent, openCase, updateCase } from "./actions";

const SENSITIVE_HINT =
  "Stick to the facts. This is encrypted and seen only by HR, but the employee can request it (Subject Access Request) and it may be used in a tribunal.";

export function OpenCaseForm({ people }: { people: { id: string; name: string }[] }) {
  return (
    <ZodForm schema={openCaseSchema} action={openCase} submitLabel="Open case">
      {({ errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="employee_id" label="Employee" error={errors.employee_id}>
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
            <Field name="case_type" label="Type" error={errors.case_type}>
              {(p) => (
                <Select {...p} defaultValue="disciplinary">
                  {Object.entries(CASE_TYPES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field name="opened_on" label="Opened on" error={errors.opened_on}>
              {(p) => (
                <Input {...p} type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              )}
            </Field>
          </div>
          <Field name="summary" label="Summary" error={errors.summary} hint={SENSITIVE_HINT}>
            {(p) => <Textarea {...p} rows={4} />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function UpdateCaseForm({
  caseId,
  values,
}: {
  caseId: string;
  values: { status: string; outcome: string | null; summary: string; closed_on: string | null };
}) {
  const [status, setStatus] = React.useState(values.status);
  return (
    <ZodForm schema={updateCaseSchema} action={updateCase} submitLabel="Save case">
      {({ errors }) => (
        <>
          <input type="hidden" name="case_id" value={caseId} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="status" label="Stage" error={errors.status}>
              {(p) => (
                <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(CASE_STATUSES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field name="outcome" label="Outcome" optional error={errors.outcome}>
              {(p) => (
                <Select {...p} defaultValue={values.outcome ?? ""}>
                  <option value="">Not decided</option>
                  {Object.entries(CASE_OUTCOMES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {status === "closed" && (
              <Field name="closed_on" label="Closed on" error={errors.closed_on}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    defaultValue={values.closed_on ?? new Date().toISOString().slice(0, 10)}
                  />
                )}
              </Field>
            )}
          </div>
          <Field name="summary" label="Summary" error={errors.summary} hint={SENSITIVE_HINT}>
            {(p) => <Textarea {...p} rows={4} defaultValue={values.summary} />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function CaseEventForm({ caseId }: { caseId: string }) {
  return (
    <ZodForm
      schema={caseEventSchema}
      action={addCaseEvent}
      submitLabel="Add to timeline"
      resetOnSuccess
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="case_id" value={caseId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="event_date" label="Date" error={errors.event_date}>
              {(p) => (
                <Input {...p} type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              )}
            </Field>
            <Field name="event_type" label="What happened" error={errors.event_type}>
              {(p) => (
                <Select {...p} defaultValue="note">
                  {Object.entries(CASE_EVENTS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field
            name="details"
            label="Details"
            error={errors.details}
            hint="e.g. who attended, who accompanied the employee, key points, next steps."
          >
            {(p) => <Textarea {...p} rows={4} />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}
