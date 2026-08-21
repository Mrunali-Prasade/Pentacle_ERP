interface PolicyEditTabProps {
  triggerToast: (message: string, variant?: string) => void;
}

// Read-only "System Rules" — identical to the honest System Policy screen on the Super Admin
// console. These rules are fixed in the application code; this screen is purely informational, so
// it is safe to grant via Access Control (it can never change anything). No editable fields, no
// "save" that does nothing.
export default function PolicyEditTab(_props: PolicyEditTabProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <h3 className="text-lg font-bold text-[#021934]">System Rules</h3>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          <span className="material-symbols-outlined text-[13px]">lock</span> Read-only
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4">These are the rules the system currently applies. They are fixed in the application &mdash; changing them requires a developer.</p>
      <div className="space-y-3">
        {[
          ['Late arrival cut-off', 'Arriving after 09:30 earns a late mark'],
          ['Standard shift', '9 hours; working less earns an early mark'],
          ['Free marks per month', 'The first 3 late or early marks are auto-waived; beyond that they go to CFO / admin review'],
          ['Earned leave accrual', '1.5 days per month, up to a maximum of 18 days'],
          ['Unexplained absence', 'No leave and no punch on a past working day leads to a full-day deduction once HR approves'],
          ['Reimbursement cut-off', 'Managed on the Finance tab'],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 border border-slate-100 rounded-xl p-3">
            <span className="text-xs font-bold text-slate-700">{k}</span>
            <span className="text-sm text-slate-500">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
