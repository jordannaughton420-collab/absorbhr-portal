import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireHr } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { CASE_OUTCOMES, CASE_STATUSES, CASE_TYPES } from "@/lib/validation/people";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Table, Td, Th } from "@/components/ui/table";
import { OpenCaseForm } from "./case-forms";

export const metadata: Metadata = { title: "Cases · AbsorbHR Portal" };

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const { employee } = await searchParams;
  const filter = employee && /^[0-9a-f-]{36}$/i.test(employee) ? employee : null;
  const ctx = await requireHr();
  if (ctx.supportSession) redirect("/dashboard"); // never available to AbsorbHR support sessions
  const supabase = await createClient();
  let casesQuery = supabase
    .from("cases")
    .select("id, employee_id, reference, case_type, status, opened_on, closed_on, outcome")
    .order("opened_on", { ascending: false });
  if (filter) casesQuery = casesQuery.eq("employee_id", filter);
  const [{ data: cases }, { data: directory }] = await Promise.all([
    casesQuery,
    supabase
      .from("employee_directory")
      .select("id, first_name, preferred_name, last_name")
      .order("last_name"),
  ]);
  await logEvent("view", "cases", {
    subjectEmployeeId: filter ?? undefined,
    metadata: { list: true },
  });
  const names = new Map(
    (directory ?? []).map((d) => [d.id!, `${d.preferred_name || d.first_name} ${d.last_name}`]),
  );
  const people = (directory ?? [])
    .filter((d) => d.id !== ctx.employeeId)
    .map((d) => ({ id: d.id!, name: names.get(d.id!)! }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Disciplinary and grievance cases</h1>
        <p className="text-sm text-muted-foreground">
          HR only. Line managers, the employee and AbsorbHR support can&apos;t see these, and you
          never see a case about yourself. Every visit is recorded in the audit log.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {filter ? `Cases about ${names.get(filter) ?? "this employee"}` : "Cases"}
          </CardTitle>
          {filter && (
            <Link href="/cases" className="text-sm text-primary underline-offset-4 hover:underline">
              Show all cases
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {cases?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Employee</Th>
                  <Th className="hidden sm:table-cell">Type</Th>
                  <Th>Stage</Th>
                  <Th className="hidden md:table-cell">Opened</Th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link
                        href={`/cases/${c.id}`}
                        className="font-mono font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {c.reference}
                      </Link>
                    </Td>
                    <Td>{names.get(c.employee_id) ?? "Former employee"}</Td>
                    <Td className="hidden sm:table-cell">
                      {CASE_TYPES[c.case_type as keyof typeof CASE_TYPES]}
                    </Td>
                    <Td>
                      <Badge variant={c.status === "closed" ? "muted" : "warning"}>
                        {CASE_STATUSES[c.status as keyof typeof CASE_STATUSES]}
                      </Badge>
                      {c.outcome && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {CASE_OUTCOMES[c.outcome as keyof typeof CASE_OUTCOMES]}
                        </span>
                      )}
                    </Td>
                    <Td className="hidden md:table-cell">{formatDate(c.opened_on)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No cases.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Open a case</CardTitle>
          <CardDescription>
            Follow your disciplinary or grievance procedure and the ACAS Code of Practice. AbsorbHR
            can advise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OpenCaseForm people={people} />
        </CardContent>
      </Card>
    </div>
  );
}
