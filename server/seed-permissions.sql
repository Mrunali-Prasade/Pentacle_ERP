-- =============================================================================
-- Permissions seed — run ONCE against the production database after schema.sql.
--
-- This fills two tables that power the Access Control feature:
--   * permissions      — the catalog of every grantable permission ("Approve claims", etc.)
--   * role_permissions — which permissions each role gets by default
--
-- Without this data, no role has any permission and the whole app's access control fails.
-- It is safe to run more than once (ON CONFLICT DO NOTHING skips rows that already exist).
--
-- How to run (example):
--   psql "$POSTGRES_URL" -f server/seed-permissions.sql
-- =============================================================================

-- Safety: make sure the tables exist (schema.sql normally creates them; this is a no-op if so).
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

-- -----------------------------------------------------------------------------
-- The full catalog of grantable permissions.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Default permissions per role. super_admin is intentionally NOT listed here — it
-- bypasses every permission check in code and always has full access. 'audit_logs.view'
-- is intentionally granted to no role by default (super_admin only, unless explicitly
-- granted to a specific user via the Access Control screen).
-- -----------------------------------------------------------------------------
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
