# Going live on Krystal (no extra subscriptions)

The live portal runs at **https://absorbhr-portal.co.uk**:

| Part | Where | Cost |
|---|---|---|
| Website | Krystal (cPanel → Setup Node.js App) | Already paid |
| Domain, email, scheduled jobs | Krystal | Already paid |
| Database, logins, files | Supabase **free** plan, London | £0 |
| Building and uploading new versions | GitHub Actions (free minutes) | £0 |

The test site (absorbhr-portal.vercel.app) stays as it is, with fake data.

**Never paste passwords or keys into a chat.** Each one goes straight into the settings page named below.

---

## Part 1 — Supabase production database (10 minutes)

The free plan allows 2 active projects. If the very first project (`zvphdhtstwfhwyjndzwb`) still exists and is
unused, delete it first (Project → Settings → General → Delete project).

1. supabase.com → **New project**.
2. Name: `absorbhr-production`. Database password: click **Generate a password** and save it in your password
   manager. Region: **West EU (London)**. Plan: Free. Click **Create new project**.
3. When it's ready, copy the **project reference** — the random letters in the address bar after `/project/` —
   and send it to Claude (this one is not secret).
4. Project Settings → **API Keys**. Keep this tab open; you'll copy the **publishable** key and the **secret** key into
   Krystal in Part 3.

Claude then sets up the database, security settings and your admin login.

## Part 2 — Email mailbox on Krystal (5 minutes)

1. cPanel → **Email Accounts** → **Create**. Domain `absorbhr-portal.co.uk`, username `no-reply`, generate a strong
   password and save it in your password manager. Create.
2. Done 27 Oct 2026: outgoing server `mail.absorbhr-portal.co.uk`, SMTP port 465 (SSL/TLS).
3. cPanel → **Email Deliverability**. If `absorbhr-portal.co.uk` shows a problem, click **Repair** for DKIM and SPF.

## Part 3 — The website on Krystal (10 minutes)

cPanel → **Setup Node.js App** → **Create Application**:

| Setting | Value |
|---|---|
| Node.js version | **20.20.2** |
| Application mode | **Production** |
| Application root | `absorbhr-portal-app` |
| Application URL | choose **absorbhr-portal.co.uk** in the dropdown; leave the box after it empty |
| Application startup file | `app.js` |

Under **Environment variables**, click **Add variable** for each:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://absorbhr-portal.co.uk` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project reference>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **publishable** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **secret** key |
| `IP_HASH_SECRET` | a new 40-character random password from your password manager |
| `CRON_SECRET` | another new 40-character random password (keep it — Part 5 uses it) |
| `EMAIL_FROM` | `AbsorbHR Portal <no-reply@absorbhr-portal.co.uk>` |
| `SMTP_HOST` | `mail.absorbhr-portal.co.uk` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `no-reply@absorbhr-portal.co.uk` |
| `SMTP_PASSWORD` | the mailbox password from Part 2 |

Click **Create**. (A placeholder page appears until Part 4 uploads the portal.)

Then cPanel → **Domains** → turn **Force HTTPS Redirect** on for `absorbhr-portal.co.uk`. If the padlock isn't
working yet, cPanel → **SSL/TLS Status** → select the domain → **Run AutoSSL**.

## Part 4 — Let GitHub upload new versions (10 minutes)

**a. Create an upload key on Krystal**
1. cPanel → **SSH Access** → **Manage SSH Keys** → **Generate a New Key**. Key name `github-deploy`, leave the
   password **empty**, type RSA 4096. Generate.
2. Back on Manage SSH Keys, find `github-deploy` under **Public Keys** → **Manage** → **Authorize**.
3. Under **Private Keys**, `github-deploy` → **View/Download** → copy the whole text (from
   `-----BEGIN` to `PRIVATE KEY-----`).

**b. Give it to GitHub** — github.com/jordannaughton420-collab/absorbhr-portal → **Settings** → **Secrets and
variables** → **Actions**:

- **Secrets** tab → **New repository secret**: name `KRYSTAL_SSH_KEY`, paste the private key. Save.
- Then delete the private key from Krystal (Manage SSH Keys → Private Keys → `github-deploy` → Delete). GitHub now
  holds the only copy; the public key stays authorised.
- **Variables** tab → **New repository variable**, one at a time:

| Name | Value |
|---|---|
| `KRYSTAL_SSH_HOST` | `kuat-lon2.krystal.uk` (the server in your cPanel address) |
| `KRYSTAL_SSH_PORT` | `722` |
| `KRYSTAL_SSH_USER` | your cPanel username (cPanel → General Information, right-hand side) |
| `KRYSTAL_APP_DIR` | `/home/<cPanel username>/absorbhr-portal-app` |
| `NEXT_PUBLIC_SITE_URL` | `https://absorbhr-portal.co.uk` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project reference>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **publishable** key (it's public, so a variable is fine) |
| `KRYSTAL_ENABLED` | `true` (add this one last) |

Then tell Claude; it starts the first upload and checks the site.

## Part 5 — Email and clean-up every 5 minutes (3 minutes)

cPanel → **Cron Jobs** → Add New Cron Job → Common Settings **Once Per Five Minutes (*/5)** → Command:

```
curl -fsS -m 60 -H "Authorization: Bearer YOUR-CRON-SECRET" https://absorbhr-portal.co.uk/api/cron/dispatch > /dev/null
```

(replace `YOUR-CRON-SECRET` with the value from Part 3). Add.

## Part 6 — Sign-in emails from Supabase (3 minutes)

Supabase (production project) → **Authentication** → **Emails** → **SMTP Settings** → Enable custom SMTP:
sender `no-reply@absorbhr-portal.co.uk`, name `AbsorbHR Portal`, host `mail.absorbhr-portal.co.uk`, port `465`, username
`no-reply@absorbhr-portal.co.uk`, password = mailbox password. Save.

## Part 7 — Nightly encrypted backups (10 minutes)

Follow **docs/BACKUPS.md → Setting it up**: three GitHub secrets (database connection string, Supabase secret key,
a backup passphrase you keep in your password manager) and the variable `BACKUP_ENABLED` = `true`. Each night
GitHub saves an encrypted copy of the database and all files to `~/absorbhr-backups` on Krystal and keeps 30 days.

---

## Free-plan limits to know about

- **Backups:** Supabase's free plan doesn't include downloadable backups, so Part 7 sends an encrypted copy to
  Krystal every night (docs/BACKUPS.md). Upgrading Supabase to Pro (about $25/month) is still the first upgrade to
  make when you can.
- **Pausing:** free projects pause after 7 days without use. The 5-minute job and normal use keep it awake.
- **Size:** 500 MB database and 1 GB of files — plenty for the first clients; the Supabase dashboard shows usage.
- **Leaked-password check** is a Pro feature; passwords still need 12+ characters with mixed types, and admins must
  use two-step verification.
