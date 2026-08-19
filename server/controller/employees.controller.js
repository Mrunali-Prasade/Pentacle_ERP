// Employee controllers: self-profile update, employee directory, loans, and the admin
// create/update/salary/delete flows. Includes the create-employee validation schema. Moved
// verbatim from the original monolithic controller; no logic change.
import { pool } from '../config/app.config.js';
import { decryptField, encryptField, hasPermission } from '../utils/helper.js';
import { rankOf } from '../const/appcounst.js';
import { storage } from '../services/storage.js';
import { serverError, decodeUpload } from './_shared.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';

const CreateEmployeeSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required').max(50),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['employee', 'admin_hr', 'finance_head', 'cfo', 'super_admin'], {
    errorMap: () => ({ message: 'Invalid role' }),
  }),
  department: z.string().max(100).optional(),
  designation: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  join_date: z.string().optional(),
  status: z.enum(['permanent', 'probation', 'contract', 'resignation_in_process']).optional(),
});

export const updateProfile = async (req, res) => {
  const user = req.user;
  // join_date is deliberately NOT accepted here: it is HR-owned and drives earned-leave
  // accrual, so letting an employee backdate their own start date would inflate paid leave.
  // It can only be changed via the HR employee editor (which requires employees.edit).
  const { uanNumber, panNumber, bankName, bankAccount, location, state } = req.body;
  // Encrypt the sensitive identity/bank fields at rest (bank_name / location / state are not
  // sensitive and stay plaintext for display and filtering).
  await pool.query(
    `UPDATE users SET uan_number = $1, pan_number = $2, bank_name = $3, bank_account = $4, location = $5, state = $6 WHERE id = $7`,
    [encryptField(uanNumber) || null, encryptField(panNumber) || null, bankName || null, encryptField(bankAccount) || null, location || null, state || null, user.id]
  );
  res.json({ success: true });
};

export const getEmployees = async (req, res) => {
  const employees = (await pool.query('SELECT id, employee_id as "employeeId", email, name, role, designation, department, location, state, join_date as "joinDate", status, confirmation_date as "confirmationDate", overtime_eligible as "overtimeEligible" FROM users WHERE role != \'super_admin\'')).rows;
  res.json(employees);
};

export const getAdminEmployees = async (req, res) => {
  // Editors (admin_hr / super_admin) get the full record because the edit modal needs every
  // field. Everyone else — finance_head, cfo, or a directory-view-only grantee — gets the
  // directory columns the UI actually renders, and salary only if they may view it. This stops
  // Aadhaar / PAN / bank / DOB being shipped to viewers who never display them.
  const canEdit = await hasPermission(req.user, 'employees.edit');
  const canViewSalary = canEdit || await hasPermission(req.user, 'employees.salary.view');

  if (canEdit) {
      const employees = (await pool.query(`
          SELECT u.*, u.employee_id as "employeeId",
                 (SELECT monthly_salary FROM salary_structures WHERE employee_id = u.id ORDER BY effective_from DESC LIMIT 1) as "monthlySalary"
          FROM users u ORDER BY u.role, u.name
      `)).rows;
      // u.* includes password_hash — never send credential material to the client.
      // Also decrypt the at-rest-encrypted identity/bank fields for the edit form.
      for (const e of employees) {
          delete e.password_hash;
          e.aadhar_number = decryptField(e.aadhar_number);
          e.pan_number = decryptField(e.pan_number);
          e.uan_number = decryptField(e.uan_number);
          e.mediclaim_number = decryptField(e.mediclaim_number);
          e.bank_account = decryptField(e.bank_account);
      }
      return res.json(employees);
  }

  const salaryCol = canViewSalary
      ? ', (SELECT monthly_salary FROM salary_structures WHERE employee_id = u.id ORDER BY effective_from DESC LIMIT 1) as "monthlySalary"'
      : '';
  const employees = (await pool.query(`
      SELECT u.id, u.employee_id, u.employee_id as "employeeId", u.name, u.first_name, u.last_name,
             u.email, u.role, u.designation, u.department, u.location, u.state, u.status,
             u.join_date, u.avatar_url, u.is_leave_approver, u.exit_date, u.confirmation_date,
             u.overtime_eligible${salaryCol}
      FROM users u ORDER BY u.role, u.name
  `)).rows;
  return res.json(employees);
};

export const getLoans = async (req, res) => {
  const query = `
      SELECT l.id, l.employee_id as "employeeId", u.name as "employeeName", u.employee_id as "employeeCode",
             l.principal, l.monthly_instalment as "monthlyInstalment",
             l.remaining_balance as "remainingBalance", l.start_month as "startMonth"
      FROM loans l
      JOIN users u ON u.id = l.employee_id
      ORDER BY (l.remaining_balance > 0) DESC, l.start_month DESC
  `;
  const loans = (await pool.query(query)).rows;
  res.json(loans);
};

