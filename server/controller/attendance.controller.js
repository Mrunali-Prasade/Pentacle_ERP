// Attendance controllers: punch in/out (with selfie), punch history/exports, penalties,
// detailed & monthly attendance, HR timing edits, live dashboard, regularisations, and the
// scheduled missing-punch-out reminder. Includes attendance-only helpers (penalty-status
// enum, IST day window, reminder email). Moved verbatim from the original monolithic controller; no logic change.
import { pool, config } from '../config/app.config.js';
import { getAttendancePolicy, evaluateAttendanceDay, formatPunchLocation, recalculateAttendanceSummaries } from '../services/attendance-engine.js';
import { serverError, csvCell, decodeUpload, escapeHtml, MAX_SELFIE_BYTES } from './_shared.js';
import { hasPermission } from '../utils/helper.js';
import { rankOf } from '../const/appcounst.js';
import { storage } from '../services/storage.js';
import { HttpResponse } from '../utils/httpresponse.js';
import crypto from 'crypto';

// Safely extract HH:MM from a stored TEXT timestamp. Stored timestamps are usually ISO
// ('YYYY-MM-DDTHH:MM:...'), but a date-only or space-separated value would make the old
// `.split('T')[1].substring(0,5)` throw and 500 an entire month's export. Falls back to '-'.
const hhmmFromTs = (ts) => {
  if (!ts || typeof ts !== 'string') return '-';
  const t = ts.split('T')[1];
  return t ? t.substring(0, 5) : '-';
};

// A YYYY-MM month string must be well-formed before it drives date math; a malformed value used
// to silently produce empty/garbage reports (parseInt -> NaN). Returns true when the value is bad.
const isBadMonth = (m) => !/^\d{4}-\d{2}$/.test(String(m));
const isBadDate = (d) => !/^\d{4}-\d{2}-\d{2}$/.test(String(d));

export const punch = async (req, res) => {
  const user = req.user;
  const { punchType, latitude, longitude, address, workMode, officeLocation, selfieBase64 } = req.body;
  // Validate inputs up front: latitude/longitude are NOT NULL columns, and punchType feeds the
  // attendance/penalty engine — junk values used to either 500 on the insert or silently corrupt
  // the day's evaluation. Fail with a clear message instead.
  if (punchType !== 'IN' && punchType !== 'OUT') {
      return res.status(400).json({ error: 'punchType must be "IN" or "OUT".' });
  }
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'A valid location is required to punch in/out.' });
  }
  if (address != null && String(address).length > 500) {
      return res.status(400).json({ error: 'Location address is too long.' });
  }
  if (!selfieBase64) {
      return res.status(400).json({ error: 'A selfie is compulsory to punch in/out.' });
  }
  // Validate the selfie is a real image within a sane size BEFORE storing it anywhere — this
  // stops a renamed non-image being kept, and caps the inline-in-DB fallback (a 50 MB data URL
  // used to be writable straight into attendance_punches.selfie_url).
  let selfie;
  try { selfie = decodeUpload(selfieBase64, { allowPdf: false, maxBytes: MAX_SELFIE_BYTES }); }
  catch (e) { return res.status(400).json({ error: `Selfie: ${e.message}` }); }

  const timestamp = new Date().toISOString();
  const id = 'punch-' + Math.random().toString(36).substring(2, 9);

  // Selfies are held inline in the database (now size-capped and validated) when there is no
  // durable store; otherwise they are uploaded and only the URL is kept.
  let selfieUrl = selfieBase64;
  if (storage.isDurable) {
      try {
          selfieUrl = await storage.uploadBuffer(selfie.buffer, `selfies/${user.id}/${id}${selfie.ext}`, selfie.contentType);
      } catch (e) {
          // Never fail a punch because storage is unavailable — keep the inline copy.
          console.error('[Punch] selfie upload failed, storing inline:', e.message);
          selfieUrl = selfieBase64;
      }
  }

  // Not reverse-geocoded on the server: Nominatim is a free service with a ~1 request/second
  // policy, and a whole office punching in at 09:00 from one shared server IP would breach
  // it and get the server blocked. The client resolves the address itself (each request
  // comes from a different IP) and sends it along; if that lookup failed client-side, the
  // coordinates are saved and the scheduled backfill fills the address in later.
  await pool.query(
    'INSERT INTO attendance_punches (id, user_id, punch_type, timestamp, latitude, longitude, address, work_mode, office_location, selfie_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [id, user.id, punchType, timestamp, lat, lng, address || null, workMode || null, officeLocation || null, selfieUrl]
  );

  // Recalculate before responding. On serverless (Vercel) the instance is frozen as soon
  // as the response is sent, so work deferred past this point would silently never run.
  try {
    // Only this employee's summary can have changed, so avoid rebuilding everyone.
    await recalculateAttendanceSummaries(timestamp.substring(0, 7), user.id);
  } catch (e) {
    // A failed recalculation must not fail the punch — the punch row is already saved.
    console.error('Recalculation after punch failed:', e.message);
  }

  res.json({ success: true, punch: { id, punchType, timestamp, address: address || null, workMode, officeLocation, selfieUrl } });
};

export const getPunchesStatus = async (req, res) => {
  const user = req.user;
  const punches = (await pool.query('SELECT punch_type, timestamp, address, latitude, longitude, selfie_url FROM attendance_punches WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 100', [user.id])).rows;
  res.json(punches);
};

