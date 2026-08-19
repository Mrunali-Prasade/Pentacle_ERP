import React, { useState, useRef } from 'react';
import { ReimbursementClaim } from '../../types';
import PentacleReimbursementSlip from './PentacleReimbursementSlip';

// A proof/payment file is only ever a same-origin path (e.g. /api/uploads/...). Reject anything
// else — including protocol-relative "//host" URLs — so a stray value can't frame an external
// document inside the trusted approval UI.
const isSafeFilePath = (v?: string | null): v is string =>
  typeof v === 'string' && v.startsWith('/') && !v.startsWith('//');

interface ReimbursementsViewProps {
  claims: ReimbursementClaim[];
  onCreateClaim: (claim: Partial<ReimbursementClaim>) => void;
  triggerToast: (message: string) => void;
  employeeName: string;
  user?: any;
}

export default function ReimbursementsView({ 
  claims, 
  onCreateClaim, 
  triggerToast,
  employeeName,
  user
}: ReimbursementsViewProps) {
  const [selectedClaimId, setSelectedClaimId] = useState<string>(claims[0]?.id || '');
  const [showNewClaimModal, setShowNewClaimModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showPaymentLightbox, setShowPaymentLightbox] = useState(false);
  const [showSlip, setShowSlip] = useState(false);
  
  // New Claim Form State
  const [category, setCategory] = useState('Travel & Lodging');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string; file: File } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedClaim = claims.find(c => c.id === selectedClaimId) || claims[0];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // The file is sent base64-encoded inside JSON, which inflates it by about a third, and
  // the hosting platform rejects request bodies over 4.5 MB. Anything above roughly 3 MB
  // therefore fails as an opaque network error, so it is caught here with a clear message.
  const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;

  const acceptFile = (file: File): boolean => {
    const isAllowedType = /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!isAllowedType) {
      triggerToast('Only PDF, PNG or JPG receipts are accepted.');
      return false;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      triggerToast(
        `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is 3 MB — ` +
        `please compress it or photograph the receipt at a lower resolution.`
      );
      return false;
    }
    setUploadedFile({
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
      file: file
    });
    triggerToast(`Receipt ${file.name} attached`);
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) acceptFile(e.target.files[0]);
    e.target.value = '';
  };

  const handleTriggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Set when the employee is correcting an existing claim rather than creating a new one.
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);

  const startEditing = (claim: ReimbursementClaim) => {
    setEditingClaimId(claim.id);
    setCategory(claim.category);
    setAmount(String(claim.amount));
    setDescription(claim.description || '');
    setExpenseDate(claim.expenseDate);
    setUploadedFile(null); // keep the existing receipt unless a new one is attached
    setShowNewClaimModal(true);
  };

  const resetForm = () => {
    setEditingClaimId(null);
    setAmount('');
    setDescription('');
    setCategory('Travel & Lodging');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setUploadedFile(null);
    setShowNewClaimModal(false);
  };

  const handleCancelClaim = async (claimId: string) => {
    if (!window.confirm('Withdraw this claim? It will no longer be reviewed.')) return;
    const res = await fetch(`/api/reimbursements/${claimId}/cancel`, { method: 'POST' });
    if (res.ok) {
      triggerToast(`Claim ${claimId} withdrawn`);
      window.location.reload();
    } else {
      const { error } = await res.json();
      triggerToast(error || 'Could not withdraw the claim');
    }
  };

  const handleSubmitClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      alert('Please specify a valid amount.');
      return;
    }
    // When editing, the existing receipt is kept unless a replacement is attached.
    if (!uploadedFile && !editingClaimId) {
      triggerToast('Please upload a proof receipt (Image or PDF)');
      return;
    }

    const send = async (base64Data: string | null) => {
      const payload: any = {
        expenseDate,
        category,
        amount: parseFloat(amount),
        currency: 'INR',
        description,
        proofFileName: uploadedFile?.name ?? 'existing-receipt',
        proofFileSize: uploadedFile?.size?.toString(),
      };
      if (base64Data) payload.proofFileData = base64Data;

      try {
        if (editingClaimId) {
          const res = await fetch(`/api/reimbursements/${editingClaimId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const { error } = await res.json();
            triggerToast(error || 'Could not update the claim');
            return;
          }
          triggerToast(`Claim ${editingClaimId} resubmitted`);
          resetForm();
          window.location.reload();
          return;
        }

        await onCreateClaim(payload);
        triggerToast('Claim submitted for Admin Audit');
        resetForm();
      } catch (err) {
        triggerToast('Network error during submission');
      }
    };

    if (!uploadedFile?.file) { send(null); return; }
    const reader = new FileReader();
    reader.onloadend = () => send(reader.result as string);
    reader.readAsDataURL(uploadedFile.file);
  };

  if (showSlip && selectedClaim) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col md:flex-row overflow-hidden animate-fade-in print:bg-white print:block">
        <div className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="min-h-full p-4 md:p-8 flex items-start justify-center print:p-0">
            <div className="w-full max-w-4xl relative">
              <div className="flex-1 flex flex-col bg-white print:p-0 p-4 shadow-2xl">
                <PentacleReimbursementSlip claim={selectedClaim} user={user || {
                  name: employeeName,
                  employeeId: 'N/A',
                  designation: 'N/A',
                  department: 'N/A'
                }} />
              </div>

              <div className="mt-8 flex justify-end gap-3 print:hidden pb-12">
                <button 
                  onClick={() => setShowSlip(false)}
                  className="px-6 py-2.5 rounded-lg font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => window.print()}
                  className="px-6 py-2.5 rounded-lg font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">print</span>
                  Print Slip
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* LIGHTBOX FOR PAYMENT PROOF OVERLAY */}
        {showPaymentLightbox && selectedClaim && selectedClaim.paymentProofFileName && (
          <div 
            onClick={() => setShowPaymentLightbox(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xs cursor-zoom-out animate-fade-in"
          >
            <div className="relative bg-white border border-slate-200 shadow-2xl p-8 max-w-2xl w-full text-[#021934] space-y-6">
              
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h4 className="text-lg font-bold">Magnified Payment Proof</h4>
                  <p className="text-xs text-slate-400">Accounts Disbursement View — {selectedClaim.id}</p>
                </div>
                <button className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
  
              <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center p-2 min-h-[300px]">
                {!isSafeFilePath(selectedClaim.paymentProofFileName) ? (
                  <div className="text-center text-slate-400 py-12"><p>No payment proof available.</p></div>
                ) : (selectedClaim.paymentProofFileName.toLowerCase().endsWith('.pdf') || selectedClaim.paymentProofFileName.startsWith('/api/files/')) ? (
                  <iframe 
                    src={selectedClaim.paymentProofFileName} 
                    className="w-full h-[60vh] border-0 rounded"
                    title="Payment Proof PDF"
                  />
                ) : (
                  <img 
                    src={selectedClaim.paymentProofFileName} 
                    alt="Payment Proof" 
                    className="max-w-full max-h-[60vh] object-contain shadow-sm"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#021934] tracking-tight">Reimbursement Claims</h2>
          <p className="text-sm text-slate-500 mt-1">Submit, monitor, and audit your business-related operational expenses.</p>
        </div>
        <button 
          onClick={() => setShowNewClaimModal(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-lg shadow-orange-600/10 flex items-center gap-2 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          File Reimbursement Claim
        </button>
      </div>

      {/* SLA Horizontal Workflow Bar for Selected Claim */}
      {selectedClaim && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Claims SLA Tracker</p>
              <h3 className="text-base font-bold text-[#021934] mt-1">
                Ref: {selectedClaim.id} — <span className="font-mono text-orange-600">₹{selectedClaim.amount.toFixed(2)}</span>
              </h3>
            </div>
            <div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                selectedClaim.status === 'Paid' 
                  ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                  : selectedClaim.status === 'Approved-for-Payroll' 
                    ? 'bg-green-50 text-green-700 border border-green-100' 
                    : selectedClaim.status === 'Rejected'
                      ? 'bg-red-50 text-red-700 border border-red-100'
                      : 'bg-orange-50 text-orange-700 border border-orange-100'
              }`}>
                {selectedClaim.status}
              </span>
              
              {selectedClaim.status === 'Paid' && (
                <button 
                  onClick={() => setShowSlip(true)}
                  className="ml-3 inline-flex items-center gap-1.5 px-3 py-1 bg-[#021934] hover:bg-slate-800 text-white rounded-full text-xs font-bold transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                  Slip
                </button>
              )}
            </div>
          </div>

          {/* Stepper Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative">
            {/* Step 1: Employee Submitted */}
            <div className="flex flex-col items-center text-center relative z-10">
              <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm">
                <span className="material-symbols-outlined text-[18px]">check</span>
              </div>
              <p className="text-xs font-bold text-[#021934] mt-2">Submitted</p>
              <p className="text-[10px] text-slate-400 mt-1">Sarah Jenkins</p>
            </div>

            {/* Step 2: Admin Verified */}
            <div className="flex flex-col items-center text-center relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                selectedClaim.status !== 'Rejected' && (selectedClaim.status === 'Approved-for-Payroll' || selectedClaim.status === 'Paid' || selectedClaim.timeline[1]?.completed)
                  ? 'bg-green-500 text-white border-green-500' 
                  : 'bg-white text-slate-400 border-slate-200'
              }`}>
                {selectedClaim.status !== 'Rejected' && (selectedClaim.status === 'Approved-for-Payroll' || selectedClaim.status === 'Paid' || selectedClaim.timeline[1]?.completed) ? (
                  <span className="material-symbols-outlined text-[18px]">check</span>
                ) : (
                  '2'
                )}
              </div>
              <p className="text-xs font-bold text-[#021934] mt-2">Admin Verified</p>
              <p className="text-[10px] text-slate-400 mt-1">S. Miller (HR)</p>
            </div>

            {/* Step 3: Finance Head Approval */}
            <div className="flex flex-col items-center text-center relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                selectedClaim.status === 'Approved-for-Payroll' || selectedClaim.status === 'Paid'
                  ? 'bg-green-500 text-white border-green-500' 
                  : selectedClaim.status === 'Finance-Verified'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-400 border-slate-200'
              }`}>
                {selectedClaim.status === 'Approved-for-Payroll' || selectedClaim.status === 'Paid' ? (
                  <span className="material-symbols-outlined text-[18px]">check</span>
                ) : (
                  '3'
                )}
              </div>
              <p className="text-xs font-bold text-[#021934] mt-2">Finance Approved</p>
              <p className="text-[10px] text-slate-400 mt-1">A. Henderson</p>
            </div>

            {/* Step 4: CFO Final Review */}
            <div className="flex flex-col items-center text-center relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                selectedClaim.status === 'Paid' 
                  ? 'bg-green-500 text-white border-green-500' 
                  : selectedClaim.status === 'Approved-for-Payroll'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-400 border-slate-200'
              }`}>
                {selectedClaim.status === 'Paid' ? (
                  <span className="material-symbols-outlined text-[18px]">check</span>
                ) : (
                  '4'
                )}
              </div>
              <p className="text-xs font-bold text-[#021934] mt-2">CFO Signed</p>
              <p className="text-[10px] text-slate-400 mt-1">Charles Vance</p>
            </div>

            {/* Step 5: Paid */}
            <div className="flex flex-col items-center text-center relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                selectedClaim.status === 'Paid' 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : 'bg-white text-slate-400 border-slate-200'
              }`}>
                <span className="material-symbols-outlined text-[18px]">payments</span>
              </div>
              <p className="text-xs font-bold text-[#021934] mt-2">Bank Cleared</p>
              <p className="text-[10px] text-slate-400 mt-1">System Release</p>
            </div>

            {/* Connecting lines for desktop */}
            <div className="hidden md:block absolute top-5 left-[10%] right-[10%] h-[2px] bg-slate-100 -z-0"></div>
          </div>
        </section>
      )}

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Claims Table Left Panel */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-lg font-bold text-[#021934]">Your Claims History</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Date / Ref</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5 text-right">Amount</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {claims.filter(c => c.employeeName === 'Sarah Jenkins' || c.employeeName === employeeName).map((claim) => (
                  <tr 
                    key={claim.id}
                    onClick={() => setSelectedClaimId(claim.id)}
                    className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedClaimId === claim.id ? 'bg-slate-50/70 border-l-4 border-orange-600 pl-5' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#021934]">{claim.date}</div>
                      <div className="text-xs font-mono text-slate-400 mt-1">{claim.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-700">{claim.category}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[180px] mt-0.5">{claim.description}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">
                      ₹{claim.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-row items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          claim.status === 'Paid'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : claim.status === 'Approved-for-Payroll'
                              ? 'bg-green-50 text-green-700 border border-green-100'
                              : claim.status === 'Rejected'
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : 'bg-orange-50 text-orange-700 border border-orange-100'
                        }`}>
                          {claim.status}
                        </span>
                        {claim.status === 'Paid' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedClaimId(claim.id); setShowSlip(true); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#021934] hover:bg-slate-800 text-white rounded-full text-xs font-bold transition-all shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                            Slip
                          </button>
                        )}
                        {/* Until a reviewer accepts it, the claim is still the employee's to
                            correct or withdraw. Previously a typo meant asking HR to reject it. */}
                        {(claim.status === 'Submitted' || claim.status === 'Returned') && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditing(claim); }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-[10px] font-bold transition-colors"
                            >
                              {claim.status === 'Returned' ? 'Correct & resubmit' : 'Edit'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelClaim(claim.id); }}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-full text-[10px] font-bold transition-colors"
                            >
                              Withdraw
                            </button>
                          </div>
                        )}
                        {claim.status === 'Returned' && claim.comments && (
                          <p className="text-[10px] text-amber-700 max-w-xs leading-tight">
                            Sent back: {claim.comments}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Claim Details Timeline Right Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#021934] mb-6 border-b border-slate-100 pb-4">Verification Audit Trail</h3>
            
            {selectedClaim ? (
              <div className="space-y-6">
                
                {/* Stepper Timeline */}
                <div className="space-y-6">
                  {selectedClaim.timeline.map((item, idx) => (
                    <div key={idx} className="flex gap-4 relative">
                      {/* Connecting Line */}
                      {idx < selectedClaim.timeline.length - 1 && (
                        <div className={`absolute top-6 left-3 w-[2px] h-[calc(100%+24px)] ${
                          item.completed ? 'bg-green-500' : 'bg-slate-100'
                        }`}></div>
                      )}
                      
                      <div className={`w-6.5 h-6.5 rounded-full flex items-center justify-center shrink-0 z-10 border-2 ${
                        item.completed 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : selectedClaim.status === 'Rejected' && !item.completed
                            ? 'bg-red-100 border-red-200 text-red-600'
                            : 'bg-white border-slate-200 text-slate-300'
                      }`}>
                        {item.completed ? (
                          <span className="material-symbols-outlined text-[14px]">check</span>
                        ) : selectedClaim.status === 'Rejected' ? (
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                        )}
                      </div>
                      
                      <div>
                        <p className={`text-xs font-bold ${item.completed ? 'text-[#021934]' : 'text-slate-400'}`}>
                          {item.status}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Actor: {item.actor} • {item.timestamp}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Proof Expense Viewer Card */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mt-8">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Attached Proof of Expense</p>
                  
                  <div className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-lg">
                    <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100">
                      <span className="material-symbols-outlined">receipt_long</span>
                    </div>
                    <div className="flex-grow overflow-hidden">
                      <p className="text-xs font-bold text-slate-700 truncate">{selectedClaim.proofFileName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{selectedClaim.proofFileSize} • Encrypted PDF</p>
                    </div>
                    <button 
                      onClick={() => setShowLightbox(true)}
                      className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">visibility</span>
                    </button>
                  </div>
                </div>
  
                {/* Payment Proof Viewer Card */}
                {selectedClaim.paymentProofFileName && (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mt-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Accounts Payment Proof</p>
                    
                    <div className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-lg border-l-4 border-l-orange-500">
                      <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100">
                        <span className="material-symbols-outlined">payments</span>
                      </div>
                      <div className="flex-grow overflow-hidden">
                        <p className="text-xs font-bold text-slate-700 truncate">Payment_Receipt</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Disbursement Proof</p>
                      </div>
                      <button 
                        onClick={() => setShowPaymentLightbox(true)}
                        className="p-1 hover:bg-orange-50 rounded-lg text-orange-600 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <p className="text-sm text-slate-400 italic text-center py-12">Select a reimbursement claim to inspect audit trails.</p>
            )}
          </div>
        </div>

      </div>

      {/* New Reimbursement Claim Modal */}
      {showNewClaimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-[#021934]">New Expense Claim</h3>
              <button onClick={() => setShowNewClaimModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleSubmitClaim}>
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Category</label>
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none"
                >
                  <option>Travel & Lodging</option>
                  <option>Wellness & Health</option>
                  <option>Software Subscription</option>
                  <option>Learning & Dev</option>
                  <option>Office Supplies</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Amount (₹)</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Date</label>
                  <input 
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Expense Description</label>
                <textarea 
                  required
                  placeholder="Explain what was purchased and why..."
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500/20 outline-none"
                />
              </div>

              {/* Drag and Drop File Upload Area */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Receipt Proof attachment</label>
                
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                    dragActive 
                      ? 'border-orange-500 bg-orange-50/50' 
                      : uploadedFile 
                        ? 'border-green-500 bg-green-50/30' 
                        : 'border-slate-300 hover:border-[#021934] bg-slate-50'
                  }`}
                  onClick={handleTriggerFileSelect}
                >
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,.pdf"
                  />
                  
                  {uploadedFile ? (
                    <div className="flex items-center justify-center gap-3 text-left">
                      <span className="material-symbols-outlined text-green-600 text-[32px] fill-1">check_circle</span>
                      <div>
                        <p className="text-xs font-bold text-[#021934] truncate max-w-[200px]">{uploadedFile.name}</p>
                        <p className="text-[10px] text-slate-400">{uploadedFile.size} • Click to replace</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="material-symbols-outlined text-slate-400 text-[32px]">upload_file</span>
                      <p className="text-xs text-slate-600 mt-2">
                        <strong>Drag & drop invoice</strong> or <span className="text-orange-600 font-bold hover:underline">browse files</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">Supports PDF, PNG, JPG up to 3MB</p>
                    </div>
                  )}
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-[#021934] hover:bg-slate-800 text-white py-3 rounded-lg text-sm font-semibold transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                File Claim Expense
              </button>
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
                // OneDrive files (/api/files/<id>) carry no extension — use the iframe viewer,
                // which the backend serves inline for both images and PDFs.
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
            <p className="text-xs text-slate-500 italic text-center">Receipt uploaded for reimbursement.</p>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR PAYMENT PROOF OVERLAY (MAIN VIEW) */}
      {showPaymentLightbox && selectedClaim && selectedClaim.paymentProofFileName && (
        <div 
          onClick={() => setShowPaymentLightbox(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xs cursor-zoom-out animate-fade-in"
        >
          <div className="relative bg-white border border-slate-200 shadow-2xl p-8 max-w-2xl w-full text-[#021934] space-y-6">
            
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-lg font-bold">Magnified Payment Proof</h4>
                <p className="text-xs text-slate-400">Accounts Disbursement View — {selectedClaim.id}</p>
              </div>
              <button className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center p-2 min-h-[300px]">
              {(selectedClaim.paymentProofFileName.toLowerCase().endsWith('.pdf') || selectedClaim.paymentProofFileName.startsWith('/api/files/')) ? (
                <iframe 
                  src={selectedClaim.paymentProofFileName} 
                  className="w-full h-[60vh] border-0 rounded"
                  title="Payment Proof PDF"
                />
              ) : (
                <img 
                  src={selectedClaim.paymentProofFileName} 
                  alt="Payment Proof" 
                  className="max-w-full max-h-[60vh] object-contain shadow-sm"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
