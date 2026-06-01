"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      window.location.href = "/";
    }
  }, [status]);

  if (status === "authenticated") {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", { password, redirect: false });
      if (result?.error) {
        setError("Mot de passe incorrect");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center login-gradient-bg relative overflow-hidden">
      {/* Decorative geometric shapes */}
      <div className="login-geo-shape bg-emerald-400" style={{ width: 300, height: 300, top: '-5%', left: '-8%' }} />
      <div className="login-geo-shape bg-emerald-500" style={{ width: 200, height: 200, bottom: '5%', right: '-5%' }} />
      <div className="login-geo-shape bg-teal-400" style={{ width: 150, height: 150, top: '40%', right: '10%' }} />
      <div className="login-geo-shape bg-emerald-300" style={{ width: 100, height: 100, bottom: '25%', left: '8%' }} />
      {/* Smaller accent shapes */}
      <div className="login-geo-shape bg-emerald-400" style={{ width: 60, height: 60, top: '15%', right: '25%', opacity: 0.05 }} />
      <div className="login-geo-shape bg-teal-500" style={{ width: 80, height: 80, bottom: '15%', left: '20%', opacity: 0.06 }} />

      <div className="w-full max-w-md px-6 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30 mb-4">
            <span className="text-white font-bold text-2xl">LT</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">LuxTalent Advisory</h1>
        </div>
        <div className="login-glass rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Accès réservé</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">Entrez le mot de passe pour accéder au système</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Mot de passe</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full px-4 py-2.5 pr-10 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder="Entrez le mot de passe..."
                  autoFocus
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
              </div>
            )}
            <button type="submit" disabled={loading || !password} className="login-btn-hover w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-medium rounded-xl hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-200/50 dark:shadow-emerald-900/30">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><LogIn className="w-4 h-4" /> Se connecter</>
              )}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-6">LuxTalent Advisory Group</p>
      </div>
    </div>
  );
}
