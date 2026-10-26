# Build progress & decisions log

Read this first when resuming work in a new session.

## Decisions
- Retention: **minimum 6 years** for all personal data (AbsorbHR, 26 Oct). Phase 5 schedule uses 6 years as a floor.
- Hosting: Vercel (London, lhr1). Email: Resend (Phase 5). Code: this GitHub repo.
- Logo: `public/brand/absorbhr-logo.svg` (placeholder until the real file is added).
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
- [ ] Phase 4 — people processes: **built and tested, awaiting AbsorbHR approval**
  - Decisions (26 Oct): disciplinary/grievance cases **HR only** (no assigned managers); review scoring chosen per
    company (written only, or 1–5 with company labels); 1-to-1 notes shared by default with optional private notes
    (author + HR) and a SAR warning
  - Migrations 0012–0013; 40 tables, RLS on all; 191 pgTAP tests passing (50 for Phase 4)
  - Pages: /checklists (+ templates), /reviews, /cases (HR only, not support), /requests; profile gains 1-to-1 notes,
    diversity form (self only, when enabled) and a Cases link for HR; dashboard "My to-do list" + holiday summary;
    review settings in /settings
  - Demo: `supabase/seed_people.sql` (onboarding checklist, review cycle with 3 reviews, notes, 1 grievance case,
    1 correction request)

## Follow-ups noted for later phases
- Scheduled clean-up of abandoned uploads (`documents.status = 'uploading'` older than a day) and orphaned files.
- Virus scanning for uploads: deferred by AbsorbHR (26 Oct); revisit before go-live.
- AbsorbHR will supply its own template policy library later (bulk import; see below).
- Template management screens were only tested at database level (AbsorbHR admin's 2FA is on the user's phone).
- Irregular-hours/part-year 12.07% accrual (deferred by AbsorbHR); first-year monthly accrual rule (decision needed).
- Email notifications for leave decisions (Phase 5).
- Convert the Playwright walkthrough / accessibility / idle-timeout scripts into a committed `npm run test:e2e` suite
  (needs a test-only seed password + TOTP handling).
- Audit log viewer: add filters and paging (currently latest 300 entries). People without an employee record
  (e.g. the QA login) show as "removed user" — show their email instead.
- Email reminders for checklist tasks, review deadlines and correction requests (Phase 5).
- SAR export must include private 1-to-1 notes and flag case records for HR redaction review (Phase 5).
- Invitations need the correct service key and, for reliable delivery, Resend SMTP (Phase 5).
