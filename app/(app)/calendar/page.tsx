import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { actingTenantId, requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team calendar · AbsorbHR Portal" };

type Entry = {
  employee_id: string;
  start_date: string;
  end_date: string;
  half_day_start: boolean;
  half_day_end: boolean;
  kind: string;
  label: string;
  status: string;
};

const KIND_STYLE: Record<string, string> = {
  holiday: "bg-primary text-primary-foreground",
  leave: "border-2 border-primary bg-primary/15 text-primary",
  sickness: "bg-warning text-white",
  away: "bg-muted-foreground text-white",
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; dept?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!.split("-").map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const days = Array.from(
    { length: last.getUTCDate() },
    (_, i) => new Date(Date.UTC(y, m - 1, i + 1)),
  );
  const prev = iso(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
  const next = iso(new Date(Date.UTC(y, m, 1))).slice(0, 7);
  const today = iso(now);

  const supabase = await createClient();
  const tenantId = actingTenantId(ctx);
  const [{ data: entries }, { data: directory }, { data: tenant }, { data: departments }] =
    await Promise.all([
      supabase.rpc("absence_calendar", { p_from: iso(first), p_to: iso(last) }),
      supabase
        .from("employee_directory")
        .select("id, first_name, preferred_name, last_name, manager_id, department_id")
        .order("last_name"),
      supabase.from("tenants").select("bank_holiday_region").eq("id", tenantId!).single(),
      supabase.from("departments").select("id, name").order("name"),
    ]);
  const { data: bankHolidays } = await supabase
    .from("bank_holidays")
    .select("date, title")
    .eq("region", tenant?.bank_holiday_region ?? "england-and-wales")
    .gte("date", iso(first))
    .lte("date", iso(last));
  const bh = new Map((bankHolidays ?? []).map((b) => [b.date, b.title]));

  // Rows: HR/support see everyone (optionally by department); others see themself, their reports and teammates.
  const all = directory ?? [];
  const me = all.find((p) => p.id === ctx.employeeId);
  const wide = ctx.isHr;
  const people = all.filter((p) => {
    if (wide) return !params.dept || p.department_id === params.dept;
    return (
      p.id === ctx.employeeId ||
      p.manager_id === ctx.employeeId ||
      (me?.manager_id && p.manager_id === me.manager_id)
    );
  });

  const byPerson = new Map<string, Entry[]>();
  for (const e of (entries ?? []) as Entry[])
    byPerson.set(e.employee_id, [...(byPerson.get(e.employee_id) ?? []), e]);

  function cellFor(personId: string, day: string) {
    return (byPerson.get(personId) ?? []).find((e) => e.start_date <= day && e.end_date >= day);
  }

  const monthLabel = first.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const q = (month: string) =>
    `/calendar?month=${month}${params.dept ? `&dept=${params.dept}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team calendar</h1>
          <p className="text-sm text-muted-foreground">
            {wide ? "Everyone in the company." : "You, your team and anyone who reports to you."}{" "}
            Details you aren&apos;t allowed to see show as “Away”.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={q(prev)}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label="Previous month"
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <h2 className="min-w-40 text-center font-semibold">{monthLabel}</h2>
          <Link
            href={q(next)}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label="Next month"
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </div>
      </div>

      {wide && (departments?.length ?? 0) > 0 && (
        <nav aria-label="Filter by department" className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/calendar?month=${iso(first).slice(0, 7)}`}
            className={cn(
              buttonVariants({ variant: !params.dept ? "default" : "outline", size: "sm" }),
            )}
          >
            Everyone
          </Link>
          {departments!.map((d) => (
            <Link
              key={d.id}
              href={`/calendar?month=${iso(first).slice(0, 7)}&dept=${d.id}`}
              className={cn(
                buttonVariants({
                  variant: params.dept === d.id ? "default" : "outline",
                  size: "sm",
                }),
              )}
            >
              {d.name}
            </Link>
          ))}
        </nav>
      )}

      <ul className="flex flex-wrap gap-4 text-sm" aria-label="Key">
        <li className="flex items-center gap-2">
          <span className="size-4 rounded bg-primary" aria-hidden="true" /> Holiday
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-4 rounded border-2 border-primary bg-primary/15"
            aria-hidden="true"
          />{" "}
          Other leave
        </li>
        {(wide || ctx.role === "line_manager") && (
          <li className="flex items-center gap-2">
            <span className="size-4 rounded bg-warning" aria-hidden="true" /> Sickness
          </li>
        )}
        <li className="flex items-center gap-2">
          <span className="size-4 rounded bg-muted-foreground" aria-hidden="true" /> Away
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-4 rounded border-2 border-dashed border-primary"
            aria-hidden="true"
          />{" "}
          Waiting for approval
        </li>
        <li className="flex items-center gap-2">
          <span className="size-4 rounded bg-accent ring-1 ring-border" aria-hidden="true" />{" "}
          Weekend / bank holiday
        </li>
      </ul>

      <Card
        className="overflow-x-auto p-0"
        role="region"
        aria-label={`Absence calendar for ${monthLabel}`}
        tabIndex={0}
      >
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Absences in {monthLabel}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-40 border-b bg-card px-3 py-2 text-left font-medium"
              >
                Person
              </th>
              {days.map((d) => {
                const key = iso(d);
                const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return (
                  <th
                    key={key}
                    scope="col"
                    title={bh.get(key)}
                    className={cn(
                      "min-w-8 border-b px-0.5 py-1 text-center font-medium",
                      (weekend || bh.has(key)) && "bg-accent",
                      key === today && "text-primary underline",
                    )}
                  >
                    <span className="block text-[10px] text-muted-foreground">
                      {d.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}
                    </span>
                    {d.getUTCDate()}
                    {bh.has(key) && <span className="sr-only">, bank holiday: {bh.get(key)}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const name = `${p.preferred_name || p.first_name} ${p.last_name}`;
              return (
                <tr key={p.id} className="hover:bg-muted/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-b bg-card px-3 py-1.5 text-left font-medium"
                  >
                    {name}
                  </th>
                  {days.map((d) => {
                    const key = iso(d);
                    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                    const e = cellFor(p.id!, key);
                    const half =
                      e &&
                      ((e.start_date === key && e.half_day_start) ||
                        (e.end_date === key && e.half_day_end));
                    const pending = e?.status === "pending";
                    return (
                      <td
                        key={key}
                        className={cn(
                          "h-8 border-b p-0.5 text-center",
                          (weekend || bh.has(key)) && "bg-accent",
                        )}
                      >
                        {e && !weekend && !bh.has(key) && (
                          <span
                            title={`${name}: ${e.label}${pending ? " (waiting for approval)" : ""}${half ? " (half day)" : ""}`}
                            className={cn(
                              "flex h-6 items-center justify-center rounded",
                              pending
                                ? "border-2 border-dashed border-primary bg-card text-primary"
                                : KIND_STYLE[e.kind],
                              half && "w-1/2",
                            )}
                          >
                            <span className="sr-only">
                              {e.label}
                              {pending ? ", waiting for approval" : ""}
                              {half ? ", half day" : ""}
                            </span>
                            <span aria-hidden="true">
                              {pending
                                ? "?"
                                : ({ holiday: "H", leave: "L", sickness: "S", away: "–" }[e.kind] ??
                                  "–")}
                            </span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} className="p-6 text-center text-muted-foreground">
                  No people to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
