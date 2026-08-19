import React, { useState } from 'react';
import { Payslip, ReimbursementClaim } from '../../types';
import PentaclePayslip from './PentaclePayslip';
import Pagination, { usePagination } from '../common/Pagination';
import MaskedAmount from '../shared/MaskedAmount';

interface PayslipsViewProps {
  payslips: Payslip[];
  employeeName: string;
  employeeId?: string;
  designation?: string;
  department?: string;
  triggerToast: (message: string) => void;
  claims?: ReimbursementClaim[];
  canEdit?: boolean;
}

export default function PayslipsView({
  payslips,
  employeeName,
  employeeId = 'PC-48293',
  designation = 'Senior Payroll Analyst',
  department = 'Finance & Strategy',
  triggerToast,
  claims = [],
  canEdit = false
}: PayslipsViewProps) {
  const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [currencyMode, setCurrencyMode] = useState<'INR' | 'USD'>('INR');
  const [editingPayslip, setEditingPayslip] = useState<any | null>(null);
  const [payslipEditForm, setPayslipEditForm] = useState<any>({});
  const [savingPayslip, setSavingPayslip] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleEditPayslip = (slip: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPayslip(slip);
    setPayslipEditForm({
      basicSalary: slip.basicSalary || 0,
      hra: slip.hra || 0,
      specialAllowance: slip.specialAllowance || 0,
      conveyanceAllowance: slip.conveyanceAllowance || 0,
      otherAllowance: slip.otherAllowance || 0,
      bonus: slip.bonus || 0,
      providentFund: slip.providentFund || 0,
      professionalTax: slip.professionalTax || 0,
      incomeTax: slip.incomeTax || 0,
      lopDeduction: slip.lopDeduction || 0,
      otherDeductions: slip.otherDeductions || 0,
    });
  };

  const handleSavePayslip = async () => {
    if (!editingPayslip) return;
    setSavingPayslip(true);
    try {
      const form = payslipEditForm;
      const grossAmount = parseFloat(form.basicSalary) + parseFloat(form.hra) + parseFloat(form.specialAllowance) + parseFloat(form.conveyanceAllowance) + parseFloat(form.otherAllowance) + parseFloat(form.bonus);
      const grossDeduction = parseFloat(form.providentFund) + parseFloat(form.professionalTax) + parseFloat(form.incomeTax) + parseFloat(form.lopDeduction) + parseFloat(form.otherDeductions);
      const netAmount = grossAmount - grossDeduction;
      const amountToBank = netAmount;
      const res = await fetch(`/api/payslips/${editingPayslip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, grossAmount, grossDeduction, netAmount, amountToBank })
      });
      if (res.ok) {
        triggerToast('Payslip updated successfully!');
        setEditingPayslip(null);
      } else {
        const err = await res.json();
        triggerToast('Error: ' + err.error);
      }
    } finally {
      setSavingPayslip(false);
    }
  };

  const filteredSlips = payslips.filter(slip => {
    let yearMatch = true;
    if (filterYear !== 'all') {
      yearMatch = slip.payPeriod.includes(filterYear);
    }
    
    let monthMatch = true;
    if (filterMonth !== 'all') {
      monthMatch = slip.payPeriod.endsWith(`-${filterMonth}`) || slip.payPeriod.includes(filterMonth);
    }
    
    return yearMatch && monthMatch;
  });
  const paged = usePagination(filteredSlips, 15);

  const handleDownloadPDF = (slip: Payslip, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop row click
    setSelectedSlip(slip);
  };

  const handlePrintSlip = () => {
    triggerToast('Document sent to primary printer spool');
  };

  // Convert number to words helper for Net Payable (mocked for high fidelity)
  const getAmountInWords = (amount: number, currency: 'INR' | 'USD') => {
    if (currency === 'INR') {
      if (amount === 84200) return 'Eighty-Four Thousand Two Hundred Rupees Only';
      return 'One Lakh Twelve Thousand Rupees Only';
    } else {
      if (amount === 5840) return 'Five Thousand Eight Hundred and Forty Dollars Only';
      return 'Seven Thousand Two Hundred Dollars Only';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-[#021934] tracking-tight">Payslips History</h2>
          <p className="text-sm text-slate-500 mt-1">Access and download your encrypted monthly salary disbursements.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setCurrencyMode(prev => prev === 'INR' ? 'USD' : 'INR');
              triggerToast(`Switched currency preview mode to ${currencyMode === 'INR' ? 'INR' : 'INR'}`);
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
          >
            Show in {currencyMode === 'INR' ? 'INR (₹)' : 'INR (₹)'}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-slate-400 font-semibold text-xs uppercase tracking-wider mb-1">Net Pay (Last Month)</p>
          <MaskedAmount
            revealed={revealedKeys.has('netPay')}
            onToggle={() => toggleReveal('netPay')}
            className="text-2xl font-black text-[#021934]"
            value={`₹${(filteredSlips.length > 0 ? filteredSlips[filteredSlips.length - 1].netAmount : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-slate-400 font-semibold text-xs uppercase tracking-wider mb-1">Tax Deducted (YTD)</p>
          <MaskedAmount
            revealed={revealedKeys.has('taxDeducted')}
            onToggle={() => toggleReveal('taxDeducted')}
            className="text-2xl font-black text-orange-600"
            value={`₹${filteredSlips.reduce((sum, slip) => sum + (slip.incomeTax || 0) + (slip.professionalTax || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-slate-400 font-semibold text-xs uppercase tracking-wider mb-1">Total Earnings (YTD)</p>
          <MaskedAmount
            revealed={revealedKeys.has('totalEarnings')}
            onToggle={() => toggleReveal('totalEarnings')}
            className="text-2xl font-black text-[#021934]"
            value={`₹${filteredSlips.reduce((sum, slip) => sum + slip.grossAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-slate-400 font-semibold text-xs uppercase tracking-wider mb-1">Active Claims</p>
          <h3 className="text-2xl font-black text-blue-900 font-mono">
            {claims.filter(c => c.status !== 'Paid' && c.status !== 'Rejected').length.toString().padStart(2, '0')}
          </h3>
        </div>
      </div>

      {/* Payslips Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-[#021934]">Recent Payslips</h3>
          <div className="flex gap-3">
            <select 
              value={filterYear} 
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 focus:outline-none focus:border-[#021934] transition-colors bg-white cursor-pointer"
            >
              <option value="all">All Years</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>

            <select 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 focus:outline-none focus:border-[#021934] transition-colors bg-white cursor-pointer"
            >
              <option value="all">All Months</option>
              <option value="01">January</option>
              <option value="02">February</option>
              <option value="03">March</option>
              <option value="04">April</option>
              <option value="05">May</option>
              <option value="06">June</option>
              <option value="07">July</option>
              <option value="08">August</option>
              <option value="09">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-3.5">Employee</th>
                <th className="px-6 py-3.5">Month / Period</th>
                <th className="px-6 py-3.5">Gross Salary</th>
                <th className="px-6 py-3.5">Net Payable</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {paged.pageItems.map((slip) => {
                const isINR = slip.netAmount > 10000;
                // If slip is matching the preferred display, show it or adapt
                const displayCurrency = isINR ? '₹' : '₹';
                
                return (
                  <tr 
                    key={slip.id} 
                    onClick={() => setSelectedSlip(slip)}
                    className="hover:bg-slate-50 transition-all cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-bold text-[#021934]">
                      {slip.employeeName || employeeName}
                      <span className="text-xs font-normal text-slate-400 block mt-1">{slip.employeeId || employeeId}</span>
                    </td>
                    <td className="px-6 py-4 font-bold text-[#021934] group-hover:text-orange-600 transition-colors">
                      {slip.payPeriod}
                      <span className="text-xs font-normal text-slate-400 block mt-1">{slip.type || 'Salary'}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600" onClick={(e) => e.stopPropagation()}>
                      <MaskedAmount
                        revealed={revealedKeys.has(`gross-${slip.id}`)}
                        onToggle={() => toggleReveal(`gross-${slip.id}`)}
                        className="text-sm text-slate-600"
                        iconSize={14}
                        value={`${displayCurrency}${slip.grossAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      />
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-[#021934]" onClick={(e) => e.stopPropagation()}>
                      <MaskedAmount
                        revealed={revealedKeys.has(`net-${slip.id}`)}
                        onToggle={() => toggleReveal(`net-${slip.id}`)}
                        className="text-sm font-bold text-[#021934]"
                        iconSize={14}
                        value={`${displayCurrency}${slip.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      />
                    </td>
                    <td className="px-6 py-4">
                      {slip.status === 'draft' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Draft
                        </span>
                      ) : slip.status === 'locked' || slip.status === 'Processed' || slip.status === 'Generated' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          Generated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          {slip.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-3">
                        <button
                          onClick={(e) => handleDownloadPDF(slip, e)}
                          className="text-orange-600 font-bold text-xs inline-flex items-center gap-1 hover:underline"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span> View Payslip
                        </button>
                        {canEdit && (
                          <button
                            onClick={(e) => handleEditPayslip(slip, e)}
                            className="p-1.5 text-slate-400 hover:text-orange-600 bg-white border border-slate-200 hover:border-orange-200 shadow-sm rounded-lg transition-all"
                            title="Edit Payslip"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
      </div>

      {/* Salary Slip Document Preview Modal */}
      {selectedSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-xs overflow-y-auto scrollbar-hide">
          <div className="bg-white w-full max-w-4xl rounded-none shadow-2xl relative flex flex-col p-12 my-8 overflow-y-auto max-h-[90vh]">
            
            {/* Close Button */}
            <button 
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 transition-colors" 
              onClick={() => setSelectedSlip(null)}
            >
              <span className="material-symbols-outlined text-slate-700 text-[24px]">close</span>
            </button>

            {/* Document Border Block */}
            <div className="flex-1 flex flex-col bg-white print:p-0 p-4">
                <PentaclePayslip payslip={selectedSlip} user={{
                  name: selectedSlip.employeeName || employeeName,
                  employeeId: selectedSlip.employeeId || employeeId,
                  designation: selectedSlip.designation || designation,
                  department: selectedSlip.department || department,
                  panNumber: selectedSlip.panNumber,
                  uanNumber: selectedSlip.uanNumber,
                  bankName: selectedSlip.bankName,
                  bankAccount: selectedSlip.bankAccount,
                  joinDate: selectedSlip.joinDate,
                  location: selectedSlip.location,
                  state: selectedSlip.state
                }} />
            </div>

            {/* Action Bar */}
            <div className="mt-8 flex justify-end gap-3 print:hidden">
              <button 
                onClick={() => setSelectedSlip(null)}
                className="px-6 py-2.5 rounded-lg font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => window.print()}
                className="px-6 py-2.5 rounded-lg font-bold text-white bg-[#021934] hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip Edit Modal */}
      {editingPayslip && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800">Edit Payslip</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingPayslip.employeeName} — {editingPayslip.payPeriod}</p>
              </div>
              <button onClick={() => setEditingPayslip(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Basic Salary', key: 'basicSalary' },
                  { label: 'HRA', key: 'hra' },
                  { label: 'Special Allowance', key: 'specialAllowance' },
                  { label: 'Conveyance Allowance', key: 'conveyanceAllowance' },
                  { label: 'Other Allowance', key: 'otherAllowance' },
                  { label: 'Bonus', key: 'bonus' },
                  { label: 'Provident Fund (PF)', key: 'providentFund' },
                  { label: 'Professional Tax', key: 'professionalTax' },
                  { label: 'Income Tax (TDS)', key: 'incomeTax' },
                  { label: 'LOP Deduction', key: 'lopDeduction' },
                  { label: 'Other Deductions', key: 'otherDeductions' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payslipEditForm[key] ?? 0}
                      onChange={e => setPayslipEditForm((prev: any) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-slate-50 rounded-xl">
                <div className="flex justify-between text-sm font-bold text-slate-700">
                  <span>Gross Earnings</span>
                  <span>₹{(
                    (parseFloat(payslipEditForm.basicSalary) || 0) +
                    (parseFloat(payslipEditForm.hra) || 0) +
                    (parseFloat(payslipEditForm.specialAllowance) || 0) +
                    (parseFloat(payslipEditForm.conveyanceAllowance) || 0) +
                    (parseFloat(payslipEditForm.otherAllowance) || 0) +
                    (parseFloat(payslipEditForm.bonus) || 0)
                  ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-red-600 mt-1">
                  <span>Total Deductions</span>
                  <span>-₹{(
                    (parseFloat(payslipEditForm.providentFund) || 0) +
                    (parseFloat(payslipEditForm.professionalTax) || 0) +
                    (parseFloat(payslipEditForm.incomeTax) || 0) +
                    (parseFloat(payslipEditForm.lopDeduction) || 0) +
                    (parseFloat(payslipEditForm.otherDeductions) || 0)
                  ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-base font-black text-green-700 mt-2 pt-2 border-t border-slate-200">
                  <span>Net Pay</span>
                  <span>₹{(
                    (parseFloat(payslipEditForm.basicSalary) || 0) +
                    (parseFloat(payslipEditForm.hra) || 0) +
                    (parseFloat(payslipEditForm.specialAllowance) || 0) +
                    (parseFloat(payslipEditForm.conveyanceAllowance) || 0) +
                    (parseFloat(payslipEditForm.otherAllowance) || 0) +
                    (parseFloat(payslipEditForm.bonus) || 0) -
                    (parseFloat(payslipEditForm.providentFund) || 0) -
                    (parseFloat(payslipEditForm.professionalTax) || 0) -
                    (parseFloat(payslipEditForm.incomeTax) || 0) -
                    (parseFloat(payslipEditForm.lopDeduction) || 0) -
                    (parseFloat(payslipEditForm.otherDeductions) || 0)
                  ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setEditingPayslip(null)} className="flex-1 py-2.5 rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSavePayslip} disabled={savingPayslip} className="flex-1 py-2.5 rounded-lg font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-50">
                  {savingPayslip ? 'Saving...' : 'Save Payslip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
