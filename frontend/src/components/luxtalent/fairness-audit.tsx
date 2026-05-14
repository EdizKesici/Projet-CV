'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FairnessGauge } from './fairness-gauge';
import { fetchFairnessMetrics } from '@/lib/api';
import { FEATURE_LABELS } from '@/lib/mock-data';
import type { FairnessMetricsResponse } from '@/lib/types';
import {
  Scale,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  Shield,
} from 'lucide-react';

export function FairnessAudit() {
  const [metrics, setMetrics] = useState<FairnessMetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFairnessMetrics();
      setMetrics(data);
    } catch {
      setError('Erreur lors du chargement des métriques.');
    } finally {
      setLoading(false);
    }
  };

  const renderModelPanel = (
    title: string,
    modelData: FairnessMetricsResponse['base_model'],
    isFair: boolean,
    showAuc?: boolean,
    perf?: FairnessMetricsResponse['performance_comparison']['base']
  ) => (
    <Card className={`flex-1 ${isFair ? 'border-emerald-200' : 'border-amber-200'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-700">{title}</CardTitle>
          {isFair ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              ThresholdOptimizer
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Sans correction
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gauges */}
        <div className="grid grid-cols-3 gap-2">
          <FairnessGauge
            label="EPD"
            value={modelData.epd}
            alert={modelData.epd_alert}
            description="Écart Parité Démographique"
            type="epd"
          />
          <FairnessGauge
            label="RID"
            value={modelData.rid}
            alert={modelData.rid_alert}
            description="Ratio Impact Différentiel"
            type="rid"
          />
          <FairnessGauge
            label="Delta TPR"
            value={modelData.delta_tpr}
            alert={modelData.delta_tpr_alert}
            description="Égalité des Chances"
            type="delta_tpr"
          />
        </div>

        {/* Group Stats */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Statistiques par groupe</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-1.5 px-2 font-semibold text-slate-500">Groupe</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-slate-500">N</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-slate-500">Invite %</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-slate-500">TPR</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-slate-500">FPR</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(modelData.group_stats).map(([group, stats]) => (
                  <tr key={group} className="border-b border-slate-100">
                    <td className="py-1.5 px-2 font-medium text-slate-700">{group === 'Male' ? 'Homme' : 'Femme'}</td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{stats.n}</td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{stats.invite_rate.toFixed(1)}%</td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{stats.tpr.toFixed(1)}%</td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{stats.fpr.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Audit Fairness</h2>
          <p className="text-slate-500 text-sm mt-1">
            Comparaison des métriques d&apos;équité entre le modèle de base et le modèle corrigé
          </p>
        </div>
        <Button onClick={loadMetrics} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Chargement...
            </>
          ) : (
            <>
              <Scale className="w-4 h-4 mr-2" />
              Charger les métriques
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {metrics && (
        <>
          {/* Version info */}
          <Card className="bg-slate-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <Badge variant="outline" className="border-slate-300">{metrics.version}</Badge>
                <span>Contrainte: <strong className="text-slate-800">{metrics.fairness_constraint === 'equalized_odds' ? 'Égalité des chances' : metrics.fairness_constraint}</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Panels */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {renderModelPanel('Modèle de base (sans correction)', metrics.base_model, false, true, metrics.performance_comparison.base)}
            {renderModelPanel('Modèle V2 (avec correction)', metrics.fair_model, true)}
          </div>

          {/* Improvement indicators */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-700">Améliorations apportées par la correction</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* EPD improvement */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-700">EPD</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-600 font-mono">{metrics.base_model.epd.toFixed(1)} pts</span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="text-emerald-600 font-mono font-bold">{metrics.fair_model.epd.toFixed(1)} pts</span>
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">
                    −{(metrics.base_model.epd - metrics.fair_model.epd).toFixed(1)} pts d&apos;écart réduit
                  </p>
                </div>

                {/* RID improvement */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-700">RID</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`${metrics.base_model.rid_alert ? 'text-red-600' : 'text-slate-600'} font-mono`}>
                      {metrics.base_model.rid.toFixed(3)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="text-emerald-600 font-mono font-bold">{metrics.fair_model.rid.toFixed(3)}</span>
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">
                    +{(metrics.fair_model.rid - metrics.base_model.rid).toFixed(3)} plus proche de 1.0
                  </p>
                </div>

                {/* Delta TPR improvement */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-700">Delta TPR</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`${metrics.base_model.delta_tpr_alert ? 'text-red-600' : 'text-slate-600'} font-mono`}>
                      {metrics.base_model.delta_tpr.toFixed(1)} pts
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="text-emerald-600 font-mono font-bold">{metrics.fair_model.delta_tpr.toFixed(1)} pts</span>
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">
                    −{(metrics.base_model.delta_tpr - metrics.fair_model.delta_tpr).toFixed(1)} pts d&apos;écart réduit
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-700">Comparaison des performances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: 'Accuracy',
                    base: metrics.performance_comparison.base.accuracy,
                    fair: metrics.performance_comparison.fair.accuracy,
                  },
                  {
                    label: 'F1 Invite',
                    base: metrics.performance_comparison.base.f1_invite,
                    fair: metrics.performance_comparison.fair.f1_invite,
                  },
                  {
                    label: 'F1 Reject',
                    base: metrics.performance_comparison.base.f1_reject,
                    fair: metrics.performance_comparison.fair.f1_reject,
                  },
                ].map((item) => {
                  const diff = item.fair - item.base;
                  const isNeg = diff < 0;
                  return (
                    <div key={item.label} className="p-4 rounded-lg bg-slate-50 border border-slate-100 text-center">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{item.label}</p>
                      <div className="flex items-center justify-center gap-3">
                        <div>
                          <p className="text-sm text-slate-400">Base</p>
                          <p className="text-lg font-bold text-slate-700">{(item.base * 100).toFixed(0)}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-400">V2</p>
                          <p className="text-lg font-bold text-slate-800">{(item.fair * 100).toFixed(0)}%</p>
                        </div>
                      </div>
                      <p className={`text-xs mt-1 font-medium ${isNeg ? 'text-red-500' : 'text-emerald-500'}`}>
                        {isNeg ? '' : '+'}{(diff * 100).toFixed(1)}%
                      </p>
                    </div>
                  );
                })}
                {metrics.performance_comparison.base.auc && (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 text-center">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">AUC</p>
                    <p className="text-lg font-bold text-slate-700">{(metrics.performance_comparison.base.auc * 100).toFixed(0)}%</p>
                    <p className="text-xs text-slate-400 mt-1">Modèle de base uniquement</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Proxy Analysis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-700">
                Analyse des variables proxy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Variable</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Pearson r</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">p-value</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Mutual Info</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Proxy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.proxy_analysis.map((item) => {
                      const label = FEATURE_LABELS[item.feature] || item.feature;
                      return (
                        <tr key={item.feature} className={`border-b border-slate-100 ${item.is_proxy ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{label}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">{item.pearson_r.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">{item.pearson_pval.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">{item.mutual_info.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-center">
                            {item.is_proxy ? (
                              <Badge className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100 text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Proxy
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100 text-xs">
                                <Shield className="w-3 h-3 mr-1" />
                                OK
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
