import React, { useState, useEffect } from 'react';
import { UserProfile, Payslip, ReimbursementClaim, GlobalPolicy, GuardrailCategory, AuditLog } from '../../types';
import OverviewTab from './admin-hr/OverviewTab';
import HolidaysTab from './admin-hr/HolidaysTab';
import LeavesTab from './admin-hr/LeavesTab';
import RegularisationsTab from './admin-hr/RegularisationsTab';
import PenaltiesPanel from './admin-hr/PenaltiesPanel';
import AddEmployeeModal from './admin-hr/AddEmployeeModal';
import EmployeeDirectory from '../employees/EmployeeDirectory';
import { EmployeeEditModal } from '../employees/EmployeeEditModal';
import DailyAttendanceList from '../attendance/DailyAttendanceList';
import { DetailedAttendanceView } from '../attendance/DetailedAttendanceView';
import LoansManager from '../shared/LoansManager';
import ClaimsSection from './finance-head/ClaimsSection';
import PayslipManagementSection from './finance-head/PayslipManagementSection';
import PayrollGenerationControl from './finance-head/PayrollGenerationControl';
import SuperAdminDashboard from './SuperAdminDashboard';

// The company head's OWN dashboard. Not a switcher between role views — a single console whose
// tabs render the real feature components directly (the same ones the role dashboards use), so it
// has genuine full access with one consistent header and no duplicated/role-specific screens.
// Every child is given the exact props/state pattern it already relies on, so behaviour is
// identical to how each feature works elsewhere.
interface SuperAdminConsoleProps {
  user: UserProfile;
  policy: GlobalPolicy;
  guardrails: GuardrailCategory[];
  auditLogs: AuditLog[];
  claims: ReimbursementClaim[];
  employeesList: any[];
  payslips: Payslip[];
  onUpdatePolicy: (updated: Partial<GlobalPolicy>) => void;
  onUpdateGuardrail: (category: string, updated: Partial<GuardrailCategory>) => void;
  onAddAuditLog: (module: string, change: string, before?: string, after?: string) => Promise<void>;
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onUpdateEmployee: (employeeId: string, data: any) => Promise<void>;
  onDeleteEmployee: (employeeId: string) => void;
  onPayClaim: (claimId: string, proofFileName: string, proofFileData: string) => void;
  onRunPayroll: (month: string) => void;
  triggerToast: (message: string, variant?: string) => void;
  onRefresh?: () => void;
}

type Tab =
  | 'overview' | 'employees' | 'attendance' | 'leaves' | 'holidays'
  | 'payroll' | 'reimbursements' | 'loans' | 'governance';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'dashboard' },
  { key: 'employees', label: 'Employees', icon: 'badge' },
  { key: 'attendance', label: 'Attendance', icon: 'schedule' },
  { key: 'leaves', label: 'Leaves', icon: 'event' },
  { key: 'holidays', label: 'Holidays', icon: 'celebration' },
  { key: 'payroll', label: 'Payroll', icon: 'payments' },
  { key: 'reimbursements', label: 'Reimbursements', icon: 'receipt_long' },
  { key: 'loans', label: 'Loans', icon: 'account_balance' },
  { key: 'governance', label: 'Governance', icon: 'shield_person' },
];