export const exportPunches = async (req, res) => {
  const user = req.user;
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  if (req.query.month && isBadMonth(req.query.month)) return res.status(400).json({ error: 'Invalid month. Expected YYYY-MM.' }); 
  const employeeFilter = req.query.employee || '';
  const searchFilter = req.query.search || '';
  
  let users = (await pool.query("SELECT id, employee_id, name, department, role FROM users WHERE role != 'super_admin'")).rows;
  if (employeeFilter) {
      users = users.filter(u => u.id === employeeFilter);
  }
  if (searchFilter) {
      users = users.filter(u => u.name.toLowerCase().includes(searchFilter.toLowerCase()));
  }
  if (user.role !== 'admin_hr' && user.role !== 'super_admin') {
      users = users.filter(u => u.id === user.id);
  }
  
  const punches = (await pool.query("SELECT user_id, punch_type, timestamp, address FROM attendance_punches WHERE timestamp LIKE $1 ORDER BY timestamp ASC", [month + '%'])).rows;
  const leaves = (await pool.query("SELECT employee_id, from_date, to_date FROM leave_requests WHERE status = 'Approved'")).rows;
  
  const today = new Date();
  const isCurrentMonth = today.toISOString().substring(0, 7) === month;
  const year = parseInt(month.substring(0, 4));
  const monthIdx = parseInt(month.substring(5, 7)) - 1;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const lastDay = isCurrentMonth ? today.getDate() : daysInMonth;
  const dayNames = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  
  let csv = `Company: Default,,,,,Printed On: ${today.toISOString().split('T')[0]}\n`;
  csv += `Monthly Status Report (Basic Work Duration) for ${month}\n\n`;
  
  users.forEach(u => {
      // Whole labelled cell is quoted so a name/code/department with a comma or leading
      // formula character can neither shift columns nor execute in a spreadsheet.
      csv += `${csvCell('Emp. Code: ' + (u.employee_id || ''))},${csvCell('Emp. Name: ' + (u.name || ''))},${csvCell('Department: ' + (u.department || 'Default'))}\n`;
      let daysRow = 'Days';
      let statusRow = 'Status';
      let inRow = 'InTime';
      let outRow = 'OutTime';
      let totalRow = 'Total';
      
      for (let d = 1; d <= daysInMonth; d++) {
          const dateObj = new Date(year, monthIdx, d);
          const dateStr = `${month}-${d.toString().padStart(2, '0')}`;
          const dayName = dayNames[dateObj.getDay()];
          
          daysRow += `,${d} ${dayName}`;
          
          if (d > lastDay) {
              statusRow += ',-';
              inRow += ',-';
              outRow += ',-';
              totalRow += ',-';
              continue;
          }
          
          const userPunches = punches.filter(p => p.user_id === u.id && p.timestamp.startsWith(dateStr));
          const firstPunch = userPunches.length > 0 ? userPunches[0] : null;
          const lastPunch = userPunches.length > 0 ? userPunches[userPunches.length - 1] : null;
          const outPunch = lastPunch && lastPunch.punch_type === 'OUT' ? lastPunch : null;
          const isOnLeave = leaves.some(l => l.employee_id === u.id && l.from_date <= dateStr && l.to_date >= dateStr);
          
          let status = 'A';
          if (isOnLeave) status = 'L';
          else if (userPunches.length > 0) status = 'P';
          else if (dateObj.getDay() === 0 || dateObj.getDay() === 6) status = 'WO';
          
          const firstTime = hhmmFromTs(firstPunch?.timestamp);
          const lastTime = hhmmFromTs(outPunch?.timestamp);
          
          let total = '00:00';
          if (firstPunch && outPunch) {
              const inD = new Date(firstPunch.timestamp);
              const outD = new Date(outPunch.timestamp);
              const diffMs = outD.getTime() - inD.getTime();
              const diffHrs = Math.floor(diffMs / 3600000);
              const diffMins = Math.floor((diffMs % 3600000) / 60000);
              total = `${diffHrs.toString().padStart(2, '0')}:${diffMins.toString().padStart(2, '0')}`;
          }
          
          statusRow += `,${status}`;
          inRow += `,${firstTime}`;
          outRow += `,${lastTime}`;
          totalRow += `,${total}`;
      }
      csv += `${daysRow}\n${statusRow}\n${inRow}\n${outRow}\n${totalRow}\n\n`;
  });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=Attendance_Report_${month}.csv`);
  res.send(csv);
};

export const exportDailyHistory = async (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  if (req.query.month && isBadMonth(req.query.month)) return res.status(400).json({ error: 'Invalid month. Expected YYYY-MM.' }); 
  const users = (await pool.query("SELECT id, employee_id as emp_id, name, email FROM users WHERE role != 'super_admin' AND status != 'rejected'")).rows;
  const punches = (await pool.query("SELECT user_id, punch_type, timestamp, address FROM attendance_punches WHERE timestamp LIKE $1 ORDER BY timestamp ASC", [month + '%'])).rows;
  
  let csv = 'Date,Employee ID,Name,Email,In Time,In Location,Out Time,Out Location,Work Hours\n';
  const [year, monthStr] = month.split('-');
  const numDays = new Date(parseInt(year), parseInt(monthStr), 0).getDate();
  
  for (let d = 1; d <= numDays; d++) {
      const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
      const dayPunches = punches.filter(p => p.timestamp.startsWith(dateStr));
      
      users.forEach(u => {
          const userDayPunches = dayPunches.filter(p => p.user_id === u.id);
          if (userDayPunches.length === 0) return;
          
          const inPunch = userDayPunches[0];
          const outPunch = userDayPunches.length > 1 ? userDayPunches[userDayPunches.length - 1] : null;
          const inTime = hhmmFromTs(inPunch?.timestamp);
          const inLoc = inPunch && inPunch.address ? inPunch.address : '-';

          let outTime = '-';
          let outLoc = '-';
          let hours = '-';

          if (outPunch && outPunch.punch_type === 'OUT') {
              outTime = hhmmFromTs(outPunch.timestamp);
              outLoc = outPunch.address ? outPunch.address : '-';
              const inD = new Date(inPunch.timestamp);
              const outD = new Date(outPunch.timestamp);
              const diffMs = outD.getTime() - inD.getTime();
              const diffHrs = Math.floor(diffMs / 3600000);
              const diffMins = Math.floor((diffMs % 3600000) / 60000);
              hours = `${diffHrs}h ${diffMins}m`;
          }
          // Every field escaped — emp id / name / email / address are user- or HR-controlled.
          csv += [dateStr, u.emp_id || '-', u.name, u.email, inTime, inLoc, outTime, outLoc, hours].map(csvCell).join(',') + '\n';
      });
  }
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=Daily_History_Report_${month}.csv`);
  res.send(csv);
};

