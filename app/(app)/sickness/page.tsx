import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Table, Td, Th } from "@/components/ui/table";
import { RecordSicknessForm } from "./sickness-forms";

export const metadata: Metadata = { title: "Sickness · AbsorbHR Portal" };

export default async function SicknessPage() {
  const ctx = await requireContext();
  if (ctx.supportSession) {
    return (
      <Alert variant="info">
        Sickness records are health data and are not available during AbsorbHR support sessions.
      </Alert>
    );
  }
  const supabase = await createClient();
  const isManager = ctx.isHr || ctx.role === "line_manager";
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

  // RLS returns only sickness records this person may see.
  const [{ data: absences }, { data: directory }, { data: scores }, { data: visible }] =
    await Promise.all([
      supabase
        .from("sickness_absences")
        .select("id, employee_id, start_date, end_date, exclude_from_triggers")
        .or(`end_date.is.null,start_date.gte.${since}`)
        .order("start_date", { ascending: false })
        .limit(200),
      supabase
        .from("employee_directory")
        .select("id, first_name, preferred_name, last_name, manager_id"),
      isManager ? supabase.rpc("bradford_scores") : Promise.resolve({ data: null }),
      supabase.from("employees").select("id").neq("status", "leaver"),
    ]);
  const names = new Map(
    (directory ?? []).map((d) => [d.id!, `${d.preferred_name || d.first_name} ${d.last_name}`]),
  );
  const visibleIds = new Set((visible ?? []).map((v) => v.id));
  // People this user can record sickness for: themself, direct reports, or everyone (HR).
  const people = (directory ?? [])
    .filter(
      (d) =>
        visibleIds.has(d.id!) &&
        (ctx.isHr || d.id === ctx.employeeId || d.manager_id === ctx.employeeId),
    )
    .map((d) => ({ id: d.id!, name: names.get(d.id!)! }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const open = (absences ?? []).filter((a) => !a.end_date);
  const recent = (absences ?? []).filter((a) => a.end_date);
  const topScores = (scores ?? [])
    .filter((s) => Number(s.score) > 0)
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 15);

  const List = ({ rows, empty }: { rows: typeof recent; empty: string }) =>
    rows.length ? (
      <Table>
        <thead>
          <tr>
            {isManager && <Th>Person</Th>}
            <Th>From</Th>
            <Th>To</Th>
            <Th className="hidden sm:table-cell">Triggers</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              {isManager && <Td>{names.get(a.employee_id) ?? "—"}</Td>}
              <Td>
                <Link
                  href={`/sickness/${a.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {formatDate(a.start_date)}
                </Link>
              </Td>
              <Td>
                {a.end_date ? formatDate(a.end_date) : <Badge variant="warning">Still off</Badge>}
              </Td>
              <Td className="hidden sm:table-cell">
                {a.exclude_from_triggers ? (
                  <Badge variant="muted">Excluded</Badge>
                ) : (
                  <span className="text-muted-foreground">Counted</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sickness</h1>
        <p className="text-sm text-muted-foreground">
          Sickness details are health information: only you, your line manager and HR can see them.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{isManager ? "Record sickness" : "Tell us you're off sick"}</CardTitle>
            {!isManager && (
              <CardDescription>
                Please also follow your company&apos;s usual call-in procedure.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <RecordSicknessForm people={people} selfId={ctx.employeeId} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Currently off sick</CardTitle>
          </CardHeader>
          <CardContent>
            <List rows={open} empty="Nobody is recorded as off sick right now." />
          </CardContent>
        </Card>
      </div>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle>Bradford Factor (last 52 weeks)</CardTitle>
            <CardDescription>
              Spells² × days lost. A prompt for a supportive conversation, not an automatic trigger
              — check for underlying health conditions or disability before taking any action.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topScores.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Spells</Th>
                    <Th>Days lost</Th>
                    <Th>Score</Th>
                  </tr>
                </thead>
                <tbody>
                  {topScores.map((s) => (
                    <tr key={s.employee_id}>
                      <Td>
                        <Link
                          href={`/employees/${s.employee_id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {names.get(s.employee_id) ?? "—"}
                        </Link>
                      </Td>
                      <Td className="tabular-nums">{s.spells}</Td>
                      <Td className="tabular-nums">{Number(s.days)}</Td>
                      <Td className="font-semibold tabular-nums">{Number(s.score)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No counted sickness in the last 52 weeks.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {isManager ? "Sickness in the last 12 months" : "My sickness in the last 12 months"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List rows={recent} empty="No sickness recorded." />
        </CardContent>
      </Card>
    </div>
  );
}
