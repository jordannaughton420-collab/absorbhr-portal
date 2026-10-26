import { z } from "zod";

// Shared by browser forms and server actions. The database re-checks everything.

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const date = (msg: string) => z.iso.date(msg);
const note = z.string().trim().max(500, "Keep it under 500 characters").optional();

export const leaveRequestSchema = z
  .object({
    employee_id: z.uuid(),
    leave_type_id: z.uuid("Choose the type of leave"),
    start_date: date("Enter the first day"),
    end_date: date("Enter the last day"),
    half_day_start: checkbox,
    half_day_end: checkbox,
    note,
  })
  .refine((v) => v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "The last day can't be before the first day",
  })
  .refine((v) => !(v.start_date === v.end_date && v.half_day_start && v.half_day_end), {
    path: ["half_day_end"],
    message: "For a half day, tick just one of the half-day boxes",
  });

export const decisionSchema = z.object({
  request_id: z.uuid(),
  approve: z.enum(["true", "false"]),
  decision_note: note,
});

export const holidayPolicySchema = z
  .object({
    full_time_entitlement_days: z.coerce.number().min(0).max(60, "That seems too high"),
    full_time_days_per_week: z.coerce.number().min(1).max(7),
    bank_holidays_in_allowance: z.enum(["true", "false"]),
    carry_over_max_days: z.coerce.number().min(0, "Use 0 for no carry-over").max(60),
    carry_over_expiry_months: z.coerce.number().int().min(0).max(12),
    leave_year_start_month: z.coerce.number().int().min(1).max(12),
    leave_year_start_day: z.coerce.number().int().min(1).max(28),
  })
  .refine((v) => v.bank_holidays_in_allowance === "false" || v.full_time_entitlement_days >= 28, {
    path: ["full_time_entitlement_days"],
    message: "The legal minimum is 28 days including bank holidays (5.6 weeks)",
  })
  .refine((v) => v.bank_holidays_in_allowance === "true" || v.full_time_entitlement_days >= 20, {
    path: ["full_time_entitlement_days"],
    message: "With bank holidays on top, at least 20 days keeps you above the legal minimum",
  });

export const adjustmentSchema = z.object({
  employee_id: z.uuid(),
  leave_year_start: z.iso.date(),
  days: z.coerce
    .number()
    .min(-100)
    .max(100)
    .refine((n) => n !== 0, "Enter a number of days (use minus to remove)")
    .refine((n) => Number.isInteger(n * 2), "Use whole or half days"),
  reason: z.string().trim().min(3, "Give a short reason").max(300),
});

export const SICKNESS_REASONS = {
  cold_flu: "Cold, flu or virus",
  stomach: "Stomach or digestive",
  musculoskeletal: "Back, joint or muscle",
  mental_health: "Stress, anxiety or mental health",
  injury: "Injury",
  headache_migraine: "Headache or migraine",
  medical_procedure: "Operation or medical procedure",
  pregnancy_related: "Pregnancy-related",
  covid: "COVID-19",
  other: "Other",
} as const;

export const sicknessSchema = z
  .object({
    employee_id: z.uuid("Choose who is off sick"),
    start_date: date("Enter the first day off"),
    end_date: date("Enter a valid date").optional(),
    half_day_start: checkbox,
    half_day_end: checkbox,
    reason_category: z
      .enum(Object.keys(SICKNESS_REASONS) as [keyof typeof SICKNESS_REASONS])
      .optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "The last day can't be before the first day",
  });

export const endSicknessSchema = z.object({
  absence_id: z.uuid(),
  end_date: date("Enter the last day off"),
  half_day_end: checkbox,
});

export const sicknessReasonSchema = z.object({
  absence_id: z.uuid(),
  reason_category: z
    .enum(Object.keys(SICKNESS_REASONS) as [keyof typeof SICKNESS_REASONS])
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const returnToWorkSchema = z.object({
  absence_id: z.uuid(),
  meeting_date: date("Enter the date of the meeting"),
  fit_to_return: z.enum(["yes", "yes_with_adjustments", "no"], "Choose an answer"),
  gp_seen: z.enum(["yes", "no", "not_asked"]).optional(),
  fit_note_received: z.enum(["yes", "no", "not_needed"]).optional(),
  adjustments: z.string().trim().max(2000).optional(),
  support_offered: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const exclusionSchema = z.object({
  absence_id: z.uuid(),
  basis: z.enum(["none", "pregnancy", "disability", "other"]),
});