export const getPenalties = async (req, res) => {
  try {
      const penalties = (await pool.query(`
          SELECT p.*, u.name as employee_name, u.employee_id as emp_code, u.role as employee_role
          FROM attendance_daily_logs p
          JOIN users u ON p.employee_id = u.id
          WHERE p.penalty_status IN ('Pending', 'Deduct', 'Waived')
          ORDER BY p.date DESC
      `)).rows;
      res.json(penalties);
  } catch(e) { serverError(res, e); }
};

// Read-only, self-scoped: any logged-in employee can see their own late/early marks and
// whether each was applied (deducted) or waived — but never anyone else's, and no action
// buttons here at all (that stays HR/CFO/Super Admin only, via getPenalties above).
export const getMyPenalties = async (req, res) => {
  try {
      const penalties = (await pool.query(
          `SELECT id, date, in_time, in_source, out_time, out_source, penalty_type, penalty_status
           FROM attendance_daily_logs
           WHERE employee_id = $1 AND penalty_type IS NOT NULL
           ORDER BY date DESC`,
          [req.user.id]
      )).rows;
      res.json(penalties);
  } catch(e) { serverError(res, e); }
};

const VALID_PENALTY_STATUSES = ['Pending', 'Deduct', 'Waived', 'Free', 'None'];

export const updateBulkPenaltyStatus = async (req, res) => {
  try {
      const { ids, status } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
      if (!VALID_PENALTY_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid penalty status.' });
      
      let updated = 0;
      let monthsToRecalculate = new Set();

      const client = await pool.connect();
      try {
          await client.query('BEGIN');
          // Fetch every requested log in ONE query instead of one-per-id inside the loop (an N+1
          // that held the transaction open and got slow on large bulk actions).
          const logs = (await client.query(
              `SELECT p.id, p.date, p.employee_id, p.penalty_action_by_role, u.role as employee_role
               FROM attendance_daily_logs p JOIN users u ON u.id = p.employee_id WHERE p.id = ANY($1)`,
              [ids]
          )).rows;

          // One query for the lock status of every month involved.
          const months = [...new Set(logs.filter(l => l.date).map(l => l.date.substring(0, 7)))];
          const lockedMonths = new Set(
              months.length
                  ? (await client.query('SELECT month FROM payroll_runs WHERE status = $1 AND month = ANY($2)', ['locked', months])).rows.map(r => r.month)
                  : []
          );

          // Same per-log skip rules as before, applied in memory.
          const passIds = [];
          for (const log of logs) {
              if (!log.date) continue;
              if (log.penalty_action_by_role === 'cfo' && req.user.role !== 'cfo') continue;
              // Cannot action your own penalty (identity check — covers every role/permission).
              if (log.employee_id === req.user.id) continue;
              // No HR admin can approve/waive another HR admin's attendance penalty.
              if (log.employee_role === 'admin_hr' && req.user.role === 'admin_hr') continue;
              const month = log.date.substring(0, 7);
              if (lockedMonths.has(month)) continue;
              passIds.push(log.id);
              monthsToRecalculate.add(`${month}|${log.employee_id}`);
          }

          if (passIds.length) {
              // One bulk UPDATE. When the actor is the CFO every row's action-role becomes 'cfo';
              // otherwise each row keeps its existing action-role (the old code set it to its own
              // current value — a no-op), so we simply leave that column untouched.
              if (req.user.role === 'cfo') {
                  await client.query('UPDATE attendance_daily_logs SET penalty_status = $1, penalty_action_by_role = $2 WHERE id = ANY($3)', [status, 'cfo', passIds]);
              } else {
                  await client.query('UPDATE attendance_daily_logs SET penalty_status = $1 WHERE id = ANY($2)', [status, passIds]);
              }
              updated = passIds.length;
          }
          await client.query('COMMIT');
      } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
      } finally {
          client.release();
      }
      for (const key of monthsToRecalculate) {
          const [month, empId] = key.split('|');
          await recalculateAttendanceSummaries(month, empId);
      }
      res.json({ success: true, updated });
  } catch(e) { serverError(res, e); }
};

