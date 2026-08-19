import React, { useState } from 'react';

interface EmployeeEditModalProps {
  employee: any;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}

export function EmployeeEditModal({ employee, onClose, onSave }: EmployeeEditModalProps) {
  
  const defaultFirstName = employee.first_name || (employee.name ? employee.name.split(' ')[0] : '');
  const defaultLastName = employee.last_name || (employee.name ? employee.name.split(' ').slice(1).join(' ') : '');

  const [formData, setFormData] = useState({
    first_name: defaultFirstName,
    last_name: defaultLastName,
    gender: employee.gender || '',
    marital_status: employee.marital_status || '',
    dob: employee.dob || '',
    employeeId: employee.employeeId || employee.employee_id || '',
    email: employee.email || '',
    mobile_number: employee.mobile_number || '',
    location: employee.location || '',
    country: employee.country || '',
    join_date: employee.join_date || '',
    designation: employee.designation || '',
    role: employee.role || '',
    department: employee.department || '',
    status: employee.status || '',
    is_leave_approver: employee.is_leave_approver ? true : false,
    mediclaim_number: employee.mediclaim_number || '',
    aadhar_number: employee.aadhar_number || '',
    pan_number: employee.pan_number || '',
    uan_number: employee.uan_number || '',
    monthlySalary: employee.monthlySalary || '',
    exit_date: employee.exit_date || ''
  });

  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  };

  const renderFileUpload = (label: string, field: string) => (
    <div className="border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50/50 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-colors relative">
      <input 
        type="file" 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            setFormData(prev => ({
              ...prev,
              [field]: { name: file.name, data: reader.result as string }
            }));
          };
          reader.readAsDataURL(file);
        }}
      />
      <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mb-3 text-orange-500">
        <span className="material-symbols-outlined text-[20px]">upload</span>
      </div>
      <p className="text-sm font-bold text-slate-700 mb-1">
        {(formData as any)[field] ? (formData as any)[field].name || 'File Selected' : 'Choose a file'}
      </p>
      <p className="text-xs text-slate-400">
        {(formData as any)[field] ? 'Click to replace file' : 'Upload PDF or images for this employee'}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto pt-20 pb-20">
      <div className="bg-slate-50 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Update Employee details</h2>
            <p className="text-sm text-slate-500 mt-1">Update the details below to modify existing employee information.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[80vh]">
          <form id="edit-employee-form" onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-8">
            
            {/* Left Column (Profile Pic) */}
            <div className="w-full lg:w-1/3 flex flex-col gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center text-center">
                <label className="w-40 h-40 bg-slate-200 rounded-full flex items-center justify-center mb-6 text-white overflow-hidden border-4 border-white shadow-sm relative group cursor-pointer">
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setFormData(prev => ({
                          ...prev,
                          avatar_file: { name: file.name, data: reader.result as string }
                        }));
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {(formData as any).avatar_file ? (
                    <img src={(formData as any).avatar_file.data} alt="Preview" className="w-full h-full object-cover" />
                  ) : employee.avatar_url ? (
                    <img src={employee.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[48px]">person</span>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-[32px]">photo_camera</span>
                  </div>
                </label>
                <p className="text-xs text-slate-400">Allowed *.jpeg, *.jpg, *.png<br/>max size of 3 Mb</p>
              </div>
            </div>

            {/* Right Column (Form Fields) */}
            <div className="w-full lg:w-2/3 bg-white rounded-xl border border-slate-200 p-8 flex flex-col gap-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name</label>
                  <input type="text" name="first_name" value={formData.first_name} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name</label>
                  <input type="text" name="last_name" value={formData.last_name} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gender</label>
                  <select name="gender" value={formData.gender} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Marital Status</label>
                  <select name="marital_status" value={formData.marital_status} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">Select status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">DOB</label>
                  <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee Code</label>
                  <input type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mobile Number</label>
                  <input type="text" name="mobile_number" value={formData.mobile_number} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location</label>
                  <input type="text" name="location" value={formData.location} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Country</label>
                  <input type="text" name="country" value={formData.country} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">DOJ</label>
                  <input type="date" name="join_date" value={formData.join_date} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation</label>
                  <input type="text" name="designation" value={formData.designation} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Role</label>
                  <select name="role" value={formData.role} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">Select role</option>
                    <option value="employee">Employee</option>
                    <option value="admin_hr">Admin/HR</option>
                    <option value="finance_head">Finance Head</option>
                    <option value="cfo">CFO</option>
                    {/* Super Admin is assigned only by another Super Admin, not from this HR screen. */}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
                  <input type="text" name="department" value={formData.department} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employment Status</label>
                  <select name="status" value={formData.status} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="permanent">Employed</option>
                    <option value="probation">Probation</option>
                    <option value="terminated">Terminated</option>
                    <option value="resignation_in_process">Resignation in process</option>
                    <option value="resigned">Resigned</option>
                  </select>
                </div>
                {(formData.status === 'resigned' || formData.status === 'terminated' || formData.status === 'resignation_in_process') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date of Exit <span className="text-red-500">*</span></label>
                    <input type="date" name="exit_date" value={formData.exit_date} onChange={handleChange} required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-orange-300" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Is Leave Approver?</label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                      <input type="radio" name="is_leave_approver" checked={formData.is_leave_approver === true} onChange={() => setFormData({...formData, is_leave_approver: true})} className="accent-orange-500" /> Yes
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                      <input type="radio" name="is_leave_approver" checked={formData.is_leave_approver === false} onChange={() => setFormData({...formData, is_leave_approver: false})} className="accent-orange-500" /> No
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mediclaim Number</label>
                  <input type="text" name="mediclaim_number" value={formData.mediclaim_number} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Education Documents</label>
                  {renderFileUpload('Education Documents', 'education_docs_file')}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Aadhar Number</label>
                  <input type="text" name="aadhar_number" value={formData.aadhar_number} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Aadhar Card Documents</label>
                  {renderFileUpload('Aadhar Card Documents', 'aadhar_docs_file')}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pan Number</label>
                  <input type="text" name="pan_number" value={formData.pan_number} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pan Card Documents</label>
                  {renderFileUpload('Pan Card Documents', 'pan_docs_file')}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Uan Number</label>
                  <input type="text" name="uan_number" value={formData.uan_number} onChange={handleChange} placeholder="Enter Uan Number" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Monthly Salary (₹)</label>
                  <input type="number" name="monthlySalary" value={formData.monthlySalary} onChange={handleChange} placeholder="Enter Salary Amount" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

              </div>

              {/* Submit Button */}
              <div className="mt-4 border-t border-slate-100 pt-6">
                <button 
                  type="submit" 
                  disabled={saving}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-sm disabled:opacity-70 flex justify-center items-center"
                >
                  {saving ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                  ) : 'Update'}
                </button>
              </div>

            </div>

          </form>
        </div>

      </div>
    </div>
  );
}
