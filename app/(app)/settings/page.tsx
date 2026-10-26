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
