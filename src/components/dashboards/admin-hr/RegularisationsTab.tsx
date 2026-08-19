import { useEffect, useState } from 'react';
import Pagination, { usePagination } from '../../common/Pagination';

interface RegularisationsTabProps {
  triggerToast: (message: string, variant?: string) => void;
  // Reports the number of still-Pending requests up to the dashboard, so it can show a badge.
  onCountChange?: (pending: number) => void;
}

// HR view of employee attendance-correction (regularisation) requests. Lists every request and
// lets an approver Approve (which writes the corrected in/out times into the attendance record
// and waives that day's penalty) or Reject. Talks to the existing backend:
//   GET  /api/attendance/regularisations        -> the list
//   POST /api/attendance/regularise/approve      -> { id, status: 'Approved' | 'Rejected' }
export default function RegularisationsTab({ triggerToast, onCountChange }: RegularisationsTabProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const paged = usePagination(rows, 12);

  const fetchRegularisations = () => {
    setLoading(true);
    fetch('/api/attendance/regularisations')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setRows(list);
        onCountChange?.(list.filter((r: any) => r.status === 'Pending').length);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchRegularisations(); }, []);

  const decide = (id: string, status: 'Approved' | 'Rejected') => {
    fetch('/api/attendance/regularise/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).then(async res => {
      if (res.ok) { triggerToast(`Correction request ${status.toLowerCase()}`); fetchRegularisations(); }
      else { const d = await res.json().catch(() => ({})); triggerToast(d.error || `Failed to ${status.toLowerCase()} request`); }
    }).catch(() => triggerToast('Something went wrong. Please try again.'));
  };

  const pending = rows.filter(r => r.status === 'Pending').length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-[#021934]">Attendance Correction Requests</h3>
            <p className="text-xs text-slate-500 mt-0.5">Employees ask to fix a wrong or missing punch. Approving writes the corrected timing.</p>
          </div>
          <span className="text-xs font-bold bg-orange-500 text-white px-2.5 py-1 rounded-full uppercase tracking-wider font-mono hidden sm:inline-block">
            {pending} Pending
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Requested In / Out</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-sm animate-pulse">Loading requests…</td></tr>
              ) : rows.length > 0 ? (
                paged.pageItems.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-[#021934]">{r.employee_name || '—'}</p>
                      <p className="text-xs text-slate-500">{r.emp_code || ''}</p>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{r.date}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-bold text-slate-700">{r.in_time || '—'}</span>
                      <span className="text-slate-300 mx-1">→</span>
                      <span className="text-sm font-mono font-bold text-slate-700">{r.out_time || '—'}</span>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <p className="text-sm text-slate-600 leading-snug">{r.reason}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        r.status === 'Approved' ? 'bg-green-100 text-green-700' :
                        r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>{r.status}</span>
                      {r.approved_by && r.status !== 'Pending' && (
                        <p className="text-[10px] text-slate-400 mt-1">by {r.approved_by}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {r.status === 'Pending' ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => decide(r.id, 'Approved')} className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-600 hover:text-white rounded-lg text-xs font-bold transition-colors">Approve</button>
                          <button onClick={() => decide(r.id, 'Rejected')} className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition-colors">Reject</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Actioned</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500 text-sm">No correction requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
      </div>
    </div>
  );
}
