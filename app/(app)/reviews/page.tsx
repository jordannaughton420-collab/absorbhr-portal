import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { REVIEW_STATUS } from "@/lib/validation/people";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { closeCycle } from "./actions";
import { CycleForm, StartReviewForm } from "./review-forms";

export const metadata: Metadata = { title: "Reviews · AbsorbHR Portal" };

type Status = keyof typeof REVIEW_STATUS;
const VARIANT: Record<Status, "warning" | "default" | "success"> = {
  self_assessment: "warning",
  manager_review: "warning",
  discussion: "default",
  completed: "success",
};

export default async function ReviewsPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const isManager = ctx.isHr || ctx.role === "line_manager";
  const [{ data: mine }, { data: team }, { data: cycles }, { data: directory }, { data: visible }] =
    await Promise.all([
      ctx.employeeId && !ctx.supportSession
        ? supabase.rpc("my_reviews")
        : Promise.resolve({ data: null }),
      // RLS: HR sees all reviews in the company; managers their direct reports' (never their own).
      isManager
        ? supabase
            .from("performance_reviews")
            .select("id, employee_id, title, status, created_at")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: null }),
      ctx.isHr
        ? supabase.from("review_cycles").select("*").order("period_start", { ascending: false })
        : Promise.resolve({ data: null }),
      supabase
        .from("employee_directory")
        .select("id, first_name, preferred_name, last_name, manager_id")
        .order("last_name"),
      isManager
        ? supabase.from("employees").select("id").eq("status", "active")
        : Promise.resolve({ data: null }),
    ]);
  const names = new Map(
    (directory ?? []).map((d) => [d.id!, `${d.preferred_name || d.first_name} ${d.last_name}`]),
  );
  const visibleIds = new Set((visible ?? []).map((v) => v.id));
  const reviewable = (directory ?? [])
    .filter(
      (d) =>
        visibleIds.has(d.id!) &&
        d.id !== ctx.employeeId &&
        (ctx.isHr || d.manager_id === ctx.employeeId),
    )
    .map((d) => ({ id: d.id!, name: names.get(d.id!)! }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance reviews</h1>
        <p className="text-sm text-muted-foreground">
          Self-assessment, manager review, then both of you sign.
        </p>
      </div>

      {mine && (
        <Card>
          <CardHeader>
            <CardTitle>My reviews</CardTitle>
          </CardHeader>
          <CardContent>
            {mine.length ? (
              <ul className="divide-y">
                {mine.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <Link
                      href={`/reviews/${r.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {r.title}
                    </Link>
                    <Badge variant={VARIANT[r.status as Status]}>
                      {REVIEW_STATUS[r.status as Status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">You don&apos;t have any reviews yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {team && (
        <Card>
          <CardHeader>
            <CardTitle>{ctx.isHr ? "All reviews" : "My team's reviews"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {team.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Review</Th>
                    <Th className="hidden sm:table-cell">Started</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <Link
                          href={`/reviews/${r.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {names.get(r.employee_id) ?? "Former employee"}
                        </Link>
                      </Td>
                      <Td>{r.title}</Td>
                      <Td className="hidden sm:table-cell">{formatDate(r.created_at)}</Td>
                      <Td>
                        <Badge variant={VARIANT[r.status as Status]}>
                          {REVIEW_STATUS[r.status as Status]}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            )}
            {reviewable.length > 0 && (
              <details className="rounded-lg border p-4">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  Start a one-off review (e.g. probation)
                </summary>
                <div className="mt-4">
                  <StartReviewForm people={reviewable} />
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {cycles && (
        <Card>
          <CardHeader>
            <CardTitle>Review rounds</CardTitle>
            <CardDescription>
              Starting a round creates a review for everyone who has a line manager.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {cycles.length > 0 && (
              <ul className="divide-y">
                {cycles.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {formatDate(c.period_start)} – {formatDate(c.period_end)}
                        {c.self_due && ` · self-assessments due ${formatDate(c.self_due)}`}
                      </span>
                    </span>
                    {c.status === "open" ? (
                      <form action={closeCycle}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Close round
                        </Button>
                      </form>
                    ) : (
                      <Badge variant="muted">Closed</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                Start a new review round
              </summary>
              <div className="mt-4">
                <CycleForm />
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
