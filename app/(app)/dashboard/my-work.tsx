import Link from "next/link";
import type { SessionContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/data/leave";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Todo = { key: string; href: string; label: string; detail?: string; overdue?: boolean };

const fmt = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));

// Self-service summary: everything waiting for the signed-in person, across every module.
export async function MyWork({ ctx }: { ctx: SessionContext }) {
  if (!ctx.tenantId || ctx.supportSession) return null;
  const supabase = await createClient();
  const me = ctx.employeeId;
  const isManager = ctx.role === "line_manager" || ctx.isHr;
  const today = new Date().toISOString().slice(0, 10);

  const [
    balance,
    { data: policies },
    { data: items },
    { data: reports },
    { data: myReviews },
    { data: teamReviews },
    { data: requests },
  ] = await Promise.all([
    me ? getBalance(me) : Promise.resolve(null),
    me ? supabase.rpc("my_policies") : Promise.resolve({ data: null }),
    supabase
      .from("checklist_items")
      .select("id, checklist_id, employee_id, title, assignee, due_date")
      .is("completed_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200),
    me
      ? supabase
          .from("employee_directory")
          .select("id, first_name, preferred_name, last_name")
          .eq("manager_id", me)
      : Promise.resolve({ data: null }),
    me ? supabase.rpc("my_reviews") : Promise.resolve({ data: null }),
    isManager && me
      ? supabase
          .from("performance_reviews")
          .select("id, employee_id, title, status, manager_signed_at")
          .neq("employee_id", me)
          .in("status", ["manager_review", "discussion"])
      : Promise.resolve({ data: null }),
    supabase.from("rectification_requests").select("id, employee_id, status").eq("status", "open"),
  ]);

  const reportNames = new Map(
    (reports ?? []).map((r) => [r.id!, `${r.preferred_name || r.first_name} ${r.last_name}`]),
  );
  const reportIds = new Set(reportNames.keys());
  const todos: Todo[] = [];

  for (const p of (policies ?? []).filter((p) => !p.acknowledged))
    todos.push({
      key: `p${p.policy_id}`,
      href: `/policies/${p.policy_id}`,
      label: `Read and acknowledge: ${p.title}`,
    });

  // Checklist tasks assigned to me: my own, my direct reports' (as manager), or HR's.
  const mine = (items ?? []).filter(
    (i) =>
      (i.assignee === "employee" && i.employee_id === me) ||
      (i.assignee === "manager" && reportIds.has(i.employee_id)) ||
      (i.assignee === "hr" && ctx.isHr),
  );
  for (const i of mine.slice(0, 8))
    todos.push({
      key: `c${i.id}`,
      href: `/checklists/${i.checklist_id}`,
      label: i.title,
      detail: i.due_date ? `Due ${formatDate(i.due_date)}` : undefined,
      overdue: Boolean(i.due_date && i.due_date < today),
    });
  if (mine.length > 8)
    todos.push({
      key: "c-more",
      href: "/checklists",
      label: `${mine.length - 8} more checklist tasks`,
    });

  for (const r of myReviews ?? []) {
    if (r.status === "self_assessment")
      todos.push({
        key: `r${r.id}`,
        href: `/reviews/${r.id}`,
        label: `Complete your self-assessment: ${r.title}`,
      });
    if (r.status === "discussion")
      todos.push({
        key: `r${r.id}`,
        href: `/reviews/${r.id}`,
        label: `Read and sign your review: ${r.title}`,
      });
  }
  for (const r of (teamReviews ?? []).filter((r) => reportIds.has(r.employee_id))) {
    if (r.status === "manager_review")
      todos.push({
        key: `t${r.id}`,
        href: `/reviews/${r.id}`,
        label: `Write ${reportNames.get(r.employee_id)}'s review: ${r.title}`,
      });
    if (r.status === "discussion" && !r.manager_signed_at)
      todos.push({
        key: `t${r.id}`,
        href: `/reviews/${r.id}`,
        label: `Sign off ${reportNames.get(r.employee_id)}'s review: ${r.title}`,
      });
  }

  const openRequests = (requests ?? []).filter((r) =>
    ctx.isHr ? r.employee_id !== me : r.employee_id === me,
  );
  if (openRequests.length)
    todos.push({
      key: "rect",
      href: "/requests",
      label: ctx.isHr
        ? `${openRequests.length} correction request${openRequests.length === 1 ? "" : "s"} to answer`
        : `${openRequests.length} correction request${openRequests.length === 1 ? "" : "s"} waiting for HR`,
    });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>My to-do list</CardTitle>
          <CardDescription>Things waiting for you across the portal.</CardDescription>
        </CardHeader>
        <CardContent>
          {todos.length ? (
            <ul className="divide-y text-sm">
              {todos.map((t) => (
                <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={t.href} className="text-primary underline-offset-4 hover:underline">
                    {t.label}
                  </Link>
                  {t.detail && (
                    <span
                      className={
                        t.overdue ? "font-medium text-destructive" : "text-muted-foreground"
                      }
                    >
                      {t.overdue ? `Overdue · ${t.detail}` : t.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
          )}
        </CardContent>
      </Card>
      {me && (
        <Card>
          <CardHeader>
            <CardTitle>My holiday</CardTitle>
            {balance?.policy_configured && (
              <CardDescription>
                Leave year {formatDate(balance.leave_year_start)} –{" "}
                {formatDate(balance.leave_year_end)}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {balance?.policy_configured ? (
              <>
                <p>
                  <span className="text-3xl font-semibold text-primary">
                    {fmt(balance.remaining)}
                  </span>{" "}
                  <span className="text-sm text-muted-foreground">days left</span>
                </p>
                {Number(balance.pending) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {fmt(balance.pending)} days waiting for approval
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your company hasn&apos;t confirmed its holiday rules yet.
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/leave" className="text-primary underline-offset-4 hover:underline">
                Book time off
              </Link>
              <Link
                href={`/employees/${me}#documents`}
                className="text-primary underline-offset-4 hover:underline"
              >
                My documents
              </Link>
              <Link href="/requests" className="text-primary underline-offset-4 hover:underline">
                Ask for a correction
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
