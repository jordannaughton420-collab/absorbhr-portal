# AbsorbHR Portal — Data Protection Documentation

**Status:** Living document, updated at the end of each build phase. **Current coverage: Phases 1–3 (foundations; absence and leave; documents and policies).**
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
| Resend | Sub-processor: email delivery | Built (Phase 5); switched on when the API key is added. Emails contain only the recipient's address, a one-line notice and a link — never names, dates or health details. Sign Resend's DPA and choose its EU region if offered. **[DECISION]** |

AbsorbHR acting as an HR consultancy for a client (giving advice) may make it a controller for that advice work —
the platform role and the consultancy role should be separated in contracts. **[LEGAL]**

## 2. Where the data is stored

- **Database, authentication and files:** Supabase project `absorbhr-portal`, region **eu-west-2 (London, UK)** — verified via the Supabase Management API on 26 Oct 2026.
- **Application servers:** Vercel, London region (`lhr1`). They process data in memory; nothing is stored there.
- **Browsers:** pages are sent with `Cache-Control: private, no-store`, so personal data is not cached. The only
  browser storage used is a timestamp of the user's last activity (for the idle timeout) — no personal data.
- **No analytics, tracking or advertising** tools are used. The Inter font is self-hosted (no Google requests).

## 3. Data inventory (Phases 1–5)

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
| Employee documents | The file itself plus title, type, file name, size, SHA-256 fingerprint, who uploaded it, who can see it | `documents` + private bucket `employee-documents` | Keeping employment records (contracts, letters, certificates, right-to-work copies, fit notes, meeting notes) | 6(1)(b), 6(1)(c); fit notes Art. 9(2)(b) | HR, plus the employee and/or direct line manager as set per document. Fit notes never to AbsorbHR Support | Contracts/letters: employment + 6 years; right-to-work copies: employment + 2 years; fit notes: as sickness **[DECISION]** |
| Policies | Title, text, attached file, versions, audience, who published | `policies`, `policy_versions`, bucket `policy-documents` | Informing staff of rules and procedures | 6(1)(b), 6(1)(f) | Everyone in the audience (published only); HR manage | While in force + 6 years for superseded versions **[DECISION]** |
| Policy acknowledgements | Employee, version, date/time | `policy_acknowledgements` | Evidence staff were told about policies (relevant in disciplinary and tribunal cases) | 6(1)(f) | HR; the employee (their own) | Employment + 6 years |
| AbsorbHR policy templates | Template text — no personal data | `policies` (no company) | Consultancy service to clients | — | AbsorbHR admins; client HR (published templates) | Kept |
| Onboarding/offboarding checklists | Checklist name, start or leaving date, tasks, who each task is for (HR/manager/employee), due dates, who ticked it off and when | `checklists`, `checklist_items` (templates: `checklist_templates`, `checklist_template_items`) | Organising joiners and leavers (e.g. right-to-work check before day one, returning equipment) | 6(1)(b), 6(1)(c), 6(1)(f) | HR, the employee, their direct line manager. Each person can tick only their own tasks | Employment + 6 years |
| Performance reviews | Review title/cycle, self-assessment, manager assessment, *rating 1–5* (only if the company turns ratings on), objectives, *employee comments*, sign-off dates | `review_cycles`, `performance_reviews` | Performance management and development | 6(1)(b), 6(1)(f) | HR, the direct line manager (reviewer), the employee. The employee can't see the manager's draft until it is shared | Employment + 6 years |
| 1-to-1 notes | Meeting date, notes, *agreed actions*, private flag, author | `one_to_one_notes` | Regular check-ins, support and development | 6(1)(f) | Author, HR, direct line manager; the employee sees notes **unless** marked private. Private notes are still disclosable in a Subject Access Request | Employment + 6 years |
| Disciplinary & grievance cases | Reference, type, stage, outcome, dates, summary and timeline — **summary and timeline encrypted**; case documents (letters, statements, notes) | `cases`, `case_events` (**encrypted**), `documents` (category *case document*, HR only) | Following fair procedures (ACAS Code of Practice), defending tribunal claims | 6(1)(b), 6(1)(c), 6(1)(f); Art. 10 / DPA 2018 Sch. 1 para 1 if criminal allegations are involved **[LEGAL]** | **HR only** (decided by AbsorbHR 26 Oct 2026), with MFA. Never line managers, never the employee in the portal, never AbsorbHR Support. HR never sees a case about themselves. Every view is logged | Case closed + 6 years **[DECISION]** |
| Correction requests | Area (personal details, job, pay, absence, documents, other), what's wrong, status, HR reply, who resolved it and when | `rectification_requests` | Handling the right to rectification (Art. 16) | 6(1)(c) legal obligation | The employee (their own); HR | 6 years after the request is closed |
| Subject access exports | Who it's for, date received, who created/released it, the ZIP file (all data above, plus document copies) | `sar_exports`, private bucket `sar-exports` | Answering access requests (Art. 15) | 6(1)(c) | HR only (MFA, not support, not about themselves) | File deleted automatically after 30 days; the record (no data) kept 6 years |
| Erasure log | Which (anonymised) record, when, who, whether early, reason | `erasure_log` | Evidence of erasure / retention compliance (Art. 5(2)) | 6(1)(c) | HR | Kept (contains no personal data about the erased person beyond an ID) |
| Breach log | Title, dates, description (no names), kinds of data, number affected, risk, ICO decision and reason, ICO reference, actions | `data_breaches` | Art. 33(5) breach record | 6(1)(c) | The company's Client Admins; AbsorbHR admins (read only, all companies — decided by AbsorbHR 26 Oct 2026) | 6 years **[DECISION]** |
| Email notifications | Recipient (login), notification type, link, sent/failed status | `email_outbox` | Telling people something needs their attention | 6(1)(b), 6(1)(f) | Server only (nobody can read it in the app) | Deleted 90 days after sending |
| Reports and CSV exports | Calculated on demand from the data above; not stored | — | Workforce planning, absence management, compliance deadlines | 6(1)(f), 6(1)(c); absence: Art. 9(2)(b) | HR (MFA). The absence report is never available in AbsorbHR support sessions | Not stored by the portal; downloaded files are the company's responsibility |

