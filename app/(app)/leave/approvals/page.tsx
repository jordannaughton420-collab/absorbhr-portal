import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { describeDates, getBalance } from "@/lib/data/leave";
import { Card, CardContent } from "@/components/ui/card";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Leave approvals · AbsorbHR Portal" };

export default async function ApprovalsPage() {
  const ctx = await requireContext();
  if (!ctx.isHr && ctx.role !== "line_manager") redirect("/dashboard");
  const supabase = await createClient();

  // RLS returns only requests this person may see; we then drop their own.
  const [{ data: pending }, { data: directory }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select(
        "id, employee_id, start_date, end_date, half_day_start, half_day_end, days, employee_note, created_at, leave_types(name, deducts_allowance)",
      )
      .eq("status", "pending")
      .order("start_date"),
    supabase
      .from("employee_directory")
      .select("id, first_name, preferred_name, last_name, manager_id"),
  ]);
  const people = new Map((directory ?? []).map((d) => [d.id!, d]));
  const name = (id: string) => {
    const p = people.get(id);
    return p ? `${p.preferred_name || p.first_name} ${p.last_name}` : "Unknown";
  };
  const requests = (pending ?? []).filter((r) => r.employee_id !== ctx.employeeId);

  const enriched = await Promise.all(
    requests.map(async (r) => {
      const [balance, { data: overlapping }] = await Promise.all([
        r.leave_types?.deducts_allowance
          ? getBalance(r.employee_id, r.start_date)
          : Promise.resolve(null),
        supabase.rpc("absence_calendar", { p_from: r.start_date, p_to: r.end_date }),
      ]);
      const managerId = people.get(r.employee_id)?.manager_id;
      const alsoOff = [
        ...new Set(
          (overlapping ?? [])
            .filter(
              (o) =>
                o.employee_id !== r.employee_id &&
                o.status !== "pending" &&
                people.get(o.employee_id)?.manager_id === managerId,
            )
            .map((o) => name(o.employee_id)),
        ),
      ];
      return { ...r, balance, alsoOff };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leave approvals</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.isHr ? "Requests across the company." : "Requests from your direct reports."} You
          can&apos;t approve your own requests.
        </p>
      </div>
      {enriched.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">Nothing waiting for you. 🎉</Card>
      )}
      <ul className="space-y-4">
        {enriched.map((r) => (
          <li key={r.id}>
            <Card>
              <CardContent className="grid gap-4 pt-5 md:grid-cols-[1.4fr_1fr]">
                <div className="space-y-1 text-sm">
                  <p className="text-base font-semibold">{name(r.employee_id)}</p>
                  <p>
                    <span className="font-medium">{r.leave_types?.name}</span> · {describeDates(r)}{" "}
                    ·{" "}
                    <span className="font-medium">
                      {Number(r.days)} day{Number(r.days) === 1 ? "" : "s"}
                    </span>
                  </p>
                  {r.balance && (
                    <p className="text-muted-foreground">
                      Holiday left before this request: {Number(r.balance.remaining)} days
                      {Number(r.days) > Number(r.balance.remaining) && (
                        <span className="font-medium text-destructive">
                          {" "}
                          — not enough to approve
                        </span>
                      )}
                    </p>
                  )}
                  {r.employee_note && (
                    <p className="italic text-muted-foreground">“{r.employee_note}”</p>
                  )}
                  <p className={r.alsoOff.length ? "text-warning" : "text-muted-foreground"}>
                    {r.alsoOff.length
                      ? `Also off in the team: ${r.alsoOff.join(", ")}`
                      : "Nobody else in the team is off then."}
                  </p>
                </div>
                <DecisionForm requestId={r.id} label={name(r.employee_id).split(" ")[0]} />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
