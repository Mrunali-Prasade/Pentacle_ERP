// Payroll & payslip controllers: view/edit payslips, run monthly payroll, and payroll-lock
// management. Includes the TDS estimator used by the payroll run. Moved verbatim from
// the original monolithic controller; no logic change.
import { pool } from '../config/app.config.js';
import { decryptField, hasPermission } from '../utils/helper.js';
import { serverError } from './_shared.js';
import crypto from 'crypto';

// A 'YYYY-MM' month counts as "ended" only once the current IST calendar month is past it.
// Payroll must not be run or locked for a month still in progress: that month's attendance,
// penalties and leaves aren't final, and days not yet worked would be paid as if they were.
function monthHasEnded(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return false;
  const istMonthNow = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 7);
  return month < istMonthNow;
}

export const getPayslips = async (req, res) => {
  const user = req.user;
  let payslips = [];
  try {
      // A plain employee only sees their own payslips — unless granted payslips.edit (see
      // requirePermission on PUT /payslips/:id), in which case they need the full list to
      // actually use the permission they were given, same as reimbursements.approve.
      if (user.role === 'employee' && !(await hasPermission(user, 'payslips.edit'))) {
          payslips = (await pool.query('SELECT p.id, p.pay_period as "payPeriod", p.status, p.calendar_days as "calendarDays", p.paid_days as "paidDays", p.net_amount as "netAmount", p.gross_amount as "grossAmount", p.gross_deduction as "grossDeduction", p.basic_salary as "basicSalary", p.hra, p.special_allowance as "specialAllowance", p.conveyance_allowance as "conveyanceAllowance", p.other_allowance as "otherAllowance", p.reimbursements, p.overtime_amount as "overtimeAmount", p.bonus, p.provident_fund as "providentFund", p.employer_pf as "employerPf", p.pension, p.professional_tax as "professionalTax", p.income_tax as "incomeTax", p.lop_deduction as "lopDeduction", p.loan_instalment as "loanInstalment", p.other_deductions as "otherDeductions", p.amount_to_bank as "amountToBank", p.pdf_url as "pdfUrl", u.name as "employeeName", u.employee_id as "employeeId", u.designation, u.department, u.pan_number as "panNumber", u.uan_number as "uanNumber", u.bank_name as "bankName", u.bank_account as "bankAccount", u.location, u.state, u.join_date as "joinDate", s.monthly_salary as "monthlySalary" FROM payslips p JOIN users u ON p.user_id = u.id LEFT JOIN salary_structures s ON u.id = s.employee_id WHERE p.user_id = $1', [user.id])).rows;
      } else {
          payslips = (await pool.query('SELECT p.id, p.user_id as "_uid", p.pay_period as "payPeriod", p.status, p.calendar_days as "calendarDays", p.paid_days as "paidDays", p.net_amount as "netAmount", p.gross_amount as "grossAmount", p.gross_deduction as "grossDeduction", p.basic_salary as "basicSalary", p.hra, p.special_allowance as "specialAllowance", p.conveyance_allowance as "conveyanceAllowance", p.other_allowance as "otherAllowance", p.reimbursements, p.overtime_amount as "overtimeAmount", p.bonus, p.provident_fund as "providentFund", p.employer_pf as "employerPf", p.pension, p.professional_tax as "professionalTax", p.income_tax as "incomeTax", p.lop_deduction as "lopDeduction", p.loan_instalment as "loanInstalment", p.other_deductions as "otherDeductions", p.amount_to_bank as "amountToBank", p.pdf_url as "pdfUrl", u.name as "employeeName", u.employee_id as "employeeId", u.designation, u.department, u.pan_number as "panNumber", u.uan_number as "uanNumber", u.bank_name as "bankName", u.bank_account as "bankAccount", u.location, u.state, u.join_date as "joinDate", s.monthly_salary as "monthlySalary" FROM payslips p JOIN users u ON p.user_id = u.id LEFT JOIN salary_structures s ON u.id = s.employee_id')).rows;

          // A plain employee who was merely granted payslips.edit can see the whole list to do
          // their job, but must not harvest everyone else's PAN / bank account. The payroll roles
          // (admin_hr / finance_head / cfo / super_admin) legitimately need these on the payslip
          // itself, so they are left untouched.
          if (user.role === 'employee') {
              for (const p of payslips) {
                  if (p._uid !== user.id) {
                      p.panNumber = null; p.uanNumber = null; p.bankName = null; p.bankAccount = null;
                  }
              }
          }
          for (const p of payslips) delete p._uid;
      }
      // Decrypt the sensitive fields that come off the users table for display on the payslip.
      for (const p of payslips) {
          p.panNumber = decryptField(p.panNumber);
          p.uanNumber = decryptField(p.uanNumber);
          p.bankAccount = decryptField(p.bankAccount);
      }
  } catch (e) {
      return serverError(res, e);
  }
  res.json(payslips);
};

