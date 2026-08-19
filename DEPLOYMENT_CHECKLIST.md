# Deployment Checklist — Pentacle Payroll

Things to do **when you deploy this app to a real server**. Nothing here is needed while you
run it locally. Work top-down: the **Must do** section is security-critical, the rest is setup
and good practice.

> Tip: hand this file (and the "Ask Claude to wire this up" notes) back to Claude when you're
> ready to deploy, and it can do the code/config parts for you.

---

## 1. Must do (security-critical — do these before real employee data goes in)

- [ ] **Set a strong `JWT_SECRET`.** This is the secret that signs login sessions. The server
      now **refuses to start in production without it** (must be 32+ characters). Generate one:
      ```bash
      node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
      ```
      Keep it secret; never commit it. If it ever leaks, rotate it (everyone gets logged out).

- [ ] **Set `POSTGRES_URL`** to your production database connection string. The server refuses
      to start in production without a database.

- [ ] **Create the database tables** on the production database before first use:
      - Run `server/schema.sql` against the prod DB.
      - Run the permissions catalog seed (the `permissions` / `role_permissions` inserts —
        Claude can hand you a single SQL file for this).

- [ ] **Do NOT run the demo seed (`server/seed.ts`) against production.** It creates test
      accounts (`*.pentacle.test`) with a publicly-known password. The script now refuses to run
      when `NODE_ENV=production`, but double-check: run this on the prod DB and it must return
      **zero rows**:
      ```sql
      SELECT email, role FROM users WHERE email LIKE '%@pentacle.test';
      ```
      Delete any that appear.

- [ ] **Create your real Super Admin account** (through a one-off script or a manual insert with
      a bcrypt-hashed password). Every account you create should have
      `force_password_change = true` so the person is forced to set their own password on first
      login (this is already enforced by the app).

- [ ] **Remove the committed test receipt from git history.** One real receipt file is currently
      tracked. `server/uploads/` is now git-ignored, but the existing file must be removed:
      ```bash
      git rm --cached "server/uploads/reimbursements/CLM-86887-Screenshot_2026-07-15_101427.png"
      git commit -m "Remove committed upload; server/uploads is now ignored"
      ```
      (For a fully clean history, purge it with `git filter-repo` before sharing the repo.)

- [ ] **Set `ENCRYPTION_KEY`** (64 hex chars = 32 bytes). Aadhaar / PAN / bank numbers are
      encrypted at rest with it. Generate:
      ```bash
      node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
      ```
      **Keep it secret and backed up** — if you lose it, existing encrypted values can't be read.
      If you ever import legacy plaintext data, run `node server/migrate-encrypt-pii.mjs` once to
      encrypt it (idempotent — safe to re-run).

- [ ] **Configure durable file storage.** Without this, uploaded receipts, payment proofs, and
      identity documents (Aadhaar/PAN) are **lost** on a server restart, and punch selfies get
      stored inline in the database. Set these environment variables to store files in OneDrive /
      SharePoint:
      ```
      AZURE_TENANT_ID=...
      AZURE_CLIENT_ID=...
      AZURE_CLIENT_SECRET=...
      ONEDRIVE_DRIVE=...        # a drive id, or a user's email for their OneDrive
      ONEDRIVE_FOLDER=PentaclePayroll   # optional
      ```
      (Google Cloud Storage is also supported via `GCP_BUCKET_NAME`.)

---

## 2. Deployment setup (make it run in production)

- [ ] **Set `NODE_ENV=production`.**

- [ ] **Set `APP_URL`** to your public site URL (e.g. `https://payroll.yourcompany.com`). This
      locks cross-site requests to your domain.

- [ ] **Decide how the website is served, and wire it up.** Right now, in development the frontend
      is served by Vite and the Express server only handles `/api`. In production you need one of:
      - **Single server** (simplest): Express serves the built frontend *and* the API from one
        Node process. **Ask Claude to set this up** — it also makes the security headers/CSP cover
        the web page automatically.
      - **Split**: a static host serves the built frontend (`npm run build` → `dist/`), a Node
        host runs the API.
      > Note: the server currently does **not** start its HTTP listener in production mode — this
      > needs the single-server setup above. Ask Claude to wire it before deploying.

