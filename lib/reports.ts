import "server-only";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatDate } from "@/lib/format";
import { CONTRACT_TYPES, EMPLOYMENT_STATUSES } from "@/lib/validation/employee";
import type { ReportType } from "@/lib/validation/gdpr";

export type Report = {
  columns: string[];
  rows: (string | number)[][];
  summary: { label: string; value: string | number }[];
  note?: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Every query runs as the signed-in user, so Row Level Security decides what is included.
export async function buildReport(type: ReportType): Promise<Report> {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select(
      "id, first_name, preferred_name, last_name, status, start_date, end_date, contract_type, probation_end_date, fixed_term_end_date, anonymised_at, departments(name)",
    )
    .order("last_name");
  const all = employees ?? [];
  const nameOf = (e: (typeof all)[number]) =>
    e.anonymised_at
      ? "Anonymised former employee"
      : `${e.preferred_name || e.first_name} ${e.last_name}`;
  const dept = (e: (typeof all)[number]) => e.departments?.name ?? "No department";
  const today = iso(new Date());
  const yearAgo = iso(new Date(Date.now() - 365 * 86_400_000));

  if (type === "headcount") {
    const current = all.filter((e) => e.status !== "leaver");
    const byDept = new Map<
      string,
      { active: number; pre_start: number; contracts: Map<string, number> }
    >();
    for (const e of current) {
      const d = byDept.get(dept(e)) ?? { active: 0, pre_start: 0, contracts: new Map() };
      if (e.status === "active") d.active++;
      else d.pre_start++;
      d.contracts.set(e.contract_type, (d.contracts.get(e.contract_type) ?? 0) + 1);
      byDept.set(dept(e), d);
    }
    return {
      columns: ["Department", "Active", "Not started yet", "Contract types"],
      rows: [...byDept.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, d]) => [
          name,
          d.active,
          d.pre_start,
          [...d.contracts.entries()]
            .map(([c, n]) => `${CONTRACT_TYPES[c as keyof typeof CONTRACT_TYPES]} ${n}`)
            .join(", "),
        ]),
      summary: [
        { label: "Active employees", value: current.filter((e) => e.status === "active").length },
        { label: "Not started yet", value: current.filter((e) => e.status === "pre_start").length },
        { label: "Departments", value: byDept.size },
      ],
    };
  }

  if (type === "starters_leavers") {
    const starters = all.filter((e) => e.start_date >= yearAgo && e.start_date <= today);
    const leavers = all.filter(
      (e) => e.status === "leaver" && e.end_date && e.end_date >= yearAgo && e.end_date <= today,
    );
    // Average headcount = (headcount a year ago + headcount today) / 2.
    const at = (d: string) =>
      all.filter((e) => e.start_date <= d && (!e.end_date || e.end_date >= d)).length;
    const avg = (at(yearAgo) + at(today)) / 2;
    const turnover = avg ? Math.round((leavers.length / avg) * 1000) / 10 : 0;
    return {
      columns: ["Name", "Department", "Joined or left", "Date", "Contract"],
      rows: [
        ...starters.map((e) => [
          nameOf(e),
          dept(e),
          "Joined",
          formatDate(e.start_date),
          CONTRACT_TYPES[e.contract_type],
        ]),
        ...leavers.map((e) => [
          nameOf(e),
          dept(e),
          "Left",
          formatDate(e.end_date),
          CONTRACT_TYPES[e.contract_type],
        ]),
      ],
      summary: [
        { label: "Starters (12 months)", value: starters.length },
        { label: "Leavers (12 months)", value: leavers.length },
        { label: "Staff turnover", value: `${turnover}%` },
      ],
      note: "Turnover = leavers in the last 12 months ÷ average headcount (start and end of the period).",
    };
  }

  if (type === "absence") {
    const [{ data: scores }, { data: leave }] = await Promise.all([
      supabase.rpc("bradford_scores"),
      supabase
        .from("leave_requests")
        .select("employee_id, days, leave_types(deducts_allowance)")
        .eq("status", "approved")
        .gte("start_date", yearAgo)
        .lte("start_date", today),
    ]);
    const holiday = new Map<string, number>();
    for (const l of leave ?? [])
      if (l.leave_types?.deducts_allowance)
        holiday.set(l.employee_id, (holiday.get(l.employee_id) ?? 0) + Number(l.days));
    const byId = new Map(all.map((e) => [e.id, e]));
    const rows = (scores ?? [])
      .map((s) => ({ s, e: byId.get(s.employee_id) }))
      .filter((x) => x.e)
      .sort((a, b) => Number(b.s.score) - Number(a.s.score))
      .map(({ s, e }) => [
        nameOf(e!),
        dept(e!),
        s.spells,
        Number(s.days),
        Number(s.score),
        holiday.get(s.employee_id) ?? 0,
      ]);
    const totalSick = rows.reduce((n, r) => n + Number(r[3]), 0);
    return {
      columns: [
        "Name",
        "Department",
        "Sickness spells",
        "Sick days",
        "Bradford Factor",
        "Holiday days taken",
      ],
      rows,
      summary: [
        { label: "Working days lost to sickness", value: Math.round(totalSick * 10) / 10 },
        {
          label: "Average per person",
          value: rows.length ? Math.round((totalSick / rows.length) * 10) / 10 : 0,
        },
        {
          label: "People with Bradford 200+",
          value: rows.filter((r) => Number(r[4]) >= 200).length,
        },
      ],
      note: "Sickness and Bradford Factor cover the last 52 weeks and exclude spells HR has marked as excluded (e.g. pregnancy- or disability-related). Use the Bradford Factor only as a prompt for a supportive conversation, never as an automatic trigger.",
    };
  }

  // expiries
  const { data: rtw } = await supabase
    .from("right_to_work_checks")
    .select("employee_id, expiry_date, checked_on")
    .order("checked_on", { ascending: false });
  const latestRtw = new Map<string, string | null>();
  for (const r of rtw ?? [])
    if (!latestRtw.has(r.employee_id)) latestRtw.set(r.employee_id, r.expiry_date);
  const items: [string, string, string, string, number][] = [];
  const in90 = iso(new Date(Date.now() + 90 * 86_400_000));
  for (const e of all.filter((x) => x.status !== "leaver")) {
    const r = latestRtw.get(e.id);
    if (r && r <= in90)
      items.push([nameOf(e), dept(e), "Right-to-work permission", r, daysUntil(r)]);
    if (e.probation_end_date && e.probation_end_date >= today && e.probation_end_date <= in90)
      items.push([
        nameOf(e),
        dept(e),
        "Probation ends",
        e.probation_end_date,
        daysUntil(e.probation_end_date),
      ]);
    if (e.fixed_term_end_date && e.fixed_term_end_date <= in90)
      items.push([
        nameOf(e),
        dept(e),
        "Fixed-term contract ends",
        e.fixed_term_end_date,
        daysUntil(e.fixed_term_end_date),
      ]);
  }
  items.sort((a, b) => a[3].localeCompare(b[3]));
  return {
    columns: ["Name", "Department", "What", "Date", "Days left"],
    rows: items.map(([n, d, w, date, left]) => [n, d, w, formatDate(date), left]),
    summary: [
      {
        label: "Right-to-work (90 days)",
        value: items.filter((i) => i[2].startsWith("Right")).length,
      },
      {
        label: "Probations ending",
        value: items.filter((i) => i[2].startsWith("Probation")).length,
      },
      { label: "Fixed terms ending", value: items.filter((i) => i[2].startsWith("Fixed")).length },
    ],
    note: `Status values: ${Object.values(EMPLOYMENT_STATUSES).join(", ")}. Leavers are excluded.`,
  };
}

// CSV with protection against spreadsheet formula injection.
export function toCsv(report: Report) {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    "﻿" + [report.columns, ...report.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
