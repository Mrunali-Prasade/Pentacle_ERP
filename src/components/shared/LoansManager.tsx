import React, { useEffect, useState } from 'react';

interface Loan {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  principal: number;
  monthlyInstalment: number;
  remainingBalance: number;
  startMonth: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  employeeId: string;
}

interface LoansManagerProps {
  triggerToast: (message: string, variant?: string) => void;
}

export default function LoansManager({ triggerToast }: LoansManagerProps) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [monthlyInstalment, setMonthlyInstalment] = useState('');
  const [startMonth, setStartMonth] = useState('');

  const fetchLoans = () => {
    fetch('/api/loans')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load loans')))
      .then(data => setLoans(Array.isArray(data) ? data : []))
      .catch(e => {
        console.error(e);
        triggerToast('Could not load loans');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLoans();
    fetch('/api/admin/employees')
      .then(res => res.ok ? res.json() : [])
      .then((data: any[]) => setEmployees(data.filter(e => e.status !== 'resigned' && e.status !== 'terminated').map(e => ({ id: e.id, name: e.name, employeeId: e.employeeId || e.employee_id }))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setSelectedEmployeeId('');
    setPrincipal('');
    setMonthlyInstalment('');
    setStartMonth('');
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          principal: parseFloat(principal),
          monthlyInstalment: parseFloat(monthlyInstalment),
          startMonth
        })
      });
      if (res.ok) {
        triggerToast('Loan added successfully');
        setShowAddModal(false);
        resetForm();
        fetchLoans();
      } else {
        const data = await res.json();
        triggerToast(data.error || 'Failed to add loan');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error adding loan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-[#021934]">Employee Loans</h3>
            <p className="text-xs text-slate-500 mt-0.5">Loans are deducted automatically from salary each payroll run.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 bg-[#021934] hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add Loan
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined animate-spin text-slate-300 text-[32px]">sync</span>
            </div>
          ) : loans.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-6 py-3.5 text-right">Principal</th>
                  <th className="px-6 py-3.5 text-right">Monthly Instalment</th>
                  <th className="px-6 py-3.5 text-right">Remaining Balance</th>
                  <th className="px-6 py-3.5">Start Month</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loans.map(loan => (
                  <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#021934]">{loan.employeeName}</div>
                      <div className="text-xs text-slate-400">{loan.employeeCode}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-700">₹{loan.principal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-700">₹{loan.monthlyInstalment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">₹{loan.remainingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-slate-600">{loan.startMonth}</td>
                    <td className="px-6 py-4">
                      {loan.remainingBalance > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-100 uppercase tracking-wider">
                          Paid Off
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-slate-300 text-[48px]">account_balance</span>
              <p className="text-sm text-slate-400 font-medium mt-3">No loans recorded yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Loan Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-[#021934]">Add Employee Loan</h3>
              <button onClick={() => { setShowAddModal(false); resetForm(); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleAddLoan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Employee *</label>
                <select
                  required
                  value={selectedEmployeeId}
                  onChange={e => setSelectedEmployeeId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none bg-white"
                >
                  <option value="" disabled>Select employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Principal Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={principal}
                  onChange={e => setPrincipal(e.target.value)}
                  placeholder="50000"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Monthly Instalment (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={monthlyInstalment}
                  onChange={e => setMonthlyInstalment(e.target.value)}
                  placeholder="5000"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Start Month *</label>
                <input
                  type="month"
                  required
                  value={startMonth}
                  onChange={e => setStartMonth(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Add Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