**Phase 2 minimisation choices:** sickness reasons are optional categories rather than free-text diagnoses; the request note field warns staff not to include health details; health details stay hidden until someone chooses to view them (and that view is logged); fit notes themselves are not uploaded until Phase 3's secure document storage.

**Deliberately not collected (data minimisation):** National Insurance number, bank details, passport/visa numbers,
photos, nationality. These would only be needed for payroll or document storage, which are out of scope or arrive in
later phases. **[DECISION]** if clients need any of them.

## 4. Technical measures (built and tested)

### Separation between client companies
- Every business table carries a `tenant_id`. **Row Level Security (RLS) is enabled on all 29 tables**, enforced by the
  database itself — not just the website.
- Composite foreign keys make it impossible to link a record to a department, location or manager in another company.
- Automated tests (`npm run test:rls`, 141 tests across tenant isolation, roles, holiday, sickness, documents and policies) prove that one company cannot read or modify another's employees,
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

### Documents and policies (Phase 3)
- Files live in **private** storage buckets in London. No browser can list or read them directly: there are deliberately
  no storage access rules. Every upload and download goes through the server, which first checks the person's rights
  in the database (RLS) and then issues a **single-use upload link** or a **60-second download link**.
- Uploads go straight from the browser to storage, never through the web server. The server then checks the file's
  actual contents ("magic bytes") match its claimed type (PDF, Word, JPEG, PNG, HEIC); macro-enabled Word files and
  anything else are deleted. Limit: 10 MB, also enforced by the storage bucket itself. A SHA-256 fingerprint is
  recorded for every file.
- Who can see a document is set per document (HR only / HR + manager / HR + employee / all three). Who can upload is
  limited by role: employees can add only their own certificates, fit notes, right-to-work and other documents;
  line managers only for direct reports. Only HR can change visibility or delete. Every download is logged.
- File names are cleaned before storage, and file locations sent by the browser are checked against the person's
  own records before the server touches storage. Without that check, a forged location could have been used to
  read or delete another company's file (found and fixed during the build).
- Published policy versions can't be changed. HR chooses for each new version whether everyone must re-confirm it.
  The acknowledgement tracker shows who is still to confirm. Staff can't see each other's confirmations.
- 35 automated tests cover document and policy access.
- Forms now always send data in the request body (POST), and their buttons are disabled until the page has fully
  loaded. During testing, a sign-in clicked before the page was ready put the email and password into the web
  address; this is now impossible.

### People processes (Phase 4)
- **Cases are HR only.** A separate database check allows a case to be read only by HR in the same company, signed in
  with MFA, not in an AbsorbHR support session, and never by the person the case is about (so an HR manager can't
  read a grievance raised about them). The summary and timeline are encrypted with the same Vault key as health
  data, and are decrypted only by a database function that writes the view to the audit log in the same step.
  Opening the case list is logged too.
- **Case documents** are stored as HR-only documents linked to the case and are excluded from the employee's
  normal document list, so they can't be accidentally shown to the employee or manager.
- **1-to-1 notes** are shared with the employee by default. A manager can mark a note private (author and HR only);
  the form warns that private notes can still be disclosed in a Subject Access Request.
