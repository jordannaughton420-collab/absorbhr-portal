import { z } from "zod";

// Shared by browser forms and server actions. Optional fields are clearly optional,
// matching the data-minimisation notes in docs/GDPR.md.

const text = (max: number, label: string) => z.string().trim().max(max, `${label} is too long`);
const optionalText = (max: number, label: string) => text(max, label).optional();
const optionalDate = z.iso.date("Enter a valid date").optional();
const optionalUuid = z.uuid().optional();

export const CONTRACT_TYPES = {
  permanent: "Permanent",
  fixed_term: "Fixed-term",
  zero_hours: "Zero hours",
  casual: "Casual",
  apprentice: "Apprentice",
  contractor: "Contractor",
} as const;

export const EMPLOYMENT_STATUSES = {
  pre_start: "Not started yet",
  active: "Active",
  leaver: "Leaver",
} as const;

export const employeeSchema = z
  .object({
    first_name: text(100, "First name").min(1, "Enter a first name"),
    last_name: text(100, "Last name").min(1, "Enter a last name"),
    preferred_name: optionalText(100, "Preferred name"),
    work_email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address")
      .max(254)
      .optional(),
    employee_number: optionalText(30, "Employee number"),
    job_title: optionalText(150, "Job title"),
    department_id: optionalUuid,
    location_id: optionalUuid,
    manager_id: optionalUuid,
    start_date: z.iso.date("Enter a valid start date"),
    continuous_service_date: optionalDate,
    probation_end_date: optionalDate,
    contract_type: z.enum(Object.keys(CONTRACT_TYPES) as [keyof typeof CONTRACT_TYPES]),
    fixed_term_end_date: optionalDate,
    weekly_hours: z.coerce
      .number()
      .min(0, "Must be 0 or more")
      .max(100, "Must be 100 or less")
      .optional(),
    days_per_week: z.coerce
      .number()
      .min(0, "Must be 0 or more")
      .max(7, "Must be 7 or less")
      .optional(),
    status: z
      .enum(Object.keys(EMPLOYMENT_STATUSES) as [keyof typeof EMPLOYMENT_STATUSES])
      .default("active"),
    end_date: optionalDate,
  })
  .refine((v) => v.contract_type === "fixed_term" || !v.fixed_term_end_date, {
    path: ["fixed_term_end_date"],
    message: "Only fixed-term contracts have an end date",
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "Leaving date can't be before the start date",
  })
  .refine((v) => v.status !== "leaver" || Boolean(v.end_date), {
    path: ["end_date"],
    message: "Enter the leaving date",
  });

export const personalSchema = z.object({
  personal_email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(254)
    .optional(),
  personal_phone: z
    .string()
    .trim()
    .regex(/^[0-9 +()-]{7,30}$/, "Enter a valid phone number")
    .optional(),
  address_line1: optionalText(200, "Address"),
  address_line2: optionalText(200, "Address"),
  town: optionalText(100, "Town"),
  postcode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/, "Enter a valid UK postcode")
    .optional(),
  date_of_birth: optionalDate,
});

export const emergencyContactSchema = z.object({
  name: text(150, "Name").min(1, "Enter a name"),
  relationship: optionalText(60, "Relationship"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9 +()-]{5,30}$/, "Enter a valid phone number"),
  alt_phone: z
    .string()
    .trim()
    .regex(/^[0-9 +()-]{5,30}$/, "Enter a valid phone number")
    .optional(),
});

export const salarySchema = z.object({
  effective_date: z.iso.date("Enter a valid date"),
  amount: z.coerce.number().min(0, "Must be 0 or more").max(10_000_000, "That looks too high"),
  pay_basis: z.enum(["annual", "hourly"]),
  reason: optionalText(300, "Reason"),
});

export const RTW_CHECK_TYPES = {
  manual_document: "Manual document check",
  online_share_code: "Home Office online check (share code)",
  idsp: "Identity Service Provider (IDSP) check",
} as const;

export const RTW_STATUSES = {
  verified: "Verified — no time limit",
  time_limited: "Verified — time-limited permission",
  pending: "Pending",
  failed: "Not verified",
} as const;

export const rtwSchema = z
  .object({
    check_type: z.enum(Object.keys(RTW_CHECK_TYPES) as [keyof typeof RTW_CHECK_TYPES]),
    checked_on: z.iso.date("Enter a valid date"),
    status: z.enum(Object.keys(RTW_STATUSES) as [keyof typeof RTW_STATUSES]),
    expiry_date: optionalDate,
    follow_up_date: optionalDate,
    notes: optionalText(1000, "Notes"),
  })
  .refine((v) => v.status !== "time_limited" || Boolean(v.expiry_date), {
    path: ["expiry_date"],
    message: "Enter when the permission expires",
  });

export const idSchema = z.object({ id: z.uuid() });