- [ ] **Serve over HTTPS.** The login cookie is marked `Secure` automatically when the request is
      HTTPS, and HSTS is sent. Use a real certificate (Let's Encrypt, your host's TLS, etc.).

---

## 3. Turn on the Content-Security-Policy (after the site is live)

The CSP ships in **report-only mode** — it watches but blocks nothing, so it can't break the app.
Turn it into real protection once you've confirmed it doesn't flag anything legitimate:

- [ ] Open the live site, press **F12 → Console**.
- [ ] Click through **every** feature: log in, punch in (camera + location), open a payslip,
      open a reimbursement **receipt image** and a **PDF**, upload a receipt, export a CSV,
      employee directory, Access Control.
- [ ] Watch the console for `[Report Only] Refused to load…` messages. If a legitimate resource
      is flagged, give the message to Claude to adjust the policy (one line in
      `server/modules/start.server.js`).
- [ ] When the console is clean everywhere, switch CSP to enforcing by setting:
      ```
      CSP_ENFORCE=1
      ```
      (No code change needed — just the environment variable, then restart.)

---

## 4. Recommended hardening

- [ ] **Verify the database TLS certificate.** The app connects to the DB over TLS but doesn't
      verify the certificate unless you provide the CA. Set `PG_CA_CERT` to your provider's CA
      certificate (most managed Postgres providers publish one) to close a man-in-the-middle gap.

- [ ] **Set `CRON_SECRET`** and schedule the daily "missing punch-out" reminder. The endpoint is
      `GET /api/cron/missing-punch-out` and must be called with header
      `Authorization: Bearer <CRON_SECRET>`. Point a scheduler (cron, your host's scheduler, etc.)
      at it once a day — the original intended time was **13:30 UTC (19:00 IST)**, i.e. cron
      `30 13 * * *`. Without the secret set, the endpoint refuses to run in production.

- [ ] **Set email variables** if you want claim/reminder emails to actually send:
      ```
      RESEND_API_KEY=...
      NOTIFY_FROM_EMAIL=payroll@yourcompany.com
      ```
      (Without these, the app runs fine — it just skips sending emails.)

- [ ] **Back up the database.** Turn on point-in-time recovery / scheduled backups at your DB
      provider, and test a restore once. (Employee deletion is a hard delete of payroll/attendance
      history — a backup is your safety net.)

---

## 5. Known limitations to be aware of

- **Login rate-limiting is per-process and in-memory.** It works on a single always-on server,
  but on serverless/multi-instance hosting it resets and doesn't share across instances. If you
  deploy to serverless, ask Claude to move rate-limiting to the database or a shared store.

- **One harmless pre-existing type warning** remains in
  `src/components/dashboards/finance-head/PayslipManagementSection.tsx` (a status comparison). It
  does not affect running the app; left untouched intentionally.

---

## Quick environment-variable summary

| Variable | Required? | Purpose |
|---|---|---|
| `JWT_SECRET` | **Yes** | Signs login sessions (server won't start without it) |
| `POSTGRES_URL` | **Yes** | Database connection |
| `NODE_ENV=production` | **Yes** | Enables production behaviour |
| `APP_URL` | Strongly recommended | Locks CORS to your domain |
| `AZURE_*` / `ONEDRIVE_*` | **Yes if you use file uploads** | Durable storage for receipts/ID docs |
| `CSP_ENFORCE=1` | After testing | Turns the CSP from watch-mode to blocking |
| `PG_CA_CERT` | Recommended | Verifies the database TLS certificate |
| `CRON_SECRET` | Recommended | Protects the daily reminder endpoint |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | Optional | Sending notification emails |
| `GCP_BUCKET_NAME` | Alternative to OneDrive | Google Cloud Storage for files |

---

*This checklist reflects the security hardening completed in the codebase (role/privilege
guards, per-file access control, self-approval blocks, upload validation, input validation,
audit integrity, and header hardening). The app runs normally today; these steps apply only
when moving to a live server.*
