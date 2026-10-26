"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { ZodForm } from "@/components/forms/zod-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  anonymiseSchema,
  holdSchema,
  retentionSettingsSchema,
  sarSchema,
} from "@/lib/validation/gdpr";
import {
  anonymise,
  createSarExport,
  getSarExportUrl,
  saveRetentionSettings,
  setHold,
} from "./actions";

type Person = { id: string; name: string };

function PersonSelect(p: React.ComponentProps<typeof Select> & { people: Person[] }) {
  const { people, ...rest } = p;
  return (
    <Select {...rest} defaultValue="">
      <option value="" disabled>
        Choose a person
      </option>
      {people.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </Select>
  );
}

export function SarForm({ people }: { people: Person[] }) {
  return (
    <ZodForm
      schema={sarSchema}
      action={createSarExport}
      submitLabel="Create export"
      pendingLabel="Building export…"
    >
      {({ errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="employee_id"
            id="sar-employee"
            label="Whose data?"
            error={errors.employee_id}
          >
            {(p) => <PersonSelect {...p} people={people} />}
          </Field>
          <Field
            name="request_received_on"
            id="sar-received"
            label="Request received on"
            error={errors.request_received_on}
            hint="You must respond within one month of this date."
          >
            {(p) => <Input {...p} type="date" max={new Date().toISOString().slice(0, 10)} />}
          </Field>
        </div>
      )}
    </ZodForm>
  );
}

export function SarDownloadButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`Download export for ${label}`}
        onClick={() =>
          start(async () => {
            const res = await getSarExportUrl(id);
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

export function HoldForm({ employeeId }: { employeeId: string }) {
  return (
    <ZodForm schema={holdSchema} action={setHold} submitLabel="Put on hold">
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <Field
            name="reason"
            id={`hold-${employeeId}`}
            label="Why must this record be kept?"
            error={errors.reason}
            hint="For example: tribunal claim, insurance claim, HMRC enquiry. Don't include health details."
          >
            {(p) => <Input {...p} maxLength={500} />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function AnonymiseForm({
  people,
  employeeId,
  early,
}: {
  people?: Person[];
  employeeId?: string;
  early: boolean;
}) {
  const key = employeeId ?? "early";
  return (
    <ZodForm
      schema={anonymiseSchema}
      action={anonymise}
      submitLabel={early ? "Erase now" : "Anonymise"}
      submitClassName="bg-destructive text-white hover:bg-destructive/90"
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="early" value={String(early)} />
          {employeeId ? (
            <input type="hidden" name="employee_id" value={employeeId} />
          ) : (
            <Field
              name="employee_id"
              id={`anon-employee-${key}`}
              label="Person"
              error={errors.employee_id}
            >
              {(p) => <PersonSelect {...p} people={people ?? []} />}
            </Field>
          )}
          {early && (
            <Field
              name="reason"
              id={`anon-reason-${key}`}
              label="Reason"
              error={errors.reason}
              hint="E.g. erasure request upheld after checking there's no legal reason to keep the data. Don't include health details."
            >
              {(p) => <Textarea {...p} rows={2} maxLength={1000} />}
            </Field>
          )}
          <Field
            name="confirm"
            id={`anon-confirm-${key}`}
            label="Type ANONYMISE to confirm"
            error={errors.confirm}
            hint="This can't be undone. Their name, contact details, documents, notes, reviews, cases, absence and pay records are permanently deleted."
          >
            {(p) => <Input {...p} autoComplete="off" className="max-w-xs" />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function RetentionSettingsForm({ years }: { years: number }) {
  return (
    <ZodForm schema={retentionSettingsSchema} action={saveRetentionSettings} submitLabel="Save">
      {({ errors }) => (
        <Field
          name="retention_years"
          id="retention-years"
          label="Keep leavers' records for (years)"
          error={errors.retention_years}
          hint="Minimum 6 years (AbsorbHR policy). Counted from the leaving date."
          className="max-w-xs"
        >
          {(p) => <Input {...p} type="number" min={6} max={20} step={1} defaultValue={years} />}
        </Field>
      )}
    </ZodForm>
  );
}