export const updatePenaltyStatus = async (req, res) => {
  try {
      const { id } = req.params;
      const { status } = req.body;
      if (!VALID_PENALTY_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid penalty status.' });
      const log = (await pool.query(
          `SELECT p.date, p.employee_id, p.penalty_action_by_role, u.role as employee_role
           FROM attendance_daily_logs p JOIN users u ON u.id = p.employee_id WHERE p.id = $1`,
          [id]
      )).rows[0];
      if (log && log.date) {
          if (log.penalty_action_by_role === 'cfo' && req.user.role !== 'cfo') {
              return res.status(403).json({ error: 'This penalty was finalized by the CFO and cannot be modified.' });
          }
          // Nobody may waive or apply a penalty on their OWN attendance record, whatever their
          // role or granted permission — this is the identity check that the old role-string
          // guard missed (a CFO, or any employee granted penalties.approve, could self-waive).
          if (log.employee_id === req.user.id) {
              return res.status(403).json({ error: 'You cannot waive or apply a penalty on your own attendance record. Another approver must action it.' });
          }
          // HR admins additionally cannot action each OTHER's penalties — escalate to the CFO's
          // Penalty Approvals panel, or Super Admin (always exempt).
          if (log.employee_role === 'admin_hr' && req.user.role === 'admin_hr') {
              return res.status(403).json({ error: 'HR admins cannot waive or apply penalties on another HR admin\'s attendance record. Ask the CFO or Super Admin to action it instead.' });
          }
          const month = log.date.substring(0, 7);
          const run = (await pool.query('SELECT status FROM payroll_runs WHERE month = $1', [month])).rows[0];
          if (run && run.status === 'locked') {
              return res.status(400).json({ error: `Cannot modify penalty. Payroll for ${month} is already locked.` });
          }
      }
      
      const actionByRole = req.user.role === 'cfo' ? 'cfo' : (log ? log.penalty_action_by_role : null);
      await pool.query('UPDATE attendance_daily_logs SET penalty_status = $1, penalty_action_by_role = $2 WHERE id = $3', [status, actionByRole, id]);
      if (log && log.date) {
          await recalculateAttendanceSummaries(log.date.substring(0, 7), log.employee_id);
      }
      res.json({ success: true });
  } catch(e) { serverError(res, e); }
};

export const getDetailedAttendance = async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().split('T')[0];
  if (req.query.date && isBadDate(req.query.date)) return res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' });
  const users = (await pool.query("SELECT id, name, employee_id FROM users WHERE role != 'super_admin' AND status != 'rejected'")).rows;
  const punches = (await pool.query("SELECT user_id, punch_type, timestamp, address, latitude, longitude, work_mode, selfie_url FROM attendance_punches WHERE timestamp LIKE $1 ORDER BY timestamp ASC", [dateStr + '%'])).rows;
  const records = (await pool.query("SELECT employee_id, in_time, out_time FROM attendance_records WHERE date = $1", [dateStr])).rows;
  
  const results = users.map(u => {
      let events = [];
      const userPunches = punches.filter(p => p.user_id === u.id);
      for (const p of userPunches) {
          events.push({
              time: new Date(p.timestamp),
              action: p.punch_type,
              source: 'APP',
              location: formatPunchLocation(p.address, p.latitude, p.longitude),
              mode: p.work_mode || 'Remote',
              selfie: p.selfie_url || ''
          });
      }
      
      const userRecords = records.filter(r => r.employee_id === u.id || r.employee_id === u.employee_id);
      for (const r of userRecords) {
            if (r.in_time) {
                events.push({
                    time: new Date(`${dateStr}T${r.in_time}:00`),
                    action: 'IN',
                    source: 'REGULARISED',
                    location: 'Office',
                    mode: 'Office',
                    selfie: ''
                });
            }
            if (r.out_time) {
                events.push({
                    time: new Date(`${dateStr}T${r.out_time}:00`),
                    action: 'OUT',
                    source: 'REGULARISED',
                    location: 'Office',
                    mode: 'Office',
                    selfie: ''
                });
            }
      }
      events.sort((a, b) => a.time.getTime() - b.time.getTime());
      
      const firstEvent = events.length > 0 ? events[0] : null;
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;
      const outEvent = lastEvent && lastEvent.action === 'OUT' ? lastEvent : null;
      
      let status = 'Incomplete';
      if (!firstEvent) status = 'Absent';
      else if (firstEvent && outEvent) status = 'Complete';

      let hours = '-';
      if (firstEvent && outEvent) {
          const inD = firstEvent.time;
          const outD = outEvent.time;
          const diffMs = outD.getTime() - inD.getTime();
          const diffHrs = Math.floor(diffMs / 3600000);
          const diffMins = Math.floor((diffMs % 3600000) / 60000);
          hours = `${diffHrs}h ${diffMins}m`;
      }
      
      return {
          userId: u.id,
          name: u.name,
          checkInTime: firstEvent ? firstEvent.time.toISOString() : null,
          checkOutTime: outEvent ? outEvent.time.toISOString() : null,
          checkInLocation: firstEvent ? firstEvent.location : '-',
          checkOutLocation: outEvent ? outEvent.location : '-',
          checkInMode: firstEvent ? firstEvent.mode : '-',
          checkOutMode: outEvent ? outEvent.mode : '-',
          checkInSelfie: firstEvent ? firstEvent.selfie : '',
          checkOutSelfie: outEvent ? outEvent.selfie : '',
          hours: hours,
          date: dateStr,
          status: status,
          timeline: events.map(e => ({
              time: e.time.toISOString(),
              action: e.action,
              source: e.source,
              location: e.location,
              mode: e.mode,
              selfie: e.selfie
          }))
      };
  });
  res.json(results);
};

