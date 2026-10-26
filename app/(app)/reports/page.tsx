import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireHr } from "@/lib/auth/context";
import { logEvent } from "@/lib/audit";
import { buildReport } from "@/lib/reports";
import { REPORT_TYPES, type ReportType } from "@/lib/validation/gdpr";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Reports · AbsorbHR Portal" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const ctx = await requireHr();
  const available = (Object.keys(REPORT_TYPES) as ReportType[]).filter(
    (t) => !(t === "absence" && ctx.supportSession),
  );
  const { type: requested } = await searchParams;
  const type = available.includes(requested as ReportType)
    ? (requested as ReportType)
    : "headcount";
  const report = await buildReport(type);
  await logEvent("view", "report", { metadata: { report: type } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Downloads are recorded in the audit log. Store exported files securely.
        </p>
      </div>
      <nav aria-label="Reports" className="flex flex-wrap gap-2">
        {available.map((t) => (
          <Link
            key={t}
            href={`/reports?type=${t}`}
            aria-current={t === type ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium",
              t === type ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {REPORT_TYPES[t]}
          </Link>
        ))}
      </nav>
      <div className="grid gap-4 sm:grid-cols-3">
        {report.summary.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold text-primary">{s.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{REPORT_TYPES[type]}</CardTitle>
          <a
            href={`/reports/export?type=${type}`}
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            <Download className="size-4" aria-hidden="true" /> Download CSV
          </a>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.rows.length ? (
            <Table>
              <thead>
                <tr>
                  {report.columns.map((c) => (
                    <Th key={c}>{c}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <Td key={j}>{v}</Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to show.</p>
          )}
          {report.note && <p className="text-xs text-muted-foreground">{report.note}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
