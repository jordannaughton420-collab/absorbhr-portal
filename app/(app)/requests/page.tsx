import type { Metadata } from "next";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { RECTIFICATION_AREAS } from "@/lib/validation/people";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { RectificationForm, ResolveForm } from "./request-forms";

export const metadata: Metadata = { title: "Correction requests · AbsorbHR Portal" };

type Area = keyof typeof RECTIFICATION_AREAS;
const STATUS = {
  open: { label: "Waiting for HR", variant: "warning" },
  resolved: { label: "Corrected", variant: "success" },
  declined: { label: "Not changed", variant: "muted" },
} as const;

export default async function RequestsPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  // RLS: employees see their own requests; HR sees everyone's in the company.
  const [{ data: requests }, { data: directory }] = await Promise.all([
    supabase
      .from("rectification_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    ctx.isHr
      ? supabase.from("employee_directory").select("id, first_name, preferred_name, last_name")
      : Promise.resolve({ data: null }),
  ]);
  const names = new Map(
    (directory ?? []).map((d) => [d.id!, `${d.preferred_name || d.first_name} ${d.last_name}`]),
  );
  const own = (requests ?? []).filter((r) => r.employee_id === ctx.employeeId);
  const inbox = ctx.isHr ? (requests ?? []).filter((r) => r.employee_id !== ctx.employeeId) : [];
  const open = inbox.filter((r) => r.status === "open");

  const Item = ({
    r,
    showName,
    children,
  }: {
    r: NonNullable<typeof requests>[number];
    showName: boolean;
    children?: React.ReactNode;
  }) => (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {showName && <span>{names.get(r.employee_id) ?? "Employee"} · </span>}
          {RECTIFICATION_AREAS[r.area as Area]}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {formatDate(r.created_at)}
          </span>
        </p>
        <Badge variant={STATUS[r.status as keyof typeof STATUS].variant}>
          {STATUS[r.status as keyof typeof STATUS].label}
        </Badge>
      </div>
      <p className="whitespace-pre-line text-sm">{r.details}</p>
      {r.resolution_note && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">HR reply:</span> {r.resolution_note}
        </p>
      )}
      {children}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Correction requests</h1>
        <p className="text-sm text-muted-foreground">
          You have the right to have inaccurate personal data corrected (UK GDPR Article 16).
        </p>
      </div>

      {ctx.isHr && (
        <Card>
          <CardHeader>
            <CardTitle>
              {open.length ? `${open.length} waiting for a reply` : "No requests waiting"}
            </CardTitle>
            <CardDescription>
              Reply within one month. Correct the record first, then reply here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inbox.length ? (
              <ul className="divide-y">
                {inbox.map((r) => (
                  <Item key={r.id} r={r} showName>
                    {r.status === "open" && (
                      <div className="pt-2">
                        <ResolveForm id={r.id} />
                      </div>
                    )}
                  </Item>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nobody has asked for a correction yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {ctx.employeeId && !ctx.supportSession && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ask HR to correct something</CardTitle>
              <CardDescription>
                You can update your own contact details and emergency contacts on your profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RectificationForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>My requests</CardTitle>
            </CardHeader>
            <CardContent>
              {own.length ? (
                <ul className="divide-y">
                  {own.map((r) => (
                    <Item key={r.id} r={r} showName={false} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
