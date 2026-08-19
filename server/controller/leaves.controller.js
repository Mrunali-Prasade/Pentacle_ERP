// Leave controllers: apply for leave, view own leaves & balance, team overlap, and the
// HR/manager approve-reject flow. Moved verbatim from the original monolithic controller; no logic change.
import { pool } from '../config/app.config.js';
import { calculateEarnedLeaveAccrued, getLeaveCycleStart, recalculateAttendanceSummaries } from '../services/attendance-engine.js';
import { serverError } from './_shared.js';

export const createLeaveRequest = async (req, res) => {
  const user = req.user;
  let { type, fromDate, toDate, days: reqDays, reason, certificateUrl } = req.body;
  
  if (!type || !fromDate || !toDate || !reqDays) {
      return res.status(400).json({ error: 'Missing required fields' });
  }
  // Validate the dates and bound the range. The day-by-day loop below would otherwise spin
  // hundreds of thousands of times for an absurd range like 1900-01-01 → 2999-12-31, blocking
  // the event loop, and would store a nonsensical leave length.
  const fromD = new Date(fromDate), toD = new Date(toDate);
  if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) {
      return res.status(400).json({ error: 'Invalid leave dates.' });
  }
  if (toD < fromD) {
      return res.status(400).json({ error: 'The end date cannot be before the start date.' });
  }
  if ((toD - fromD) / (1000 * 60 * 60 * 24) > 366) {
      return res.status(400).json({ error: 'A single leave request cannot span more than a year.' });
  }
  // You cannot self-apply for leave that starts in the past — a past day is already recorded in
  // attendance/payroll. (Correcting a past day is HR's job, not a leave request.) Compared in IST,
  // the app's working timezone, so "today" matches the employee's calendar day.
  const istToday = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
  if (fromDate < istToday) {
      return res.status(400).json({ error: 'You cannot apply for leave on a date that has already passed. Ask HR to adjust a past day.' });
  }

  // Serialize concurrent leave submissions for the SAME employee. Without this, two requests
  // fired at once could both read the same remaining balance and both consume it (over-granting
  // paid leave) or both pass the overlap check. A per-employee advisory lock closes that race;
  // the try/finally guarantees it is released on every exit path (including the early 400s).
  const lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock(hashtext($1))', ['leave:' + user.id]);
  try {

  const dbUser = (await pool.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  
  // Check overlapping leaves for the same employee
  const overlap = (await pool.query(`SELECT id FROM leave_requests 
      WHERE employee_id = $1 AND status != 'Rejected' 
      AND from_date <= $2 AND to_date >= $3`, [user.id, toDate, fromDate])).rows[0];
  if (overlap) {
      return res.status(400).json({ error: 'You already have a leave request during this period.' });
  }

  // Calculate actual leave days by ignoring weekends and holidays
  const holidaysList = (await pool.query('SELECT date FROM holidays')).rows.map((h) => h.date);
  let actualDays = 0;
  
  if (reqDays === 0.5) {
      actualDays = 0.5;
  } else {
      let curr = new Date(fromDate);
      const end = new Date(toDate);
      while (curr <= end) {
          const dateStr = curr.toISOString().split('T')[0];
          const isWeekend = curr.getUTCDay() === 0 || curr.getUTCDay() === 6;
          const isHoliday = holidaysList.includes(dateStr);
          if (!isWeekend && !isHoliday) {
              actualDays++;
          }
          curr.setUTCDate(curr.getUTCDate() + 1);
      }
  }
  
  if (actualDays <= 0) {
      return res.status(400).json({ error: 'The selected period only contains weekends or holidays.' });
  }
  
  const days = actualDays;
  let paid_days = 0;
  let unpaid_days = 0;
  
  const cycleStart = await getLeaveCycleStart();
  const cycleStartStr = cycleStart.toISOString().substring(0, 10);
  const existingLeaves = (await pool.query(`SELECT * FROM leave_requests 
      WHERE employee_id = $1 AND status != 'Rejected' AND from_date >= $2`, [user.id, cycleStartStr])).rows;
      
  if (type === 'Earned Leave' || type === 'Paid Leave') {
      const accrued = calculateEarnedLeaveAccrued(dbUser.join_date, cycleStart);
      let usedEl = 0;
      existingLeaves.forEach(r => {
          if (r.type === 'Earned Leave' || r.type === 'Paid Leave') usedEl += r.paid_days;
      });
      const available = Math.max(0, accrued - usedEl);
      
      paid_days = Math.min(days, available);
      unpaid_days = days - paid_days;
  } else if (type === 'Casual Leave' || type === 'Sick Leave' || type === 'Casual/Sick Leave') {
      if (type === 'Sick Leave' && days >= 3 && !certificateUrl) {
          return res.status(400).json({ error: 'Medical certificate is required for Sick Leave of 3 or more days.' });
      }
      
      const isProbation = dbUser.status === 'probation';
      if (isProbation) {
          const reqMonth = fromDate.substring(0, 7);
          let usedThisMonth = 0;
          existingLeaves.forEach(r => {
              if ((r.type === 'Casual Leave' || r.type === 'Sick Leave' || r.type === 'Casual/Sick Leave') && r.from_date.startsWith(reqMonth)) {
                  usedThisMonth += r.paid_days;
              }
          });
          const available = Math.max(0, 1 - usedThisMonth);
          paid_days = Math.min(days, available);
          unpaid_days = days - paid_days;
      } else {
          let usedCL = 0;
          existingLeaves.forEach(r => {
              if (r.type === 'Casual Leave' || r.type === 'Sick Leave' || r.type === 'Casual/Sick Leave') usedCL += r.paid_days;
          });
          const available = Math.max(0, 8 - usedCL);
          paid_days = Math.min(days, available);
          unpaid_days = days - paid_days;
      }
  } else if (type === 'Paternity Leave') {
      let used = 0;
      existingLeaves.forEach(r => { if (r.type === 'Paternity Leave') used += r.paid_days; });
      paid_days = Math.min(days, Math.max(0, 5 - used));
      unpaid_days = days - paid_days;
  } else if (type === 'Maternity Leave') {
      let used = 0;
      existingLeaves.forEach(r => { if (r.type === 'Maternity Leave') used += r.paid_days; });
      const maxDays = 26 * 5; 
      paid_days = Math.min(days, Math.max(0, maxDays - used));
      unpaid_days = days - paid_days;
  } else {
      paid_days = 0;
      unpaid_days = days;
  }
  
  const id = 'leave-' + Math.random().toString(36).substring(2, 9);
  const submissionDate = new Date().toISOString().split('T')[0];

  try {
    await pool.query(`INSERT INTO leave_requests (id, employee_id, type, from_date, to_date, days, paid_days, unpaid_days, status, certificate_url, reason) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
        id, user.id, type, fromDate, toDate, days, paid_days, unpaid_days, 'Pending', certificateUrl || null, reason || ''
    ]);
    
    // Only the requester's own summary can change.
    await recalculateAttendanceSummaries(new Date().toISOString().substring(0, 7), user.id);
    res.json({ success: true, message: 'Leave request submitted' });
  } catch (err) {
    console.error("Leave submission error:", err.message);
    // If column doesn't exist, we fallback to without reason
    if (err.message && err.message.includes("column \"reason\" of relation \"leave_requests\" does not exist")) {
      try {
        await pool.query(`INSERT INTO leave_requests (id, employee_id, type, from_date, to_date, days, paid_days, unpaid_days, status, certificate_url) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
            id, user.id, type, fromDate, toDate, days, paid_days, unpaid_days, 'Pending', certificateUrl || null
        ]);
        await recalculateAttendanceSummaries(new Date().toISOString().substring(0, 7), user.id);
        return res.json({ success: true, message: 'Leave request submitted' });
      } catch (fallbackErr) {
        return res.status(500).json({ error: fallbackErr.message || "Failed to submit leave" });
      }
    }
    serverError(res, err, "Failed to submit leave. Please try again.");
  }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', ['leave:' + user.id]).catch(() => {});
    lockClient.release();
  }
};

