import { useEffect, useState } from 'react';
import Pagination, { usePagination } from '../../common/Pagination';

interface AuditLogTabProps {
  triggerToast: (message: string, variant?: string) => void;
}

export default function AuditLogTab({ triggerToast }: AuditLogTabProps) {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/audit-logs')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load audit logs')))
      .then(data => setAuditLogs(Array.isArray(data) ? data : []))
      .catch(() => triggerToast('Could not load the audit trail'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredLogs = auditLogs.filter(log => {
    const q = search.toLowerCase();
    return (
      log.actor.toLowerCase().includes(q) ||
      log.module.toLowerCase().includes(q) ||
      log.changeDescription.toLowerCase().includes(q) ||
      log.id.toLowerCase().includes(q)
    );
  });
  const paged = usePagination(filteredLogs, 15);

  if (loading) {
    return (
      <div className="text-center py-16">
        <span className="material-symbols-outlined animate-spin text-slate-300 text-[32px]">sync</span>
      </div>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
        <div>
          <h3 className="text-lg font-bold text-[#021934]">System Audit Trail</h3>
          <p className="text-xs text-slate-400 mt-0.5">Immutable history of configuration and policy adjustments.</p>
        </div>
        <div className="relative w-full md:w-72 shrink-0">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search audit trail by actor, module..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#021934]/10 transition-all"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        {filteredLogs.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-3.5">ID / Timestamp</th>
                <th className="px-6 py-3.5">Actor</th>
                <th className="px-6 py-3.5">Module</th>
                <th className="px-6 py-3.5">Change Action</th>
                <th className="px-6 py-3.5">Delta Values</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-mono text-slate-700">
              {paged.pageItems.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-[#021934] text-xs">{log.id}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{log.timestamp}</div>
                  </td>
                  <td className="px-6 py-4 text-xs font-sans">
                    <div className="font-semibold text-slate-800">{log.actor}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{log.role}</div>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 border border-slate-200 uppercase">
                      {log.module}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-sans text-[#021934] font-medium">
                    {log.changeDescription}
                  </td>
                  <td className="px-6 py-4 text-xs">
                    {log.beforeValue && log.afterValue ? (
                      <div className="space-y-0.5">
                        <p className="text-red-500 line-through text-[10px]">{log.beforeValue}</p>
                        <p className="text-green-600 font-bold text-[10px]">{log.afterValue}</p>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[10px]">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-slate-300 text-[48px]">search_off</span>
            <p className="text-sm text-slate-400 mt-3 font-medium">No matching audit logs found.</p>
          </div>
        )}
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
      </div>
    </section>
  );
}
