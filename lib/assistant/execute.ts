import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ACTION_SCHEMAS, isActionKind, type ActionPayload } from "@/lib/assistant/schemas";
import { leaveError } from "@/lib/leave-errors";

type Db = SupabaseClient<Database>;

export type ExecResult = { ok: boolean; message: string; entityId?: string; link?: string };

const DENIED = "You don't have permission to make that change.";

// Uses the portal's own friendly messages; database wording (which can contain personal data)
// is never shown or logged.
function dbMessage(error: { code?: string } | null, context: string) {
  if (!error) return "Something went wrong.";
  if (error.code === "42501") return DENIED;
  return leaveError(error, `assistant.${context}`).error;
}

/**
 * Carries out a confirmed suggestion as the signed-in person, through the same database
 * functions and Row Level Security as the portal's own forms. The payload is checked again
 * here, so nothing stored can bypass the rules.
 */
export async function executeAction(
  supabase: Db,
  tenantId: string,
  userId: string,
  kind: string,
  rawPayload: unknown,
): Promise<ExecResult> {
  if (!isActionKind(kind)) return { ok: false, message: "Unknown kind of change." };
  const parsed = ACTION_SCHEMAS[kind].safeParse(rawPayload);
  if (!parsed.success)
    return { ok: false, message: "The suggestion's details are no longer valid." };

  switch (kind) {
    case "request_leave": {
      const p = parsed.data as ActionPayload<"request_leave">;
      const { data, error } = await supabase.rpc("request_leave", {
        p_employee: p.employee_id,
        p_leave_type: p.leave_type_id,
        p_start: p.start_date,
        p_end: p.end_date,
        p_half_start: p.half_day_start,
        p_half_end: p.half_day_end,
        p_note: p.note,
      });
      if (error) return { ok: false, message: dbMessage(error, "request_leave") };
      return { ok: true, message: "Leave requested.", entityId: data ?? undefined, link: "/leave" };
    }
    case "cancel_leave": {
      const p = parsed.data as ActionPayload<"cancel_leave">;
      const { error } = await supabase.rpc("cancel_leave", { p_request: p.request_id });
      if (error) return { ok: false, message: dbMessage(error, "cancel_leave") };
      return { ok: true, message: "Leave cancelled.", entityId: p.request_id, link: "/leave" };
    }
    case "decide_leave": {
      const p = parsed.data as ActionPayload<"decide_leave">;
      const { error } = await supabase.rpc("decide_leave", {
        p_request: p.request_id,
        p_approve: p.approve,
        p_note: p.note,
      });
      if (error) return { ok: false, message: dbMessage(error, "decide_leave") };
      return {
        ok: true,
        message: p.approve ? "Approved." : "Declined.",
        entityId: p.request_id,
        link: "/leave/approvals",
      };
    }
    case "record_sickness": {
      const p = parsed.data as ActionPayload<"record_sickness">;
      const { data, error } = await supabase.rpc("record_sickness", {
        p_employee: p.employee_id,
        p_start: p.start_date,
        p_end: p.end_date,
        p_half_start: p.half_day_start,
        p_half_end: p.half_day_end,
      });
      if (error) return { ok: false, message: dbMessage(error, "record_sickness") };
      return {
        ok: true,
        message: "Sickness recorded. HR can add the reason on the Sickness page if needed.",
        entityId: data ?? undefined,
        link: data ? `/sickness/${data}` : "/sickness",
      };
    }
    case "create_employee": {
      const p = parsed.data as ActionPayload<"create_employee">;
      const { data, error } = await supabase
        .from("employees")
        .insert({
          ...p,
          tenant_id: tenantId,
          status: p.start_date > new Date().toISOString().slice(0, 10) ? "pre_start" : "active",
        })
        .select("id")
        .single();
      if (error) return { ok: false, message: dbMessage(error, "create_employee") };
      return {
        ok: true,
        message: "Employee added.",
        entityId: data.id,
        link: `/employees/${data.id}`,
      };
    }
    case "update_employee": {
      const { employee_id, ...changes } = parsed.data as ActionPayload<"update_employee">;
      const { data, error } = await supabase
        .from("employees")
        .update(changes)
        .eq("id", employee_id)
        .select("id");
      if (error) return { ok: false, message: dbMessage(error, "update_employee") };
      if (!data?.length) return { ok: false, message: DENIED };
      return {
        ok: true,
        message: "Record updated.",
        entityId: employee_id,
        link: `/employees/${employee_id}`,
      };
    }
    case "start_checklist": {
      const p = parsed.data as ActionPayload<"start_checklist">;
      const { data, error } = await supabase.rpc("start_checklist", {
        p_employee: p.employee_id,
        p_template: p.template_id,
        p_anchor: p.anchor_date,
      });
      if (error) return { ok: false, message: dbMessage(error, "start_checklist") };
      return {
        ok: true,
        message: "Checklist started.",
        entityId: data ?? undefined,
        link: data ? `/checklists/${data}` : "/checklists",
      };
    }
    case "remember": {
      const p = parsed.data as ActionPayload<"remember">;
      const { data, error } = await supabase
        .from("assistant_memories")
        .insert({ tenant_id: tenantId, note: p.note, created_by: userId })
        .select("id")
        .single();
      if (error) return { ok: false, message: dbMessage(error, "remember") };
      return {
        ok: true,
        message: "Saved to company notes.",
        entityId: data.id,
        link: "/assistant/notes",
      };
    }
  }
}
