'use client';

import { SHAP_FEATURE_LABELS, FEATURE_LABELS, EDUCATION_LEVELS } from '@/lib/types';
import type { PredictionResponse } from '@/lib/types';

interface ShapWaterfallProps {
  shapValues: Record<string, number>;
  baseValue: number;
  label: 'Invite' | 'Reject';
}

export function ShapWaterfall({ shapValues, baseValue, label }: ShapWaterfallProps) {
  const entries = Object.entries(shapValues).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxAbsValue = Math.max(...entries.map(([, v]) => Math.abs(v)), Math.abs(baseValue));
  const scale = 1 / (maxAbsValue * 1.2);

  const totalShap = entries.reduce((sum, [, v]) => sum + v, 0);
  const predictionValue = baseValue + totalShap;
  const isInvite = label === 'Invite';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-slate-700">Contributions SHAP</h4>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-gradient-to-r from-emerald-400 to-emerald-500 inline-block" />
            Invite
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-gradient-to-r from-red-400 to-red-500 inline-block" />
            Reject
          </span>
        </div>
      </div>

      {/* Base value indicator */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <span className="w-36 text-right font-medium">Valeur de base</span>
        <div className="flex-1">
          <div className="h-5 flex items-center">
            <div
              className="h-1.5 bg-slate-300 rounded"
              style={{
                width: `${Math.abs(baseValue * scale) * 100}%`,
                marginLeft: baseValue >= 0 ? '0' : `${-baseValue * scale * 100}%`,
              }}
            />
          </div>
        </div>
        <span className="w-16 text-right font-mono text-slate-600">{baseValue.toFixed(4)}</span>
      </div>

      {/* SHAP value bars */}
      {entries.map(([feature, value]) => {
        const width = Math.abs(value * scale) * 100;
        const frenchLabel = SHAP_FEATURE_LABELS[feature] || feature;
        const isPositive = value >= 0;
        const absVal = Math.abs(value);
        const intensity = Math.min(absVal / 0.5, 1);

        return (
          <div key={feature} className="flex items-center gap-2 text-xs group">
            <span className="w-36 text-right font-medium text-slate-600" title={frenchLabel}>
              {frenchLabel}
            </span>
            <div className="flex-1 relative">
              <div className="h-5 flex items-center">
                {isPositive ? (
                  <div
                    className="h-4 rounded-md group-hover:h-5 transition-all flex items-center justify-end pr-1.5 min-w-[2px]"
                    style={{
                      width: `${width}%`,
                      background: `linear-gradient(to right, oklch(0.8 0.15 160), oklch(${0.65 + intensity * 0.1} ${0.15 + intensity * 0.05} 160))`,
                    }}
                  >
                    {width > 8 && (
                      <span className="text-[10px] font-semibold text-emerald-900">{value > 0 ? '+' : ''}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-end w-full">
                    <div
                      className="h-4 rounded-md group-hover:h-5 transition-all flex items-center pl-1.5 min-w-[2px]"
                      style={{
                        width: `${width}%`,
                        background: `linear-gradient(to right, oklch(${0.65 + intensity * 0.1} ${0.15 + intensity * 0.05} 25), oklch(0.8 0.15 25))`,
                      }}
                    >
                      {width > 8 && <span className="text-[10px] font-semibold text-red-900">−</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span
              className={`w-16 text-right font-mono font-medium ${
                isPositive ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {value > 0 ? '+' : ''}
              {value.toFixed(4)}
            </span>
          </div>
        );
      })}

      {/* Final prediction value */}
      <div className="flex items-center gap-2 text-xs pt-2 border-t border-slate-200">
        <span className="w-36 text-right font-semibold text-slate-700">Prédiction</span>
        <div className="flex-1">
          <div
            className={`h-6 rounded-md flex items-center px-2 shadow-sm ${
              isInvite ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700' : 'bg-gradient-to-r from-red-50 to-red-100 text-red-700'
            }`}
          >
            <span className="font-bold">{predictionValue.toFixed(4)}</span>
            <span className="ml-2 text-[10px] font-medium">→ {label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact version showing only top 3
export function ShapTopFeatures({ shapValues, label }: { shapValues: Record<string, number>; label: 'Invite' | 'Reject' }) {
  const sortedEntries = Object.entries(shapValues)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);

  return (
    <div className="space-y-2.5">
      {sortedEntries.map(([feature, value], index) => {
        const frenchLabel = SHAP_FEATURE_LABELS[feature] || feature;
        const isPositive = value >= 0;
        const absVal = Math.abs(value);
        const barWidth = Math.min((absVal / 0.5) * 100, 100);

        return (
          <div key={feature} className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
              isPositive ? 'bg-emerald-50' : 'bg-red-50'
            }`}>
              <span className={`text-[10px] font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {index + 1}
              </span>
            </div>
            <span className="w-36 text-sm text-slate-600 font-medium">{frenchLabel}</span>
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 animate-progress ${
                  isPositive ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-red-500'
                }`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className={`text-sm font-mono font-semibold min-w-[52px] text-right ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {value > 0 ? '+' : ''}{value.toFixed(3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Feature table component
export function FeatureTable({ features }: { features: Record<string, number> }) {
  const featureEntries = Object.entries(features).filter(([key]) => key !== 'gender');

  const formatValue = (key: string, value: number): string => {
    if (key === 'education_level') return EDUCATION_LEVELS[value] || String(value);
    if (key.startsWith('has_')) return value === 1 ? 'Oui' : 'Non';
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1);
  };

  const getValueColor = (key: string, value: number): string => {
    if (key.startsWith('has_')) return value === 1 ? 'text-emerald-600' : 'text-slate-400';
    return 'text-slate-700';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Caractéristique</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {featureEntries.map(([key, value]) => (
            <tr key={key} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <td className="py-2 px-3 font-medium text-slate-700">{FEATURE_LABELS[key] || key}</td>
              <td className={`py-2 px-3 text-right font-mono font-semibold ${getValueColor(key, value)}`}>{formatValue(key, value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
