import { z } from "zod";
import { CONTRACT_TYPES } from "@/lib/validation/employee";
import { shiftTime } from "@/lib/validation/shifts";

// What the assistant may suggest. Each suggestion is checked against these rules twice:
// when the assistant makes it, and again just before it is carried out on Confirm.
// None of them carries special-category data (no sickness reasons, health notes,
// diversity data, case details or pay).

const date = z.iso.date();
const id = z.uuid();
const note = z.string().trim().max(500);

export const ACTION_SCHEMAS = {
  request_leave: z
    .object({
      employee_id: id,
      leave_type_id: id,
      start_date: date,
      end_date: date,
      half_day_start: z.boolean().default(false),
      half_day_end: z.boolean().default(false),
      note: note.optional(),
    })
    .refine((v) => v.end_date >= v.start_date, { message: "End date is before the start date" }),
  cancel_leave: z.object({ request_id: id }),
  decide_leave: z.object({ request_id: id, approve: z.boolean(), note: note.optional() }),
  record_sickness: z
    .object({
      employee_id: id,
      start_date: date,
      end_date: date.optional(),
      half_day_start: z.boolean().default(false),
      half_day_end: z.boolean().default(false),
    })
    .refine((v) => !v.end_date || v.end_date >= v.start_date, {
      message: "End date is before the start date",
    }),
  create_employee: z.object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    job_title: z.string().trim().max(150).optional(),
    start_date: date,
    contract_type: z.enum(Object.keys(CONTRACT_TYPES) as [keyof typeof CONTRACT_TYPES]),
    department_id: id.optional(),
    location_id: id.optional(),
    manager_id: id.optional(),
    work_email: z.email().max(254).optional(),
  }),
  update_employee: z
    .object({
      employee_id: id,
      job_title: z.string().trim().min(1).max(150).optional(),
      department_id: id.optional(),
      location_id: id.optional(),
      manager_id: id.optional(),
    })
    .refine((v) => v.job_title || v.department_id || v.location_id || v.manager_id, {
      message: "Nothing to change",
    })
    .refine((v) => v.manager_id !== v.employee_id, { message: "Someone can't manage themselves" }),
  start_checklist: z.object({ employee_id: id, template_id: id, anchor_date: date }),
  remember: z.object({ note: z.string().trim().min(3).max(500) }),
  create_shift: z
    .object({
      employee_id: id,
      date,
      start_time: shiftTime,
      end_time: shiftTime,
      role_label: z.string().trim().min(1).max(80).optional(),
      location_id: id.optional(),
      notes: note.optional(),
      allow_short_rest: z.boolean().default(false),
    })
    .refine((v) => v.start_time !== v.end_time, { message: "Start and end times are the same" }),
  cancel_shift: z.object({ shift_id: id }),
  post_open_shift: z
    .object({
      date,
      start_time: shiftTime,
      end_time: shiftTime,
      role_label: z.string().trim().min(1).max(80).optional(),
      location_id: id.optional(),
      notes: note.optional(),
      group_id: id.optional(),
      employee_ids: z.array(id).max(200).default([]),
    })
    .refine((v) => v.start_time !== v.end_time, { message: "Start and end times are the same" })
    .refine((v) => v.group_id || v.employee_ids.length > 0, {
      message: "Choose a group or at least one person",
    }),
  add_to_shift_group: z.object({ employee_id: id, group_name: z.string().trim().min(1).max(60) }),
  remove_from_shift_group: z.object({ employee_id: id, group_id: id }),
} as const;

export type ActionKind = keyof typeof ACTION_SCHEMAS;
export type ActionPayload<K extends ActionKind> = z.infer<(typeof ACTION_SCHEMAS)[K]>;

export const ACTION_KINDS = Object.keys(ACTION_SCHEMAS) as ActionKind[];

export function isActionKind(v: string): v is ActionKind {
  return (ACTION_KINDS as string[]).includes(v);
}

/** Which roles may confirm each kind. The database enforces the same rules again. */
export const WHO_CAN = {
  request_leave: "anyone",
  cancel_leave: "anyone",
  decide_leave: "manager",
  record_sickness: "manager",
  create_employee: "hr",
  update_employee: "hr",
  start_checklist: "hr",
  remember: "anyone",
  // Planning shifts: HR, or line managers when the company has switched that on.
  create_shift: "planner",
  cancel_shift: "planner",
  post_open_shift: "planner",
  add_to_shift_group: "hr",
  remove_from_shift_group: "hr",
} as const satisfies Record<ActionKind, "anyone" | "manager" | "planner" | "hr">;

export function allowedFor(
  kind: ActionKind,
  who: { isHr: boolean; isManager: boolean; canPlanShifts?: boolean },
): boolean {
  const need = WHO_CAN[kind];
  if (need === "anyone") return true;
  if (need === "manager") return who.isHr || who.isManager;
  if (need === "planner") return who.isHr || (who.isManager && Boolean(who.canPlanShifts));
  return who.isHr;
}

// Notes are company knowledge, not records about people. A light check that catches the
// obvious cases; the confirm card also shows the note so the person can say no.
const PERSONAL_HINTS =
  /\b(sick\w*|ill|illness\w*|diagnos\w*|pregnan\w*|disab\w*|medical\w*|therap\w*|depress\w*|anxi\w*|mental health|grievance\w*|disciplinar\w*|dismiss\w*|salar\w*|pay rise|wage\w*|national insurance|ni number)\b|@|£|\d{1,2}\/\d{1,2}\/\d{2,4}/i;

export function looksPersonal(noteText: string) {
  return PERSONAL_HINTS.test(noteText);
}

const UK_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London",
});

/** "Tue 22 Dec 2026" */
export function ukDate(iso: string) {
  const parts = Object.fromEntries(
    UK_DATE.formatToParts(new Date(`${iso}T12:00:00Z`)).map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

export function dateRange(
  start: string,
  end: string | undefined,
  halfStart = false,
  halfEnd = false,
) {
  const s = `${ukDate(start)}${halfStart ? " (afternoon only)" : ""}`;
  if (!end) return `from ${s}, return date not known yet`;
  if (end === start) return halfEnd && !halfStart ? `${ukDate(start)} (morning only)` : s;
  return `${s} to ${ukDate(end)}${halfEnd ? " (morning only)" : ""}`;
}
