import Link from "next/link";
import type { SessionContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getBalance, getHolidayPolicy } from "@/lib/data/leave";
import { Card } from "@/components/ui/card";

// "At a glance" row: holiday left, approvals waiting, and who is away today.
export async function AbsenceToday({ ctx }: { ctx: SessionContext }) {
  if (!ctx.tenantId && !ctx.supportSession) return null;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const canApprove = ctx.isHr || ctx.role === "line_manager";
  const ownRecord = ctx.employeeId && !ctx.supportSession;

  const [
    balance,
    policy,
    { count: pending },
    { data: away },
    { data: directory },
    { data: policies },
  ] = await Promise.all([
    ownRecord ? getBalance(ctx.employeeId!) : Promise.resolve(null),
    getHolidayPolicy(),
    canApprove
      ? supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .neq("employee_id", ctx.employeeId ?? "00000000-0000-0000-0000-000000000000")
      : Promise.resolve({ count: null }),
    supabase.rpc("absence_calendar", { p_from: today, p_to: today }),
    supabase.from("employee_directory").select("id, first_name, preferred_name, last_name"),
    ownRecord ? supabase.rpc("my_policies") : Promise.resolve({ data: null }),
  ]);
  const toRead = (policies ?? []).filter((p) => !p.acknowledged).length;
  const names = new Map(
    (directory ?? []).map((d) => [d.id!, `${d.preferred_name || d.first_name} ${d.last_name}`]),
  );
  const offToday = (away ?? []).filter((a) => a.status !== "pending");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ownRecord && (
        <Link href="/leave" className="rounded-xl">
          <Card className="h-full p-5 hover:border-primary">
            <p className="text-sm text-muted-foreground">My holiday left</p>
            <p className="mt-1 text-3xl font-semibold text-primary">
              {balance && policy?.configured_at ? Number(balance.remaining) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {policy?.configured_at ? "days this leave year" : "Holiday rules not set up yet"}
            </p>
          </Card>
        </Link>
      )}
      {canApprove && (
        <Link href="/leave/approvals" className="rounded-xl">
          <Card className="h-full p-5 hover:border-primary">
            <p className="text-sm text-muted-foreground">Requests waiting for you</p>
            <p className="mt-1 text-3xl font-semibold text-primary">{pending ?? 0}</p>
            <p className="text-xs text-muted-foreground">leave requests to approve</p>
          </Card>
        </Link>
      )}
      {ownRecord && toRead > 0 && (
        <Link href="/policies" className="rounded-xl">
          <Card className="h-full border-warning/50 p-5 hover:border-primary">
            <p className="text-sm text-muted-foreground">Policies to read</p>
            <p className="mt-1 text-3xl font-semibold text-warning">{toRead}</p>
            <p className="text-xs text-muted-foreground">please read and confirm</p>
          </Card>
        </Link>
      )}
      <Link href="/calendar" className="rounded-xl">
        <Card className="h-full p-5 hover:border-primary">
          <p className="text-sm text-muted-foreground">Away today</p>
          {offToday.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {offToday.slice(0, 5).map((a) => (
                <li key={`${a.employee_id}-${a.kind}`}>
                  <span className="font-medium">{names.get(a.employee_id) ?? "Someone"}</span>{" "}
                  <span className="text-muted-foreground">· {a.label}</span>
                </li>
              ))}
              {offToday.length > 5 && (
                <li className="text-muted-foreground">and {offToday.length - 5} more</li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Everyone you can see is in today.</p>
          )}
        </Card>
      </Link>
    </div>
  );
}
