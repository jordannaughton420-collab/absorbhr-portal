import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireHr } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatDate, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { liftHold, releaseSarExport } from "./actions";
import {
  AnonymiseForm,
  HoldForm,
  RetentionSettingsForm,
  SarDownloadButton,
  SarForm,
} from "./privacy-forms";

export const metadata: Metadata = { title: "Data protection · AbsorbHR Portal" };

const addMonth = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + 1);
  return x.toISOString().slice(0, 10);
};

export default async function PrivacyToolsPage() {
  const ctx = await requireHr();
  if (ctx.supportSession) redirect("/dashboard"); // never available to AbsorbHR support sessions
  const supabase = await createClient();
  const [
    { data: exports },
    { data: due },
    { data: directory },
    { data: leavers },
    { data: erasures },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("sar_exports")
      .select(
        "id, employee_id, request_received_on, created_at, status, needs_redaction_review, released_at, expires_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("retention_due"),
    supabase
      .from("employees")
      .select("id, first_name, preferred_name, last_name, status, anonymised_at")
      .order("last_name"),
    supabase
      .from("employees")
      .select("id")
      .in("status", ["leaver", "pre_start"])
      .is("anonymised_at", null),
    supabase
      .from("erasure_log")
      .select("id, employee_id, performed_at, early")
      .order("performed_at", { ascending: false })
      .limit(20),
    supabase.from("tenant_settings").select("retention_years").maybeSingle(),
  ]);
  const names = new Map(
    (directory ?? []).map((d) => [
      d.id,
      d.anonymised_at ? "Anonymised record" : `${d.preferred_name || d.first_name} ${d.last_name}`,
    ]),
  );
  const people = (directory ?? [])
    .filter((d) => !d.anonymised_at && d.id !== ctx.employeeId)
    .map((d) => ({ id: d.id, name: names.get(d.id)! }));
  const leaverIds = new Set((leavers ?? []).map((l) => l.id));
  const earlyCandidates = people.filter((p) => leaverIds.has(p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data protection</h1>
        <p className="text-sm text-muted-foreground">
          Subject access requests, retention and erasure. HR only. Everything here is recorded in
          the audit log.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subject access requests</CardTitle>
          <CardDescription>
            Builds a ZIP of everything held about one person: a readable PDF summary, the full data,
            and copies of their documents. Check it before sending — redact other people&apos;s
            personal data (for example witnesses in a case). Exports are deleted automatically after
            30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SarForm people={people} />
          {exports?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th className="hidden md:table-cell">Received</Th>
                  <Th>Reply due</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {exports.map((e) => {
                  const replyBy = addMonth(e.request_received_on);
                  const left = daysUntil(replyBy);
                  const name = names.get(e.employee_id) ?? "Person";
                  return (
                    <tr key={e.id}>
                      <Td>
                        {name}
                        {e.needs_redaction_review && e.status === "review" && (
                          <span className="mt-1 block text-xs font-medium text-warning">
                            Contains case records or private notes — check before sending
                          </span>
                        )}
                      </Td>
                      <Td className="hidden md:table-cell">{formatDate(e.request_received_on)}</Td>
                      <Td>
                        {e.status === "released" ? (
                          formatDate(replyBy)
                        ) : (
                          <span className={left < 7 ? "font-medium text-destructive" : undefined}>
                            {formatDate(replyBy)} {left >= 0 ? `(${left} days)` : "(overdue)"}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {e.status === "review" && <Badge variant="warning">Checking</Badge>}
                        {e.status === "released" && (
                          <Badge variant="success">Sent {formatDate(e.released_at)}</Badge>
                        )}
                        {e.status === "expired" && <Badge variant="muted">File deleted</Badge>}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap justify-end gap-2">
                          {e.status !== "expired" && <SarDownloadButton id={e.id} label={name} />}
                          {e.status === "review" && (
                            <form action={releaseSarExport}>
                              <input type="hidden" name="id" value={e.id} />
                              <Button type="submit" size="sm" aria-label={`Mark as sent: ${name}`}>
                                Mark as sent
                              </Button>
                            </form>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No exports yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retention review</CardTitle>
          <CardDescription>
            Leavers whose records reach the end of the {settings?.retention_years ?? 6}-year
            retention period (counted from their leaving date). Check nothing needs keeping — for
            example a live tribunal or insurance claim — then anonymise, or put the record on hold.
            Records due in the next 60 days are shown too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {due?.length ? (
            <ul className="divide-y">
              {due.map((d) => (
                <li key={d.employee_id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      <Link
                        href={`/employees/${d.employee_id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {d.name}
                      </Link>
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {d.department ? `${d.department} · ` : ""}left {formatDate(d.end_date)}
                      </span>
                    </p>
                    {d.hold_reason ? (
                      <Badge variant="warning">On hold</Badge>
                    ) : d.is_due ? (
                      <Badge variant="destructive">Due {formatDate(d.due_on)}</Badge>
                    ) : (
                      <Badge variant="muted">Due {formatDate(d.due_on)}</Badge>
                    )}
                  </div>
                  {d.hold_reason ? (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span>
                        <span className="font-medium">Hold reason:</span> {d.hold_reason}
                      </span>
                      <form action={liftHold}>
                        <input type="hidden" name="employee_id" value={d.employee_id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          aria-label={`Lift hold: ${d.name}`}
                        >
                          Lift hold
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <details className="rounded-lg border p-4">
                        <summary className="cursor-pointer text-sm font-medium text-primary">
                          Keep this record (hold)
                        </summary>
                        <div className="mt-4">
                          <HoldForm employeeId={d.employee_id} />
                        </div>
                      </details>
                      {d.is_due && (
                        <details className="rounded-lg border border-destructive/40 p-4">
                          <summary className="cursor-pointer text-sm font-medium text-destructive">
                            Anonymise now
                          </summary>
                          <div className="mt-4">
                            <AnonymiseForm employeeId={d.employee_id} early={false} />
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nobody is due. You&apos;ll be emailed when someone is.
            </p>
          )}
        </CardContent>
      </Card>

      {ctx.isClientAdmin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Retention period</CardTitle>
              <CardDescription>
                Applies to every leaver&apos;s records in your company.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RetentionSettingsForm years={settings?.retention_years ?? 6} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Erase a record early</CardTitle>
              <CardDescription>
                Only when you have decided to uphold an erasure request (UK GDPR Article 17) and
                there&apos;s no legal reason to keep the data — or for someone who never started.
                Client Admins only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {earlyCandidates.length ? (
                <AnonymiseForm people={earlyCandidates} early />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only leavers and people who never started can be erased.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Erasure log</CardTitle>
          <CardDescription>
            Records anonymised in this company. Kept as evidence; contains no personal data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {erasures?.length ? (
            <ul className="divide-y text-sm">
              {erasures.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 py-2">
                  <span>{formatDateTime(e.performed_at)}</span>
                  <span className="text-muted-foreground">
                    {e.early ? "Early erasure (Article 17)" : "End of retention period"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing anonymised yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