export default function SuperAdminConsole(props: SuperAdminConsoleProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [attendanceSubTab, setAttendanceSubTab] = useState<'records' | 'corrections'>('records');
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showLiveAttendance, setShowLiveAttendance] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);
  const [leavesData, setLeavesData] = useState<any[]>([]);
  const [penaltiesCount, setPenaltiesCount] = useState(0);
  const [correctionsCount, setCorrectionsCount] = useState(0);

  const todayStr = new Date().toISOString().split('T')[0];
  const resignationsToProcess = (props.employeesList || []).filter(
    (e) => e.status === 'resignation_in_process' && e.exit_date && e.exit_date <= todayStr
  );

  const fetchLeaves = () => {
    fetch('/api/leaves/all')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load leave requests'))))
      .then((data) => setLeavesData(Array.isArray(data) ? data : []))
      .catch(() => props.triggerToast('Could not load leave requests'));
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetch('/api/hr/dashboard/metrics').then((res) => res.json()).then(setMetrics).catch(() => {});
    } else if (activeTab === 'leaves') {
      fetchLeaves();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    fetch('/api/attendance/regularisations')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCorrectionsCount(Array.isArray(data) ? data.filter((r: any) => r.status === 'Pending').length : 0))
      .catch(() => {});
  }, []);

  const pendingLeaves = leavesData.filter((l) => l.status === 'Pending').length;
  const pendingClaims = (props.claims || []).filter((c) => c.status === 'Submitted').length;
  const badgeFor = (key: Tab) =>
    key === 'leaves' ? pendingLeaves : key === 'reimbursements' ? pendingClaims : key === 'attendance' ? correctionsCount : 0;

  const subBtn = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-bold transition-all ${active ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <p className="text-[11px] font-bold text-orange-500 uppercase tracking-widest">Administrator · Full Access</p>
        <h2 className="text-3xl font-bold text-[#021934] tracking-tight mt-0.5">Administration Console</h2>
        <p className="text-sm text-slate-500 mt-1">Every operational and governance control, in one place.</p>
      </div>

      {/* Single tab row */}
      <div className="border-b border-slate-200 flex gap-6 overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        {TABS.map((t) => {
          const active = activeTab === t.key;
          const badge = badgeFor(t.key);
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-4 flex items-center gap-1.5 text-sm font-bold transition-all relative ${active ? 'text-[#021934]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
              {badge > 0 && (
                <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{badge}</span>
              )}
              {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>}
            </button>
          );
        })}
      </div>

      {/* --- Sections (each is a real feature component) --- */}

      {activeTab === 'overview' && (
        metrics ? (
          <OverviewTab
            metrics={metrics}
            resignationsToProcess={resignationsToProcess}
            onUpdateEmployee={props.onUpdateEmployee}
            onShowLiveAttendance={() => setShowLiveAttendance(true)}
            showPunchClock={false}
          />
        ) : (
          <div className="text-center py-16"><span className="material-symbols-outlined animate-spin text-slate-300 text-[32px]">sync</span></div>
        )
      )}

      {activeTab === 'employees' && (
        <EmployeeDirectory
          employeesList={props.employeesList}
          onAddEmployee={() => setShowAddEmployeeModal(true)}
          onEditEmployee={(emp) => setEditingEmployee(emp)}
          onDeleteEmployee={props.onDeleteEmployee}
        />
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit gap-1">
            <button onClick={() => setAttendanceSubTab('records')} className={subBtn(attendanceSubTab === 'records')}>Attendance Records</button>
            <button onClick={() => setAttendanceSubTab('corrections')} className={subBtn(attendanceSubTab === 'corrections')}>
              Corrections
              {correctionsCount > 0 && <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{correctionsCount}</span>}
            </button>
          </div>
          {attendanceSubTab === 'records' && (
            <DetailedAttendanceView
              penaltiesPanel={<PenaltiesPanel triggerToast={props.triggerToast} onCountChange={setPenaltiesCount} />}
              penaltiesCount={penaltiesCount}
            />
          )}
          {attendanceSubTab === 'corrections' && (
            <RegularisationsTab triggerToast={props.triggerToast} onCountChange={setCorrectionsCount} />
          )}
        </div>
      )}

      {activeTab === 'leaves' && (
        <LeavesTab leavesData={leavesData} fetchLeaves={fetchLeaves} triggerToast={props.triggerToast} />
      )}

      {activeTab === 'holidays' && <HolidaysTab triggerToast={props.triggerToast} />}

      {activeTab === 'payroll' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-end">
            <PayrollGenerationControl onRunPayroll={props.onRunPayroll} triggerToast={props.triggerToast} />
          </div>
          <PayslipManagementSection payslips={props.payslips} triggerToast={props.triggerToast} onSaved={props.onRefresh} />
        </div>
      )}

      {activeTab === 'reimbursements' && (
        <ClaimsSection
          claims={props.claims}
          onUpdateClaimStatus={props.onUpdateClaimStatus}
          onPayClaim={props.onPayClaim}
          triggerToast={props.triggerToast}
        />
      )}

      {activeTab === 'loans' && <LoansManager triggerToast={props.triggerToast} />}

      {activeTab === 'governance' && (
        <SuperAdminDashboard
          policy={props.policy}
          guardrails={props.guardrails}
          auditLogs={props.auditLogs}
          onUpdatePolicy={props.onUpdatePolicy}
          onUpdateGuardrail={props.onUpdateGuardrail}
          onAddAuditLog={props.onAddAuditLog}
          triggerToast={props.triggerToast}
        />
      )}

      {/* --- Overlays / modals --- */}
      {showLiveAttendance && <DailyAttendanceList onClose={() => setShowLiveAttendance(false)} />}
      {showAddEmployeeModal && <AddEmployeeModal onClose={() => setShowAddEmployeeModal(false)} triggerToast={props.triggerToast} />}
      {editingEmployee && (
        <EmployeeEditModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={async (data: any) => {
            await props.onUpdateEmployee(editingEmployee.id, data);
            setEditingEmployee(null);
          }}
        />
      )}
    </div>
  );
}
