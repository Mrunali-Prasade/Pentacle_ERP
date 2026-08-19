import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from '../routes/index.js';
import { config } from '../config/app.config.js';
import { pool } from '../config/app.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Security Headers (enterprise standard) ---
// The Content-Security-Policy ships in REPORT-ONLY mode: it reports violations to the browser
// console but blocks nothing, so it can never break the app. Once the app is deployed and every
// screen has been exercised with the console open (see README / handover notes), flip
// `CSP_ENFORCE=1` in the environment to turn it into an enforcing policy.
// Note: a CSP only protects the HTML page if the server that returns index.html sends this
// header. When this Express server serves the built frontend it is covered automatically; if a
// separate static host serves the frontend, set the same header there.
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  mediaSrc: ["'self'", "data:", "blob:"],
  connectSrc: ["'self'"],
  frameSrc: ["'self'", "blob:", "data:", "https:"],
  formAction: ["'self'"],
  upgradeInsecureRequests: null, // don't force HTTPS upgrades — would break plain-HTTP hosts
};
try {
  const helmetModule = await import('helmet');
  const helmet = helmetModule.default || helmetModule;
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      reportOnly: process.env.CSP_ENFORCE !== '1',
      directives: CSP_DIRECTIVES,
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  }));
  console.log(`[Security] Helmet active (CSP ${process.env.CSP_ENFORCE === '1' ? 'enforcing' : 'report-only'})`);
} catch (e) {
  console.warn('[Security] helmet module not found — security headers skipped');
}

// --- CORS: Lock to the known app domain ---
// VERCEL_URL is injected automatically by Vercel, so the deployed origin is always
// allowed even if APP_URL was never configured. Localhost is only trusted off-production.
const allowedOrigins = [
  config.appUrl,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ...(config.env !== 'production' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Exact match only. startsWith allowed `https://pentacle-payroll.vercel.app.evil.com`
    // to pass — a prefix is not an origin. Same-origin/no-origin requests (curl, the app
    // itself) have no Origin header and are allowed through.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' not allowed`));
    }
  },
  credentials: true,
}));

// 25mb comfortably fits the largest legitimate request (an employee edit can carry up to four
// documents, each capped at 5mb by decodeUpload) while roughly halving the memory a single
// request can force us to buffer. Individual files are still validated and size-checked per
// file in the controllers.
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// Uploaded files are served by an authenticated, per-file-authorized route inside the API
// router (GET /api/uploads/*, see routes/api.routes.js -> serveUpload). The old public
// express.static mount was removed: it exposed receipts and identity documents to anyone.

// Mount all routes onto /api
app.use('/api', apiRouter);

// Central error handler. Any error thrown from a route — including un-caught async rejections,
// which reach here thanks to the asyncWrap in routes/api.routes.js — lands as a clean 500 instead of
// a hung request. The real error is logged server-side; the client sees only a generic message.
app.use((err, req, res, next) => {
  console.error('[Route error]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Indexes for the hot lookup paths. Dates/timestamps are TEXT matched with LIKE
// 'YYYY-MM%', which a plain btree cannot serve under a non-C collation, hence
// text_pattern_ops. Runs once at boot; IF NOT EXISTS makes it a no-op thereafter.
const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_punches_user_ts ON attendance_punches (user_id, timestamp text_pattern_ops)',
  'CREATE INDEX IF NOT EXISTS idx_punches_ts ON attendance_punches (timestamp text_pattern_ops)',
  'CREATE INDEX IF NOT EXISTS idx_records_emp_date ON attendance_records (employee_id, date text_pattern_ops)',
  'CREATE INDEX IF NOT EXISTS idx_records_date ON attendance_records (date text_pattern_ops)',
  'CREATE INDEX IF NOT EXISTS idx_daily_logs_emp_date ON attendance_daily_logs (employee_id, date text_pattern_ops)',
  'CREATE INDEX IF NOT EXISTS idx_daily_logs_status ON attendance_daily_logs (penalty_status)',
  'CREATE INDEX IF NOT EXISTS idx_summaries_emp_month ON attendance_summaries (employee_id, month)',
  'CREATE INDEX IF NOT EXISTS idx_summaries_month ON attendance_summaries (month)',
  'CREATE INDEX IF NOT EXISTS idx_leaves_emp_status ON leave_requests (employee_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_leaves_status ON leave_requests (status)',
  'CREATE INDEX IF NOT EXISTS idx_leaves_from_date ON leave_requests (from_date text_pattern_ops)',
  'CREATE INDEX IF NOT EXISTS idx_regularisations_emp ON attendance_regularisations (employee_id)',
  'CREATE INDEX IF NOT EXISTS idx_reimbursements_user ON reimbursements (user_id)',
  'CREATE INDEX IF NOT EXISTS idx_reimbursements_status ON reimbursements (status)',
  'CREATE INDEX IF NOT EXISTS idx_timeline_reimb ON reimbursement_timeline (reimbursement_id)',
  'CREATE INDEX IF NOT EXISTS idx_payslips_user ON payslips (user_id)',
  'CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips (pay_period)',
  'CREATE INDEX IF NOT EXISTS idx_salary_emp ON salary_structures (employee_id)',
];
(async () => {
  for (const sql of INDEXES) {
    await pool.query(sql).catch((e) => console.error('[Index]', e.message));
  }
})();

// Ensure payment_proof_file_name column exists
pool.query('ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS payment_proof_file_name TEXT')
  .catch(() => {});

// Ensure certificate_url column exists
pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS certificate_url TEXT')
  .catch(() => {});

// getAllLeaveRequests selects and orders by submission_date, so guarantee it exists
pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS submission_date TEXT')
  .catch(() => {});

// Ensure leave_cycle_start_month column exists
pool.query("ALTER TABLE global_policy ADD COLUMN IF NOT EXISTS leave_cycle_start_month TEXT NOT NULL DEFAULT 'January'")
  .catch(() => {});

// Attendance rule settings (shift length + free late/early allowance)
pool.query('ALTER TABLE global_policy ADD COLUMN IF NOT EXISTS required_shift_hours REAL NOT NULL DEFAULT 9')
  .catch(() => {});
pool.query('ALTER TABLE global_policy ADD COLUMN IF NOT EXISTS free_marks_allowance INTEGER NOT NULL DEFAULT 3')
  .catch(() => {});

// Loan-payment ledger (makes payroll re-runs idempotent — see runPayroll). Created here so
// existing databases get it without a manual migration; also defined in schema.sql for fresh ones.
pool.query(`CREATE TABLE IF NOT EXISTS loan_payments (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL,
    pay_period TEXT NOT NULL,
    amount REAL NOT NULL
)`).then(() => pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_payments_unique ON loan_payments (loan_id, pay_period)'))
  .catch((e) => console.error('[Migrate] loan_payments:', e.message));

// The attendance rules read global_policy WHERE id = 1. Without that row every setting
// silently falls back to a hardcoded default and the admin policy screen has nothing to edit.
pool.query(`
  INSERT INTO global_policy (id, late_grace_period, overtime_rate, holiday_ot_rate, leave_accrual,
                             sla_escalation, reimbursement_cutoff_days, cfo_approval_threshold)
  VALUES (1, 30, '50', '50', '1.5 days/month', '5 Business Days', 30, 1000)
  ON CONFLICT (id) DO NOTHING
`).catch((e) => console.error('[Policy] could not ensure default row:', e.message));

if (config.env !== 'production' && !process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`[Server] Running on http://localhost:${config.port}`);
  });
}

// Global Process Error Handlers
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err.message, err.stack);
  process.exit(1);
});

export default app;
