// Admin / settings controllers: global policy, company holidays, audit-log listing, and
// reimbursement guardrails. Moved verbatim from the original monolithic controller; no logic change.
import { pool } from '../config/app.config.js';
import { recalculateAttendanceSummaries } from '../services/attendance-engine.js';
import { serverError } from './_shared.js';

export const getGlobalPolicy = async (req, res) => {
  const policy = (await pool.query('SELECT late_grace_period as "lateGracePeriod", overtime_rate as "overtimeRate", holiday_ot_rate as "holidayOtRate", leave_accrual as "leaveAccrual", sla_escalation as "slaEscalation", reimbursement_cutoff_days as "reimbursementCutoffDays", cfo_approval_threshold as "cfoApprovalThreshold" FROM global_policy WHERE id = 1')).rows[0];
  res.json(policy);
};

export const updateGlobalPolicy = async (req, res) => {
  const { lateGracePeriod, overtimeRate, holidayOtRate, leaveAccrual, slaEscalation, reimbursementCutoffDays, cfoApprovalThreshold, leaveCycleStartMonth } = req.body;
  await pool.query(`
      UPDATE global_policy SET 
          late_grace_period = COALESCE($1, late_grace_period),
          overtime_rate = COALESCE($2, overtime_rate),
          holiday_ot_rate = COALESCE($3, holiday_ot_rate),
          leave_accrual = COALESCE($4, leave_accrual),
          sla_escalation = COALESCE($5, sla_escalation),
          reimbursement_cutoff_days = COALESCE($6, reimbursement_cutoff_days),
          cfo_approval_threshold = COALESCE($7, cfo_approval_threshold),
          leave_cycle_start_month = COALESCE($8, leave_cycle_start_month)
      WHERE id = 1
  `, [lateGracePeriod, overtimeRate, holidayOtRate, leaveAccrual, slaEscalation, reimbursementCutoffDays, cfoApprovalThreshold, leaveCycleStartMonth]);
  res.json({ success: true });
};

export const getHolidays = async (req, res) => {
  res.json((await pool.query('SELECT date, name FROM holidays ORDER BY date ASC')).rows);
};

export const addHoliday = async (req, res) => {
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'Missing fields' });
  try {
      await pool.query('INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT(date) DO UPDATE SET name = $2', [date, name]);
      // Postgres booleans: use false, not 0 (0 works in SQLite but errors as "boolean = integer" in pg).
      await pool.query('UPDATE attendance_records SET late_coming = false, early_leaving = false, half_day = false, awol = false WHERE date = $1', [date]);
      const dateParam = new Date().toISOString().substring(0, 7);
      await recalculateAttendanceSummaries(dateParam);
      res.json({ success: true });
  } catch(e) { serverError(res, e); }
};

export const deleteHoliday = async (req, res) => {
  await pool.query('DELETE FROM holidays WHERE date = $1', [req.params.date]);
  const dateParam = new Date().toISOString().substring(0, 7);
  await recalculateAttendanceSummaries(dateParam);
  res.json({ success: true });
};

export const getAuditLogs = async (req, res) => {
  const logs = (await pool.query('SELECT id, timestamp, actor, role, module, change_description as "changeDescription", before_value as "beforeValue", after_value as "afterValue" FROM audit_logs ORDER BY timestamp DESC')).rows;
  res.json(logs);
};

export const getGuardrails = async (req, res) => {
  const guardrails = (await pool.query('SELECT category, monthly_cap as "monthlyCap", proof_required as "proofRequired", status FROM guardrails')).rows;
  for (const g of guardrails) {
      g.proofRequired = g.proofRequired === true || g.proofRequired === 1;
  }
  res.json(guardrails);
};
