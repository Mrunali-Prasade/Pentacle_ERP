import express from 'express';
import * as controllersRaw from '../controller/controllers.js';
import { requireAuth, requireRole, requirePermission, requireRoleOrPermission } from '../utils/helper.js';
import { pool } from '../config/app.config.js';

// Safety net: wrap every controller so a thrown or rejected async handler becomes a clean 500
// (handled by the error middleware in start.server.js) instead of hanging the request forever.
// Express 4 does NOT catch errors from async handlers automatically, which is how a broken
// handler (e.g. a bad SQL query) could leave the browser spinning with no response at all.
const asyncWrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const controllers = {};
for (const [name, value] of Object.entries(controllersRaw)) {
  controllers[name] = typeof value === 'function' ? asyncWrap(value) : value;
}

const router = express.Router();

// ==========================================
// 0. HEALTH / READINESS (unauthenticated, for uptime monitors & load balancers)
// ==========================================
// Liveness: is the process up and serving? No DB touch — never fails on a DB blip.
router.get('/health', (req, res) => res.json({ status: 'ok' }));
// Readiness: can the app actually reach its database? A short SELECT 1; returns 503 if not,
// so a monitor can distinguish "process alive but DB down" from a healthy instance.
router.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'unavailable' });
  }
});

// ==========================================
// 1. AUTH ROUTES
// ==========================================
router.post('/auth/login', controllers.login);
router.post('/auth/change-password', requireAuth, controllers.changePassword);
router.post('/auth/logout', controllers.logout);
router.get('/auth/me', requireAuth, controllers.me);

// ==========================================
// 2. EMPLOYEE ROUTES
// ==========================================
router.put('/users/profile', requireAuth, controllers.updateProfile);
router.get('/employees', requireAuth, requirePermission('employees.directory.view'), controllers.getEmployees);
router.get('/admin/employees', requireAuth, requirePermission('employees.directory.view'), controllers.getAdminEmployees);
router.put('/admin/employees/:id', requireAuth, requirePermission('employees.edit'), controllers.updateEmployee);
router.post('/employees', requireAuth, requirePermission('employees.create'), controllers.createEmployee);
router.put('/admin/employees/:id/salary', requireAuth, requirePermission('employees.salary.edit'), controllers.updateEmployeeSalary);
router.get('/salary-structures/:employeeId', requireAuth, requirePermission('employees.salary.view'), controllers.getSalaryStructure);
router.delete('/admin/employees/:id', requireAuth, requirePermission('employees.delete'), controllers.deleteEmployee);

// Loans: managed from the "Finance" tab on the HR, Finance Head, and Super Admin dashboards.
// Deducted automatically each payroll run (see runPayroll).
router.get('/loans', requireAuth, requirePermission('loans.manage'), controllers.getLoans);
router.post('/loans', requireAuth, requirePermission('loans.manage'), controllers.createLoan);

// ==========================================
// 3. ATTENDANCE ROUTES
// ==========================================
router.post('/attendance/punch', requireAuth, controllers.punch);
router.get('/attendance/punches/status', requireAuth, controllers.getPunchesStatus);
router.get('/attendance/punches/export', requireAuth, controllers.exportPunches);
router.get('/hr/attendance/history/export', requireAuth, requirePermission('attendance.history.export'), controllers.exportDailyHistory);
// GET stays requireRoleOrPermission (not a plain requirePermission swap): 'cfo' already had view
// access here even though cfo's default penalties.approve set matches — kept explicit so a future
// change to either list can't silently diverge them again.
router.get('/hr/attendance/penalties', requireAuth, requireRoleOrPermission(['admin_hr', 'super_admin', 'cfo'], 'penalties.approve'), controllers.getPenalties);
router.put('/hr/attendance/penalties/bulk', requireAuth, requirePermission('penalties.approve'), controllers.updateBulkPenaltyStatus);
router.put('/hr/attendance/penalties/:id', requireAuth, requirePermission('penalties.approve'), controllers.updatePenaltyStatus);
router.get('/hr/attendance/detailed', requireAuth, requirePermission('attendance.detailed.view'), controllers.getDetailedAttendance);
router.get('/hr/attendance/employee/:id/monthly', requireAuth, requirePermission('attendance.detailed.view'), controllers.getMonthlyEmployeeAttendance);
router.put('/hr/attendance/employee/:id/timing', requireAuth, requirePermission('attendance.timing.edit'), controllers.updateEmployeeTiming);
router.get('/hr/dashboard/metrics', requireAuth, requirePermission('dashboard.metrics.view'), controllers.getLiveDashboardMetrics);
router.get('/hr/attendance/today', requireAuth, requirePermission('attendance.today.view'), controllers.getTodayAttendance);
router.get('/attendance', requireAuth, controllers.getAttendanceSummaryRecords);
router.get('/attendance/penalties/my', requireAuth, controllers.getMyPenalties);
router.post('/attendance/regularise', requireAuth, controllers.submitRegularisation);
router.get('/attendance/regularisations', requireAuth, controllers.getRegularisations);
router.post('/attendance/regularise/approve', requireAuth, requirePermission('attendance.regularisation.approve'), controllers.approveRegularisation);