export const createLoan = async (req, res) => {
  const { employeeId, principal, monthlyInstalment, startMonth } = req.body;
  if (!employeeId || !principal || !monthlyInstalment || !startMonth) {
    return res.status(400).json({ error: 'employeeId, principal, monthlyInstalment and startMonth are all required.' });
  }
  const parsedPrincipal = parseFloat(principal);
  const parsedInstalment = parseFloat(monthlyInstalment);
  if (!(parsedPrincipal > 0) || !(parsedInstalment > 0)) {
    return res.status(400).json({ error: 'Principal and monthly instalment must be positive numbers.' });
  }

  const id = 'loan-' + crypto.randomUUID();
  // remaining_balance starts equal to the principal — payroll deducts from it each run.
  await pool.query(
    'INSERT INTO loans (id, employee_id, principal, monthly_instalment, remaining_balance, start_month) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, employeeId, parsedPrincipal, parsedInstalment, parsedPrincipal, startMonth]
  );
  res.json({ success: true, id });
};

export const updateEmployee = async (req, res) => {
  const { id } = req.params;
  const { 
      first_name, last_name, gender, marital_status, dob, employeeId, email, 
      mobile_number, location, country, join_date, designation, role, department, 
      status, is_leave_approver, mediclaim_number, aadhar_number, pan_number, 
      uan_number, monthlySalary, exit_date,
      education_docs_file, aadhar_docs_file, pan_docs_file, avatar_file
  } = req.body;

  const fullName = `${first_name || ''} ${last_name || ''}`.trim();

  // --- Authorization: role & privilege guards (see appcounst.ROLE_RANK) --------------
  // Load the target's CURRENT role before touching anything. Every escalation path
  // (self-promotion, editing a higher-ranked account, assigning a role above your own)
  // is blocked here rather than trusting whatever role string the body carries.
  const targetRow = (await pool.query('SELECT role FROM users WHERE id = $1', [id])).rows[0];
  if (!targetRow) return res.status(404).json({ error: 'Employee not found' });

  const actorRank = rankOf(req.user.role);
  const targetRank = rankOf(targetRow.role);

  // Cannot edit anyone who outranks you (protects super_admin / cfo records from an HR
  // admin demoting them, changing their email, or locking them out via status).
  if (targetRank > actorRank && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'You cannot edit a user whose role is higher than your own.' });
  }

  // Decide the role that will actually be written. A role change is honoured only when
  // the caller is entitled to assign that role; otherwise the existing role is preserved.
  const VALID_ROLES = ['employee', 'admin_hr', 'finance_head', 'cfo', 'super_admin'];
  let finalRole = targetRow.role;
  if (role !== undefined && role !== null && role !== '' && role !== targetRow.role) {
    // You can never change your OWN role through the employee editor — that was the
    // self-escalation hole (an admin_hr promoting themselves to finance_head at equal rank).
    if (id === req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You cannot change your own role.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    // Cannot assign a role higher than your own (e.g. HR can onboard a peer/finance user for
    // someone ELSE, but nobody but a super_admin can mint a cfo/super_admin).
    if (rankOf(role) > actorRank && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You cannot assign a role higher than your own.' });
    }
    finalRole = role;
  }

  // The employee id comes from the URL — never interpolate it into a storage path unsanitised
  // (that was a path-traversal hole). We use a fixed, sanitised key plus a server-generated
  // name, and validate the file's real type / size.
  const safeIdForPath = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uploadDoc = async (fileObj, prefix) => {
      if (!fileObj || !fileObj.data) return null;
      let decoded;
      try { decoded = decodeUpload(fileObj.data, { allowPdf: true }); }
      catch (e) { throw new Error(`${prefix} document: ${e.message}`); }
      return await storage.uploadBuffer(decoded.buffer, `employees/${safeIdForPath}-${prefix}-${crypto.randomUUID()}${decoded.ext}`, decoded.contentType);
  };

  // File uploads happen before the transaction opens — they are slow network calls and
  // holding a database connection open across them would starve the pool.
  let eduUrl, aadharUrl, panUrl, avatarUrl;
  try {
      eduUrl = await uploadDoc(education_docs_file, 'edu');
      aadharUrl = await uploadDoc(aadhar_docs_file, 'aadhar');
      panUrl = await uploadDoc(pan_docs_file, 'pan');
      avatarUrl = await uploadDoc(avatar_file, 'avatar');
  } catch (e) {
      return res.status(400).json({ error: e.message });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');

      if (eduUrl) await client.query('UPDATE users SET education_docs_url = $1 WHERE id = $2', [eduUrl, id]);
      if (aadharUrl) await client.query('UPDATE users SET aadhar_docs_url = $1 WHERE id = $2', [aadharUrl, id]);
      if (panUrl) await client.query('UPDATE users SET pan_docs_url = $1 WHERE id = $2', [panUrl, id]);
      if (avatarUrl) await client.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, id]);

      // Identity / security-critical columns use COALESCE so an omitted field can never
      // blank them out (a crafted request that dropped employee_id used to null it and 500).
      await client.query(`
          UPDATE users SET
              first_name = $1, last_name = $2,
              name = COALESCE($3, name),
              gender = $4, marital_status = $5,
              dob = $6,
              employee_id = COALESCE($7, employee_id),
              email = COALESCE($8, email),
              mobile_number = $9, location = $10,
              country = $11, join_date = $12, designation = $13,
              role = $14,
              department = $15,
              status = COALESCE($16, status),
              is_leave_approver = $17,
              mediclaim_number = COALESCE($18, mediclaim_number),
              aadhar_number = COALESCE($19, aadhar_number),
              pan_number = COALESCE($20, pan_number),
              uan_number = COALESCE($21, uan_number),
              exit_date = $22
          WHERE id = $23
      `, [
          first_name, last_name, fullName || null, gender, marital_status, dob, employeeId || null, email || null,
          mobile_number, location, country, join_date, designation, finalRole, department,
          status || null, !!is_leave_approver,
          // Sensitive identity numbers are encrypted at rest (undefined => null keeps COALESCE preserve-on-omit).
          (mediclaim_number === undefined ? null : encryptField(mediclaim_number)),
          (aadhar_number === undefined ? null : encryptField(aadhar_number)),
          (pan_number === undefined ? null : encryptField(pan_number)),
          (uan_number === undefined ? null : encryptField(uan_number)),
          exit_date, id
      ]);

      // A non-super_admin can never raise their OWN salary through the employee editor. The
      // change is silently skipped (rather than erroring) so an admin editing their own profile
      // for other reasons still succeeds — only the salary field is ignored.
      // Editing salary through this endpoint also requires the dedicated salary permission —
      // not just employees.edit — so an override that grants only "edit records" can't rewrite pay.
      const mayEditSalary = (id !== req.user.id || req.user.role === 'super_admin')
          && await hasPermission(req.user, 'employees.salary.edit');
      if (mayEditSalary && monthlySalary !== undefined && monthlySalary !== null && !isNaN(Number(monthlySalary)) && Number(monthlySalary) >= 0) {
          const existing = (await client.query('SELECT id FROM salary_structures WHERE employee_id = $1', [id])).rows[0];
          if (existing) {
              await client.query('UPDATE salary_structures SET monthly_salary = $1 WHERE employee_id = $2', [Number(monthlySalary), id]);
          } else {
              const salaryId = 'sal-' + Math.floor(Math.random() * 100000);
              await client.query('INSERT INTO salary_structures (id, employee_id, monthly_salary, effective_from) VALUES ($1, $2, $3, $4)', [
                  salaryId, id, Number(monthlySalary), new Date().toISOString().split('T')[0]
              ]);
          }
      }
      await client.query('COMMIT');
      res.json({ success: true });
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error("Update Employee Error:", e.message);
      // Don't return the raw DB error — pg messages echo column names and offending values (PII).
      if (e.code === '23505') return res.status(400).json({ error: 'That Employee ID or email is already in use.' });
      res.status(500).json({ error: 'Could not update the employee. Please try again.' });
  } finally {
      client.release();
  }
};

