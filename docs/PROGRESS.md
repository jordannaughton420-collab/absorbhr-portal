# Build progress & decisions log

Read this first when resuming work in a new session.

## Decisions
- Retention: **minimum 6 years** for all personal data (AbsorbHR, 26 Oct). Phase 5 schedule uses 6 years as a floor.
- Hosting: Vercel (London, lhr1). Email: Resend (Phase 5). Code: this GitHub repo.
- Logo: `public/brand/absorbhr-logo.png` (real AbsorbHR logo, recoloured to exactly `#570080`, 28 Oct 2026); icons in `app/`.
- Database: hosted **development** Supabase project `absorbhr-portal`, ref **`djdjrrziukllerhhnrix`**,
  region **eu-west-2 (London)** — verified 26 Oct 2026. Local Docker Supabase is blocked by the cloud
  environment's network policy, so migrations, seed and RLS tests run through the Supabase Management API
  (`scripts/db.mjs`, needs `SUPABASE_ACCESS_TOKEN`). Node needs `NODE_USE_ENV_PROXY=1` behind the session proxy.
- Auth config set via Management API: sign-ups disabled (invite-only), 12-char passwords with upper/lower/digit,
  15-min email links, password-change notifications, `uri_allow_list = http://localhost:3000/**`.
  Pro-plan-only settings (HIBP, session timebox/inactivity) still to enable at go-live.
