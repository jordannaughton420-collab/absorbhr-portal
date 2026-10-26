import Link from "next/link";
import type { SessionContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { describeDates, getBalance, getHolidayPolicy, STATUS_BADGE } from "@/lib/data/leave";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { LeaveBalance } from "@/components/app/leave-balance";
import { AdjustmentForm } from "@/app/(app)/leave/adjustment-form";

// Holiday and sickness summary on an employee's profile. Shown to the person,
// their direct line manager and HR; the database decides what each can read.
export async function AbsenceSection({
  employeeId,
  ctx,
  isSelf,
  isDirectManager,
}: {
  employeeId: string;
  ctx: SessionContext;
  isSelf: boolean;
  isDirectManager: boolean;
}) {
  if (!(isSelf || isDirectManager || ctx.isHr)) return null;
  const supabase = await createClient();
  const healthVisible = !ctx.supportSession; // support sessions never see sickness
  const [
    balance,
    policy,
    { data: requests },
    { data: adjustments },
    { data: sickness },
    { data: scores },
  ] = await Promise.all([
    getBalance(employeeId),
    getHolidayPolicy(),
    supabase
      .from("leave_requests")
      .select(
        "id, start_date, end_date, half_day_start, half_day_end, days, status, leave_types(name)",
      )
      .eq("employee_id", employeeId)
      .order("start_date", { ascending: false })
      .limit(8),
    supabase
      .from("leave_adjustments")
      .select("id, leave_year_start, kind, days, reason, expires_on")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(10),
    healthVisible
      ? supabase
          .from("sickness_absences")
          .select("id, start_date, end_date, exclude_from_triggers")
          .eq("employee_id", employeeId)
          .order("start_date", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: null }),
    healthVisible && !isSelf ? supabase.rpc("bradford_scores") : Promise.resolve({ data: null }),
  ]);
  const bradford = (scores ?? []).find((s) => s.employee_id === employeeId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Holiday and absence</CardTitle>
        <CardDescription>
          <Link
            href={isSelf ? "/leave" : "/calendar"}
            className="text-primary underline-offset-4 hover:underline"
          >
            {isSelf ? "Book time off" : "Open the team calendar"}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {balance && policy?.configured_at ? (
            <LeaveBalance
              balance={balance}
              bankHolidaysIncluded={policy.bank_holidays_in_allowance}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Holiday rules haven&apos;t been confirmed for this company yet.
            </p>
          )}
          {ctx.isHr && balance && (
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                Adjust holiday allowance
              </summary>
              <div className="mt-4 space-y-3">
                {(adjustments ?? []).length > 0 && (
                  <ul className="divide-y text-sm">
                    {adjustments!.map((a) => (
                      <li key={a.id} className="flex justify-between gap-3 py-1.5">
                        <span>
                          {a.reason}
                          <span className="block text-xs text-muted-foreground">
                            Leave year from {formatDate(a.leave_year_start)}
                            {a.expires_on ? ` · use by ${formatDate(a.expires_on)}` : ""}
                          </span>
                        </span>
                        <span className="font-medium tabular-nums">
                          {Number(a.days) > 0 ? "+" : ""}
                          {Number(a.days)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <AdjustmentForm employeeId={employeeId} leaveYearStart={balance.leave_year_start} />
              </div>
            </details>
          )}
        </div>

        <div className="space-y-5 text-sm">
          <section aria-labelledby="recent-leave">
            <h3 id="recent-leave" className="mb-2 font-semibold">
              Recent leave
            </h3>
            {requests?.length ? (
              <ul className="divide-y">
                {requests.map((r) => {
                  const b = STATUS_BADGE[r.status as keyof typeof STATUS_BADGE];
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                    >
                      <span>
                        {describeDates(r)} · {r.leave_types?.name} · {Number(r.days)}d
                      </span>
                      <Badge variant={b.variant}>{b.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">None yet.</p>
            )}
          </section>

          {healthVisible && (
            <section aria-labelledby="recent-sickness">
              <h3 id="recent-sickness" className="mb-2 font-semibold">
                Sickness
              </h3>
              {bradford && (
                <p className="mb-2 text-muted-foreground">
                  Bradford Factor (52 weeks):{" "}
                  <span className="font-semibold text-foreground">{Number(bradford.score)}</span> ·{" "}
                  {bradford.spells} spell{bradford.spells === 1 ? "" : "s"}, {Number(bradford.days)}{" "}
                  days
                </p>
              )}
              {sickness?.length ? (
                <ul className="divide-y">
                  {sickness.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2 py-1.5">
                      <Link
                        href={`/sickness/${s.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {formatDate(s.start_date)} –{" "}
                        {s.end_date ? formatDate(s.end_date) : "still off"}
                      </Link>
                      {s.exclude_from_triggers && <Badge variant="muted">Excluded</Badge>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No sickness recorded.</p>
              )}
            </section>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
