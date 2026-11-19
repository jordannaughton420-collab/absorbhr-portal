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
- ~~Convert the Playwright walkthrough / accessibility / idle-timeout scripts into a committed `npm run test:e2e`
  suite~~ — done 18 Nov 2026, see "End-to-end tests" below.
- Next end-to-end batch: documents (upload/download), policies (publish → acknowledge), checklists, reviews,
  1-to-1 note privacy, cases, SAR export download, breach log entry, reports CSV.
- Audit log viewer: add filters and paging (currently latest 300 entries).
- Email reminders for overdue checklist tasks and review deadlines; policy-published emails (dashboard covers these now).
- Retention review for old records of *current* employees (decision needed).
- In-app notification centre (the dashboard to-do list covers this for now).
- Invitations need Resend SMTP configured in Supabase for reliable delivery (docs/GO-LIVE.md step 3).

## End-to-end tests (Playwright) — added 18 Nov 2026 on this computer
- `npm run test:e2e` runs Playwright in the installed Google Chrome against its own production build (`next build` + `next start`) on port 3100
  (`NEXT_DIST_DIR=.next-e2e`, so it can run beside `npm run dev`; dev mode was flaky because pages rebuilt mid-test), **test database only**: `e2e/guard.mjs`
  stops the run unless the settings point at `djdjrrziukllerhhnrix`, and every page blocks requests to the live site.
- `npm run test:e2e:reset` reseeds the test database with `SEED_PASSWORD` from `.env.local` and clears
  `app.rate_limits`. Sign-ins are saved in `e2e/.auth/` (git-ignored) and reused for 40 minutes, because login and
  MFA are rate limited (10 per 15 min). The setup enrols TOTP through the real /auth/mfa page and keeps the key there.
- 45 tests, all passing 18 Nov 2026. Covered: sign-in, wrong password, sign-out, admin blocked until 2-step, idle warning + timeout (fake clock);
  Northgate can't open or list Brightwater staff; employee/manager kept out of HR pages; employee can't open a
  colleague; manager sees own team only; holiday request → manager approval → cancel; unconfigured company can't
  book holiday; assistant off by default; axe WCAG 2.1 AA on 23 pages across 4 roles; phone width on 2 pages.
- `npm run test:live`: read-only check of absorbhr-portal.co.uk (login page, signed-out redirect, security headers).
- Fixed on the way: screen-reader-only table labels made pages 1px too wide on phones (`components/ui/table.tsx`
  wrapper is now `relative`).
- ~~Found, not fixed: `lib/rate-limit.ts` trusts the first `X-Forwarded-For` value~~ — fixed 18 Nov 2026, see below.

## Rate-limit address fix — 18 Nov 2026 (LIVE: commit c55be3d, deployed 18 Nov 16:13 on its own, on top of a35bb63)
- Problem: `clientIp()` took the **first** `X-Forwarded-For` value (then `X-Real-IP`). Visitors write those
  themselves, so a password guesser could send a new made-up address on each try and never hit the login or 2-step
  limits. `ipHash()` had the same weakness (it is not called anywhere yet).
- Fix: `lib/client-ip.ts` takes the entry added by our own proxy — counted `TRUSTED_PROXY_HOPS` in from the
  **right** (default 1 = LiteSpeed only; set 2 if a CDN is ever put in front). `X-Real-IP` is no longer read. Next.js
  fills `X-Forwarded-For` from the connection only when it is missing (`base-server.js`, `??=`), so local runs still
  get the real address. Still hashed with `IP_HASH_SECRET`; no raw addresses stored.
- Added per-account buckets that ignore the address entirely: `loginAccount` (30 per 15 min per email, from all
  addresses together) and `mfaVerifyAccount` (10 per 15 min per signed-in user). These hold even if the address is
  ever wrong. `verifyMfa` now gets the user first and refuses if signed out.
- Tests: `tests/client-ip.test.ts` (forged left-hand entries ignored, hop counting, ports/IPv6, junk → `unknown`,
  setting parsing).
- Live server check (read-only headers, 18 Nov): the live site answers as `server: LiteSpeed`, not Apache as
  assumed, so LiteSpeed is the web server in front of the Node app. Whether LiteSpeed
  **adds** the visitor's real address to the end of `X-Forwarded-For` for Node apps can't be seen from outside (no
  route echoes headers, and signing in to test was off limits).
  If LiteSpeed does **not** add it, the per-account limits above still stop guessing one account's password.
- **To ask Krystal support:** (1) when LiteSpeed passes a request to our cPanel Node.js app, does it add the visitor's
  real IP to the end of `X-Forwarded-For` (or replace the header), or pass on what the visitor sent? (2) is "Use
  Client IP in Header" set to No or Trusted IP Only (not Yes)? (3) is any proxy or CDN in front of LiteSpeed?
  Adds/replaces + not Yes + no CDN = fix is right as is. CDN that adds an entry = set `TRUSTED_PROXY_HOPS=2` in
  cPanel's Node.js app settings. Passes it through unchanged, or Yes = the address can still be faked; ask which
  header LiteSpeed sets instead and change `lib/client-ip.ts`.
