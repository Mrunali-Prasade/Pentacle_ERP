import React, { useState } from 'react';

interface ForcePasswordChangeViewProps {
  userName: string;
  onChanged: () => void;
  onLogout: () => void;
}

// Shown as a full-screen gate when the account still has force_password_change set. The backend
// blocks every other route until this succeeds (see requireAuth), so this is not skippable.
export default function ForcePasswordChangeView({ userName, onChanged, onLogout }: ForcePasswordChangeViewProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        onChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not update password. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-[#021934] px-6 py-5">
          <div className="flex items-center gap-2.5 text-orange-400">
            <span className="material-symbols-outlined">lock_reset</span>
            <h1 className="text-base font-bold text-white">Set a new password</h1>
          </div>
          <p className="text-xs text-slate-300 mt-1.5">
            Welcome, {userName.split(' ')[0]}. For security, you must replace your temporary password before using the system.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">New password</label>
            <input
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter the password"
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-medium rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#021934] hover:bg-slate-800 text-white font-bold text-sm py-3 rounded-xl transition-colors shadow-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Set password and continue'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full text-slate-400 hover:text-slate-600 text-xs font-bold py-1 transition-colors"
          >
            Log out instead
          </button>
        </form>
      </div>
    </div>
  );
}
