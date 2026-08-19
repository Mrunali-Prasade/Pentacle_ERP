import { useEffect, useState } from 'react';

interface PenaltyLog {
  id: string;
  date: string;
  in_time: string | null;
  in_source: string | null;
  out_time: string | null;
  out_source: string | null;
  penalty_type: string;
  penalty_status: 'Pending' | 'Deduct' | 'Waived' | 'Free';
}

// Read-only for the employee — no action buttons here. Waiving/applying a mark is HR/CFO/Super
// Admin's job (see admin-hr/PenaltiesPanel.tsx); this is purely "can I see my own record".
export default function MyLateMarksSection() {
  const [logs, setLogs] = useState<PenaltyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/attendance/penalties/my')
      .then(res => res.ok ? res.json() : [])
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visibleLogs = showAll ? logs : logs.slice(0, 5);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Deduct':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-100">Applied</span>;
      case 'Waived':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">Waived</span>;
      case 'Free':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100">Auto Waived</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100">Pending Review</span>;
    }
  };

  if (loading) return null;
  if (logs.length === 0) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-[#021934]">My Late / Early Marks</h3>
          <p className="text-xs text-slate-500 mt-0.5">Whether each mark has been applied to your salary or waived by HR.</p>
        </div>
        {logs.length > 5 && (
          <button
            onClick={() => setShowAll(s => !s)}
            className="text-[#021934] text-xs font-bold hover:underline"
          >
            {showAll ? 'Show Less' : `View All (${logs.length})`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">In / Out Time</th>
              <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {visibleLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-[#021934]">
                  {new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-100">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    {log.penalty_type}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {log.in_time || '-'} / {log.out_time || '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  {statusBadge(log.penalty_status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
