import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CONTRACT_TYPES } from "@/lib/validation/employee";
import { ROLES } from "@/lib/validation/settings";
import { LEFT_OUT, addDays, londonMidnightIso, shiftWhen, shiftWhenFromParts } from "@/lib/shifts";
import {
  ACTION_SCHEMAS,
  WHO_CAN,
  allowedFor,
  dateRange,
  isActionKind,
  looksPersonal,
  ukDate,
  type ActionKind,
} from "@/lib/assistant/schemas";

type Db = SupabaseClient<Database>;

export type ToolContext = {
  supabase: Db;
  tenantId: string;
  userId: string;
  employeeId: string | null;
  isHr: boolean;
  isManager: boolean;
  isClientAdmin: boolean;
  /** HR, or a line manager whose company lets managers plan shifts. */
  canPlanShifts: boolean;
  conversationId: string;
};

// Every tool runs as the signed-in person through their own Supabase session, so Row Level
// Security decides what each one can see. None of them reads sickness reasons, health notes,
// diversity data, cases, pay or home details.

const str = (description: string) => ({ type: "string", description });
const uuid = (description: string) => ({ type: "string", format: "uuid", description });
const day = (description: string) => ({ type: "string", format: "date", description });
const bool = (description: string) => ({ type: "boolean", description });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

const hhmm = (description: string) => ({
  type: "string",
  pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
  description,
});
const SHIFT_TIMES = {
  date: day("The day the shift starts (UK date). 'Tonight' means today."),
  start_time: hhmm("Start, 24-hour UK time, e.g. 20:00."),
  end_time: hhmm(
    "End, 24-hour UK time, e.g. 05:00. An end earlier than the start means the next morning.",
  ),
};

