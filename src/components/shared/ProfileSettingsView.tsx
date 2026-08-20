import React, { useState } from 'react';
import { UserProfile } from '../../types';
import Avatar from '../common/Avatar';

interface ProfileSettingsViewProps {
  user: UserProfile;
  onUpdateProfile: (updatedFields: Partial<UserProfile>) => Promise<void>;
  triggerToast: (message: string) => void;
}

export default function ProfileSettingsView({ user, onUpdateProfile, triggerToast }: ProfileSettingsViewProps) {
  const [bankName, setBankName] = useState(user.bankName || '');
  const [bankAccount, setBankAccount] = useState(user.bankAccount || '');
  const [panNumber, setPanNumber] = useState(user.panNumber || '');
  const [uanNumber, setUanNumber] = useState(user.uanNumber || '');
  const [location, setLocation] = useState(user.location || '');
  const [state, setState] = useState(user.state || '');
  const [joinDate, setJoinDate] = useState(user.joinDate || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await onUpdateProfile({
        bankName,
        bankAccount,
        panNumber,
        uanNumber,
        location,
        state,
        joinDate
      });
    } catch (err: any) {
      triggerToast(`Failed to update profile: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in p-6 sm:p-10 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold text-[#021934] tracking-tight">My Profile Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Update your bank and taxation details for seamless payroll processing.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-md bg-slate-700">
              <Avatar name={user.name} src={user.avatarUrl} className="w-full h-full text-xl" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#021934]">{user.name}</h3>
              <p className="text-sm text-slate-500">{user.designation} • {user.department}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          <h4 className="text-sm font-bold text-[#021934] uppercase tracking-wider border-b border-slate-100 pb-2">Financial Details</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Bank Name</label>
              <input 
                type="text" 
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                placeholder="e.g. HDFC Bank"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Bank Account Number</label>
              <input 
                type="text" 
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                placeholder="e.g. 5010023412345"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">PAN Number</label>
              <input 
                type="text" 
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono uppercase"
                placeholder="e.g. ABCDE1234F"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">UAN Number</label>
              <input 
                type="text" 
                value={uanNumber}
                onChange={(e) => setUanNumber(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                placeholder="e.g. 100904319203"
              />
            </div>
          </div>

          <h4 className="text-sm font-bold text-[#021934] uppercase tracking-wider border-b border-slate-100 pb-2 pt-4">Additional Details</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Work Location</label>
              <input 
                type="text" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder="e.g. Mumbai, Navi Mumbai"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">State</label>
              <input 
                type="text" 
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder="e.g. Maharashtra"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Date of Joining</label>
              <input 
                type="date" 
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              />
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-[#021934] hover:bg-[#032a56] text-white font-semibold text-sm px-8 py-3 rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 flex items-center gap-2"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
              {!isSubmitting && <span className="material-symbols-outlined text-[18px]">save</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
