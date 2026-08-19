import { useEffect, useState } from 'react';

interface PolicyEditTabProps {
  triggerToast: (message: string, variant?: string) => void;
}

// Self-contained: fetches and PUTs directly against /api/policy. Kept separate from
// SuperAdminDashboard's own policy form (which currently only updates local React state and
// never persists — a pre-existing bug outside this feature's scope) so that a permission-only
// grantee gets a form that actually saves.
export default function PolicyEditTab({ triggerToast }: PolicyEditTabProps) {
  const [policy, setPolicy] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/policy')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load policy')))
      .then(setPolicy)
      .catch(() => triggerToast('Could not load global policy'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });
      if (res.ok) {
        triggerToast('Global system policy constants written to database');
      } else {
        const data = await res.json().catch(() => ({}));
        triggerToast(data.error || 'Failed to update policy');
      }
    } catch {
      triggerToast('Error updating policy');
    } finally {
      setSaving(false);
    }
  };

  if (!policy) {
    return (
      <div className="text-center py-16">
        <span className="material-symbols-outlined animate-spin text-slate-300 text-[32px]">sync</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-2xl">
      <form onSubmit={handleSave} className="space-y-5">
        <h3 className="text-lg font-bold text-[#021934] border-b border-slate-100 pb-4 mb-2">Global Constants</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Late Grace Period (Mins)</label>
            <input
              type="number"
              value={policy.lateGracePeriod}
              onChange={e => setPolicy({ ...policy, lateGracePeriod: Number(e.target.value) })}
              className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Overtime Rate</label>
            <input
              type="text"
              value={policy.overtimeRate}
              onChange={e => setPolicy({ ...policy, overtimeRate: e.target.value })}
              className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Holiday OT Rate</label>
            <input
              type="text"
              value={policy.holidayOtRate}
              onChange={e => setPolicy({ ...policy, holidayOtRate: e.target.value })}
              className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Leave Accrual Rate</label>
            <input
              type="text"
              value={policy.leaveAccrual}
              onChange={e => setPolicy({ ...policy, leaveAccrual: e.target.value })}
              className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">SLA Escalation Window</label>
          <input
            type="text"
            value={policy.slaEscalation}
            onChange={e => setPolicy({ ...policy, slaEscalation: e.target.value })}
            className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#021934] hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-lg transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">verified</span>
          {saving ? 'Saving...' : 'Write constants to Database'}
        </button>
      </form>
    </div>
  );
}
