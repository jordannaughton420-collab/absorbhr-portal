import { z } from "zod";

// Shared by browser forms and server actions for Phase 4 (people processes).

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const longText = (max: number) => z.string().trim().max(max, "That's too long").optional();

// ---------------------------------------------------------------- checklists
export const ASSIGNEES = { hr: "HR", manager: "Line manager", employee: "Employee" } as const;

export const startChecklistSchema = z.object({
  employee_id: z.uuid("Choose a person"),
  template_id: z.uuid("Choose a checklist"),
  anchor_date: z.iso.date("Enter a date"),
});

export const templateItemSchema = z.object({
  template_id: z.uuid(),
  title: z.string().trim().min(1, "Describe the task").max(200),
  assignee: z.enum(Object.keys(ASSIGNEES) as [keyof typeof ASSIGNEES]),
  due_offset_days: z.coerce.number().int().min(-90).max(365),
});

// ---------------------------------------------------------------- reviews
export const REVIEW_STATUS = {
  self_assessment: "Waiting for self-assessment",
  manager_review: "Waiting for manager",
  discussion: "Ready to discuss and sign",
  completed: "Completed",
} as const;

export const cycleSchema = z
  .object({
    name: z.string().trim().min(1, "Name the review round").max(120),
    period_start: z.iso.date("Enter a date"),
    period_end: z.iso.date("Enter a date"),
    self_due: z.iso.date().optional(),
    manager_due: z.iso.date().optional(),
  })
  .refine((v) => v.period_end >= v.period_start, {
    path: ["period_end"],
    message: "End must be after start",
  });

export const startReviewSchema = z.object({
  employee_id: z.uuid("Choose a person"),
  title: z.string().trim().min(1, "Give the review a title").max(160),
});

export const selfAssessmentSchema = z.object({
  review_id: z.uuid(),
  self_assessment: z.string().trim().max(20000, "That's too long"),
  submit: z.enum(["true", "false"]),
});

export const managerReviewSchema = z.object({
  review_id: z.uuid(),
  manager_assessment: z.string().trim().max(20000, "That's too long"),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  objectives: longText(20000),
  submit: z.enum(["true", "false"]),
});

export const signSchema = z.object({ review_id: z.uuid(), employee_comments: longText(5000) });

export const reviewSettingsSchema = z.object({
  review_rating_scale: z.enum(["true", "false"]),
  label_1: z.string().trim().min(1, "Enter a label").max(60),
  label_2: z.string().trim().min(1, "Enter a label").max(60),
  label_3: z.string().trim().min(1, "Enter a label").max(60),
  label_4: z.string().trim().min(1, "Enter a label").max(60),
  label_5: z.string().trim().min(1, "Enter a label").max(60),
});

// ---------------------------------------------------------------- 1-to-1 notes
export const noteSchema = z.object({
  employee_id: z.uuid(),
  meeting_date: z.iso.date("Enter the meeting date"),
  notes: z.string().trim().min(1, "Write some notes").max(20000),
  actions: longText(5000),
  is_private: checkbox,
});

// ---------------------------------------------------------------- cases
export const CASE_TYPES = {
  disciplinary: "Disciplinary",
  grievance: "Grievance",
  capability: "Capability / performance",
  other: "Other",
} as const;

export const CASE_STATUSES = {
  open: "Open",
  investigation: "Investigation",
  hearing: "Hearing",
  outcome: "Outcome given",
  appeal: "Appeal",
  closed: "Closed",
} as const;

export const CASE_OUTCOMES = {
  no_action: "No action",
  informal_action: "Informal action",
  first_written_warning: "First written warning",
  final_written_warning: "Final written warning",
  dismissal: "Dismissal",
  upheld: "Grievance upheld",
  partially_upheld: "Grievance partly upheld",
  not_upheld: "Grievance not upheld",
  withdrawn: "Withdrawn",
  other: "Other",
} as const;

