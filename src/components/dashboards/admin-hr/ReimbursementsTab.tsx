import React, { useState } from 'react';
import { ReimbursementClaim } from '../../../types';
import Pagination, { usePagination } from '../../common/Pagination';

interface ReimbursementsTabProps {
  claims: ReimbursementClaim[];
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onShowSlip: (claim: ReimbursementClaim) => void;
}

export default function ReimbursementsTab({ claims, onUpdateClaimStatus, onShowSlip }: ReimbursementsTabProps) {
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [showLightbox, setShowLightbox] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [subTab, setSubTab] = useState<'pending' | 'history'>('pending');

  const selectedClaim = claims.find(c => c.id === selectedClaimId) || null;
  const pendingClaims = claims.filter(c => c.status === 'Submitted');
  const historyClaims = claims.filter(c => c.status !== 'Submitted' && c.status !== 'Draft');
  const pagedHistory = usePagination(historyClaims, 10);

  const handleVerify = (claimId: string) => {
    onUpdateClaimStatus(claimId, 'Admin-Verified', 'Proof verified by HR Admin');
  };

  // Sends the claim back so the employee can fix it, rather than rejecting outright.
  const handleReturnClaim = (claimId: string) => {
    const reason = window.prompt('What does the employee need to correct?');
    if (reason === null) return;
    onUpdateClaimStatus(claimId, 'Returned', reason || 'Please review and resubmit');
  };

  const handleRejectClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClaimId) {
      onUpdateClaimStatus(selectedClaimId, 'Rejected', rejectReason);
      setShowRejectModal(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Claims List Left Panel */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
            <h3 className="text-lg font-bold text-[#021934]">Receipts ledger</h3>
            <div className="flex bg-slate-200/50 p-1 rounded-xl">
              <button
                onClick={() => setSubTab('pending')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${subTab === 'pending' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Pending ({pendingClaims.length})
              </button>
              <button
                onClick={() => setSubTab('history')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${subTab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                History
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {subTab === 'pending' ? (
              pendingClaims.length > 0 ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                      <th className="px-6 py-3.5">Employee / Ref</th>
                      <th className="px-6 py-3.5 text-right">Amount</th>
                      <th className="px-6 py-3.5">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {pendingClaims.map((claim) => (
                      <tr
                        key={claim.id}
                        onClick={() => setSelectedClaimId(claim.id)}
                        className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedClaimId === claim.id ? 'bg-slate-50 font-semibold' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#021934]">{claim.employeeName}</div>
                          <div className="text-xs font-mono text-slate-400 mt-1">{claim.id}</div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">
                          ₹{claim.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 flex flex-col items-start gap-2">
                          <span className="text-xs text-slate-500 font-medium">{claim.category}</span>
                          <div className="flex gap-2 mt-2">
                            <button onClick={(e) => { e.stopPropagation(); handleVerify(claim.id); }} className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded">Verify</button>
                            <button onClick={(e) => { e.stopPropagation(); handleReturnClaim(claim.id); }} className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded">Return</button>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedClaimId(claim.id); setShowRejectModal(true); }} className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded">Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-slate-300 text-[48px]">verified_user</span>
                  <p className="text-sm text-slate-400 font-medium mt-3">All clear. No pending receipts.</p>
                </div>
              )
            ) : (
              historyClaims.length > 0 ? (
                <>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                      <th className="px-6 py-3.5">Employee / Ref</th>
                      <th className="px-6 py-3.5 text-right">Amount</th>
                      <th className="px-6 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {pagedHistory.pageItems.map((claim) => (
                      <tr
                        key={claim.id}
                        onClick={() => setSelectedClaimId(claim.id)}
                        className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedClaimId === claim.id ? 'bg-slate-50 font-semibold' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#021934]">{claim.employeeName}</div>
                          <div className="text-xs font-mono text-slate-400 mt-1">{claim.id}</div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">
                          ₹{claim.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            claim.status === 'Paid'
                              ? 'bg-blue-50 text-blue-700 border border-blue-100'
                              : claim.status === 'Rejected'
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : 'bg-green-50 text-green-700 border border-green-100'
                          }`}>
                            {claim.status}
                          </span>
                          {claim.status === 'Paid' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onShowSlip(claim); }}
                              className="ml-3 inline-flex items-center gap-1.5 px-3 py-1 bg-[#021934] hover:bg-slate-800 text-white rounded-full text-xs font-bold transition-all shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                              Slip
                            </button>
                          )}
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
                  <p className="text-sm text-slate-400 font-medium mt-3">No historical receipts found.</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Receipt Proof Magnification right panel */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          {selectedClaim ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#021934]">Proof Invoice inspector</h3>
                <p className="text-xs text-slate-400 mt-0.5">Validate invoice details, vendor seal, and compliance limits.</p>
              </div>

              <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 space-y-4">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Vendor Invoice</span>
                  <span className="font-mono text-[#021934] font-bold">{selectedClaim.proofFileName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Stated Amount</span>
                  <span className="font-mono text-[#021934] font-bold">₹{selectedClaim.amount.toFixed(2)}</span>
                </div>

                {/* Clickable zoomed preview area */}
                <div
                  onClick={() => setShowLightbox(true)}
                  className="border border-slate-200 bg-white rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-zoom-in group relative overflow-hidden h-40 transition-colors hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[48px] text-slate-400 group-hover:scale-110 transition-transform">receipt_long</span>
                  <p className="text-xs font-bold text-[#021934] mt-2">Magnified Invoice Detail View</p>
                  <p className="text-[10px] text-slate-400 mt-1">Click to open high-resolution overlay</p>
                  <div className="absolute inset-0 bg-[#021934]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
              </div>

              <div className="text-xs text-slate-500 leading-normal bg-slate-50 p-4 rounded-xl border border-slate-100">
                <strong>Auditing Guidelines:</strong> Ensure the receipt date corresponds with business hours, matches the description ({selectedClaim.description}), and contains matching transaction IDs before verifying claim.
              </div>

            </div>
          ) : (
            <p className="text-sm text-slate-400 italic text-center py-12">Select a claim to inspect proof files.</p>
          )}
        </div>

      </div>

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

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">Reject Expense Claim</h3>
              <button onClick={() => setShowRejectModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleRejectClaimSubmit}>
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-xs text-red-800 leading-normal">
                Please state the reason for rejecting this claim. The employee will receive an automated notification.
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Rejection Reason</label>
                <textarea
                  required
                  placeholder="e.g., Exceeded monthly limits for this category..."
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-red-500/20 outline-none"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
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
    </>
  );
}
