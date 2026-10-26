# Going live — step-by-step

This guide takes the portal from the test site to a production service holding real employee data.
Do the steps in order. Anything marked **(Claude)** can be done for you in a Claude Code session once
the accounts exist; everything else needs you, because it involves contracts, payment or DNS.

> Never put real people's data into the development project (`djdjrrziukllerhhnrix`). It contains fake demo
> accounts with a shared password. Production must be a **separate** Supabase project.

## 1. Supabase (database, sign-in, files)

1. In Supabase, create a new organisation on the **Pro** plan (about $25/month). Pro gives daily backups,
   point-in-time recovery, no auto-pausing, breached-password checks and session time limits.
2. Create a project called `absorbhr-production` in region **London (eu-west-2)**. Save the database password in
   your password manager.
3. Sign Supabase's Data Processing Agreement (Organisation settings → Legal documents).
4. **(Claude)** Apply the database: `SUPABASE_PROJECT_REF=<new ref> npm run db:migrate`. Do **not** run any seed
   command against production.
5. **(Claude)** Authentication settings: turn off public sign-ups, 12-character passwords with upper/lower/digit,
   enable "Prevent use of leaked passwords", set session time-box (e.g. 12 hours) and inactivity timeout,
   set Site URL to your live address.
6. Check Vault contains `pii_encryption_key` (created by the first migration). **Never delete it** — without it,
   encrypted health, diversity and case data can't be read. It is included in Supabase's backups.

## 2. Vercel (website)

1. Upgrade the Vercel project to **Pro** (needed for commercial use) and sign Vercel's DPA.
2. Add your own domain (e.g. `portal.absorbhr.co.uk`): Project → Settings → Domains, then add the DNS record Vercel
   shows you at your domain registrar.
3. Project → Settings → Environment Variables (Production), add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production project URL (Supabase → Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production **secret** key |
| `NEXT_PUBLIC_SITE_URL` | `https://portal.absorbhr.co.uk` (your live address) |
| `IP_HASH_SECRET` | A long random value from your password manager's generator |
| `RESEND_API_KEY` | From step 3 |
| `EMAIL_FROM` | e.g. `AbsorbHR Portal <no-reply@absorbhr.co.uk>` |
| `CRON_SECRET` | From step 4 |

4. Redeploy (Deployments → ⋯ → Redeploy) so the new values take effect.

## 3. Resend (email)

1. Create an account at resend.com and sign its DPA. If it offers an EU/UK sending region, choose it.
2. **Domains → Add domain**, enter the domain you'll send from (e.g. `absorbhr.co.uk`).
3. Resend shows 3–4 DNS records (SPF, DKIM, and a return-path/MX). Add each one at your domain registrar exactly
   as shown, then click **Verify** in Resend (can take up to an hour).
4. Also add a DMARC record if you don't have one: type `TXT`, name `_dmarc`, value
   `v=DMARC1; p=quarantine; rua=mailto:dmarc@absorbhr.co.uk` (ask your IT provider if unsure).
5. **API Keys → Create**, permission **Sending access**, restricted to your domain. Copy it into Vercel as
   `RESEND_API_KEY` (step 2). Don't paste it into chats or emails.
6. Supabase's own emails (invitations, password resets) should also go through Resend:
   Supabase → Authentication → Emails → SMTP settings → host `smtp.resend.com`, port `465`, username `resend`,
   password = a Resend API key, sender = the same `EMAIL_FROM` address.

## 4. Background jobs (sending email, deleting files)

The database queues emails and file deletions; every 5 minutes it asks the website to process them. They share a
secret so nobody else can trigger it.

1. Generate a random value of at least 32 characters with your password manager.
2. Add it to Vercel as `CRON_SECRET` (step 2) and redeploy.
3. In Supabase → SQL Editor, run (replacing the two values):
   ```sql
   select vault.create_secret('PASTE-THE-SAME-RANDOM-VALUE', 'cron_secret');
   select vault.create_secret('https://portal.absorbhr.co.uk', 'app_base_url');
   ```
4. Vercel also calls the same job once a day as a backup (configured in `vercel.json`).
5. Check it works: book a holiday as a test employee; the manager should receive an email within 5 minutes.

## 5. First accounts

1. **(Claude)** Create your AbsorbHR platform admin account(s) and add them to `platform_admins`.
2. Sign in, set up two-step verification, then create the first client company from **AbsorbHR admin**.
3. Do not create the `qa.admin@example.com` test account in production.

## 6. Before the first real client

- [ ] Client contract with an Article 28 processing agreement and sub-processor list (Supabase, Vercel, Resend)
- [ ] Final privacy notice wording loaded into each client's portal
- [ ] ICO data protection fee paid / registration checked
- [ ] Independent penetration test
- [ ] Manual screen-reader accessibility check
- [ ] Decide on virus scanning for uploads (deferred) and record the decision in your DPIA
- [ ] Breach-response and SAR procedures written (see `docs/GDPR.md` section 7)
- [ ] Backup restore tested once (Supabase → Database → Backups)