const SUGGEST =
  " This does NOT make the change: it shows the person a card with Confirm and Cancel buttons, and only their Confirm carries it out.";

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_people",
    description:
      "Search the company directory by name, job title or department. Returns each person's id, name, job title, department, location and manager. Use it to get ids before suggesting a change. Leave the search empty to list everyone (up to 50).",
    input_schema: obj({ search: str("Part of a name, job title or department. Optional.") }),
  },
  {
    name: "get_employee",
    description:
      "Employment details for one person the user is allowed to see: job title, department, location, manager, start date, contract type and status.",
    input_schema: obj({ employee_id: uuid("The person's id from find_people.") }, ["employee_id"]),
  },
  {
    name: "get_holiday_balance",
    description:
      "Holiday allowance, days booked, days taken and days left in the current leave year for one person.",
    input_schema: obj({ employee_id: uuid("The person's id.") }, ["employee_id"]),
  },
  {
    name: "list_leave_requests",
    description:
      "Leave requests the user can see, newest first. Filter by person, status and dates. Use it to find a request's id before suggesting a cancellation or decision.",
    input_schema: obj({
      employee_id: uuid("Only this person. Optional."),
      status: {
        type: "string",
        enum: ["pending", "approved", "declined", "cancelled"],
        description: "Optional.",
      },
      from: day("Only requests ending on or after this date. Optional."),
      to: day("Only requests starting on or before this date. Optional."),
    }),
  },
  {
    name: "who_is_off",
    description:
      "Who is on approved leave or off sick between two dates, among the people the user can see. Never gives sickness reasons.",
    input_schema: obj({ from: day("First day."), to: day("Last day.") }, ["from", "to"]),
  },
  {
    name: "get_bank_holidays",
    description:
      "UK bank holidays between two dates, from the official GOV.UK list the portal uses. Gives the region that applies to a person (their work location, or the company's default). Always use this for bank holiday questions; never answer them from memory.",
    input_schema: obj(
      {
        from: day("First day."),
        to: day("Last day."),
        employee_id: uuid("Whose region to use. Optional: defaults to the signed-in person."),
      },
      ["from", "to"],
    ),
  },
  {
    name: "list_options",
    description:
      "The company's leave types, departments, locations and checklist templates, with their ids.",
    input_schema: obj({}),
  },
  {
    name: "list_shifts",
    description:
      "Shifts on the rota between two dates that the user can see, including open shifts still waiting for someone (with who they were offered to) and who picked up an open shift.",
    input_schema: obj(
      {
        from: day("First day."),
        to: day("Last day (at most 31 days after from)."),
        employee_id: uuid("Only this person. Optional."),
      },
      ["from", "to"],
    ),
  },
  {
    name: "list_shift_groups",
    description:
      "The company's open shift groups (people happy to be offered extra shifts) with their ids and who is in each.",
    input_schema: obj({}),
  },
  {
    name: "check_open_shift",
    description:
      "Before posting an open shift: who it would go to and who would be left out and why (on holiday, off sick, already working, under 11 hours' rest, no login, not in the manager's team). Give a group, named people, or both. HR and managers who plan shifts only.",
    input_schema: obj(
      {
        ...SHIFT_TIMES,
        group_id: uuid("Send to everyone free in this group, from list_shift_groups. Optional."),
        employee_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Named people, from find_people. Optional.",
        },
      },
      ["date", "start_time", "end_time"],
    ),
  },
  {
    name: "list_sickness",
    description:
      "Sickness absences the user can see (dates only, never reasons), ongoing ones first. Use it to find an absence's id before suggesting a return date.",
    input_schema: obj({ employee_id: uuid("Only this person. Optional.") }),
  },
  {
    name: "list_checklist_tasks",
    description:
      "Onboarding and offboarding checklist tasks the user can see, with who each is for (HR, manager or the employee), due date and whether it's done. Use it to find a task's id.",
    input_schema: obj({
      employee_id: uuid("Only this person's checklists. Optional."),
      include_done: bool("Also list finished tasks. Optional, default false."),
    }),
  },
  {
    name: "list_portal_access",
    description:
      "HR only: who has a portal login, their role (Client Admin, HR Manager, Line Manager, Employee), whether their access is active, and whether they have a work email (needed for an invitation).",
    input_schema: obj({ search: str("Part of a name. Optional.") }),
  },
  {
    name: "list_policies",
    description:
      "HR only: the company's policies with their status, and for each one any newer version that has been drafted but not yet published (with its version id).",
    input_schema: obj({}),
  },
  {
    name: "suggest_request_leave",
    description:
      "Suggest booking leave for a person (the user themselves, or someone they manage)." + SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Who the leave is for."),
        leave_type_id: uuid(
          "From list_options. Use the holiday/annual leave type unless told otherwise.",
        ),
        start_date: day("First day."),
        end_date: day("Last day (same as start for one day)."),
        half_day_start: bool("True if the first day is an afternoon only."),
        half_day_end: bool("True if the last day is a morning only."),
        note: str("Optional short note for the approver."),
      },
      ["employee_id", "leave_type_id", "start_date", "end_date", "half_day_start", "half_day_end"],
    ),
  },
  {
    name: "suggest_cancel_leave",
    description: "Suggest cancelling a leave request." + SUGGEST,
    input_schema: obj({ request_id: uuid("From list_leave_requests.") }, ["request_id"]),
  },
  {
    name: "suggest_decide_leave",
    description:
      "Suggest approving or declining a pending leave request (managers and HR)." + SUGGEST,
    input_schema: obj(
      {
        request_id: uuid("From list_leave_requests."),
        approve: bool("True to approve, false to decline."),
        note: str("Optional note to the person, e.g. the reason for declining."),
      },
      ["request_id", "approve"],
    ),
  },
  {
    name: "suggest_record_sickness",
    description:
      "Suggest recording that someone is off sick: dates only. Never ask for or record the reason or any health details; HR adds those separately in the Sickness page." +
      SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Who is off sick."),
        start_date: day("First day off."),
        end_date: day("Last day off, if known. Leave out if they are still off."),
        half_day_start: bool("True if they went home part-way through the first day."),
        half_day_end: bool("True if they came back part-way through the last day."),
      },
      ["employee_id", "start_date", "half_day_start", "half_day_end"],
    ),
  },
  {
    name: "suggest_create_employee",
    description: "Suggest adding a new employee record (HR only)." + SUGGEST,
    input_schema: obj(
      {
        first_name: str("First name."),
        last_name: str("Last name."),
        job_title: str("Optional."),
        start_date: day("First day of work."),
        contract_type: {
          type: "string",
          enum: Object.keys(CONTRACT_TYPES),
          description: "Use permanent unless the user says otherwise.",
        },
        department_id: uuid("Optional, from list_options."),
        location_id: uuid("Optional, from list_options."),
        manager_id: uuid("Optional, from find_people."),
        work_email: str("Optional work email address."),
      },
      ["first_name", "last_name", "start_date", "contract_type"],
    ),
  },
  {
    name: "suggest_update_employee",
    description:
      "Suggest changing a person's job title, department, location or manager (HR only). Include only what changes." +
      SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Whose record."),
        job_title: str("New job title. Optional."),
        department_id: uuid("New department. Optional."),
        location_id: uuid("New location. Optional."),
        manager_id: uuid("New manager. Optional."),
      },
      ["employee_id"],
    ),
  },
  {
    name: "suggest_start_checklist",
    description:
      "Suggest starting an onboarding or offboarding checklist for a person (HR only)." + SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Who it is for."),
        template_id: uuid("Checklist template, from list_options."),
        anchor_date: day("The date the checklist counts from, usually the start or leaving date."),
      },
      ["employee_id", "template_id", "anchor_date"],
    ),
  },
  {
    name: "suggest_remember",
    description:
      "Suggest saving a short company note to remember in future chats for everyone in this company, e.g. 'Holiday requests need two weeks notice' or 'We call departments teams'. Company knowledge only: never notes about a person's health, conduct, pay or private life." +
      SUGGEST,
    input_schema: obj({ note: str("The note, one sentence, under 500 characters.") }, ["note"]),
  },
  {
    name: "suggest_create_shift",
    description:
      "Suggest putting a named person straight onto the rota for a shift (HR, or managers who plan shifts, for their own team). The portal refuses it if they are on holiday, off sick, already working, or would get under 11 hours' rest, unless allow_short_rest is true; only set that if the user explicitly says the shorter rest is agreed." +
      SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Who."),
        ...SHIFT_TIMES,
        role_label: str("Role or area, e.g. Bar or Night cover. Optional."),
        location_id: uuid("Optional, from list_options."),
        notes: str("Optional note about the shift itself. Never personal details."),
        allow_short_rest: bool("True only if the user says a rest break under 11 hours is agreed."),
      },
      ["employee_id", "date", "start_time", "end_time"],
    ),
  },
  {
    name: "suggest_cancel_shift",
    description:
      "Suggest cancelling a shift or an open shift that hasn't started. The person on it is emailed." +
      SUGGEST,
    input_schema: obj({ shift_id: uuid("From list_shifts.") }, ["shift_id"]),
  },
  {
    name: "suggest_post_open_shift",
    description:
      "Suggest posting an open shift: everyone free in the group and/or the named people gets an email, and the first to accept it in the portal gets it; nobody else can after that. Use check_open_shift first so you can tell the user who it will go to. You can never accept a shift for anyone: only the employee can, on their My shifts page." +
      SUGGEST,
    input_schema: obj(
      {
        ...SHIFT_TIMES,
        role_label: str("Role or area, e.g. Night cover. Optional."),
        location_id: uuid("Optional, from list_options."),
        notes: str("Optional note about the shift itself. Never personal details."),
        group_id: uuid("From list_shift_groups. Optional if employee_ids is given."),
        employee_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Named people, from find_people. Optional if group_id is given.",
        },
      },
      ["date", "start_time", "end_time"],
    ),
  },
  {
    name: "suggest_add_to_shift_group",
    description:
      "Suggest adding a person to an open shift group, e.g. when told 'Jamie is on open shifts'. Use the existing group's exact name from list_shift_groups; if there is none, use 'Open shifts'. HR only." +
      SUGGEST,
    input_schema: obj({ employee_id: uuid("Who."), group_name: str("The group's name.") }, [
      "employee_id",
      "group_name",
    ]),
  },
  {
    name: "suggest_remove_from_shift_group",
    description: "Suggest taking a person out of an open shift group (HR only)." + SUGGEST,
    input_schema: obj({ employee_id: uuid("Who."), group_id: uuid("From list_shift_groups.") }, [
      "employee_id",
      "group_id",
    ]),
  },
  {
    name: "suggest_end_sickness",
    description:
      "Suggest recording the date someone came back from sickness (their last day off). Dates only; never ask about the reason." +
      SUGGEST,
    input_schema: obj(
      {
        absence_id: uuid("From list_sickness."),
        end_date: day("Their last day off sick."),
        half_day_end: bool("True if they came back part-way through that day."),
      },
      ["absence_id", "end_date", "half_day_end"],
    ),
  },
  {
    name: "suggest_complete_checklist_task",
    description:
      "Suggest ticking off (or un-ticking) an onboarding or offboarding checklist task. People can only tick tasks meant for them; HR can tick any." +
      SUGGEST,
    input_schema: obj(
      {
        item_id: uuid("From list_checklist_tasks."),
        done: bool("True to mark done, false to mark not done."),
      },
      ["item_id", "done"],
    ),
  },
  {
    name: "suggest_adjust_holiday",
    description:
      "Suggest adding or taking away holiday days for this leave year, e.g. time off in lieu, an agreed extra day, or a correction (HR only). Use a minus number to take days away." +
      SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Whose allowance."),
        days: { type: "number", description: "Days to add (or minus to remove), whole or half." },
        reason: str("Short reason, e.g. 'Time off in lieu for working Saturday 14 Nov'."),
      },
      ["employee_id", "days", "reason"],
    ),
  },
  {
    name: "suggest_invite_to_portal",
    description:
      "Suggest giving someone a portal login: they get an email to set their password, and start as an Employee (Client Admin only). They need a work email on their record first." +
      SUGGEST,
    input_schema: obj({ employee_id: uuid("Who.") }, ["employee_id"]),
  },
  {
    name: "suggest_mark_leaver",
    description:
      "Suggest recording that someone is leaving or has left, with their last day of employment (HR only). This doesn't switch off their portal login; suggest_change_role with active false does that." +
      SUGGEST,
    input_schema: obj(
      { employee_id: uuid("Who."), end_date: day("Their last day of employment.") },
      ["employee_id", "end_date"],
    ),
  },
  {
    name: "suggest_change_role",
    description:
      "Suggest changing someone's portal role or switching their access off or back on (Client Admin only, never their own). Roles: client_admin, hr_manager, line_manager, employee." +
      SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Whose access."),
        role: {
          type: "string",
          enum: Object.keys(ROLES),
          description: "The role they should have.",
        },
        active: bool("False to switch their access off, true to keep or turn it on."),
      },
      ["employee_id", "role", "active"],
    ),
  },
  {
    name: "suggest_add_department",
    description: "Suggest adding a department to the company (Client Admin only)." + SUGGEST,
    input_schema: obj({ name: str("Department name.") }, ["name"]),
  },
  {
    name: "suggest_add_location",
    description: "Suggest adding a work location to the company (Client Admin only)." + SUGGEST,
    input_schema: obj(
      { name: str("Location name."), address: str("Business address. Optional.") },
      ["name"],
    ),
  },
  {
    name: "suggest_start_review",
    description:
      "Suggest starting a performance review for someone (HR, or their line manager). Their line manager becomes the reviewer." +
      SUGGEST,
    input_schema: obj(
      {
        employee_id: uuid("Who is being reviewed."),
        title: str("E.g. 'Probation review' or 'Annual review 2026'."),
      },
      ["employee_id", "title"],
    ),
  },
  {
    name: "suggest_publish_policy",
    description:
      "Suggest publishing a policy's newest drafted version so staff can see it (HR only). Staff are asked to read and acknowledge it unless require_reack is false (only allowed for later versions with small changes)." +
      SUGGEST,
    input_schema: obj(
      {
        version_id: uuid("The draft version id, from list_policies."),
        require_reack: bool("True if staff must read and acknowledge it again."),
      },
      ["version_id", "require_reack"],
    ),
  },
];

