export type UserRole = 'employee' | 'admin_hr' | 'finance_head' | 'cfo' | 'super_admin';

export interface User {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  designation: string;
  department: string;
  location?: string;
  state?: string;
  joinDate?: string;
  status?: string;
  uanNumber?: string;
  panNumber?: string;
  bankName?: string;
  bankAccount?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string;
  designation: string;
  employeeId?: string;
  department?: string;
  uanNumber?: string;
  panNumber?: string;
  bankName?: string;
  bankAccount?: string;
  location?: string;
  state?: string;
  joinDate?: string;
  // Effective permission keys (role default bundle + any super_admin-granted overrides).
  // Purely for deciding what the UI shows — every route re-checks this server-side too.
  permissions?: string[];
  // Only the permissions granted as an individual override (beyond the user's role). Drives the
  // "Extra Access" screen so a role that already has a full dashboard doesn't get a duplicate.
  extraPermissions?: string[];
  // True until the user replaces a temporary/initial password. The backend blocks all other
  // routes while this is set (see requireAuth), and the SPA shows the change-password gate.
  forcePasswordChange?: boolean;
}

export interface Payslip {
  id: string;
  employeeName?: string;
  employeeId?: string;
  designation?: string;
  department?: string;
  panNumber?: string;
  uanNumber?: string;
  bankName?: string;
  bankAccount?: string;
  location?: string;
  state?: string;
  joinDate?: string;
  payPeriod: string;
  type?: string;
  status: 'draft' | 'locked';
  calendarDays: number;
  paidDays: number;
  monthlySalary?: number;
  basicSalary: number;
  hra: number;
  conveyanceAllowance: number;
  specialAllowance: number;
  otherAllowance: number;
  reimbursements: number;
  overtimeAmount: number;
  bonus: number;
  grossAmount: number;
  providentFund: number;
  employerPf: number;
  pension: number;
  professionalTax: number;
  incomeTax: number;
  lopDeduction: number;
  loanInstalment: number;
  otherDeductions: number;
  grossDeduction: number;
  netAmount: number;
  amountToBank: number;
  pdfUrl?: string;
}

export interface ReimbursementClaim {
  id: string; // e.g. CLM-78291
  date: string; // e.g. Oct 12, 2023
  expenseDate: string;
  category: string; // e.g. Travel & Lodging
  amount: number;
  currency: string;
  status: 'Draft' | 'Submitted' | 'Admin-Verified' | 'Finance-Verified' | 'Approved-for-Payroll' | 'Paid' | 'Returned' | 'Rejected' | 'Cancelled';
  employeeName: string;
  employeeRole: string;
  employeeAvatar?: string;
  description: string;
  costCentre?: string;
  isTaxable: boolean;
  proofFileName: string;
  proofFileSize: string;
  // Base64 data URL sent only when creating a claim; not returned by the API.
  proofFileData?: string;
  paymentProofFileName?: string;
  comments?: string;
  timeline: {
    status: string;
    timestamp: string;
    actor: string;
    completed: boolean;
  }[];
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  timestamp: string; // ISO Date String
  action: 'IN' | 'OUT';
  source: 'REGULARISED' | 'APP_PUNCH';
  locationDetails?: string;
}

export interface TimeLog {
  employeeId: string;
  date: string;
  entries: TimeEntry[];
}

export interface AttendanceRecord {
  employeeId: string;
  name: string;
  department: string;
  totalMarks: number;
  lateMarks: number;
  earlyMarks: number;
  halfDayDeductions: number;
  awol: number;
  compliance: 'GOOD' | 'CRITICAL';
}

export interface GlobalPolicy {
  lateGracePeriod: number;
  overtimeRate: string;
  holidayOtRate: string;
  leaveAccrual: string;
  slaEscalation: string;
  reimbursementCutoffDays: number;
  cfoApprovalThreshold: number;
}

export interface GuardrailCategory {
  category: string;
  monthlyCap: number;
  proofRequired: boolean;
  status: 'ACTIVE' | 'REVIEWING';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  module: string;
  changeDescription: string;
  beforeValue?: string;
  afterValue?: string;
}
