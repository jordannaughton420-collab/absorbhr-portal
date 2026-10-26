import { z } from "zod";

export const REGIONS = {
  "england-and-wales": "England and Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
} as const;

export const ROLES = {
  client_admin: "Client Admin",
  hr_manager: "HR Manager",
  line_manager: "Line Manager",
  employee: "Employee",
} as const;

const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

export const companySchema = z.object({
  name: z.string().trim().min(1, "Enter the company name").max(200),
  bank_holiday_region: z.enum(Object.keys(REGIONS) as [keyof typeof REGIONS]),
});

export const securitySettingsSchema = z.object({
  session_idle_minutes: z.coerce
    .number()
    .int()
    .min(5, "At least 5 minutes")
    .max(480, "At most 8 hours"),
  require_mfa_for_all: checkbox,
  employees_can_view_own_salary: checkbox,
  diversity_monitoring_enabled: checkbox,
});

export const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120, "Too long"),
});

export const locationSchema = nameSchema.extend({
  address: z.string().trim().max(500).optional(),
  bank_holiday_region: z.enum(Object.keys(REGIONS) as [keyof typeof REGIONS]).optional(),
});

export const roleSchema = z.object({
  membership_id: z.uuid(),
  role: z.enum(Object.keys(ROLES) as [keyof typeof ROLES]),
  is_active: checkbox,
});

export const newTenantSchema = z.object({
  name: z.string().trim().min(1, "Enter the company name").max(200),
  bank_holiday_region: z.enum(Object.keys(REGIONS) as [keyof typeof REGIONS]),
  admin_first_name: z.string().trim().min(1, "Enter a first name").max(100),
  admin_last_name: z.string().trim().min(1, "Enter a last name").max(100),
  admin_email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
});

export const supportSessionSchema = z.object({
  tenant_id: z.uuid("Choose a company"),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
  minutes: z.coerce.number().int().min(5).max(240),
});
