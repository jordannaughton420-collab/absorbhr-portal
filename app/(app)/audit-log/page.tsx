import type { Metadata } from "next";
import { requireClientAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Audit log · AbsorbHR Portal" };

const ENTITY_LABELS: Record<string, string> = {
  employees: "Employee record",
  employee_personal: "Personal details",
  emergency_contacts: "Emergency contact",
  employment_history: "Employment history",
  salary_history: "Salary",
  right_to_work_checks: "Right-to-work check",
  employee_sensitive: "Special category data",
  memberships: "Portal access",
  tenants: "Company",
  tenant_settings: "Company settings",
  departments: "Department",
  locations: "Location",
  privacy_notices: "Privacy notice",
  support_sessions: "AbsorbHR support session",
  auth: "Sign-in",
  leave_requests: "Leave request",
  leave_adjustments: "Holiday adjustment",
  leave_types: "Leave type",
  holiday_policies: "Holiday rules",
  sickness_absences: "Sickness record",
  sickness_details: "Sickness reason (health data)",
  return_to_work_forms: "Return-to-work form (health data)",
  documents: "Document",
  policies: "Policy",
  policy_versions: "Policy version",
  policy_acknowledgements: "Policy acknowledgement",
  checklist_templates: "Checklist template",
  checklist_template_items: "Checklist template task",
  checklists: "Checklist",
  checklist_items: "Checklist task",
  review_cycles: "Review cycle",
  performance_reviews: "Performance review",
  one_to_one_notes: "1-to-1 notes",
  cases: "Disciplinary/grievance case",
  case_events: "Case timeline entry",
  rectification_requests: "Correction request",
  sar: "Subject access export (data)",
  sar_exports: "Subject access export (file)",
  data_breaches: "Breach log",
  report: "Report",
  erasure_log: "Erasure",
};

const ACTION_VARIANT: Record<string, "default" | "muted" | "warning" | "destructive" | "success"> =
  {
    create: "success",
    update: "default",
    delete: "destructive",
    view: "muted",
    export: "warning",
    support_start: "warning",
    support_end: "warning",
  };

export default async function AuditLogPage() {
  await requireClientAdmin();
  const supabase = await createClient();
  const [{ data: entries }, { data: people }, { data: members }] = await Promise.all([
    supabase
      .from("audit_log")
      .select(
        "id, occurred_at, actor_user_id, actor_kind, action, entity, subject_employee_id, changed_fields",
      )
      .order("occurred_at", { ascending: false })
      .limit(300),
    supabase.from("employees").select("id, user_id, first_name, preferred_name, last_name"),
    supabase.from("memberships").select("user_id, role"),
  ]);
  // Portal users without an employee record (e.g. an outside administrator).
  const memberRoles = new Map((members ?? []).map((m) => [m.user_id, m.role]));
  const byUser = new Map(
    (people ?? [])
      .filter((p) => p.user_id)
      .map((p) => [p.user_id!, `${p.preferred_name || p.first_name} ${p.last_name}`]),
  );
  const byEmployee = new Map(
    (people ?? []).map((p) => [p.id, `${p.preferred_name || p.first_name} ${p.last_name}`]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every view, change and export of personal data in your company. Entries can never be
          edited or deleted.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Latest 300 entries</CardTitle>
          <CardDescription>
            Changed field names are recorded, never the values themselves.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>What</Th>
                <Th className="hidden md:table-cell">About</Th>
                <Th className="hidden lg:table-cell">Fields</Th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(e.occurred_at)}</Td>
                  <Td>
                    {e.actor_kind === "support"
                      ? "AbsorbHR support"
                      : e.actor_kind === "system"
                        ? "System"
                        : (byUser.get(e.actor_user_id ?? "") ??
                          (memberRoles.has(e.actor_user_id ?? "")
                            ? "Portal user (no employee record)"
                            : "AbsorbHR / removed user"))}
                  </Td>
                  <Td>
                    <Badge variant={ACTION_VARIANT[e.action] ?? "muted"}>
                      {e.action.replace("_", " ")}
                    </Badge>
                  </Td>
                  <Td>{ENTITY_LABELS[e.entity] ?? e.entity}</Td>
                  <Td className="hidden md:table-cell">
                    {e.subject_employee_id
                      ? (byEmployee.get(e.subject_employee_id) ?? "Removed person")
                      : ""}
                  </Td>
                  <Td className="hidden max-w-64 truncate text-muted-foreground lg:table-cell">
                    {e.changed_fields?.join(", ")}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
