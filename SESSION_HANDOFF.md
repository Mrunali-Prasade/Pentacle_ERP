# Session handoff — Pentacle Payroll

Paste this into a new chat: **"Read SESSION_HANDOFF.md and continue where we left off."**

## What this project is
React 19 + Vite + Express + PostgreSQL payroll/HR/attendance/reimbursement ERP.
Run locally with `npm run dev` (frontend :3000, API :3001). Local Postgres DB `pentacle_payroll`.
Test accounts: `superadmin@ / hr@ / hr2@ / finance@ / cfo@ / employee@pentacle.test`, password `Pentacle@123`.

## What was done (a large security-hardening effort)
Went from a security grade of D− to A−, with every area at B+ or higher. All fixed & live-tested:
- **Granular Access Control** system (permissions / role_permissions / user_permission_overrides)
  with a Super Admin "Access Control" tab and an employee-facing "Extra Access" screen.
- **3 Critical fixes**: privilege escalation via role field, hardcoded JWT fallback secret,
  seeded-admin password + forced-password-change enforcement.
- **8 High fixes**: unauthenticated file serving, file IDOR, reimbursement/penalty/payslip/leave
  self-approval, PII over-fetch, malicious upload validation, path traversal.
- **Medium tranche**: CSV formula injection, payroll-lock guards, audit-log integrity, input
  validation, error-message sanitization, current-password check, CORS/CSP/headers.
- **B+ push**: **Aadhaar/PAN/bank encrypted at rest** (AES-256-GCM, needs `ENCRYPTION_KEY` in .env),
  DB-backed login rate-limiting, token-version session revocation.
- A re-audit caught & fixed 3 regressions (equal-rank self-promotion, leave self-approval,
  self-editing join_date).

## Recent small fixes (most recent first)
- Blocked applying for **leave on past dates** (backend + date-picker min).
- **"Extra Access"** now shows ONLY individually-granted (override) permissions, not role defaults,
  so HR/Super Admin no longer see a redundant duplicate menu (uses new `extraPermissions` field).
- Removed the amber "no screen exists yet" notice from Extra Access.
- Reimbursements table: PAID badge + Slip button now on one line.
- CORS: to use the app from a phone, add the LAN origin (e.g. `http://192.168.x.x:3000`) to the
  dev origins list in `server/modules/start.server.js` (~line 34). Use `localhost` on the PC.

## Reference docs in the repo
- `DEPLOYMENT_CHECKLIST.md` — everything to do when deploying (env vars, encryption key, storage…).
- `REMOVE_COMMITTED_RECEIPT.md` — the one open git-cleanup item.
- `server/seed-permissions.sql` — seed the permission catalog on a fresh DB.
- `server/migrate-encrypt-pii.mjs` — encrypt legacy plaintext PII rows.

## Open items / not done
- **Git**: work is on branch `dev_mrunali`, NOT yet committed/pushed. (Standing rule: always ask
  before any git commit/push. No co-author trailer on commits.)
- Committed test receipt still tracked in git (see REMOVE_COMMITTED_RECEIPT.md).
- One **known pre-existing** TypeScript warning in `PayslipManagementSection.tsx:89` — left as-is.
- Not deployed; production serving (Express serving the frontend + listening) isn't wired yet.
- Bigger picture for real payroll use: no automated tests, payroll math not accountant-verified,
  the ~2,600-line `server/controller/test.controller.js` should be split.

## Standing rules (important)
- Never run git commit/push or deploy without asking in chat first, every time.
- No "Co-Authored-By: Claude" trailer on commits.
- Verify changes: `npx tsc --noEmit` (expect only the 1 known error), restart dev server, live-test.
