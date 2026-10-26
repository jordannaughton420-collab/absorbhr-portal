# AbsorbHR Portal — Data Protection Documentation

**Status:** Living document, updated at the end of each build phase. **Current coverage: Phases 1–2 (foundations; absence and leave).**
Use it as technical input to a Data Protection Impact Assessment (DPIA). Items marked **[DECISION]** need a
business or legal decision; items marked **[LEGAL]** need review by a qualified data protection lawyer.

---

## 1. Roles and parties

| Party | Role under UK GDPR | Notes |
|---|---|---|
| Each client company (tenant) | **Controller** for its employees' data | Decides why and how employee data is used. |
| AbsorbHR (Absorb Employment Law Consultants Ltd) | **Processor** providing the platform | Needs a written processing agreement (Art. 28) with every client. **[LEGAL]** |
| Supabase Inc. | Sub-processor: database, authentication, file storage | Project hosted in **AWS eu-west-2 (London)**. Sign Supabase's DPA. **[DECISION]** |
| Vercel Inc. | Sub-processor: website hosting | Functions pinned to **lhr1 (London)** in `vercel.json`. Sign Vercel's DPA. |
| Resend | Sub-processor: email delivery (from Phase 5) | Not yet in use. |

AbsorbHR acting as an HR consultancy for a client (giving advice) may make it a controller for that advice work —
the platform role and the consultancy role should be separated in contracts. **[LEGAL]**

## 2. Where the data is stored

- **Database, authentication and files:** Supabase project `absorbhr-portal`, region **eu-west-2 (London, UK)** — verified via the Supabase Management API on 26 Oct 2026.
- **Application servers:** Vercel, London region (`lhr1`). They process data in memory; nothing is stored there.
- **Browsers:** pages are sent with `Cache-Control: private, no-store`, so personal data is not cached. The only
  browser storage used is a timestamp of the user's last activity (for the idle timeout) — no personal data.
- **No analytics, tracking or advertising** tools are used. The Inter font is self-hosted (no Google requests).

## 3. Data inventory (Phases 1–2)

"HR" means Client Admin or HR Manager with two-step verification (MFA). "Support" means an AbsorbHR staff member during a
time-limited, logged support session. Lawful bases are suggestions for the controller to confirm. **[LEGAL]**

