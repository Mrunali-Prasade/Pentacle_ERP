import { useEffect, useState } from 'react';
import { ReimbursementClaim } from '../../../types';
import ReimbursementsTab from '../admin-hr/ReimbursementsTab';
import LeavesTab from '../admin-hr/LeavesTab';
import PenaltiesPanel from '../admin-hr/PenaltiesPanel';
import ClaimsSection from '../finance-head/ClaimsSection';
import PentacleReimbursementSlip from '../../reimbursements/PentacleReimbursementSlip';
import EmployeeDirectoryTab from './EmployeeDirectoryTab';
import AttendanceToolsTab from './AttendanceToolsTab';
import PayrollToolsTab from './PayrollToolsTab';
import PolicyEditTab from './PolicyEditTab';
import AuditLogTab from './AuditLogTab';
import LoansManager from '../../shared/LoansManager';
import HolidaysTab from '../admin-hr/HolidaysTab';

interface ExtraAccessViewProps {
  permissions: string[];
  claims: ReimbursementClaim[];
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onPayClaim: (claimId: string, proofFileName: string, proofFileData: string) => void;
  onRunPayroll: (month: string) => void;
  triggerToast: (message: string, variant?: string) => void;
}

export default function ExtraAccessView({ permissions, claims, onUpdateClaimStatus, onPayClaim, onRunPayroll, triggerToast }: ExtraAccessViewProps) {
  const has = (key: string) => permissions.includes(key);

  const canReimbursements = has('reimbursements.approve') || has('reimbursements.pay');
  const canLeaves = has('leaves.approve');
  const canPenalties = has('penalties.approve');
  const canDirectory = has('employees.directory.view') || has('employees.create') || has('employees.edit') || has('employees.delete');
  const canLoans = has('loans.manage');
  const canAttendance = has('dashboard.metrics.view') || has('attendance.detailed.view') || has('attendance.timing.edit') || has('attendance.today.view') || has('attendance.history.export');
  const canPayroll = has('payroll.run') || has('payroll.lock.view') || has('payroll.lock.manage');
  const canPolicy = has('policy.edit');
  const canHolidays = has('holidays.manage');
  const canAuditLog = has('audit_logs.view');

  const tabs: { key: string; label: string }[] = [
    ...(canReimbursements ? [{ key: 'reimbursements', label: 'Reimbursements' }] : []),
    ...(canLeaves ? [{ key: 'leaves', label: 'Leave Requests' }] : []),
    ...(canPenalties ? [{ key: 'penalties', label: 'Attendance Penalties' }] : []),
    ...(canDirectory ? [{ key: 'directory', label: 'Employee Directory' }] : []),
    ...(canAttendance ? [{ key: 'attendance', label: 'Attendance Tools' }] : []),
    ...(canPayroll ? [{ key: 'payroll', label: 'Payroll' }] : []),
    ...(canLoans ? [{ key: 'loans', label: 'Loans' }] : []),
    ...(canPolicy ? [{ key: 'policy', label: 'System Policy' }] : []),
    ...(canHolidays ? [{ key: 'holidays', label: 'Holidays' }] : []),
    ...(canAuditLog ? [{ key: 'auditlog', label: 'Audit Trail' }] : []),
  ];

  const [activeTab, setActiveTab] = useState(tabs[0]?.key || '');
  const [leavesData, setLeavesData] = useState<any[]>([]);
  const [showSlipClaim, setShowSlipClaim] = useState<ReimbursementClaim | null>(null);

  const fetchLeaves = () => {
    fetch('/api/leaves/all')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load leave requests')))
      .then(data => setLeavesData(Array.isArray(data) ? data : []))
      .catch(() => triggerToast('Could not load leave requests'));
  };

  useEffect(() => {
    if (activeTab === 'leaves') fetchLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (tabs.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
        <span className="material-symbols-outlined text-slate-300 text-[48px]">lock_open</span>
        <p className="text-sm text-slate-400 font-medium mt-3">No extra access has been granted to your account yet.</p>
      </div>
    );
  }

  if (showSlipClaim) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col md:flex-row overflow-hidden animate-fade-in print:bg-white print:block">
        <div className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="min-h-full p-4 md:p-8 flex items-start justify-center print:p-0">
            <div className="w-full max-w-4xl relative">
              <div className="flex-1 flex flex-col bg-white print:p-0 p-4 shadow-2xl">
                <PentacleReimbursementSlip claim={showSlipClaim} user={{
                  name: showSlipClaim.employeeName,
                  employeeId: 'N/A',
                  designation: showSlipClaim.employeeRole,
                  department: 'N/A'
                }} />
              </div>
              <div className="mt-8 flex justify-end gap-3 print:hidden pb-12">
                <button
                  onClick={() => setShowSlipClaim(null)}
                  className="px-6 py-2.5 rounded-lg font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-6 py-2.5 rounded-lg font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">print</span>
                  Print Slip
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-black text-[#021934] tracking-tight">Extra Access</h2>
        <p className="text-sm text-slate-500 mt-1">Modules a Super Admin has granted to your account beyond your normal role.</p>
      </div>

      {tabs.length > 0 && (
        <div className="border-b border-slate-200 flex gap-6 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-4 text-sm font-bold transition-all relative ${activeTab === t.key ? 'text-[#021934]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {t.label}
              {activeTab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'reimbursements' && (
        <div className="space-y-8">
          {has('reimbursements.approve') && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Stage 1 — Initial verification (Submitted claims)</h3>
              <ReimbursementsTab claims={claims} onUpdateClaimStatus={onUpdateClaimStatus} onShowSlip={setShowSlipClaim} />
            </div>
          )}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Stage 2 &amp; 3 — Finance authorization and payment</h3>
            <ClaimsSection claims={claims} onUpdateClaimStatus={onUpdateClaimStatus} onPayClaim={onPayClaim} triggerToast={(m: string) => triggerToast(m)} />
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <LeavesTab leavesData={leavesData} fetchLeaves={fetchLeaves} triggerToast={triggerToast} />
      )}

      {activeTab === 'penalties' && (
        <PenaltiesPanel triggerToast={triggerToast} onCountChange={() => {}} />
      )}

      {activeTab === 'directory' && (
        <EmployeeDirectoryTab permissions={permissions} triggerToast={triggerToast} />
      )}

      {activeTab === 'attendance' && (
        <AttendanceToolsTab permissions={permissions} triggerToast={triggerToast} />
      )}

      {activeTab === 'payroll' && (
        <PayrollToolsTab onRunPayroll={onRunPayroll} triggerToast={(m: string) => triggerToast(m)} />
      )}

      {activeTab === 'loans' && (
        <LoansManager triggerToast={triggerToast} />
      )}

      {activeTab === 'policy' && (
        <PolicyEditTab triggerToast={triggerToast} />
      )}

      {activeTab === 'holidays' && (
        <HolidaysTab triggerToast={triggerToast} />
      )}

      {activeTab === 'auditlog' && (
        <AuditLogTab triggerToast={triggerToast} />
      )}
    </div>
  );
}
