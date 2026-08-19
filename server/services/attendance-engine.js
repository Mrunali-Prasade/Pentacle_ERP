// Attendance calculation engine — the single source of truth for late/early marks, monthly
// summary recalculation, and earned-leave accrual. Moved here verbatim from the original monolithic controller
// (no logic change) so the calculation logic lives apart from the HTTP handlers. Depends only
// on the database pool.
import { pool } from '../config/app.config.js';


// --- HELPER FUNCTION: Recalculate Attendance Summaries ---
// --- ATTENDANCE POLICY ---------------------------------------------------------
// Single source of truth for late/early marks. Both the payroll recalculation and the
// HR monthly view call evaluateAttendanceDay so the two screens can never disagree.
//
// Rules (confirmed with the business):
//   * Late  : first IN is later than arrival_time_end (default 09:30). A late arrival is
//             NOT forgiven by working a full shift — punctuality is judged separately.
//   * Early : a completed day (has IN and OUT) where worked hours < required_shift_hours.
//             So 08:30 -> 17:30 is exactly 9h and earns no mark.
//   * A day with an IN but no OUT is "Incomplete": it earns NO mark, because we cannot
//             prove hours either way. HR regularises it instead.
export async function getAttendancePolicy() {
  const row = (await pool.query(
    `SELECT arrival_time_end, leaving_time_start, required_shift_hours, free_marks_allowance
     FROM global_policy WHERE id = 1`
  )).rows[0];
  return {
    arrivalTimeEnd: row?.arrival_time_end || '09:30',
    leavingTimeStart: row?.leaving_time_start || '18:00',
    requiredShiftHours: Number(row?.required_shift_hours ?? 9),
    freeMarksAllowance: Number(row?.free_marks_allowance ?? 3),
  };
}

