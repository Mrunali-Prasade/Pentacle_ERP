import React, { useState, useEffect } from 'react';
import { ReimbursementClaim } from '../../types';
import DailyAttendanceList from '../attendance/DailyAttendanceList';
import PentacleReimbursementSlip from '../reimbursements/PentacleReimbursementSlip';
import { DetailedAttendanceView } from '../attendance/DetailedAttendanceView';
import { EmployeeEditModal } from '../employees/EmployeeEditModal';
import EmployeeDirectory from '../employees/EmployeeDirectory';
import OverviewTab from './admin-hr/OverviewTab';
import HolidaysTab from './admin-hr/HolidaysTab';
import LeavesTab from './admin-hr/LeavesTab';
import RegularisationsTab from './admin-hr/RegularisationsTab';
import PenaltiesPanel from './admin-hr/PenaltiesPanel';
import ReimbursementsTab from './admin-hr/ReimbursementsTab';
import AddEmployeeModal from './admin-hr/AddEmployeeModal';
import LoansManager from '../shared/LoansManager';

interface AdminHRDashboardProps {
  claims: ReimbursementClaim[];
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onUpdateEmployee: (employeeId: string, data: any) => Promise<void>;
  onDeleteEmployee: (employeeId: string) => void;
  employeesList: any[];
  // Some call sites pass a severity hint as a second argument; it is currently ignored.
  triggerToast: (message: string, variant?: string) => void;
}

