-- server/schema.sql

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL, -- "code"
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    gender TEXT,
    marital_status TEXT,
    dob TEXT,
    mobile_number TEXT,
    country TEXT,
    is_leave_approver BOOLEAN DEFAULT false,
    mediclaim_number TEXT,
    aadhar_number TEXT,
    education_docs_url TEXT,
    aadhar_docs_url TEXT,
    pan_docs_url TEXT,
    exit_date TEXT,
    role TEXT NOT NULL,
    avatar_url TEXT,
    designation TEXT,
    department TEXT,
    location TEXT,
    state TEXT,
    join_date TEXT,
    status TEXT DEFAULT 'permanent', -- probation / permanent
    confirmation_date TEXT,
    overtime_eligible BOOLEAN DEFAULT false,
    uan_number TEXT,
    pan_number TEXT,
    bank_name TEXT,
    bank_account TEXT,
    salary_structure_id TEXT,
    manager_id TEXT,
    force_password_change BOOLEAN DEFAULT true,
    -- Bumped to invalidate every outstanding session for this user (password change / logout-all).
    token_version INTEGER NOT NULL DEFAULT 0
);

-- Durable, shared login-attempt log for brute-force throttling. Works across serverless
-- instances (an in-memory counter does not). Keyed on lower(email)+ip; old rows are pruned.
CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts (key, attempted_at);

CREATE TABLE IF NOT EXISTS salary_structures (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    monthly_salary NUMERIC(14,2) NOT NULL,
    basic_percent REAL DEFAULT 50.0,
    hra_percent REAL DEFAULT 10.0,
    conveyance_percent REAL DEFAULT 5.0,
    special_percent REAL DEFAULT 15.0,
    other_percent REAL DEFAULT 20.0,
    tds NUMERIC(14,2) DEFAULT 0,
    eps_pension NUMERIC(14,2) DEFAULT NULL,
    effective_from TEXT NOT NULL,
    FOREIGN KEY(employee_id) REFERENCES users(id)
);
-- One active salary row per employee (backstop for the app-level advisory lock).
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_emp_unique ON salary_structures (employee_id);

CREATE TABLE IF NOT EXISTS payslips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payroll_run_id TEXT,
    pay_period TEXT NOT NULL, -- MM-YYYY
    status TEXT NOT NULL, -- draft / locked
    calendar_days INTEGER NOT NULL,
    paid_days INTEGER NOT NULL,
    -- Earnings
    basic_salary NUMERIC(14,2) NOT NULL,
    hra NUMERIC(14,2) NOT NULL,
    conveyance_allowance NUMERIC(14,2) NOT NULL,
    special_allowance NUMERIC(14,2) NOT NULL,
    other_allowance NUMERIC(14,2) NOT NULL,
    reimbursements NUMERIC(14,2) DEFAULT 0,
    overtime_amount NUMERIC(14,2) DEFAULT 0,
    bonus NUMERIC(14,2) DEFAULT 0,
    gross_amount NUMERIC(14,2) NOT NULL,
    -- Deductions
    provident_fund NUMERIC(14,2) NOT NULL,
    employer_pf NUMERIC(14,2) NOT NULL,
    pension NUMERIC(14,2) NOT NULL,
    professional_tax NUMERIC(14,2) NOT NULL,
    income_tax NUMERIC(14,2) NOT NULL,
    lop_deduction NUMERIC(14,2) DEFAULT 0,
    loan_instalment NUMERIC(14,2) DEFAULT 0,
    other_deductions NUMERIC(14,2) DEFAULT 0,
    gross_deduction NUMERIC(14,2) NOT NULL,
    -- Totals
    net_amount NUMERIC(14,2) NOT NULL,
    amount_to_bank NUMERIC(14,2) NOT NULL,
    pdf_url TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
-- One payslip per employee per pay period (backstop for the runPayroll advisory lock).
CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_user_period_unique ON payslips (user_id, pay_period);

