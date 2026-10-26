"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input } from "@/components/ui/form";
import { adjustmentSchema } from "@/lib/validation/leave";
import { addAdjustment } from "./actions";

export function AdjustmentForm({
  employeeId,
  leaveYearStart,
}: {
  employeeId: string;
  leaveYearStart: string;
}) {
  return (
    <ZodForm
      schema={adjustmentSchema}
      action={addAdjustment}
      submitLabel="Save adjustment"
      resetOnSuccess
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="leave_year_start" value={leaveYearStart} />
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field name="days" label="Days" error={errors.days} hint="e.g. 2 or -1.5">
              {(p) => <Input {...p} type="number" step="0.5" />}
            </Field>
            <Field
              name="reason"
              label="Reason"
              error={errors.reason}
              hint="e.g. TOIL for weekend event, statutory carry-over after maternity leave, irregular hours accrual."
            >
              {(p) => <Input {...p} />}
            </Field>
          </div>
        </>
      )}
    </ZodForm>
  );
}
