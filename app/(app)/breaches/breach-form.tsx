"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ICO_DECISIONS, RISK_LEVELS, breachSchema } from "@/lib/validation/gdpr";
import { saveBreach } from "./actions";

export type BreachValues = {
  id: string;
  title: string;
  discovered_at: string;
  occurred_at: string;
  description: string;
  data_types: string;
  people_affected: string;
  special_category: boolean;
  risk_level: keyof typeof RISK_LEVELS;
  ico_decision: keyof typeof ICO_DECISIONS;
  decision_reason: string;
  ico_reported_at: string;
  ico_reference: string;
  individuals_informed_at: string;
  actions_taken: string;
  closed: boolean;
};

export function BreachForm({ values }: { values?: BreachValues }) {
  const k = values?.id ?? "new";
  const id = (name: string) => `${name}-${k}`;
  return (
    <ZodForm
      schema={breachSchema}
      action={saveBreach}
      submitLabel={values ? "Save changes" : "Record breach"}
      resetOnSuccess={!values}
    >
      {({ errors }) => (
        <>
          {values && <input type="hidden" name="id" value={values.id} />}
          <Field name="title" id={id("title")} label="Short title" error={errors.title}>
            {(p) => <Input {...p} defaultValue={values?.title} maxLength={160} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="discovered_at"
              id={id("discovered")}
              label="When was it discovered?"
              error={errors.discovered_at}
              hint="The 72-hour deadline to report to the ICO runs from here."
            >
              {(p) => <Input {...p} type="datetime-local" defaultValue={values?.discovered_at} />}
            </Field>
            <Field
              name="occurred_at"
              id={id("occurred")}
              label="When did it happen?"
              optional
              error={errors.occurred_at}
            >
              {(p) => <Input {...p} type="datetime-local" defaultValue={values?.occurred_at} />}
            </Field>
          </div>
          <Field
            name="description"
            id={id("description")}
            label="What happened?"
            error={errors.description}
            hint="Describe the incident without naming the people affected."
          >
            {(p) => <Textarea {...p} rows={3} defaultValue={values?.description} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="data_types"
              id={id("types")}
              label="What kinds of data?"
              optional
              error={errors.data_types}
              hint="E.g. names and home addresses; payslips"
            >
              {(p) => <Input {...p} defaultValue={values?.data_types} />}
            </Field>
            <Field
              name="people_affected"
              id={id("people")}
              label="Roughly how many people?"
              optional
              error={errors.people_affected}
            >
              {(p) => <Input {...p} type="number" min={0} defaultValue={values?.people_affected} />}
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="special_category"
              defaultChecked={values?.special_category}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>Health, diversity, disciplinary or other sensitive data was involved</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="risk_level"
              id={id("risk")}
              label="Risk to the people affected"
              error={errors.risk_level}
            >
              {(p) => (
                <Select {...p} defaultValue={values?.risk_level ?? "unknown"}>
                  {Object.entries(RISK_LEVELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              name="ico_decision"
              id={id("ico")}
              label="Report to the ICO?"
              error={errors.ico_decision}
            >
              {(p) => (
                <Select {...p} defaultValue={values?.ico_decision ?? "undecided"}>
                  {Object.entries(ICO_DECISIONS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field
            name="decision_reason"
            id={id("reason")}
            label="Why did you decide that?"
            optional
            error={errors.decision_reason}
          >
            {(p) => <Textarea {...p} rows={2} defaultValue={values?.decision_reason} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="ico_reported_at"
              id={id("reported")}
              label="Reported to ICO"
              optional
              error={errors.ico_reported_at}
            >
              {(p) => <Input {...p} type="datetime-local" defaultValue={values?.ico_reported_at} />}
            </Field>
            <Field
              name="ico_reference"
              id={id("ref")}
              label="ICO reference"
              optional
              error={errors.ico_reference}
            >
              {(p) => <Input {...p} defaultValue={values?.ico_reference} maxLength={60} />}
            </Field>
            <Field
              name="individuals_informed_at"
              id={id("informed")}
              label="People affected told"
              optional
              error={errors.individuals_informed_at}
            >
              {(p) => (
                <Input
                  {...p}
                  type="datetime-local"
                  defaultValue={values?.individuals_informed_at}
                />
              )}
            </Field>
          </div>
          <Field
            name="actions_taken"
            id={id("actions")}
            label="What have you done about it?"
            optional
            error={errors.actions_taken}
            hint="Containment, recovery, and steps to stop it happening again."
          >
            {(p) => <Textarea {...p} rows={3} defaultValue={values?.actions_taken} />}
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="closed"
              defaultChecked={values?.closed}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>Closed — no further action needed</span>
          </label>
        </>
      )}
    </ZodForm>
  );
}