export const getMonthlyEmployeeAttendance = async (req, res) => {
  const employeeId = req.params.id;
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  if (req.query.month && isBadMonth(req.query.month)) return res.status(400).json({ error: 'Invalid month. Expected YYYY-MM.' });
  
  const year = parseInt(month.substring(0, 4));
  const monthIdx = parseInt(month.substring(5, 7)) - 1;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  
  const punches = (await pool.query("SELECT punch_type, timestamp, address, latitude, longitude, work_mode, selfie_url FROM attendance_punches WHERE user_id = $1 AND timestamp LIKE $2 ORDER BY timestamp ASC", [employeeId, month + '%'])).rows;
  const dailyLogs = (await pool.query("SELECT date, in_time, in_source, out_time, out_source FROM attendance_daily_logs WHERE employee_id = $1 AND date LIKE $2", [employeeId, month + '%'])).rows;
  // Who approved a correction on each day — surfaced so reviewers can see who changed the timing.
  const approvedRegs = (await pool.query("SELECT date, in_time, out_time, approved_by FROM attendance_regularisations WHERE employee_id = $1 AND date LIKE $2 AND status = 'Approved'", [employeeId, month + '%'])).rows;
  const policy = await getAttendancePolicy();

  const results = [];
  const formatLocalTime = (isoString) => {
      if (!isoString) return null;
      const d = new Date(isoString);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      const dayPunches = punches.filter(p => p.timestamp.startsWith(dateStr));
      const log = dailyLogs.find(l => l.date === dateStr);
      
      let inStr = log?.in_time || null;
      let outStr = log?.out_time || null;
      let inLocation = '-';
      let outLocation = '-';
      let inMode = log?.in_source || '-';
      let outMode = log?.out_source || '-';
      let inSelfie = null;
      let outSelfie = null;

      // Only a real IN punch can be the check-in — never fall back to an OUT punch.
      const firstIn = dayPunches.find(p => p.punch_type === 'IN') || null;
      if (firstIn) {
          if (!inStr) inStr = formatLocalTime(firstIn.timestamp);
          inLocation = formatPunchLocation(firstIn.address, firstIn.latitude, firstIn.longitude);
          inMode = firstIn.work_mode || '-';
          inSelfie = firstIn.selfie_url || null;
      }

      // Only an OUT recorded *after* the check-in closes the day. An OUT that precedes it
      // belongs to the previous day's session (employee forgot to punch out overnight),
      // and must not be paired with today's check-in.
      const outPunches = dayPunches.filter(p =>
          p.punch_type === 'OUT' && (!firstIn || p.timestamp > firstIn.timestamp)
      );
      const lastOut = outPunches.length > 0 ? outPunches[outPunches.length - 1] : null;
      if (lastOut) {
          if (!outStr) outStr = formatLocalTime(lastOut.timestamp);
          outLocation = formatPunchLocation(lastOut.address, lastOut.latitude, lastOut.longitude);
          outMode = lastOut.work_mode || '-';
          outSelfie = lastOut.selfie_url || null;
      }
      
      let status = 'Incomplete';
      if (!inStr) status = 'Absent';
      else if (inStr && outStr) status = 'Complete';
      
      let hours = '-';
      let numericHours = 0;
      if (inStr && outStr) {
          const [inH, inM] = inStr.split(':').map(Number);
          const [outH, outM] = outStr.split(':').map(Number);
          const diffMin = (outH * 60 + outM) - (inH * 60 + inM);
          if (diffMin > 0) {
              numericHours = diffMin / 60;
              hours = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
          }
      }

      // Use the shared policy evaluation so this screen always agrees with payroll.
      const toDate = (hhmm) => {
          if (!hhmm) return null;
          const [h, m] = hhmm.split(':').map(Number);
          const dt = new Date(dateStr);
          dt.setHours(h, m, 0, 0);
          return dt;
      };
      let { isLate, isEarly } = evaluateAttendanceDay(toDate(inStr), toDate(outStr), policy);

      const dateObj = new Date(dateStr);
      if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
          isLate = false;
          isEarly = false;
      }

      const dayReg = approvedRegs.find(r => r.date === dateStr);
      results.push({
          date: dateStr,
          // Fall back to the approved correction's own times for DISPLAY, so a reviewer always
          // sees what was regularised — even when the day stays "Incomplete" (e.g. an out time
          // earlier than the in time). The status/hours above still use the validated values.
          checkInTime: inStr || dayReg?.in_time || null,
          checkOutTime: outStr || dayReg?.out_time || null,
          checkInLocation: inLocation,
          checkOutLocation: outLocation,
          checkInMode: inMode,
          checkOutMode: outMode,
          checkInSelfie: inSelfie,
          checkOutSelfie: outSelfie,
          hours,
          status,
          isLate,
          isEarly,
          regularisedBy: dayReg?.approved_by || null
      });
  }
  res.json(results);
};

export const updateEmployeeTiming = async (req, res) => {
  const employeeId = req.params.id;
  const { date, inTime, outTime } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  // Editing punch times re-derives (and can erase) that day's late/early penalty. Block the
  // obvious abuse: you cannot rewrite your OWN timings, and no one can edit a locked month.
  if (employeeId === req.user.id) {
      return res.status(403).json({ error: 'You cannot edit your own attendance timings. Another approver must do it.' });
  }
  // Peer/rank guard: an HR admin cannot rewrite another HR admin's (or a higher-ranked user's)
  // punch times to erase their penalties.
  const timingTarget = (await pool.query('SELECT role, name FROM users WHERE id = $1', [employeeId])).rows[0];
  if (timingTarget && req.user.role !== 'super_admin') {
      if (rankOf(timingTarget.role) > rankOf(req.user.role) ||
          (timingTarget.role === 'admin_hr' && req.user.role === 'admin_hr')) {
          return res.status(403).json({ error: "You cannot edit this employee's attendance timings." });
      }
  }
  const timingMonth = String(date).substring(0, 7);
  const timingRun = (await pool.query('SELECT status FROM payroll_runs WHERE month = $1', [timingMonth])).rows[0];
  if (timingRun && timingRun.status === 'locked') {
      return res.status(400).json({ error: `Cannot edit timings. Payroll for ${timingMonth} is already locked.` });
  }

  const punches = (await pool.query("SELECT id, punch_type, timestamp FROM attendance_punches WHERE user_id = $1 AND timestamp LIKE $2 ORDER BY timestamp ASC", [employeeId, date + '%'])).rows;
  const firstPunch = punches.length > 0 ? punches[0] : null;
  const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null;
  const outPunch = lastPunch && lastPunch.punch_type === 'OUT' ? lastPunch : null;
  const inPunch = firstPunch;

  // Capture the pre-edit timings so the audit trail can record what changed.
  const fmtTs = (ts) => ts ? `${String(new Date(ts).getHours()).padStart(2, '0')}:${String(new Date(ts).getMinutes()).padStart(2, '0')}` : '-';
  const oldInStr = inPunch && inPunch.punch_type === 'IN' ? fmtTs(inPunch.timestamp) : '-';
  const oldOutStr = outPunch ? fmtTs(outPunch.timestamp) : '-';

  const getUtcTs = (timeStr) => {
      try {
          const parts = timeStr.split(':');
          const hh = parts[0].padStart(2, '0');
          const mm = (parts[1] || '00').padStart(2, '0');
          return new Date(`${date}T${hh}:${mm}:00`).toISOString();
      } catch (e) {
          return `${date}T${timeStr.padStart(5, '0')}:00.000Z`;
      }
  };

  // The IN and OUT punch writes must land together — if the OUT write failed after the IN
  // write, the day would be left half-edited. One transaction, all-or-nothing.
  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      if (inTime) {
          const newInTs = getUtcTs(inTime);
          if (inPunch && inPunch.punch_type === 'IN') {
              await client.query("UPDATE attendance_punches SET timestamp = $1 WHERE id = $2", [newInTs, inPunch.id]);
          } else {
              await client.query("INSERT INTO attendance_punches (id, user_id, punch_type, timestamp, latitude, longitude, address, work_mode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [crypto.randomUUID(), employeeId, 'IN', newInTs, 0, 0, 'HR Edited', '-']);
          }
      }

      if (outTime) {
          const newOutTs = getUtcTs(outTime);
          if (outPunch) {
              await client.query("UPDATE attendance_punches SET timestamp = $1 WHERE id = $2", [newOutTs, outPunch.id]);
          } else if (inPunch && inPunch.punch_type === 'OUT') {
              await client.query("UPDATE attendance_punches SET timestamp = $1 WHERE id = $2", [newOutTs, inPunch.id]);
          } else {
              await client.query("INSERT INTO attendance_punches (id, user_id, punch_type, timestamp, latitude, longitude, address, work_mode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [crypto.randomUUID(), employeeId, 'OUT', newOutTs, 0, 0, 'HR Edited', '-']);
          }
      }
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
  } finally {
      client.release();
  }

  // Audit trail: a direct timing edit otherwise leaves no record of who made it. Log who edited
  // whose timing on which date, and the before -> after values.
  try {
      await pool.query(
        `INSERT INTO audit_logs (id, timestamp, actor, role, module, change_description, before_value, after_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['AL-' + crypto.randomUUID(), new Date().toISOString().replace('T', ' ').substring(0, 19), req.user.name, req.user.role, 'Attendance',
         `Edited ${timingTarget?.name || 'employee'}'s attendance timing on ${date}`,
         `in ${oldInStr}, out ${oldOutStr}`,
         `in ${inTime || oldInStr}, out ${outTime || oldOutStr}`]
      );
  } catch (e) { console.error('[Audit] timing edit log failed:', e.message); }

  res.json({ success: true });
};