const SUGGEST_TOOLS: Record<string, ActionKind> = {
  suggest_request_leave: "request_leave",
  suggest_cancel_leave: "cancel_leave",
  suggest_decide_leave: "decide_leave",
  suggest_record_sickness: "record_sickness",
  suggest_create_employee: "create_employee",
  suggest_update_employee: "update_employee",
  suggest_start_checklist: "start_checklist",
  suggest_remember: "remember",
  suggest_create_shift: "create_shift",
  suggest_cancel_shift: "cancel_shift",
  suggest_post_open_shift: "post_open_shift",
  suggest_add_to_shift_group: "add_to_shift_group",
  suggest_remove_from_shift_group: "remove_from_shift_group",
  suggest_end_sickness: "end_sickness",
  suggest_complete_checklist_task: "complete_checklist_task",
  suggest_adjust_holiday: "adjust_holiday",
  suggest_invite_to_portal: "invite_to_portal",
  suggest_mark_leaver: "mark_leaver",
  suggest_change_role: "change_role",
  suggest_add_department: "add_department",
  suggest_add_location: "add_location",
  suggest_start_review: "start_review",
  suggest_publish_policy: "publish_policy",
};

export type ToolOutcome = { content: string; isError?: boolean; actionId?: string };

const fail = (content: string): ToolOutcome => ({ content, isError: true });

// ---------------------------------------------------------------- lookups

type Person = { id: string; name: string };

async function personName(ctx: ToolContext, employeeId: string): Promise<Person | null> {
  const { data } = await ctx.supabase
    .from("employee_directory")
    .select("id, first_name, preferred_name, last_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (!data?.id) return null;
  return { id: data.id, name: `${data.preferred_name || data.first_name} ${data.last_name}` };
}

async function nameOf(
  ctx: ToolContext,
  table: "departments" | "locations" | "leave_types" | "checklist_templates",
  rowId?: string,
) {
  if (!rowId) return null;
  const { data } = await ctx.supabase.from(table).select("name").eq("id", rowId).maybeSingle();
  return data?.name ?? null;
}

async function findPeople(ctx: ToolContext, input: { search?: string }) {
  let q = ctx.supabase
    .from("employee_directory")
    .select(
      "id, first_name, preferred_name, last_name, job_title, department_name, location_name, manager_id",
    )
    .order("last_name")
    .limit(50);
  const s = input.search
    ?.trim()
    .replace(/[%_,()]/g, " ")
    .slice(0, 60);
  if (s)
    q = q.or(
      ["first_name", "preferred_name", "last_name", "job_title", "department_name"]
        .map((c) => `${c}.ilike.%${s}%`)
        .join(","),
    );
  const { data, error } = await q;
  if (error) return fail("Could not search the directory.");
  const rows = data ?? [];
  const managers = new Map(
    rows.map((r) => [r.id, `${r.preferred_name || r.first_name} ${r.last_name}`]),
  );
  return {
    content: JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        name: `${r.preferred_name || r.first_name} ${r.last_name}`,
        job_title: r.job_title,
        department: r.department_name,
        location: r.location_name,
        manager_id: r.manager_id,
        manager: r.manager_id ? (managers.get(r.manager_id) ?? null) : null,
      })),
    ),
  };
}

