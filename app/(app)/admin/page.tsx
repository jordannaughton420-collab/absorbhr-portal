import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { REGIONS } from "@/lib/validation/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Table, Td, Th } from "@/components/ui/table";
import { NewTenantForm, SupportSessionForm } from "./admin-forms";

export const metadata: Metadata = { title: "AbsorbHR admin · AbsorbHR Portal" };

export default async function AdminPage() {
  const ctx = await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, status, bank_holiday_region, created_at")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AbsorbHR admin</h1>
        <p className="text-sm text-muted-foreground">
          You have no access to client data by default. Open a support session to help a client — it
          is time-limited, logged, and shown to the client.
        </p>
      </div>

      {ctx.supportSession && (
        <Alert variant="warning">
          You have an open support session for {ctx.supportSession.tenantName}.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Client companies</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Bank holidays</Th>
                <Th className="hidden sm:table-cell">Client since</Th>
              </tr>
            </thead>
            <tbody>
              {(tenants ?? []).map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium">{t.name}</Td>
                  <Td>
                    <Badge variant={t.status === "active" ? "success" : "muted"}>{t.status}</Badge>
                  </Td>
                  <Td className="hidden sm:table-cell">{REGIONS[t.bank_holiday_region]}</Td>
                  <Td className="hidden sm:table-cell">{formatDate(t.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open a support session</CardTitle>
            <CardDescription>
              Gives HR-level access to one company. Special-category data stays hidden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupportSessionForm tenants={(tenants ?? []).filter((t) => t.status === "active")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Onboard a new client</CardTitle>
            <CardDescription>
              Creates the company and emails its first Client Admin an invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewTenantForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