- **Reviews:** the employee sees their manager's assessment only once it's shared; submitted sections are locked.
  Ratings are off unless a Client Admin turns them on, with the company's own labels.
- **Checklists:** each task is for HR, the manager or the employee, and the database only lets that person (or HR)
  tick it off.
- **Diversity monitoring:** a voluntary, self-service form appears on the employee's own profile only when the
  company turns it on. Answers are encrypted, are never shown to managers or AbsorbHR Support, and saving with every
  answer blank deletes them.
- **Correction requests:** employees can ask HR to correct anything; HR replies through the portal, and if HR
  declines it must give a reason (the employee can complain to the ICO).
- 50 automated tests cover Phase 4 access rules (191 in total).

### GDPR tools (Phase 5)
- **Subject access exports:** one database function gathers everything held about one person, decrypts it, and
  records the export in the audit log in the same step. Only HR with MFA can run it — never AbsorbHR support,
  managers or the employee, and never HR about themselves. The ZIP contains a readable PDF summary, the full data
  as JSON (data portability) and copies of every document. If it contains case records, case documents or private
  notes, it's flagged so HR checks for other people's data before sending. Files are private and deleted
  automatically after 30 days; downloads use 60-second links and are logged.
- **Retention:** each night the system checks for leavers whose retention period has ended (6 years minimum,
  companies can choose longer, up to 20) and emails HR. **HR confirms each anonymisation** (decided by AbsorbHR
  26 Oct 2026) and can put a record on hold with a reason (e.g. a live claim). Anonymisation deletes every personal
  record — documents, notes, reviews, cases, absence, pay, contacts — and the login; it keeps a shell with
  department, location, dates and contract type for headcount history, and the audit log (which holds IDs, not
  names). Files and the login are removed by the server within minutes.
- **Early erasure** (an upheld Art. 17 request, or someone who never started) needs a Client Admin and a written
  reason, and is recorded separately in the erasure log.
- **Breach log** for Client Admins with a 72-hour ICO countdown; deciding *not* to report requires a reason.
  AbsorbHR admins can read every company's log so they can advise. Records can't be deleted.
- **Reports** (headcount, starters/leavers and turnover, absence with Bradford Factor, upcoming expiries) are
  calculated under the same access rules. CSV downloads are logged and protected against spreadsheet formula
  injection.
- **Email** is queued by database triggers and sent by the server through Resend. Emails never contain personal
  detail. Demo and test addresses are never sent to.
- **Housekeeping:** a nightly job removes uploads that were started but never finished, deletes expired exports and
  old email records.
- 47 automated tests cover Phase 5 (238 in total).

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
| Access (Art. 15) | ✅ **Data protection → Subject access requests**: ZIP with PDF summary, JSON and documents; shows the one-month deadline; flags content needing redaction review. |
| Data portability (Art. 20) | ✅ The same export includes machine-readable JSON. |
| Rectification (Art. 16) | ✅ Employees can correct their own contact details and emergency contacts, and use **Correction requests** to ask HR to fix anything else. HR replies in the portal; requests and replies are kept and audited. Reply within one month. |
| Erasure / anonymisation (Art. 17) | ✅ Retention review (HR confirms each record) plus early erasure for upheld requests (Client Admin, reason required). |
| Restriction / objection | Handled manually by HR for now. **[DECISION]** whether to build a workflow. |
| Withdraw consent (diversity data) | ✅ The employee clears their answers on their profile, which deletes the record. Diversity collection is off by default per company. |

## 6. Retention

**Decision (AbsorbHR, 26 Oct 2026): personal data is kept for a minimum of 6 years.** The database refuses any
setting below 6 years; companies can choose up to 20 (Data protection → Retention period). When a leaver reaches the
end of the period, HR is emailed and the record appears in **Data protection → Retention review** for HR to confirm.

| Data | Retention | Notes |
|---|---|---|
| Leaver core record, salary, employment history | 6 years after leaving | Limitation Act 1980 (contract claims) |
| Right-to-work check records and copies | 6 years after leaving | Home Office minimum is 2 years after employment ends; 6 years meets it |
| Holiday and leave records | 6 years after leaving | Covers Working Time Regulations record-keeping (2 years minimum) |
| Sickness records, reasons, return-to-work forms, fit notes | 6 years after leaving | Statutory Sick Pay, personal injury and discrimination claims |
| Employee documents (contracts, letters, certificates, notes) | 6 years after leaving | |
| Checklists, performance reviews, 1-to-1 notes | 6 years after leaving | |
| Disciplinary and grievance cases (incl. case documents) | 6 years after the case closes, or after leaving if later | Tribunal and contract claim time limits **[LEGAL]** confirm, especially for unfounded allegations |
| Correction requests | 6 years after closure | Evidence the right was handled |
| Policy versions and acknowledgements | 6 years after the version is replaced or the employee leaves | Evidence staff were informed |
| Emergency contacts | 6 years after leaving | See note below |
| Diversity monitoring | 6 years after leaving, or immediately on withdrawal | Withdrawal by the employee always deletes it |
| Audit log | 6 years | Accountability evidence |
| Unused portal accounts | Disabled on the leaving date; deleted with the record | Security |

