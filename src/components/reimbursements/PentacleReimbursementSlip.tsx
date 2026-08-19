import React from 'react';
import { ReimbursementClaim } from '../../types';

interface PentacleReimbursementSlipProps {
  claim: ReimbursementClaim;
  user: any; // Using any here because we fetch all employee details not just the summary UserProfile
}

export default function PentacleReimbursementSlip({ claim, user }: PentacleReimbursementSlipProps) {
  return (
    <div className="bg-white text-[#021934] p-8 max-w-4xl mx-auto border border-slate-300 font-sans text-sm shadow-xl mt-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold uppercase">PENTACLE CONSULTANTS (I) PVT LTD</h1>
        <p className="text-xs text-slate-600 mt-1">Unit no 1709, A-wing, One Lodha Place, Senapati Bapat Marg, Lower Parel, Mumbai - 400013</p>
        <h2 className="text-md font-bold mt-4 bg-orange-600 text-white py-1 inline-block px-4">
          REIMBURSEMENT SLIP - CLAIM {claim.id}
        </h2>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-xs"><strong>Date Printed:</strong> {new Date().toLocaleDateString()}</p>
        </div>
        <div className="text-right">
          <p className="text-xs"><strong>Status:</strong> {claim.status}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0 border-t border-l border-[#021934] mb-8">
        <div className="border-r border-b border-[#021934] p-0">
          <table className="w-full text-left border-collapse">
            <tbody>
              <tr>
                <td className="p-2 border-b border-[#021934] font-bold bg-[#021934] text-white" colSpan={2}>Employee details</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>Employee Code:</strong> {user.employeeId || 'N/A'}</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>Name:</strong> {user.name}</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>Designation:</strong> {user.designation || 'N/A'}</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>Department:</strong> {user.department || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border-r border-b border-[#021934] p-0">
          <table className="w-full text-left border-collapse">
            <tbody>
              <tr>
                <td className="p-2 border-b border-[#021934] font-bold bg-[#021934] text-white" colSpan={2}>Statutory & bank details</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>PAN No.:</strong> {user.panNumber || 'N/A'}</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>Bank Name:</strong> {user.bankName || 'N/A'}</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>Account No.:</strong> {user.bankAccount || 'N/A'}</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-[#021934]"><strong>Work Location:</strong> {user.location || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <table className="w-full text-left border-collapse border border-[#021934] mb-8">
        <thead>
          <tr className="bg-[#021934] text-white">
            <th className="p-2 border border-[#021934] w-2/3">Expense Details</th>
            <th className="p-2 border border-[#021934] text-right w-1/3">Amount (?)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 border border-[#021934] align-top">
              <div className="font-bold">{claim.category}</div>
              <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{claim.description}</div>
              <div className="text-xs text-slate-500 mt-2">Expense Date: {claim.expenseDate}</div>
              {claim.costCentre && (
                <div className="text-xs text-slate-500">Cost Centre: {claim.costCentre}</div>
              )}
            </td>
            <td className="p-2 border border-[#021934] text-right font-mono align-top">{claim.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="p-2 border border-[#021934] text-right">TOTAL APPROVED AMOUNT</td>
            <td className="p-2 border border-[#021934] text-right font-mono">{claim.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>

      {claim.comments && (
        <div className="mb-12 border border-slate-300 p-4 rounded bg-slate-50 text-xs">
          <strong>Reviewer Comments:</strong>
          <p className="mt-1 text-slate-700">{claim.comments}</p>
        </div>
      )}

      <div className="flex justify-between items-end mt-16 text-center text-xs">
        <div>
          <div className="w-40 border-t border-slate-400 mx-auto pt-2">
            <strong>Employee Signature</strong>
          </div>
        </div>
        <div className="text-slate-400">
          * This is a computer generated document and does not require a physical signature.
        </div>
        <div>
          <div className="w-40 border-t border-slate-400 mx-auto pt-2">
            <strong>Authorized Signatory</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
