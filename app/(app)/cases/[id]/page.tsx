import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireHr } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { CASE_EVENTS, CASE_OUTCOMES, CASE_STATUSES, CASE_TYPES } from "@/lib/validation/people";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { DocumentUpload, DownloadButton } from "@/app/(app)/documents/document-widgets";
import { CaseEventForm, UpdateCaseForm } from "../case-forms";

export const metadata: Metadata = { title: "Case · AbsorbHR Portal" };

type CaseData = {
  id: string;
  employee_id: string;
  reference: string;
  case_type: keyof typeof CASE_TYPES;
  status: keyof typeof CASE_STATUSES;
  opened_on: string;
  closed_on: string | null;
  outcome: keyof typeof CASE_OUTCOMES | null;
  summary: string;
  events: {
    id: string;
    event_date: string;
    event_type: keyof typeof CASE_EVENTS;
    details: string;
    created_at: string;
  }[];
};

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHr();
  if (ctx.supportSession) redirect("/dashboard");
  const supabase = await createClient();
  // get_case() checks access, decrypts, and writes the view to the audit log in one step.
  const { data, error } = await supabase.rpc("get_case", { p_case: id });
  if (error || !data) notFound();
  const c = data as CaseData;
  const [{ data: person }, { data: docs }] = await Promise.all([
    supabase
      .from("employee_directory")
      .select("first_name, preferred_name, last_name")
      .eq("id", c.employee_id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, title, created_at")
      .eq("case_id", id)
      .eq("status", "available")
      .order("created_at"),
  ]);
  const name = person
    ? `${person.preferred_name || person.first_name} ${person.last_name}`
    : "Former employee";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cases" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Cases
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          <span className="font-mono">{c.reference}</span> · {name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="muted">{CASE_TYPES[c.case_type]}</Badge>
          <Badge variant={c.status === "closed" ? "muted" : "warning"}>
            {CASE_STATUSES[c.status]}
          </Badge>
          {c.outcome && <Badge>{CASE_OUTCOMES[c.outcome]}</Badge>}
          <Badge variant="muted">Opened {formatDate(c.opened_on)}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Case details</CardTitle>
          <CardDescription>Encrypted. Visible to HR only.</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateCaseForm
            caseId={c.id}
            values={{
              status: c.status,
              outcome: c.outcome,
              summary: c.summary,
              closed_on: c.closed_on,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {c.events.length ? (
            <ol className="space-y-4 border-l-2 border-primary/30 pl-4">
              {c.events.map((e) => (
                <li key={e.id}>
                  <p className="text-sm font-semibold">
                    {formatDate(e.event_date)} · {CASE_EVENTS[e.event_type]}
                  </p>
                  <p className="whitespace-pre-line text-sm">{e.details}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          )}
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              Add to the timeline
            </summary>
            <div className="mt-4">
              <CaseEventForm caseId={c.id} />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Case documents</CardTitle>
          <CardDescription>
            Invitation letters, statements, notes and outcome letters. HR only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {docs?.length ? (
            <ul className="divide-y rounded-lg border">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-sm">
                    <span className="font-medium">{d.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(d.created_at)}
                    </span>
                  </span>
                  <DownloadButton id={d.id} label={d.title} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          )}
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              Upload a case document
            </summary>
            <div className="mt-4">
              <DocumentUpload
                employeeId={c.employee_id}
                caseId={c.id}
                categories={["case_document"]}
                visibilities={["hr_only"]}
                defaultVisibility="hr_only"
              />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
