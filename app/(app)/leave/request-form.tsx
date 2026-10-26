"use client";

import * as React from "react";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { leaveRequestSchema } from "@/lib/validation/leave";
import { previewLeaveDays, requestLeave } from "./actions";

type LeaveType = { id: string; name: string; deducts_allowance: boolean };

export function LeaveRequestForm({
  employeeId,
  types,
}: {
  employeeId: string;
  types: LeaveType[];
}) {
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [halfStart, setHalfStart] = React.useState(false);
  const [halfEnd, setHalfEnd] = React.useState(false);
  const [days, setDays] = React.useState<number | null>(null);

  // Ask the server how many working days the dates cover (same calculation the booking uses).
  React.useEffect(() => {
    if (!start || !end || end < start) {
      setDays(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const n = await previewLeaveDays({
        employee_id: employeeId,
        start_date: start,
        end_date: end,
        half_day_start: halfStart,
        half_day_end: halfEnd,
      });
      if (!cancelled) setDays(n);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [employeeId, start, end, halfStart, halfEnd]);

  return (
    <ZodForm
      schema={leaveRequestSchema}
      action={requestLeave}
      submitLabel="Send request"
      pendingLabel="Sending…"
      resetOnSuccess
      onSuccess={() => {
        setStart("");
        setEnd("");
        setHalfStart(false);
        setHalfEnd(false);
      }}
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <Field name="leave_type_id" label="Type of leave" error={errors.leave_type_id}>
            {(p) => (
              <Select {...p} defaultValue={types.find((t) => t.deducts_allowance)?.id ?? ""}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Field name="start_date" label="First day" error={errors.start_date}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={start}
                    onChange={(e) => {
                      setStart(e.target.value);
                      if (!end || end < e.target.value) setEnd(e.target.value);
                    }}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="half_day_start"
                  checked={halfStart}
                  onChange={(e) => setHalfStart(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Starting in the afternoon (half day)
              </label>
            </div>
            <div className="space-y-2">
              <Field name="end_date" label="Last day" error={errors.end_date}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="half_day_end"
                  checked={halfEnd}
                  onChange={(e) => setHalfEnd(e.target.checked)}
                  className="size-4 accent-primary"
                  aria-describedby={errors.half_day_end ? "f-half_day_end-error" : undefined}
                />
                Finishing at lunchtime (half day)
              </label>
              {errors.half_day_end && (
                <p id="f-half_day_end-error" className="text-xs font-medium text-destructive">
                  {errors.half_day_end}
                </p>
              )}
            </div>
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
            {days === null
              ? "Choose your dates to see how many days this uses."
              : days === 0
                ? "Those dates don't include any of your working days."
                : `This uses ${days} working day${days === 1 ? "" : "s"} (weekends, non-working days and bank holidays don't count).`}
          </p>
          <Field name="note" label="Note for your manager" optional error={errors.note}>
            {(p) => (
              <Textarea {...p} rows={2} placeholder="Please don't include health details here." />
            )}
          </Field>
        </>
      )}
    </ZodForm>
  );
}
