import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  Payslip, 
  ReimbursementClaim, 
  GlobalPolicy, 
  GuardrailCategory, 
  AuditLog, 
  UserRole 
} from './types';

import LoginView from './components/shared/LoginView';
import EmployeeDashboard from './components/dashboards/EmployeeDashboard';
import PayslipsView from './components/payslips/PayslipsView';
import ReimbursementsView from './components/reimbursements/ReimbursementsView';
import FinanceHeadDashboard from './components/dashboards/FinanceHeadDashboard';
import CFODashboard from './components/dashboards/CFODashboard';
import AdminHRDashboard from './components/dashboards/AdminHRDashboard';
import SuperAdminDashboard from './components/dashboards/SuperAdminDashboard';
import ProfileSettingsView from './components/shared/ProfileSettingsView';
import ExtraAccessView from './components/dashboards/employee/ExtraAccessView';
import ForcePasswordChangeView from './components/shared/ForcePasswordChangeView';

// Every extra-access permission that isn't already covered by a role's normal dashboard.
// Granting any one of these to an account (see Super Admin -> Access Control) makes the
// "Extra Access" nav item appear; 'payslips.edit' is excluded because it already has its own
// dedicated hook (see canEdit on PayslipsView below), not a tab in ExtraAccessView.
const EXTRA_ACCESS_PERMISSIONS = [
  'reimbursements.approve', 'reimbursements.pay',
  'leaves.approve',
  'penalties.approve',
  'employees.directory.view', 'employees.create', 'employees.edit', 'employees.delete',
  'employees.salary.view', 'employees.salary.edit',
  'loans.manage',
  'dashboard.metrics.view', 'attendance.detailed.view', 'attendance.timing.edit', 'attendance.today.view', 'attendance.history.export', 'attendance.regularisation.approve',
  'payroll.run', 'payroll.lock.view', 'payroll.lock.manage',
  'policy.edit', 'holidays.manage', 'audit_logs.view',
];

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'dashboard' | 'payslips' | 'reimbursements' | 'profile' | 'extraAccess'>('dashboard');

  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [claims, setClaims] = useState<ReimbursementClaim[]>([]);
  const [policy, setPolicy] = useState<GlobalPolicy | null>(null);
  const [guardrails, setGuardrails] = useState<GuardrailCategory[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [employeesList, setEmployeesList] = useState<any[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (message: string) => {
    setToastMessage(message);
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not logged in');
      })
      .then(data => {
        setUser(data);
        fetchData(data.role);
      })
      .catch(() => setUser(null));
  }, []);

  const fetchData = async (role: UserRole) => {
    try {
      if (role === 'employee') {
        const [p, c] = await Promise.all([
          fetch('/api/payslips').then(res => res.json()),
          fetch('/api/reimbursements').then(res => res.json())
        ]);
        setPayslips(p);
        setClaims(c);
      } else if (role === 'admin_hr') {
        const [c, e, p] = await Promise.all([
          fetch('/api/reimbursements').then(res => res.json()),
          fetch('/api/admin/employees').then(res => res.json()),
          fetch('/api/payslips').then(res => res.json())
        ]);
        setClaims(c);
        setEmployeesList(e);
        setPayslips(p);
      } else if (role === 'finance_head' || role === 'cfo') {
        const [c, p, e] = await Promise.all([
          fetch('/api/reimbursements').then(res => res.json()),
          fetch('/api/payslips').then(res => res.json()),
          fetch('/api/admin/employees').then(res => res.json())
        ]);
        setClaims(c);
        setPayslips(p);
        setEmployeesList(e);
      } else if (role === 'super_admin') {
        const [p, g, a] = await Promise.all([
          fetch('/api/policy').then(res => res.json()),
          fetch('/api/guardrails').then(res => res.json()),
          fetch('/api/audit-logs').then(res => res.json())
        ]);
        setPolicy(p);
        setGuardrails(g);
        setAuditLogs(a);
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    }
  };

  const handleLogin = (userData: UserProfile) => {
    setUser(userData);
    setActiveView('dashboard');
    triggerToast(`Welcome to Pentacle Consultants: Logged in as ${userData.name}`);
    fetchData(userData.role);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    triggerToast('Logged out of enterprise session');
  };

  const handleCreateClaim = async (newClaim: Partial<ReimbursementClaim>) => {
    const res = await fetch('/api/reimbursements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newClaim)
    });
    if (res.ok) fetchData(user!.role);
  };

  const handleUpdateClaimStatus = async (claimId: string, status: string, comments?: string) => {
    const res = await fetch(`/api/reimbursements/${claimId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, comments })
    });
    if (res.ok) {
      triggerToast(`Claim ${claimId} marked as ${status}`);
      fetchData(user!.role);
    } else {
      const { error } = await res.json();
      triggerToast(`Error: ${error}`);
    }
  };

  const handlePayClaim = async (claimId: string, proofFileName: string, proofFileData: string) => {
    const res = await fetch(`/api/reimbursements/${claimId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofFileName, proofFileData })
    });
    if (res.ok) {
      triggerToast(`Claim ${claimId} has been paid successfully.`);
      fetchData(user!.role);
    } else {
      const { error } = await res.json();
      triggerToast(`Error: ${error}`);
    }
  };

  const handleRunPayroll = async (month: string) => {
    const res = await fetch('/api/payroll/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month })
    });
    if (res.ok) {
      const data = await res.json();
      triggerToast(`Payroll run complete. Processed ${data.processed} claims.`);
      fetchData(user!.role);
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Payroll run failed.' }));
      triggerToast(error || 'Payroll run failed.');
    }
  };

  const handleUpdateEmployee = async (employeeId: string, data: any) => {
    const res = await fetch(`/api/admin/employees/${employeeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      triggerToast('Employee details successfully updated');
      fetchData(user!.role);
    } else {
      const { error } = await res.json();
      triggerToast(`Update Failed: ${error}`);
      throw new Error(error);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!window.confirm("Are you sure you want to completely delete this employee? This action cannot be undone.")) return;
    
    const res = await fetch(`/api/admin/employees/${employeeId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      triggerToast('Employee successfully deleted');
      fetchData(user!.role);
    } else {
      const { error } = await res.json();
      triggerToast(`Deletion Failed: ${error}`);
    }
  };

  const handleUpdatePolicy = async (newPolicy: GlobalPolicy) => {
    const res = await fetch('/api/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPolicy),
    });
    if (res.ok) {
      setPolicy(newPolicy);
      triggerToast('Global Policy ruleset updated');
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed to update policy' }));
      triggerToast(`Update Failed: ${error}`);
    }
  };

  const handleUpdateGuardrail = (category: string, updated: Partial<GuardrailCategory>) => {
    setGuardrails(prev => prev.map(g => g.category === category ? { ...g, ...updated } : g));
    triggerToast(`${category} guardrails updated`);
  };

  const handleAddAuditLog = async (module: string, change: string, before?: string, after?: string) => {
    const res = await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, changeDescription: change, beforeValue: before, afterValue: after })
    });
    if (res.ok) fetchData(user!.role);
  };

  const handleUpdateProfile = async (updatedFields: Partial<UserProfile>) => {
    const res = await fetch('/api/users/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields)
    });
    if (res.ok) {
      setUser(prev => prev ? { ...prev, ...updatedFields } : null);
      triggerToast('Profile securely updated.');
    } else {
      const { error } = await res.json();
      throw new Error(error || 'Failed to update profile');
    }
  };

  const renderRoleDashboard = () => {
    if (!user) return null;

    if (activeView === 'payslips') {
      return (
        <PayslipsView
          payslips={payslips}
          claims={claims}
          employeeName={user.name}
          triggerToast={triggerToast}
          canEdit={['finance_head', 'cfo', 'super_admin'].includes(user.role) || !!user.permissions?.includes('payslips.edit')}
        />
      );
    }

    if (activeView === 'profile') {
      return (
        <ProfileSettingsView user={user} onUpdateProfile={handleUpdateProfile} triggerToast={triggerToast} />
      );
    }

    if (activeView === 'extraAccess') {
      return (
        <ExtraAccessView
          permissions={user.extraPermissions || []}
          claims={claims}
          onUpdateClaimStatus={handleUpdateClaimStatus}
          onPayClaim={handlePayClaim}
          onRunPayroll={handleRunPayroll}
          triggerToast={triggerToast}
        />
      );
    }

    switch (user.role) {
      case 'employee':
        if (activeView === 'dashboard') {
          return (
            <EmployeeDashboard user={user} payslips={payslips} claims={claims} onChangeView={setActiveView} triggerToast={triggerToast} />
          );
        } else if (activeView === 'reimbursements') {
          return (
            <ReimbursementsView claims={claims} onCreateClaim={handleCreateClaim} triggerToast={triggerToast} employeeName={user.name} user={user} />
          );
        }
        return null;

      case 'admin_hr':
        return (
          <AdminHRDashboard
            claims={claims}
            employeesList={employeesList}
            onUpdateClaimStatus={handleUpdateClaimStatus}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            triggerToast={triggerToast}
          />
        );

      case 'finance_head':
        if (activeView === 'reimbursements') {
          return (
            <ReimbursementsView claims={claims.filter((c: any) => c.userId === user.id || c.employeeId === user.id)} onCreateClaim={handleCreateClaim} triggerToast={triggerToast} employeeName={user.name} user={user} />
          );
        }
        return (
          <FinanceHeadDashboard 
            payslips={payslips}
            claims={claims} 
            onUpdateClaimStatus={handleUpdateClaimStatus} 
            onPayClaim={handlePayClaim}
            onRunPayroll={handleRunPayroll} 
            triggerToast={triggerToast} 
          />
        );

      case 'cfo':
        return (
          <CFODashboard payslips={payslips} claims={claims} employeesList={employeesList} onUpdateClaimStatus={handleUpdateClaimStatus} triggerToast={triggerToast} />
        );

      case 'super_admin':
        return (
          policy ? 
          <SuperAdminDashboard policy={policy} guardrails={guardrails} auditLogs={auditLogs} onUpdatePolicy={handleUpdatePolicy} onUpdateGuardrail={handleUpdateGuardrail} onAddAuditLog={handleAddAuditLog} triggerToast={triggerToast} />
          : <div className="p-8 text-center"><p>Loading Admin Data...</p></div>
        );

      default:
        return (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl">
            <span className="material-symbols-outlined text-[48px] text-slate-300">warning</span>
            <p className="text-sm text-slate-500 font-medium mt-3">Access Denied. Unrecognized system clearance.</p>
          </div>
        );
    }
  };

  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  if (user.forcePasswordChange) {
    return (
      <ForcePasswordChangeView
        userName={user.name}
        onLogout={handleLogout}
        onChanged={() => {
          setUser({ ...user, forcePasswordChange: false });
          triggerToast('Password updated. Welcome to Pentacle Payroll.');
          fetchData(user.role);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20 flex flex-col justify-between overflow-x-clip">
      
      <header className="bg-[#021934] text-white border-b border-white/5 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center shrink-0 w-[140px] md:w-[180px] h-[50px] overflow-hidden relative">
            <img src="/logo-light.png" alt="Pentacle Logo" className="absolute top-1/2 left-0 -translate-y-1/2 h-[75px] w-auto max-w-none cursor-pointer" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
          </div>

          <nav className="hidden md:flex gap-2">
            <button 
              onClick={() => setActiveView('dashboard')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeView === 'dashboard' ? 'bg-white/10 text-orange-400' : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveView('payslips')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeView === 'payslips' ? 'bg-white/10 text-orange-400' : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {user.role === 'employee' && !user.permissions?.includes('payslips.edit') ? 'My Payslips' : 'All Payslips'}
            </button>
            {user.role === 'employee' && (
              <button 
                onClick={() => setActiveView('reimbursements')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeView === 'reimbursements' ? 'bg-white/10 text-orange-400' : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Reimbursements
              </button>
            )}
            {(user.extraPermissions || []).some(p => EXTRA_ACCESS_PERMISSIONS.includes(p)) && (
              <button
                onClick={() => setActiveView('extraAccess')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeView === 'extraAccess' ? 'bg-white/10 text-orange-400' : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Extra Access
              </button>
            )}
          </nav>

          {user.role !== 'employee' && (
            <div className="hidden md:flex items-center gap-2 bg-orange-600/10 border border-orange-500/20 px-3.5 py-1.5 rounded-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                Authorized Console: {user.designation}
              </span>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-extrabold">{user.name}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">{user.designation}</p>
            </div>
            
            <button 
              onClick={() => setActiveView('profile')}
              className="w-10 h-10 rounded-full border border-white/10 overflow-hidden shrink-0 bg-slate-700 hover:ring-2 hover:ring-orange-500 transition-all cursor-pointer"
              title="My Profile"
            >
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>

            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Log Out Session"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>

        </div>
      </header>

      <div className="md:hidden bg-[#021934] text-white border-t border-white/5 px-4 py-2 flex justify-around">
        <button 
          onClick={() => setActiveView('dashboard')}
          className={`flex flex-col items-center p-2 text-[10px] font-bold ${activeView === 'dashboard' ? 'text-orange-400' : 'text-slate-400'}`}
        >
          <span className="material-symbols-outlined text-[20px] mb-1">dashboard</span>
          Overview
        </button>
        <button 
          onClick={() => setActiveView('payslips')}
          className={`flex flex-col items-center p-2 text-[10px] font-bold ${activeView === 'payslips' ? 'text-orange-400' : 'text-slate-400'}`}
        >
          <span className="material-symbols-outlined text-[20px] mb-1">receipt_long</span>
          Payslips
        </button>
        {user.role === 'employee' && (
          <button 
            onClick={() => setActiveView('reimbursements')}
            className={`flex flex-col items-center p-2 text-[10px] font-bold ${activeView === 'reimbursements' ? 'text-orange-400' : 'text-slate-400'}`}
          >
            <span className="material-symbols-outlined text-[20px] mb-1">payments</span>
            Claims
          </button>
        )}
        <button 
          onClick={() => setActiveView('profile')}
          className={`flex flex-col items-center p-2 text-[10px] font-bold ${activeView === 'profile' ? 'text-orange-400' : 'text-slate-400'}`}
        >
          <span className="material-symbols-outlined text-[20px] mb-1">person</span>
          Profile
        </button>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 flex-grow w-full">
        {renderRoleDashboard()}
      </main>

      <footer className="max-w-7xl mx-auto px-4 md:px-6 pt-8 md:pt-12 border-t border-slate-200/60 w-full flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400">
        <p>© 2026 Pentacle Consultants. Secured under state cryptography laws.</p>
        <div className="flex gap-6">
          <a className="hover:text-slate-600 transition-colors" href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a>
          <a className="hover:text-slate-600 transition-colors" href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Protection Policy</a>
          <a className="hover:text-slate-600 transition-colors" href="#compliance" onClick={(e) => e.preventDefault()}>Audit Guardrails</a>
        </div>
      </footer>

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 border border-slate-800 text-white pl-4 pr-6 py-3.5 rounded-xl shadow-2xl animate-slide-in text-xs">
          <span className="material-symbols-outlined text-green-400 text-[20px] fill-1">check_circle</span>
          <div>
            <p className="font-bold uppercase tracking-wider text-green-400 text-[10px]">Action Logged</p>
            <p className="text-slate-300 mt-0.5 leading-relaxed capitalize">{toastMessage}</p>
          </div>
        </div>
      )}

    </div>
  );
}
