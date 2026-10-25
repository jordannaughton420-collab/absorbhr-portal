# Build progress & decisions log

Read this first when resuming work in a new session.

## Decisions
- Hosting: Vercel (London, lhr1). Email: Resend. Code: this GitHub repo.
- Logo: `public/brand/absorbhr-logo.svg` (placeholder until the real file is added).
- Database: hosted **dev** Supabase project `zvphdhtstwfhwyjndzwb` (local Docker Supabase
  was blocked by the cloud environment's network policy). Region must be London (eu-west-2) —
  verify via the Management API before applying migrations.
- Because direct Postgres connections may not pass the session proxy, migrations and RLS tests
  are applied via the Supabase Management API SQL endpoint using `SUPABASE_ACCESS_TOKEN`.

## Environment variables expected in the cloud session
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ACCESS_TOKEN`. Network allow-list needs `*.supabase.co` and `api.supabase.com`.

## Status
- [x] Phase 0 — scaffold, brand theme, security headers, Supabase auth config
- [ ] Phase 1 — foundations (next)
