import { z } from "zod";

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optionalText = (max: number) => z.string().trim().max(max, "That's too long").optional();
const today = () => new Date().toISOString().slice(0, 10);
// <input type="datetime-local"> gives "YYYY-MM-DDTHH:MM" (UK local time).
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time");

export const sarSchema = z.object({
  employee_id: z.uuid("Choose an employee"),
  request_received_on: z.iso
    .date("Enter the date the request was received")
    .refine((d) => d <= today(), "This can't be in the future"),
});

export const sarIdSchema = z.object({ id: z.uuid() });

export const holdSchema = z.object({
  employee_id: z.uuid(),
  reason: z.string().trim().min(5, "Say why (at least 5 characters)").max(500),
});

export const anonymiseSchema = z
  .object({
    employee_id: z.uuid("Choose a person"),
    early: checkbox,
    reason: optionalText(1000),
    confirm: z.string().trim(),
  })
  .refine((v) => v.confirm.toUpperCase() === "ANONYMISE", {
    path: ["confirm"],
    message: "Type ANONYMISE to confirm",
  })
  .refine((v) => !v.early || (v.reason?.length ?? 0) >= 20, {
    path: ["reason"],
    message:
      "Explain why this can't wait until the end of the retention period (at least 20 characters)",
  });

export const retentionSettingsSchema = z.object({
  retention_years: z.coerce
    .number({ message: "Enter a number of years" })
    .int("Whole years only")
    .min(6, "The minimum is 6 years")
    .max(20, "The maximum is 20 years"),
});

export const RISK_LEVELS = {
  unknown: "Not yet assessed",
  low: "Low — unlikely to affect anyone",
  medium: "Medium",
  high: "High — tell the people affected",
} as const;

export const ICO_DECISIONS = {
  undecided: "Not decided yet",
  yes: "Yes — report to the ICO",
  no: "No — record why",
} as const;

export const breachSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(3, "Give it a short title").max(160),
    discovered_at: localDateTime,
    occurred_at: localDateTime.optional(),
    description: z.string().trim().min(10, "Describe what happened (no names needed)").max(5000),
    data_types: optionalText(1000),
    people_affected: z.coerce.number().int().min(0).max(1_000_000).optional(),
    special_category: checkbox,
    risk_level: z.enum(Object.keys(RISK_LEVELS) as [keyof typeof RISK_LEVELS]),
    ico_decision: z.enum(Object.keys(ICO_DECISIONS) as [keyof typeof ICO_DECISIONS]),
    decision_reason: optionalText(2000),
    ico_reported_at: localDateTime.optional(),
    ico_reference: optionalText(60),
    individuals_informed_at: localDateTime.optional(),
    actions_taken: optionalText(5000),
    closed: checkbox,
  })
  .refine((v) => !v.occurred_at || v.occurred_at <= v.discovered_at, {
    path: ["occurred_at"],
    message: "It can't have happened after it was discovered",
  })
  .refine((v) => v.ico_decision !== "no" || (v.decision_reason?.length ?? 0) >= 10, {
    path: ["decision_reason"],
    message: "Record why it doesn't need reporting — the ICO expects this",
  });

export const REPORT_TYPES = {
  headcount: "Headcount",
  starters_leavers: "Starters and leavers",
  absence: "Absence (last 12 months)",
  expiries: "Upcoming expiries",
} as const;
export type ReportType = keyof typeof REPORT_TYPES;
