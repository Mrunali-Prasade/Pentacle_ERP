import React, { useState } from 'react';

interface AddEmployeeModalProps {
  onClose: () => void;
  triggerToast: (message: string, variant?: string) => void;
}

export default function AddEmployeeModal({ onClose, triggerToast }: AddEmployeeModalProps) {
  const [newEmpData, setNewEmpData] = useState({
    employee_id: '',
    name: '',
    email: '',
    password: '',
    role: 'employee',
    department: '',
    designation: '',
    location: '',
    join_date: '',
    status: 'permanent'
  });

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmpData)
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast('Employee added successfully!');
        onClose();
        setNewEmpData({
          employee_id: '', name: '', email: '', password: '', role: 'employee',
          department: '', designation: '', location: '', join_date: '', status: 'permanent'
        });
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert(data.error || 'Failed to add employee');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error adding employee: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h3 className="font-black text-[#021934] text-lg tracking-tight">Add New Employee</h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">Create a new employee profile and generate credentials.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto bg-white flex-1">
          <form id="addEmployeeForm" onSubmit={handleAddEmployee} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Employee ID *</label>
                <input type="text" required value={newEmpData.employee_id} onChange={(e) => setNewEmpData({ ...newEmpData, employee_id: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="EMP1234" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Full Name *</label>
                <input type="text" required value={newEmpData.name} onChange={(e) => setNewEmpData({ ...newEmpData, name: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Email *</label>
                <input type="email" required value={newEmpData.email} onChange={(e) => setNewEmpData({ ...newEmpData, email: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="john@example.com" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Temporary Password *</label>
                <input type="text" required value={newEmpData.password} onChange={(e) => setNewEmpData({ ...newEmpData, password: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="TempPass123!" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">System Role *</label>
                <select value={newEmpData.role} onChange={(e) => setNewEmpData({ ...newEmpData, role: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none bg-white">
                  <option value="employee">Employee</option>
                  <option value="admin_hr">HR Admin</option>
                  <option value="finance_head">Finance Head</option>
                  <option value="cfo">CFO</option>
                  {/* Super Admin is created only by another Super Admin, not from this screen. */}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
                <select value={newEmpData.status} onChange={(e) => setNewEmpData({ ...newEmpData, status: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none bg-white">
                  <option value="permanent">Permanent</option>
                  <option value="probation">Probation</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Department</label>
                <input type="text" value={newEmpData.department} onChange={(e) => setNewEmpData({ ...newEmpData, department: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Engineering" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Designation</label>
                <input type="text" value={newEmpData.designation} onChange={(e) => setNewEmpData({ ...newEmpData, designation: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Software Engineer" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Location</label>
                <input type="text" value={newEmpData.location} onChange={(e) => setNewEmpData({ ...newEmpData, location: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="New York, NY" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Join Date</label>
                <input type="date" value={newEmpData.join_date} onChange={(e) => setNewEmpData({ ...newEmpData, join_date: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" />
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="addEmployeeForm"
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors"
          >
            Create Employee
          </button>
        </div>
      </div>
    </div>
  );
}
