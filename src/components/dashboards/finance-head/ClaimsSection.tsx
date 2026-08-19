import React, { useState } from 'react';
import { ReimbursementClaim } from '../../../types';
import Pagination, { usePagination } from '../../common/Pagination';

interface ClaimsSectionProps {
  claims: ReimbursementClaim[];
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onPayClaim: (claimId: string, proofFileName: string, proofFileData: string) => void;
  triggerToast: (message: string) => void;
}

export default function ClaimsSection({ claims, onUpdateClaimStatus, onPayClaim, triggerToast }: ClaimsSectionProps) {
  const [rejectClaimId, setRejectClaimId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showLightbox, setShowLightbox] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ReimbursementClaim | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payClaimId, setPayClaimId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<{ name: string, data: string, size: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'awaitingCfo' | 'history'>('pending');
  const [overrideClaimId, setOverrideClaimId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // "Pending" is everything Finance must act on now: claims still to verify (Admin-Verified),
  // AND claims the CFO has already approved that now need paying (Approved-for-Payroll). This
  // way a claim the CFO just approved surfaces here for payment instead of vanishing into
  // History — it only moves to History once it is actually Paid.
  const pendingClaims = claims.filter(c => c.status === 'Admin-Verified' || c.status === 'Approved-for-Payroll');
  // Finance already verified these; they're waiting on the CFO (or a Finance override) before
  // they can be paid. Kept separate from "History" so Finance can see at a glance what's stuck
  // waiting on the CFO, without it being buried among fully-closed Paid/Rejected claims.
  const awaitingCfoClaims = claims.filter(c => c.status === 'Finance-Verified');
  const historyClaims = claims.filter(c => ['Paid', 'Rejected'].includes(c.status));
  const pagedHistory = usePagination(historyClaims, 10);

  const handleVerifyClaim = (claimId: string) => {
    onUpdateClaimStatus(claimId, 'Finance-Verified', 'Verified under Section 80C compliance guardrails.');
    triggerToast(`Claim ${claimId} verified and forwarded to CFO.`);
  };

  // Lets Finance approve on the CFO's behalf when the CFO is unavailable. Only reachable from
  // Finance-Verified (i.e. Finance already verified it themselves) — the reason is mandatory so
  // it shows up in the audit trail, and the actor name (Finance, not CFO) makes the bypass clear.
  const handleOverrideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (overrideClaimId && overrideReason.trim()) {
      onUpdateClaimStatus(overrideClaimId, 'Approved-for-Payroll', `[Finance Override — CFO unavailable] ${overrideReason.trim()}`);
      triggerToast(`Claim ${overrideClaimId} approved on CFO's behalf.`);
      setOverrideClaimId(null);
      setOverrideReason('');
    }
  };

  const handleRejectClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rejectClaimId) {
      onUpdateClaimStatus(rejectClaimId, 'Rejected', rejectReason);
      triggerToast(`Claim ${rejectClaimId} rejected. Employee notified`);
      setRejectClaimId(null);
      setRejectReason('');
    }
  };

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofFile({
          name: file.name,
          size: file.size.toString(),
          data: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (payClaimId && proofFile) {
      onPayClaim(payClaimId, proofFile.name, proofFile.data);
      setShowPayModal(false);
      setPayClaimId(null);
      setProofFile(null);
    }
  };

  return (
    <>
      {/* Pending Disbursements, Awaiting CFO, and History */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="border-b border-slate-100 flex p-2 gap-2 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white text-[#021934] shadow-sm border border-slate-200/60' : 'text-slate-500 hover:bg-slate-100/50'}`}
          >
            Pending Verification ({pendingClaims.length})
          </button>
          <button
            onClick={() => setActiveTab('awaitingCfo')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'awaitingCfo' ? 'bg-white text-[#021934] shadow-sm border border-slate-200/60' : 'text-slate-500 hover:bg-slate-100/50'}`}
          >
            Awaiting CFO ({awaitingCfoClaims.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-white text-[#021934] shadow-sm border border-slate-200/60' : 'text-slate-500 hover:bg-slate-100/50'}`}
          >
            History ({historyClaims.length})
          </button>
        </div>
        <div className="overflow-x-auto">
          {activeTab === 'pending' && (
            pendingClaims.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-3.5">Employee</th>
                    <th className="px-6 py-3.5">Category / Ref</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {pendingClaims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#021934]">{claim.employeeName}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-700">{claim.category}</div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">{claim.id}</div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-800">
                        ₹{claim.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        {claim.status === 'Approved-for-Payroll' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                            {claim.status}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-100 uppercase tracking-wider">
                            Compliant
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setSelectedClaim(claim); setShowLightbox(true); }} className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all">
                            View Proof
                          </button>
                          {claim.status === 'Approved-for-Payroll' ? (
                            <button onClick={() => { setPayClaimId(claim.id); setShowPayModal(true); }} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors">
                              Pay & Generate Slip
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleVerifyClaim(claim.id)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors">
                                Verify
                              </button>
                              <button onClick={() => setRejectClaimId(claim.id)} className="bg-red-50 text-red-700 hover:bg-red-600 hover:text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors">
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-slate-300 text-[48px]">verified_user</span>
                <p className="text-sm text-slate-400 font-medium mt-3">Verify queue clean. No pending actions.</p>
              </div>
            )
          )}

          {activeTab === 'awaitingCfo' && (
            awaitingCfoClaims.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-3.5">Employee</th>
                    <th className="px-6 py-3.5">Category / Ref</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {awaitingCfoClaims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#021934]">{claim.employeeName}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-700">{claim.category}</div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">{claim.id}</div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-800">
                        ₹{claim.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
                          Awaiting CFO
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setSelectedClaim(claim); setShowLightbox(true); }} className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all">
                            View Proof
                          </button>
                          <button onClick={() => setOverrideClaimId(claim.id)} className="bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors">
                            Approve on CFO's Behalf
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-slate-300 text-[48px]">hourglass_empty</span>
                <p className="text-sm text-slate-400 font-medium mt-3">Nothing waiting on the CFO right now.</p>
              </div>
            )
          )}

          {activeTab === 'history' && (
            historyClaims.length > 0 ? (
              <>
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-3.5">Employee</th>
                    <th className="px-6 py-3.5">Category / Ref</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {pagedHistory.pageItems.map((claim) => (
                    <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#021934]">{claim.employeeName}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-700">{claim.category}</div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">{claim.id}</div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-800">
                        ₹{claim.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                          {claim.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setSelectedClaim(claim); setShowLightbox(true); }} className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all">
                            View Proof
                          </button>
                          {claim.status === 'Approved-for-Payroll' && (
                            <button onClick={() => { setPayClaimId(claim.id); setShowPayModal(true); }} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors">
                              Pay & Generate Slip
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={pagedHistory.page} totalPages={pagedHistory.totalPages} total={pagedHistory.total} pageSize={pagedHistory.pageSize} onChange={pagedHistory.setPage} />
              </>
            ) : (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-slate-300 text-[48px]">history</span>
                <p className="text-sm text-slate-400 font-medium mt-3">No historical approvals yet.</p>
              </div>
            )
          )}
        </div>
      </section>

      {/* Reject Comment Dialog Modal */}
      {rejectClaimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Reject Expense Claim</h3>
              <button onClick={() => setRejectClaimId(null)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleRejectClaimSubmit}>
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-xs text-red-800 leading-normal">
                Please state the reason for rejecting claim <strong>{rejectClaimId}</strong>. The employee will receive an automated notification with these audit details.
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Rejection Reason</label>
                <textarea
                  required
                  placeholder="e.g., Exceeded monthly limits for this category without WFH prior pre-authorization..."
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-red-500/20 outline-none"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setRejectClaimId(null)}
                  className="flex-grow py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-grow py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors"
                >
                  Reject & Notify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve on CFO's Behalf (Override) Modal */}
      {overrideClaimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Approve on CFO's Behalf</h3>
              <button onClick={() => { setOverrideClaimId(null); setOverrideReason(''); }} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleOverrideSubmit}>
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-xs text-amber-800 leading-normal">
                This bypasses the CFO's normal sign-off for claim <strong>{overrideClaimId}</strong>. Use this only when the CFO is genuinely unavailable — the reason you enter will be visible to the CFO and in the audit trail as an override, attributed to your name.
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Reason for Override (required)</label>
                <textarea
                  required
                  placeholder="e.g., CFO on leave until Monday, payroll deadline today..."
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-amber-500/20 outline-none"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => { setOverrideClaimId(null); setOverrideReason(''); }}
                  className="flex-grow py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-grow py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors"
                >
                  Confirm Override Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR RECEIPT OVERLAY */}
      {showLightbox && selectedClaim && (
        <div
          onClick={() => setShowLightbox(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xs cursor-zoom-out animate-fade-in"
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

      {/* Pay & Generate Slip Modal */}
      {showPayModal && payClaimId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-[#021934]">Execute Payment & Slip</h3>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handlePaySubmit} className="p-6 space-y-6">
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Please upload the bank transfer receipt or transaction proof to complete the reimbursement. A slip will be automatically generated and sent to the employee.</p>

                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-orange-500/50 hover:bg-orange-50/50 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    required
                    onChange={handleProofFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept=".pdf,image/*"
                  />
                  {proofFile ? (
                    <div className="flex flex-col items-center">
                      <span className="material-symbols-outlined text-green-500 text-3xl mb-2">task</span>
                      <p className="text-sm font-bold text-slate-700">{proofFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Ready to submit</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="material-symbols-outlined text-slate-400 text-3xl mb-2">upload_file</span>
                      <p className="text-sm font-bold text-[#021934]">Click to upload proof</p>
                      <p className="text-xs text-slate-500 mt-1">PDF, JPG, or PNG</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!proofFile}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
