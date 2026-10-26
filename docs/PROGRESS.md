# Build progress & decisions log

Read this first when resuming work in a new session.

## Decisions
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
- Diversity monitoring is off by default per company; database functions built, UI deferred to Phase 4.

## Environment variables expected in the cloud session
`NEXT_PUBLIC_SUPABASE_URL` (should be `https://djdjrrziukllerhhnrix.supabase.co`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (must be a secret key **from the London project**), `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF=djdjrrziukllerhhnrix`, `IP_HASH_SECRET`.
As of 26 Oct the environment still held the old project URL and an old secret key — `.env.local` overrides are used
locally, but process env wins over `.env.local` in Next.js, so run dev with `NEXT_PUBLIC_SUPABASE_URL=… npm run dev`.

## Status
- [x] Phase 0 — scaffold, brand theme, security headers, Supabase auth config
- [x] Phase 1 — built and tested; awaiting user sign-off
  - 4 migrations, 17 tables, RLS on all; 49 pgTAP tests passing
  - Bugs caught by tests and fixed: NULL access checks let support sessions read special-category data
    (migration 0004); idle timer reset itself while the warning was showing
  - Browser walkthrough passed for every role; axe-core WCAG 2.1 AA checks pass on all pages
- [ ] Phase 2 — absence & leave (next)

## Follow-ups noted for later phases
- Convert the Playwright walkthrough / accessibility / idle-timeout scripts into a committed `npm run test:e2e` suite
  (needs a test-only seed password + TOTP handling).
- Audit log viewer: add filters and paging (currently latest 300 entries).
- Invitations need the correct service key and, for reliable delivery, Resend SMTP (Phase 5).
