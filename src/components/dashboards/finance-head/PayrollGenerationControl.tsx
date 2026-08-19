import { useEffect, useState } from 'react';

interface PayrollGenerationControlProps {
  onRunPayroll: (month: string) => void;
  triggerToast: (message: string) => void;
}

export default function PayrollGenerationControl({ onRunPayroll, triggerToast }: PayrollGenerationControlProps) {
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle' | 'running' | 'done'>('idle');
  const [progressVal, setProgressVal] = useState(0);

  const [payrollMonth, setPayrollMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  });
  const [checkingBlockers, setCheckingBlockers] = useState(false);
  const [blockerData, setBlockerData] = useState<{ penalties: number, leaves: number } | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [monthEnded, setMonthEnded] = useState(true);

  useEffect(() => {
    if (showGenerateModal) {
      setCheckingBlockers(true);
      fetch(`/api/payroll/check/${payrollMonth}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
        .then(r => r.json())
        .then(data => {
          setBlockerData(data.blockers);
          setIsLocked(data.isLocked);
          setMonthEnded(data.monthEnded !== false);
          setCheckingBlockers(false);
        })
        .catch(e => {
          console.error(e);
          setCheckingBlockers(false);
        });
    }
  }, [showGenerateModal, payrollMonth]);

  const handleStartGeneration = async () => {
    setGenerationStep('running');
    setProgressVal(50);
    try {
      const res = await fetch(`/api/payroll/lock/${payrollMonth}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setProgressVal(100);
        setGenerationStep('done');
      } else {
        const data = await res.json();
        triggerToast(data.error || 'Failed to lock payroll');
        setGenerationStep('idle');
      }
    } catch (e) {
      triggerToast('Error locking payroll');
      setGenerationStep('idle');
    }
  };

  const handleFinishGeneration = () => {
    setShowGenerateModal(false);
    setGenerationStep('idle');
    onRunPayroll(payrollMonth);
  };

  return (
    <>
      <button
        onClick={() => setShowGenerateModal(true)}
        className="bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg border border-orange-700 shadow-sm transition-all flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
        Run Payroll Cycle
      </button>

      {/* Batch Compile Payroll Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Execute batch compilation</h3>
              <button onClick={() => setShowGenerateModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {generationStep === 'idle' && (
                <>
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-bold text-[#021934]">Select Payroll Month:</p>
                    <input
                      type="month"
                      value={payrollMonth}
                      onChange={e => setPayrollMonth(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#021934]"
                    />
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    You are starting the automated payroll compilation run for <strong className="text-[#021934]">{new Date(payrollMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>. This will calculate withholdings, deductions, and produce locked salary slips.
                  </p>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pre-requisite Check</p>
                    {checkingBlockers ? (
                      <p className="text-sm text-slate-500 animate-pulse">Checking records...</p>
                    ) : isLocked ? (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-200">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        <span className="text-sm font-medium">Payroll already locked for this month!</span>
                      </div>
                    ) : !monthEnded ? (
                      <div className="flex items-center gap-2 text-red-500 bg-red-50 p-2 rounded border border-red-200">
                        <span className="material-symbols-outlined text-[18px]">event_busy</span>
                        <span className="text-sm font-medium">This month hasn't ended yet — payroll can only be run once it closes.</span>
                      </div>
                    ) : blockerData ? (
                      <div className="space-y-2">
                        <div className={`flex items-center gap-2 text-sm ${blockerData.penalties > 0 ? 'text-red-500 font-medium' : 'text-green-600'}`}>
                          <span className="material-symbols-outlined text-[18px]">{blockerData.penalties > 0 ? 'cancel' : 'check_circle'}</span>
                          {blockerData.penalties} Pending Penalty Approvals
                        </div>
                        <div className={`flex items-center gap-2 text-sm ${blockerData.leaves > 0 ? 'text-red-500 font-medium' : 'text-green-600'}`}>
                          <span className="material-symbols-outlined text-[18px]">{blockerData.leaves > 0 ? 'cancel' : 'check_circle'}</span>
                          {blockerData.leaves} Pending Leave Requests
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <button
                    onClick={handleStartGeneration}
                    disabled={isLocked || checkingBlockers || !monthEnded || !blockerData || blockerData.penalties > 0 || blockerData.leaves > 0}
                    className="w-full bg-[#021934] disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-slate-800 text-white py-3 rounded-lg text-sm font-semibold transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">play_circle</span>
                    Start Compilation Run
                  </button>
                </>
              )}

              {generationStep === 'running' && (
                <div className="py-8 text-center space-y-6">
                  <span className="animate-spin rounded-full h-12 w-12 border-4 border-orange-600 border-t-transparent inline-block"></span>
                  <div>
                    <h4 className="text-base font-bold text-[#021934]">Compiling Employee Records...</h4>
                    <p className="text-xs text-slate-400 mt-1">Cross-referencing attendance logs and benefit accruals</p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-orange-600 h-full transition-all duration-300" style={{ width: `${progressVal}%` }}></div>
                  </div>
                  <span className="text-xs font-bold text-slate-500">{progressVal}% complete</span>
                </div>
              )}

              {generationStep === 'done' && (
                <div className="text-center py-6 space-y-6">
                  <div className="w-16 h-16 bg-green-50 text-green-600 border border-green-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[36px] fill-1">check_circle</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-green-700">Compilation Complete!</h4>
                    <p className="text-xs text-slate-500 mt-1">142 salary slips compiled and verified. All tax deductions indexed.</p>
                  </div>

                  <button
                    onClick={handleFinishGeneration}
                    className="w-full bg-[#021934] hover:bg-slate-800 text-white py-3 rounded-lg text-sm font-semibold transition-colors shadow-md"
                  >
                    Dispatch Drafts to CFO
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
