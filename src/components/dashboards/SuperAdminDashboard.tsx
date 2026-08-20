import React, { useState } from 'react';
import { GlobalPolicy, GuardrailCategory, AuditLog } from '../../types';
import LoansManager from '../shared/LoansManager';
import Pagination, { usePagination } from '../common/Pagination';
import AccessControlTab from './super-admin/AccessControlTab';

interface SuperAdminDashboardProps {
  policy: GlobalPolicy;
  guardrails: GuardrailCategory[];
  auditLogs: AuditLog[];
  onUpdatePolicy: (policy: GlobalPolicy) => void;
  onUpdateGuardrail: (category: string, updated: Partial<GuardrailCategory>) => void;
  onAddAuditLog: (module: string, change: string, before?: string, after?: string) => void;
  triggerToast: (message: string) => void;
}

export default function SuperAdminDashboard({ 
  policy, 
  guardrails, 
  auditLogs, 
  onUpdatePolicy, 
  onUpdateGuardrail,
  onAddAuditLog,
  triggerToast 
}: SuperAdminDashboardProps) {
  const [gracePeriod, setGracePeriod] = useState(policy.lateGracePeriod);
  const [otRate, setOtRate] = useState(policy.overtimeRate);
  const [holidayRate, setHolidayRate] = useState(policy.holidayOtRate);
  const [leaveAccrual, setLeaveAccrual] = useState(policy.leaveAccrual);
  const [slaEscalation, setSlaEscalation] = useState(policy.slaEscalation);

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCap, setEditCap] = useState('');
  const [editProof, setEditProof] = useState(true);
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'REVIEWING'>('ACTIVE');

  const [auditSearch, setAuditSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'policy' | 'finance' | 'access'>('policy');

  const handleSavePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedPolicy: GlobalPolicy = {
      lateGracePeriod: gracePeriod,
      overtimeRate: otRate,
      holidayOtRate: holidayRate,
      leaveAccrual,
      slaEscalation: slaEscalation,
      // Carry through the fields this form does not edit, so saving the policy
      // does not silently blank them out.
      reimbursementCutoffDays: policy.reimbursementCutoffDays,
      cfoApprovalThreshold: policy.cfoApprovalThreshold
    };
    
    // Log the changes
    if (policy.lateGracePeriod !== gracePeriod) {
      onAddAuditLog(
        'Policy Engine', 
        'Late Grace Period adjusted', 
        `Grace: ${policy.lateGracePeriod}m`, 
        `Grace: ${gracePeriod}m`
      );
    }
    if (policy.overtimeRate !== otRate) {
      onAddAuditLog(
        'Policy Engine', 
        'Overtime Rate multiplier adjusted', 
        `OT: ${policy.overtimeRate}`, 
        `OT: ${otRate}`
      );
    }

    onUpdatePolicy(updatedPolicy);
    triggerToast('Global system policy constants successfully written to database');
  };

  const handleEditGuardrailClick = (g: GuardrailCategory) => {
    setEditingCategory(g.category);
    setEditCap(g.monthlyCap.toString());
    setEditProof(g.proofRequired);
    setEditStatus(g.status);
  };

  const handleSaveGuardrail = () => {
    if (editingCategory) {
      const parsedCap = parseFloat(editCap) || 0;
      const original = guardrails.find(g => g.category === editingCategory);
      
      onUpdateGuardrail(editingCategory, {
        monthlyCap: parsedCap,
        proofRequired: editProof,
        status: editStatus
      });

      if (original) {
        onAddAuditLog(
          'Reimbursements Compliance', 
          `${editingCategory} guardrails updated`, 
          `Cap: ₹${original.monthlyCap}, Proof: ${original.proofRequired}`, 
          `Cap: ₹${parsedCap}, Proof: ${editProof}`
        );
      }

      setEditingCategory(null);
      triggerToast(`${editingCategory} guardrail policies updated in real-time engine`);
    }
  };

  const filteredLogs = auditLogs.filter(log => {
    const searchLower = auditSearch.toLowerCase();
    return (
      log.actor.toLowerCase().includes(searchLower) ||
      log.module.toLowerCase().includes(searchLower) ||
      log.changeDescription.toLowerCase().includes(searchLower) ||
      log.id.toLowerCase().includes(searchLower)
    );
  });
  const paged = usePagination(filteredLogs, 15);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-[#021934] tracking-tight">System Policy Engine</h2>
        <p className="text-sm text-slate-500 mt-1">Review the rules the system applies, the reimbursement spend caps, and the audit trail.</p>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 flex gap-6">
        <button
          onClick={() => setActiveTab('policy')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'policy'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          System Policy
          {activeTab === 'policy' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'finance'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Finance
          {activeTab === 'finance' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('access')}
          className={`pb-4 text-sm font-bold transition-all relative ${
            activeTab === 'access'
              ? 'text-[#021934]'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Access Control
          {activeTab === 'access' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>
          )}
        </button>
      </div>

      {/* Finance Tab */}
      {activeTab === 'finance' && (
        <LoansManager triggerToast={triggerToast} />
      )}

      {/* Access Control Tab */}
      {activeTab === 'access' && (
        <AccessControlTab triggerToast={triggerToast} />
      )}

      {activeTab === 'policy' && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: the rules the system actually applies (read-only) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
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

        {/* Right: reimbursement spend caps (read-only) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-[#021934]">Reimbursement Guardrails</h3>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                <span className="material-symbols-outlined text-[13px]">lock</span> Read-only
              </span>
            </div>
            <div className="space-y-4">
              {guardrails.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">No spend caps are configured.</p>
              )}
              {guardrails.map((g) => (
                <div key={g.category} className="border border-slate-100 p-4 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{g.category}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Cap: <span className="font-mono font-bold text-slate-600">&#8377;{g.monthlyCap.toLocaleString()}</span> &bull;{' '}
                      Proof: <span className="font-semibold text-slate-500">{g.proofRequired ? 'Required' : 'None'}</span>
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    g.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                  }`}>
                    {g.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-400 italic text-center mt-6">
            Spend caps are applied when employees submit claims. They are read-only here.
          </div>
        </div>
      </div>

      {/* System Audit Trail View bottom */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-[#021934]">Cryptographic System Audit Trail</h3>
            <p className="text-xs text-slate-400 mt-0.5">Live immutable verification history of configuration and policy adjustments.</p>
          </div>
          <div className="relative w-full md:w-72 shrink-0">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <input 
              type="text"
              placeholder="Search audit trail by actor, module..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#021934]/10 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredLogs.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5">ID / Timestamp</th>
                  <th className="px-6 py-3.5">Actor</th>
                  <th className="px-6 py-3.5">Module</th>
                  <th className="px-6 py-3.5">Change Action</th>
                  <th className="px-6 py-3.5">Delta Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-mono text-slate-700">
                {paged.pageItems.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#021934] text-xs">{log.id}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{log.timestamp}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-sans">
                      <div className="font-semibold text-slate-800">{log.actor}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{log.role}</div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 border border-slate-200 uppercase">
                        {log.module}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-sans text-[#021934] font-medium">
                      {log.changeDescription}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {log.beforeValue && log.afterValue ? (
                        <div className="space-y-0.5">
                          <p className="text-red-500 line-through text-[10px]">{log.beforeValue}</p>
                          <p className="text-green-600 font-bold text-[10px]">{log.afterValue}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-slate-300 text-[48px]">search_off</span>
              <p className="text-sm text-slate-400 mt-3 font-medium">No matching audit logs found.</p>
            </div>
          )}
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
        </div>
      </section>
      </>
      )}
    </div>
  );
}
