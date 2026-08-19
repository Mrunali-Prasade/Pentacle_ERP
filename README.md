# Pentacle Payroll

Enterprise Payroll, Attendance & Reimbursement system for Pentacle Consultants.

A role-based web app covering:
- **Employee self-service** — punch clock, payslips, reimbursement claims, profile
- **HR administration** — employee directory, attendance penalties, leave approvals, holidays
- **Finance** — payroll runs, reimbursement claim payment
- **CFO** — final approval on reimbursement claims above a threshold
- **Super Admin** — global policy, spend guardrails, audit log

## Tech stack

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS
- **Backend**: Express (Node.js), raw SQL via `pg`
- **Database**: PostgreSQL
- **Auth**: JWT stored in an HTTP-only cookie
- **Deployment**: Vercel — the Express app runs as a single serverless function (`api/index.ts`), with a daily cron job for missing-punch-out reminders
- **File storage**: pluggable — OneDrive (Graph API), Google Cloud Storage, or local disk, auto-selected based on which env vars are set

## Prerequisites

- Node.js
- PostgreSQL (local install, Docker, or a hosted instance)

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Create a Postgres database** and note its connection string.

3. **Configure environment variables** — copy `.env.example` to `.env` and fill in:
   - `POSTGRES_URL` — your Postgres connection string
   - `JWT_SECRET` — a long random string (generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
   - `APP_URL` — `http://localhost:3000` for local dev

4. **Apply the database schema**
   ```
   psql -U <user> -h <host> -d <database> -f server/schema.sql
   ```

5. **Seed test accounts** (one per role, password `Pentacle@123`, each forced to change password on first login)
   ```
   npm run seed
   ```

6. **Run the app**
   ```
   npm run dev
   ```
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001 (proxied from the frontend under `/api`)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run frontend + backend together for local development |
| `npm run build` | Build the frontend for production (`dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run seed` | Seed one test account per role into the database |
| `npm run lint` | Type-check the codebase |

## Deployment

Deployed on Vercel. `vercel.json` routes `/api/*` to the serverless Express function and everything else to the SPA. Required environment variables on Vercel: `POSTGRES_URL`, `JWT_SECRET`, `APP_URL`, plus any storage/email provider variables you intend to use (see `.env.example` and `server/services/storage.ts`).