- Checked 18 Nov: lint, typecheck, 45 unit tests and 45 end-to-end tests pass (fresh sign-ins including 2-step).

## Merged into main — 18 Nov 2026
- `main` now holds everything on `claude/clever-allen-efixmz` (rate-limit fix, AI assistant, end-to-end tests) plus
  main's own `CLAUDE.md` memory commits.
- **Deploys are by hand only from now on** (owner's decision): `deploy-krystal.yml` lost its push-to-main trigger, so
  neither the merge nor later memory commits to main deploy anything. Deploy with GitHub → Actions → Deploy to
  Krystal → Run workflow. Live is still `c55be3d` (rate-limit fix, no assistant).
- Before deploying the assistant: apply migration 0015 to the live database first, or saving company settings and
  the subject access export break (they use the new columns and tables).
- The nightly backup job is now on main but stays off until `BACKUP_ENABLED` and its secrets are set (Part 7 of
  docs/GO-LIVE-KRYSTAL.md).

## Live database: migration 0015 applied — 18 Nov 2026
- Applied to production (`gnvmakhtgnswlmsdquai`) through the Supabase connector at the owner's request, in one
  transaction with guards (0014 present, 0015 absent). Recorded in `supabase_migrations.schema_migrations`.
- Result: 4 assistant tables, 0 companies with the assistant on, `assistant-housekeeping` cron scheduled.
- Checked against the test database object by object (functions, columns, constraints, policies, triggers,
  indexes, grants, RLS, cron): all 41 match. The one difference is a code comment left out of
  `app.assistant_housekeeping`, and it matches once that comment is ignored.
- Deployed 18 Nov 2026: "Deploy to Krystal" run on `main` (`17cbefb`, run 44355314681), all steps passed. Live now has
  the rate-limit fix, the assistant (off for every company) and the end-to-end tests. `npm run test:live` passes;
  no database errors in the live logs afterwards.

## Shifts, rota and open shifts — built 18 Nov 2026 on this computer (test database only, NOT live)
- Owner's request (18 Nov): admin, HR and (if allowed) managers can mark staff as open-shift workers, post a shift
  (e.g. tonight 8pm to 5am), it goes to those people, the first to accept gets it and nobody else can; the
  assistant can do the posting. Design and competitor research: side-session notes
  `open-shifts-and-competitor-features-2026-11-18.md`.
- Decisions: first to accept wins (no approval step yet); email alert only (no SMS or push); open-shift groups
  managed by HR; line managers plan shifts for their own direct reports only when the Client Admin switches on
  "Let line managers plan shifts" (off by default); only the employee can accept, never the assistant.
- Migration 0016 (`shifts`, `shift_groups`, `shift_group_members`, `shift_offers`,
  `tenant_settings.managers_can_plan_shifts`; functions `create_shift`, `cancel_shift`, `add_to_shift_group`,
  `remove_from_shift_group`, `open_shift_candidates`, `post_open_shift`, `claim_open_shift`, `decline_open_shift`,
  `shifts_sar_data`; anonymise trigger; assistant kinds widened). No direct writes: everything through functions.
  - Who is left out of an open shift: approved leave, sickness, overlapping shift, under 11 hours' rest either side
    (Working Time Regulations), no portal login, not the manager's team. Planners can override the rest check
    for a directly assigned shift ("Allow a shorter rest break"); open shifts never break it.
  - First-to-accept: `claim_open_shift` locks the shift row (`for update`), so a second accept waits, then sees
    "already taken". Times are stored as UTC and entered as UK time (an end before the start = next day).
  - Emails (no shift details, per the email rule): `open_shift_offered` → each person offered, `open_shift_filled`
    → whoever posted it, `shift_cancelled` → the person whose shift was cancelled. Ordinary assigned shifts send
    no email yet (follow-up: "publish rota" notifications).
- 09_shifts.sql: 61 pgTAP tests; all 344 database tests pass on the test database. tests/shifts.test.ts: unit tests
  for UK times, form rules and who may plan. e2e/open-shifts.spec.ts: HR posts to two people, Jamie accepts,
  Morgan sees "Already taken", HR cancels; /rota and /shifts added to the accessibility checks.
- Pages: /rota (HR and line managers: week grid with holiday/sickness shown automatically, open shifts waiting,
  post an open shift, add a shift, cancel, open shift groups), /shifts "My shifts" (accept / not for me, nav shows
  how many are open), Company settings "Shifts and rota" card, shifts on the Team calendar (◷), subject access
  export includes shifts, offers and groups.
- Assistant: `list_shifts`, `list_shift_groups`, `check_open_shift`, `suggest_create_shift`,
  `suggest_cancel_shift`, `suggest_post_open_shift`, `suggest_add_to_shift_group`,
  `suggest_remove_from_shift_group` (all still need the person's Confirm).
- Going live (owner said "Yes, make it live", 18 Nov 2026): migration 0016 applied to production first, through
  the Supabase connector in one guarded transaction (0015 present, 0016 absent), recorded in
  `supabase_migrations.schema_migrations`. Checked against the test database object by object (functions, grants,
  columns, constraints, policies, triggers, indexes, RLS): all 42 match. Then this commit was pushed, merged into
  `main` and deployed with the Deploy to Krystal workflow. (Code before migration would break the Rota, My
  shifts, Company settings and the subject access export.)
- Follow-ups: optional "approval needed" mode, shift swaps, offer expiry, rota templates/copy week, notify staff
  when the rota is published, shift costs, clock in/out.

## Fix: "Something went wrong" when an admin/HR login sets a new password — 18 Nov 2026
- Seen on live 18 Nov ~22:21: a reset-link password change for an account with two-step verification was refused by
  Supabase Auth (`insufficient_aal`: AAL2 needed to change the password when MFA is enabled), and the portal showed
  the generic error.
- Fix: the "Choose a new password" page now asks for the 6-digit code too when the account has two-step
  verification and hasn't passed it yet; `updatePassword` checks the code (same rate limits as sign-in), then saves
  the password. If the code box is missing for any reason, a clear message says to enter the code.
- Test: e2e/password-reset.spec.ts (Northgate admin, signed in but not past two-step, sets a new password with the
  code; password put back afterwards). open-shifts.spec.ts now uses a unique shift label per run.

## Fix: assistant microphone stopped straight away — 18 Nov 2026
- Cause: the site-wide `Permissions-Policy: microphone=()` blocked the microphone for the portal itself, so the
  browser's speech-to-text failed at once ("not-allowed") and the button flicked back off.
- Fix: `next.config.ts` allows `microphone=(self)` on `/assistant/*` only; every other page still blocks it. The chat
  box now explains voice errors (blocked microphone, no microphone, no speech heard, network) instead of failing
  silently. docs/GDPR.md notes that Chrome/Edge speech-to-text sends audio to the browser maker's service.
- Test: e2e/microphone.spec.ts checks the header and the browser's own permission on /assistant and /dashboard.

## Assistant: everyday admin jobs — built 18 Nov 2026 (test database only, NOT live)
- Owner (18 Nov): the assistant should act like an admin in the system, but keep to each user's own permissions.
- It already runs every confirmed card as the person who confirms it (their own Supabase session and RLS), so
  roles are enforced by the database, not by the assistant. This adds ten more jobs:
  `end_sickness` (return date, manager/HR), `complete_checklist_task` (anyone, database checks the task is theirs),
  `adjust_holiday` (HR), `invite_to_portal` (Client Admin, reuses the portal's own invite), `mark_leaver` (HR; login
  stays on until access is switched off), `change_role` incl. switching access off (Client Admin, never own),
  `add_department`, `add_location` (Client Admin), `start_review` (HR or line manager), `publish_policy` (HR).
  New lookups: `list_sickness` (dates only), `list_checklist_tasks`, `list_portal_access`, `list_policies`.
- Still kept out on purpose: sickness reasons and return-to-work forms, cases, pay, right-to-work, diversity,
  subject access/anonymising/retention, breach log, security and assistant settings, deleting documents.
- Migration 0017 only widens `assistant_actions.kind`. tests/assistant-admin.test.ts (who may confirm, detail
  checks); e2e/assistant-admin-jobs.spec.ts confirms real cards: Client Admin adds a department, HR adjusts holiday,
  HR is refused a role change, a line manager is refused a holiday adjustment (the database says no).
- Going live (owner said "Yes, make it live", 19 Nov 2026): 0017 applied to production first through the Supabase
  connector (guarded, recorded); the new `assistant_actions_kind_check` matches the test database exactly. Then
  merged into `main` and deployed.
- Follow-up fix (19 Nov 2026): opening the assistant from the menu still said the browser blocked the microphone. The
  browser keeps the Permissions-Policy of the first page loaded, and Next.js swaps pages without reloading, so the
  `/assistant`-only rule never applied. `microphone=(self)` is now site-wide (camera and location still blocked,
  nothing for embedded or outside sites). e2e/microphone.spec.ts now opens the assistant from the dashboard menu.

## Assistant in the bottom corner — built 19 Nov 2026 (test database only, NOT live)
- Owner (19 Nov): the assistant should sit in the bottom corner like a website chat agent, for HR, managers and
  admins.
- `app/(app)/assistant/assistant-panel.tsx`: a round "Assistant" button bottom-right on every page (not on the
  Assistant page itself) opens a panel with the person's most recent chat, its Confirm cards and the message box
  (voice included). New chat and "open full page" buttons; Escape closes it; it stays open between pages; full
  width on phones. Shown only when the company has the assistant on, to HR (with MFA), Client Admins and line
  managers, not in support sessions and not before the privacy notice is acknowledged. Employees keep the
  Assistant page in the menu.
- Shared code: `lib/assistant/history.ts` (one chat's messages and cards, used by the page and the panel),
  `loadPanelChat` server action, `ChatBox`/`ActionCard` take optional callbacks for the panel.
- e2e/assistant-panel.spec.ts: employees don't get it; HR opens it, it passes axe, stays open moving to the Rota,
  a card is confirmed inside it, Escape closes it and returns focus; no sideways scrolling on a phone.
