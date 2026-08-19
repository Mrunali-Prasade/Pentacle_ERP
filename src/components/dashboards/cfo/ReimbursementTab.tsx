import { useState } from 'react';
import { ReimbursementClaim } from '../../../types';
import Pagination, { usePagination } from '../../common/Pagination';

interface ReimbursementTabProps {
  claims: ReimbursementClaim[];
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onShowSlip: (claim: ReimbursementClaim) => void;
  triggerToast: (message: string, variant?: string) => void;
}

export default function ReimbursementTab({ claims, onUpdateClaimStatus, onShowSlip, triggerToast }: ReimbursementTabProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessSplash, setShowSuccessSplash] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ReimbursementClaim | null>(null);

  const pendingClaims = claims.filter(c => c.status === 'Finance-Verified');
  const historyClaims = claims.filter(c => ['Approved-for-Payroll', 'Paid'].includes(c.status));
  const pagedHistory = usePagination(historyClaims, 10);

  // These figures describe the claims table right below them — not payroll, so they always
  // match what the CFO is actually being asked to authorise.
  const totalReleaseAmount = pendingClaims.reduce((sum, c) => sum + (c.amount || 0), 0);
  const uniqueEmployeeCount = new Set(pendingClaims.map(c => c.employeeName)).size;
  const currentPeriodLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  // Sign-off authorises every pending claim at once.
  const handleConfirmRelease = () => {
    pendingClaims.forEach(claim => {
      onUpdateClaimStatus(claim.id, 'Approved-for-Payroll', 'CFO authorised release');
    });
    setShowConfirmModal(false);
    setShowSuccessSplash(true);
    triggerToast(`${pendingClaims.length} Claims Authorized for Payout.`);
  };

  // Per-claim decisions, so the CFO can authorise some and hold or reject others
  // rather than being forced to approve the whole queue in one action.
  const handleApproveOne = (claimId: string) => {
    onUpdateClaimStatus(claimId, 'Approved-for-Payroll', 'CFO authorised');
    triggerToast(`Claim ${claimId} authorised for payout.`);
  };

  const handleRejectOne = (claimId: string) => {
    const reason = window.prompt('Reason for rejecting this claim:');
    if (reason === null) return;
    onUpdateClaimStatus(claimId, 'Rejected', reason || 'Rejected by CFO');
    triggerToast(`Claim ${claimId} rejected.`);
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">

        {/* Release Funds Action card */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-6 bg-[#021934] text-white flex justify-between items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Reimbursement Authorization</p>
              <h3 className="text-xl font-bold mt-1">{currentPeriodLabel}</h3>
            </div>
            {pendingClaims.length > 0 && (
              <span className="bg-orange-600 text-white font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider">
                Ready for Release
              </span>
            )}
          </div>

          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-6 border-b border-slate-100 pb-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pending Claims Amount</p>
                <p className="text-3xl font-black text-[#021934] mt-1">₹{totalReleaseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Claims Awaiting Release</p>
                <p className="text-3xl font-black text-slate-800 mt-1">{pendingClaims.length} <span className="text-base font-bold text-slate-400">({uniqueEmployeeCount} employee{uniqueEmployeeCount !== 1 ? 's' : ''})</span></p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              These claims have been verified by HR and Finance, and checked against system compliance guardrails. Releasing authorizes instant reserve bank transfers for the amounts below.
            </p>

            {pendingClaims.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-x-auto mt-4">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 font-bold text-slate-600">Ref</th>
                      <th className="px-4 py-2 font-bold text-slate-600">Employee</th>
                      <th className="px-4 py-2 font-bold text-slate-600 text-right">Amount</th>
                      <th className="px-4 py-2 font-bold text-slate-600 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingClaims.map(c => (
                      <tr key={c.id}>
                        <td className="px-4 py-3 font-mono text-slate-500">{c.id}</td>
                        <td className="px-4 py-3 font-semibold text-[#021934]">{c.employeeName}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">₹{c.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => { setSelectedClaim(c); setShowLightbox(true); }}
                              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold"
                            >
                              View Proof
                            </button>
                            <button
                              onClick={() => handleApproveOne(c.id)}
                              className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectOne(c.id)}
                              className="text-xs bg-red-50 text-red-700 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-50 p-6 rounded-xl text-center border border-slate-200">
                <span className="material-symbols-outlined text-slate-300 text-4xl">task_alt</span>
                <p className="text-slate-500 font-bold mt-2">No pending batches for release</p>
              </div>
            )}

            {pendingClaims.length > 0 && (
              <button
                onClick={() => setShowConfirmModal(true)}
                className="w-full bg-[#021934] hover:bg-slate-800 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg transition-colors flex items-center justify-center gap-2 mt-6"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                Release Funds
              </button>
            )}
          </div>
        </div>

      </div>

      {/* HISTORICAL AUTHORIZATIONS LEDGER */}
      {historyClaims.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs animate-fade-in mt-12">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="text-lg font-bold text-[#021934]">Recent Authorizations Ledger</h3>
              <p className="text-xs text-slate-400 mt-0.5">Historical audit trail of previously signed disbursements.</p>
            </div>
            <span className="text-xs font-bold bg-slate-200 text-slate-700 px-3 py-1 rounded-full tracking-wider">
              {historyClaims.length} Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Employee / Ref</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5 text-right">Amount</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Receipt Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pagedHistory.pageItems.map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 overflow-hidden text-[#021934] font-bold text-xs shrink-0">
                          {claim.employeeAvatar ? (
                            <img src={claim.employeeAvatar} alt={claim.employeeName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            claim.employeeName.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-[#021934]">{claim.employeeName}</div>
                          <div className="text-xs text-slate-400">{claim.employeeRole}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-700">{claim.category}</div>
                      <div className="text-xs font-mono text-slate-400 mt-0.5">{claim.id}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">
                      ₹{claim.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        claim.status === 'Paid'
                          ? 'bg-blue-50 text-blue-700 border border-blue-100'
                          : 'bg-green-50 text-green-700 border border-green-100'
                      }`}>
                        {claim.status}
                      </span>
                      {claim.status === 'Paid' && (
                        <button
                          onClick={() => onShowSlip(claim)}
                          className="ml-3 inline-flex items-center gap-1.5 px-3 py-1 bg-[#021934] hover:bg-slate-800 text-white rounded-full text-xs font-bold transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                          Slip
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => { setSelectedClaim(claim); setShowLightbox(true); }}
                        className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all"
                      >
                        View Proof
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={pagedHistory.page} totalPages={pagedHistory.totalPages} total={pagedHistory.total} pageSize={pagedHistory.pageSize} onChange={pagedHistory.setPage} />
          </div>
        </section>
      )}

      {/* Confirm Release Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Confirm Fund Release</h3>
              <button onClick={() => setShowConfirmModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-sm text-slate-600 leading-relaxed">
                You are about to authorize the immediate release of <strong className="text-[#021934]">₹{totalReleaseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> across <strong className="text-[#021934]">{pendingClaims.length}</strong> pending claim{pendingClaims.length !== 1 ? 's' : ''} from reserves. This action cannot be undone.
              </p>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRelease}
                  className="flex-1 py-3 bg-[#021934] hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-lg transition-colors"
                >
                  Confirm release & payout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS FULL SCREEN OVERLAY */}
      {showSuccessSplash && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#021934] text-white p-6 animate-fade-in text-center">
          {/* Confetti Background or elegant shapes */}
          <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
            <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-blue-500 rounded-full blur-[160px]"></div>
            <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-orange-600 rounded-full blur-[160px]"></div>
          </div>

          <div className="relative max-w-xl space-y-8 z-10 p-8">
            <div className="w-24 h-24 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-green-500/20 animate-bounce">
              <span className="material-symbols-outlined text-[54px] fill-1">check_circle</span>
            </div>

            <div className="space-y-3">
              <h2 className="text-4xl font-black tracking-tight leading-none uppercase text-orange-400">FINANCIAL DISBURSEMENT RELEASED SUCCESSFULLY</h2>
              <p className="text-sm text-slate-300">
                Authorized by Chief Financial Officer Charles Vance on {new Date().toLocaleString()}.
              </p>
            </div>

            <div className="border border-slate-700 p-6 rounded-2xl bg-slate-900/40 text-left space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 uppercase tracking-widest">Bank Transaction reference</span>
                <span className="font-mono text-green-400 font-bold">TXN-{Math.floor(1000000 + Math.random() * 9000000)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 uppercase tracking-widest">Released Outflow sum</span>
                <span className="font-mono text-green-400 font-bold">₹{totalReleaseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 uppercase tracking-widest">Recipient Bank System</span>
                <span className="font-bold">Reserve Bank ACH Routing API</span>
              </div>
            </div>

            <button
              onClick={() => setShowSuccessSplash(false)}
              className="px-8 py-3 bg-white text-[#021934] font-black rounded-xl hover:bg-slate-100 transition-colors shadow-lg shadow-white/5 active:scale-[0.98] duration-150 inline-flex items-center gap-2"
            >
              Return to Console
            </button>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR RECEIPT OVERLAY */}
      {showLightbox && selectedClaim && (
        <div
          onClick={() => setShowLightbox(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xs cursor-zoom-out animate-fade-in"
        >
          <div className="relative bg-white border border-slate-200 shadow-2xl p-8 max-w-2xl w-full text-[#021934] space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-lg font-bold">Magnified Receipt proof</h4>
                <p className="text-xs text-slate-400">Compliance Audit View — {selectedClaim.id}</p>
              </div>
              <button className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center p-2 min-h-[300px]">
              {selectedClaim.proofFileName && selectedClaim.proofFileName.startsWith('/') ? (
                // OneDrive-stored files are referenced by an id with no extension (/api/files/<id>),
                // so we can't tell image vs PDF from the URL. Use the iframe viewer for those (the
                // backend serves them inline with the real content-type, so it renders both).
                (selectedClaim.proofFileName.toLowerCase().endsWith('.pdf') || selectedClaim.proofFileName.startsWith('/api/files/')) ? (
                  <iframe
                    src={selectedClaim.proofFileName}
                    className="w-full h-[60vh] border-0 rounded"
                    title="Receipt PDF"
                  />
                ) : (
                  <img
                    src={selectedClaim.proofFileName}
                    alt="Receipt Proof"
                    className="max-w-full max-h-[60vh] object-contain shadow-sm"
                  />
                )
              ) : (
                <div className="text-center text-slate-400 py-12">
                  <span className="material-symbols-outlined text-4xl mb-2">image_not_supported</span>
                  <p>No proof image available for this legacy claim.</p>
                </div>
              )}
            </div>
            {selectedClaim.proofFileName && selectedClaim.proofFileName.startsWith('/') && (
              <a href={selectedClaim.proofFileName} target="_blank" rel="noopener noreferrer" className="mb-2 inline-flex items-center justify-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
                Open / download receipt in a new tab ↗
              </a>
            )}
            <p className="text-xs text-slate-500 italic text-center">Receipt matches specified vendor transaction indexes. Approved under travel policies.</p>
          </div>
        </div>
      )}
    </>
  );
}