export const getLiveDashboardMetrics = async (req, res) => {
  const totalEmployees = (await pool.query("SELECT count(*) as count FROM users WHERE role != 'super_admin' AND status NOT IN ('rejected', 'resigned', 'terminated')")).rows[0].count;
  const today = new Date().toISOString().split('T')[0];
  const month = today.substring(0, 7);
  
  const punchesToday = (await pool.query(`
      SELECT user_id, punch_type 
      FROM (
          SELECT user_id, punch_type, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn 
          FROM attendance_punches 
          WHERE timestamp LIKE $1
      ) WHERE rn = 1
  `, [today + '%'])).rows;
  const employeesAtWork = punchesToday.filter(p => p.punch_type === 'IN').length;
  
  const onLeaveToday = (await pool.query("SELECT count(DISTINCT employee_id) as count FROM leave_requests WHERE status = 'Approved' AND from_date <= $1 AND to_date >= $2", [today, today])).rows[0].count;
  const pendingLeaveRequests = (await pool.query("SELECT count(*) as count FROM leave_requests WHERE status = 'Pending'")).rows[0].count;
  const attendanceMonthStr = `${employeesAtWork} / ${totalEmployees}`;
  const leavesThisMonth = (await pool.query("SELECT count(*) as count FROM leave_requests WHERE status = 'Approved' AND from_date LIKE $1", [month + '%'])).rows[0].count;
  const leavesStr = `${leavesThisMonth} / ${totalEmployees}`;
  const pendingRequests = (await pool.query("SELECT count(*) as count FROM reimbursements WHERE status = 'Submitted'")).rows[0].count;
  const resolvedRequests = (await pool.query("SELECT count(*) as count FROM reimbursements WHERE status IN ('Approved', 'Rejected', 'Admin-Verified', 'Paid')")).rows[0].count;

  res.json({
      totalEmployees,
      employeesAtWork,
      onLeaveToday,
      pendingLeaveRequests,
      attendanceMonthStr,
      leavesStr,
      pendingRequests,
      resolvedRequests
  });
};

export const getTodayAttendance = async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const users = (await pool.query("SELECT id, employee_id, name, department, role FROM users WHERE role != 'super_admin'")).rows;
  const punches = (await pool.query("SELECT user_id, punch_type, timestamp, latitude, longitude, address FROM attendance_punches WHERE timestamp LIKE $1 ORDER BY timestamp ASC", [today + '%'])).rows;
  const leaves = (await pool.query("SELECT employee_id FROM leave_requests WHERE status = 'Approved' AND from_date <= $1 AND to_date >= $2", [today, today])).rows;
  const leaveSet = new Set(leaves.map(l => l.employee_id));
  
  const result = users.map(u => {
      const userPunches = punches.filter(p => p.user_id === u.id);
      const firstPunch = userPunches.length > 0 ? userPunches[0] : null;
      const lastPunch = userPunches.length > 0 ? userPunches[userPunches.length - 1] : null;
      
      let status = 'Absent';
      if (leaveSet.has(u.id)) status = 'On Leave';
      else if (userPunches.length > 0) {
          if (lastPunch.punch_type === 'IN') status = 'At Work';
          else status = 'Punched Out';
      }
      
      return {
          id: u.id,
          employeeId: u.employee_id,
          name: u.name,
          department: u.department,
          role: u.role,
          status,
          firstPunchTime: firstPunch ? firstPunch.timestamp : null,
          lastPunchTime: status === 'Punched Out' && lastPunch && lastPunch.punch_type === 'OUT' ? lastPunch.timestamp : null,
          firstPunchLocation: firstPunch && firstPunch.latitude ? { lat: firstPunch.latitude, lng: firstPunch.longitude, address: firstPunch.address } : null,
          lastPunchLocation: status === 'Punched Out' && lastPunch && lastPunch.punch_type === 'OUT' && lastPunch.latitude ? { lat: lastPunch.latitude, lng: lastPunch.longitude, address: lastPunch.address } : null
      };
  });
  res.json(result);
};

