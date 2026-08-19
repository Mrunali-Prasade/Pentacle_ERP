import { useEffect, useState } from 'react';
import EmployeeDirectory from '../../employees/EmployeeDirectory';
import { EmployeeEditModal } from '../../employees/EmployeeEditModal';
import AddEmployeeModal from '../admin-hr/AddEmployeeModal';

interface EmployeeDirectoryTabProps {
  permissions: string[];
  triggerToast: (message: string, variant?: string) => void;
}

// Self-contained (fetches its own list) rather than relying on App.tsx's employeesList,
// which is only ever populated for roles that natively show a directory. Mirrors the pattern
// already used by LoansManager / HolidaysTab / PenaltiesPanel for the same reason.
export default function EmployeeDirectoryTab({ permissions, triggerToast }: EmployeeDirectoryTabProps) {
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);

  const canCreate = permissions.includes('employees.create');
  const canEdit = permissions.includes('employees.edit');
  const canDelete = permissions.includes('employees.delete');

  const fetchEmployees = () => {
    fetch('/api/admin/employees')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load employees')))
      .then(data => setEmployeesList(Array.isArray(data) ? data : []))
      .catch(() => triggerToast('Could not load employee directory'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveEmployee = async (data: any) => {
    if (!editingEmployee) return;
    const res = await fetch(`/api/admin/employees/${editingEmployee.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      triggerToast('Employee details successfully updated');
      setEditingEmployee(null);
      fetchEmployees();
    } else {
      const { error } = await res.json();
      triggerToast(`Update Failed: ${error}`);
      throw new Error(error);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!window.confirm('Are you sure you want to completely delete this employee? This action cannot be undone.')) return;
    const res = await fetch(`/api/admin/employees/${employeeId}`, { method: 'DELETE' });
    if (res.ok) {
      triggerToast('Employee successfully deleted');
      fetchEmployees();
    } else {
      const { error } = await res.json();
      triggerToast(`Deletion Failed: ${error}`);
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
    <>
      <EmployeeDirectory
        employeesList={employeesList}
        readOnly={!canEdit && !canDelete}
        onAddEmployee={canCreate ? () => setShowAddModal(true) : undefined}
        onEditEmployee={canEdit ? (emp) => setEditingEmployee(emp) : undefined}
        onDeleteEmployee={canDelete ? handleDeleteEmployee : undefined}
      />

      {showAddModal && (
        <AddEmployeeModal onClose={() => setShowAddModal(false)} triggerToast={triggerToast} />
      )}

      {editingEmployee && (
        <EmployeeEditModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={handleSaveEmployee}
        />
      )}
    </>
  );
}