async function getEmployee(ctx: ToolContext, input: { employee_id: string }) {
  const { data, error } = await ctx.supabase
    .from("employees")
    .select(
      "id, first_name, preferred_name, last_name, job_title, department_id, location_id, manager_id, start_date, contract_type, status, end_date",
    )
    .eq("id", input.employee_id)
    .maybeSingle();
  if (error || !data) return fail("That person isn't visible to this user, or doesn't exist.");
  const [department, location, manager] = await Promise.all([
    nameOf(ctx, "departments", data.department_id ?? undefined),
    nameOf(ctx, "locations", data.location_id ?? undefined),
    data.manager_id ? personName(ctx, data.manager_id) : null,
  ]);
  return {
    content: JSON.stringify({
      id: data.id,
      name: `${data.preferred_name || data.first_name} ${data.last_name}`,
      job_title: data.job_title,
      department,
      location,
      manager: manager?.name ?? null,
      start_date: data.start_date,
      contract_type: data.contract_type,
      status: data.status,
      end_date: data.end_date,
    }),
  };
}

async function getBalance(ctx: ToolContext, input: { employee_id: string }) {
  const { data, error } = await ctx.supabase
    .rpc("leave_balance", { p_employee: input.employee_id })
    .maybeSingle();
  if (error || !data) return fail("No holiday balance available for that person (or not allowed).");
  return { content: JSON.stringify(data) };
}

async function listLeave(
  ctx: ToolContext,
  input: { employee_id?: string; status?: string; from?: string; to?: string },
) {
  let q = ctx.supabase
    .from("leave_requests")
    .select(
      "id, employee_id, start_date, end_date, half_day_start, half_day_end, days, status, leave_types(name)",
    )
    .order("start_date", { ascending: false })
    .limit(30);
  if (input.employee_id) q = q.eq("employee_id", input.employee_id);
  if (input.status) q = q.eq("status", input.status);
  if (input.from) q = q.gte("end_date", input.from);
  if (input.to) q = q.lte("start_date", input.to);
  const { data, error } = await q;
  if (error) return fail("Could not read leave requests.");
  const names = await namesFor(
    ctx,
    (data ?? []).map((r) => r.employee_id),
  );
  return {
    content: JSON.stringify(
      (data ?? []).map((r) => ({
        id: r.id,
        person: names.get(r.employee_id) ?? "Someone",
        employee_id: r.employee_id,
        type: r.leave_types?.name ?? null,
        dates: dateRange(r.start_date, r.end_date, r.half_day_start, r.half_day_end),
        start_date: r.start_date,
        end_date: r.end_date,
        days: r.days,
        status: r.status,
      })),
    ),
  };
}

async function namesFor(ctx: ToolContext, ids: string[]) {
  const unique = [...new Set(ids)];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data } = await ctx.supabase
    .from("employee_directory")
    .select("id, first_name, preferred_name, last_name")
    .in("id", unique);
  for (const p of data ?? [])
    if (p.id) map.set(p.id, `${p.preferred_name || p.first_name} ${p.last_name}`);
  return map;
}

async function whoIsOff(ctx: ToolContext, input: { from: string; to: string }) {
  const [leave, sick] = await Promise.all([
    ctx.supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date, half_day_start, half_day_end, leave_types(name)")
      .eq("status", "approved")
      .lte("start_date", input.to)
      .gte("end_date", input.from)
      .limit(100),
    ctx.supabase
      .from("sickness_absences")
      .select("employee_id, start_date, end_date")
      .lte("start_date", input.to)
      .or(`end_date.is.null,end_date.gte.${input.from}`)
      .limit(100),
  ]);
  const ids = [...(leave.data ?? []), ...(sick.data ?? [])].map((r) => r.employee_id);
  const names = await namesFor(ctx, ids);
  return {
    content: JSON.stringify({
      on_leave: (leave.data ?? []).map((r) => ({
        person: names.get(r.employee_id) ?? "Someone",
        type: r.leave_types?.name ?? null,
        dates: dateRange(r.start_date, r.end_date, r.half_day_start, r.half_day_end),
      })),
      off_sick: (sick.data ?? []).map((r) => ({
        person: names.get(r.employee_id) ?? "Someone",
        dates: dateRange(r.start_date, r.end_date ?? undefined),
      })),
    }),
  };
}

const REGION_NAMES: Record<string, string> = {
  "england-and-wales": "England and Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
};

async function bankHolidays(
  ctx: ToolContext,
  input: { from: string; to: string; employee_id?: string },
) {
  const who = input.employee_id ?? ctx.employeeId;
  let region: string | null = null;
  if (who) {
    const { data: emp } = await ctx.supabase
      .from("employees")
      .select("locations(bank_holiday_region)")
      .eq("id", who)
      .maybeSingle();
    region = emp?.locations?.bank_holiday_region ?? null;
  }
  if (!region) {
    const { data: t } = await ctx.supabase
      .from("tenants")
      .select("bank_holiday_region")
      .eq("id", ctx.tenantId)
      .maybeSingle();
    region = t?.bank_holiday_region ?? "england-and-wales";
  }
  const { data, error } = await ctx.supabase
    .from("bank_holidays")
    .select("date, title")
    .eq("region", region as never)
    .gte("date", input.from)
    .lte("date", input.to)
    .order("date")
    .limit(60);
  if (error) return fail("Could not read the bank holiday list.");
  return {
    content: JSON.stringify({
      region: REGION_NAMES[region] ?? region,
      source: "GOV.UK, as loaded into the portal",
      bank_holidays: (data ?? []).map((b) => ({ date: ukDate(b.date), name: b.title })),
    }),
  };
}

