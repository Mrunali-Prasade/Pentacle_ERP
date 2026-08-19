export const ROLES = {
  EMPLOYEE: 'employee',
  ADMIN_HR: 'admin_hr',
  FINANCE_HEAD: 'finance_head',
  CFO: 'cfo',
  SUPER_ADMIN: 'super_admin'
};

// Privilege ranking used to gate role assignment and cross-user edits. A caller may
// never assign a role above their own rank, nor edit/delete a user who outranks them —
// this is what stops an admin_hr promoting themselves (or anyone) to super_admin.
export const ROLE_RANK = {
  employee: 0,
  admin_hr: 1,
  finance_head: 1,
  cfo: 2,
  super_admin: 3
};

export const rankOf = (role) => (role in ROLE_RANK ? ROLE_RANK[role] : 0);

export const PUNCH_TYPES = {
  IN: 'IN',
  OUT: 'OUT'
};

export const PENALTY_STATUS = {
  WAIVED: 'Waived',
  DEDUCT: 'Deduct',
  FREE: 'Free',
  PENDING: 'Pending',
  NONE: 'None'
};

export const WORK_MODES = {
  OFFICE: 'Office',
  ON_SITE: 'On site',
  MANUAL: 'Manual'
};
