# AbsorbHR Portal

Secure, multi-tenant HR software that AbsorbHR provides to its client businesses.
Each client company's data is completely separated from every other client's, and the data is stored in the UK (London).

- Architecture and build plan: [`docs/PLAN.md`](docs/PLAN.md)
- Data protection documentation (for your DPIA): [`docs/GDPR.md`](docs/GDPR.md)
- Progress and decisions log: [`docs/PROGRESS.md`](docs/PROGRESS.md)

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Project setup, brand theme | ✅ Done |
| 1 | Sign-in, MFA, companies, employees, org chart, audit log | ✅ Built and tested — awaiting your sign-off |
| 2 | Holiday & sickness | Not started |
| 3 | Documents & policies | Not started |
| 4 | Onboarding, reviews, cases, self-service | Not started |
| 5 | Reports, emails, GDPR tools | Not started |

## Demo accounts (development project only — all fake)

| Email | Role | What they should see |
|---|---|---|
| `brightwater.employee@example.com` | Employee | Only their own profile, the org chart, the privacy notice |
| `brightwater.manager@example.com` | Line Manager | Their 12 direct reports (no salaries or home addresses) |
| `brightwater.hr@example.com` | HR Manager | Everyone at Brightwater Bakery; asked to set up MFA first |
| `brightwater.admin@example.com` | Client Admin | Everything at Brightwater, plus roles, security settings and the audit log |
| `northgate.admin@example.com` | Client Admin | Only Northgate Logistics — never Brightwater |
| `absorb.admin@example.com` | AbsorbHR admin | Client list; nothing else until a support session is opened |

The demo password is set when the demo data is loaded (`SEED_PASSWORD`) and is never stored in this repository.
Accounts that need MFA ask you to scan a QR code with an authenticator app (Microsoft Authenticator, Google
Authenticator, 1Password, etc.) the first time you sign in.

## Running it on your own computer (non-developer guide)

1. Install **Node.js 22 LTS** from <https://nodejs.org> (choose the "LTS" download).
2. Download this project from GitHub (green **Code** button → **Download ZIP**, then unzip it).
3. In the project folder, copy `.env.example` to a new file called `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Project Settings → API keys
   - `SUPABASE_SERVICE_ROLE_KEY` — a **secret** key from the same page (keep this private)
   - `IP_HASH_SECRET` — any long random text (e.g. from a password generator)
4. Open a terminal in the project folder and run:
   ```
   npm install
   npm run dev
   ```
5. Open <http://localhost:3000> and sign in with a demo account.

## Database commands (developer / Claude use)

These talk to the Supabase project through its Management API, using `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_REF`.

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply any new files in `supabase/migrations` |
| `SEED_PASSWORD='…' npm run db:seed` | Reset the **fake** demo data (never run against production) |
| `npm run test:rls` | Run the 49 database security tests (tenant isolation, roles, MFA, encryption, audit log) |
| `npm run db:types` | Regenerate TypeScript types from the database |
| `npm test` | Run validation unit tests |
| `npm run lint` / `npm run typecheck` | Code quality checks |

## Branding

- Logo: replace `public/brand/absorbhr-logo.svg` with the real logo (keep the same filename).
- Colours: defined once at the top of `app/globals.css` (`--brand-*` variables).

## Security notes

- Never commit `.env.local` (it is git-ignored) and never paste secret keys into chats or tickets.
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses all security rules — server use only.
- See `docs/GDPR.md` section 8 for the go-live checklist.
