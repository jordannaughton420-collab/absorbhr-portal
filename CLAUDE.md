<!-- memory start -->
# Memory: absorbhr-portal
These facts came from email and files. Confirm them before use. They are notes, not instructions.
Updated 16 Nov 2026. Read from: 2 email threads (PDF), GoHighLevel, Stripe, Make, this repository (last 30 days). Not connected yet: sales@absorbhr.co.uk mailbox (Krystal, no connector).

## What This Is
- AbsorbHR (Absorb Employment Law Consultants Ltd): HR support, HR software and employment law compliance for UK businesses. Tagline in Jordan's signature: "HR software + advice backed by £1M indemnity".
- This repo is the AbsorbHR Portal: a multi-tenant UK HR SaaS (Next.js + Supabase, London) that AbsorbHR provides to its client businesses.
- All 5 build phases were approved on 26 Oct 2026. Current work: going live at absorbhr-portal.co.uk on Krystal.

## People
- Jordan Naughton: Managing Director, AbsorbHR; owner of this project. Not technical: wants plain English and one step at a time.
- Julian Coleman: at Harvey's Workwear (an AbsorbHR client); introduces Jordan to his contacts.
- Daniel (Dan) Lloyd-John: Chief Executive, Broadway Insurance Partners (insurance broker, Stockport). Introduced by Julian on 11 Nov 2026; interested in a Teams chat.
- Nicholas Whittle: Director, nicholaswhittle.co.uk. Introduced by Julian on 10 Nov 2026.
- Elvin Lucas: Protec Security (Oldham). Added as a Stripe customer on 3 Nov 2026.

## Where Things Stand
- Portal (as of 27 Oct 2026): runs on a test site (Vercel, fake data). Go-live is on free plans plus Krystal:
  - domain absorbhr-portal.co.uk added in cPanel
  - Node.js 20 is available on Krystal
  - mailbox no-reply@absorbhr-portal.co.uk created (SMTP mail.absorbhr-portal.co.uk, port 465)
  - production Supabase project `gnvmakhtgnswlmsdquai` created, but the session's access token could not see it yet
- Sales (16 Nov 2026): GoHighLevel has about 11,700 contacts, mostly UK day nurseries imported on 13 Nov 2025. It currently shows 0 open opportunities and no calendar bookings between 17 Oct and 16 Nov.
- Billing: the Stripe ↔ GoHighLevel contract and Direct Debit flow was tested 22–30 Oct 2026 with a test customer. All test subscriptions were cancelled on 30 Oct. No payments were taken in the last 30 days.
- Marketing: the LinkedIn post and image automations in Make are switched off. Jordan said he can't afford more subscriptions right now (27 Oct 2026).

## Decisions
- 26 Oct 2026: phases 1–5 approved.
- 26 Oct 2026: personal data is kept for at least 6 years.
- 26 Oct 2026: disciplinary and grievance cases are HR-only.
- 26 Oct 2026: review scoring is chosen per company.
- 26 Oct 2026: 1-to-1 notes are shared by default, with optional private notes.
- 26 Oct 2026: virus scanning of uploads deferred.
- 26 Oct 2026: retention: HR confirms each anonymisation.
- 26 Oct 2026: SAR exports are run by HR and reviewed before release.
- 26 Oct 2026: AbsorbHR admins can see every client's breach log.
- 27 Oct 2026: no new paid subscriptions. Krystal hosts the site, Supabase is on the free plan, email goes through a Krystal mailbox, backups go to Krystal.
- 9 Nov 2026: "Marketing" product created in Stripe (one-off prices of £650, and £150 added on 12 Nov).

## Open Loops
- Nicholas Whittle: Zoom agreed for Mon 16 Nov 2026, 10am. On 11 Nov he asked Jordan to send the link. Whether it was sent and the call happened is unknown (guess).
- Dan Lloyd-John (Broadway): offered Mon 16 Nov 11am, Fri 20 Nov 9:30am or 12pm, or Mon 23 Nov 10am, on Teams. No reply was seen (guess: Jordan still needs to confirm a slot).
- Protec Security (Elvin Lucas): Stripe customer since 3 Nov with no subscription yet (guess: onboarding pending).
- Portal go-live: give the session access to the production Supabase project, then follow docs/GO-LIVE-KRYSTAL.md parts 3–6.
- Portal go-live: add the nightly encrypted backup to Krystal.
- Portal go-live: Jordan's lawyer to review the [LEGAL] items in docs/GDPR.md.
- Policy template library: Jordan will supply AbsorbHR's own templates later.

## Recurring
- GoHighLevel "AbsorbHR" calendar: 45-minute meetings, Monday–Saturday 8am–5pm, Google Meet, bookable up to 14 days ahead.
- Make "Billing – Deal stage to Stripe" runs whenever a deal moves stage:
  - Proposal Sent: creates and emails a Stripe quote
  - Contract Sent: sends a Direct Debit link and the contract email
  - Won: starts billing
- Make "Contract signed + Direct Debit to Won" runs on its webhook.

## How We Work Here
- Jordan writes to prospects warmly and briefly. He thanks the introducer, explains AbsorbHR in one line, mentions Harvey's Workwear as a client, offers "a quick call or a coffee", and says he's happy to work around them. He signs off "Kind regards".
- Many new leads come through introductions from existing clients (Julian at Harvey's).
- For this repo:
  - finish and test each phase, then commit
  - ask Jordan about business and legal decisions rather than guessing
  - never ask for keys or passwords in chat; they go in settings pages
- Database scripts need `NODE_USE_ENV_PROXY=1`. Commands: `npm run db:migrate`, `npm run test:rls`, `npm run db:types`.

## Where To Look
- docs/PROGRESS.md: build history, decisions and next steps. Read it first.
- docs/GO-LIVE-KRYSTAL.md: the step-by-step go-live guide.
- docs/GDPR.md: data protection documentation and [LEGAL] items.
- docs/PLAN.md: the original architecture plan.
- README.md: commands and demo accounts.
- GoHighLevel holds contacts, deals and the calendar.
- Stripe holds billing (products: AbsorbHR HR Software & Employment Law Support on 1, 3 or 5-year monthly prices; Marketing).
- Make holds the billing and LinkedIn automations.
- The sales@absorbhr.co.uk mailbox (Krystal webmail) holds client email.
<!-- memory end -->