export const CASE_EVENTS = {
  note: "Note",
  investigation_meeting: "Investigation meeting",
  hearing: "Hearing",
  letter_sent: "Letter sent",
  outcome: "Outcome",
  appeal: "Appeal",
  other: "Other",
} as const;

export const openCaseSchema = z.object({
  employee_id: z.uuid("Choose the employee"),
  case_type: z.enum(Object.keys(CASE_TYPES) as [keyof typeof CASE_TYPES]),
  summary: z.string().trim().min(5, "Summarise what the case is about").max(10000),
  opened_on: z.iso.date("Enter a date"),
});

export const updateCaseSchema = z.object({
  case_id: z.uuid(),
  status: z.enum(Object.keys(CASE_STATUSES) as [keyof typeof CASE_STATUSES]),
  outcome: z.enum(Object.keys(CASE_OUTCOMES) as [keyof typeof CASE_OUTCOMES]).optional(),
  summary: z.string().trim().min(5, "Summarise what the case is about").max(10000),
  closed_on: z.iso.date().optional(),
});

export const caseEventSchema = z.object({
  case_id: z.uuid(),
  event_date: z.iso.date("Enter a date"),
  event_type: z.enum(Object.keys(CASE_EVENTS) as [keyof typeof CASE_EVENTS]),
  details: z.string().trim().min(2, "Add some details").max(20000),
});

// ---------------------------------------------------------------- self-service
export const RECTIFICATION_AREAS = {
  personal_details: "My personal details",
  employment: "My job or contract details",
  pay: "My pay",
  absence: "My holiday or absence records",
  documents: "A document on my file",
  other: "Something else",
} as const;

export const rectificationSchema = z.object({
  area: z.enum(
    Object.keys(RECTIFICATION_AREAS) as [keyof typeof RECTIFICATION_AREAS],
    "Choose what it's about",
  ),
  details: z.string().trim().min(5, "Tell us what's wrong and what it should say").max(2000),
});

export const resolveRectificationSchema = z.object({
  id: z.uuid(),
  status: z.enum(["resolved", "declined"]),
  resolution_note: z
    .string()
    .trim()
    .min(3, "Explain what you did (the employee will see this)")
    .max(2000),
});

// Voluntary equality monitoring. Options follow common UK monitoring forms; every field optional.
export const DIVERSITY_OPTIONS = {
  ethnicity: [
    "Asian or Asian British",
    "Black, Black British, Caribbean or African",
    "Mixed or multiple ethnic groups",
    "White",
    "Other ethnic group",
    "Prefer not to say",
  ],
  disability: ["Yes", "No", "Prefer not to say"],
  religion_or_belief: [
    "No religion",
    "Buddhist",
    "Christian",
    "Hindu",
    "Jewish",
    "Muslim",
    "Sikh",
    "Any other religion",
    "Prefer not to say",
  ],
  sexual_orientation: [
    "Bisexual",
    "Gay or lesbian",
    "Heterosexual or straight",
    "Other",
    "Prefer not to say",
  ],
  gender_identity: [
    "Same as sex registered at birth",
    "Different from sex registered at birth",
    "Prefer not to say",
  ],
} as const;

export const DIVERSITY_LABELS: Record<keyof typeof DIVERSITY_OPTIONS, string> = {
  ethnicity: "Ethnic group",
  disability: "Do you consider yourself to have a disability?",
  religion_or_belief: "Religion or belief",
  sexual_orientation: "Sexual orientation",
  gender_identity: "Is your gender identity the same as the sex you were registered at birth?",
};

export const diversitySchema = z.object(
  Object.fromEntries(
    Object.entries(DIVERSITY_OPTIONS).map(([k, opts]) => [
      k,
      z.enum(opts as unknown as [string, ...string[]]).optional(),
    ]),
  ) as Record<keyof typeof DIVERSITY_OPTIONS, z.ZodOptional<z.ZodEnum<Record<string, string>>>>,
);
