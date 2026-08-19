import { useState } from 'react';
import { Payslip } from '../../../types';

interface PayslipManagementSectionProps {
  payslips: Payslip[];
  triggerToast: (message: string) => void;
}

export default function PayslipManagementSection({ payslips, triggerToast }: PayslipManagementSectionProps) {
  const [editingPayslip, setEditingPayslip] = useState<any | null>(null);
  const [payslipEditForm, setPayslipEditForm] = useState<any>({});
  const [savingPayslip, setSavingPayslip] = useState(false);

  const handleEditPayslip = (slip: any) => {
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

  return (
    <>
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">Payslip Management</h3>
            <p className="text-xs text-slate-500 mt-0.5">Review and edit salary slips for all employees</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          {payslips.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-6 py-3.5">Pay Period</th>
                  <th className="px-6 py-3.5">Net Amount</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {payslips.map(slip => (
                  <tr key={slip.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{(slip as any).employeeName}</div>
                      <div className="text-xs text-slate-400">{(slip as any).employeeId}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600">{slip.payPeriod}</td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-800">₹{slip.netAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                        slip.status === 'paid' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>{slip.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleEditPayslip(slip)}
                        className="p-1.5 text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 rounded transition-colors"
                        title="Edit Payslip"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-slate-300 text-[48px]">receipt_long</span>
              <p className="text-sm text-slate-400 font-medium mt-3">No payslips generated yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* Payslip Edit Modal */}
      {editingPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
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
    </>
  );
}
