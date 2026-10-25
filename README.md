# AbsorbHR Portal

Secure, multi-tenant HR software that AbsorbHR provides to its client businesses.
Each client company's data is completely separated from every other client's.

The full architecture and build plan is in [`docs/PLAN.md`](docs/PLAN.md).
GDPR documentation will live in `docs/GDPR.md` (built up phase by phase).

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Project setup, brand theme | In progress |
| 1 | Login, MFA, companies, employees, org chart, audit log | Not started |
| 2 | Holiday & sickness | Not started |
| 3 | Documents & policies | Not started |
| 4 | Onboarding, reviews, cases, self-service | Not started |
| 5 | Reports, emails, GDPR tools | Not started |

## Running it on your own computer (non-developer guide)

You only need this if you want to run the portal yourself. Steps will be expanded as
features are added.

1. Install **Node.js 22 LTS** from <https://nodejs.org> (choose the "LTS" download).
2. Install **Docker Desktop** from <https://www.docker.com/products/docker-desktop> and start it.
   (It runs a private copy of the database on your machine.)
3. Download this project from GitHub (green **Code** button → **Download ZIP**, then unzip),
   or ask me for the `git clone` command.
4. Open a terminal in the project folder and run, one at a time:
   ```
   npm install
   npm run db:start
   ```
   The second command prints some keys. Copy `.env.example` to a new file called `.env.local`
   and paste the `API URL`, `anon key` and `service_role key` values into it.
5. Run `npm run dev` and open <http://localhost:3000>.

## Branding

- Logo: replace `public/brand/absorbhr-logo.svg` with the real logo (keep the same filename).
- Colours: all defined in one place at the top of `app/globals.css` (`--brand-*` variables).

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the website locally |
| `npm run db:start` / `db:stop` | Start / stop the local database |
| `npm run db:reset` | Rebuild the local database from migrations + fake seed data |
| `npm test` | Run calculation tests |
| `npm run test:rls` | Run the database security (tenant isolation) tests |