export const getAttendanceSummaryRecords = async (req, res) => {
  const user = req.user;
  let query = `
      SELECT u.employee_id as "employeeId", u.name, u.role as designation, u.department,
             s.marks_used as "totalMarks", s.late_marks as "lateMarks", s.early_marks as "earlyMarks", (s.deduction_amount * 2) as "halfDayDeductions", s.awol_days as awol
      FROM users u 
      LEFT JOIN attendance_summaries s ON u.id = s.employee_id
  `;
  let params = [];
  if (user.role !== 'admin_hr' && user.role !== 'super_admin') {
      query += ` WHERE u.id = $1`;
      params.push(user.id);
  }

  const records = (await pool.query(query, params)).rows.map((r) => ({
      employeeId: (r.employeeId || '').replace('usr-', '').toUpperCase(),
      name: r.name,
      department: r.department || 'N/A',
      totalMarks: r.totalMarks || 0,
      lateMarks: r.lateMarks || 0,
      earlyMarks: r.earlyMarks || 0,
      halfDayDeductions: r.halfDayDeductions || 0,
      awol: r.awol || 0,
      compliance: ((r.totalMarks || 0) > 3 || (r.awol || 0) > 0) ? 'CRITICAL' : 'GOOD'
  }));
  res.json(records);
};

export const submitRegularisation = async (req, res) => {
  const user = req.user;
  const { date, reason, inTime, outTime } = req.body;
  if (!date || !reason || !inTime || !outTime) return res.status(400).json({ error: 'Missing required fields' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' });
  if (!/^\d{2}:\d{2}$/.test(String(inTime)) || !/^\d{2}:\d{2}$/.test(String(outTime))) {
      return res.status(400).json({ error: 'Check-in and check-out must be valid times (HH:MM).' });
  }
  // A correction is only for a real, past working day inside your own employment window: you
  // can't regularise a day in the future, or a date before you joined the company.
  const istToday = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
  if (date > istToday) return res.status(400).json({ error: 'You cannot request a correction for a future date.' });
  const regUser = (await pool.query('SELECT join_date FROM users WHERE id = $1', [user.id])).rows[0];
  const joinDay = regUser?.join_date ? String(regUser.join_date).slice(0, 10) : null;
  if (joinDay && date < joinDay) {
      return res.status(400).json({ error: `You cannot request a correction for a date before you joined (${joinDay}).` });
  }

  const id = 'reg-' + Math.floor(10000 + Math.random() * 90000);
  const timestamp = new Date().toISOString();
  await pool.query(
      `INSERT INTO attendance_regularisations (id, employee_id, date, reason, in_time, out_time, status, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7)`,
      [id, user.id, date, reason, inTime, outTime, timestamp]
  );
  res.json({ success: true });
};

export const getRegularisations = async (req, res) => {
  const user = req.user;
  let query = `
      SELECT r.*, u.name as employee_name, u.employee_id as emp_code
      FROM attendance_regularisations r
      JOIN users u ON r.employee_id = u.id
  `;
  let params = [];
  // Everyone sees only their OWN requests unless they can actually approve regularisations —
  // keyed on the permission, not the literal 'employee' role (finance_head/cfo had no duty
  // here yet were shown everyone's requests, including the free-text reason).
  if (!(await hasPermission(user, 'attendance.regularisation.approve'))) {
      query += ` WHERE r.employee_id = $1`;
      params.push(user.id);
  }
  // The attendance_regularisations table has no created/timestamp column; order by the date
  // being regularised (newest first), with the id as a stable tie-breaker for same-day rows.
  query += ` ORDER BY r.date DESC, r.id DESC`;
  const result = await pool.query(query, params);
  res.json(result.rows);
};

export const approveRegularisation = async (req, res) => {
  const user = req.user;
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'Missing regularisation ID or status' });
  
  const reg = (await pool.query('SELECT * FROM attendance_regularisations WHERE id = $1', [id])).rows[0];
  if (!reg) return res.status(404).json({ error: 'Regularisation request not found' });

  // Approving a regularisation waives that day's late/early penalty, so it needs the same
  // guards as the penalty panel: you cannot approve your own request, and an approval cannot
  // override a locked payroll month or a penalty the CFO already finalised.
  if (reg.employee_id === user.id) {
      return res.status(403).json({ error: 'You cannot approve your own attendance regularisation. Another approver must do it.' });
  }
  // Same peer rule the penalty panel enforces: an HR admin cannot clear another HR admin's
  // penalty (which is what approving their regularisation does) — escalate to CFO/Super Admin.
  const regTarget = (await pool.query('SELECT role, name FROM users WHERE id = $1', [reg.employee_id])).rows[0];
  if (regTarget && regTarget.role === 'admin_hr' && user.role === 'admin_hr') {
      return res.status(403).json({ error: "HR admins cannot action another HR admin's attendance. Ask the CFO or Super Admin to do it." });
  }
  if (status === 'Approved') {
      const regMonth = String(reg.date).substring(0, 7);
      const regRun = (await pool.query('SELECT status FROM payroll_runs WHERE month = $1', [regMonth])).rows[0];
      if (regRun && regRun.status === 'locked') {
          return res.status(400).json({ error: `Cannot approve regularisation. Payroll for ${regMonth} is already locked.` });
      }
      const regLog = (await pool.query('SELECT penalty_action_by_role FROM attendance_daily_logs WHERE employee_id = $1 AND date = $2', [reg.employee_id, reg.date])).rows[0];
      if (regLog && regLog.penalty_action_by_role === 'cfo' && user.role !== 'cfo') {
          return res.status(403).json({ error: "This day's penalty was finalized by the CFO and cannot be changed via regularisation." });
      }
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query("UPDATE attendance_regularisations SET status = $1, approved_by = $2 WHERE id = $3", [status, user.name, id]);
      if (status === 'Approved') {
          const recId = 'rec-' + Math.random().toString(36).substring(2, 9);
          await client.query("DELETE FROM attendance_records WHERE employee_id = $1 AND date = $2", [reg.employee_id, reg.date]);
          await client.query("INSERT INTO attendance_records (id, employee_id, date, in_time, out_time, awol) VALUES ($1, $2, $3, $4, $5, false)", [recId, reg.employee_id, reg.date, reg.in_time, reg.out_time]);
          await client.query("UPDATE attendance_daily_logs SET penalty_status = 'Waived', penalty_action_by_role = $1 WHERE employee_id = $2 AND date = $3", [user.role, reg.employee_id, reg.date]);
      }
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return serverError(res, e);
  } finally {
      client.release();
  }

  // Derived rebuild, deliberately outside the transaction.
  if (status === 'Approved') {
      try {
          await recalculateAttendanceSummaries(reg.date.substring(0, 7), reg.employee_id);
      } catch (e) {
          console.error('Recalculation after regularisation failed:', e.message);
      }
  }

  // Audit trail: record who actioned the correction request.
  try {
      await pool.query(
        `INSERT INTO audit_logs (id, timestamp, actor, role, module, change_description, before_value, after_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['AL-' + crypto.randomUUID(), new Date().toISOString().replace('T', ' ').substring(0, 19), user.name, user.role, 'Attendance',
         `${status} attendance correction for ${regTarget?.name || 'employee'} on ${reg.date}`,
         null,
         status === 'Approved' ? `in ${reg.in_time || '-'}, out ${reg.out_time || '-'}` : null]
      );
  } catch (e) { console.error('[Audit] regularisation log failed:', e.message); }

  res.json({ success: true });
};

// ==========================================
// 3b. MISSED PUNCH-OUT REMINDER (scheduled)
// ==========================================
// India does not observe DST, so a fixed offset is safe.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

// Returns the UTC instant of "today" 00:00 IST, plus the IST calendar date.
function getIstDayWindow(now = new Date()) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const istDate = istNow.toISOString().slice(0, 10);
  const startUtc = new Date(Date.parse(`${istDate}T00:00:00Z`) - IST_OFFSET_MINUTES * 60_000);
  return { istDate, startUtc: startUtc.toISOString(), endUtc: now.toISOString() };
}

// Anyone whose latest punch so far today is an IN has not punched out yet.
export async function findEmployeesStillPunchedIn(now = new Date()) {
  const { istDate, startUtc, endUtc } = getIstDayWindow(now);
  const rows = (await pool.query(
    `SELECT p.user_id, p.punch_type, p.timestamp, u.name, u.email
     FROM attendance_punches p
     JOIN users u ON u.id = p.user_id
     WHERE p.timestamp >= $1 AND p.timestamp <= $2
       AND u.role != 'super_admin'
       AND COALESCE(u.status, '') NOT IN ('resigned', 'terminated')
     ORDER BY p.timestamp ASC`,
    [startUtc, endUtc]
  )).rows;

  const latestByUser = new Map();
  for (const r of rows) latestByUser.set(r.user_id, r);

  const pending = [];
  for (const r of latestByUser.values()) {
    if (r.punch_type === 'IN') {
      pending.push({ userId: r.user_id, name: r.name, email: r.email, since: r.timestamp });
    }
  }
  return { istDate, pending };
}

// Sends via the Resend HTTP API — no extra dependency. If RESEND_API_KEY is not
// configured the reminder is skipped rather than failing, so nothing breaks.
async function sendReminderEmail(to, name, istDate) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: 'email not configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Reminder: you have not punched out today',
      html:
        `<p>Hi ${escapeHtml(name)},</p>` +
        `<p>Our records show you punched in on ${escapeHtml(istDate)} but have not punched out yet.</p>` +
        `<p>Please punch out before the end of the day. If you forget, the day stays marked ` +
        `<strong>Incomplete</strong> and you will need HR to regularise it.</p>` +
        `<p>— Pentacle Payroll</p>`,
    }),
  });

  if (!res.ok) return { sent: false, reason: `resend ${res.status}: ${await res.text()}` };
  return { sent: true };
}

// Fills in readable addresses for punches that only have coordinates. Runs on a schedule,
// never on the punch path. Nominatim's usage policy allows roughly one request per second,
// so requests are sequential with a delay and each run is capped.
export async function backfillPunchAddresses(limit = 40) {
  const pending = (await pool.query(
    `SELECT id, latitude, longitude FROM attendance_punches
     WHERE address IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY timestamp DESC LIMIT $1`,
    [limit]
  )).rows;

  let resolved = 0;
  for (const p of pending) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.latitude}&lon=${p.longitude}`,
        { headers: { 'User-Agent': 'PentaclePayrollApp/1.0' }, signal: AbortSignal.timeout(5000) }
      );
      if (geoRes.ok) {
        const data = await geoRes.json();
        if (data?.display_name) {
          await pool.query('UPDATE attendance_punches SET address = $1 WHERE id = $2', [data.display_name, p.id]);
          resolved++;
        }
      }
    } catch (e) {
      console.warn('[Geocode] failed for', p.id, e.message);
    }
    // Stay within Nominatim's ~1 request/second policy.
    await new Promise(r => setTimeout(r, 1100));
  }
  return { pending: pending.length, resolved };
}

