# Nightly backups (Supabase free plan → Krystal)

Every night at 01:23 (UTC) GitHub Actions (`.github/workflows/backup-krystal.yml`):

1. dumps the production database (roles, structure, data) with the Supabase CLI;
2. exports the Vault secrets, including `pii_encryption_key`. Without that key, health, diversity and case data
   can't be read after a restore. Supabase leaves Vault out of its own dumps;
3. downloads every file from Supabase Storage (employee documents, policies, SAR exports);
4. packs everything into one file, `absorbhr-YYYY-MM-DD.tar.gz.gpg`, encrypted with AES-256 using your backup
   passphrase, and checks that the file decrypts;
5. uploads it to `~/absorbhr-backups` on Krystal (inside your home folder, not `public_html`, so it can't be
   reached from the web), and deletes copies older than the newest 30.

Keeping only 30 days also means erased records leave the backups within a month (docs/GDPR.md).

If a night fails, GitHub emails you. Check **Actions → Nightly backup to Krystal** any time.

---

## Setting it up (10 minutes, after Parts 1–4 of docs/GO-LIVE-KRYSTAL.md)

**Never paste these values into a chat.** Each one goes straight into GitHub.

1. **Backup passphrase.** In your password manager, create a new random password of **at least 40 characters**
   and save it as "AbsorbHR backup passphrase". **If it is lost, the backups can't be opened.** Consider printing
   it and keeping it somewhere safe.
2. **Database connection string.** Supabase (production project) → **Connect** (top of the page) → **Connection
   string** → Method **Session pooler**. Copy the URI. It looks like
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`. Replace
   `[YOUR-PASSWORD]` (including the brackets) with the database password from Part 1. (Use the session pooler
   because GitHub can't reach the direct connection.)
3. github.com/jordannaughton420-collab/absorbhr-portal → **Settings** → **Secrets and variables** → **Actions** →
   **Secrets** tab → **New repository secret**, one at a time:

| Name                        | Value                                        |
| --------------------------- | -------------------------------------------- |
| `SUPABASE_DB_URL`           | the connection string from step 2            |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **secret** key (production project) |
| `BACKUP_PASSPHRASE`         | the passphrase from step 1                   |

(`KRYSTAL_SSH_KEY` and the `KRYSTAL_SSH_*` variables from Part 4 are reused.) 4. **Variables** tab → New repository variable: `BACKUP_ENABLED` = `true`. 5. **Actions** → **Nightly backup to Krystal** → **Run workflow**. After about 3 minutes it should be green, and
cPanel → **File Manager** should show the file in `absorbhr-backups`.

Notes:

- GitHub pauses scheduled jobs in a repository with no commits for 60 days and emails you first. Clicking
  **Enable workflow** on the Actions page turns it back on.
- Each file is roughly the database size plus the uploaded files. Keep an eye on disk usage in cPanel; 30 copies
  need about 30 × that.
- Optional: once a month, download the newest file from cPanel File Manager to an encrypted drive, for a copy that
  isn't on Krystal.

---

## Checking a backup opens (do this once after setup, then every 3 months)

On a Mac or Linux computer with GnuPG installed (`brew install gnupg` on a Mac):

```
gpg -d absorbhr-2026-11-01.tar.gz.gpg | tar -tzf - | head
```

Enter the passphrase. You should see `./db/data.sql`, `./db/vault-secrets.csv` and `./storage/...`.
Delete the downloaded file afterwards.

## Restoring (with Claude's help)

Restoring goes into a **new** Supabase project, so the broken one can be kept for investigation.

1. Create a new Supabase project in London (see Part 1 of docs/GO-LIVE-KRYSTAL.md) and get its session pooler
   connection string as above (`NEW_DB_URL`).
2. Decrypt and unpack: `gpg -d absorbhr-YYYY-MM-DD.tar.gz.gpg | tar -xzf -`
3. Restore the database:

```
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f db/roles.sql -f db/schema.sql -c 'SET session_replication_role = replica' -f db/data.sql
```

4. Put the Vault secrets back, **before** anyone signs in. For each row in `db/vault-secrets.csv` run
   `select vault.create_secret('<secret>', '<name>');`. `pii_encryption_key` is the one that matters. If
   `app_base_url` points to a new address, update it.
5. Upload the files: every file in `storage/<bucket>/<path>` goes back to the same bucket and path (the buckets
   come back with the schema). Claude can write the upload script against `storage/manifest.json`.
6. Point the website at the new project: change `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` in cPanel and in the GitHub variables, then re-run **Deploy to Krystal**. Redo
   Part 6 (Supabase SMTP) and the Authentication URL settings for the new project.
7. Sign in as HR and open a sickness record. If it reads properly, the encryption key was restored correctly.

Under UK GDPR, losing access to personal data can be a reportable breach. Record any restore in the breach log
(/breaches) and decide within 72 hours whether the ICO must be told.