async function listOptions(ctx: ToolContext) {
  const [types, departments, locations, templates] = await Promise.all([
    ctx.supabase
      .from("leave_types")
      .select("id, name, deducts_allowance")
      .eq("active", true)
      .order("name"),
    ctx.supabase.from("departments").select("id, name").order("name"),
    ctx.supabase.from("locations").select("id, name").order("name"),
    ctx.supabase
      .from("checklist_templates")
      .select("id, name, kind")
      .eq("active", true)
      .order("name"),
  ]);
  return {
    content: JSON.stringify({
      leave_types: types.data ?? [],
      departments: departments.data ?? [],
      locations: locations.data ?? [],
      checklist_templates: templates.data ?? [],
    }),
  };
}

// ---------------------------------------------------------------- everyday admin lookups

async function listSickness(ctx: ToolContext, input: { employee_id?: string }) {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  let q = ctx.supabase
    .from("sickness_absences")
    .select("id, employee_id, start_date, end_date")
    .or(`end_date.is.null,end_date.gte.${since}`)
    .order("start_date", { ascending: false })
    .limit(50);
  if (input.employee_id) q = q.eq("employee_id", input.employee_id);
  const { data, error } = await q;
  if (error) return fail("Could not read sickness records.");
  const names = await namesFor(
    ctx,
    (data ?? []).map((r) => r.employee_id),
  );
  const rows = [...(data ?? [])].sort(
    (a, b) => Number(Boolean(a.end_date)) - Number(Boolean(b.end_date)),
  );
  return {
    content: JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        person: names.get(r.employee_id) ?? "Someone",
        dates: dateRange(r.start_date, r.end_date ?? undefined),
        still_off: !r.end_date,
      })),
    ),
  };
}

async function listChecklistTasks(
  ctx: ToolContext,
  input: { employee_id?: string; include_done?: boolean },
) {
  let q = ctx.supabase
    .from("checklist_items")
    .select("id, employee_id, title, assignee, due_date, completed_at, checklists(title)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(80);
  if (input.employee_id) q = q.eq("employee_id", input.employee_id);
  if (!input.include_done) q = q.is("completed_at", null);
  const { data, error } = await q;
  if (error) return fail("Could not read checklist tasks.");
  const names = await namesFor(
    ctx,
    (data ?? []).map((r) => r.employee_id),
  );
  const forWho: Record<string, string> = {
    hr: "HR",
    manager: "their line manager",
    employee: "the employee",
  };
  return {
    content: JSON.stringify(
      (data ?? []).map((r) => ({
        id: r.id,
        checklist: `${r.checklists?.title ?? "Checklist"} for ${names.get(r.employee_id) ?? "someone"}`,
        task: r.title,
        for: forWho[r.assignee] ?? r.assignee,
        due: r.due_date ? ukDate(r.due_date) : null,
        done: Boolean(r.completed_at),
      })),
    ),
  };
}

async function listPortalAccess(ctx: ToolContext, input: { search?: string }) {
  if (!ctx.isHr) return fail("Only HR and Client Admins can see who has portal access.");
  let q = ctx.supabase
    .from("employees")
    .select("id, first_name, preferred_name, last_name, user_id, work_email, status")
    .neq("status", "leaver")
    .order("last_name")
    .limit(100);
  const s = input.search
    ?.trim()
    .replace(/[%_,()]/g, " ")
    .slice(0, 60);
  if (s) q = q.or(`first_name.ilike.%${s}%,preferred_name.ilike.%${s}%,last_name.ilike.%${s}%`);
  const [{ data: people, error }, { data: members }] = await Promise.all([
    q,
    ctx.supabase.from("memberships").select("user_id, role, is_active"),
  ]);
  if (error) return fail("Could not read portal access.");
  const byUser = new Map((members ?? []).map((m) => [m.user_id, m]));
  return {
    content: JSON.stringify(
      (people ?? []).map((p) => {
        const m = p.user_id ? byUser.get(p.user_id) : undefined;
        return {
          id: p.id,
          name: `${p.preferred_name || p.first_name} ${p.last_name}`,
          has_login: Boolean(m),
          role: m ? ROLES[m.role as keyof typeof ROLES] : null,
          access_active: m ? m.is_active : null,
          has_work_email: Boolean(p.work_email),
        };
      }),
    ),
  };
}

async function listPolicies(ctx: ToolContext) {
  if (!ctx.isHr) return fail("Only HR can manage policies.");
  const [{ data: policies, error }, { data: versions }] = await Promise.all([
    ctx.supabase
      .from("policies")
      .select("id, title, status")
      .eq("tenant_id", ctx.tenantId)
      .order("title")
      .limit(100),
    ctx.supabase
      .from("policy_versions")
      .select("id, policy_id, version, published_at, change_summary")
      .eq("tenant_id", ctx.tenantId)
      .order("version", { ascending: false })
      .limit(500),
  ]);
  if (error) return fail("Could not read policies.");
  return {
    content: JSON.stringify(
      (policies ?? []).map((p) => {
        const newest = (versions ?? []).find((v) => v.policy_id === p.id);
        const draft = newest && !newest.published_at ? newest : null;
        return {
          title: p.title,
          status: p.status,
          draft_waiting_to_publish: draft
            ? { version_id: draft.id, version: draft.version, change_summary: draft.change_summary }
            : null,
        };
      }),
    ),
  };
}

// ---------------------------------------------------------------- shifts

async function listShifts(
  ctx: ToolContext,
  input: { from: string; to: string; employee_id?: string },
) {
  const span = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000;
  if (!(span >= 0 && span <= 31)) return fail("Use a range of up to 31 days, from before to.");
  let q = ctx.supabase
    .from("shifts")
    .select(
      "id, employee_id, starts_at, ends_at, role_label, status, claimed_at, shift_groups(name)",
    )
    .neq("status", "cancelled")
    .gte("starts_at", londonMidnightIso(input.from))
    .lt("starts_at", londonMidnightIso(addDays(input.to, 1)))
    .order("starts_at")
    .limit(100);
  if (input.employee_id) q = q.eq("employee_id", input.employee_id);
  const { data, error } = await q;
  if (error) return fail("Could not read the rota.");
  const openIds = (data ?? []).filter((s) => s.status === "open").map((s) => s.id);
  const { data: offers } = openIds.length
    ? await ctx.supabase
        .from("shift_offers")
        .select("shift_id, employee_id, response")
        .in("shift_id", openIds)
    : { data: [] };
  const names = await namesFor(ctx, [
    ...(data ?? []).flatMap((s) => (s.employee_id ? [s.employee_id] : [])),
    ...(offers ?? []).map((o) => o.employee_id),
  ]);
  return {
    content: JSON.stringify(
      (data ?? []).map((s) => ({
        id: s.id,
        when: shiftWhen(s.starts_at, s.ends_at),
        role: s.role_label,
        status: s.status === "open" ? "open, waiting for someone to accept" : "on the rota",
        person: s.employee_id ? (names.get(s.employee_id) ?? "Someone") : null,
        picked_up_as_open_shift: Boolean(s.claimed_at),
        group: s.shift_groups?.name ?? null,
        offered_to:
          s.status === "open"
            ? (offers ?? [])
                .filter((o) => o.shift_id === s.id)
                .map((o) => ({
                  person: names.get(o.employee_id) ?? "Someone",
                  said_no: o.response === "declined",
                }))
            : undefined,
      })),
    ),
  };
}

async function listShiftGroups(ctx: ToolContext) {
  const [{ data: groups, error }, { data: members }] = await Promise.all([
    ctx.supabase.from("shift_groups").select("id, name").order("name"),
    ctx.supabase.from("shift_group_members").select("group_id, employee_id"),
  ]);
  if (error) return fail("Could not read the open shift groups.");
  const names = await namesFor(
    ctx,
    (members ?? []).map((m) => m.employee_id),
  );
  return {
    content: JSON.stringify(
      (groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        members: (members ?? [])
          .filter((m) => m.group_id === g.id)
          .map((m) => ({ id: m.employee_id, name: names.get(m.employee_id) ?? "Someone" })),
      })),
    ),
  };
}

