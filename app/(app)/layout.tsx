import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Nav, type NavItem } from "@/components/app/nav";
import { IdleTimer } from "@/components/app/idle-timer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext, type SessionContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { endSupportSession } from "@/app/(app)/admin/actions";
import { PrivacyGate } from "./privacy/privacy-gate";

function navFor(ctx: SessionContext, pendingApprovals: number): NavItem[] {
  const inTenant = Boolean(ctx.tenantId || ctx.supportSession);
  const isManager = ctx.role === "line_manager";
  const ownRecord = Boolean(ctx.employeeId) && !ctx.supportSession;
  const items: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }];
  if (ownRecord)
    items.push({ href: `/employees/${ctx.employeeId}`, label: "My profile", icon: "profile" });
  if (ownRecord) items.push({ href: "/leave", label: "My leave", icon: "leave" });
  if (ctx.isHr || isManager)
    items.push({
      href: "/leave/approvals",
      label: pendingApprovals ? `Approvals (${pendingApprovals})` : "Approvals",
      icon: "approvals",
    });
  if (inTenant) items.push({ href: "/calendar", label: "Team calendar", icon: "calendar" });
  if (ownRecord || ((ctx.isHr || isManager) && !ctx.supportSession))
    items.push({ href: "/sickness", label: "Sickness", icon: "sickness" });
  if (ctx.isHr || isManager)
    items.push({
      href: "/employees",
      label: ctx.isHr ? "Employees" : "My team",
      icon: "employees",
    });
  if (inTenant) items.push({ href: "/org-chart", label: "Org chart", icon: "org" });
  if (ctx.isHr) items.push({ href: "/settings", label: "Company settings", icon: "settings" });
  if (ctx.isClientAdmin && !ctx.supportSession)
    items.push({ href: "/audit-log", label: "Audit log", icon: "audit" });
  if (ctx.tenantId) items.push({ href: "/privacy", label: "Privacy notice", icon: "privacy" });
  if (ctx.isPlatformAdmin) items.push({ href: "/admin", label: "AbsorbHR admin", icon: "admin" });
  return items;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const supabase = await createClient();
  let pendingApprovals = 0;
  if (ctx.isHr || ctx.role === "line_manager") {
    const { count } = await supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .neq("employee_id", ctx.employeeId ?? "00000000-0000-0000-0000-000000000000");
    pendingApprovals = count ?? 0;
  }
  const items = navFor(ctx, pendingApprovals);

  // Employees must read and acknowledge the current privacy notice before using the portal.
  let gate: React.ReactNode = null;
  if (ctx.tenantId) {
    const { data: notice } = await supabase.rpc("current_privacy_notice").maybeSingle();
    if (notice && !notice.acknowledged_at) gate = <PrivacyGate notice={notice} />;
  }

  const noAccount = !ctx.tenantId && !ctx.isPlatformAdmin;

  const sidebar = (
    <>
      <Nav items={items} />
      <div className="mt-6 border-t pt-4 text-sm">
        <p className="font-medium">{ctx.displayName}</p>
        <p className="text-muted-foreground">
          {ctx.supportSession?.tenantName ?? ctx.tenantName ?? "AbsorbHR"}
        </p>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
          className="mt-3"
        >
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-accent lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card p-5 lg:block">
        <Link href="/dashboard" aria-label="AbsorbHR Portal home">
          <Logo height={36} />
        </Link>
        <div className="mt-8">{sidebar}</div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile header with disclosure menu (works without JavaScript) */}
        <details className="border-b bg-card lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <Logo height={32} />
            <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
              <Menu className="size-4" aria-hidden="true" /> Menu
            </span>
          </summary>
          <div className="px-4 pb-4">{sidebar}</div>
        </details>

        {ctx.supportSession && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 bg-warning px-4 py-2 text-sm text-white"
          >
            <span>
              <strong>AbsorbHR support session</strong> — you are viewing{" "}
              {ctx.supportSession.tenantName}. Every action is logged and visible to the client.
              Ends{" "}
              {new Date(ctx.supportSession.expiresAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </span>
            <form action={endSupportSession}>
              <Button type="submit" size="sm" variant="outline" className="bg-white text-warning">
                End session
              </Button>
            </form>
          </div>
        )}

        <main id="main" className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          {noAccount ? (
            <Card>
              <CardHeader>
                <CardTitle>Your account isn&apos;t linked to a company yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Please contact your HR team or AbsorbHR to finish setting up your access.
              </CardContent>
            </Card>
          ) : (
            (gate ?? children)
          )}
        </main>
      </div>

      <IdleTimer idleMinutes={ctx.settings?.session_idle_minutes ?? 30} />
    </div>
  );
}