**[LEGAL] note:** UK GDPR's storage-limitation principle (Art. 5(1)(e)) expects each period to be justified. A blanket
6 years is easy to defend for employment, pay, absence and case records. It is harder to justify for **emergency
contacts** (data about third parties with no purpose after employment) and **diversity data**. Ask your data protection
lawyer to confirm, and record the reasoning in your DPIA and retention policy.

## 7. Organisational measures (for AbsorbHR to complete)

- [ ] Art. 28 processing agreement template for clients **[LEGAL]**
- [ ] Sub-processor list published to clients (Supabase, Vercel, Resend)
- [ ] Sign Supabase and Vercel DPAs
- [ ] Staff confidentiality and data protection training for anyone with platform admin access
- [ ] Quarterly review of who holds AbsorbHR platform admin access
- [ ] Breach response procedure (72-hour ICO notification) — the in-app breach log is built; write the procedure around it
- [ ] SAR procedure: who checks exports, how redaction is decided, how the file is sent securely (e.g. password-protected, password sent separately)
- [ ] ICO registration / data protection fee check
- [ ] Independent penetration test before onboarding the first real client

## 8. Known gaps and go-live requirements

| Item | Why | Action |
|---|---|---|
| Supabase **Pro** plan | Needed for breached-password checking (HaveIBeenPwned), server-side session time limits, point-in-time backups, no auto-pausing | Upgrade before real data; then enable these settings |
| Correct secret key in the environment | Rate limiting and invitations depend on it; in production, sign-in **refuses** requests if rate limiting can't run | Replace `SUPABASE_SERVICE_ROLE_KEY` with a key from the London project |
| Email (Resend) | Built but switched off until configured. Supabase's own sign-in emails also need Resend SMTP for reliable delivery | Follow `docs/GO-LIVE.md` steps 3–4 |
| Vault encryption key | If lost, encrypted special-category data cannot be recovered. It is held in the database and included in Supabase backups of the same project | Never delete the `pii_encryption_key` secret; document backup/restore procedure |
| Demo data | The development project contains fake people with a shared demo password | Never use the development project for real data; create a separate production project |
| Irregular-hours / part-year workers | 12.07% accrual (Employment Rights (Amendment, Revocation and Transitional Provision) Regulations 2023) not yet automated | HR uses holiday adjustments meanwhile; deferred by AbsorbHR decision |
| First-year accrual rule | WTR reg. 15A (holiday accrues monthly in the first year) is not enforced | **[DECISION]** whether to enforce or leave to HR judgement |
| Statutory carry-over | Carry-over required by law (e.g. after long sickness or family leave) is added manually by HR | **[LEGAL]** confirm the process |
| Virus scanning | Uploaded files are type-checked but not virus-scanned | **Deferred by AbsorbHR (26 Oct 2026).** Revisit before go-live; consider in the DPIA risk register |
| Background jobs need a shared secret | Sending email and deleting files after anonymisation run on the web server, triggered by the database every 5 minutes. Until `CRON_SECRET` is set in Vercel and Supabase Vault, queued email waits and deleted records' files remain in storage | Follow `docs/GO-LIVE.md` step 4 |
| Records of current employees | Retention runs from the leaving date, so old records of long-serving staff (e.g. a 10-year-old closed case) are kept while they're employed | **[DECISION]** whether to add a review of old closed cases and old sickness records for current staff |
| Anonymised shell | Department, location, start/leave dates and contract type are kept for statistics. In a very small company these could identify someone | **[LEGAL]** confirm this counts as anonymised for your clients |
| Private 1-to-1 notes and SARs | Private notes are hidden from the employee in the portal but are personal data they are entitled to in a Subject Access Request | Train managers to write every note as if the employee will read it **[LEGAL]** |
| Case records and SARs | Case records can be requested in a SAR; some content (e.g. witness identities) may need redacting under DPA 2018 Sch. 2 | The export flags case records, case documents and private notes for HR review; redaction itself is done by HR outside the portal **[LEGAL]** |
| QA test login | `qa.admin@example.com` (Client Admin, no employee record) exists in the development project for automated browser testing | Remove before any real use; never create in production |
| Automated accessibility checks | All Phase 1–5 pages pass axe-core WCAG 2.1 AA checks; automated tools catch only part of the issues | Manual screen-reader test before go-live |