type Candidate = { employee_id: string; name: string; available: boolean; reason: string | null };

async function openShiftCandidates(
  ctx: ToolContext,
  p: {
    date: string;
    start_time: string;
    end_time: string;
    group_id?: string;
    employee_ids?: string[];
  },
): Promise<Candidate[] | null> {
  const { data, error } = await ctx.supabase.rpc("open_shift_candidates", {
    p_date: p.date,
    p_start: p.start_time,
    p_end: p.end_time,
    p_group: p.group_id,
    p_employees: p.employee_ids?.length ? p.employee_ids : undefined,
  });
  if (error) return null;
  return (data ?? []) as Candidate[];
}

function candidateText(list: Candidate[]) {
  const free = list.filter((c) => c.available).map((c) => c.name);
  const out = list
    .filter((c) => !c.available)
    .map((c) => `${c.name} (${LEFT_OUT[c.reason ?? ""] ?? "not available"})`);
  return { free, out };
}

async function checkOpenShift(ctx: ToolContext, input: Record<string, unknown>) {
  if (!ctx.canPlanShifts)
    return fail(
      "This person can't plan shifts. HR can, and line managers can if the company's Client Admin switches it on in Company settings.",
    );
  const parsed = ACTION_SCHEMAS.post_open_shift.safeParse(input);
  if (!parsed.success)
    return fail(
      `The details don't look right: ${parsed.error.issues.map((i) => i.message).join("; ")}.`,
    );
  const list = await openShiftCandidates(ctx, parsed.data);
  if (!list) return fail("Couldn't check that. The group id may be wrong: use list_shift_groups.");
  const { free, out } = candidateText(list);
  return {
    content: JSON.stringify({
      shift: shiftWhenFromParts(parsed.data.date, parsed.data.start_time, parsed.data.end_time),
      would_go_to: free,
      left_out: out,
    }),
  };
}

// ---------------------------------------------------------------- suggestions

/** A reason the suggestion can't be made, worded for the assistant to pass on. */
class Explain extends Error {}