export const remindMissingPunchOut = async (req, res) => {
  // Called by an external scheduler with `Authorization: Bearer <CRON_SECRET>`.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Never run unauthenticated in production; in dev it's allowed for manual testing.
    if (config.env === 'production') return HttpResponse.unauthorized(res, 'CRON_SECRET is not configured');
  } else {
    // Constant-time compare so the secret can't be recovered by timing the response.
    const provided = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return HttpResponse.unauthorized(res);
    }
  }

  try {
    const { istDate, pending } = await findEmployeesStillPunchedIn();
    const results = [];
    for (const p of pending) {
      let outcome = { sent: false, reason: 'no email on file' };
      if (p.email) {
        try {
          outcome = await sendReminderEmail(p.email, p.name, istDate);
        } catch (e) {
          outcome = { sent: false, reason: e.message };
        }
      }
      results.push({ sent: outcome.sent });
    }
    console.log(`[Reminder] ${istDate}: ${pending.length} still punched in, ${results.filter(r => r.sent).length} emailed`);

    // Resolve addresses for punches saved with coordinates only.
    let geocoded = { pending: 0, resolved: 0 };
    try {
      geocoded = await backfillPunchAddresses();
    } catch (e) {
      console.error('[Geocode] backfill failed:', e.message);
    }

    // Return only counts — never employee names/emails in the HTTP response body.
    res.json({ date: istDate, stillPunchedIn: pending.length, emailed: results.filter(r => r.sent).length, geocoded });
  } catch (e) {
    console.error('[Reminder] failed:', e.message);
    res.status(500).json({ error: 'Reminder job failed.' });
  }
};
