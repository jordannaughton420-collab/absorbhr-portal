import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Balance } from "@/components/app/leave-balance";

export async function getBalance(employeeId: string, on?: string): Promise<Balance | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("leave_balance", { p_employee: employeeId, ...(on ? { p_on: on } : {}) })
    .maybeSingle();
  return (data as Balance | null) ?? null;
}

export async function getHolidayPolicy() {
  const supabase = await createClient();
  const { data } = await supabase.from("holiday_policies").select("*").maybeSingle();
  return data;
}

export async function getLeaveTypes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_types")
    .select("id, code, name, deducts_allowance, requires_approval, is_paid, active")
    .eq("active", true)
    .order("deducts_allowance", { ascending: false })
    .order("name");
  return data ?? [];
}

export const STATUS_BADGE = {
  pending: { label: "Waiting for approval", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  declined: { label: "Declined", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "muted" },
} as const;

export function describeDates(r: {
  start_date: string;
  end_date: string;
  half_day_start: boolean;
  half_day_end: boolean;
}) {
  const f = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const s = `${f(r.start_date)}${r.half_day_start ? " (pm)" : ""}`;
  if (r.start_date === r.end_date)
    return r.half_day_end && !r.half_day_start ? `${f(r.start_date)} (am)` : s;
  return `${s} – ${f(r.end_date)}${r.half_day_end ? " (am)" : ""}`;
}
