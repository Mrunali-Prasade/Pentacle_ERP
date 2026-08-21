import React, { useState } from 'react';

interface LoginViewProps {
  onLogin: (user: any) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <main className="relative flex items-center justify-center min-h-screen p-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden bg-slate-50">
        <div 
          className="absolute inset-0 opacity-[0.4]" 
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px'
          }}
        />
        <div className="absolute -top-[10%] -left-[5%] w-[40%] h-[40%] bg-blue-900 opacity-[0.04] rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-[10%] -right-[5%] w-[40%] h-[40%] bg-orange-600 opacity-[0.05] rounded-full blur-[120px]"></div>
      </div>

      <div className="relative w-full max-w-[440px] z-10">
        <div className="bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden">
          <div className="p-8 pb-4 text-center">
            <div className="flex justify-center mb-4">
              <img src="/logo-dark.png" alt="Pentacle Logo" className="w-72 max-w-full h-auto object-contain" />
            </div>
            <p className="text-sm text-slate-500 mt-3 font-medium uppercase tracking-widest">Welcome to Pentacle</p>
          </div>

          <div className="p-8 pt-4">
            <form className="space-y-5" onSubmit={handleLoginSubmit}>
              
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block" htmlFor="email">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">mail</span>
                    <input 
                      id="email" 
                      type="email"
                      required
                      placeholder="sarah@pentacle.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-900/20 focus:border-[#021934] outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block" htmlFor="password">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">lock</span>
                    <input 
                      id="password" 
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-900/20 focus:border-[#021934] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-[#021934] hover:bg-slate-800 text-white py-3 rounded-lg text-sm font-semibold transition-colors shadow-md active:scale-[0.98] duration-150 flex items-center justify-center gap-2"
              >
                {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