/** Builds the confirm card's wording from the database, not from the assistant's own words. */
async function describe(ctx: ToolContext, kind: ActionKind, p: Record<string, unknown>) {
  const who = async (id: unknown) => {
    const person = typeof id === "string" ? await personName(ctx, id) : null;
    if (!person) throw new Error("person");
    return person;
  };
  switch (kind) {
    case "request_leave": {
      const person = await who(p.employee_id);
      const type = (await nameOf(ctx, "leave_types", p.leave_type_id as string)) ?? "Leave";
      return {
        subject: person.id,
        text: `Book ${type.toLowerCase()} for ${person.name}: ${dateRange(p.start_date as string, p.end_date as string, Boolean(p.half_day_start), Boolean(p.half_day_end))}.`,
      };
    }
    case "cancel_leave":
    case "decide_leave": {
      const { data: r } = await ctx.supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date, half_day_start, half_day_end, status")
        .eq("id", p.request_id as string)
        .maybeSingle();
      if (!r) throw new Error("request");
      const person = await who(r.employee_id);
      const dates = dateRange(r.start_date, r.end_date, r.half_day_start, r.half_day_end);
      if (kind === "cancel_leave")
        return { subject: person.id, text: `Cancel ${person.name}'s leave: ${dates}.` };
      return {
        subject: person.id,
        text: `${p.approve ? "Approve" : "Decline"} ${person.name}'s leave request: ${dates}.${p.note ? ` Note: "${p.note}"` : ""}`,
      };
    }
    case "record_sickness": {
      const person = await who(p.employee_id);
      return {
        subject: person.id,
        text: `Record ${person.name} as off sick: ${dateRange(p.start_date as string, p.end_date as string | undefined, Boolean(p.half_day_start), Boolean(p.half_day_end))}. No reason is recorded here.`,
      };
    }
    case "create_employee": {
      const [dept, loc, manager] = await Promise.all([
        nameOf(ctx, "departments", p.department_id as string | undefined),
        nameOf(ctx, "locations", p.location_id as string | undefined),
        p.manager_id ? who(p.manager_id) : null,
      ]);
      const parts = [
        p.job_title as string | undefined,
        dept && `${dept} department`,
        loc,
        manager && `reports to ${manager.name}`,
        `${CONTRACT_TYPES[p.contract_type as keyof typeof CONTRACT_TYPES].toLowerCase()} contract`,
        `starts ${ukDate(p.start_date as string)}`,
      ].filter(Boolean);
      return {
        subject: null,
        text: `Add a new employee: ${p.first_name} ${p.last_name}, ${parts.join(", ")}.`,
      };
    }
    case "update_employee": {
      const person = await who(p.employee_id);
      const [dept, loc, manager] = await Promise.all([
        nameOf(ctx, "departments", p.department_id as string | undefined),
        nameOf(ctx, "locations", p.location_id as string | undefined),
        p.manager_id ? who(p.manager_id) : null,
      ]);
      const changes = [
        p.job_title && `job title to "${p.job_title}"`,
        dept && `department to ${dept}`,
        loc && `location to ${loc}`,
        manager && `manager to ${manager.name}`,
      ].filter(Boolean);
      return { subject: person.id, text: `Change ${person.name}'s ${changes.join(", ")}.` };
    }
    case "start_checklist": {
      const person = await who(p.employee_id);
      const template = await nameOf(ctx, "checklist_templates", p.template_id as string);
      if (!template) throw new Error("template");
      return {
        subject: person.id,
        text: `Start the "${template}" checklist for ${person.name}, counting from ${ukDate(p.anchor_date as string)}.`,
      };
    }
    case "remember":
      return { subject: null, text: `Remember for everyone in the company: "${p.note}"` };
    case "create_shift": {
      const person = await who(p.employee_id);
      const loc = await nameOf(ctx, "locations", p.location_id as string | undefined);
      const extra = [p.role_label as string | undefined, loc].filter(Boolean).join(", ");
      return {
        subject: person.id,
        text: `Put ${person.name} on the rota: ${shiftWhenFromParts(p.date as string, p.start_time as string, p.end_time as string)}${extra ? `, ${extra}` : ""}.${p.allow_short_rest ? " Allows a rest break shorter than 11 hours." : ""}`,
      };
    }
    case "cancel_shift": {
      const { data: s } = await ctx.supabase
        .from("shifts")
        .select("employee_id, starts_at, ends_at, status")
        .eq("id", p.shift_id as string)
        .maybeSingle();
      if (!s) throw new Error("shift");
      if (s.status === "cancelled") throw new Explain("That shift is already cancelled.");
      const when = shiftWhen(s.starts_at, s.ends_at);
      if (!s.employee_id) return { subject: null, text: `Cancel the open shift: ${when}.` };
      const person = await who(s.employee_id);
      return {
        subject: person.id,
        text: `Cancel ${person.name}'s shift: ${when}. They'll get an email.`,
      };
    }
    case "post_open_shift": {
      const list = await openShiftCandidates(ctx, p as never);
      if (!list) throw new Error("group");
      const { free, out } = candidateText(list);
      if (!free.length)
        throw new Explain(
          `Nobody chosen is free for that shift, so it can't be posted.${out.length ? ` Left out: ${out.join("; ")}.` : ""} Suggest other people or another time.`,
        );
      const group = p.group_id
        ? (
            await ctx.supabase
              .from("shift_groups")
              .select("name")
              .eq("id", p.group_id as string)
              .maybeSingle()
          ).data?.name
        : null;
      const loc = await nameOf(ctx, "locations", p.location_id as string | undefined);
      const extra = [p.role_label as string | undefined, loc].filter(Boolean).join(", ");
      return {
        subject: null,
        text:
          `Post an open shift: ${shiftWhenFromParts(p.date as string, p.start_time as string, p.end_time as string)}${extra ? `, ${extra}` : ""}. ` +
          `Emailed to ${free.join(", ")}${group ? ` (free people in the "${group}" group${(p.employee_ids as string[]).length ? " and those named" : ""})` : ""}. The first to accept gets it.` +
          (out.length ? ` Not sent to ${out.join(", ")}.` : ""),
      };
    }
    case "add_to_shift_group": {
      const person = await who(p.employee_id);
      return {
        subject: person.id,
        text: `Add ${person.name} to the "${p.group_name}" open shift group, so they can be offered open shifts.`,
      };
    }
    case "remove_from_shift_group": {
      const person = await who(p.employee_id);
      const { data: g } = await ctx.supabase
        .from("shift_groups")
        .select("name")
        .eq("id", p.group_id as string)
        .maybeSingle();
      if (!g) throw new Error("group");
      return {
        subject: person.id,
        text: `Take ${person.name} out of the "${g.name}" open shift group.`,
      };
    }
    case "end_sickness": {
      const { data: a } = await ctx.supabase
        .from("sickness_absences")
        .select("employee_id, start_date, end_date")
        .eq("id", p.absence_id as string)
        .maybeSingle();
      if (!a) throw new Error("absence");
      if ((p.end_date as string) < a.start_date)
        throw new Explain("The return date can't be before the sickness started.");
      const person = await who(a.employee_id);
      return {
        subject: person.id,
        text: `Record that ${person.name}'s sickness absence ended: ${dateRange(a.start_date, p.end_date as string, false, Boolean(p.half_day_end))}.`,
      };
    }
    case "complete_checklist_task": {
      const { data: item } = await ctx.supabase
        .from("checklist_items")
        .select("employee_id, title, checklists(title)")
        .eq("id", p.item_id as string)
        .maybeSingle();
      if (!item) throw new Error("item");
      const person = await who(item.employee_id);
      return {
        subject: person.id,
        text: `Mark "${item.title}" as ${p.done ? "done" : "not done"} on ${person.name}'s ${item.checklists?.title ?? "checklist"}.`,
      };
    }
    case "adjust_holiday": {
      const person = await who(p.employee_id);
      const days = p.days as number;
      const n = Math.abs(days);
      return {
        subject: person.id,
        text: `${days > 0 ? "Add" : "Take away"} ${n} day${n === 1 ? "" : "s"} of holiday ${days > 0 ? "to" : "from"} ${person.name}'s allowance for this leave year. Reason: "${p.reason}"`,
      };
    }
    case "invite_to_portal": {
      const person = await who(p.employee_id);
      const { data: e } = await ctx.supabase
        .from("employees")
        .select("user_id, work_email")
        .eq("id", person.id)
        .maybeSingle();
      if (e?.user_id) throw new Explain(`${person.name} already has a portal login.`);
      if (!e?.work_email)
        throw new Explain(
          `${person.name} has no work email address on their record, so they can't be invited yet. HR can add one on their profile.`,
        );
      return {
        subject: person.id,
        text: `Give ${person.name} a portal login: they'll get an email at their work address to set a password, and start as an Employee.`,
      };
    }
    case "mark_leaver": {
      const person = await who(p.employee_id);
      return {
        subject: person.id,
        text: `Record ${person.name} as a leaver, last day of employment ${ukDate(p.end_date as string)}. Their portal login stays on until their access is switched off.`,
      };
    }
    case "change_role": {
      const person = await who(p.employee_id);
      const { data: e } = await ctx.supabase
        .from("employees")
        .select("user_id")
        .eq("id", person.id)
        .maybeSingle();
      if (!e?.user_id)
        throw new Explain(`${person.name} has no portal login yet. Invite them first.`);
      if (e.user_id === ctx.userId) throw new Explain("Nobody can change their own role.");
      const role = ROLES[p.role as keyof typeof ROLES];
      return {
        subject: person.id,
        text: p.active
          ? `Change ${person.name}'s portal role to ${role}.`
          : `Switch off ${person.name}'s portal access (they won't be able to sign in).`,
      };
    }
    case "add_department":
      return { subject: null, text: `Add a department called "${p.name}".` };
    case "add_location":
      return {
        subject: null,
        text: `Add a location called "${p.name}"${p.address ? `, at ${p.address}` : ""}.`,
      };
    case "start_review": {
      const person = await who(p.employee_id);
      return {
        subject: person.id,
        text: `Start a performance review for ${person.name}: "${p.title}". Their line manager will be the reviewer.`,
      };
    }
    case "publish_policy": {
      const { data: v } = await ctx.supabase
        .from("policy_versions")
        .select("version, published_at, policies(title)")
        .eq("id", p.version_id as string)
        .maybeSingle();
      if (!v) throw new Error("version");
      if (v.published_at) throw new Explain("That version is already published.");
      return {
        subject: null,
        text: `Publish version ${v.version} of "${v.policies?.title ?? "the policy"}" so staff can see it.${p.require_reack || v.version === 1 ? " Staff will be asked to read and acknowledge it." : " Staff won't be asked to acknowledge it again."}`,
      };
    }
  }
}

