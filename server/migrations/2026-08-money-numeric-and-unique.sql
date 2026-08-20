-- ============================================================================
-- One-time migration: exact money storage + integrity constraints
-- ----------------------------------------------------------------------------
-- WHAT IT DOES
--   1. De-duplicates salary_structures (one row per employee, keeps the latest).
--   2. De-duplicates payslips (one row per employee per pay period).
--   3. Adds UNIQUE indexes so those duplicates can never happen again.
--   4. Converts every *money* column from REAL (float, ~7 digits, inexact) to
--      NUMERIC(14,2) (exact rupees-and-paise). Percentages / hours / rates are
--      intentionally left as REAL — they are not the correctness risk.
--
-- SAFETY
--   * Wrapped in a single transaction — all-or-nothing.
--   * Idempotent: re-running is a no-op (dedupes find nothing, indexes use
--     IF NOT EXISTS, and only columns still typed `real` are converted).
--   * The app MUST already be running the build that registers the NUMERIC
--     type parser (server/config/app.config.js) so it keeps reading these
--     columns as JS numbers. Deploy that first, then run this once.
--   * Tables here are small; the ALTERs take a brief lock and complete quickly.
-- ============================================================================

BEGIN;

-- 1. De-duplicate salary_structures: keep the most recent effective_from per
--    employee (ties broken by the lexically-greatest id). No-op when clean.
DELETE FROM salary_structures s
USING salary_structures s2
WHERE s.employee_id = s2.employee_id
  AND s.effective_from < s2.effective_from;
DELETE FROM salary_structures s
USING salary_structures s2
WHERE s.employee_id = s2.employee_id
  AND s.effective_from = s2.effective_from
  AND s.id < s2.id;

-- 2. De-duplicate payslips: keep one row per (user_id, pay_period). No-op when clean.
DELETE FROM payslips p
USING payslips p2
WHERE p.user_id = p2.user_id
  AND p.pay_period = p2.pay_period
  AND p.id < p2.id;

-- 3. Uniqueness backstops (match the names created at app boot).
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_emp_unique ON salary_structures (employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_user_period_unique ON payslips (user_id, pay_period);

-- 4. Money columns REAL -> NUMERIC(14,2). Only columns still typed `real` are
--    touched, so re-runs do nothing. ROUND(...,2) cleans any existing float noise
--    to the intended rupee value.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN (VALUES
      ('salary_structures','monthly_salary'),
      ('salary_structures','tds'),
      ('salary_structures','eps_pension'),
      ('payslips','basic_salary'),
      ('payslips','hra'),
      ('payslips','conveyance_allowance'),
      ('payslips','special_allowance'),
      ('payslips','other_allowance'),
      ('payslips','bonus'),
      ('payslips','overtime_amount'),
      ('payslips','reimbursements'),
      ('payslips','gross_amount'),
      ('payslips','provident_fund'),
      ('payslips','employer_pf'),
      ('payslips','professional_tax'),
      ('payslips','income_tax'),
      ('payslips','pension'),
      ('payslips','loan_instalment'),
      ('payslips','lop_deduction'),
      ('payslips','other_deductions'),
      ('payslips','gross_deduction'),
      ('payslips','net_amount'),
      ('payslips','amount_to_bank'),
      ('reimbursements','amount'),
      ('loans','principal'),
      ('loans','monthly_instalment'),
      ('loans','remaining_balance'),
      ('loan_payments','amount'),
      ('guardrails','monthly_cap'),
      ('global_policy','cfo_approval_threshold'),
      ('attendance_summaries','deduction_amount'),
      ('overtime_summaries','overtime_amount')
    ) AS m(table_name, column_name)
      ON c.table_name = m.table_name AND c.column_name = m.column_name
    WHERE c.data_type = 'real'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC(14,2) USING ROUND(%I::numeric, 2)',
      r.table_name, r.column_name, r.column_name);
    RAISE NOTICE 'Converted %.% -> NUMERIC(14,2)', r.table_name, r.column_name;
  END LOOP;
END $$;

COMMIT;
