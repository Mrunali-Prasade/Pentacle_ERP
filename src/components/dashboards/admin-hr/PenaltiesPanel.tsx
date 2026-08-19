import { useEffect, useState } from 'react';

interface PenaltiesPanelProps {
  triggerToast: (message: string, variant?: string) => void;
  onCountChange: (pendingCount: number) => void;
}

export default function PenaltiesPanel({ triggerToast, onCountChange }: PenaltiesPanelProps) {
  const [penaltiesData, setPenaltiesData] = useState<any[]>([]);
  const [penaltiesMonthFilter, setPenaltiesMonthFilter] = useState('');

  const fetchPenalties = async () => {
    try {
      const res = await fetch('/api/hr/attendance/penalties');
      if (res.ok) {
        const json = await res.json();
        setPenaltiesData(json);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPenalties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onCountChange(penaltiesData.filter(p => p.penalty_status === 'Pending').length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penaltiesData]);

  const handlePenaltyStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/hr/attendance/penalties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        triggerToast('Penalty status updated', 'success');
        fetchPenalties();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkPenaltyStatus = async (status: 'Deduct' | 'Waived') => {
    const visiblePenalties = penaltiesMonthFilter ? penaltiesData.filter(p => p.date.startsWith(penaltiesMonthFilter)) : penaltiesData;
    // Other HR admins' (and own) records are excluded — the server would silently skip them
    // anyway, but filtering here keeps the "Bulk updated N" count accurate.
    const targetIds = visiblePenalties.filter(p => p.penalty_status !== status && p.employee_role !== 'admin_hr').map(p => p.id);
    if (targetIds.length === 0) {
      triggerToast(`All visible penalties are already ${status}`, 'info');
      return;
    }
    try {
      const res = await fetch(`/api/hr/attendance/penalties/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds, status })
      });
      if (res.ok) {
        const json = await res.json();
        triggerToast(`Bulk updated ${json.updated} penalties to ${status}`, 'success');
        fetchPenalties();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const visibleRows = penaltiesMonthFilter ? penaltiesData.filter(p => p.date.startsWith(penaltiesMonthFilter)) : penaltiesData;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between bg-white px-6 py-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Penalty Approvals</h2>
          <p className="text-sm text-slate-500">Approve or waive salary deductions for attendance penalties (Late marks, Early leaving, AWOL)</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleBulkPenaltyStatus('Waived')}
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-sm font-bold rounded-lg shadow-sm border border-emerald-200 transition-colors"
          >
            Waive All
          </button>
          <button
            onClick={() => handleBulkPenaltyStatus('Deduct')}
            className="px-4 py-2 bg-[#021934] hover:bg-slate-800 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
          >
            Accept All
          </button>
          <input
            type="month"
            value={penaltiesMonthFilter}
            onChange={(e) => setPenaltiesMonthFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#021934] text-slate-700"
          />
          <button onClick={fetchPenalties} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 rounded-lg border border-slate-200 shadow-sm transition-colors" title="Refresh Penalties">
            <span className="material-symbols-outlined">refresh</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap min-w-max">
            <thead className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200">
              <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Employee</th>
                <th className="px-4 py-4">Date</th>
                <th className="px-4 py-4">In Time (Source)</th>
                <th className="px-4 py-4">Out Time (Source)</th>
                <th className="px-4 py-4">Penalty</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <span className="material-symbols-outlined text-[48px] text-slate-300 mb-2 block">task_alt</span>
                    No penalties found.
                  </td>
                </tr>
              ) : (
                visibleRows.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-800">{p.employee_name}</td>
                    <td className="px-4 py-4 text-slate-600">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="px-4 py-4">
                      <div className="text-slate-800">{p.in_time || '-'}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{p.in_source || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-slate-800">{p.out_time || '-'}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{p.out_source || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-100">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        {p.penalty_type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          p.penalty_status === 'Deduct' ? 'bg-red-50 text-red-600 border-red-100' :
                          p.penalty_status === 'Waived' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          p.penalty_status === 'Free' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {p.penalty_status}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {p.penalty_action_by_role === 'cfo' ? (
                        <span className="text-xs text-slate-500 flex items-center justify-end gap-1"><span className="material-symbols-outlined text-[14px]">lock</span> Locked by CFO</span>
                      ) : p.employee_role === 'admin_hr' ? (
                        <div className="flex justify-end gap-2" title="HR admins cannot approve or waive another HR admin's attendance penalty. The CFO or Super Admin can action it instead.">
                          <button
                            disabled
                            className="px-3 py-1.5 bg-slate-50 text-slate-300 text-xs font-bold rounded shadow-sm border border-slate-200 cursor-not-allowed"
                          >
                            Deduct
                          </button>
                          <button
                            disabled
                            className="px-3 py-1.5 bg-slate-50 text-slate-300 text-xs font-bold rounded shadow-sm border border-slate-200 cursor-not-allowed"
                          >
                            Waive
                          </button>
                        </div>
                      ) : p.penalty_status === 'Pending' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handlePenaltyStatus(p.id, 'Deduct')}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded shadow-sm border border-rose-200 transition-colors"
                          >
                            Deduct
                          </button>
                          <button
                            onClick={() => handlePenaltyStatus(p.id, 'Waived')}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-xs font-bold rounded shadow-sm border border-emerald-200 transition-colors"
                          >
                            Waive
                          </button>
                        </div>
                      ) : p.penalty_status === 'Deduct' ? (
                        <div className="flex justify-end gap-2">
                          <span className="text-xs font-bold text-slate-400 self-center mr-2">Applied</span>
                          <button
                            onClick={() => handlePenaltyStatus(p.id, 'Waived')}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-xs font-bold rounded shadow-sm border border-emerald-200 transition-colors"
                          >
                            Waive
                          </button>
                        </div>
                      ) : p.penalty_status === 'Free' ? (
                        <span className="text-xs font-bold text-slate-300">Auto Waived</span>
                      ) : p.penalty_status === 'Waived' ? (
                        <div className="flex justify-end gap-2">
                          <span className="text-xs font-bold text-emerald-500 self-center mr-2">✓ Waived</span>
                          <button
                            onClick={() => handlePenaltyStatus(p.id, 'Deduct')}
                            className="text-xs text-slate-400 hover:text-slate-600 transition-colors font-bold border border-slate-200 px-2 py-1 rounded"
                          >
                            Re-Deduct
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
