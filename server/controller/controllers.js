// Central controller barrel.
//
// The former ~3,000-line controller has been split into focused per-area controllers (imported
// below) plus the attendance calculation engine (../services/attendance-engine.js). This file
// re-exports every handler so existing consumers keep seeing the exact same names:
//   - server/controller/index.js   does `export * from './controllers.js'`
//   - server/routes/api.routes.js  does `import * as controllers from '../controller/controllers.js'`
// Nothing about behaviour changed — this is purely how the code is organised on disk.

export * from './auth.controller.js';
export * from './employees.controller.js';
export * from './attendance.controller.js';
export * from './payroll.controller.js';
export * from './reimbursements.controller.js';
export * from './admin.controller.js';
export * from './leaves.controller.js';
export * from './permissions.controller.js';

// The attendance engine also exposes getLeaveCycleStart, which was always internal to the
// controllers and never part of this module's public surface — so it is intentionally NOT
// re-exported here. Only the five functions that were previously public are surfaced.
export {
  getAttendancePolicy,
  formatPunchLocation,
  evaluateAttendanceDay,
  recalculateAttendanceSummaries,
  calculateEarnedLeaveAccrued,
} from '../services/attendance-engine.js';