export default function AdminHRDashboard({
  claims,
  onUpdateClaimStatus,
  onUpdateEmployee,
  onDeleteEmployee,
  employeesList,
  triggerToast
}: AdminHRDashboardProps) {
  const [showSlipClaim, setShowSlipClaim] = useState<ReimbursementClaim | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'directory' | 'holidays' | 'leaves' | 'finance'>('overview');
  const [financeSubTab, setFinanceSubTab] = useState<'reimbursements' | 'loans'>('reimbursements');
  const [attendanceSubTab, setAttendanceSubTab] = useState<'records' | 'corrections'>('records');
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [leavesData, setLeavesData] = useState<any[]>([]);
  const [penaltiesCount, setPenaltiesCount] = useState(0);
  const [correctionsCount, setCorrectionsCount] = useState(0);

  const [showLiveAttendance, setShowLiveAttendance] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const resignationsToProcess = employeesList ? employeesList.filter(e =>
    e.status === 'resignation_in_process' && e.exit_date && e.exit_date <= todayStr
  ) : [];

  const fetchLeaves = () => {
    fetch('/api/leaves/all')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load leave requests')))
      .then(data => setLeavesData(Array.isArray(data) ? data : []))
      .catch(e => {
        console.error(e);
        triggerToast('Could not load leave requests');
      });
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetch('/api/hr/dashboard/metrics')
        .then(res => res.json())
        .then(data => setMetrics(data));
    } else if (activeTab === 'leaves') {
      fetchLeaves();
    }
  }, [activeTab]);

  // Load the pending-corrections count once on mount so its badge is visible from the top nav
  // without opening the Attendance Sync tab. Kept in sync afterwards via RegularisationsTab.
  useEffect(() => {
    fetch('/api/attendance/regularisations')
      .then(res => res.ok ? res.json() : [])
      .then(data => setCorrectionsCount(Array.isArray(data) ? data.filter((r: any) => r.status === 'Pending').length : 0))
      .catch(() => {});
  }, []);

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
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-[#021934] tracking-tight">HR Administration Center</h2>
        <p className="text-sm text-slate-500 mt-1">Cross-reference employee attendance records, audit late compliance, and index reimbursement receipts.</p>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 flex gap-6 overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">

        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'overview'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Dashboard Overview
          {activeTab === 'overview' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('holidays')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'holidays'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Festival Holidays
          {activeTab === 'holidays' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('leaves')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'leaves'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Leave Requests
          {leavesData.filter(l => l.status === 'Pending').length > 0 && (
            <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {leavesData.filter(l => l.status === 'Pending').length}
            </span>
          )}
          {activeTab === 'leaves' && (
            <span className="absolute bottom-0 left-0 w-full h-[3px] bg-[#021934] rounded-t-md" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'attendance'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Attendance Sync
          {correctionsCount > 0 && (
            <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {correctionsCount}
            </span>
          )}
          {activeTab === 'attendance' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'directory'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Employee Directory
          {activeTab === 'directory' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'finance'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Finance
          {claims.filter(c => c.status === 'Submitted').length > 0 && (
            <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {claims.filter(c => c.status === 'Submitted').length}
            </span>
          )}
          {activeTab === 'finance' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
      </div>

      {/* Finance Tab: Reimbursements + Loans nested as sub-tabs */}
      {activeTab === 'finance' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit gap-1">
            <button
              onClick={() => setFinanceSubTab('reimbursements')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${financeSubTab === 'reimbursements' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Receipt Audit Queue
              {claims.filter(c => c.status === 'Submitted').length > 0 && (
                <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {claims.filter(c => c.status === 'Submitted').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setFinanceSubTab('loans')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${financeSubTab === 'loans' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Employee Loans
            </button>
          </div>

          {financeSubTab === 'reimbursements' && (
            <ReimbursementsTab
              claims={claims}
              onUpdateClaimStatus={onUpdateClaimStatus}
              onShowSlip={(claim) => setShowSlipClaim(claim)}
            />
          )}

          {financeSubTab === 'loans' && (
            <LoansManager triggerToast={triggerToast} />
          )}
        </div>
      )}

      {/* Leaves Tab */}
      {activeTab === 'leaves' && (
        <LeavesTab leavesData={leavesData} fetchLeaves={fetchLeaves} triggerToast={triggerToast} />
      )}

      {/* Holidays Tab */}
      {activeTab === 'holidays' && (
        <HolidaysTab triggerToast={triggerToast} />
      )}

      {/* Directory Tab */}
      {activeTab === 'directory' && (
        <EmployeeDirectory
          employeesList={employeesList}
          onAddEmployee={() => setShowAddEmployeeModal(true)}
          onEditEmployee={(emp) => setEditingEmployee(emp)}
          onDeleteEmployee={onDeleteEmployee}
        />
      )}

      {activeTab === 'overview' && metrics && (
        <OverviewTab
          metrics={metrics}
          resignationsToProcess={resignationsToProcess}
          onUpdateEmployee={onUpdateEmployee}
          onShowLiveAttendance={() => setShowLiveAttendance(true)}
        />
      )}

      {showLiveAttendance && <DailyAttendanceList onClose={() => setShowLiveAttendance(false)} />}

      {/* VIEW 1: Attendance Tab — attendance records + corrections nested as sub-tabs */}
      {activeTab === 'attendance' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit gap-1">
            <button
              onClick={() => setAttendanceSubTab('records')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${attendanceSubTab === 'records' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Attendance Records
            </button>
            <button
              onClick={() => setAttendanceSubTab('corrections')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${attendanceSubTab === 'corrections' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Corrections
              {correctionsCount > 0 && (
                <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{correctionsCount}</span>
              )}
            </button>
          </div>

          {attendanceSubTab === 'records' && (
            <DetailedAttendanceView
              penaltiesPanel={<PenaltiesPanel triggerToast={triggerToast} onCountChange={setPenaltiesCount} />}
              penaltiesCount={penaltiesCount}
            />
          )}
          {attendanceSubTab === 'corrections' && (
            <RegularisationsTab triggerToast={triggerToast} onCountChange={setCorrectionsCount} />
          )}
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmployeeModal && (
        <AddEmployeeModal onClose={() => setShowAddEmployeeModal(false)} triggerToast={triggerToast} />
      )}

      {/* Editing Employee Modal */}
      {editingEmployee && (
        <EmployeeEditModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={async (data) => {
            await onUpdateEmployee(editingEmployee.id, data);
            setEditingEmployee(null);
          }}
        />
      )}

    </div>
  );
}