CREATE TABLE IF NOT EXISTS reimbursements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    cost_centre TEXT,
    is_taxable BOOLEAN NOT NULL DEFAULT false,
    proof_file_name TEXT,
    proof_file_size TEXT,
    payment_proof_file_name TEXT,
    comments TEXT,
    pay_period TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reimbursement_timeline (
    id SERIAL PRIMARY KEY,
    reimbursement_id TEXT NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY(reimbursement_id) REFERENCES reimbursements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    in_time TEXT,
    out_time TEXT,
    late_coming BOOLEAN DEFAULT false,
    early_leaving BOOLEAN DEFAULT false,
    worked_hours REAL DEFAULT 0,
    overtime_hours REAL DEFAULT 0,
    half_day BOOLEAN DEFAULT false,
    awol BOOLEAN DEFAULT false,
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS holidays (
    date TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_regularisations (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    in_time TEXT,
    out_time TEXT,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    timestamp TEXT,               -- when the request was submitted (ISO string)
    approved_by TEXT,             -- name of the approver, set when HR approves/rejects
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS attendance_summaries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    month TEXT NOT NULL, -- MM-YYYY
    marks_used INTEGER DEFAULT 0,
    late_marks INTEGER DEFAULT 0,
    early_marks INTEGER DEFAULT 0,
    half_day_deductions INTEGER DEFAULT 0,
    awol_days INTEGER DEFAULT 0,
    deduction_amount NUMERIC(14,2) DEFAULT 0,
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS overtime_summaries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    month TEXT NOT NULL, -- MM-YYYY
    overtime_hours REAL DEFAULT 0,
    rate REAL DEFAULT 50.0,
    overtime_amount NUMERIC(14,2) DEFAULT 0,
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leave_balances (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL, -- Earned / Casual-Sick / Paternity / Maternity / LOP
    entitled REAL DEFAULT 0,
    used REAL DEFAULT 0,
    available REAL DEFAULT 0,
    cycle_year TEXT NOT NULL,
    monthly_used REAL DEFAULT 0, -- For probation cap
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    days REAL NOT NULL,
    paid_days REAL NOT NULL,
    unpaid_days REAL NOT NULL,
    status TEXT NOT NULL, -- Pending / Approved / Rejected
    submission_date TEXT,
    reason TEXT,
    certificate_url TEXT,
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    principal NUMERIC(14,2) NOT NULL,
    monthly_instalment NUMERIC(14,2) NOT NULL,
    remaining_balance NUMERIC(14,2) NOT NULL,
    start_month TEXT NOT NULL,
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

-- Ledger of loan instalments deducted by each payroll run, one row per (loan, month). Lets a
-- payroll re-run undo exactly what a prior run of the same month deducted, so loans are never
-- double-charged. See runPayroll in controller/payroll.controller.js.
CREATE TABLE IF NOT EXISTS loan_payments (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL,
    pay_period TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    FOREIGN KEY(loan_id) REFERENCES loans(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_payments_unique ON loan_payments (loan_id, pay_period);

-- =============================================================================
-- GRANULAR PERMISSIONS
-- Roles (users.role) still gate access by default via role_permissions. This layer
-- lets a super_admin grant one extra module to a specific user without changing
-- their role — e.g. "reimbursements.approve" for one finance team member who is
-- not a full finance_head. There is deliberately no "revoke a role default" state
-- yet: presence of a row = extra access granted; absence = whatever the role
-- already allows. See requirePermission() in server/utils/helper.js.
-- =============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_key)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    granted_by TEXT,
    granted_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, permission_key)
);

-- Full catalog of grantable permissions, and each role's default bundle. This mirrors
-- exactly what requireRole([...]) allows on each route today — see server/routes/test.js.
-- super_admin is never seeded here; it always bypasses (see hasPermission()).
INSERT INTO permissions (key, label, category) VALUES
    ('reimbursements.approve', 'Approve / verify reimbursement claims', 'Reimbursements'),
    ('reimbursements.pay', 'Mark reimbursement claims as paid', 'Reimbursements'),
    ('leaves.approve', 'Approve / reject employee leave requests', 'Leave Management'),
    ('penalties.approve', 'Approve / waive attendance late & early-leaving penalties', 'Attendance'),
    ('attendance.history.export', 'Export attendance history', 'Attendance'),
    ('attendance.detailed.view', 'View detailed / per-employee monthly attendance', 'Attendance'),
    ('attendance.today.view', 'View today''s live attendance', 'Attendance'),
    ('attendance.timing.edit', 'Edit an employee''s punch in/out timing', 'Attendance'),
    ('attendance.regularisation.approve', 'Approve attendance regularisation requests', 'Attendance'),
    ('dashboard.metrics.view', 'View live HR dashboard metrics', 'Attendance'),
    ('employees.directory.view', 'View employee directory', 'Employee Directory'),
    ('employees.create', 'Create new employees', 'Employee Directory'),
    ('employees.edit', 'Edit employee records', 'Employee Directory'),
    ('employees.delete', 'Delete employees', 'Employee Directory'),
    ('employees.salary.edit', 'Edit employee salary', 'Employee Directory'),
    ('employees.salary.view', 'View salary structures', 'Employee Directory'),
    ('loans.manage', 'View and issue employee loans', 'Loans'),
    ('payslips.edit', 'Edit generated payslips', 'Payroll'),
    ('payroll.run', 'Run the monthly payroll', 'Payroll'),
    ('payroll.lock.view', 'View payroll lock status', 'Payroll'),
    ('payroll.lock.manage', 'Lock / unlock a payroll month', 'Payroll'),
    ('policy.edit', 'Edit global system policy constants', 'Admin & Policy'),
    ('holidays.manage', 'Add or remove holidays', 'Admin & Policy'),
    ('audit_logs.view', 'View the system audit trail', 'Admin & Policy')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role, permission_key) VALUES
    ('admin_hr', 'reimbursements.approve'),
    ('finance_head', 'reimbursements.approve'),
    ('cfo', 'reimbursements.approve'),
    ('finance_head', 'reimbursements.pay'),
    ('admin_hr', 'leaves.approve'),
    ('admin_hr', 'penalties.approve'),
    ('cfo', 'penalties.approve'),
    ('admin_hr', 'attendance.history.export'),
    ('admin_hr', 'attendance.detailed.view'),
    ('cfo', 'attendance.detailed.view'),
    ('admin_hr', 'attendance.today.view'),
    ('admin_hr', 'attendance.timing.edit'),
    ('cfo', 'attendance.timing.edit'),
    ('admin_hr', 'attendance.regularisation.approve'),
    ('cfo', 'attendance.regularisation.approve'),
    ('admin_hr', 'dashboard.metrics.view'),
    ('cfo', 'dashboard.metrics.view'),
    ('finance_head', 'dashboard.metrics.view'),
    ('admin_hr', 'employees.directory.view'),
    ('finance_head', 'employees.directory.view'),
    ('cfo', 'employees.directory.view'),
    ('admin_hr', 'employees.create'),
    ('admin_hr', 'employees.edit'),
    ('admin_hr', 'employees.delete'),
    ('admin_hr', 'employees.salary.edit'),
    ('finance_head', 'employees.salary.view'),
    ('cfo', 'employees.salary.view'),
    ('admin_hr', 'loans.manage'),
    ('finance_head', 'loans.manage'),
    ('finance_head', 'payslips.edit'),
    ('admin_hr', 'payslips.edit'),
    ('cfo', 'payslips.edit'),
    ('finance_head', 'payroll.run'),
    ('cfo', 'payroll.run'),
    ('admin_hr', 'payroll.lock.view'),
    ('finance_head', 'payroll.lock.view'),
    ('finance_head', 'payroll.lock.manage'),
    ('admin_hr', 'policy.edit'),
    ('admin_hr', 'holidays.manage')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, -- draft / locked
    generated_by TEXT,
    signed_by TEXT,
    locked_at TEXT
);

CREATE TABLE IF NOT EXISTS global_policy (
    id SERIAL PRIMARY KEY,
    late_grace_period INTEGER NOT NULL,
    overtime_rate TEXT NOT NULL,
    holiday_ot_rate TEXT NOT NULL,
    leave_accrual TEXT NOT NULL,
    sla_escalation TEXT NOT NULL,
    reimbursement_cutoff_days INTEGER NOT NULL DEFAULT 30,
    cfo_approval_threshold NUMERIC(14,2) NOT NULL DEFAULT 1000,
    arrival_time_end TEXT NOT NULL DEFAULT '09:30',
    leaving_time_start TEXT NOT NULL DEFAULT '18:00',
    leave_cycle_start_month TEXT NOT NULL DEFAULT 'January',
    -- Attendance rules: a day is "early" if fewer than required_shift_hours were worked.
    -- The first free_marks_allowance late/early marks each month are auto-waived ('Free').
    required_shift_hours REAL NOT NULL DEFAULT 9,
    free_marks_allowance INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS guardrails (
    id SERIAL PRIMARY KEY,
    category TEXT UNIQUE NOT NULL,
    monthly_cap NUMERIC(14,2) NOT NULL,
    proof_required BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL,
    role TEXT NOT NULL,
    module TEXT NOT NULL,
    change_description TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT
);

CREATE TABLE IF NOT EXISTS attendance_punches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    punch_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    address TEXT,
    work_mode TEXT,
    office_location TEXT,
    selfie_url TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);


CREATE TABLE IF NOT EXISTS attendance_daily_logs (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    in_time TEXT,
    in_source TEXT,
    out_time TEXT,
    out_source TEXT,
    penalty_type TEXT,
    penalty_status TEXT DEFAULT 'Pending',
    penalty_action_by_role TEXT,
    FOREIGN KEY(employee_id) REFERENCES users(id)
);

-- =============================================================================
-- INDEXES
-- Dates and timestamps are stored as TEXT and matched with LIKE 'YYYY-MM%'.
-- Under a non-C collation a plain btree index cannot serve a prefix LIKE, so those
-- columns use text_pattern_ops. Without these, every attendance lookup, HR screen
-- and payroll run performs a full table scan.
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_punches_user_ts       ON attendance_punches (user_id, timestamp text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_punches_ts            ON attendance_punches (timestamp text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_records_emp_date      ON attendance_records (employee_id, date text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_records_date          ON attendance_records (date text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_daily_logs_emp_date   ON attendance_daily_logs (employee_id, date text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_daily_logs_status     ON attendance_daily_logs (penalty_status);
CREATE INDEX IF NOT EXISTS idx_summaries_emp_month   ON attendance_summaries (employee_id, month);
CREATE INDEX IF NOT EXISTS idx_summaries_month       ON attendance_summaries (month);
CREATE INDEX IF NOT EXISTS idx_leaves_emp_status     ON leave_requests (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_status         ON leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leaves_from_date      ON leave_requests (from_date text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_regularisations_emp   ON attendance_regularisations (employee_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_user   ON reimbursements (user_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_status ON reimbursements (status);
CREATE INDEX IF NOT EXISTS idx_timeline_reimb        ON reimbursement_timeline (reimbursement_id);
CREATE INDEX IF NOT EXISTS idx_payslips_user         ON payslips (user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_period       ON payslips (pay_period);
CREATE INDEX IF NOT EXISTS idx_salary_emp            ON salary_structures (employee_id);
