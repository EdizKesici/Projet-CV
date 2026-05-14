'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Cpu,
  Activity,
  Scale,
  Settings,
  FileText,
  FolderOpen,
  Shield,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Database,
  RefreshCw,
} from 'lucide-react';
import { fetchHealth, fetchFairnessMetrics } from '@/lib/api';
import type { HealthResponse, FairnessMetricsResponse, SectionId } from '@/lib/types';

interface TechDashboardProps {
  onNavigate: (section: SectionId) => void;
}

export function TechDashboard({ onNavigate }: TechDashboardProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [fairness, setFairness] = useState<FairnessMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchHealth().catch(() => null),
      fetchFairnessMetrics().catch(() => null),
    ])
      .then(([h, f]) => {
        setHealth(h);
        setFairness(f);
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [h, f] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchFairnessMetrics().catch(() => null),
      ]);
      setHealth(h);
      setFairness(f);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    {
      label: 'Audit & Métriques',
      section: 'fairness-audit' as SectionId,
      icon: Scale,
      description: 'Inspecter l\'équité et les performances du modèle',
      color: 'blue',
    },
    {
      label: 'Logs Avancés',
      section: 'advanced-logs' as SectionId,
      icon: FileText,
      description: 'Consulter les logs détaillés du système',
      color: 'slate',
    },
    {
      label: 'Fichiers Traités',
      section: 'processed-files' as SectionId,
      icon: FolderOpen,
      description: 'Gérer le registre des fichiers traités',
      color: 'slate',
    },
    {
      label: 'Configuration',
      section: 'configuration' as SectionId,
      icon: Settings,
      description: 'Modifier les filtres et paramètres du modèle',
      color: 'amber',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Espace Technique</h2>
            <p className="text-slate-500 text-sm">Supervision du modèle, métriques et configuration système</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refreshData} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* System Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* API Status */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${health?.model_ready ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <Activity className={`w-5 h-5 ${health?.model_ready ? 'text-emerald-500' : 'text-red-500'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Statut API</p>
                  <p className="text-xs text-slate-500">
                    {loading ? 'Vérification...' : health ? 'Connecté' : 'Mode démonstration'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${health?.model_ready ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-xs font-medium ${health?.model_ready ? 'text-emerald-600' : 'text-red-600'}`}>
                  {health?.model_ready ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Model Info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Modèle actif</p>
                  <p className="text-xs text-slate-500">{health?.model_name || 'Logistic Regression (C=0.5, l2)'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs border-slate-200">
                  {health?.version || 'V2'}
                </Badge>
                {health?.fairness_enabled && (
                  <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                    Fairness
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fairness Summary */}
      <Card className="border-blue-100 bg-gradient-to-r from-blue-50/50 to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-base font-semibold text-slate-700">Résumé Fairness</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {fairness ? (
            <div className="grid grid-cols-3 gap-4">
              {/* EPD */}
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500">EPD</span>
                  {fairness.fair_model.epd_alert ? (
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  )}
                </div>
                <p className="text-xl font-bold text-slate-800">{fairness.fair_model.epd.toFixed(1)} pts</p>
                <p className="text-xs text-slate-400">Écart Parité Démogr.</p>
              </div>
              {/* RID */}
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500">RID</span>
                  {fairness.fair_model.rid_alert ? (
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  )}
                </div>
                <p className="text-xl font-bold text-slate-800">{fairness.fair_model.rid.toFixed(3)}</p>
                <p className="text-xs text-slate-400">Ratio Impact Diff.</p>
              </div>
              {/* Delta TPR */}
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500">Delta TPR</span>
                  {fairness.fair_model.delta_tpr_alert ? (
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  )}
                </div>
                <p className="text-xl font-bold text-slate-800">{fairness.fair_model.delta_tpr.toFixed(1)} pts</p>
                <p className="text-xs text-slate-400">Égalité des Chances</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between py-3">
              <p className="text-sm text-slate-400">Chargez les métriques pour voir le résumé</p>
              <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => onNavigate('fairness-audit')}>
                Voir l'audit <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Summary */}
      {fairness && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-500" />
              <CardTitle className="text-base font-semibold text-slate-700">Performances du modèle corrigé</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Accuracy', value: fairness.performance_comparison.fair.accuracy },
                { label: 'F1 Invite', value: fairness.performance_comparison.fair.f1_invite },
                { label: 'F1 Reject', value: fairness.performance_comparison.fair.f1_reject },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{item.label}</p>
                  <p className="text-xl font-bold text-slate-800">{(item.value * 100).toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          const colorMap: Record<string, string> = {
            blue: 'bg-blue-50 text-blue-600',
            slate: 'bg-slate-50 text-slate-600',
            amber: 'bg-amber-50 text-amber-600',
          };
          return (
            <Card
              key={action.section}
              className="cursor-pointer hover:shadow-md transition-all border-slate-200 hover:border-blue-300"
              onClick={() => onNavigate(action.section)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${colorMap[action.color] || colorMap.slate} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{action.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
