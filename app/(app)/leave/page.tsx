import type { Metadata } from "next";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  describeDates,
  getBalance,
  getHolidayPolicy,
  getLeaveTypes,
  STATUS_BADGE,
} from "@/lib/data/leave";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { LeaveBalance } from "@/components/app/leave-balance";
import { LeaveRequestForm } from "./request-form";
import { cancelLeave } from "./actions";

export const metadata: Metadata = { title: "My leave · AbsorbHR Portal" };

export default async function LeavePage() {
  const ctx = await requireContext();
  if (!ctx.employeeId || ctx.supportSession) {
    return <p>Leave booking is for people with an employee record in this company.</p>;
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [balance, policy, types, { data: requests }] = await Promise.all([
    getBalance(ctx.employeeId),
    getHolidayPolicy(),
    getLeaveTypes(),
    supabase
      .from("leave_requests")
      .select(
        "id, start_date, end_date, half_day_start, half_day_end, days, status, decision_note, leave_types(name)",
      )
      .eq("employee_id", ctx.employeeId)
      .order("start_date", { ascending: false })
      .limit(50),
  ]);
  const configured = Boolean(policy?.configured_at);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My leave</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Holiday balance</CardTitle>
          </CardHeader>
          <CardContent>
            {balance && configured ? (
              <LeaveBalance
                balance={balance}
                bankHolidaysIncluded={policy!.bank_holidays_in_allowance}
              />
            ) : (
              <Alert variant="warning">
                Your company hasn&apos;t finished setting up its holiday rules, so holiday
                can&apos;t be booked yet. Other types of leave can still be requested.
              </Alert>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Request time off</CardTitle>
            <CardDescription>Your line manager will be asked to approve it.</CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveRequestForm
              employeeId={ctx.employeeId}
              types={types.filter((t) => configured || !t.deducts_allowance)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Dates</Th>
                  <Th>Type</Th>
                  <Th>Days</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const badge = STATUS_BADGE[r.status as keyof typeof STATUS_BADGE];
                  const cancellable =
                    r.status === "pending" || (r.status === "approved" && r.start_date > today);
                  return (
                    <tr key={r.id}>
                      <Td>{describeDates(r)}</Td>
                      <Td>{r.leave_types?.name}</Td>
                      <Td className="tabular-nums">{Number(r.days)}</Td>
                      <Td>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {r.decision_note && (
                          <p className="mt-1 text-xs text-muted-foreground">“{r.decision_note}”</p>
                        )}
                      </Td>
                      <Td className="text-right">
                        {cancellable && (
                          <form action={cancelLeave}>
                            <input type="hidden" name="request_id" value={r.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              aria-label={`Cancel request for ${describeDates(r)}`}
                            >
                              Cancel
                            </Button>
                          </form>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t requested any leave yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
