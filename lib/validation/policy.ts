import { z } from "zod";

export const POLICY_CATEGORIES = {
  general: "General",
  conduct: "Conduct and behaviour",
  disciplinary_grievance: "Disciplinary and grievance",
  health_safety: "Health and safety",
  absence_leave: "Absence and leave",
  equality: "Equality, diversity and inclusion",
  data_protection: "Data protection and privacy",
  it_security: "IT and security",
  pay_benefits: "Pay and benefits",
  other: "Other",
} as const;

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const idList = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()),
);

export const policyDetailsSchema = z
  .object({
    title: z.string().trim().min(1, "Give the policy a title").max(200),
    category: z.enum(Object.keys(POLICY_CATEGORIES) as [keyof typeof POLICY_CATEGORIES]),
    summary: z.string().trim().max(500).optional(),
    audience: z.enum(["all", "departments"]),
    department_ids: idList,
    requires_acknowledgement: checkbox,
  })
  .refine((v) => v.audience === "all" || v.department_ids.length > 0, {
    path: ["department_ids"],
    message: "Choose at least one department",
  });

export const newPolicySchema = policyDetailsSchema.and(
  z.object({
    body: z
      .string()
      .trim()
      .min(20, "Write the policy text (at least a couple of sentences)")
      .max(200000),
    template: z.enum(["true", "false"]).optional(),
  }),
);

export const draftSchema = z.object({
  policy_id: z.uuid(),
  body: z.string().trim().min(20, "Write the policy text").max(200000),
  change_summary: z.string().trim().max(500).optional(),
});

export const publishSchema = z.object({
  version_id: z.uuid(),
  require_reack: checkbox,
});
