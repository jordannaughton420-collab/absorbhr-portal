import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Nav, type NavItem } from "@/components/app/nav";
import { IdleTimer } from "@/components/app/idle-timer";
import { NativeLock } from "@/components/app/native-lock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext, type SessionContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { endSupportSession } from "@/app/(app)/admin/actions";
import { PrivacyGate } from "./privacy/privacy-gate";
import { AssistantPanel } from "./assistant/assistant-panel";

function navFor(ctx: SessionContext, pendingApprovals: number, openShifts: number): NavItem[] {
  const inTenant = Boolean(ctx.tenantId || ctx.supportSession);
  const isManager = ctx.role === "line_manager";
  const ownRecord = Boolean(ctx.employeeId) && !ctx.supportSession;
  const items: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }];
  if (ctx.tenantId && !ctx.supportSession && ctx.settings?.assistant_enabled)
    items.push({ href: "/assistant", label: "Assistant", icon: "assistant" });
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
  if (ownRecord)
    items.push({
      href: "/shifts",
      label: openShifts ? `My shifts (${openShifts} open)` : "My shifts",
      icon: "shifts",
    });
  if (ctx.isHr || isManager) items.push({ href: "/rota", label: "Rota", icon: "rota" });
  if (ownRecord || ((ctx.isHr || isManager) && !ctx.supportSession))
    items.push({ href: "/sickness", label: "Sickness", icon: "sickness" });
  if (inTenant) items.push({ href: "/checklists", label: "Checklists", icon: "checklists" });
  if (!ctx.supportSession && (ownRecord || ctx.isHr || isManager))
    items.push({ href: "/reviews", label: "Reviews", icon: "reviews" });
  if (ctx.isHr && !ctx.supportSession)
    items.push({ href: "/cases", label: "Cases", icon: "cases" });
  if (ctx.isHr || isManager)
    items.push({
      href: "/employees",
      label: ctx.isHr ? "Employees" : "My team",
      icon: "employees",
    });
  if (inTenant) items.push({ href: "/org-chart", label: "Org chart", icon: "org" });
  if (inTenant || ctx.isPlatformAdmin)
    items.push({ href: "/policies", label: "Policies", icon: "policies" });
  if (ctx.isHr) items.push({ href: "/reports", label: "Reports", icon: "reports" });
  if (ctx.isHr && !ctx.supportSession)
    items.push({ href: "/privacy-tools", label: "Data protection", icon: "dataProtection" });
  if ((ctx.isClientAdmin && !ctx.supportSession) || (ctx.isPlatformAdmin && !ctx.supportSession))
    items.push({ href: "/breaches", label: "Breach log", icon: "breaches" });
  if (ctx.isHr) items.push({ href: "/settings", label: "Company settings", icon: "settings" });
  if (ctx.isClientAdmin && !ctx.supportSession)
    items.push({ href: "/audit-log", label: "Audit log", icon: "audit" });
  if (!ctx.supportSession && (ownRecord || ctx.isHr))
    items.push({ href: "/requests", label: "Correction requests", icon: "requests" });
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
  // Open shifts this person can still pick up.
  let openShifts = 0;
  if (ctx.employeeId && !ctx.supportSession) {
    const { data: offers } = await supabase
      .from("shift_offers")
      .select("shift_id")
      .eq("employee_id", ctx.employeeId)
      .is("response", null)
      .limit(50);
    if (offers?.length) {
      const { count } = await supabase
        .from("shifts")
        .select("id", { count: "exact", head: true })
        .in(
          "id",
          offers.map((o) => o.shift_id),
        )
        .eq("status", "open")
        .gt("starts_at", new Date().toISOString());
      openShifts = count ?? 0;
    }
  }
  const items = navFor(ctx, pendingApprovals, openShifts);

  // Employees must read and acknowledge the current privacy notice before using the portal.
  let gate: React.ReactNode = null;
  if (ctx.tenantId) {
    const { data: notice } = await supabase.rpc("current_privacy_notice").maybeSingle();
    if (notice && !notice.acknowledged_at) gate = <PrivacyGate notice={notice} />;
  }

  const noAccount = !ctx.tenantId && !ctx.isPlatformAdmin;
  // The assistant in the corner: for HR, line managers and admins, once the company has switched it on.
  const showPanel =
    Boolean(ctx.tenantId) &&
    !ctx.supportSession &&
    Boolean(ctx.settings?.assistant_enabled) &&
    (ctx.isHr || ctx.role === "line_manager") &&
    !gate;

  const sidebar = (
    <>
      <Nav items={items} />
      <div className="mt-6 border-t border-white/15 pt-4 text-sm">
        <p className="font-semibold text-white">{ctx.displayName}</p>
        <p className="text-white/70">
          {ctx.supportSession?.tenantName ?? ctx.tenantName ?? "AbsorbHR"}
        </p>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
          className="mt-3"
        >
          <Button type="submit" variant="onBrand" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-page lg:flex">
      {/* Desktop sidebar: the website's purple panel */}
      <aside className="brand-surface on-brand sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto p-5 lg:block">
        <Link href="/dashboard" aria-label="AbsorbHR Portal home" className="inline-block">
          <Logo variant="white" height={28} />
        </Link>
        <div className="mt-8">{sidebar}</div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile header with disclosure menu (works without JavaScript) */}
        <details className="brand-surface on-brand lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <Logo variant="white" height={26} />
            <span className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-white/45 bg-white/5 px-3.5 py-1.5 text-sm font-semibold text-white">
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

        <main
          id="main"
          className={cn(
            "mx-auto max-w-6xl p-4 sm:p-6 lg:p-8",
            showPanel && "pb-24 sm:pb-24 lg:pb-24",
          )}
        >
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

      {showPanel && <AssistantPanel isHr={ctx.isHr} />}
      <IdleTimer idleMinutes={ctx.settings?.session_idle_minutes ?? 30} />
      <NativeLock />
    </div>
  );
}
