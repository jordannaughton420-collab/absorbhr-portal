import "server-only";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

type OutboxUpdate = Database["public"]["Tables"]["email_outbox"]["Update"];

// Emails never contain personal or sensitive detail: just what kind of thing is waiting and a link.
// The person signs in to see the detail.
const TEMPLATES: Record<string, { subject: string; body: string; button: string }> = {
  leave_requested: {
    subject: "A holiday request is waiting for you",
    body: "Someone in your team has asked for time off.",
    button: "Review requests",
  },
  leave_approved: {
    subject: "Your time-off request was approved",
    body: "Your request has been approved.",
    button: "View my leave",
  },
  leave_declined: {
    subject: "Your time-off request was declined",
    body: "Your request was not approved. You can see the reason in the portal.",
    button: "View my leave",
  },
  review_started: {
    subject: "Your performance review has started",
    body: "Please complete your self-assessment.",
    button: "Open my review",
  },
  review_self_submitted: {
    subject: "A self-assessment is ready for you",
    body: "A member of your team has submitted their self-assessment.",
    button: "Open the review",
  },
  review_shared: {
    subject: "Your review is ready to discuss",
    body: "Your manager has shared their assessment. Please read it and sign.",
    button: "Open my review",
  },
  correction_requested: {
    subject: "New correction request",
    body: "An employee has asked HR to correct their personal data. Please reply within one month.",
    button: "Open requests",
  },
  correction_answered: {
    subject: "HR has replied to your correction request",
    body: "HR has responded to your request.",
    button: "View reply",
  },
  checklist_started: {
    subject: "New onboarding or offboarding tasks",
    body: "A checklist with tasks for you has been started.",
    button: "View tasks",
  },
  rtw_expiring: {
    subject: "A right-to-work permission is expiring",
    body: "An employee's permission to work expires within 30 days. A follow-up check is needed before it ends.",
    button: "Open the record",
  },
  retention_due: {
    subject: "Records are due for anonymisation",
    body: "A leaver's records have reached the end of your retention period. Please review them.",
    button: "Review records",
  },
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderEmail(template: string, link: string, baseUrl: string) {
  const t = TEMPLATES[template];
  if (!t) return null;
  const url = baseUrl.replace(/\/$/, "") + link;
  const text = `${t.body}\n\n${t.button}: ${url}\n\nThis is an automatic message from the AbsorbHR Portal.`;
  const html = `<!doctype html><html><body style="margin:0;background:#ECECEC;font-family:Inter,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#FFFFFF;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 28px;border-bottom:4px solid #570080;font-weight:700;color:#570080;font-size:18px">AbsorbHR Portal</td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(t.subject)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">${esc(t.body)}</p>
<a href="${esc(url)}" style="display:inline-block;background:#570080;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(t.button)}</a>
<p style="font-size:12px;color:#555;margin:28px 0 0">This is an automatic message. Sign in to see the details.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: t.subject, text, html };
}

// Addresses that can never receive mail (demo and test accounts).
const UNDELIVERABLE = /@example\.(com|org|net|test)$/i;

type Delivery = { ok: true } | { ok: false; final: boolean; code: string };
type Content = NonNullable<ReturnType<typeof renderEmail>>;

// Two ways to send, whichever is configured:
//   SMTP (e.g. a Krystal mailbox): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
//   Resend: RESEND_API_KEY
function mailer() {
  const from = process.env.EMAIL_FROM;
  if (!from) return null;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    return async (to: string, c: Content): Promise<Delivery> => {
      try {
        await transport.sendMail({ from, to, subject: c.subject, text: c.text, html: c.html });
        return { ok: true };
      } catch (e) {
        // 5xx = permanent (bad address etc.); anything else may succeed on retry.
        const code = (e as { responseCode?: number }).responseCode;
        return {
          ok: false,
          final: Boolean(code && code >= 500),
          code: code ? `smtp_${code}` : "network",
        };
      }
    };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return async (to: string, c: Content): Promise<Delivery> => {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: c.subject, text: c.text, html: c.html }),
      });
      if (res.ok) return { ok: true };
      // 4xx (bad address etc.) won't succeed on retry; 5xx/429 may.
      return {
        ok: false,
        final: res.status < 500 && res.status !== 429,
        code: `http_${res.status}`,
      };
    } catch {
      return { ok: false, final: false, code: "network" };
    }
  };
}

export async function sendQueuedEmails(limit = 50) {
  const send = mailer();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!send || !baseUrl) return { sent: 0, failed: 0, skipped: "email not configured" };

  const admin = createAdminClient();
  const { data: queued } = await admin
    .from("email_outbox")
    .select("id, user_id, template, link, attempts")
    .eq("status", "queued")
    .order("created_at")
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const m of queued ?? []) {
    const mark = (fields: OutboxUpdate) => admin.from("email_outbox").update(fields).eq("id", m.id);
    const { data: user } = await admin.auth.admin.getUserById(m.user_id);
    const to = user?.user?.email;
    const content = renderEmail(m.template, m.link, baseUrl);
    if (!to || !content || UNDELIVERABLE.test(to)) {
      await mark({ status: "failed", error_code: !content ? "unknown_template" : "no_address" });
      failed++;
      continue;
    }
    const result = await send(to, content);
    if (result.ok) {
      await mark({ status: "sent", sent_at: new Date().toISOString(), attempts: m.attempts + 1 });
      sent++;
    } else {
      const final = result.final || m.attempts + 1 >= 5;
      await mark({
        status: final ? "failed" : "queued",
        attempts: m.attempts + 1,
        error_code: result.code,
      });
      if (final) failed++;
    }
  }
  return { sent, failed };
}

// Removes storage files and login accounts queued by the database (anonymisation, expired exports,
// abandoned uploads).
export async function processCleanupQueue(limit = 100) {
  const admin = createAdminClient();
  const { data: items } = await admin.from("cleanup_queue").select("*").order("id").limit(limit);
  let done = 0;
  for (const it of items ?? []) {
    let ok = false;
    if (it.kind === "storage" && it.bucket && it.path) {
      const { error } = await admin.storage.from(it.bucket).remove([it.path]);
      ok = !error;
    } else if (it.kind === "auth_user" && it.user_id) {
      const { error } = await admin.auth.admin.deleteUser(it.user_id);
      ok = !error || /not.?found/i.test(error.message);
    }
    if (ok || it.attempts >= 10) {
      await admin.from("cleanup_queue").delete().eq("id", it.id);
      if (ok) done++;
    } else {
      await admin
        .from("cleanup_queue")
        .update({ attempts: it.attempts + 1 })
        .eq("id", it.id);
    }
  }
  return { done, pending: (items?.length ?? 0) - done };
}
