import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processCleanupQueue, sendQueuedEmails } from "@/lib/email";
import { hasAdminClient } from "@/lib/supabase/admin";

// Called every 5 minutes by the database (pg_net) and daily by Vercel Cron.
// Both send "Authorization: Bearer <CRON_SECRET>".
function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  if (!authorised(req) || !hasAdminClient())
    return NextResponse.json({ ok: false }, { status: 401 });
  const cleanup = await processCleanupQueue();
  const email = await sendQueuedEmails();
  return NextResponse.json({ ok: true, cleanup, email });
}

export const GET = run;
export const POST = run;
export const dynamic = "force-dynamic";
