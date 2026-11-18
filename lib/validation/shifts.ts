import { z } from "zod";

// Shared by browser forms, server actions and the assistant. The database re-checks everything.

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const shiftTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 20:00");
const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep it under ${max} characters`).optional();

const shiftTimes = {
  date: z.iso.date("Enter the date"),
  start_time: shiftTime,
  end_time: shiftTime,
  role_label: optionalText(80),
  location_id: z.uuid().optional(),
  notes: optionalText(500),
};

const differentTimes = {
  check: (v: { start_time: string; end_time: string }) => v.start_time !== v.end_time,
  message: { path: ["end_time"], message: "The end time must be different from the start" },
};

export const createShiftSchema = z
  .object({ employee_id: z.uuid("Choose a person"), ...shiftTimes, allow_short_rest: checkbox })
  .refine(differentTimes.check, differentTimes.message);

const idList = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()).max(200),
);

export const openShiftSchema = z
  .object({ ...shiftTimes, group_id: z.uuid().optional(), employee_ids: idList })
  .refine(differentTimes.check, differentTimes.message)
  .refine((v) => v.group_id || v.employee_ids.length > 0, {
    path: ["group_id"],
    message: "Choose a group or tick at least one person",
  });

export const groupMemberSchema = z.object({
  employee_id: z.uuid("Choose a person"),
  group_name: z.string().trim().min(1, "Enter a group name").max(60, "Keep it under 60 characters"),
});

export const removeMemberSchema = z.object({ employee_id: z.uuid(), group_id: z.uuid() });
export const shiftIdSchema = z.object({ shift_id: z.uuid() });
export const shiftSettingsSchema = z.object({ managers_can_plan_shifts: checkbox });
