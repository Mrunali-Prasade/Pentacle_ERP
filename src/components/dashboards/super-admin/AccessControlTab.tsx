import { useEffect, useMemo, useState } from 'react';

interface EmployeeOption {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  designation: string | null;
}

interface Permission {
  key: string;
  label: string;
  category: string;
}

interface AccessControlTabProps {
  triggerToast: (message: string, variant?: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  admin_hr: 'HR Admin',
  finance_head: 'Finance Head',
  cfo: 'CFO',
  super_admin: 'Super Admin',
};

export default function AccessControlTab({ triggerToast }: AccessControlTabProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [overrides, setOverrides] = useState<string[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/employees').then(res => res.ok ? res.json() : []),
      fetch('/api/permissions').then(res => res.ok ? res.json() : { permissions: [], roleDefaults: {} }),
    ])
      .then(([employeesData, permData]: [any[], any]) => {
        setEmployees(
          (Array.isArray(employeesData) ? employeesData : [])
            .filter(e => e.role !== 'super_admin' && e.status !== 'resigned' && e.status !== 'terminated')
            .map(e => ({ id: e.id, name: e.name, employeeId: e.employeeId || e.employee_id, role: e.role, designation: e.designation }))
        );
        setPermissions(Array.isArray(permData.permissions) ? permData.permissions : []);
        setRoleDefaults(permData.roleDefaults || {});
      })
      .catch(() => triggerToast('Could not load access control data'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEmployee = employees.find(e => e.id === selectedId) || null;

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q) ||
      ROLE_LABELS[e.role]?.toLowerCase().includes(q)
    );
  }, [employees, search]);

  const permissionsByCategory = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const p of permissions) {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    }
    return groups;
  }, [permissions]);

  const selectEmployee = (id: string) => {
    setSelectedId(id);
    setLoadingOverrides(true);
    fetch(`/api/permissions/user/${id}`)
      .then(res => res.ok ? res.json() : { overrides: [] })
      .then(data => setOverrides(Array.isArray(data.overrides) ? data.overrides : []))
      .catch(() => triggerToast('Could not load this employee\'s permissions'))
      .finally(() => setLoadingOverrides(false));
  };

  const toggleOverride = async (permissionKey: string, currentlyGranted: boolean) => {
    if (!selectedEmployee) return;
    setSavingKey(permissionKey);
    try {
      const res = await fetch(`/api/permissions/user/${selectedEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionKey, granted: !currentlyGranted }),
      });
      if (res.ok) {
        setOverrides(prev =>
          currentlyGranted ? prev.filter(k => k !== permissionKey) : [...prev, permissionKey]
        );
        triggerToast(
          currentlyGranted
            ? `Access revoked for ${selectedEmployee.name}`
            : `Access granted to ${selectedEmployee.name}`
        );
      } else {
        const data = await res.json().catch(() => ({}));
        triggerToast(data.error || 'Failed to update access');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error updating access');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <span className="material-symbols-outlined animate-spin text-slate-300 text-[32px]">sync</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
      {/* Employee picker */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col max-h-[640px]">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-[#021934] mb-2">Select an employee</h3>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <input
              type="text"
              placeholder="Search by name, ID, or role..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {filteredEmployees.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8">No employees match.</p>
          ) : (
            filteredEmployees.map(emp => (
              <button
                key={emp.id}
                onClick={() => selectEmployee(emp.id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${
                  selectedId === emp.id ? 'bg-orange-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="font-bold text-sm text-[#021934]">{emp.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {emp.employeeId} • {ROLE_LABELS[emp.role] || emp.role}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Permission checklist */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
        {!selectedEmployee ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-slate-300 text-[48px]">admin_panel_settings</span>
            <p className="text-sm text-slate-400 font-medium mt-3">Pick an employee on the left to view or change their access.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div>
                <h3 className="text-lg font-bold text-[#021934]">{selectedEmployee.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedEmployee.employeeId} • Role: <span className="font-bold text-slate-700">{ROLE_LABELS[selectedEmployee.role] || selectedEmployee.role}</span>
                </p>
              </div>
            </div>

            {loadingOverrides ? (
              <div className="text-center py-10">
                <span className="material-symbols-outlined animate-spin text-slate-300 text-[28px]">sync</span>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(permissionsByCategory).map(([category, perms]) => (
                  <div key={category}>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{category}</h4>
                    <div className="space-y-2">
                      {perms.map(p => {
                        const includedByRole = (roleDefaults[selectedEmployee.role] || []).includes(p.key);
                        const grantedByOverride = overrides.includes(p.key);
                        const isOn = includedByRole || grantedByOverride;
                        return (
                          <label
                            key={p.key}
                            className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                              includedByRole ? 'bg-slate-50 border-slate-100' : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div>
                              <div className="text-sm font-semibold text-slate-800">{p.label}</div>
                              {includedByRole && (
                                <div className="text-[10px] text-slate-400 mt-0.5">Already included in this employee's role</div>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={isOn}
                              disabled={includedByRole || savingKey === p.key}
                              onChange={() => toggleOverride(p.key, grantedByOverride)}
                              className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 disabled:opacity-40"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
