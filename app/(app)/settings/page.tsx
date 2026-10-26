import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { actingTenantId, requireHr } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { ROLES } from "@/lib/validation/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Table, Td, Th } from "@/components/ui/table";
import { deleteOrgUnit } from "./actions";
import { getHolidayPolicy } from "@/lib/data/leave";
import { Alert } from "@/components/ui/feedback";
import { CarryOverForm, HolidayPolicyForm } from "./holiday-forms";
import {
  AddDepartmentForm,
  AddLocationForm,
  CompanyForm,
  RoleForm,
  SecurityForm,
} from "./settings-forms";

export const metadata: Metadata = { title: "Company settings · AbsorbHR Portal" };

function UnitList({
  kind,
  items,
}: {
  kind: "departments" | "locations";
  items: { id: string; name: string }[];
}) {
  return items.length ? (
    <ul className="mb-4 divide-y rounded-lg border">
      {items.map((d) => (
        <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
          {d.name}
          <form action={deleteOrgUnit}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="kind" value={kind} />
            <Button type="submit" variant="ghost" size="sm" aria-label={`Delete ${d.name}`}>
              <Trash2 aria-hidden="true" />
            </Button>
          </form>
        </li>
      ))}
    </ul>
  ) : (
    <p className="mb-4 text-sm text-muted-foreground">None yet.</p>
  );
}

export default async function SettingsPage() {
  const ctx = await requireHr();
  const tenantId = actingTenantId(ctx)!;
  const supabase = await createClient();

  const [
    { data: tenant },
    { data: settings },
    { data: departments },
    { data: locations },
    { data: members },
    { data: employees },
    { data: support },
  ] = await Promise.all([
    supabase.from("tenants").select("name, bank_holiday_region").eq("id", tenantId).single(),
    supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).single(),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("locations").select("id, name").order("name"),
    ctx.isClientAdmin
      ? supabase.from("memberships").select("id, user_id, role, is_active").order("role")
      : Promise.resolve({ data: null }),
    supabase
      .from("employees")
      .select("user_id, first_name, preferred_name, last_name")
      .not("user_id", "is", null),
    ctx.isClientAdmin && !ctx.supportSession
      ? supabase
          .from("support_sessions")
          .select("id, reason, started_at, expires_at, ended_at")
          .order("started_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
  ]);
  const policy = await getHolidayPolicy();

  // Leave years HR can run carry-over for: the current one and the one before.
  const m = settings?.leave_year_start_month ?? 1;
  const d = settings?.leave_year_start_day ?? 1;
  const now = new Date();
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), m - 1, d));
  if (thisStart > now) thisStart.setUTCFullYear(thisStart.getUTCFullYear() - 1);
  const years = [0, 1].map((back) => {
    const s = new Date(thisStart);
    s.setUTCFullYear(s.getUTCFullYear() - back);
    const e = new Date(s);
    e.setUTCFullYear(e.getUTCFullYear() + 1);
    e.setUTCDate(e.getUTCDate() - 1);
    const f = (x: Date) =>
      x.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    return { value: s.toISOString().slice(0, 10), label: `${f(s)} – ${f(e)}` };
  });

  const nameByUser = new Map(
    (employees ?? []).map((e) => [
      e.user_id!,
      `${e.preferred_name || e.first_name} ${e.last_name}`,
    ]),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Company settings</h1>

      {ctx.isClientAdmin && tenant && settings && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Company</CardTitle>
            </CardHeader>
            <CardContent>
              <CompanyForm name={tenant.name} region={tenant.bank_holiday_region} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Security and privacy</CardTitle>
            </CardHeader>
            <CardContent>
              <SecurityForm values={settings} />
            </CardContent>
          </Card>
        </div>
      )}

      {policy && (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Holiday rules</CardTitle>
              <CardDescription>
                The legal minimum is 5.6 weeks a year (28 days for a five-day week, including bank
                holidays).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!policy.configured_at && (
                <Alert variant="warning">
                  Staff can&apos;t book holiday until these rules are confirmed — in particular, how
                  much unused holiday can be carried into the next year.
                </Alert>
              )}
              {ctx.isClientAdmin ? (
                <HolidayPolicyForm policy={policy} yearMonth={m} yearDay={d} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only Client Admins can change the holiday rules.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Year-end carry-over</CardTitle>
              <CardDescription>
                {policy.configured_at && Number(policy.carry_over_max_days) > 0
                  ? `Moves up to ${Number(policy.carry_over_max_days)} unused days per person into the next leave year.`
                  : "Your rules don't allow carry-over. Use an adjustment on someone's profile for exceptions."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {policy.configured_at && Number(policy.carry_over_max_days) > 0 && (
                <CarryOverForm years={years} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
            <CardDescription>
              Deleting a department keeps its people; they just become unassigned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnitList kind="departments" items={departments ?? []} />
            <AddDepartmentForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <UnitList kind="locations" items={locations ?? []} />
            <AddLocationForm />
          </CardContent>
        </Card>
      </div>

      {members && (
        <Card>
          <CardHeader>
            <CardTitle>Portal users and roles</CardTitle>
            <CardDescription>
              Client Admins manage everything; HR Managers manage people records; Line Managers see
              their direct reports; Employees see only their own data. To give someone access, open
              their employee record and choose “Invite to portal”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {members.map((m) => {
                const label = nameByUser.get(m.user_id) ?? "Unnamed account";
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-sm text-muted-foreground">
                        {ROLES[m.role]}{" "}
                        {!m.is_active && <Badge variant="muted">Access removed</Badge>}
                      </p>
                    </div>
                    {m.user_id === ctx.userId ? (
                      <span className="text-sm text-muted-foreground">This is you</span>
                    ) : (
                      <RoleForm
                        membershipId={m.id}
                        role={m.role}
                        isActive={m.is_active}
                        label={label}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {support && (
        <Card>
          <CardHeader>
            <CardTitle>AbsorbHR support access</CardTitle>
            <CardDescription>
              Every time AbsorbHR staff accessed your company&apos;s data, and why.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {support.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Started</Th>
                    <Th>Ended</Th>
                    <Th>Reason</Th>
                  </tr>
                </thead>
                <tbody>
                  {support.map((s) => (
                    <tr key={s.id}>
                      <Td>{formatDateTime(s.started_at)}</Td>
                      <Td>
                        {formatDateTime(
                          s.ended_at ?? (new Date(s.expires_at) < new Date() ? s.expires_at : null),
                        ) || "Active now"}
                      </Td>
                      <Td>{s.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">AbsorbHR has not accessed your data.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