// Meant to be called once a day by an external scheduler (see DEPLOYMENT_CHECKLIST.md).
// Authenticated by CRON_SECRET in the Authorization header, not a session.
router.get('/cron/missing-punch-out', controllers.remindMissingPunchOut);

// Serves receipts, payment proofs, identity documents and selfies. Both the OneDrive path
// (/files/:itemId) and the local-disk path (/uploads/*) are authorized per file — the
// requester must own the file or hold the permission that governs its document class.
router.get('/files/:itemId', requireAuth, controllers.getStoredFile);
router.get('/uploads/*', requireAuth, controllers.serveUpload);

// ==========================================
// 4. PAYROLL ROUTES
// ==========================================
router.get('/payslips', requireAuth, controllers.getPayslips);
router.put('/payslips/:id', requireAuth, requirePermission('payslips.edit'), controllers.updatePayslip);
router.post('/payroll/run', requireAuth, requirePermission('payroll.run'), controllers.runPayroll);
router.get('/payroll/check/:month', requireAuth, requirePermission('payroll.lock.view'), controllers.checkPayrollLock);
router.post('/payroll/lock/:month', requireAuth, requirePermission('payroll.lock.manage'), controllers.lockPayroll);

// ==========================================
// 5. REIMBURSEMENTS ROUTES
// ==========================================
router.get('/reimbursements', requireAuth, controllers.getReimbursements);
router.post('/reimbursements', requireAuth, controllers.createReimbursement);
// 'cfo' is required here: the CFO authorises every claim (Finance-Verified -> Approved-for-Payroll).
// Same default access as before (admin_hr/finance_head/cfo/super_admin) via role_permissions seed,
// but a super_admin can now also grant this to one specific user without making them finance_head.
// The per-stage role check inside updateReimbursementStatus (CLAIM_TRANSITIONS) still applies —
// a permission-only override grantee bypasses that per-stage check too (see hasPermissionOverride
// call inside the controller), acting as a flat "can approve claims" grant, not stage-scoped.
router.put('/reimbursements/:id/status', requireAuth, requirePermission('reimbursements.approve'), controllers.updateReimbursementStatus);
// An employee may correct or withdraw their own claim until a reviewer accepts it.
router.put('/reimbursements/:id', requireAuth, controllers.updateOwnReimbursement);
router.post('/reimbursements/:id/cancel', requireAuth, controllers.cancelOwnReimbursement);
router.post('/reimbursements/:id/pay', requireAuth, requirePermission('reimbursements.pay'), controllers.payReimbursement);

// ==========================================
// 6. ADMIN ROUTES
// ==========================================
// Policy & guardrails disclose approval thresholds and per-category caps — only those who can
// edit policy (or a super_admin) need to read them; the UI never shows them to anyone else.
router.get('/policy', requireAuth, requirePermission('policy.edit'), controllers.getGlobalPolicy);
router.put('/policy', requireAuth, requirePermission('policy.edit'), controllers.updateGlobalPolicy);
router.get('/guardrails', requireAuth, requirePermission('policy.edit'), controllers.getGuardrails);
// No role holds audit_logs.view by default (matches the old super_admin-only gate) — this
// permission is grantable only via an explicit override, never inherited from a role.
router.get('/audit-logs', requireAuth, requirePermission('audit_logs.view'), controllers.getAuditLogs);
// Client-authored audit entries are restricted to super_admin (the only screen that writes
// them); the audited server actions write their own rows directly, not through this route.
router.post('/audit-logs', requireAuth, requireRole(['super_admin']), controllers.createAuditLog);
router.get('/holidays', requireAuth, controllers.getHolidays);
router.post('/holidays', requireAuth, requirePermission('holidays.manage'), controllers.addHoliday);
router.delete('/holidays/:date', requireAuth, requirePermission('holidays.manage'), controllers.deleteHoliday);
router.post('/leaves', requireAuth, controllers.createLeaveRequest);
router.get('/leaves/my', requireAuth, controllers.getMyLeaves);
// Company-wide approved-leave data — only leave approvers should be able to enumerate it.
router.get('/leaves/overlap', requireAuth, requirePermission('leaves.approve'), controllers.getTeamOverlap);
// GET stays requireRoleOrPermission: cfo can view leave requests today but was never allowed to
// approve them (leaves.approve's default bundle is admin_hr only) — collapsing this to a plain
// requirePermission would silently take cfo's read access away.
router.get('/leaves/all', requireAuth, requireRoleOrPermission(['admin_hr', 'super_admin', 'cfo'], 'leaves.approve'), controllers.getAllLeaveRequests);
router.put('/leaves/:id/status', requireAuth, requirePermission('leaves.approve'), controllers.updateLeaveRequestStatus);

// ==========================================
// 7. GRANULAR PERMISSIONS (super_admin only)
// ==========================================
router.get('/permissions', requireAuth, requireRole(['super_admin']), controllers.getPermissionCatalog);
router.get('/permissions/user/:id', requireAuth, requireRole(['super_admin']), controllers.getUserPermissionOverrides);
router.put('/permissions/user/:id', requireAuth, requireRole(['super_admin']), controllers.updateUserPermissionOverride);

export default router;
