import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DoodleSquiggle } from "@/components/brand/doodle";

export const metadata: Metadata = { title: "Dashboard · AbsorbHR Portal" };

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <Card className="p-5 transition-colors hover:border-primary">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-primary">{value}</p>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function DashboardPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const firstName = ctx.displayName.split(" ")[0];

  let hr: null | {
    active: number;
    starting: number;
    rtw: { id: string; employee_id: string; expiry_date: string; name: string }[];
    probation: { id: string; name: string; date: string }[];
  } = null;

  if (ctx.isHr) {
    const in60 = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: people }, { data: rtw }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, first_name, preferred_name, last_name, status, probation_end_date"),
      supabase
        .from("right_to_work_checks")
        .select("id, employee_id, expiry_date")
        .not("expiry_date", "is", null)
        .lte("expiry_date", in60)
        .order("expiry_date"),
    ]);
    const all = people ?? [];
    const nameOf = new Map(
      all.map((p) => [p.id, `${p.preferred_name || p.first_name} ${p.last_name}`]),
    );
    // Only the most recent check per person matters.
    const latest = new Map<string, { id: string; employee_id: string; expiry_date: string }>();
    for (const r of rtw ?? [])
      if (!latest.has(r.employee_id)) latest.set(r.employee_id, r as never);
    hr = {
      active: all.filter((p) => p.status === "active").length,
      starting: all.filter((p) => p.status === "pre_start").length,
      rtw: [...latest.values()]
        .filter((r) => all.find((p) => p.id === r.employee_id)?.status !== "leaver")
        .map((r) => ({ ...r, name: nameOf.get(r.employee_id) ?? "" })),
      probation: all
        .filter(
          (p) =>
            p.status !== "leaver" &&
            p.probation_end_date &&
            p.probation_end_date >= today &&
            p.probation_end_date <= in30,
        )
        .map((p) => ({ id: p.id, name: nameOf.get(p.id) ?? "", date: p.probation_end_date! })),
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hello, {firstName}</h1>
        <DoodleSquiggle className="mt-1 h-4 w-20 text-primary" />
        <p className="mt-2 text-muted-foreground">
          {ctx.supportSession?.tenantName ?? ctx.tenantName ?? "AbsorbHR platform administration"}
        </p>
      </div>

      {hr && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Active employees" value={hr.active} href="/employees" />
            <Stat label="Starting soon" value={hr.starting} href="/employees" />
            <Stat label="Right-to-work expiring (60 days)" value={hr.rtw.length} />
            <Stat label="Probations ending (30 days)" value={hr.probation.length} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Right-to-work expiries</CardTitle>
                <CardDescription>
                  Time-limited permissions expiring in the next 60 days.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hr.rtw.length ? (
                  <ul className="divide-y text-sm">
                    {hr.rtw.map((r) => {
                      const d = daysUntil(r.expiry_date);
                      return (
                        <li key={r.id} className="flex justify-between gap-2 py-2">
                          <Link
                            href={`/employees/${r.employee_id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {r.name}
                          </Link>
                          <span
                            className={
                              d < 14 ? "font-medium text-destructive" : "text-muted-foreground"
                            }
                          >
                            {d < 0 ? "Expired" : `${formatDate(r.expiry_date)} (${d} days)`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing due. 🎉</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Probations ending</CardTitle>
                <CardDescription>Review meetings due in the next 30 days.</CardDescription>
              </CardHeader>
              <CardContent>
                {hr.probation.length ? (
                  <ul className="divide-y text-sm">
                    {hr.probation.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2 py-2">
                        <Link
                          href={`/employees/${p.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="text-muted-foreground">{formatDate(p.date)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing due.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!hr && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ctx.employeeId && (
            <Link href={`/employees/${ctx.employeeId}`} className="rounded-xl">
              <Card className="h-full p-5 hover:border-primary">
                <h2 className="font-semibold">My profile</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Check and update your personal details and emergency contacts.
                </p>
              </Card>
            </Link>
          )}
          {ctx.role === "line_manager" && (
            <Link href="/employees" className="rounded-xl">
              <Card className="h-full p-5 hover:border-primary">
                <h2 className="font-semibold">My team</h2>
                <p className="mt-1 text-sm text-muted-foreground">See your direct reports.</p>
              </Card>
            </Link>
          )}
          {ctx.tenantId && (
            <Link href="/org-chart" className="rounded-xl">
              <Card className="h-full p-5 hover:border-primary">
                <h2 className="font-semibold">Org chart</h2>
                <p className="mt-1 text-sm text-muted-foreground">Who&apos;s who in the company.</p>
              </Card>
            </Link>
          )}
          {ctx.isPlatformAdmin && (
            <Link href="/admin" className="rounded-xl">
              <Card className="h-full p-5 hover:border-primary">
                <h2 className="font-semibold">Client companies</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Onboard clients and open support sessions.
                </p>
              </Card>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
