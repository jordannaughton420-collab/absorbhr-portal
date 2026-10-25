# AbsorbHR Portal — Architecture & Build Plan

## Context
AbsorbHR (Absorb Employment Law Consultants Ltd) wants a secure, multi-tenant HR platform it can provide to its client businesses. Each client company is a separate "tenant" whose data must be completely walled off from every other client. The platform handles employee personal data (and some health/disciplinary data), so UK GDPR / DPA 2018 compliance is built into the foundations, not bolted on. The working folder is currently empty: this is a brand-new build.

**Decisions already made (from your answers):** code saved to a private GitHub repo you create · website hosted on Vercel (London) · emails via Resend · logo at `/public/brand/absorbhr-logo.svg` · colours primary `#570080`, secondary `#FFFFFF`, accent `#ECECEC`.

---

## 1. The big picture (plain English)

```
 Browser (staff / employees)
        │  HTTPS only
        ▼
 Next.js app on Vercel (London, lhr1)
   • Pages & forms (React, Tailwind, shadcn/ui)
   • Server code: validates every input (Zod), rate-limits, writes audit log
   • Never exposes the database "master key" to the browser
        │
        ▼
 Supabase (London, eu-west-2)
   • Postgres database — Row Level Security on EVERY table
   • Auth (passwords, magic links, MFA)
   • Private file storage (documents) — signed, expiring links only
   • Vault — holds the encryption key for health/disciplinary data
   • pg_cron — nightly jobs (retention/anonymisation, reminders, bank holidays)
        │
        ▼
 Resend — sends emails (no sensitive detail in email bodies; just "you have a request to review" + link)
```

**Why this shape:** the database itself enforces "who can see what" (Row Level Security). Even if there were a bug in a web page, Postgres would still refuse to return another company's rows. The website is the second line of defence, not the only one.

## 2. Security model — how tenant isolation and roles work

- Every business table has a `tenant_id` column. Every RLS policy starts with "row's tenant = the logged-in user's tenant".
- A small set of trusted database functions answer questions like `app.current_tenant_id()`, `app.current_role()`, `app.is_hr()`, `app.is_manager_of(employee_id)`, `app.my_employee_id()`. They read from the live `memberships` table (not cached in the login token), so if you change someone's role or they leave, access changes immediately.
- **Roles:** `super_admin` (AbsorbHR, in a separate `platform_admins` table), `client_admin`, `hr_manager`, `line_manager`, `employee`. Line managers see **direct reports only**.
- **MFA enforced for admins in the database too:** HR/admin functions return false unless the session is MFA-verified (`aal2`). So an admin who skipped MFA simply sees nothing sensitive.
- **Super Admin support access is not a blanket backdoor.** AbsorbHR staff open a time-limited "support session" for one tenant, must type a reason, and it expires (e.g. 60 min). Every open/close and every action is audit-logged and visible to the client's admins. Support sessions **cannot** see special-category data or disciplinary/grievance cases.
- **Special category data** (sickness reasons, return-to-work health notes, diversity data, disciplinary/grievance narratives) lives in separate tables, encrypted column-by-column with `pgcrypto` using a key held in Supabase Vault. It can only be decrypted through specific database functions that (a) check the caller is allowed and (b) write an audit entry in the same step — so "who viewed this" is guaranteed, not best-effort.
- **The master key (service role) is used only on the server** for a handful of jobs (inviting users, SAR exports, scheduled tasks), never in the browser.
- **Files:** private storage buckets, path pattern `tenant_id/employee_id/uuid`; storage RLS mirrors the table rules; downloads via signed URLs that expire in ~60 seconds.
- **No personal data in URLs, logs or analytics:** URLs use random IDs only; error messages are generic with a reference code; server logging strips personal fields; no third-party analytics in v1.

## 3. Database schema (summary)

All tables: `id uuid`, `tenant_id`, `created_at/updated_at`, `created_by/updated_by`, RLS on. **(opt)** = optional field.

**Platform & tenancy**
- `tenants` — company name, status, region default for bank holidays (E&W / Scotland / NI), plan tier
- `tenant_settings` — leave year start, default allowance, session timeout, retention overrides, branding text
- `platform_admins` — AbsorbHR staff user IDs
- `support_sessions` — admin, tenant, reason, started/ended/expires
- `memberships` — user ↔ tenant ↔ role (one tenant per login in v1)
- `departments`, `locations`

**People**
- `employees` — names, preferred name (opt), work email, job title, department, location, manager, start date, end date, contract type, FTE/working pattern, probation end, status. A record can exist without a login.
- `employee_personal` — personal email/phone, home address, date of birth (opt) — self + HR only
- `emergency_contacts` — name, relationship, phone
- `employment_history` — job/department/manager changes over time
- `salary_history` — **HR only** (not line managers, not employee unless you decide otherwise)
- `right_to_work_checks` — check type, date checked, checked by, status, expiry, linked document
- `employee_directory` (view) — only name, job title, department, work email, manager → powers the org chart for everyone in the tenant
- `employee_sensitive` — **encrypted**, voluntary diversity monitoring (ethnicity, disability, etc.), every field optional

