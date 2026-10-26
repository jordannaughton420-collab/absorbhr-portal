import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/auth/context";
import { logEvent } from "@/lib/audit";
import { buildReport, toCsv } from "@/lib/reports";
import { REPORT_TYPES, type ReportType } from "@/lib/validation/gdpr";

// CSV download of a report. HR only; absence data never in support sessions. Every export is audited.
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") as ReportType | null;
  const ctx = await getContext();
  if (!ctx?.isHr || ctx.aal !== "aal2" || !type || !(type in REPORT_TYPES))
    return new NextResponse("Not found", { status: 404 });
  if (type === "absence" && ctx.supportSession)
    return new NextResponse("Not found", { status: 404 });
  const csv = toCsv(await buildReport(type));
  await logEvent("export", "report", { metadata: { report: type } });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