| Data | Fields (optional fields in *italics*) | Table | Purpose | Suggested lawful basis | Who can see it | Retention **[DECISION]** |
|---|---|---|---|---|---|---|
| Core employment record | First/last name, *preferred name*, *work email*, *employee number*, *job title*, *department*, *location*, *line manager*, start date, *continuous service date*, *probation end*, contract type, *fixed-term end*, *hours*, *days per week*, status, *leaving date* | `employees` | Managing employment | Art. 6(1)(b) contract; 6(1)(c) legal obligation | HR, Support, the employee, their **direct** line manager | Employment + 6 years |
| Company directory | Name, job title, department, location, work email, manager | `employee_directory` (view) | Org chart, knowing who's who | Art. 6(1)(f) legitimate interests | Everyone in the same company | While employed (leavers drop out automatically) |
| Personal contact details | *Personal email*, *personal phone*, *address*, *town*, *postcode*, *date of birth* | `employee_personal` | Contacting the employee; age-related statutory rights (e.g. minimum wage bands) | 6(1)(b), 6(1)(c) | HR, Support, the employee | Employment + 6 years |
| Emergency contacts | Name, *relationship*, phone, *other phone* | `emergency_contacts` | Contacting someone if the employee is hurt or ill at work | 6(1)(f); vital interests in an emergency | HR, Support, the employee, direct line manager (read only) | Delete on leaving **[DECISION]** |
| Employment history | Effective date, *job title*, *department*, *manager*, *note* | `employment_history` | Record of role changes | 6(1)(b), 6(1)(c) | HR, Support, the employee (read only) | Employment + 6 years |
| Salary history | Effective date, amount, basis (annual/hourly), *reason* | `salary_history` | Pay administration, equal pay evidence | 6(1)(b), 6(1)(c) | HR, Support; the employee only if the company turns this on. **Never** line managers | Employment + 6 years |
| Right-to-work checks | Check type, date checked, who checked, outcome, *expiry*, *follow-up date*, *notes* | `right_to_work_checks` | Preventing illegal working (Immigration, Asylum and Nationality Act 2006) | 6(1)(c) legal obligation | HR, Support, the employee (read only) | Employment + 2 years (Home Office guidance) |
| Equality & diversity monitoring | *Ethnicity*, *disability*, *religion or belief*, *sexual orientation*, *gender identity* — every answer voluntary | `employee_sensitive` (**encrypted**) | Equality monitoring | Art. 9(2)(b) + DPA 2018 Sch. 1 para 8 (equality of opportunity) | The employee and HR **only**. Never managers, never AbsorbHR Support | Until withdrawn or leaving **[DECISION]** |
| Portal account | Email (login), hashed password, MFA factor, role, active flag | Supabase `auth.users`, `memberships` | Secure access | 6(1)(b), 6(1)(f) | The user; Client Admins see roles | Until access removed |
| Privacy notice acknowledgements | Notice version, user, date/time | `privacy_notice_acknowledgements` | Evidence the employee was informed (Art. 13) | 6(1)(c) | The user; HR | Employment + 6 years |
| Audit log | Who, when, action, record type, record ID, *names* of changed fields (never values), subject employee ID | `audit_log` | Security, accountability (Art. 5(2)) | 6(1)(f), 6(1)(c) | Client Admins (own company); AbsorbHR platform admins | 6 years **[DECISION]** |
| Support sessions | AbsorbHR staff member, company, reason, start/end | `support_sessions` | Transparency of AbsorbHR access | 6(1)(f) | AbsorbHR admins; the client's Client Admins | 6 years |
| Working pattern | Days normally worked (Mon–Sun), *hours*, *days per week* | `employees.working_days` etc. | Counting holiday and sickness days; pro-rata entitlement | 6(1)(b), 6(1)(c) | HR, Support, the employee, direct line manager | Employment + 6 years |
| Holiday and other leave | Dates, half days, leave type, days, status, *employee note*, approver, *decision note* | `leave_requests` | Managing statutory and contractual leave (Working Time Regulations 1998) | 6(1)(b), 6(1)(c) | HR, Support, the employee, direct line manager. Teammates see only "Away" for approved leave | Employment + 6 years (WTR records: at least 2 years) |
| Holiday adjustments | Days ±, reason, leave year, *expiry* (carry-over) | `leave_adjustments` | Carry-over, TOIL, statutory carry-over after sickness/family leave, irregular hours | 6(1)(b), 6(1)(c) | HR, Support, the employee | Employment + 6 years |
| Sickness absence dates | First/last day, part days, who recorded it, trigger exclusion (pregnancy / disability / other) | `sickness_absences` | Sick pay, absence management, return-to-work | Art. 9(2)(b) + DPA 2018 Sch. 1 para 1 (employment) | HR (MFA), the employee, direct line manager. **Never AbsorbHR Support.** Teammates see only "Away" | Employment + 6 years **[DECISION]** |
| Sickness reason | *Reason category*, *notes* — **encrypted** | `sickness_details` | As above | Art. 9(2)(b) + Sch. 1 para 1 | HR (MFA), the employee, direct line manager (decided by AbsorbHR 26 Oct 2026). Every view is logged | Employment + 6 years **[DECISION]** |
| Return-to-work form | Meeting date, fit to return, *GP seen*, *fit note received*, *adjustments*, *support offered*, *notes* — **encrypted**; employee confirmation date | `return_to_work_forms` | Supporting a safe return; reasonable adjustments (Equality Act 2010) | Art. 9(2)(b) + Sch. 1 para 1 | As sickness reason. Completed by manager/HR only; the employee confirms it | Employment + 6 years **[DECISION]** |
| Bradford Factor | Calculated on demand (spells² × days, 52 weeks); not stored | — | Prompt for supportive absence conversations | 6(1)(f) / Art. 9(2)(b) | HR (MFA), direct line manager, the employee | Not stored |
| Bank holidays | Public GOV.UK data — no personal data | `bank_holidays` | Calculating working days | — | Everyone signed in | Kept |

**Phase 2 minimisation choices:** sickness reasons are optional categories rather than free-text diagnoses; the request note field warns staff not to include health details; health details stay hidden until someone chooses to view them (and that view is logged); fit notes themselves are not uploaded until Phase 3's secure document storage.

**Deliberately not collected (data minimisation):** National Insurance number, bank details, passport/visa numbers,
photos, nationality. These would only be needed for payroll or document storage, which are out of scope or arrive in
later phases. **[DECISION]** if clients need any of them.

## 4. Technical measures (built and tested)

### Separation between client companies
- Every business table carries a `tenant_id`. **Row Level Security (RLS) is enabled on all 25 tables**, enforced by the
  database itself — not just the website.