// Punches store coordinates immediately and the readable address is resolved later by the
// scheduled backfill, so every view must fall back to coordinates rather than showing
// nothing while that is pending.
export function formatPunchLocation(address, latitude, longitude) {
  if (address) return address;
  if (latitude != null && longitude != null) {
    return `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
  }
  return '-';
}

// finalIn / finalOut are Date objects (or null). Returns the marks earned for that day.
export function evaluateAttendanceDay(finalIn, finalOut, policy) {
  const [limitH, limitM] = policy.arrivalTimeEnd.split(':').map(Number);

  let workedHours = null;
  if (finalIn && finalOut) {
    const diffMs = finalOut.getTime() - finalIn.getTime();
    if (diffMs > 0) workedHours = diffMs / 3_600_000;
  }

  const isLate = !!finalIn && (
    finalIn.getHours() > limitH ||
    (finalIn.getHours() === limitH && finalIn.getMinutes() > limitM)
  );

  // Only a day with both punches can be judged short. Missing OUT => Incomplete, no mark.
  const isEarly = workedHours !== null && workedHours < policy.requiredShiftHours;

  let penaltyType = 'None';
  if (isLate && isEarly) penaltyType = 'Late & Early';
  else if (isLate) penaltyType = 'Late';
  else if (isEarly) penaltyType = 'Early';

  return { isLate, isEarly, penaltyType, workedHours, marks: (isLate ? 1 : 0) + (isEarly ? 1 : 0) };
}

// Serialise runs per month. Overlapping runs would race on the DELETE + re-INSERT below,
// so concurrent callers queue behind the in-flight run instead of being dropped.
const recalculationQueue = new Map();

// Pass employeeId to rebuild a single person's summary. A punch only changes that one
// employee, and rebuilding all ~90 costs hundreds of round trips to a remote database.
export function recalculateAttendanceSummaries(targetMonth, employeeId = null) {
  const key = employeeId ? `${targetMonth}:${employeeId}` : targetMonth;
  const previous = recalculationQueue.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => runRecalculation(targetMonth, employeeId));

  recalculationQueue.set(key, next);
  next.catch(() => {}).finally(() => {
    if (recalculationQueue.get(key) === next) {
      recalculationQueue.delete(key);
    }
  });

  return next;
}

async function runRecalculation(targetMonth, employeeId = null) {
  {
      const users = employeeId
        ? [{ employee_id: employeeId }]
        : (await pool.query("SELECT id as employee_id FROM users WHERE role != 'super_admin'")).rows;

      if (employeeId) {
          await pool.query('DELETE FROM attendance_summaries WHERE month = $1 AND employee_id = $2', [targetMonth, employeeId]);
      } else {
          await pool.query('DELETE FROM attendance_summaries WHERE month = $1', [targetMonth]);
      }

  const policy = await getAttendancePolicy();

  const holidaysRes = await pool.query('SELECT date FROM holidays');
  const holidays = holidaysRes.rows.map(h => h.date);

  for (const u of users) {
      const recordsRes = await pool.query("SELECT date, in_time, out_time, awol FROM attendance_records WHERE employee_id = $1 AND date LIKE $2", [u.employee_id, targetMonth + '%']);
      const records = recordsRes.rows;
      const punchesRes = await pool.query("SELECT timestamp, punch_type, work_mode FROM attendance_punches WHERE user_id = $1 AND timestamp LIKE $2", [u.employee_id, targetMonth + '%']);
      const punches = punchesRes.rows;
      const leavesRes = await pool.query("SELECT from_date, to_date, status FROM leave_requests WHERE employee_id = $1 AND status = 'Approved'", [u.employee_id]);
      const leaves = leavesRes.rows;
      
      let lateMarks = 0;
      let earlyMarks = 0;
      let awolDays = 0;
      let halfDays = 0;
      let approvedDeductionsAmount = 0;
      // Running total of late/early marks this month. The first `freeMarksAllowance`
      // are auto-waived ('Free'); everything beyond goes to the CFO/admin as 'Pending'.
      let marksSoFar = 0;
      // Collected during the day loop and written in one statement afterwards. Writing
      // per-day cost one network round trip per working day, per employee.
      const dailyLogRows = [];

      const dailyLogs = {};
      for (const r of records) {
          dailyLogs[r.date] = { hasRecord: true, inTime: r.in_time, outTime: r.out_time, awol: r.awol, punches: [] };
      }
      for (const p of punches) {
          const dateStr = p.timestamp.substring(0, 10);
          if (!dailyLogs[dateStr]) dailyLogs[dateStr] = { hasRecord: false, punches: [] };
          dailyLogs[dateStr].punches.push(p);
      }

      const todayStr = new Date().toISOString().substring(0, 10);
      const [year, month] = targetMonth.split('-');
      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      
      for (let d = 1; d <= daysInMonth; d++) {
          const dStr = d.toString().padStart(2, '0');
          const dateStr = `${targetMonth}-${dStr}`;
          
          if (dateStr > todayStr) continue;
          if (dateStr < '2026-08-01') continue; 
          const dateObj = new Date(dateStr);
          if (dateObj.getDay() === 0 || dateObj.getDay() === 6) continue;
          if (holidays.includes(dateStr)) continue;

          let isOnLeave = false;
          for (const l of leaves) {
              if (dateStr >= l.from_date && dateStr <= l.to_date) {
                  isOnLeave = true;
                  break;
              }
          }
          if (isOnLeave) continue;

          const log = dailyLogs[dateStr] || { hasRecord: false, punches: [] };
          
          let finalIn = null;
          let finalOut = null;
          
          for (const p of log.punches) {
              const pt = new Date(p.timestamp);
              if (p.punch_type === 'IN') {
                  if (!finalIn || pt < finalIn) {
                      finalIn = pt;
                  }
              } else if (p.punch_type === 'OUT') {
                  if (!finalOut || pt > finalOut) {
                      finalOut = pt;
                  }
              }
          }

          if (log.hasRecord) {
              if (log.inTime) {
                  const [h, m] = log.inTime.split(':').map(Number);
                  const pt = new Date(dateStr);
                  pt.setHours(h, m, 0, 0);
                  if (!finalIn || pt < finalIn) finalIn = pt;
              }
              if (log.outTime) {
                  const [h, m] = log.outTime.split(':').map(Number);
                  const pt = new Date(dateStr);
                  pt.setHours(h, m, 0, 0);
                  if (!finalOut || pt > finalOut) finalOut = pt;
              }
          }

          // An OUT recorded before the day's first IN closes the *previous* day's session
          // (employee forgot to punch out overnight). It must not be treated as today's
          // punch-out — the day stays Incomplete instead.
          if (finalIn && finalOut && finalOut <= finalIn) finalOut = null;

          let isAwol = false;
          if (log.hasRecord && log.awol === 1) {
              isAwol = true;
          }

          if (isAwol) {
              awolDays++;
              approvedDeductionsAmount += 1.0;
          } else if (finalIn || finalOut) {
              const { isLate, isEarly, penaltyType, marks } = evaluateAttendanceDay(finalIn, finalOut, policy);

              if (isLate) lateMarks++;
              if (isEarly) earlyMarks++;

              // Marks 1..freeMarksAllowance are auto-waived; the rest need a decision.
              marksSoFar += marks;
              const autoStatus = marks === 0
                  ? 'None'
                  : (marksSoFar <= policy.freeMarksAllowance ? 'Free' : 'Pending');

              const logId = `${u.employee_id}_${dateStr}`;
              // attendance_records rows now only originate from an HR regularisation.
              const inSource = log.hasRecord && log.inTime ? 'Regularised' : (finalIn ? 'App' : null);
              const outSource = log.hasRecord && log.outTime ? 'Regularised' : (finalOut ? 'App' : null);
              const fmt = (dt) => dt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : null;

              dailyLogRows.push([
                logId, u.employee_id, dateStr, fmt(finalIn), inSource,
                fmt(finalOut), outSource, penaltyType, autoStatus
              ]);
          }
      }

      if (dailyLogRows.length > 0) {
          // One statement for the whole month. Recalculation runs on every punch, so it
          // must never clobber a decision a human already made — 'Deduct'/'Waived' are
          // preserved exactly as they are.
          const cols = 9;
          const valuesSql = dailyLogRows
            .map((_, i) => `(${Array.from({ length: cols }, (_, c) => `$${i * cols + c + 1}`).join(', ')})`)
            .join(', ');

          const saved = (await pool.query(
            `INSERT INTO attendance_daily_logs
               (id, employee_id, date, in_time, in_source, out_time, out_source, penalty_type, penalty_status)
             VALUES ${valuesSql}
             ON CONFLICT (id) DO UPDATE SET
               in_time = EXCLUDED.in_time,
               in_source = EXCLUDED.in_source,
               out_time = EXCLUDED.out_time,
               out_source = EXCLUDED.out_source,
               penalty_type = EXCLUDED.penalty_type,
               penalty_status = CASE
                 WHEN attendance_daily_logs.penalty_status IN ('Deduct', 'Waived')
                   THEN attendance_daily_logs.penalty_status
                 ELSE EXCLUDED.penalty_status
               END
             RETURNING penalty_status`,
            dailyLogRows.flat()
          )).rows;

          // An approved penalty costs half a day, per penalised day (not per mark).
          const deductedDays = saved.filter(r => r.penalty_status === 'Deduct').length;
          approvedDeductionsAmount += deductedDays * 0.5;
          halfDays += deductedDays;
      }


      const summaryId = 'sum-' + Math.floor(Math.random() * 1000000);
      await pool.query(
        `INSERT INTO attendance_summaries (id, employee_id, month, marks_used, late_marks, early_marks, half_day_deductions, awol_days, deduction_amount) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, 
        [summaryId, u.employee_id, targetMonth, (lateMarks + earlyMarks), lateMarks, earlyMarks, halfDays, awolDays, approvedDeductionsAmount]
      );
  }
  }
}

// --- LEAVE ACCRUAL HELPER ---
export async function getLeaveCycleStart() {
  const policy = (await pool.query('SELECT leave_cycle_start_month FROM global_policy WHERE id = 1')).rows[0];
  const startMonth = policy ? policy.leave_cycle_start_month : 'January';
  const monthMap = { 'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5, 'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11 };
  const monthIndex = monthMap[startMonth] || 0;
  const now = new Date();
  let year = now.getFullYear();
  if (now.getMonth() < monthIndex) {
      year--;
  }
  return new Date(year, monthIndex, 1);
}

export function calculateEarnedLeaveAccrued(joinDateStr, cycleStart) {
  const joinDate = joinDateStr ? new Date(joinDateStr) : new Date('2024-01-01');
  const startCalcDate = joinDate > cycleStart ? joinDate : cycleStart;
  
  const now = new Date();
  let months = (now.getFullYear() - startCalcDate.getFullYear()) * 12;
  months -= startCalcDate.getMonth();
  months += now.getMonth();
  
  if (months < 0) months = 0;
  
  let accrued = (months + 1) * 1.5;
  if (accrued > 18) accrued = 18;
  return accrued;
}
