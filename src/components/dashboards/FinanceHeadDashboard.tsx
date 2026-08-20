import { PunchClock } from '../attendance/PunchClock';
import React, { useState, useEffect } from 'react';
import { ReimbursementClaim, Payslip } from '../../types';
import PentacleReimbursementSlip from '../reimbursements/PentacleReimbursementSlip';
import PayslipManagementSection from './finance-head/PayslipManagementSection';
import ClaimsSection from './finance-head/ClaimsSection';
import PayrollGenerationControl from './finance-head/PayrollGenerationControl';
import LoansManager from '../shared/LoansManager';
import MaskedAmount from '../shared/MaskedAmount';

interface FinanceHeadDashboardProps {
  payslips: Payslip[];
  claims: ReimbursementClaim[];
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onPayClaim: (claimId: string, proofFileName: string, proofFileData: string) => void;
  onRunPayroll: (month: string) => void;
  triggerToast: (message: string) => void;
}

export default function FinanceHeadDashboard({
  payslips,
  claims,
  onUpdateClaimStatus,
  onPayClaim,
  onRunPayroll,
  triggerToast
}: FinanceHeadDashboardProps) {
  const [showSlipClaim, setShowSlipClaim] = useState<ReimbursementClaim | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'claims' | 'payslips' | 'loans'>('overview');

  // Calculate dynamic totals from payslips
  const totalGross = payslips.reduce((sum, p) => sum + (p.grossAmount || 0), 0);
  const totalTax = payslips.reduce((sum, p) => sum + (p.incomeTax || 0) + (p.professionalTax || 0), 0);
  const totalPF = payslips.reduce((sum, p) => sum + (p.providentFund || 0) + (p.employerPf || 0) + (p.pension || 0), 0);
  const totalNet = payslips.reduce((sum, p) => sum + (p.amountToBank || 0), 0);

  // Salary estimate from employee salary structures (used when no payslips exist)
  const [salarySummary, setSalarySummary] = useState<{ totalSalary: number, count: number } | null>(null);
  useEffect(() => {
    fetch('/api/admin/employees').then(r => r.ok ? r.json() : []).then((emps: any[]) => {
      const active = emps.filter(e => e.status !== 'resigned' && e.status !== 'rejected');
      const total = active.reduce((sum, e) => sum + (e.monthlySalary || 0), 0);
      setSalarySummary({ totalSalary: total, count: active.length });
    }).catch(() => {});
  }, []);

  const displayGross = totalGross > 0 ? totalGross : (salarySummary?.totalSalary || 0);
  const displayNet = totalNet > 0 ? totalNet : (salarySummary ? salarySummary.totalSalary * 0.85 : 0); // estimate after deductions
  const displayTax = totalTax > 0 ? totalTax : (salarySummary ? salarySummary.totalSalary * 0.05 : 0);
  const displayPF = totalPF > 0 ? totalPF : (salarySummary ? salarySummary.totalSalary * 0.10 : 0);
  const isEstimate = totalGross === 0;

  // Leave request state
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState<any>(null);
  const [leaveType, setLeaveType] = useState('Earned Leave');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const fetchLeaves = () => {
    fetch('/api/leaves/my').then(res => res.json()).then(data => {
      setLeaveData(data);
    }).catch(() => {});
  };

  const handleRequestLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStartDate) return;
    const start = new Date(leaveStartDate);
    const end = isHalfDay ? start : (leaveEndDate ? new Date(leaveEndDate) : start);
    const days = isHalfDay ? 0.5 : Math.floor((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: leaveType, days, reason: leaveReason,
          fromDate: leaveStartDate,
          toDate: isHalfDay ? leaveStartDate : (leaveEndDate || leaveStartDate)
        })
      });
      if (res.ok) {
        triggerToast('Leave request submitted successfully!');
        fetchLeaves();
        setShowLeaveModal(false);
        setLeaveReason('');
        setLeaveStartDate('');
        setLeaveEndDate('');
      } else {
        const err = await res.json();
        triggerToast('Error: ' + (err.error || 'Failed to submit leave'));
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchLeaves(); }, []);

  const pendingClaimsCount = claims.filter(c => c.status === 'Admin-Verified').length;
  const awaitingCfoCount = claims.filter(c => c.status === 'Finance-Verified').length;
  // CFO-approved claims that now need Finance to pay & generate the slip.
  const readyToPayCount = claims.filter(c => c.status === 'Approved-for-Payroll').length;
  // Tab badge covers everything Finance can act on right now: claims to verify, claims stuck
  // waiting on the CFO that Finance could choose to override, and CFO-approved claims ready to
  // be paid (so the badge ticks up the moment the CFO approves — no need to hunt in History).
  const claimsNeedingAttentionCount = pendingClaimsCount + awaitingCfoCount + readyToPayCount;

  const [revealedCards, setRevealedCards] = useState<Set<string>>(new Set());
  const toggleReveal = (key: string) => {
    setRevealedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (showSlipClaim) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col md:flex-row overflow-hidden animate-fade-in print:bg-white print:block">
        <div className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="min-h-full p-4 md:p-8 flex items-start justify-center print:p-0">
            <div className="w-full max-w-4xl relative">
              <div className="flex-1 flex flex-col bg-white print:p-0 p-4 shadow-2xl">
                <PentacleReimbursementSlip claim={showSlipClaim} user={{
                  name: showSlipClaim.employeeName,
                  employeeId: 'N/A', // Accounts might need full user object in future
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#021934] tracking-tight">Finance Head Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">Review draft payroll summaries, execute salary slips batch generation, and audit over-limit expense claims.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLeaveModal(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm px-5 py-2.5 rounded-lg border border-slate-200 shadow-sm transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px] text-emerald-600">event_available</span>
            Request Leave
          </button>
          <PayrollGenerationControl onRunPayroll={onRunPayroll} triggerToast={triggerToast} />
        </div>
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
          onClick={() => setActiveTab('claims')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'claims'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Reimbursement Claims
          {claimsNeedingAttentionCount > 0 && (
            <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {claimsNeedingAttentionCount}
            </span>
          )}
          {activeTab === 'claims' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('payslips')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'payslips'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Payslip Management
          {activeTab === 'payslips' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'loans'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Employee Loans
          {activeTab === 'loans' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Monthly Salary Expense</p>
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600 text-[18px]">payments</span>
                </div>
              </div>
              <MaskedAmount
                revealed={revealedCards.has('grossExpense')}
                onToggle={() => toggleReveal('grossExpense')}
                value={`₹${displayGross.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              />
              <p className="text-xs text-slate-400 mt-1">{salarySummary?.count || 0} active employees</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Reimbursements</p>
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-orange-600 text-[18px]">receipt_long</span>
                </div>
              </div>
              <MaskedAmount
                revealed={revealedCards.has('totalReimbursements')}
                onToggle={() => toggleReveal('totalReimbursements')}
                value={`₹${claims.reduce((s, c) => s + (c.amount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              />
              <p className="text-xs text-slate-400 mt-1">{claims.length} total claims</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Verification</p>
                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600 text-[18px]">pending_actions</span>
                </div>
              </div>
              <MaskedAmount
                revealed={revealedCards.has('pendingVerification')}
                onToggle={() => toggleReveal('pendingVerification')}
                value={`₹${claims.filter(c => c.status === 'Admin-Verified').reduce((s, c) => s + (c.amount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              />
              <p className="text-xs text-amber-600 font-semibold mt-1">{pendingClaimsCount} claims awaiting action</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Paid Out (Total)</p>
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
                </div>
              </div>
              <MaskedAmount
                revealed={revealedCards.has('paidOut')}
                onToggle={() => toggleReveal('paidOut')}
                value={`₹${claims.filter(c => c.status === 'Paid').reduce((s, c) => s + (c.amount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              />
              <p className="text-xs text-emerald-600 font-semibold mt-1">{claims.filter(c => c.status === 'Paid').length} claims settled</p>
            </div>
          </div>

          {/* Leave Balance + Punch Clock */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Leave Balance Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">Your Leave Balance</h3>
                <button onClick={() => setShowLeaveModal(true)} className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Request Leave
                </button>
              </div>
              {leaveData ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-emerald-50 rounded-xl p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Earned Leave</p>
                      <p className="text-xs text-slate-400 mt-0.5">Used: {leaveData.earned?.used || 0} / Accrued: {leaveData.earned?.accrued || 0}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-3xl font-black ${(leaveData.earned?.balance || 0) > 3 ? 'text-emerald-600' : (leaveData.earned?.balance || 0) > 0 ? 'text-amber-500' : 'text-red-500'}`}>{leaveData.earned?.balance || 0}</span>
                      <p className="text-xs text-slate-400">remaining</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-blue-50 rounded-xl p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Casual / Sick Leave</p>
                      <p className="text-xs text-slate-400 mt-0.5">Used: {leaveData.casual?.used || 0} / Limit: {leaveData.casual?.limit || 8}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-3xl font-black ${(leaveData.casual?.balance || 0) > 3 ? 'text-blue-600' : (leaveData.casual?.balance || 0) > 0 ? 'text-amber-500' : 'text-red-500'}`}>{leaveData.casual?.balance || 0}</span>
                      <p className="text-xs text-slate-400">remaining</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                  <span className="material-symbols-outlined text-slate-200 text-[40px]">beach_access</span>
                  <p className="text-sm text-slate-400 mt-2">Loading leave balance...</p>
                </div>
              )}
              {leaveData?.requests && leaveData.requests.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Recent Requests</p>
                  {leaveData.requests.slice(0, 3).map((r: any) => (
                    <div key={r.id} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{r.type} — {r.days} day{r.days !== 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-slate-400">{r.from_date} to {r.to_date}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : r.status === 'Rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Punch Clock */}
            <PunchClock userRole="finance_head" />

          </div>
        </div>
      )}

      {activeTab === 'claims' && (
        <ClaimsSection
          claims={claims}
          onUpdateClaimStatus={onUpdateClaimStatus}
          onPayClaim={onPayClaim}
          triggerToast={triggerToast}
        />
      )}

      {activeTab === 'payslips' && (
        <PayslipManagementSection payslips={payslips} triggerToast={triggerToast} />
      )}

      {activeTab === 'loans' && (
        <LoansManager triggerToast={triggerToast} />
      )}

      {/* Leave Request Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Request Leave</h3>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleRequestLeaveSubmit}>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Leave Type</label>
                <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option>Earned Leave</option>
                  <option>Sick Leave</option>
                  <option>Casual Leave</option>
                  <option>Unpaid Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">From Date</label>
                  <input type="date" required value={leaveStartDate} onChange={e => setLeaveStartDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                {!isHalfDay && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">To Date</label>
                    <input type="date" value={leaveEndDate} onChange={e => setLeaveEndDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isHalfDay} onChange={e => setIsHalfDay(e.target.checked)} className="rounded" />
                <span className="text-sm text-slate-600">Half Day</span>
              </label>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Reason</label>
                <textarea required value={leaveReason} onChange={e => setLeaveReason(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Please provide a reason for your leave request..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowLeaveModal(false)} className="flex-1 py-2.5 rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