export const createEmployee = async (req, res) => {
  const parsed = CreateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const { employee_id, name, email, password, role, department, designation, location, join_date, status } = parsed.data;

  // Cannot mint an account with a role above your own — stops account-creation being used
  // as an escalation path (e.g. an admin_hr creating a brand-new super_admin).
  if (rankOf(role) > rankOf(req.user.role) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You cannot create a user with a role higher than your own.' });
  }

  const client = await pool.connect();
  try {
      const passwordHash = await bcrypt.hash(password, 10);
      const id = 'usr-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

      await client.query('BEGIN');

      await client.query(`
          INSERT INTO users (id, employee_id, email, password_hash, name, role, department, designation, location, join_date, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [id, employee_id, email, passwordHash, name, role, department || null, designation || null, location || null, join_date || null, status || 'permanent']);

      await client.query(`
          INSERT INTO salary_structures (id, employee_id, monthly_salary, effective_from)
          VALUES ($1, $2, $3, $4)
      `, ['sal-' + Date.now(), id, 30000, new Date().toISOString().split('T')[0]]);

      await client.query('COMMIT');
      res.json({ success: true, message: 'Employee added successfully', id });
  } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error("Employee Creation Error:", err.message);
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Employee ID or Email already exists.' });
      }
      if (err.code === '23505') {
          return res.status(400).json({ error: 'Employee ID or Email already exists.' });
      }
      // Never echo the raw pg error to the client — it can contain column names and values.
      res.status(500).json({ error: 'Could not create the employee. Please try again.' });
  } finally {
      client.release();
  }
};

export const updateEmployeeSalary = async (req, res) => {
  const { id } = req.params;
  const { monthlySalary } = req.body;

  if (monthlySalary === undefined || monthlySalary === null || isNaN(Number(monthlySalary)) || Number(monthlySalary) < 0) {
      return res.status(400).json({ error: 'A valid, non-negative monthly salary is required' });
  }
  // You cannot change your own salary.
  if (id === req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You cannot change your own salary. Another authoriser must do it.' });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      // Serialize concurrent salary edits for the SAME employee. Without this, two near-simultaneous
      // saves could both see "no existing row" and both INSERT, leaving duplicate salary_structures
      // rows — which then makes "latest salary" ambiguous and can feed the wrong figure into payroll.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['salary:' + id]);

      const existing = (await client.query('SELECT id FROM salary_structures WHERE employee_id = $1', [id])).rows[0];
      if (existing) {
          await client.query('UPDATE salary_structures SET monthly_salary = $1 WHERE employee_id = $2', [monthlySalary, id]);
      } else {
          // Deterministic id keyed to the employee: with one salary row per employee it is unique and
          // can never collide (the old random 'sal-'+5-digit could, at volume).
          await client.query('INSERT INTO salary_structures (id, employee_id, monthly_salary, effective_from) VALUES ($1, $2, $3, $4)', [
              'sal-' + id, id, monthlySalary, new Date().toISOString().split('T')[0]
          ]);
      }
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
  } finally {
      client.release();
  }

  res.json({ success: true, monthlySalary });
};

export const getSalaryStructure = async (req, res) => {
  const { employeeId } = req.params;
  const structure = (await pool.query('SELECT id, monthly_salary as "monthlySalary", basic_percent as "basicPercent", hra_percent as "hraPercent", conveyance_percent as "conveyancePercent", special_percent as "specialPercent", other_percent as "otherPercent", effective_from as "effectiveFrom" FROM salary_structures WHERE employee_id = $1 ORDER BY effective_from DESC LIMIT 1', [employeeId])).rows[0];
  res.json(structure || null);
};

export const deleteEmployee = async (req, res) => {
  const id = req.params.id;

  // Guard a destructive, irreversible action: you cannot delete yourself, and you cannot
  // delete anyone who outranks you (protects CFO / super_admin accounts from an HR admin).
  const target = (await pool.query('SELECT id, name, role FROM users WHERE id = $1', [id])).rows[0];
  if (!target) return res.status(404).json({ error: 'Employee not found' });
  if (id === req.user.id) {
      return res.status(403).json({ error: 'You cannot delete your own account.' });
  }
  if (rankOf(target.role) > rankOf(req.user.role) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You cannot delete a user whose role is higher than your own.' });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query('DELETE FROM reimbursement_timeline WHERE reimbursement_id IN (SELECT id FROM reimbursements WHERE user_id = $1)', [id]);
      await client.query('DELETE FROM reimbursements WHERE user_id = $1', [id]);
      await client.query('DELETE FROM attendance_records WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM attendance_summaries WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM attendance_daily_logs WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM attendance_punches WHERE user_id = $1', [id]);
      await client.query('DELETE FROM attendance_regularisations WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM leave_requests WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM leave_balances WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM salary_structures WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM payslips WHERE user_id = $1', [id]);
      await client.query('DELETE FROM users WHERE id = $1', [id]);
      // Audit trail written inside the SAME transaction — an irreversible deletion must never
      // commit without its record of who removed whom (previously this ran after COMMIT and could
      // silently fail, leaving a deletion with no trail).
      await client.query(
          `INSERT INTO audit_logs (id, timestamp, actor, role, module, change_description, before_value, after_value)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          ['AL-' + crypto.randomUUID(), new Date().toISOString().replace('T', ' ').substring(0, 19),
           req.user.name, req.user.role, 'Employee Directory',
           `Deleted employee ${target.name} (${target.role})`, target.name, null]
      );
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error("Delete Employee Error:", e.message);
      return serverError(res, e);
  } finally {
      client.release();
  }

  // No rebuild needed: this employee's summary rows were deleted above, and removing one
  // person cannot change anyone else's marks.
  res.json({ success: true });
};
