import { useState, useEffect } from 'react';
import { ReimbursementClaim, Payslip } from '../../types';
import PentacleReimbursementSlip from '../reimbursements/PentacleReimbursementSlip';
import EmployeeDirectory from '../employees/EmployeeDirectory';
import OverviewTab from './cfo/OverviewTab';
import ReimbursementTab from './cfo/ReimbursementTab';
import PenaltiesTab from './cfo/PenaltiesTab';
import RegularisationsTab from './admin-hr/RegularisationsTab';

interface CFODashboardProps {
  payslips: Payslip[];
  claims: ReimbursementClaim[];
  employeesList?: any[];
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  // Some call sites pass a severity hint as a second argument; it is currently ignored.
  triggerToast: (message: string, variant?: string) => void;
}

export default function CFODashboard({ payslips = [], claims, employeesList = [], onUpdateClaimStatus, triggerToast }: CFODashboardProps) {

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [penaltiesSubTab, setPenaltiesSubTab] = useState<'penalties' | 'corrections'>('penalties');
  const [correctionsCount, setCorrectionsCount] = useState(0);
  useEffect(() => {
    fetch('/api/attendance/regularisations')
      .then(res => res.ok ? res.json() : [])
      .then(data => setCorrectionsCount(Array.isArray(data) ? data.filter((r: any) => r.status === 'Pending').length : 0))
      .catch(() => {});
  }, []);
  const [showSlipClaim, setShowSlipClaim] = useState<ReimbursementClaim | null>(null);
  const pendingCfoCount = claims.filter(c => c.status === 'Finance-Verified').length;

  if (showSlipClaim) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col md:flex-row overflow-hidden animate-fade-in print:bg-white print:block">
        <div className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="min-h-full p-4 md:p-8 flex items-start justify-center print:p-0">
            <div className="w-full max-w-4xl relative">
              <div className="flex-1 flex flex-col bg-white print:p-0 p-4 shadow-2xl">
                <PentacleReimbursementSlip claim={showSlipClaim} user={{
                  name: showSlipClaim.employeeName,
                  employeeId: 'N/A', // CFO might need full user object in future
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

  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  greeting += ', CFO';
  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Header and Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-3xl font-bold text-[#021934] tracking-tight">{greeting}</h2>
        </div>

        <div className="flex flex-wrap bg-slate-200/50 p-1 rounded-xl w-full xl:w-auto gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            Financial Overview
          </button>
          <button
            onClick={() => setActiveTab('reimbursement')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'reimbursement' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            Reimbursement
            {pendingCfoCount > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {pendingCfoCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'directory' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            Employee Directory
          </button>
          <button
            onClick={() => setActiveTab('penalties')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'penalties' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            Attendance Sync
            {correctionsCount > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{correctionsCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Read-only: the CFO role is not authorised by PUT /api/admin/employees/:id
          (admin_hr / super_admin only), so editing here could only ever fail. */}
      {activeTab === 'directory' && (
        <EmployeeDirectory
          employeesList={employeesList}
          readOnly={true}
        />
      )}

      {activeTab === 'overview' && (
        <OverviewTab />
      )}

      {activeTab === 'reimbursement' && (
        <ReimbursementTab
          claims={claims}
          onUpdateClaimStatus={onUpdateClaimStatus}
          onShowSlip={(claim) => setShowSlipClaim(claim)}
          triggerToast={triggerToast}
        />
      )}

      {activeTab === 'penalties' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit gap-1">
            <button
              onClick={() => setPenaltiesSubTab('penalties')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${penaltiesSubTab === 'penalties' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Penalties
            </button>
            <button
              onClick={() => setPenaltiesSubTab('corrections')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${penaltiesSubTab === 'corrections' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Corrections
              {correctionsCount > 0 && (
                <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{correctionsCount}</span>
              )}
            </button>
          </div>
          {penaltiesSubTab === 'penalties' && <PenaltiesTab triggerToast={triggerToast} />}
          {penaltiesSubTab === 'corrections' && <RegularisationsTab triggerToast={triggerToast} onCountChange={setCorrectionsCount} />}
        </div>
      )}
    </div>
  );
}
