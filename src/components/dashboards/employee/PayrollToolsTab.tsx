import PayrollGenerationControl from '../finance-head/PayrollGenerationControl';

interface PayrollToolsTabProps {
  onRunPayroll: (month: string) => void;
  triggerToast: (message: string) => void;
}

// PayrollGenerationControl already bundles the full payroll.lock.view (check blockers) +
// payroll.lock.manage (lock the month) + payroll.run (execute) workflow behind one button.
export default function PayrollToolsTab({ onRunPayroll, triggerToast }: PayrollToolsTabProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-md">
      <h3 className="text-lg font-bold text-[#021934] mb-1">Payroll</h3>
      <p className="text-xs text-slate-500 mb-4">Run the monthly payroll cycle. This checks for pending penalties, claims, and leave requests before locking and processing the month.</p>
      <PayrollGenerationControl onRunPayroll={onRunPayroll} triggerToast={triggerToast} />
    </div>
  );
}
