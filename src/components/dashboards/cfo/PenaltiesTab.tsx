import { useEffect, useState } from 'react';
import { DetailedAttendanceView } from '../../attendance/DetailedAttendanceView';

interface PenaltiesTabProps {
  triggerToast: (message: string, variant?: string) => void;
}

const PAGE_SIZE = 10;
const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Applied', value: 'Deduct' },
  { label: 'Waived', value: 'Waived' },
  { label: 'Auto Waived', value: 'Free' },
  { label: 'All statuses', value: 'All' },
];

export default function PenaltiesTab({ triggerToast }: PenaltiesTabProps) {
  const [penaltiesData, setPenaltiesData] = useState<any[]>([]);
  const [penaltiesMonthFilter, setPenaltiesMonthFilter] = useState('');
  // Default to Pending — that's the only thing the CFO actually needs to action; resolved rows
  // are just history and would otherwise bury the queue.
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [page, setPage] = useState(1);

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

  useEffect(() => {
    fetchPenalties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = penaltiesData
    .filter(p => !penaltiesMonthFilter || (p.date && p.date.startsWith(penaltiesMonthFilter)))
    .filter(p => statusFilter === 'All' || p.penalty_status === statusFilter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Snap back to page 1 whenever the filters or the underlying data change.
  useEffect(() => { setPage(1); }, [penaltiesMonthFilter, statusFilter, penaltiesData.length]);

  return (
    <DetailedAttendanceView
      penaltiesCount={penaltiesData.filter(p => p.penalty_status === 'Pending').length}
      penaltiesPanel={
        <div className="animate-fade-in space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">CFO Penalty Approvals</h2>
              <p className="text-sm text-slate-500 mt-1">Review and approve penalties escalated to the CFO.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#021934] text-slate-700 bg-white"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
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
                        {statusFilter === 'Pending' ? 'No pending penalties to review.' : 'No penalties match this filter.'}
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
                          {p.penalty_status === 'Pending' ? (
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

            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-sm">
                <span className="text-slate-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
                  >
                    Prev
                  </button>
                  <span className="text-slate-600 font-medium">Page {currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}
