import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { logEvent } from "@/lib/audit";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";
import {
  CONTRACT_TYPES,
  EMPLOYMENT_STATUSES,
  RTW_CHECK_TYPES,
  RTW_STATUSES,
} from "@/lib/validation/employee";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { deleteEmergencyContact } from "../actions";
import { AbsenceSection } from "./absence-section";
import { DocumentsSection } from "./documents-section";
import { NotesSection } from "./notes-section";
import { DiversityForm } from "@/app/(app)/requests/request-forms";
import Link from "next/link";
import {
  EmergencyContactForm,
  EmployeeForm,
  InviteButton,
  PersonalForm,
  RtwForm,
  SalaryForm,
} from "../employee-forms";

export const metadata: Metadata = { title: "Employee · AbsorbHR Portal" };

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

// Only the plain columns the edit form needs (drops joined objects and arrays).
const NON_FORM_KEYS = new Set(["departments", "locations", "working_days"]);
function employeeFormValues(emp: { id: string } & Record<string, unknown>) {
  return Object.fromEntries(Object.entries(emp).filter(([k]) => !NON_FORM_KEYS.has(k))) as Record<
    string,
    string | number | null
  > & { id: string };
}

function EditPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-4 rounded-lg border p-4 [&[open]>summary]:mb-4">
      <summary className="cursor-pointer text-sm font-medium text-primary">{label}</summary>
      {children}
    </details>
  );
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("*, departments(name), locations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound(); // not found OR not permitted — deliberately indistinguishable

  const isSelf = ctx.employeeId === id;
  const canEditCore = ctx.isHr;
  const canEditPersonal = ctx.isHr || isSelf;

  const [
    { data: personal },
    { data: contacts },
    { data: salaries },
    { data: rtw },
    { data: history },
    { data: manager },
  ] = await Promise.all([
    supabase.from("employee_personal").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("emergency_contacts").select("*").eq("employee_id", id).order("created_at"),
    supabase
      .from("salary_history")
      .select("*")
      .eq("employee_id", id)
      .order("effective_date", { ascending: false }),
    supabase
      .from("right_to_work_checks")
      .select("*")
      .eq("employee_id", id)
      .order("checked_on", { ascending: false }),
    supabase
      .from("employment_history")
      .select("*")
      .eq("employee_id", id)
      .order("effective_date", { ascending: false }),
    emp.manager_id
      ? supabase
          .from("employee_directory")
          .select("first_name, preferred_name, last_name")
          .eq("id", emp.manager_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!isSelf) await logEvent("view", "employees", { entityId: id, subjectEmployeeId: id });
  const isDirectManager = Boolean(ctx.employeeId) && emp.manager_id === ctx.employeeId;
  // Voluntary diversity answers: shown only to the employee themselves (the RPC audits the read).
  const showDiversity =
    isSelf && !ctx.supportSession && Boolean(ctx.settings?.diversity_monitoring_enabled);
  const diversity = showDiversity
    ? ((await supabase.rpc("get_employee_sensitive", { p_employee: id })).data as Record<
        string,
        string
      > | null)
    : null;
  const lookups = canEditCore ? await getLookups() : null;

  const name = `${emp.preferred_name || emp.first_name} ${emp.last_name}`;
  const latestRtw = rtw?.[0];
  const rtwDays = latestRtw?.expiry_date ? daysUntil(latestRtw.expiry_date) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isSelf ? "My profile" : name}</h1>
          <p className="text-muted-foreground">
            {[emp.job_title, emp.departments?.name].filter(Boolean).join(" · ") ||
              "No job title recorded"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={emp.status === "active" ? "success" : "muted"}>
              {EMPLOYMENT_STATUSES[emp.status]}
            </Badge>
            <Badge variant="muted">{CONTRACT_TYPES[emp.contract_type]}</Badge>
            {emp.user_id ? (
              <Badge>Has portal access</Badge>
            ) : (
              <Badge variant="muted">No portal access</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ctx.isHr && !ctx.supportSession && !isSelf && (
            <Link
              href={`/cases?employee=${id}`}
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              Cases
            </Link>
          )}
          {ctx.isClientAdmin && !emp.user_id && emp.status !== "leaver" && (
            <InviteButton employeeId={id} />
          )}
        </div>
      </div>

      {/* Employment details */}
      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Full name" value={`${emp.first_name} ${emp.last_name}`} />
            <Detail label="Work email" value={emp.work_email} />
            <Detail label="Employee number" value={emp.employee_number} />
            <Detail
              label="Line manager"
              value={
                manager
                  ? `${manager.preferred_name || manager.first_name} ${manager.last_name}`
                  : null
              }
            />
            <Detail label="Location" value={emp.locations?.name} />
            <Detail label="Start date" value={formatDate(emp.start_date)} />
            <Detail
              label="Continuous service from"
              value={formatDate(emp.continuous_service_date)}
            />
            <Detail label="Probation ends" value={formatDate(emp.probation_end_date)} />
            {emp.fixed_term_end_date && (
              <Detail label="Fixed term ends" value={formatDate(emp.fixed_term_end_date)} />
            )}
            <Detail
              label="Working pattern"
              value={[
                emp.weekly_hours && `${emp.weekly_hours} hours`,
                emp.days_per_week && `${emp.days_per_week} days`,
              ]
                .filter(Boolean)
                .join(" over ")}
            />
            {emp.end_date && <Detail label="Leaving date" value={formatDate(emp.end_date)} />}
          </dl>
          {canEditCore && lookups && (
            <EditPanel label="Edit employment details">
              <EmployeeForm
                employee={employeeFormValues(emp)}
                workingDays={emp.working_days}
                {...lookups}
              />
            </EditPanel>
          )}
        </CardContent>
      </Card>

      <AbsenceSection employeeId={id} ctx={ctx} isSelf={isSelf} isDirectManager={isDirectManager} />

      <DocumentsSection
        employeeId={id}
        ctx={ctx}
        isSelf={isSelf}
        isDirectManager={isDirectManager}
      />

      {!ctx.supportSession && (
        <NotesSection employeeId={id} ctx={ctx} isSelf={isSelf} isDirectManager={isDirectManager} />
      )}

      {/* Personal details: self + HR only (RLS) */}
      {canEditPersonal && (
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
            <CardDescription>
              Visible only to {isSelf ? "you" : "this person"} and HR.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Personal email" value={personal?.personal_email} />
              <Detail label="Personal phone" value={personal?.personal_phone} />
              <Detail
                label="Address"
                value={[
                  personal?.address_line1,
                  personal?.address_line2,
                  personal?.town,
                  personal?.postcode,
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
              <Detail label="Date of birth" value={formatDate(personal?.date_of_birth)} />
            </dl>
            <EditPanel label="Edit personal details">
              <PersonalForm employeeId={id} values={personal ?? undefined} />
            </EditPanel>
          </CardContent>
        </Card>
      )}

      {/* Emergency contacts: self, HR, and (read-only) line manager */}
      <Card>
        <CardHeader>
          <CardTitle>Emergency contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts?.length ? (
            <ul className="divide-y">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{c.name}</span>
                    {c.relationship && (
                      <span className="text-muted-foreground"> ({c.relationship})</span>
                    )}{" "}
                    · {c.phone}
                    {c.alt_phone && ` · ${c.alt_phone}`}
                  </span>
                  {canEditPersonal && (
                    <form action={deleteEmergencyContact}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="employee_id" value={id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove emergency contact ${c.name}`}
                      >
                        <Trash2 aria-hidden="true" /> Remove
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No emergency contacts recorded.</p>
          )}
          {canEditPersonal && (
            <EditPanel label="Add an emergency contact">
              <EmergencyContactForm employeeId={id} />
            </EditPanel>
          )}
        </CardContent>
      </Card>

      {/* Right to work: HR + self (read) */}
      {(ctx.isHr || isSelf) && (
        <Card>
          <CardHeader>
            <CardTitle>Right to work</CardTitle>
            {rtwDays !== null && rtwDays <= 60 && (
              <p className="text-sm font-medium text-warning">
                {rtwDays < 0
                  ? "Permission has expired — a follow-up check is overdue."
                  : `Permission expires in ${rtwDays} days.`}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {rtw?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Checked</Th>
                    <Th>Type</Th>
                    <Th>Outcome</Th>
                    <Th>Expires</Th>
                  </tr>
                </thead>
                <tbody>
                  {rtw.map((r) => (
                    <tr key={r.id}>
                      <Td>{formatDate(r.checked_on)}</Td>
                      <Td>{RTW_CHECK_TYPES[r.check_type as keyof typeof RTW_CHECK_TYPES]}</Td>
                      <Td>{RTW_STATUSES[r.status as keyof typeof RTW_STATUSES]}</Td>
                      <Td>{r.expiry_date ? formatDate(r.expiry_date) : "No expiry"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No right-to-work check recorded.</p>
            )}
            {ctx.isHr && (
              <EditPanel label="Record a right-to-work check">
                <RtwForm employeeId={id} />
              </EditPanel>
            )}
          </CardContent>
        </Card>
      )}

      {/* Salary: HR (and self if the company allows) */}
      {(ctx.isHr || (isSelf && salaries && salaries.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle>Salary history</CardTitle>
            <CardDescription>
              Restricted to HR
              {ctx.settings?.employees_can_view_own_salary ? " and the employee" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {salaries?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Effective from</Th>
                    <Th>Pay</Th>
                    <Th>Reason</Th>
                  </tr>
                </thead>
                <tbody>
                  {salaries.map((s) => (
                    <tr key={s.id}>
                      <Td>{formatDate(s.effective_date)}</Td>
                      <Td>{formatMoney(Number(s.amount), s.pay_basis as "annual" | "hourly")}</Td>
                      <Td>{s.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No salary recorded.</p>
            )}
            {ctx.isHr && (
              <EditPanel label="Record a salary change">
                <SalaryForm employeeId={id} />
              </EditPanel>
            )}
          </CardContent>
        </Card>
      )}

      {showDiversity && (
        <Card>
          <CardHeader>
            <CardTitle>Equality monitoring (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <DiversityForm values={diversity ?? {}} />
          </CardContent>
        </Card>
      )}

      {(ctx.isHr || isSelf) && history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Employment history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{formatDate(h.effective_date)}</span> —{" "}
                  {h.job_title ?? "Role change"}
                  {h.note && <span className="text-muted-foreground"> ({h.note})</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
