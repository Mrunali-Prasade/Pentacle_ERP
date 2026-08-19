import React, { useState } from 'react';

interface EmployeeDirectoryProps {
  employeesList: any[];
  readOnly?: boolean;
  onAddEmployee?: () => void;
  onEditEmployee?: (emp: any) => void;
  onDeleteEmployee?: (id: string) => void;
}

export default function EmployeeDirectory({
  employeesList = [],
  readOnly = false,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee
}: EmployeeDirectoryProps) {
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryFilterStatus, setDirectoryFilterStatus] = useState('all');

  const filteredDirectoryEmployees = employeesList.filter(emp => {
    const search = (directorySearch || '').toLowerCase().trim();
    const empName = (emp.name || '').toLowerCase();
    const empEmail = (emp.email || '').toLowerCase();
    const empId = (emp.id || '').toLowerCase();
    const empCode = (emp.employeeId || emp.employee_id || '').toLowerCase();

    const matchesSearch = !search || 
                          empName.includes(search) || 
                          empEmail.includes(search) || 
                          empId.includes(search) || 
                          empCode.includes(search);
                          
    const matchesStatus = directoryFilterStatus === 'all' || emp.status === directoryFilterStatus;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50">
        <h3 className="font-bold text-slate-700">Employee Directory</h3>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <input 
              type="text" 
              placeholder="Search name, email, ID..." 
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64 bg-white"
            />
          </div>
          
          <select
            value={directoryFilterStatus}
            onChange={(e) => setDirectoryFilterStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="permanent">Employed</option>
            <option value="probation">Probation</option>
            <option value="resignation_in_process">Resignation in process</option>
            <option value="terminated">Terminated</option>
            <option value="resigned">Resigned</option>
          </select>

          {!readOnly && onAddEmployee && (
            <button
              onClick={onAddEmployee}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Employee
            </button>
          )}
        </div>
      </div>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
            <th className="p-4 font-semibold text-left">Emp ID</th>
            <th className="p-4 font-semibold text-left">Employee</th>
            <th className="p-4 font-semibold text-left">Designation</th>
            <th className="p-4 font-semibold text-left">System Role</th>
            <th className="p-4 font-semibold text-left">Monthly Salary</th>
            <th className="p-4 font-semibold text-left">Status</th>
            {!readOnly && <th className="p-4 font-semibold text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredDirectoryEmployees && filteredDirectoryEmployees.map(emp => (
            <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
              <td className="p-4 text-sm font-medium text-slate-500">{emp.employeeId || emp.employee_id || emp.id.replace('usr-', '').toUpperCase()}</td>
              <td className="p-4">
                <p className="font-bold text-sm text-[#021934]">{emp.name}</p>
                <p className="text-xs text-slate-500">{emp.email}</p>
              </td>
              <td className="p-4 text-sm text-slate-700">{emp.designation}</td>
              <td className="p-4">
                <span className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-xs font-medium text-slate-600 capitalize">
                  {emp.role.replace('_', ' ')}
                </span>
              </td>
              <td className="p-4 text-sm text-slate-700 font-medium">
                {emp.monthlySalary ? `₹${emp.monthlySalary.toLocaleString()}` : <span className="text-slate-400 italic">Not set</span>}
              </td>
              <td className="p-4">
                <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${
                  emp.status === 'permanent' ? 'bg-green-100 text-green-700' :
                  emp.status === 'probation' ? 'bg-blue-100 text-blue-700' :
                  emp.status === 'resignation_in_process' ? 'bg-orange-100 text-orange-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {emp.status ? emp.status.replace(/_/g, ' ') : 'Employed'}
                </span>
              </td>
              {!readOnly && (
                <td className="p-4 text-right">
                  <div className="flex justify-end items-center gap-2">
                    {onEditEmployee && (
                      <button 
                        onClick={() => onEditEmployee(emp)}
                        title="Edit Employee"
                        className="p-1.5 text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 rounded transition-colors flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                    )}
                    {onDeleteEmployee && (
                      <button 
                        onClick={() => onDeleteEmployee(emp.id)}
                        title="Delete Employee"
                        className="p-1.5 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {(!filteredDirectoryEmployees || filteredDirectoryEmployees.length === 0) && (
            <tr>
              <td colSpan={readOnly ? 6 : 7} className="p-8 text-center text-slate-500 text-sm italic">
                No employees found matching your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
