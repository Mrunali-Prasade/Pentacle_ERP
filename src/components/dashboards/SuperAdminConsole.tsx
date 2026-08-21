import React, { useState } from 'react';
import { UserProfile, Payslip, ReimbursementClaim, GlobalPolicy, GuardrailCategory, AuditLog } from '../../types';
import AdminHRDashboard from './AdminHRDashboard';
import FinanceHeadDashboard from './FinanceHeadDashboard';
import CFODashboard from './CFODashboard';
import SuperAdminDashboard from './SuperAdminDashboard';

// Full-access console for the company head (super_admin). It does NOT introduce any new
// behaviour — it simply mounts the SAME dashboards the operational roles use, each behind a
// top-level tab, so the super_admin can reach every screen. Every child receives exactly the
// props App.tsx already passes it for its own role, so each section behaves identically.
interface SuperAdminConsoleProps {
  user: UserProfile;
  // Data
  policy: GlobalPolicy;
  guardrails: GuardrailCategory[];
  auditLogs: AuditLog[];
  claims: ReimbursementClaim[];
  employeesList: any[];
  payslips: Payslip[];
  // Architect handlers (signatures mirror App.tsx exactly)
  onUpdatePolicy: (updated: Partial<GlobalPolicy>) => void;
  onUpdateGuardrail: (category: string, updated: Partial<GuardrailCategory>) => void;
  onAddAuditLog: (module: string, change: string, before?: string, after?: string) => Promise<void>;
  // Operational handlers
  onUpdateClaimStatus: (claimId: string, status: string, comments?: string) => void;
  onUpdateEmployee: (employeeId: string, data: any) => Promise<void>;
  onDeleteEmployee: (employeeId: string) => void;
  onPayClaim: (claimId: string, proofFileName: string, proofFileData: string) => void;
  onRunPayroll: (month: string) => void;
  triggerToast: (message: string) => void;
}

type ConsoleTab = 'hr' | 'finance' | 'cfo' | 'architect';

const TABS: { key: ConsoleTab; label: string; icon: string }[] = [
  { key: 'hr', label: 'HR Operations', icon: 'groups' },
  { key: 'finance', label: 'Finance & Payroll', icon: 'payments' },
  { key: 'cfo', label: 'CFO Review', icon: 'fact_check' },
  { key: 'architect', label: 'System Architect', icon: 'shield_person' },
];

export default function SuperAdminConsole(props: SuperAdminConsoleProps) {
  const [tab, setTab] = useState<ConsoleTab>('hr');

  return (
    <div className="animate-fade-in">
      {/* Full-access section switcher — a distinct segmented control, clearly a level above each
          dashboard's own tabs. mb-8 keeps the dashboard heading below it from clashing. */}
      <div className="mb-8 flex overflow-x-auto pb-1 -mx-1 px-1">
        <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#021934] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active section — each is the existing role dashboard, unchanged */}
      {tab === 'hr' && (
        <AdminHRDashboard
          claims={props.claims}
          employeesList={props.employeesList}
          onUpdateClaimStatus={props.onUpdateClaimStatus}
          onUpdateEmployee={props.onUpdateEmployee}
          onDeleteEmployee={props.onDeleteEmployee}
          triggerToast={props.triggerToast}
        />
      )}

      {tab === 'finance' && (
        <FinanceHeadDashboard
          payslips={props.payslips}
          claims={props.claims}
          onUpdateClaimStatus={props.onUpdateClaimStatus}
          onPayClaim={props.onPayClaim}
          onRunPayroll={props.onRunPayroll}
          triggerToast={props.triggerToast}
        />
      )}

      {tab === 'cfo' && (
        <CFODashboard
          payslips={props.payslips}
          claims={props.claims}
          employeesList={props.employeesList}
          onUpdateClaimStatus={props.onUpdateClaimStatus}
          triggerToast={props.triggerToast}
        />
      )}

      {tab === 'architect' && (
        <SuperAdminDashboard
          policy={props.policy}
          guardrails={props.guardrails}
          auditLogs={props.auditLogs}
          onUpdatePolicy={props.onUpdatePolicy}
          onUpdateGuardrail={props.onUpdateGuardrail}
          onAddAuditLog={props.onAddAuditLog}
          triggerToast={props.triggerToast}
        />
      )}
    </div>
  );
}