async function suggest(
  ctx: ToolContext,
  kind: ActionKind,
  toolUseId: string,
  input: unknown,
): Promise<ToolOutcome> {
  if (!allowedFor(kind, ctx))
    return fail(
      WHO_CAN[kind] === "planner" && ctx.isManager
        ? "Line managers can only plan shifts if the company's Client Admin switches it on in Company settings. Until then HR plans shifts."
        : WHO_CAN[kind] === "admin"
          ? "Only the company's Client Admin can do that. Tell the person to ask them."
          : "This person's role does not allow that change. Tell them who can do it (their manager or HR) instead.",
    );
  const parsed = ACTION_SCHEMAS[kind].safeParse(input);
  if (!parsed.success)
    return fail(
      `The details don't look right: ${parsed.error.issues.map((i) => i.message).join("; ")}.`,
    );
  const payload = parsed.data as Record<string, unknown>;
  if (kind === "remember" && looksPersonal(payload.note as string))
    return fail(
      "That looks like personal information about someone. Company notes are for general company knowledge only, so don't save it.",
    );

  let described: { subject: string | null; text: string };
  try {
    described = await describe(ctx, kind, payload);
  } catch (e) {
    if (e instanceof Explain) return fail(e.message);
    return fail(
      "One of the ids doesn't match anything this person can see. Look it up again with find_people, list_leave_requests, list_shifts, list_shift_groups or list_options.",
    );
  }

  const { data, error } = await ctx.supabase
    .from("assistant_actions")
    .insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      tool_use_id: toolUseId,
      kind,
      payload: payload as never,
      summary: described.text,
      subject_employee_id: described.subject,
    })
    .select("id")
    .single();
  if (error || !data) return fail("The suggestion could not be saved.");
  return {
    actionId: data.id,
    content: `Shown to the person as a card: "${described.text}" It has NOT been done. It happens only if they tap Confirm on the card (within 24 hours). Tell them briefly what you've suggested and that they need to confirm it.`,
  };
}

// ---------------------------------------------------------------- dispatcher

export async function runTool(
  ctx: ToolContext,
  name: string,
  toolUseId: string,
  input: unknown,
): Promise<ToolOutcome> {
  const args = (input ?? {}) as Record<string, string>;
  try {
    switch (name) {
      case "find_people":
        return await findPeople(ctx, args);
      case "get_employee":
        return await getEmployee(ctx, args as { employee_id: string });
      case "get_holiday_balance":
        return await getBalance(ctx, args as { employee_id: string });
      case "list_leave_requests":
        return await listLeave(ctx, args);
      case "who_is_off":
        if (!args.from || !args.to) return fail("Give both from and to dates.");
        return await whoIsOff(ctx, args as { from: string; to: string });
      case "get_bank_holidays":
        if (!args.from || !args.to) return fail("Give both from and to dates.");
        return await bankHolidays(ctx, args as { from: string; to: string; employee_id?: string });
      case "list_options":
        return await listOptions(ctx);
      case "list_shifts":
        if (!args.from || !args.to) return fail("Give both from and to dates.");
        return await listShifts(ctx, args as { from: string; to: string; employee_id?: string });
      case "list_shift_groups":
        return await listShiftGroups(ctx);
      case "check_open_shift":
        return await checkOpenShift(ctx, input as Record<string, unknown>);
      case "list_sickness":
        return await listSickness(ctx, args);
      case "list_checklist_tasks":
        return await listChecklistTasks(
          ctx,
          input as { employee_id?: string; include_done?: boolean },
        );
      case "list_portal_access":
        return await listPortalAccess(ctx, args);
      case "list_policies":
        return await listPolicies(ctx);
    }
    const kind = SUGGEST_TOOLS[name];
    if (kind && isActionKind(kind)) return await suggest(ctx, kind, toolUseId, input);
    return fail(`There is no tool called ${name}.`);
  } catch {
    return fail("That lookup failed. Try again, or ask the person to use the normal page.");
  }
}
