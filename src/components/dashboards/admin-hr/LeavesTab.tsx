import { useState } from 'react';
import Pagination, { usePagination } from '../../common/Pagination';

interface LeavesTabProps {
  leavesData: any[];
  fetchLeaves: () => void;
  triggerToast: (message: string, variant?: string) => void;
}

export default function LeavesTab({ leavesData, fetchLeaves, triggerToast }: LeavesTabProps) {
  const [approvalModal, setApprovalModal] = useState<{ id: string, paid: number, unpaid: number, days: number } | null>(null);
  const paged = usePagination(leavesData, 12);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-[#021934]">Employee Leave Requests</h3>
          <span className="text-xs font-bold bg-[#021934] text-white px-2.5 py-1 rounded-full uppercase tracking-wider font-mono hidden sm:inline-block">
            {leavesData.length} Total Requests
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Dates</th>
                <th className="px-6 py-4">Days</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leavesData.length > 0 ? (
                paged.pageItems.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-[#021934]">{l.employeeName}</p>
                      <p className="text-xs text-slate-500">{l.employeeCode}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">{l.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-700">{l.fromDate}</p>
                      <p className="text-xs text-slate-400">to {l.toDate}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-700">{l.days} Day(s)</p>
                      <p className="text-[10px] font-bold mt-1">
                        <span className="text-green-600 mr-2">{l.paidDays} Paid</span>
                        {l.unpaidDays > 0 && <span className="text-red-500">{l.unpaidDays} LOP</span>}
                      </p>
                      {l.certificateUrl && (
                        <p className="mt-1"><a href={l.certificateUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline">View Certificate</a></p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        l.status === 'Approved' ? 'bg-green-100 text-green-700' :
                        l.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {l.status}
                      </span>
                      {l.overlap_warning && (
                        <p className="text-[10px] text-red-600 mt-2 font-bold max-w-xs leading-tight">{l.overlap_warning}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {l.status === 'Pending' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setApprovalModal({ id: l.id, paid: l.paidDays, unpaid: l.unpaidDays, days: l.days });
                            }}
                            className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-600 hover:text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              fetch(`/api/leaves/${l.id}/status`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'Rejected' })
                              }).then(res => {
                                if (res.ok) {
                                  triggerToast('Leave request rejected');
                                  fetchLeaves();
                                } else {
                                  triggerToast('Failed to reject leave request');
                                }
                              });
                            }}
                            className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-sm">No leave requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
      </div>

      {approvalModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 p-4">
              <h3 className="font-black text-[#021934] text-lg">Approve Leave Request</h3>
              <p className="text-xs text-slate-500 mt-1">Adjust Paid and Unpaid days before approving.</p>
            </div>
            <form className="p-6 space-y-4" onSubmit={(e) => {
              e.preventDefault();
              fetch(`/api/leaves/${approvalModal.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Approved', paidDays: approvalModal.paid, unpaidDays: approvalModal.unpaid })
              }).then(res => {
                if (res.ok) {
                  triggerToast('Leave request approved');
                  fetchLeaves();
                  setApprovalModal(null);
                } else {
                  triggerToast('Failed to approve leave request');
                }
              });
            }}>
              <div className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Paid Days</label>
                  <input type="number" step="0.5" min="0" max={approvalModal.days} required value={approvalModal.paid} onChange={e => setApprovalModal({ ...approvalModal, paid: parseFloat(e.target.value) || 0, unpaid: Math.max(0, approvalModal.days - (parseFloat(e.target.value) || 0)) })} className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-green-500/20 outline-none" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Unpaid Days (LOP)</label>
                  <input type="number" step="0.5" min="0" max={approvalModal.days} required value={approvalModal.unpaid} onChange={e => setApprovalModal({ ...approvalModal, unpaid: parseFloat(e.target.value) || 0, paid: Math.max(0, approvalModal.days - (parseFloat(e.target.value) || 0)) })} className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-red-500/20 outline-none" />
                </div>
              </div>
              <p className="text-xs text-slate-500">Total Requested Duration: <strong className="text-slate-800">{approvalModal.days} Days</strong></p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setApprovalModal(null)} className="flex-grow py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="flex-grow py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-lg transition-colors">Confirm Approval</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