- Composite foreign keys make it impossible to link a record to a department, location or manager in another company.
- Automated tests (`npm run test:rls`, 106 tests across tenant isolation, roles, holiday and sickness) prove that one company cannot read or modify another's employees,
  personal details, salaries, emergency contacts, right-to-work checks, user accounts or audit entries.

### Role-based access (least privilege)
- Roles: Client Admin, HR Manager, Line Manager, Employee, plus AbsorbHR platform admins.
- Line managers see **direct reports only** — not their reports' reports, not salaries, not home addresses.
- Employees see only their own records, plus the minimal company directory.
- Permissions are read live from the database on every request, so removing someone's access takes effect immediately.
- Users cannot change their own role; signing up publicly is disabled (accounts are invite-only).

### AbsorbHR support access
- AbsorbHR admins have **no standing access** to client data.
- To help a client they open a **support session**: one company, a written reason, 5–240 minutes, MFA required.
- Every session start/end and every action during it is in the client's audit log, and the client's Client Admin can
  see a list of all support sessions with their reasons (Company settings → AbsorbHR support access).
- Support sessions **can never** read special-category data (tested).

### Authentication
- Email + password or email magic link (15-minute expiry, single use).
- Passwords: at least 12 characters with upper case, lower case and a number (enforced by Supabase Auth and the app).
- **Two-step verification (TOTP authenticator app) is mandatory** for Client Admins, HR Managers and AbsorbHR admins, and
  can be required for everyone per company. The database itself refuses HR-level data to an admin session that has not
  completed MFA.
- Idle timeout: users are warned after 28 minutes and signed out after 30 (configurable 5–480 minutes per company).
- Generic sign-in errors so the portal does not reveal whether an email address has an account.
- Rate limits on sign-in (10 per 15 min), magic links (5 per 15 min), password resets (5 per hour) and MFA codes
  (10 per 15 min), keyed on a salted hash of IP and email so no IP addresses are stored. Supabase Auth applies its own
  limits in addition.

### Absence and leave (Phase 2)
- Holiday maths runs in the database: pro-rata by days worked, part-year starters and leavers, a floor at the statutory
  5.6 weeks (capped at 28 days), rounding up to the nearest half day, and bank holidays deducted from the allowance
  (company setting). It is covered by 32 worked-example tests.
- Leave requests can only be created, approved, declined or cancelled through permission-checked database functions.
  Nobody (including HR) can edit a request directly, nobody can approve their own request, and only the **direct** line
  manager or HR can decide.
- Holiday can't be booked until a Client Admin has confirmed the company's holiday rules, including carry-over.
- Sickness records are restricted to the employee, their direct line manager and MFA-verified HR in their own company.
  AbsorbHR support sessions are excluded from sickness entirely (25 tests).
- HR can exclude pregnancy-related or disability-related absence from the Bradford Factor and triggers, to help avoid
  discrimination under the Equality Act 2010. The screen says this is a prompt for support, not an automatic trigger.
- The team calendar shows colleagues only "Away", never the type of leave or sickness.
- Bank holidays are fetched daily from GOV.UK by the database itself (no personal data leaves the system).

### Encryption
- **In transit:** HTTPS only; `Strict-Transport-Security` header with preload.
- **At rest:** Supabase encrypts all database storage (AES-256) and backups.
- **Column-level:** special-category data (diversity answers, sickness reasons, return-to-work notes) is encrypted with AES-256 (`pgcrypto`) using a key generated inside the
  database and stored in **Supabase Vault**. The key never appears in code, configuration or the browser. Decryption
  only happens inside a database function that checks permission and writes an audit entry in the same step.

### Audit trail
- Database triggers record every create, update and delete of personal data automatically.
- Views of another person's record, sign-ins, sign-outs, MFA events and privacy acknowledgements are recorded by the app.
- Changed **field names** are logged, never the values.
- The log is **append-only**: update, delete and truncate are blocked for every role, including the database owner (tested).

### No personal data in logs, URLs or error messages
- URLs contain only random record IDs. Employee search runs in the browser, so names never appear in URLs.
- Server errors are logged as a reference code and error category only. Database error text (which can contain values)
  is never shown or logged. Verified during Phase 1 testing: the server log contained no names, emails or postcodes.

