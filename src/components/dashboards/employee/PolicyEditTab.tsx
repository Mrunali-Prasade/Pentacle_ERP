import { useEffect, useState } from 'react';

interface PolicyEditTabProps {
  triggerToast: (message: string, variant?: string) => void;
}

// Read-only view of the global policy constants. These values are informational only: the
// attendance, overtime and leave rules are fixed in the application code, so editing these and
// "saving" them would change nothing — which was misleading, especially since this screen can be
// granted to any user via Access Control. This mirrors the honest, read-only System Policy screen
// on the Super Admin console.
export default function PolicyEditTab({ triggerToast }: PolicyEditTabProps) {
  const [policy, setPolicy] = useState<any>(null);

  useEffect(() => {
    fetch('/api/policy')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load policy')))
      .then(setPolicy)
      .catch(() => triggerToast('Could not load global policy'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!policy) {
    return (
      <div className="text-center py-16">
        <span className="material-symbols-outlined animate-spin text-slate-300 text-[32px]">sync</span>
      </div>
    );
  }

  const rows = [
    { label: 'Late Grace Period', value: policy.lateGracePeriod != null ? `${policy.lateGracePeriod} mins` : '—' },
    { label: 'Overtime Rate', value: policy.overtimeRate || '—' },
    { label: 'Holiday OT Rate', value: policy.holidayOtRate || '—' },
    { label: 'Leave Accrual Rate', value: policy.leaveAccrual || '—' },
    { label: 'SLA Escalation Window', value: policy.slaEscalation || '—', full: true },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
        <h3 className="text-lg font-bold text-[#021934]">Global Constants</h3>
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
          <span className="material-symbols-outlined text-[16px]">lock</span>
          READ-ONLY
        </span>
      </div>

      <p className="text-sm text-slate-500 mb-5 leading-relaxed">
        These values are shown for reference. The attendance, overtime and leave rules are fixed in
        the application — changing them requires a developer.
      </p>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rows.map(r => (
          <div key={r.label} className={`space-y-1 ${r.full ? 'sm:col-span-2' : ''}`}>
            <dt className="text-xs font-bold text-slate-500 uppercase tracking-wider">{r.label}</dt>
            <dd className="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-lg text-sm text-slate-700 font-mono">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
