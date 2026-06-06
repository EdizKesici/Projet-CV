'use client';

import { useState, useEffect, useCallback } from 'react';
import { CvDrop } from '@/components/luxtalent/cv-drop';
import { FairnessHistory } from '@/components/luxtalent/fairness-history';
import { FilterConfigPanel } from '@/components/luxtalent/filter-config';
import { fetchHealth, fetchScreeningLog } from '@/lib/api';
import type { TabId, HealthResponse } from '@/lib/types';
import { useTheme } from 'next-themes';
import {
  FileText,
  Scale,
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('cv-drop');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [screeningCount, setScreeningCount] = useState<number>(0);
  const [tabTransitionKey, setTabTransitionKey] = useState(0);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [fairnessRefreshKey, setFairnessRefreshKey] = useState(0);

  const handleAnalysisSaved = useCallback(() => {
    setFairnessRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // next-themes needs mounted check to avoid hydration mismatch
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    const refreshHealth = () =>
      fetchHealth()
        .then((data) => { setHealth(data); setHealthError(false); })
        .catch(() => setHealthError(true));

    refreshHealth();
    const interval = setInterval(refreshHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load screening count for stats — prefer DB count
  useEffect(() => {
    fetch('/api/analyses')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => { if (Array.isArray(data)) setScreeningCount(data.length); })
      .catch(() => {
        // Fall back to screening-log API
        fetchScreeningLog()
          .then((data) => setScreeningCount(data.length))
          .catch(() => {});
      });
  }, [activeTab]);

  const tabs: { id: TabId; label: string; icon: React.ElementType; description: string }[] = [
    { id: 'cv-drop', label: 'Analyse CV', icon: FileText, description: 'Glissez un CV pour analyse' },
    { id: 'fairness', label: 'Fairness & Historique', icon: Scale, description: 'Métriques d\'équité et historique' },
    { id: 'configuration', label: 'Configuration', icon: Settings, description: 'Filtre éliminatoire et paramètres' },
  ];

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setTabTransitionKey((prev) => prev + 1);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-700/50 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200/50 dark:shadow-emerald-900/30">
                  <span className="text-white font-bold text-sm">LT</span>
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">LuxTalent Advisory</h1>
              </div>
            </div>

            {/* Tabs with active indicator — icons-only on mobile, labels on sm+ */}
            <nav className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl" role="tablist" aria-label="Navigation principale">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    role="tab"
                    aria-selected={isActive}
                    aria-label={tab.label}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-1 active:scale-95 ${
                      isActive
                        ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
                    }`}
                    title={tab.description}
                  >
                    <Icon className={`w-4 h-4 transition-colors duration-200 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right side: Theme toggle + Health status */}
            <div className="flex items-center gap-2">
              {/* Dark mode toggle */}
              {mounted && (
                <button
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  className="theme-toggle-btn w-9 h-9 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 active:scale-95"
                  title={resolvedTheme === 'dark' ? 'Mode clair' : 'Mode sombre'}
                  aria-label={resolvedTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Health status */}
              {healthError ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800/30">
                  <WifiOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                  <span className="text-xs font-medium text-red-600 dark:text-red-400 hidden sm:inline">Hors ligne</span>
                </div>
              ) : health?.model_ready ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
                  <div className="relative">
                    <Wifi className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  </div>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hidden sm:inline">Connecté</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30">
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 animate-spin" />
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 hidden sm:inline">Connexion...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Quick Stats Bar */}
      <div className="bg-white/60 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex items-center gap-4 sm:gap-6 text-xs overflow-x-auto scrollbar-none" role="status" aria-live="polite" aria-label="Statistiques rapides">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{screeningCount} CV analysés</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 bg-main-gradient" role="main">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div key={tabTransitionKey} className="animate-tab-enter" style={{ display: activeTab === 'cv-drop' ? 'block' : 'none' }}>
            <CvDrop onAnalysisSaved={handleAnalysisSaved} />
          </div>
          <div style={{ display: activeTab === 'fairness' ? 'block' : 'none' }}>
            <FairnessHistory refreshKey={fairnessRefreshKey} />
          </div>
          <div style={{ display: activeTab === 'configuration' ? 'block' : 'none' }}>
            <FilterConfigPanel />
          </div>
        </div>
      </main>


    </div>
  );
}