- UI components are hand-written in shadcn/ui style (the shadcn registry isn't reachable from the session).
- Line managers = direct reports only. Emergency contacts visible to direct line manager (read only) — confirm.
- Employees can't see their own salary unless the company setting is on (default off) — confirm.
- Diversity monitoring is off by default per company; self-service form on the employee's own profile (Phase 4).

## Environment variables expected in the cloud session
`NEXT_PUBLIC_SUPABASE_URL` (should be `https://djdjrrziukllerhhnrix.supabase.co`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (must be a secret key **from the London project**), `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF=djdjrrziukllerhhnrix`, `IP_HASH_SECRET`.
All environment variables verified correct on 26 Oct 2026 (rate limiting and invitations tested working).

## Deployment
- Test site: https://absorbhr-portal.vercel.app (Vercel Hobby, auto-deploys from `main`). Supabase `site_url` and redirect allow-list set to it.
- This cloud session cannot reach `vercel.app`/`vercel.com` (network policy).

## Status
- [x] Phase 0 — scaffold, brand theme, security headers, Supabase auth config
- [x] Phase 1 — built, tested and **approved by AbsorbHR on 26 Oct 2026** (commit `a514560` — restore with `git checkout a514560`)
  - 4 migrations, 17 tables, RLS on all; 49 pgTAP tests passing
  - Bugs caught by tests and fixed: NULL access checks let support sessions read special-category data
    (migration 0004); idle timer reset itself while the warning was showing
  - Browser walkthrough passed for every role; axe-core WCAG 2.1 AA checks pass on all pages
- [x] Phase 2 — absence & leave: **approved by AbsorbHR on 26 Oct 2026** (commit `706fbb9`)
  - Decisions (26 Oct): bank holidays included in allowance by default; carry-over has no default — each company must
    confirm its holiday rules before holiday can be booked; irregular-hours 12.07% accrual deferred; sickness reasons
    visible to HR + direct line manager (not AbsorbHR support)
  - Migrations 0005–0007; 25 tables, RLS on all; 106 pgTAP tests passing (32 holiday worked examples, 25 sickness)
  - Bank holidays: pg_net fetch from GOV.UK + pg_cron daily job `refresh-bank-holidays` (03:17)
  - Demo absence data: `supabase/seed_absence.sql` (Brightwater configured; Northgate deliberately unconfigured)
  - QA login `qa.admin@example.com` (Client Admin, no employee record) for browser tests; TOTP secret in the
    session scratchpad only
- [x] Phase 3 — documents & policies: **approved by AbsorbHR on 26 Oct 2026** (commit `57ee921`)
  - Decisions (26 Oct): uploads by HR, employee and direct line manager; HR chooses re-acknowledgement per version;
    PDF/DOCX/JPEG/PNG/HEIC up to 10 MB; AbsorbHR template library that clients copy
  - Migrations 0008–0011; buckets `employee-documents`, `policy-documents` (private, no storage policies);
    29 tables, RLS on all; 141 pgTAP tests passing
  - Fixes found during the build: uploader exception bypassed MFA (0011); forged file path could make server
    read/delete another tenant's policy file (validated before storage access); native GET form submission could put
    passwords in URLs (forms now POST and stay disabled until hydrated)
  - Demo: `supabase/seed_policies.sql` (3 AbsorbHR templates + Brightwater policies), `scripts/seed-documents.mjs`
- [x] Phase 4 — people processes: **approved by AbsorbHR on 26 Oct 2026** (commit `7bc5ef4`)
  - Decisions (26 Oct): disciplinary/grievance cases **HR only** (no assigned managers); review scoring chosen per
    company (written only, or 1–5 with company labels); 1-to-1 notes shared by default with optional private notes
    (author + HR) and a SAR warning
  - Migrations 0012–0013; 40 tables, RLS on all; 191 pgTAP tests passing (50 for Phase 4)
  - Pages: /checklists (+ templates), /reviews, /cases (HR only, not support), /requests; profile gains 1-to-1 notes,
    diversity form (self only, when enabled) and a Cases link for HR; dashboard "My to-do list" + holiday summary;
    review settings in /settings
  - Demo: `supabase/seed_people.sql` (onboarding checklist, review cycle with 3 reviews, notes, 1 grievance case,
    1 correction request)

- [x] Phase 5 — reports, emails, GDPR tools: **approved by AbsorbHR on 26 Oct 2026** (commit `33a4a22`)
- [ ] Go-live — **decided 27 Oct 2026: no new subscriptions.** Krystal hosts absorbhr-portal.co.uk (cPanel Node.js 22,
  Passenger; start file `deploy/krystal/app.js`, standalone build in `build/`), Supabase free London project for
  production, email via Krystal mailbox SMTP, cPanel cron every 5 min calls /api/cron/dispatch, GitHub Actions
  `.github/workflows/deploy-krystal.yml` builds and rsyncs over SSH (port 722). Steps: docs/GO-LIVE-KRYSTAL.md.
  - 27 Oct: production Supabase project created by AbsorbHR — `gnvmakhtgnswlmsdquai` (London, Postgres 17), empty;
    the session's access token now only sees this project.
  - 27 Oct (AbsorbHR go-ahead): migrations 0001–0014 applied, **no seed data**; 44 tables, RLS on all; Vault has
    `pii_encryption_key`; cron jobs refresh-bank-holidays, daily-housekeeping, dispatch-email; 280 bank holidays
    imported; all 238 pgTAP tests pass on production (rolled back, nothing left behind)
  - Auth: sign-ups off, site URL + redirect allow-list `https://absorbhr-portal.co.uk`, 12-char passwords with
    lower/upper/digit, reauthentication for password change, TOTP on. Session time-box/inactivity timeout and
    leaked-password check are Pro-only (app's own idle timeout still applies)
  - Platform admin `sales@absorbhr.co.uk` created with no password (sets one via /forgot-password once Part 6 SMTP
    is live). Vault `cron_secret`/`app_base_url` not set yet — Krystal cPanel cron (Part 5) calls dispatch instead
  - 27 Oct: **portal live on https://absorbhr-portal.co.uk** (deploy run 7, from branch `claude/clever-allen-efixmz`).
    Fixes on the way: Node 22 (supabase-js/vitest need it; cPanel app switched to 22), lint exception for
    `deploy/krystal/app.js`, deploy key made on the PC (cPanel keygen insists on a passphrase), rsync replaced by
    tar over ssh (Krystal's shell broke rsync), Krystal support enabled SSH shell access, uploads/site check now
    fail loudly (an earlier run falsely passed on cPanel's placeholder page)
  - 27 Oct: redirects fixed to use NEXT_PUBLIC_SITE_URL (Passenger made them point at localhost:3000). AbsorbHR
    admin `sales@absorbhr.co.uk` has set its password. Demo company **Brightwater Bakery Ltd (Demo)** created on
    production with `scripts/seed-demo-company.mjs` (29 made-up staff); logins on `jordannaughton420+admin/hr/
    manager/employee@gmail.com`, no passwords (set via Forgot password). Remove by deleting that tenant + 4 users
  - Nightly backup: `.github/workflows/backup-nightly.yml` (off until `BACKUP_ENABLED`) — `supabase db dump`
    (roles/schema/data) + Vault secrets + storage files (`scripts/backup-storage.mjs`), gpg AES-256 with
    `BACKUP_PASSPHRASE`, rsync to `~/absorbhr-backups` on Krystal, 30 kept. Setup/restore: Part 7 of the guide.
    Storage download and encrypt/decrypt tested locally; database dump untested until the secrets exist
  - Decisions (26 Oct): retention — nightly job lists records due after 6 years, **HR confirms** before anonymising
    (can hold back for live claims); SAR export run by **HR/Client Admin only**, with case records and private notes
    flagged for review before release; **AbsorbHR admins can see every client's breach log** (summary only);
    Resend not yet set up — emails queue safely until the key is added
  - Migration 0014; 44 tables, RLS on all; 238 pgTAP tests passing (47 for Phase 5)
  - Pages: /reports (+ CSV export route), /privacy-tools (SAR exports, retention review, holds, early erasure,
    retention period, erasure log), /breaches (Client Admin; AbsorbHR admins read all); dashboard to-dos for HR
  - Email: triggers queue to `email_outbox`; `/api/cron/dispatch` (Bearer `CRON_SECRET`) sends via Resend and processes
    `cleanup_queue` (storage files, auth users). pg_cron `dispatch-email` every 5 min calls it via pg_net once Vault has
    `cron_secret` + `app_base_url` (writing Vault from this session was blocked by the permission classifier — user step
    in docs/GO-LIVE.md); `daily-housekeeping` 02:43; Vercel cron daily backup
  - Demo: `supabase/seed_gdpr.sql` (3 leavers: one due, one due in 30 days, one recent; 1 breach)
  - Libraries added: fflate (ZIP), pdf-lib (PDF summary)

- [ ] Phase 6 — AI assistant: **built 18 Nov 2026 on this computer (Denise/absorbhr-portal), not yet live**
  - Decisions (owner, 17–18 Nov): one assistant per company, off until the Client Admin switches it on; it only
    *suggests* changes and the person who asked must tap Confirm (accountability stays with a person); company
    notes saved only on Confirm; chats kept 6 years by default (company may shorten), private to the person;
    confirmed changes recorded permanently in the audit log; model Claude Opus 5.5 (`ASSISTANT_MODEL` to change)
  - Migration 0015 (`assistant_*` tables, settings columns, claim/finish/cancel functions, SAR function,
    anonymise trigger, `assistant-housekeeping` cron 02:53); 08_assistant.sql 45 pgTAP tests; 283 total pass on
    the test database. Unit tests: tests/assistant.test.ts
  - Code: lib/assistant/ (schemas, tools, run loop, execute), app/(app)/assistant (chat, confirm cards, notes),
    Company settings "AI assistant" card, nav link, SAR export includes assistant data
  - Needs `ANTHROPIC_API_KEY` on the server (and the test computer); without it the page says it isn't connected
  - Fixed on the way: 07_gdpr_tools breach-log test assumed an empty breach log
  - Before live: Anthropic DPA + sub-processor list/privacy notice (docs/GDPR.md), try it end to end, then deploy

## Follow-ups noted for later phases
- Virus scanning for uploads: deferred by AbsorbHR (26 Oct); revisit before go-live.
- AbsorbHR will supply its own template policy library later (bulk import; see below).
- Template management screens were only tested at database level (AbsorbHR admin's 2FA is on the user's phone).
- Irregular-hours/part-year 12.07% accrual (deferred by AbsorbHR); first-year monthly accrual rule (decision needed).
- Convert the Playwright walkthrough / accessibility / idle-timeout scripts into a committed `npm run test:e2e` suite
  (needs a test-only seed password + TOTP handling).
- Audit log viewer: add filters and paging (currently latest 300 entries).
- Email reminders for overdue checklist tasks and review deadlines; policy-published emails (dashboard covers these now).
- Retention review for old records of *current* employees (decision needed).
- In-app notification centre (the dashboard to-do list covers this for now).
- Invitations need Resend SMTP configured in Supabase for reliable delivery (docs/GO-LIVE.md step 3).

## Rate-limit address fix — 18 Nov 2026 (deployed on its own, on top of a35bb63)
- Problem: `clientIp()` took the **first** `X-Forwarded-For` value (then `X-Real-IP`). Visitors write those
  themselves, so a password guesser could send a new made-up address on each try and never hit the login or 2-step
  limits. `ipHash()` had the same weakness (not called anywhere yet).
- Fix: `lib/client-ip.ts` takes the entry added by our own proxy, counted `TRUSTED_PROXY_HOPS` in from the **right**
  (default 1 = Krystal's LiteSpeed; set 2 if a CDN is ever put in front). `X-Real-IP` is no longer read. Next.js fills
  `X-Forwarded-For` from the connection only when it is missing, so local runs still get the real address. Still
  hashed with `IP_HASH_SECRET`; no raw addresses stored.
- New per-account buckets that ignore the address: `loginAccount` (30 per 15 min per email) and `mfaVerifyAccount`
  (10 per 15 min per signed-in user). `verifyMfa` now gets the user first and refuses if signed out.
- Tests: `tests/client-ip.test.ts`. Lint, typecheck, unit tests and the production build pass; the end-to-end suite
  (on the working copy, test database) passed with the same change.
- The live site answers as `server: LiteSpeed`, not Apache. **To ask Krystal support:** (1) when LiteSpeed passes a
  request to our cPanel Node.js app, does it add the visitor's real IP to the end of `X-Forwarded-For` (or replace
  the header), or pass on what the visitor sent? (2) is "Use Client IP in Header" set to No or Trusted IP Only (not
  Yes)? (3) is any proxy or CDN in front of LiteSpeed? If it passes the header on unchanged, ask which header LiteSpeed
  sets instead; the per-account limits still protect each login meanwhile.
