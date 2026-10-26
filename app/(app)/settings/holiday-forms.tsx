"use client";

import * as React from "react";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select } from "@/components/ui/form";
import { holidayPolicySchema } from "@/lib/validation/leave";
import { processCarryOver, saveHolidayPolicy } from "@/app/(app)/leave/actions";
import { z } from "zod";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Policy = {
  full_time_entitlement_days: number;
  full_time_days_per_week: number;
  bank_holidays_in_allowance: boolean;
  carry_over_max_days: number | null;
  carry_over_expiry_months: number | null;
  configured_at: string | null;
};

export function HolidayPolicyForm({
  policy,
  yearMonth,
  yearDay,
}: {
  policy: Policy;
  yearMonth: number;
  yearDay: number;
}) {
  const [carry, setCarry] = React.useState(String(policy.carry_over_max_days ?? ""));
  return (
    <ZodForm
      schema={holidayPolicySchema}
      action={saveHolidayPolicy}
      submitLabel={policy.configured_at ? "Save holiday rules" : "Confirm holiday rules"}
    >
      {({ errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="leave_year_start_month"
              label="Leave year starts in"
              error={errors.leave_year_start_month}
            >
              {(p) => (
                <Select {...p} defaultValue={String(yearMonth)}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field name="leave_year_start_day" label="On day" error={errors.leave_year_start_day}>
              {(p) => <Input {...p} type="number" min={1} max={28} defaultValue={yearDay} />}
            </Field>
            <Field
              name="full_time_entitlement_days"
              label="Full-time holiday allowance (days)"
              error={errors.full_time_entitlement_days}
              hint="Part-timers, starters and leavers are pro-rated automatically."
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="0.5"
                  min={0}
                  max={60}
                  defaultValue={policy.full_time_entitlement_days}
                />
              )}
            </Field>
            <Field
              name="full_time_days_per_week"
              label="Full-time working days per week"
              error={errors.full_time_days_per_week}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="0.5"
                  min={1}
                  max={7}
                  defaultValue={policy.full_time_days_per_week}
                />
              )}
            </Field>
            <Field
              name="bank_holidays_in_allowance"
              label="Bank holidays"
              error={errors.bank_holidays_in_allowance}
              className="sm:col-span-2"
            >
              {(p) => (
                <Select {...p} defaultValue={String(policy.bank_holidays_in_allowance)}>
                  <option value="true">Included in the allowance (taken out automatically)</option>
                  <option value="false">Given on top of the allowance</option>
                </Select>
              )}
            </Field>
            <Field
              name="carry_over_max_days"
              label="Days that can be carried into next year"
              error={errors.carry_over_max_days}
              hint="Use 0 for none. HR can still add carry-over the law requires (e.g. after long sickness or family leave)."
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="0.5"
                  min={0}
                  max={60}
                  value={carry}
                  onChange={(e) => setCarry(e.target.value)}
                />
              )}
            </Field>
            {Number(carry) > 0 && (
              <Field
                name="carry_over_expiry_months"
                label="Carried-over days must be used within"
                error={errors.carry_over_expiry_months}
              >
                {(p) => (
                  <Select {...p} defaultValue={String(policy.carry_over_expiry_months ?? 3)}>
                    <option value="0">No time limit</option>
                    {[1, 2, 3, 4, 5, 6, 9, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} month{n === 1 ? "" : "s"} of the new year
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        </>
      )}
    </ZodForm>
  );
}

export function CarryOverForm({ years }: { years: { value: string; label: string }[] }) {
  return (
    <ZodForm
      schema={z.object({ leave_year_start: z.iso.date("Choose a leave year") })}
      action={processCarryOver}
      submitLabel="Work out carry-over"
      pendingLabel="Working it out…"
    >
      {({ errors }) => (
        <Field
          name="leave_year_start"
          label="Carry unused holiday from"
          error={errors.leave_year_start}
          hint="Safe to run more than once — it recalculates. Run it after the last holiday of the year has been approved."
        >
          {(p) => (
            <Select {...p} defaultValue={years[0]?.value}>
              {years.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
    </ZodForm>
  );
}
