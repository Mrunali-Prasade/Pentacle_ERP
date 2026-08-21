import { PunchClock } from '../attendance/PunchClock';
import MyLateMarksSection from '../attendance/MyLateMarksSection';
import React, { useState, useEffect } from 'react';
import { Payslip, ReimbursementClaim, UserProfile } from '../../types';

interface EmployeeDashboardProps {
  user: UserProfile;
  payslips: Payslip[];
  claims: ReimbursementClaim[];
  onChangeView: (view: 'dashboard' | 'payslips' | 'reimbursements' | 'profile') => void;
  triggerToast: (message: string) => void;
}

export default function EmployeeDashboard({ user, payslips, claims, onChangeView, triggerToast }: EmployeeDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance'>('overview');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState<any>(null);
  
  const [leaveType, setLeaveType] = useState('Earned Leave');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);

  // --- Attendance correction (regularisation) requests ---
  const [myRegs, setMyRegs] = useState<any[]>([]);
  const [showRegModal, setShowRegModal] = useState(false);
  const [regDate, setRegDate] = useState('');
  const [regIn, setRegIn] = useState('');
  const [regOut, setRegOut] = useState('');
  const [regReason, setRegReason] = useState('');
  const fetchMyRegs = () => {
    fetch('/api/attendance/regularisations')
      .then(r => r.json())
      .then(d => setMyRegs(Array.isArray(d) ? d : []))
      .catch(() => setMyRegs([]));
  };
  useEffect(() => { fetchMyRegs(); }, []);
  const handleSubmitRegularisation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regDate || !regIn || !regOut || !regReason.trim()) { alert('Please fill in the date, in time, out time and a reason.'); return; }
    const res = await fetch('/api/attendance/regularise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: regDate, inTime: regIn, outTime: regOut, reason: regReason.trim() }),
    });
    if (res.ok) {
      triggerToast('Correction request submitted for HR approval');
      setShowRegModal(false); setRegDate(''); setRegIn(''); setRegOut(''); setRegReason('');
      fetchMyRegs();
    } else {
      const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to submit correction request');
    }
  };
  
  const fetchLeaves = () => {
    // Only store a properly-shaped leave object. A non-2xx response returns `{ error }`, which is
    // truthy — storing it would crash the render that reads leaveData.earned/casual. Fall back to
    // null (the loading/empty state) instead.
    fetch('/api/leaves/my')
      .then(res => (res.ok ? res.json() : null))
      .then(data => setLeaveData(data && data.earned ? data : null))
      .catch(() => setLeaveData(null));
  };
  
  useEffect(() => {
    fetchLeaves();
  }, []);
  
  const [showLeaveHistoryModal, setShowLeaveHistoryModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');

  const [showSignModal, setShowSignModal] = useState(false);
  const [isSigned, setIsSigned] = useState(false);

  // Filter user's claims
  const userClaims = claims.filter(c => c.employeeName === user.name);
  const pendingTotal = userClaims.filter(c => c.status === 'Admin-Verified' || c.status === 'Finance-Verified' || c.status === 'Approved-for-Payroll').reduce((acc, c) => acc + c.amount, 0);
  const approvedTotal = 0; // Keeping structure but grouping everything into pending until Paid
  const paidTotal = userClaims.filter(c => c.status === 'Paid').reduce((acc, c) => acc + c.amount, 0);

  // Find the most recent payslip
  const latestPayslip = payslips.length > 0 ? payslips[payslips.length - 1] : null;
  const netSalary = latestPayslip ? latestPayslip.amountToBank : 0;
  const grossPay = latestPayslip ? latestPayslip.grossAmount : 0;
  const deductions = latestPayslip ? latestPayslip.grossDeduction : 0;

  const handleRequestLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!leaveStartDate || (!isHalfDay && !leaveEndDate)) {
      alert('Please select required dates');
      return;
    }
    
    const start = new Date(leaveStartDate);
    const end = isHalfDay ? start : new Date(leaveEndDate);
    const days = isHalfDay ? 0.5 : Math.floor((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    
    if (days <= 0) {
      alert('End date must be at or after start date');
      return;
    }
    
    let certUrl = '';
    if (leaveType === 'Sick Leave' && days >= 3) {
      if (!certFile) {
        alert('Medical Certificate is required for Sick Leaves of 3 or more days.');
        return;
      }
      certUrl = '/uploads/med_cert_' + Date.now() + '.pdf';
    }

    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: leaveType,
          days: days,
          reason: leaveReason,
          fromDate: leaveStartDate,
          toDate: isHalfDay ? leaveStartDate : leaveEndDate,
          certificateUrl: certUrl
        })
      });
      
      if (res.ok) {
        fetchLeaves();
        setShowLeaveModal(false);
        triggerToast(`Leave request of ${days} day(s) submitted for approval`);
        setLeaveReason('');
        setLeaveStartDate('');
        setLeaveEndDate('');
        setCertFile(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit leave');
      }
    } catch(err: any) {
      console.error(err);
      alert('An error occurred while submitting: ' + err.message);
    }
  };

  const handleOpenTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowTicketModal(false);
    triggerToast(`Ticket submitted. Reference: #TKT-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  const handleSignTaxDocuments = () => {
    setIsSigned(true);
    setShowSignModal(false);
    triggerToast("Tax compliance documents digitally signed successfully.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#021934] tracking-tight">Welcome back, {user.name.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Here is your financial and work summary for {latestPayslip ? latestPayslip.payPeriod : 'the current period'}.</p>
        </div>

        <div className="flex flex-wrap bg-slate-200/50 p-1 rounded-xl w-full md:w-auto gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'attendance' ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            Attendance
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
      <>
      {/* Bento Grid Stats */}
      <div className="grid grid-cols-12 gap-6">
        
        
          {/* Punch Clock */}
          <div className="col-span-12 lg:col-span-4">
            <PunchClock />
          </div>
  {/* Net Salary Card */}
        <div className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Net Salary ({latestPayslip ? latestPayslip.payPeriod : 'Current'})</h3>
                <div className="text-4xl font-extrabold text-[#021934]">₹{netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-orange-50 text-orange-600 p-3 rounded-xl border border-orange-100">
                <span className="material-symbols-outlined text-[24px]">account_balance_wallet</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Gross Pay</span>
                <span className="text-slate-800 font-bold font-mono">₹{grossPay.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Deductions (Tax & Benefits)</span>
                <span className="text-red-600 font-bold font-mono">-₹{deductions.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => onChangeView('payslips')}
            className="w-full mt-6 bg-[#021934] hover:bg-slate-800 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-md"
          >
            View Breakdown
          </button>
        </div>

          {/* Leave Balance Card */}
          <div 
            onClick={() => setShowLeaveHistoryModal(true)}
            className="col-span-12 md:col-span-6 lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden cursor-pointer hover:border-orange-200 hover:shadow-sm transition-all group"
          >
          <div className="w-full flex justify-between items-center mb-4 relative z-10">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Leave Balances</h3>
          </div>
          
          {leaveData ? (
            <div className="space-y-4 w-full">
              {/* Earned Leave */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-600">Earned (Paid)</span>
                  <span className="text-xs font-black text-[#021934]">18 Total / Year</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>Accrued: <strong className="text-green-600">{leaveData.earned?.accrued ?? 0}</strong></span>
                  <span>Used: {leaveData.earned?.used ?? 0}</span>
                  <span>Can Use Now: <strong className="text-[#021934]">{leaveData.earned?.balance ?? 0}</strong></span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, ((leaveData.earned?.used ?? 0) / 18) * 100)}%` }}></div>
                </div>
              </div>
              
              {/* Casual/Sick Leave */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-600">Casual/Sick</span>
                  <span className="text-xs font-black text-[#021934]">{leaveData.casual?.balance ?? 0} Available</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>Limit: {leaveData.casual?.limit ?? 0}</span>
                  <span>Used: {leaveData.casual?.used ?? 0}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
                  <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${((leaveData.casual?.used ?? 0) / (leaveData.casual?.limit || 1)) * 100}%` }}></div>
                </div>
                {leaveData.casual?.isProbation && (
                  <p className="text-[10px] text-orange-600 font-medium mt-1 leading-tight">Probation: Max 1 day/mo. Exceeding is unpaid.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-pulse flex flex-col items-center justify-center h-full space-y-4 w-full">
               <div className="h-10 bg-slate-200 rounded w-full"></div>
               <div className="h-10 bg-slate-200 rounded w-full"></div>
            </div>
          )}
          
          <button 
            onClick={(e) => { e.stopPropagation(); setShowLeaveModal(true); }}
            className="w-full bg-slate-100 hover:bg-slate-200 text-[#021934] py-2.5 rounded-xl text-sm font-bold transition-colors mt-4 relative z-10"
          >
            Request Leave
          </button>
        </div>

        {/* Reimbursements Tracker */}
        <div className="col-span-12 md:col-span-6 lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Reimbursements</h3>
            <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider">This Month</span>
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px] text-slate-400">pending_actions</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-[#021934]">Pending</p>
                  <p className="text-sm font-bold font-mono text-slate-600">₹{pendingTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <p className="text-xs text-slate-400 font-medium">Claims submitted</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0 border border-green-100">
                <span className="material-symbols-outlined text-[20px] text-green-600">check_circle</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-[#021934]">Approved</p>
                  <p className="text-sm font-bold font-mono text-green-600">₹{approvedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <p className="text-xs text-slate-400 font-medium">Ready for payment</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                <span className="material-symbols-outlined text-[20px] text-blue-600">payments</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-[#021934]">Paid</p>
                  <p className="text-sm font-bold font-mono text-blue-600">₹{paidTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <p className="text-xs text-slate-400 font-medium">Processed this period</p>
              </div>
            </div>
          </div>

          <button 
            onClick={() => onChangeView('reimbursements')}
            className="w-full mt-6 py-2.5 border border-slate-200 hover:bg-slate-50 text-[#021934] rounded-xl text-xs font-bold transition-all"
          >
            Reimbursement History
          </button>
        </div>
      </div>
      </>
      )}

      {activeTab === 'attendance' && (
      <>
      {/* My Late/Early Marks Section */}
      <MyLateMarksSection />

      {/* Attendance Correction Requests */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-[#021934]">Attendance Corrections</h3>
            <p className="text-xs text-slate-500 mt-0.5">Forgot to punch, or a day looks wrong? Ask HR to fix it.</p>
          </div>
          <button onClick={() => setShowRegModal(true)} className="bg-[#021934] hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shrink-0">Request a Correction</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">In / Out</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myRegs.length > 0 ? myRegs.map((r, i) => (
                <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-700">{r.date}</td>
                  <td className="px-6 py-3 font-mono text-slate-600">{r.in_time || '—'} → {r.out_time || '—'}</td>
                  <td className="px-6 py-3 text-slate-600 max-w-xs">{r.reason}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${r.status === 'Approved' ? 'bg-green-100 text-green-700' : r.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{r.status}</span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm">No correction requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Correction Modal */}
      {showRegModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
              <h3 className="font-black text-[#021934] text-lg">Request Attendance Correction</h3>
              <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleSubmitRegularisation}>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Date</label>
                <input type="date" value={regDate} min={user.joinDate ? user.joinDate.slice(0, 10) : undefined} max={new Date().toISOString().split('T')[0]} onChange={e => setRegDate(e.target.value)} required className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-[#021934]/20" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Correct Check-In</label>
                  <input type="time" value={regIn} onChange={e => setRegIn(e.target.value)} required className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-[#021934]/20" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Correct Check-Out</label>
                  <input type="time" value={regOut} onChange={e => setRegOut(e.target.value)} required className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-[#021934]/20" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Reason</label>
                <textarea value={regReason} onChange={e => setRegReason(e.target.value)} required rows={3} placeholder="e.g. Forgot to punch in — was on a client visit." className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-[#021934]/20" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowRegModal(false)} className="flex-grow py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="flex-grow py-2.5 bg-[#021934] hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}

      {activeTab === 'overview' && (
      <>
      {/* Bottom Action Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Support Ticket Panel */}
        <div className="bg-slate-50 border border-dashed border-slate-300 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-[#021934]">Need assistance?</h4>
            <p className="text-sm text-slate-500 mt-1">Our HR support team is available Mon-Fri.</p>
          </div>
          <button 
            onClick={() => setShowTicketModal(true)}
            className="px-5 py-2.5 bg-[#021934] hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-xs shrink-0 transition-colors"
          >
            Open Ticket
          </button>
        </div>

        {/* Profile Update Panel */}
        <div className={`p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-300 border ${
          isSigned 
            ? 'bg-slate-100 border-slate-200 text-slate-400' 
            : 'bg-orange-50 border-orange-100 text-orange-950'
        }`}>
          <div>
            <h4 className="text-base font-bold">Profile Update</h4>
            <p className="text-sm opacity-80 mt-1">
              {isSigned ? 'Tax documents signed and processed.' : 'Tax documents require your signature.'}
            </p>
          </div>
          <button 
            onClick={() => !isSigned && setShowSignModal(true)}
            disabled={isSigned}
            className={`px-5 py-2.5 rounded-lg font-semibold text-xs shadow-md shrink-0 transition-all ${
              isSigned 
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' 
                : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/10'
            }`}
          >
            {isSigned ? 'Completed' : 'Sign Now'}
          </button>
        </div>

      </div>
      </>
      )}

      {/* Leave Request Dialog Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Submit Leave Request</h3>
              <button onClick={() => setShowLeaveModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            
            <form className="p-6 space-y-4" onSubmit={handleRequestLeaveSubmit}>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Leave Type</label>
                <select 
                  value={leaveType} 
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none"
                >
                  <option>Casual Leave</option>
                  <option>Earned Leave</option>
                  <option>Sick Leave</option>
                  <option>Unpaid Leave (Loss of Pay)</option>
                </select>
              </div>

                <div className="flex items-center space-x-2 mb-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <input 
                    type="checkbox" 
                    id="halfDayToggle"
                    checked={isHalfDay}
                    onChange={(e) => setIsHalfDay(e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                  />
                  <label htmlFor="halfDayToggle" className="text-sm font-bold text-slate-700 cursor-pointer">
                    Request Half Day
                  </label>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">{isHalfDay ? 'Date' : 'From Date'}</label>
                    <input
                      type="date"
                      value={leaveStartDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setLeaveStartDate(e.target.value)}
                      className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none"
                    />
                  </div>
                  {!isHalfDay && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">To Date</label>
                      <input
                        type="date"
                        value={leaveEndDate}
                        min={leaveStartDate || new Date().toISOString().split('T')[0]}
                        onChange={(e) => setLeaveEndDate(e.target.value)}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none"
                      />
                    </div>
                  )}
                </div>
                
                {leaveType === 'Sick Leave' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Medical Certificate (If &ge; 3 Days)</label>
                    <input 
                      type="file" 
                      onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                      className="w-full border border-slate-200 p-2 rounded-lg text-sm bg-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                    />
                  </div>
                )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Reason / Details</label>
                <textarea 
                  required
                  placeholder="Explain why you are requesting leave..."
                  rows={3}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-[#021934] hover:bg-slate-800 text-white py-3 rounded-lg text-sm font-semibold transition-colors shadow-md"
              >
                Submit Request
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Support Ticket Modal */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Open Support Ticket</h3>
              <button onClick={() => setShowTicketModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            
            <form className="p-6 space-y-4" onSubmit={handleOpenTicketSubmit}>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Subject</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g., Query regarding Oct Deductions"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-slate-500/20 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Query Description</label>
                <textarea 
                  required
                  placeholder="Please describe your payroll or HR issue in detail..."
                  rows={4}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-slate-500/20 outline-none"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-[#021934] hover:bg-slate-800 text-white py-3 rounded-lg text-sm font-semibold transition-colors shadow-md"
              >
                Submit Support Ticket
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tax Document Signature Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Digital Document Signature</h3>
              <button onClick={() => setShowSignModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <p className="text-sm text-slate-600 leading-relaxed">
                You are electronically signing the <strong className="text-[#021934]">Form 16 Tax Compliance Declarations</strong> for the financial year 2026. This electronic verification holds the same legal standing as a physical sign-off.
              </p>

              <div className="border border-slate-200 p-4 rounded-xl bg-slate-50">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Consent Terms</p>
                <div className="text-[11px] text-slate-500 leading-normal max-h-24 overflow-y-auto pr-2 scrollbar-hide">
                  By clicking "Consent & Sign", I certify that all declarations, tax deductions preferences, and investments proofs uploaded in my Pentacle Consultants employee profile are factual, accurate, and valid under internal and state audit compliance standards.
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setShowSignModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSignTaxDocuments}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-lg shadow-md transition-colors"
                >
                  Consent & Sign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave History Modal */}
      {showLeaveHistoryModal && leaveData && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center sticky top-0 z-10">
              <div>
                <h3 className="font-black text-[#021934] text-lg tracking-tight">Leave History</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Track the status and details of your leave requests.</p>
              </div>
              <button onClick={() => setShowLeaveHistoryModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto overflow-x-auto bg-white flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/50 text-[10px] uppercase font-black text-slate-400 tracking-wider sticky top-0 z-10 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-xl">Type & Dates</th>
                    <th className="px-6 py-4">Total Days</th>
                    <th className="px-6 py-4">Paid / LOP</th>
                    <th className="px-6 py-4 rounded-tr-xl">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {leaveData.requests && leaveData.requests.length > 0 ? leaveData.requests.map((l: any) => (
                    <tr key={l.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-700">{l.type}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{l.from_date} <span className="text-slate-300">to</span> {l.to_date}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">{l.days} Day(s)</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 items-center">
                          {l.paid_days > 0 && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md">{l.paid_days} Paid</span>}
                          {l.unpaid_days > 0 && <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">{l.unpaid_days} LOP</span>}
                          {l.paid_days === 0 && l.unpaid_days === 0 && <span className="text-xs text-slate-400">Pending calculation</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          l.status === 'Approved' ? 'bg-green-100 text-green-700' :
                          l.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500 font-medium">
                        No leave requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end sticky bottom-0">
              <button 
                onClick={() => setShowLeaveHistoryModal(false)}
                className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-lg transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
