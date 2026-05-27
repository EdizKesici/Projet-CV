'use client';

import { useState, useEffect, useCallback } from 'react';
import { CvDrop } from '@/components/luxtalent/cv-drop';
import { FairnessHistory } from '@/components/luxtalent/fairness-history';
import { fetchHealth, fetchScreeningLog } from '@/lib/api';
import type { TabId, HealthResponse } from '@/lib/types';
import {
  FileText,
  Scale,
  Wifi,
  WifiOff,
  Loader2,
  Sparkles,
} from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('cv-drop');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [screeningCount, setScreeningCount] = useState<number>(0);

  useEffect(() => {
    fetchHealth()
      .then((data) => {
        setHealth(data);
        setHealthError(false);
      })
      .catch(() => {
        setHealthError(true);
      });

    const interval = setInterval(() => {
      fetchHealth()
        .then((data) => {
          setHealth(data);
          setHealthError(false);
        })
        .catch(() => setHealthError(true));
    }, 30000);

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
  ];

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 backdrop-blur-md bg-white/95">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200/50">
                  <span className="text-white font-bold text-sm">LT</span>
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold text-slate-800 leading-tight">LuxTalent Advisory</h1>
                <p className="text-[10px] text-slate-400 leading-tight tracking-wider uppercase">Pré-sélection CV — V2</p>
              </div>
            </div>

            {/* Tabs with active indicator */}
            <nav className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                    }`}
                    title={tab.description}
                  >
                    <Icon className={`w-4 h-4 transition-colors duration-200 ${isActive ? 'text-emerald-600' : ''}`} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Health status */}
            <div className="flex items-center gap-2">
              {healthError ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg border border-red-100">
                  <WifiOff className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-medium text-red-600 hidden sm:inline">Hors ligne</span>
                </div>
              ) : health?.model_ready ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="relative">
                    <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  </div>
                  <span className="text-xs font-medium text-emerald-600 hidden sm:inline">Connecté</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span className="text-xs font-medium text-amber-600 hidden sm:inline">Connexion...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Quick Stats Bar */}
      <div className="bg-white/60 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex items-center gap-4 sm:gap-6 text-xs overflow-x-auto">
            <div className="flex items-center gap-1.5 text-slate-500 flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{screeningCount} CV analysés</span>
            </div>
            {health?.fairness_enabled && (
              <>
                <div className="w-px h-3 bg-slate-200 flex-shrink-0" />
                <div className="flex items-center gap-1.5 text-emerald-600 flex-shrink-0">
                  <Sparkles className="w-3 h-3" />
                  <span className="font-medium">Fairness activée</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main content with tab transition */}
      {/* Both components stay mounted (hidden via CSS) to preserve state across tab switches */}
      <main className="flex-1 bg-main-gradient">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div style={{ display: activeTab === 'cv-drop' ? 'block' : 'none' }}>
            <CvDrop />
          </div>
          <div style={{ display: activeTab === 'fairness' ? 'block' : 'none' }}>
            <FairnessHistory />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-[8px]">LT</span>
              </div>
              <span className="font-medium text-slate-500">LuxTalent Advisory Group</span>
            </div>
            <span className="text-slate-200">|</span>
            <span>V2</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${healthError ? 'bg-red-400' : health?.model_ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="font-medium">{healthError ? 'Service indisponible' : health?.model_ready ? 'Modèle prêt' : 'Chargement...'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