**Absence & leave**
- `leave_types` (holiday, TOIL, compassionate, unpaid, parental…), `leave_policies` (allowance, includes bank holidays?, carry-over max & expiry)
- `work_patterns` — days/hours per week (drives pro-rata)
- `leave_entitlements` — per employee per leave year (calculated + manual adjustments with reason)
- `leave_requests` — dates, half-days, status, approver, decision note
- `bank_holidays` — region, date, name (loaded from GOV.UK's official feed)
- `sickness_absences` — dates, days lost (visible to manager for their reports)
- `sickness_details` — **encrypted** reason/notes, fit note document link
- `return_to_work_forms` — **encrypted** health content, completed by/at
- Bradford Factor (S² × D over rolling 52 weeks) calculated by a database function, not stored

**Documents & policies**
- `documents` — owner employee, category (contract, letter, certificate, RTW…), storage path, uploaded by, visibility (employee can see / HR only)
- `policies`, `policy_versions` (each version is a file or rich text), `policy_acknowledgements` (employee, version, timestamp)

**People processes**
- `checklist_templates` / `checklist_template_items` (onboarding/offboarding), `checklists` / `checklist_items` (assigned, due, done by)
- `review_cycles`, `performance_reviews` (self + manager sections, status), `one_to_one_notes` (shared vs manager-private notes)
- `cases` (disciplinary / grievance), `case_events`, `case_documents` — **HR only, encrypted narratives, excluded from support access**

**GDPR & compliance**
- `audit_log` — who, tenant, action (view/create/update/delete/export/login), table, record id, changed field names (not values for sensitive tables), IP hash, time. **Append-only**: no one, including admins, can update or delete it (enforced by DB permissions + trigger).
- `retention_rules` — data type, retention period, trigger event (e.g. "6 years after leaving"), action (anonymise/delete)
- `retention_runs` — what the nightly job did
- `rectification_requests` — employee asks for a correction → routed to HR → resolved with note
- `privacy_notices` (versioned text per tenant) + `privacy_notice_acknowledgements`
- `data_breaches` — Client Admin breach log (date found, description, data affected, people affected, ICO reportable? reported date, actions)
- `sar_exports` — who requested, for whom, when, file expiry
- `notifications`, `email_outbox` — in-app notices and queued emails

## 4. Project structure (key files)

```
app/(auth)/login, magic-link, mfa, reset-password
app/(app)/dashboard, employees, org-chart, leave, absence, calendar,
         documents, policies, onboarding, reviews, cases, reports,
         settings, privacy, gdpr (SAR, erasure, breaches, rectification)
app/(platform)/admin  — AbsorbHR super admin: tenants, onboarding, support sessions
lib/supabase/{server,client,admin}.ts   lib/auth/  lib/audit.ts
lib/validation/*.ts (Zod schemas shared by forms and server)
lib/leave/ (allowance, pro-rata, carry-over, bank holidays)  lib/rate-limit.ts
components/ui/ (shadcn, restyled)  components/brand/
supabase/migrations/*.sql   supabase/seed.sql   supabase/tests/*.sql (pgTAP RLS tests)
styles/globals.css (brand CSS variables)  tailwind config (tokens)
docs/GDPR.md   README.md   .env.example
```

**Theming:** brand colours defined once as CSS variables (`--brand-primary` etc.) and mapped to Tailwind tokens; shadcn components read the same variables, so re-theming = editing one file. Inter font via `next/font` (self-hosted, no Google requests from users' browsers). Rounded cards, a few subtle SVG doodle accents. AA contrast checked (white text on `#570080` passes comfortably; `#ECECEC` is used only as a background, never for text).

**Other tooling choices:** Zod for validation, react-hook-form for forms, `@react-pdf/renderer` for PDFs (SAR summary, exports), Postgres-backed rate limiting (avoids adding another data processor), Vitest for logic tests, pgTAP (`supabase test db`) for RLS tests, Playwright for a few end-to-end flows, GitHub Actions to run tests on each push.

## 5. Phased build plan

Each phase ends with: tests passing → I show you how to click through it → git commit + push → your sign-off before moving on.

### Phase 0 — Setup (short)
- **You:** create a private GitHub repo (e.g. `absorbhr-portal`) and tell me its name; I connect it to this session.
- **Me:** scaffold Next.js + TypeScript + Tailwind + shadcn, brand tokens, Inter, lint/format, `.env.example`, README skeleton. Start a local Supabase (runs inside this cloud computer via Docker — no account needed yet). *If Docker won't run here, fallback: you create a free Supabase project named `absorbhr-dev` in the London region and give me its keys via the session's secret settings — I'll walk you through it.*

### Phase 1 — Foundations
- Auth: email/password + magic link, password policy (min 12 chars, breached-password check), TOTP MFA required for admin/HR roles, inactivity timeout (default 30 min, configurable per tenant) with warning dialog, rate limits on login/reset.
- Tenancy: super admin console to create a client tenant and invite its first Client Admin; company settings, departments, locations.
- Employee records (all fields above), invite employee to log in, salary history (HR only), RTW checks with expiry.
- Org chart (from manager links, keyboard-accessible).
- Audit log + append-only protection, privacy notice page + acknowledgement on first login (needs your wording).
- RLS tests: tenant A ≠ tenant B; employee ≠ colleague; line manager = direct reports only; non-MFA admin blocked; support session limits.
- Seed: 2 fake companies, ~40 fake employees, one login per role.

### Phase 2 — Absence & leave
- Leave policies, entitlements (5.6 weeks default capped at 28 days, pro-rata by days/hours, configurable allowance, carry-over limits + expiry, part-year starters/leavers), request → approve/decline flow, cancellations.
- Bank holidays for E&W / Scotland / NI from GOV.UK feed, refreshed by scheduled job.
- Sickness recording, return-to-work forms (encrypted), Bradford Factor, team absence calendar (managers see their team; employees see "off/not off" only — no reason).
- Unit tests for every calculation with worked examples.

### Phase 3 — Documents & policies
- Private buckets, upload/download with signed URLs, file type/size limits, per-document visibility.
- Policy library, versioning, assign to all/departments, read-and-acknowledge tracking with outstanding list.

### Phase 4 — People processes
- Onboarding/offboarding checklist templates and assignments.
- Performance reviews, 1-to-1 notes (shared + manager-private).
- Disciplinary/grievance cases (HR only, encrypted, every view logged).
- Employee self-service dashboard (my leave, my documents, tasks, policies to read, rectification requests).

### Phase 5 — Reporting, notifications & GDPR tooling completion
- Reports: headcount, absence (incl. Bradford), turnover, upcoming expiries (RTW, probation) with CSV export (exports audit-logged).
- Email notifications via Resend (approvals, reminders, expiries), in-app notifications.
- SAR one-click ZIP (JSON + PDF summary), erasure/anonymisation tool, retention schedule UI + nightly anonymisation job, data breach log, rectification workflow (if not finished earlier).
- `docs/GDPR.md` completed (data inventory: what, where, why, lawful basis placeholder, retention, who can access, technical & organisational measures).
- Production deployment guide (Supabase London project, Vercel London, Resend domain).

*GDPR building blocks (audit log, encryption, RLS, privacy notice) start in Phase 1; Phase 5 adds the remaining user-facing tools.*

## 6. When I'll need you to do something
| When | What |
|---|---|
| Now | Create private GitHub repo, tell me its name |
| Phase 0 (only if Docker fails) | Free Supabase project in **London** + add keys as session secrets |
| Phase 1 | Place `absorbhr-logo.svg` in `/public/brand/` (I'll use a placeholder until then); provide privacy notice wording (or approve a clearly-marked draft for your lawyer) |
| Before Phase 5 emails | Resend account + verify your sending domain (add DNS records — I'll give exact steps) |
| Go-live | Supabase **Pro** org + London project; Vercel Pro project set to London; sign both providers' DPAs; add production secrets in Vercel |

**Rough running costs:** Supabase Pro ~$25/month (+ usage), Vercel Pro ~$20/user/month, Resend free→~$20/month. Supabase Pro is needed for production: no auto-pausing, daily backups, session controls, breached-password checks.

## 7. Things that need a lawyer or business decision (I won't guess)
1. **Privacy notice wording** and lawful basis per data type (I'll leave marked placeholders in GDPR.md).
2. **Retention periods** — I'll pre-fill common UK guidance as *defaults to be confirmed* (e.g. leaver records 6 years, RTW documents 2 years after employment ends, unsuccessful-case records, sickness records) — you/your lawyer confirm.
3. **Holiday rules nuances** — irregular-hours/part-year workers (12.07% accrual rules from April 2024), carry-over of statutory leave during sickness/family leave, whether bank holidays come out of the allowance. I'll build these as configurable; you confirm the defaults.
4. **What employees can see**: their own salary history? Colleagues in the org chart (default: names/titles only)?
5. **Diversity monitoring**: whether to collect at all (data minimisation says only if there's a purpose).
6. **NI number / bank details**: excluded by default (no payroll in scope) — tell me if clients need them.
7. **Pricing tiers / feature gating per client** — I'll add a `plan_tier` field and feature flags, but which features belong in which tier is your call.
8. **Super admin support access**: confirm the time limit and that clients should be shown when AbsorbHR accessed their data (recommended).
9. **Controller/processor roles**: clients are controllers, AbsorbHR is a processor — you'll need a client-facing DPA and a sub-processor list (Supabase, Vercel, Resend).

## 8. Verification (how we'll prove it works)
- `npm run test:rls` — pgTAP tests proving cross-tenant and cross-employee reads/writes fail, including storage files and encrypted data functions.
- `npm test` — Vitest for leave/pro-rata/carry-over/Bradford calculations and Zod schemas.
- `npm run test:e2e` — Playwright: login + MFA, book & approve holiday, upload & download a document, SAR export.
- Accessibility: automated axe checks in Playwright on every main page + keyboard walkthrough.
- After each phase: I give you a short checklist ("log in as Line Manager → you should see only 3 people") using the seeded fake accounts, run via the preview link/commands I provide.
