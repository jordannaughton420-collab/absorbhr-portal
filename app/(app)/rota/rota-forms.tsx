"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/lib/errors";
import {
  createShiftSchema,
  groupMemberSchema,
  openShiftSchema,
  shiftSettingsSchema,
} from "@/lib/validation/shifts";
import { addToShiftGroup, createShift, postOpenShift, updateShiftSettings } from "./actions";

type Option = { id: string; name: string };

function TimeFields({
  prefix,
  errors,
  defaultDate,
}: {
  prefix: string;
  errors: Record<string, string>;
  defaultDate: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field id={`${prefix}-date`} name="date" label="Date" error={errors.date}>
        {(p) => <Input {...p} type="date" defaultValue={defaultDate} />}
      </Field>
      <Field id={`${prefix}-start`} name="start_time" label="Starts" error={errors.start_time}>
        {(p) => <Input {...p} type="time" step={300} defaultValue="09:00" />}
      </Field>
      <Field
        id={`${prefix}-end`}
        name="end_time"
        label="Ends"
        hint="Earlier than the start means the next day."
        error={errors.end_time}
      >
        {(p) => <Input {...p} type="time" step={300} defaultValue="17:00" />}
      </Field>
    </div>
  );
}

function DetailFields({
  prefix,
  errors,
  locations,
}: {
  prefix: string;
  errors: Record<string, string>;
  locations: Option[];
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${prefix}-role`}
          name="role_label"
          label="Role or area"
          optional
          hint="For example Bar, Kitchen or Night cover."
          error={errors.role_label}
        >
          {(p) => <Input {...p} maxLength={80} />}
        </Field>
        {locations.length > 0 && (
          <Field
            id={`${prefix}-location`}
            name="location_id"
            label="Location"
            optional
            error={errors.location_id}
          >
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="">Not set</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
      <Field
        id={`${prefix}-notes`}
        name="notes"
        label="Notes for the person"
        optional
        hint="About the shift only, for example 'Lock up at the end'. Not for personal details."
        error={errors.notes}
      >
        {(p) => <Textarea {...p} rows={2} maxLength={500} />}
      </Field>
    </>
  );
}

export function AddShiftForm({
  people,
  locations,
  defaultDate,
}: {
  people: Option[];
  locations: Option[];
  defaultDate: string;
}) {
  return (
    <ZodForm schema={createShiftSchema} action={createShift} submitLabel="Add shift">
      {({ errors }) => (
        <>
          <Field id="as-person" name="employee_id" label="Who" error={errors.employee_id}>
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose a person
                </option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <TimeFields prefix="as" errors={errors} defaultDate={defaultDate} />
          <DetailFields prefix="as" errors={errors} locations={locations} />
          <div className="flex gap-3">
            <input
              id="as-short-rest"
              name="allow_short_rest"
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              aria-describedby="as-short-rest-hint"
            />
            <div>
              <label htmlFor="as-short-rest" className="text-sm font-medium">
                Allow a shorter rest break
              </label>
              <p id="as-short-rest-hint" className="text-xs text-muted-foreground">
                Workers are normally entitled to 11 hours&apos; rest between shifts. Only tick this
                for an agreed exception.
              </p>
            </div>
          </div>
        </>
      )}
    </ZodForm>
  );
}

export function OpenShiftForm({
  people,
  groups,
  locations,
  defaultDate,
}: {
  people: Option[];
  groups: Option[];
  locations: Option[];
  defaultDate: string;
}) {
  return (
    <ZodForm
      schema={openShiftSchema}
      action={postOpenShift}
      submitLabel="Post open shift"
      pendingLabel="Posting…"
      resetOnSuccess
    >
      {({ errors }) => (
        <>
          <TimeFields prefix="os" errors={errors} defaultDate={defaultDate} />
          <DetailFields prefix="os" errors={errors} locations={locations} />
          <Field
            id="os-group"
            name="group_id"
            label="Send to a group"
            hint="Everyone in the group who is free gets an email. People on holiday, off sick, already working or short of an 11-hour rest break are left out."
            error={errors.group_id}
          >
            {(p) => (
              <Select {...p} defaultValue={groups[0]?.id ?? ""}>
                <option value="">No group, just the people ticked below</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {people.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                And/or these people{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </legend>
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {people.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="employee_ids"
                      value={x.id}
                      className="size-4 accent-primary"
                    />
                    {x.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
    </ZodForm>
  );
}

export function AddToGroupForm({ people, groups }: { people: Option[]; groups: Option[] }) {
  return (
    <ZodForm
      schema={groupMemberSchema}
      action={addToShiftGroup}
      submitLabel="Add to group"
      resetOnSuccess
    >
      {({ errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ag-person" name="employee_id" label="Person" error={errors.employee_id}>
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose a person
                </option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="ag-group"
            name="group_name"
            label="Group"
            hint="Pick one or type a new name to create it."
            error={errors.group_name}
          >
            {(p) => (
              <>
                <Input
                  {...p}
                  list="shift-group-names"
                  maxLength={60}
                  defaultValue={groups[0]?.name ?? "Open shifts"}
                />
                <datalist id="shift-group-names">
                  {groups.map((g) => (
                    <option key={g.id} value={g.name} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
      )}
    </ZodForm>
  );
}

export function ShiftSettingsForm({ value }: { value: boolean }) {
  return (
    <ZodForm schema={shiftSettingsSchema} action={updateShiftSettings} submitLabel="Save settings">
      {() => (
        <div className="flex gap-3">
          <input
            id="f-managers_can_plan_shifts"
            name="managers_can_plan_shifts"
            type="checkbox"
            defaultChecked={value}
            className="mt-0.5 size-4 accent-primary"
            aria-describedby="f-managers_can_plan_shifts-hint"
          />
          <div>
            <label htmlFor="f-managers_can_plan_shifts" className="text-sm font-medium">
              Let line managers plan shifts and post open shifts for their own team
            </label>
            <p id="f-managers_can_plan_shifts-hint" className="text-xs text-muted-foreground">
              Off by default. HR can always plan shifts for anyone. Open shift groups are managed by
              HR.
            </p>
          </div>
        </div>
      )}
    </ZodForm>
  );
}

/** A small button that runs one action for one row (cancel, accept, remove…). */
export function RowAction({
  action,
  fields,
  label,
  pendingLabel = "Working…",
  confirmText,
  variant = "outline",
  size = "sm",
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  confirmText?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<ActionResult | null>(null);

  function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    start(async () => {
      const res = await action(fd);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={variant} size={size} disabled={pending} onClick={run}>
        {pending ? pendingLabel : label}
      </Button>
      {result && !result.ok && <Alert variant="error">{result.error}</Alert>}
      {result?.ok && result.message && <Alert variant="success">{result.message}</Alert>}
    </div>
  );
}
