import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ACTION_SCHEMAS, isActionKind, type ActionPayload } from "@/lib/assistant/schemas";
import { leaveError } from "@/lib/leave-errors";
import { shiftError } from "@/lib/shift-errors";
import { inviteToPortal } from "@/app/(app)/employees/actions";

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

function shiftMessage(error: { code?: string } | null, context: string) {
  if (!error) return "Something went wrong.";
  if (error.code === "42501") return DENIED;
  return shiftError(error, `assistant.${context}`).error;
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
    case "create_shift": {
      const p = parsed.data as ActionPayload<"create_shift">;
      const { data, error } = await supabase.rpc("create_shift", {
        p_employee: p.employee_id,
        p_date: p.date,
        p_start: p.start_time,
        p_end: p.end_time,
        p_role: p.role_label,
        p_location: p.location_id,
        p_notes: p.notes,
        p_allow_short_rest: p.allow_short_rest,
      });
      if (error) return { ok: false, message: shiftMessage(error, "create_shift") };
      return {
        ok: true,
        message: "Shift added to the rota.",
        entityId: data ?? undefined,
        link: "/rota",
      };
    }
    case "cancel_shift": {
      const p = parsed.data as ActionPayload<"cancel_shift">;
      const { error } = await supabase.rpc("cancel_shift", { p_shift: p.shift_id });
      if (error) return { ok: false, message: shiftMessage(error, "cancel_shift") };
      return { ok: true, message: "Shift cancelled.", entityId: p.shift_id, link: "/rota" };
    }
    case "post_open_shift": {
      const p = parsed.data as ActionPayload<"post_open_shift">;
      const { data, error } = await supabase.rpc("post_open_shift", {
        p_date: p.date,
        p_start: p.start_time,
        p_end: p.end_time,
        p_role: p.role_label,
        p_location: p.location_id,
        p_notes: p.notes,
        p_group: p.group_id,
        p_employees: p.employee_ids.length ? p.employee_ids : undefined,
      });
      if (error) return { ok: false, message: shiftMessage(error, "post_open_shift") };
      return {
        ok: true,
        message: "Open shift posted. Everyone free has been emailed; the first to accept gets it.",
        entityId: data ?? undefined,
        link: "/rota",
      };
    }
    case "add_to_shift_group": {
      const p = parsed.data as ActionPayload<"add_to_shift_group">;
      const { data, error } = await supabase.rpc("add_to_shift_group", {
        p_employee: p.employee_id,
        p_group_name: p.group_name,
      });
      if (error) return { ok: false, message: shiftMessage(error, "add_to_shift_group") };
      return {
        ok: true,
        message: "Added to the group.",
        entityId: data ?? undefined,
        link: "/rota",
      };
    }
    case "remove_from_shift_group": {
      const p = parsed.data as ActionPayload<"remove_from_shift_group">;
      const { error } = await supabase.rpc("remove_from_shift_group", {
        p_employee: p.employee_id,
        p_group: p.group_id,
      });
      if (error) return { ok: false, message: shiftMessage(error, "remove_from_shift_group") };
      return { ok: true, message: "Removed from the group.", entityId: p.group_id, link: "/rota" };
    }
    case "end_sickness": {
      const p = parsed.data as ActionPayload<"end_sickness">;
      const { error } = await supabase.rpc("end_sickness", {
        p_absence: p.absence_id,
        p_end: p.end_date,
        p_half_end: p.half_day_end,
      });
      if (error) return { ok: false, message: dbMessage(error, "end_sickness") };
      return {
        ok: true,
        message: "Return date saved.",
        entityId: p.absence_id,
        link: `/sickness/${p.absence_id}`,
      };
    }
    case "complete_checklist_task": {
      const p = parsed.data as ActionPayload<"complete_checklist_task">;
      const { error } = await supabase.rpc("set_checklist_item", {
        p_item: p.item_id,
        p_done: p.done,
      });
      if (error) return { ok: false, message: dbMessage(error, "complete_checklist_task") };
      return {
        ok: true,
        message: p.done ? "Task ticked off." : "Task marked as not done.",
        entityId: p.item_id,
        link: "/checklists",
      };
    }
    case "adjust_holiday": {
      const p = parsed.data as ActionPayload<"adjust_holiday">;
      const [{ data: balance }, { data: emp }] = await Promise.all([
        supabase.rpc("leave_balance", { p_employee: p.employee_id }).maybeSingle(),
        supabase.from("employees").select("tenant_id").eq("id", p.employee_id).maybeSingle(),
      ]);
      if (!balance || !emp) return { ok: false, message: DENIED };
      const { data, error } = await supabase
        .from("leave_adjustments")
        .insert({
          tenant_id: emp.tenant_id,
          employee_id: p.employee_id,
          leave_year_start: balance.leave_year_start,
          days: p.days,
          reason: p.reason,
          kind: "manual",
        })
        .select("id")
        .single();
      if (error) return { ok: false, message: dbMessage(error, "adjust_holiday") };
      return {
        ok: true,
        message: "Holiday allowance adjusted.",
        entityId: data.id,
        link: "/leave",
      };
    }
    case "invite_to_portal": {
      const p = parsed.data as ActionPayload<"invite_to_portal">;
      const fd = new FormData();
      fd.set("employee_id", p.employee_id);
      const res = await inviteToPortal(fd);
      return res.ok
        ? {
            ok: true,
            message: res.message ?? "Invitation sent.",
            entityId: p.employee_id,
            link: `/employees/${p.employee_id}`,
          }
        : { ok: false, message: res.error };
    }
    case "mark_leaver": {
      const p = parsed.data as ActionPayload<"mark_leaver">;
      const { data, error } = await supabase
        .from("employees")
        .update({ status: "leaver", end_date: p.end_date })
        .eq("id", p.employee_id)
        .select("id");
      if (error) return { ok: false, message: dbMessage(error, "mark_leaver") };
      if (!data?.length) return { ok: false, message: DENIED };
      return {
        ok: true,
        message: "Recorded as a leaver.",
        entityId: p.employee_id,
        link: `/employees/${p.employee_id}`,
      };
    }
    case "change_role": {
      const p = parsed.data as ActionPayload<"change_role">;
      const { data: emp } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", p.employee_id)
        .maybeSingle();
      if (!emp?.user_id) return { ok: false, message: "This person has no portal login yet." };
      if (emp.user_id === userId)
        return { ok: false, message: "Nobody can change their own role." };
      const { data, error } = await supabase
        .from("memberships")
        .update({ role: p.role, is_active: p.active })
        .eq("user_id", emp.user_id)
        .eq("tenant_id", tenantId)
        .select("id");
      if (error) return { ok: false, message: dbMessage(error, "change_role") };
      if (!data?.length) return { ok: false, message: DENIED };
      return {
        ok: true,
        message: p.active ? "Role updated." : "Portal access switched off.",
        entityId: p.employee_id,
        link: "/settings",
      };
    }
    case "add_department": {
      const p = parsed.data as ActionPayload<"add_department">;
      const { data, error } = await supabase
        .from("departments")
        .insert({ name: p.name, tenant_id: tenantId })
        .select("id")
        .single();
      if (error) return { ok: false, message: dbMessage(error, "add_department") };
      return { ok: true, message: "Department added.", entityId: data.id, link: "/settings" };
    }
    case "add_location": {
      const p = parsed.data as ActionPayload<"add_location">;
      const { data, error } = await supabase
        .from("locations")
        .insert({ name: p.name, address: p.address, tenant_id: tenantId })
        .select("id")
        .single();
      if (error) return { ok: false, message: dbMessage(error, "add_location") };
      return { ok: true, message: "Location added.", entityId: data.id, link: "/settings" };
    }
    case "start_review": {
      const p = parsed.data as ActionPayload<"start_review">;
      const { data, error } = await supabase.rpc("start_review", {
        p_employee: p.employee_id,
        p_title: p.title,
      });
      if (error) return { ok: false, message: dbMessage(error, "start_review") };
      return {
        ok: true,
        message: "Review started.",
        entityId: data ?? undefined,
        link: data ? `/reviews/${data}` : "/reviews",
      };
    }
    case "publish_policy": {
      const p = parsed.data as ActionPayload<"publish_policy">;
      const { error } = await supabase.rpc("publish_policy_version", {
        p_version: p.version_id,
        p_require_reack: p.require_reack,
      });
      if (error) return { ok: false, message: dbMessage(error, "publish_policy") };
      return { ok: true, message: "Policy published.", entityId: p.version_id, link: "/policies" };
    }
  }
}
