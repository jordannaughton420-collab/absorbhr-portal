import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { actingTenantId, requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import {
  addDays,
  londonDay,
  londonMidnightIso,
  londonTime,
  mondayOf,
  shiftWhen,
  shortDay,
} from "@/lib/shifts";
import { cancelShift, removeFromShiftGroup } from "./actions";
import { AddShiftForm, AddToGroupForm, OpenShiftForm, RowAction } from "./rota-forms";

export const metadata: Metadata = { title: "Rota · AbsorbHR Portal" };

type Absence = {
  employee_id: string;
  start_date: string;
  end_date: string;
  kind: string;
  label: string;
  status: string;
};

const ABSENCE_STYLE: Record<string, string> = {
  holiday: "bg-primary/15 text-primary",
  leave: "bg-primary/10 text-primary",
  sickness: "bg-warning/15 text-warning",
  away: "bg-muted text-muted-foreground",
};

export default async function RotaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const ctx = await requireContext();
  const isManager = ctx.role === "line_manager";
  if (!ctx.isHr && !isManager) redirect("/shifts");
  const canPlan =
    (ctx.isHr && !ctx.supportSession) ||
    (isManager && Boolean(ctx.settings?.managers_can_plan_shifts));
  const manageGroups = ctx.isHr && !ctx.supportSession;

  const params = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") ? params.week! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = days[6];

  const supabase = await createClient();
  const tenantId = actingTenantId(ctx);
  const [
    { data: directory },
    { data: weekShifts },
    { data: waiting },
    { data: absences },
    { data: tenant },
    { data: locations },
    { data: groups },
    { data: members },
  ] = await Promise.all([
    supabase
      .from("employee_directory")
      .select("id, first_name, preferred_name, last_name, manager_id")
      .order("last_name"),
    supabase
      .from("shifts")
      .select(
        "id, employee_id, starts_at, ends_at, role_label, status, claimed_at, locations(name)",
      )
      .neq("status", "cancelled")
      .gte("starts_at", londonMidnightIso(monday))
      .lt("starts_at", londonMidnightIso(addDays(monday, 7)))
      .order("starts_at"),
    supabase
      .from("shifts")
      .select("id, starts_at, ends_at, role_label, notes, status, created_by, shift_groups(name)")
      .eq("status", "open")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(50),
    supabase.rpc("absence_calendar", { p_from: monday, p_to: sunday }),
    supabase.from("tenants").select("bank_holiday_region").eq("id", tenantId!).single(),
    supabase.from("locations").select("id, name").order("name"),
    supabase.from("shift_groups").select("id, name").order("name"),
    supabase.from("shift_group_members").select("group_id, employee_id"),
  ]);
  const { data: bankHolidays } = await supabase
    .from("bank_holidays")
    .select("date, title")
    .eq("region", tenant?.bank_holiday_region ?? "england-and-wales")
    .gte("date", monday)
    .lte("date", sunday);
  const bh = new Map((bankHolidays ?? []).map((b) => [b.date, b.title]));

  const all = (directory ?? []).filter((p) => p.id);
  const nameOf = new Map(
    all.map((p) => [p.id!, `${p.preferred_name || p.first_name} ${p.last_name}`]),
  );
  const name = (id: string | null) => (id ? (nameOf.get(id) ?? "Someone") : "Nobody yet");
  const team = ctx.isHr ? all : all.filter((p) => p.manager_id === ctx.employeeId);
  const rows = ctx.isHr ? all : [...all.filter((p) => p.id === ctx.employeeId), ...team];
  const planFor = team.map((p) => ({ id: p.id!, name: name(p.id!) }));

  // Who each waiting open shift went to.
  const waitingIds = (waiting ?? []).map((s) => s.id);
  const { data: offers } = waitingIds.length
    ? await supabase
        .from("shift_offers")
        .select("shift_id, employee_id, response")
        .in("shift_id", waitingIds)
    : { data: [] };

  const shiftsBy = new Map<string, NonNullable<typeof weekShifts>>();
  for (const s of weekShifts ?? []) {
    if (!s.employee_id) continue;
    const key = `${s.employee_id}|${londonDay(s.starts_at)}`;
    shiftsBy.set(key, [...(shiftsBy.get(key) ?? []), s]);
  }
  const absenceOn = (personId: string, day: string) =>
    ((absences ?? []) as Absence[]).find(
      (a) =>
        a.employee_id === personId &&
        a.start_date <= day &&
        a.end_date >= day &&
        a.status !== "pending",
    );

  const groupList = (groups ?? []).map((g) => ({ id: g.id, name: g.name }));
  const weekLabel = `${shortDay(monday)} to ${shortDay(sunday)}`;
  const nowIso = new Date().toISOString();
  const upcomingThisWeek = (weekShifts ?? []).filter((s) => s.employee_id && s.starts_at > nowIso);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rota</h1>
          <p className="text-sm text-muted-foreground">
            {ctx.isHr ? "Everyone in the company." : "You and the people who report to you."}{" "}
            Holiday and sickness show automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/rota?week=${addDays(monday, -7)}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label="Previous week"
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <h2 className="min-w-56 text-center text-sm font-semibold">{weekLabel}</h2>
          <Link
            href={`/rota?week=${addDays(monday, 7)}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label="Next week"
          >
            <ChevronRight aria-hidden="true" />
          </Link>
          {mondayOf(today) !== monday && (
            <Link href="/rota" className={buttonVariants({ variant: "outline", size: "sm" })}>
              This week
            </Link>
          )}
        </div>
      </div>

      {isManager && !ctx.settings?.managers_can_plan_shifts && (
        <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          You can see your team&apos;s rota. Planning shifts is done by HR unless your company
          switches on “Let line managers plan shifts” in Company settings.
        </p>
      )}

      <Card
        className="overflow-x-auto p-0"
        role="region"
        aria-label={`Rota for ${weekLabel}`}
        tabIndex={0}
      >
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Shifts for {weekLabel}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-40 border-b bg-card px-3 py-2 text-left font-medium"
              >
                Person
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  title={bh.get(d)}
                  className={cn(
                    "min-w-24 border-b px-1 py-2 text-center font-medium",
                    bh.has(d) && "bg-accent",
                    d === today && "text-primary underline",
                  )}
                >
                  {shortDay(d).split(" ").slice(0, 3).join(" ")}
                  {bh.has(d) && <span className="block text-[10px] font-normal">Bank holiday</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="align-top hover:bg-muted/40">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap border-b bg-card px-3 py-2 text-left font-medium"
                >
                  {name(p.id!)}
                  {p.id === ctx.employeeId && <span className="text-muted-foreground"> (me)</span>}
                </th>
                {days.map((d) => {
                  const shifts = shiftsBy.get(`${p.id}|${d}`) ?? [];
                  const off = absenceOn(p.id!, d);
                  return (
                    <td key={d} className={cn("border-b p-1", bh.has(d) && "bg-accent/60")}>
                      <div className="space-y-1">
                        {off && (
                          <span
                            className={cn(
                              "block rounded px-1.5 py-0.5 text-center",
                              ABSENCE_STYLE[off.kind] ?? ABSENCE_STYLE.away,
                            )}
                          >
                            {off.label}
                          </span>
                        )}
                        {shifts.map((s) => (
                          <span
                            key={s.id}
                            className="block rounded bg-primary px-1.5 py-0.5 text-center text-primary-foreground"
                          >
                            {londonTime(s.starts_at)}–{londonTime(s.ends_at)}
                            {s.role_label && (
                              <span className="block text-[10px] opacity-90">{s.role_label}</span>
                            )}
                            {s.claimed_at && (
                              <span className="block text-[10px] opacity-90">Open shift</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open shifts waiting to be filled</CardTitle>
          <CardDescription>
            Everyone offered a shift gets an email. The first to accept it in the portal gets it,
            and nobody else can accept it after that.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(waiting ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No open shifts waiting.</p>
          ) : (
            <ul className="divide-y">
              {(waiting ?? []).map((s) => {
                const sent = (offers ?? []).filter((o) => o.shift_id === s.id);
                const declined = sent.filter((o) => o.response === "declined");
                return (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">
                        {shiftWhen(s.starts_at, s.ends_at)}
                        {s.role_label && <> · {s.role_label}</>}
                      </p>
                      <p className="text-muted-foreground">
                        {s.shift_groups?.name
                          ? `Sent to the “${s.shift_groups.name}” group: `
                          : "Sent to: "}
                        {sent.map((o) => name(o.employee_id)).join(", ") || "nobody"}
                        {declined.length > 0 && ` · ${declined.length} said no`}
                      </p>
                      <Badge variant="warning">Waiting for someone to accept</Badge>
                    </div>
                    {canPlan && (
                      <RowAction
                        action={cancelShift}
                        fields={{ shift_id: s.id }}
                        label="Cancel"
                        confirmText="Cancel this open shift? Nobody will be able to accept it."
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canPlan && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Post an open shift</CardTitle>
              <CardDescription>
                For a shift nobody is down for yet. You&apos;ll see who it went to and who was left
                out and why.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OpenShiftForm
                people={planFor}
                groups={groupList}
                locations={locations ?? []}
                defaultDate={monday < today ? today : monday}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Add a shift</CardTitle>
              <CardDescription>
                Puts someone straight on the rota. The portal checks they aren&apos;t on holiday,
                off sick or already working.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddShiftForm
                people={planFor}
                locations={locations ?? []}
                defaultDate={monday < today ? today : monday}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {canPlan && upcomingThisWeek.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Shifts this week</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {upcomingThisWeek.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{name(s.employee_id)}</span> ·{" "}
                    {shiftWhen(s.starts_at, s.ends_at)}
                    {s.role_label && <> · {s.role_label}</>}
                    {s.locations?.name && <> · {s.locations.name}</>}
                  </span>
                  <RowAction
                    action={cancelShift}
                    fields={{ shift_id: s.id }}
                    label="Cancel"
                    confirmText={`Cancel ${name(s.employee_id)}'s shift? They'll get an email.`}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(manageGroups || groupList.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Open shift groups</CardTitle>
            <CardDescription>
              The people who are happy to be offered extra shifts. Managed by HR.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {groupList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No groups yet. Add someone below to create the first one, for example “Open shifts”.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {groupList.map((g) => {
                  const inGroup = (members ?? []).filter((m) => m.group_id === g.id);
                  return (
                    <div key={g.id} className="rounded-lg border p-3">
                      <h3 className="font-medium">{g.name}</h3>
                      {inGroup.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nobody in this group yet.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {inGroup.map((m) => (
                            <li
                              key={m.employee_id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              {name(m.employee_id)}
                              {manageGroups && (
                                <RowAction
                                  action={removeFromShiftGroup}
                                  fields={{ employee_id: m.employee_id, group_id: g.id }}
                                  label="Remove"
                                  variant="ghost"
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {manageGroups && (
              <AddToGroupForm
                people={all.map((p) => ({ id: p.id!, name: name(p.id!) }))}
                groups={groupList}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
