import React, { useState } from 'react';

interface LoginViewProps {
  onLogin: (user: any) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      onLogin(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex items-center justify-center min-h-screen p-6 overflow-hidden bg-slate-100">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
            backgroundSize: '26px 26px'
          }}
        />
        <div className="absolute -top-[15%] -left-[10%] w-[45%] h-[45%] bg-[#021934] opacity-[0.06] rounded-full blur-[130px]"></div>
        <div className="absolute -bottom-[15%] -right-[10%] w-[45%] h-[45%] bg-orange-500 opacity-[0.07] rounded-full blur-[130px]"></div>
      </div>

      <div className="relative w-full max-w-[420px] z-10">
        <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden">

          {/* Brand header */}
          <div className="relative bg-[#021934] px-8 pt-10 pb-9 text-center overflow-hidden">
            <div
              className="absolute inset-0 opacity-30"
              style={{ background: 'radial-gradient(120% 90% at 50% -10%, rgba(245,158,11,0.25), transparent 60%)' }}
            />
            <div className="relative flex justify-center">
              <img src="/logo-light.png" alt="Pentacle" className="w-56 max-w-full h-auto object-contain" />
            </div>
          </div>

          {/* Gold accent divider */}
          <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400"></div>

          {/* Form body */}
          <div className="px-8 pt-8 pb-9">
            <div className="text-center mb-7">
              <h1 className="text-2xl font-bold text-[#021934] tracking-tight">Welcome to Pentacle</h1>
              <p className="text-sm text-slate-500 mt-1.5">Sign in to access your payroll dashboard</p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3.5 mb-5 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200/80">
                <span className="material-symbols-outlined text-[20px] leading-none mt-px">error</span>
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleLoginSubmit}>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">mail</span>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@pentacle.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:ring-4 focus:ring-[#021934]/10 focus:border-[#021934] focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">lock</span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:ring-4 focus:ring-[#021934]/10 focus:border-[#021934] focus:bg-white outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#021934] hover:bg-[#052a54] text-white py-3.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-[#021934]/20 active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
              >
                {loading ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span>
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In to Dashboard
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-6">
              Trouble signing in? Contact your HR administrator.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-slate-400">
          <span className="material-symbols-outlined text-[14px]">lock</span>
          <span>Secure sign-in · © Pentacle Consultants (I) Pvt. Ltd.</span>
        </div>
      </div>
    </main>
  );
}
