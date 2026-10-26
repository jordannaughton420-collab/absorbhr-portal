import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { EndSicknessForm, ExclusionForm, HealthDetails } from "../sickness-forms";

export const metadata: Metadata = { title: "Sickness record · AbsorbHR Portal" };

export default async function SicknessRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: abs } = await supabase
    .from("sickness_absences")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!abs) notFound();

  const [{ data: person }, { data: days }] = await Promise.all([
    supabase
      .from("employee_directory")
      .select("first_name, preferred_name, last_name")
      .eq("id", abs.employee_id)
      .maybeSingle(),
    supabase.rpc("count_leave_days", {
      p_employee: abs.employee_id,
      p_start: abs.start_date,
      p_end: abs.end_date ?? new Date().toISOString().slice(0, 10),
      p_half_start: abs.half_day_start,
      p_half_end: abs.half_day_end,
    }),
  ]);
  const isSelf = abs.employee_id === ctx.employeeId;
  const name = person
    ? `${person.preferred_name || person.first_name} ${person.last_name}`
    : "Employee";
  const end = abs.end_date ?? new Date().toISOString().slice(0, 10);
  const calendarDays = Math.round((Date.parse(end) - Date.parse(abs.start_date)) / 86_400_000) + 1;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/sickness" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Sickness
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {isSelf ? "My sickness record" : `Sickness: ${name}`}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {abs.end_date ? (
            <Badge variant="muted">Back at work</Badge>
          ) : (
            <Badge variant="warning">Still off</Badge>
          )}
          {abs.exclude_from_triggers && <Badge variant="muted">Excluded from triggers</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">First day off</dt>
              <dd className="font-medium">
                {formatDate(abs.start_date)}
                {abs.half_day_start ? " (part day)" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last day off</dt>
              <dd className="font-medium">
                {abs.end_date
                  ? `${formatDate(abs.end_date)}${abs.half_day_end ? " (part day)" : ""}`
                  : "Not back yet"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Working days lost{abs.end_date ? "" : " so far"}
              </dt>
              <dd className="font-medium">{days === null ? "—" : Number(days)}</dd>
            </div>
          </dl>
          {calendarDays > 7 && (
            <Alert variant="info">
              This absence is longer than 7 calendar days, so a fit note from a doctor is needed
              from day 8.
            </Alert>
          )}
          <details className="rounded-lg border p-4" open={!abs.end_date}>
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {abs.end_date ? "Correct the return date" : "Record that they're back"}
            </summary>
            <div className="mt-4">
              <EndSicknessForm absenceId={abs.id} startDate={abs.start_date} />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Health details</CardTitle>
          <CardDescription>
            Visible only to {isSelf ? "you" : name}, their line manager and HR.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HealthDetails absenceId={abs.id} canCompleteRtw={!isSelf} isSelf={isSelf} />
        </CardContent>
      </Card>

      {ctx.isHr && !isSelf && (
        <Card>
          <CardHeader>
            <CardTitle>Absence triggers</CardTitle>
          </CardHeader>
          <CardContent>
            <ExclusionForm absenceId={abs.id} current={abs.exclusion_basis} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