### Other safeguards
- Security headers: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` (no camera/microphone/location).
- Input validation with the same Zod rules in the browser and on the server, plus database constraints.
- The service-role ("master") key is used only on the server, only for inviting users and rate limiting, and only after
  checking the caller's permission.
- Privacy notice shown to every user on first sign-in; access is blocked until acknowledged; acknowledgements recorded.

## 5. Data subject rights

| Right | Status |
|---|---|
| Be informed (Art. 13) | ✅ Privacy notice gate with recorded acknowledgement. Wording is a **draft placeholder**. **[LEGAL]** |
| Access (Art. 15) | Phase 5: one-click SAR export (ZIP: JSON + PDF). Until then, HR can view all data on the employee page. |
| Rectification (Art. 16) | ✅ Employees can correct their own contact details and emergency contacts. A formal "request a correction" workflow for HR-held data arrives in Phase 4/5. |
| Erasure / anonymisation (Art. 17) | Phase 5: erasure tool and automatic anonymisation via retention schedule. Employee records cannot be deleted in the app meanwhile (no delete permission exists). |
| Restriction / objection | Handled manually by HR for now. **[DECISION]** whether to build a workflow. |
| Withdraw consent (diversity data) | Database support built and tested (clearing the answers deletes the record). The employee-facing form arrives with the self-service dashboard in Phase 4; diversity collection is off by default. |

## 6. Retention — proposed defaults **[DECISION] [LEGAL]**

To be confirmed before Phase 5 builds the automatic schedule.

| Data | Proposed period | Basis for proposal |
|---|---|---|
| Leaver core record, salary, employment history | 6 years after leaving | Limitation Act 1980 (contract claims) |
| Right-to-work check records | 2 years after employment ends | Home Office employer guidance |
| Emergency contacts | Delete on leaving | No purpose after employment |
| Diversity monitoring | Delete on leaving (aggregate stats only kept) | Minimisation |
| Holiday records | Employment + 6 years (minimum 2 years for Working Time Regulations records) | WTR 1998 reg. 9; contract claims |
| Sickness records, reasons, return-to-work forms | Employment + 6 years, or shorter if no claim risk | Statutory Sick Pay records; personal injury and discrimination claims — **[LEGAL]** consider 3 years after leaving for health detail |
| Audit log | 6 years | Accountability evidence |
| Unused portal accounts | Disable on leaving date | Security |

## 7. Organisational measures (for AbsorbHR to complete)

- [ ] Art. 28 processing agreement template for clients **[LEGAL]**
- [ ] Sub-processor list published to clients (Supabase, Vercel, Resend)
- [ ] Sign Supabase and Vercel DPAs
- [ ] Staff confidentiality and data protection training for anyone with platform admin access
- [ ] Quarterly review of who holds AbsorbHR platform admin access
- [ ] Breach response procedure (72-hour ICO notification) — the in-app breach log arrives in Phase 5
- [ ] ICO registration / data protection fee check
- [ ] Independent penetration test before onboarding the first real client

## 8. Known gaps and go-live requirements

| Item | Why | Action |
|---|---|---|
| Supabase **Pro** plan | Needed for breached-password checking (HaveIBeenPwned), server-side session time limits, point-in-time backups, no auto-pausing | Upgrade before real data; then enable these settings |
| Correct secret key in the environment | Rate limiting and invitations depend on it; in production, sign-in **refuses** requests if rate limiting can't run | Replace `SUPABASE_SERVICE_ROLE_KEY` with a key from the London project |
| Custom email sender (Resend) | Supabase's built-in email is for testing only and heavily limited | Phase 5 |
| Vault encryption key | If lost, encrypted special-category data cannot be recovered. It is held in the database and included in Supabase backups of the same project | Never delete the `pii_encryption_key` secret; document backup/restore procedure |
| Demo data | The development project contains fake people with a shared demo password | Never use the development project for real data; create a separate production project |
| Irregular-hours / part-year workers | 12.07% accrual (Employment Rights (Amendment, Revocation and Transitional Provision) Regulations 2023) not yet automated | HR uses holiday adjustments meanwhile; deferred by AbsorbHR decision |
| First-year accrual rule | WTR reg. 15A (holiday accrues monthly in the first year) is not enforced | **[DECISION]** whether to enforce or leave to HR judgement |
| Statutory carry-over | Carry-over required by law (e.g. after long sickness or family leave) is added manually by HR | **[LEGAL]** confirm the process |
| QA test login | `qa.admin@example.com` (Client Admin, no employee record) exists in the development project for automated browser testing | Remove before any real use; never create in production |
| Automated accessibility checks | All Phase 1–2 pages pass axe-core WCAG 2.1 AA checks; automated tools catch only part of the issues | Manual screen-reader test before go-live |