export const getMyLeaves = async (req, res) => {
  const user = req.user;
  const dbUser = (await pool.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  const requests = (await pool.query('SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY from_date DESC', [user.id])).rows;
  
  const cycleStart = await getLeaveCycleStart();
  const cycleStartStr = cycleStart.toISOString().substring(0, 10);
  const cycleLeaves = requests.filter(r => r.from_date >= cycleStartStr && r.status !== 'Rejected');
  
  let usedEl = 0;
  let usedCl = 0;
  
  cycleLeaves.forEach((r) => {
      if (r.type === 'Earned Leave' || r.type === 'Paid Leave') usedEl += r.paid_days;
      if (r.type === 'Casual Leave' || r.type === 'Sick Leave' || r.type === 'Casual/Sick Leave') usedCl += r.paid_days;
  });
  
  const accruedEl = calculateEarnedLeaveAccrued(dbUser.join_date, cycleStart);
  const balanceEl = Math.max(0, accruedEl - usedEl);
  
  const casualLimit = dbUser.status === 'probation' ? 6 : 8;

  res.json({ 
      requests, 
      earned: { accrued: accruedEl, used: usedEl, balance: balanceEl },
      casual: { limit: casualLimit, used: usedCl, balance: Math.max(0, casualLimit - usedCl), isProbation: dbUser.status === 'probation' }
  });
};

export const getTeamOverlap = async (req, res) => {
  const { from, to } = req.query;
  const overlap = (await pool.query(
      `SELECT l.from_date as "fromDate", l.to_date as "toDate", u.name as "employeeName", u.department 
       FROM leave_requests l 
       JOIN users u ON l.employee_id = u.id 
       WHERE l.status = 'Approved' AND NOT (l.to_date < $1 OR l.from_date > $2)`,
      [from, to]
  )).rows;
  res.json(overlap);
};

export const getAllLeaveRequests = async (req, res) => {
  const list = (await pool.query(
      `SELECT l.id, l.type, l.from_date as "fromDate", l.to_date as "toDate", l.days,
              l.paid_days as "paidDays", l.unpaid_days as "unpaidDays",
              l.reason, l.status, l.submission_date as "submissionDate", l.certificate_url as "certificateUrl",
              u.name as "employeeName", u.employee_id as "employeeCode", u.department
       FROM leave_requests l
       JOIN users u ON l.employee_id = u.id
       ORDER BY l.submission_date DESC NULLS LAST, l.from_date DESC`
  )).rows;
  res.json(list);
};

export const updateLeaveRequestStatus = async (req, res) => {
  const leaveId = req.params.id;
  const { status, paidDays, unpaidDays } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const leave = (await pool.query('SELECT days, employee_id FROM leave_requests WHERE id = $1', [leaveId])).rows[0];
  if (!leave) return res.status(404).json({ error: 'Leave request not found' });

  // Segregation of duties: you cannot approve/reject your OWN leave request, whatever your
  // role or permission — another approver must action it (same rule as reimbursements/penalties).
  if (leave.employee_id === req.user.id) {
    return res.status(403).json({ error: 'You cannot approve or reject your own leave request. Another approver must action it.' });
  }

  // The approver can re-split the request into paid days and LOP before approving.
  const paid = Number(paidDays);
  const unpaid = Number(unpaidDays);
  const hasSplit = Number.isFinite(paid) && Number.isFinite(unpaid) && paid >= 0 && unpaid >= 0;

  if (hasSplit) {
      const finalPaid = Math.min(paid, leave.days);
      await pool.query(
        "UPDATE leave_requests SET status = $1, paid_days = $2, unpaid_days = $3 WHERE id = $4",
        [status, finalPaid, leave.days - finalPaid, leaveId]
      );
  } else {
      await pool.query("UPDATE leave_requests SET status = $1 WHERE id = $2", [status, leaveId]);
  }

  // Approving or rejecting leave only changes that one employee's summary.
  await recalculateAttendanceSummaries(new Date().toISOString().substring(0, 7), leave.employee_id);
  res.json({ success: true });
};
