import { useEffect, useState } from 'react';
import OverviewTab from '../admin-hr/OverviewTab';
import { DetailedAttendanceView } from '../../attendance/DetailedAttendanceView';
import DailyAttendanceList from '../../attendance/DailyAttendanceList';

interface AttendanceToolsTabProps {
  permissions: string[];
  triggerToast: (message: string, variant?: string) => void;
}

// Same self-contained approach as EmployeeDirectoryTab — this surfaces attendance tools
// (live metrics, per-employee detail + timing edit, today's live list, history export) for
// whichever of these the account has been granted, without depending on App.tsx's role-gated
// data fetching.
export default function AttendanceToolsTab({ permissions, triggerToast }: AttendanceToolsTabProps) {
  const canMetrics = permissions.includes('dashboard.metrics.view');
  const canDetailed = permissions.includes('attendance.detailed.view') || permissions.includes('attendance.timing.edit');
  const canToday = permissions.includes('attendance.today.view');
  const canExport = permissions.includes('attendance.history.export');

  const subTabs = [
    ...(canMetrics ? [{ key: 'metrics', label: 'Live Metrics' }] : []),
    ...(canDetailed ? [{ key: 'detailed', label: 'Detailed Attendance' }] : []),
    ...(canExport ? [{ key: 'export', label: 'Export History' }] : []),
  ];
  const [subTab, setSubTab] = useState(subTabs[0]?.key || '');

  const [metrics, setMetrics] = useState<any>(null);
  const [showLiveAttendance, setShowLiveAttendance] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().substring(0, 7));

  useEffect(() => {
    if (subTab === 'metrics' && canMetrics && !metrics) {
      fetch('/api/hr/dashboard/metrics')
        .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load metrics')))
        .then(setMetrics)
        .catch(() => triggerToast('Could not load live metrics'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  if (subTabs.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit gap-1">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${subTab === t.key ? 'bg-white text-[#021934] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'metrics' && (
        metrics ? (
          <OverviewTab
            metrics={metrics}
            resignationsToProcess={[]}
            onUpdateEmployee={async () => { triggerToast('Use the Employee Directory tab to edit employee records', 'info'); }}
            onShowLiveAttendance={() => canToday ? setShowLiveAttendance(true) : triggerToast("You don't have access to today's live attendance", 'info')}
          />
        ) : (
          <div className="text-center py-16">
            <span className="material-symbols-outlined animate-spin text-slate-300 text-[32px]">sync</span>
          </div>
        )
      )}

      {subTab === 'detailed' && <DetailedAttendanceView />}

      {subTab === 'export' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-md">
          <h3 className="text-lg font-bold text-[#021934] mb-1">Export Attendance History</h3>
          <p className="text-xs text-slate-500 mb-4">Download a CSV of every employee's daily in/out times for the selected month.</p>
          <div className="flex gap-3">
            <input
              type="month"
              value={exportMonth}
              onChange={e => setExportMonth(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500"
            />
            <a
              href={`/api/hr/attendance/history/export?month=${exportMonth}`}
              className="inline-flex items-center gap-1.5 bg-[#021934] hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Download CSV
            </a>
          </div>
        </div>
      )}

      {showLiveAttendance && <DailyAttendanceList onClose={() => setShowLiveAttendance(false)} />}
    </div>
  );
}