export const updatePayslip = async (req, res) => {
  try {
      const { id } = req.params;
      const { basicSalary, hra, specialAllowance, conveyanceAllowance, otherAllowance, bonus, providentFund, professionalTax, incomeTax, lopDeduction, otherDeductions, grossAmount, grossDeduction, netAmount, amountToBank } = req.body;

      const slip = (await pool.query(
          'SELECT p.user_id, p.pay_period, p.status, p.net_amount, u.name as employee_name FROM payslips p JOIN users u ON u.id = p.user_id WHERE p.id = $1',
          [id]
      )).rows[0];
      if (!slip) return res.status(404).json({ error: 'Payslip not found' });

      // You cannot edit your OWN payslip — no self-dealing on your net pay, whatever your role.
      if (slip.user_id === req.user.id) {
          return res.status(403).json({ error: 'You cannot edit your own payslip. Another authoriser must do it.' });
      }
      // A locked or already-paid payslip is a closed record; only a super_admin may touch it.
      if ((slip.status === 'locked' || slip.status === 'paid') && req.user.role !== 'super_admin') {
          return res.status(400).json({ error: `This payslip is "${slip.status}" and can no longer be edited.` });
      }

      await pool.query(`
          UPDATE payslips SET
              basic_salary = $1, hra = $2, special_allowance = $3, conveyance_allowance = $4,
              other_allowance = $5, bonus = $6, provident_fund = $7, professional_tax = $8,
              income_tax = $9, lop_deduction = $10, other_deductions = $11,
              gross_amount = $12, gross_deduction = $13, net_amount = $14, amount_to_bank = $15
          WHERE id = $16
      `, [basicSalary, hra, specialAllowance, conveyanceAllowance, otherAllowance, bonus, providentFund, professionalTax, incomeTax, lopDeduction, otherDeductions, grossAmount, grossDeduction, netAmount, amountToBank, id]);

      // Payslip edits change take-home pay — always leave an audit trail of who changed what.
      await pool.query(
          `INSERT INTO audit_logs (id, timestamp, actor, role, module, change_description, before_value, after_value)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          ['AL-' + crypto.randomUUID(), new Date().toISOString().replace('T', ' ').substring(0, 19),
           req.user.name, req.user.role, 'Payroll',
           `Edited payslip ${id} for ${slip.employee_name}`,
           `Net: ${slip.net_amount}`, `Net: ${netAmount}`]
      ).catch((e) => console.error('[Audit] payslip edit log failed:', e.message));

      res.json({ success: true });
  } catch (e) {
      serverError(res, e);
  }
};

// Simplified New Tax Regime (default regime) monthly TDS estimate: annualises the current
// month's gross, applies the slab rates + 4% cess, then divides by 12. It ignores investment
// declarations, HRA exemption and Section 80 deductions, so it is a starting estimate only —
// Finance/CFO can correct any individual payslip afterward via the Edit Payslip screen.
function estimateMonthlyTDS(monthlyGross) {
  const STANDARD_DEDUCTION = 75000;
  const annualGross = monthlyGross * 12;
  const taxableIncome = Math.max(0, annualGross - STANDARD_DEDUCTION);

  // Section 87A rebate: no tax when taxable income is at or below ₹7,00,000.
  if (taxableIncome <= 700000) return 0;

  const slabs = [
    [300000, 0],
    [600000, 0.05],
    [900000, 0.10],
    [1200000, 0.15],
    [1500000, 0.20],
    [Infinity, 0.30],
  ];

  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of slabs) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upper) - lower) * rate;
    lower = upper;
  }

  tax *= 1.04; // health & education cess
  return Math.round(tax / 12);
}

export const runPayroll = async (req, res) => {
  const recentSummary = (await pool.query('SELECT month FROM attendance_summaries ORDER BY month DESC LIMIT 1')).rows[0];
  // Prefer the month the caller selected (the modal's month picker); fall back to the latest
  // month that has attendance data. attendance_summaries.month is always YYYY-MM.
  const requestedMonth = (req.body && req.body.month) || (req.query && req.query.month);
  if (requestedMonth && !/^\d{4}-\d{2}$/.test(requestedMonth)) {
      return res.status(400).json({ error: 'Invalid month. Expected YYYY-MM.' });
  }
  const currentMonth = requestedMonth || (recentSummary ? recentSummary.month : '2023-11');

  // Payroll can only be run once the month has actually ended — otherwise the month's
  // attendance/penalties/leaves aren't final and days not yet worked would be paid.
  if (!monthHasEnded(currentMonth)) {
      return res.status(400).json({ error: `Payroll for ${currentMonth} can only be run once the month has ended.` });
  }

  // Re-running deletes and regenerates every payslip for the month. If the month is locked
  // that would destroy signed-off records (and re-deduct loan instalments), so refuse.
  const lockRow = (await pool.query('SELECT status FROM payroll_runs WHERE month = $1', [currentMonth])).rows[0];
  if (lockRow && lockRow.status === 'locked') {
      return res.status(400).json({ error: `Payroll for ${currentMonth} is locked and cannot be re-run. Unlock it first if you genuinely need to regenerate it.` });
  }

  const existingRun = (await pool.query('SELECT id FROM payslips WHERE pay_period = $1 LIMIT 1', [currentMonth])).rows[0];
  if (existingRun) {
      await pool.query('DELETE FROM payslips WHERE pay_period = $1', [currentMonth]);
  }

  const employees = (await pool.query(`
      SELECT u.id, u.name, s.monthly_salary,
             COALESCE(a.awol_days, 0) as awol,
             COALESCE(a.deduction_amount, 0) as deduction_amount
      FROM users u
      JOIN salary_structures s ON u.id = s.employee_id
      LEFT JOIN attendance_summaries a ON u.id = a.employee_id AND a.month = $1
  `, [currentMonth])).rows;

  let processedCount = 0;
  const [yearPart, monthPart] = currentMonth.split('-');
  const isFebruary = monthPart === '02';
  // Actual number of days in this specific month (28-31), not a fixed guess — matches how the
  // real payroll register divides each month's salary by that month's own day count.
  const calendarDays = new Date(Number(yearPart), Number(monthPart), 0).getDate();

  const client = await pool.connect();
  try {
      await client.query('BEGIN');

      // Batch-fetch the two per-employee lookups up front — one query each for the whole
      // headcount instead of one query per employee. This is the whole point of the change:
      // on serverless the old loop made ~4 database round-trips per employee, so a large
      // headcount ran past the request timeout. The values below are identical to what the
      // per-employee queries returned; only the number of round-trips changes.
      const empIds = employees.map((e) => e.id);
      const leaveMap = new Map();
      const loansByEmp = new Map();
      if (empIds.length) {
          // Only THIS month's unpaid leave. Previously this summed every approved unpaid-leave
          // day the employee had ever taken (no date filter), so each payroll run re-deducted all
          // past unpaid leave and progressively over-charged people. A leave is attributed to the
          // month of its from_date — the same convention the leave screens use elsewhere.
          const leaveRows = (await client.query(
              "SELECT employee_id, SUM(unpaid_days) AS lops FROM leave_requests WHERE status = 'Approved' AND from_date LIKE $2 AND employee_id = ANY($1) GROUP BY employee_id",
              [empIds, currentMonth + '%']
          )).rows;
          for (const r of leaveRows) leaveMap.set(r.employee_id, r.lops);

          const loanRows = (await client.query(
              'SELECT id, employee_id, monthly_instalment, remaining_balance FROM loans WHERE remaining_balance > 0 AND employee_id = ANY($1)',
              [empIds]
          )).rows;
          for (const loan of loanRows) {
              if (!loansByEmp.has(loan.employee_id)) loansByEmp.set(loan.employee_id, []);
              loansByEmp.get(loan.employee_id).push(loan);
          }
      }

      const payslipRows = [];
      for (const emp of employees) {
          const monthlySalary = emp.monthly_salary;
          // leaveMap holds the same SUM(unpaid_days) the per-employee query produced; an employee
          // with no approved unpaid leave is simply absent from the map. The `|| 0` reproduces the
          // old `unpaidLeaves.lops || 0` exactly (lops was null when there were no matching rows).
          const unpaidLeaveDays = (leaveMap.has(emp.id) ? leaveMap.get(emp.id) : null) || 0;

          const absentDays = emp.awol + unpaidLeaveDays;
          const paidDays = Math.max(0, calendarDays - absentDays);
          const earnedGrossAmount = Math.round((monthlySalary / calendarDays) * paidDays);

          const basicSalary = Math.round(earnedGrossAmount * 0.50);
          const hra = Math.round(earnedGrossAmount * 0.10);
          const conveyanceAllowance = Math.round(earnedGrossAmount * 0.05);
          const otherAllowance = Math.round(earnedGrossAmount * 0.20);
          const specialAllowance = earnedGrossAmount - (basicSalary + hra + conveyanceAllowance + otherAllowance);

          const providentFund = Math.round(basicSalary * 0.12);
          const totalEmployerContrib = Math.round(basicSalary * 0.12);
          const pension = Math.round(Math.min(1250, basicSalary * 0.0833));
          const employerPf = totalEmployerContrib - pension;

          const professionalTax = (earnedGrossAmount < 7500) ? 0 : (isFebruary ? 300 : 200);
          const incomeTax = estimateMonthlyTDS(monthlySalary);
          const grossDeduction = professionalTax + providentFund + employerPf + pension + incomeTax;

          const netAmount = earnedGrossAmount - grossDeduction;

          // Deduct this month's installment from any active loan (remaining_balance > 0),
          // and pay down that balance so future runs stop deducting once it's cleared.
          // These UPDATEs stay per-loan on purpose: loans are sparse (most employees have
          // none), so they scale with the number of loans, not the headcount, and keeping the
          // exact statement guarantees the stored balance is byte-for-byte what it was before.
          const activeLoans = loansByEmp.get(emp.id) || [];
          let loanInstalment = 0;
          for (const loan of activeLoans) {
              const thisPayment = Math.min(loan.monthly_instalment, loan.remaining_balance);
              loanInstalment += thisPayment;
              await client.query('UPDATE loans SET remaining_balance = remaining_balance - $1 WHERE id = $2', [thisPayment, loan.id]);
          }

          const amountToBank = netAmount - loanInstalment;

          const payslipId = 'slip-' + Math.random().toString(36).substring(2, 9);
          payslipRows.push([
              payslipId, emp.id, 'PR-CURRENT', currentMonth, 'draft', calendarDays, paidDays,
              basicSalary, hra, conveyanceAllowance, specialAllowance, otherAllowance,
              0, 0, 0, earnedGrossAmount,
              providentFund, employerPf, pension, professionalTax, incomeTax,
              0, loanInstalment, 0, grossDeduction,
              netAmount, amountToBank, null
          ]);
          processedCount++;
      }

      // One multi-row INSERT instead of one INSERT per employee. Chunked so we never exceed
      // Postgres's parameter limit (28 columns x 500 rows = 14,000 params, well under 65,535).
      const PAYSLIP_COLS = 28;
      const INSERT_CHUNK = 500;
      for (let i = 0; i < payslipRows.length; i += INSERT_CHUNK) {
          const slice = payslipRows.slice(i, i + INSERT_CHUNK);
          const placeholders = slice.map((_, r) =>
              '(' + Array.from({ length: PAYSLIP_COLS }, (_, c) => `$${r * PAYSLIP_COLS + c + 1}`).join(', ') + ')'
          ).join(', ');
          await client.query(`
              INSERT INTO payslips (
                  id, user_id, payroll_run_id, pay_period, status, calendar_days, paid_days,
                  basic_salary, hra, conveyance_allowance, special_allowance, other_allowance,
                  reimbursements, overtime_amount, bonus, gross_amount,
                  provident_fund, employer_pf, pension, professional_tax, income_tax,
                  lop_deduction, loan_instalment, other_deductions, gross_deduction,
                  net_amount, amount_to_bank, pdf_url
              ) VALUES ${placeholders}
          `, slice.flat());
      }
      await client.query('COMMIT');
  } catch (trxErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw trxErr;
  } finally {
      client.release();
  }
  res.json({ success: true, processed: processedCount, claimsProcessed: 0 });
};

export const checkPayrollLock = async (req, res) => {
  const month = req.params.month;
  const pendingPenalties = (await pool.query("SELECT COUNT(*) as c FROM attendance_daily_logs WHERE penalty_status = 'Pending' AND date LIKE $1", [`${month}%`])).rows[0].c;
  // Pending reimbursement claims are intentionally NOT a payroll blocker: claims are paid on
  // their own approval/payment track, independent of the monthly salary run.
  const pendingLeaves = (await pool.query("SELECT COUNT(*) as c FROM leave_requests WHERE status = 'Pending' AND from_date LIKE $1", [`${month}%`])).rows[0].c;

  const run = (await pool.query("SELECT status FROM payroll_runs WHERE month = $1", [month])).rows[0];
  const isLocked = run && run.status === 'locked';

  res.json({
      month,
      isLocked: !!isLocked,
      monthEnded: monthHasEnded(month),
      blockers: {
          penalties: pendingPenalties,
          leaves: pendingLeaves
      },
      totalBlockers: pendingPenalties + pendingLeaves
  });
};

export const lockPayroll = async (req, res) => {
  const month = req.params.month;
  const user = req.user;

  if (!monthHasEnded(month)) {
      return res.status(400).json({ error: `Payroll for ${month} can only be locked once the month has ended.` });
  }

  const pendingPenalties = (await pool.query("SELECT COUNT(*) as c FROM attendance_daily_logs WHERE penalty_status = 'Pending' AND date LIKE $1", [`${month}%`])).rows[0].c;
  // Pending reimbursement claims no longer block locking — they settle on their own track.
  const pendingLeaves = (await pool.query("SELECT COUNT(*) as c FROM leave_requests WHERE status = 'Pending' AND from_date LIKE $1", [`${month}%`])).rows[0].c;

  if (pendingPenalties > 0 || pendingLeaves > 0) {
      return res.status(400).json({ error: 'Cannot lock payroll. There are pending blockers.' });
  }
  
  const run = (await pool.query("SELECT status FROM payroll_runs WHERE month = $1", [month])).rows[0];
  if (run && run.status === 'locked') {
      return res.status(400).json({ error: 'Payroll is already locked for this month.' });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO payroll_runs (id, month, status, generated_by, locked_at)
                  VALUES ($1, $2, 'locked', $3, $4)
                  ON CONFLICT(month) DO UPDATE SET status = 'locked', generated_by = $3, locked_at = $4`,
          [Date.now().toString(), month, user.id, new Date().toISOString()]);

      await client.query("UPDATE payslips SET status = 'released' WHERE pay_period = $1", [month]);
      await client.query('COMMIT');
  } catch(e) {
      await client.query('ROLLBACK').catch(() => {});
      return serverError(res, e);
  } finally {
      client.release();
  }
  res.json({ success: true });
};
