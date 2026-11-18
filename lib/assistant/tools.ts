import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CONTRACT_TYPES } from "@/lib/validation/employee";
import {
  ACTION_SCHEMAS,
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

// ---------------------------------------------------------------- suggestions

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
      "This person's role does not allow that change. Tell them who can do it (their manager or HR) instead.",
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
  } catch {
    return fail(
      "One of the ids doesn't match anything this person can see. Look it up again with find_people, list_leave_requests or list_options.",
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
    }
    const kind = SUGGEST_TOOLS[name];
    if (kind && isActionKind(kind)) return await suggest(ctx, kind, toolUseId, input);
    return fail(`There is no tool called ${name}.`);
  } catch {
    return fail("That lookup failed. Try again, or ask the person to use the normal page.");
  }
}
