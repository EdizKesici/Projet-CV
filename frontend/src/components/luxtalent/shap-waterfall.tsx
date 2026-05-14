'use client';

import { SHAP_FEATURE_LABELS } from '@/lib/mock-data';

interface ShapWaterfallProps {
  shapValues: Record<string, number>;
  baseValue: number;
  label: 'Invite' | 'Reject';
}

export function ShapWaterfall({ shapValues, baseValue, label }: ShapWaterfallProps) {
  const entries = Object.entries(shapValues).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxAbsValue = Math.max(...entries.map(([, v]) => Math.abs(v)), Math.abs(baseValue));
  const scale = 1 / (maxAbsValue * 1.2);

  // Calculate the final prediction value
  const totalShap = entries.reduce((sum, [, v]) => sum + v, 0);
  const predictionValue = baseValue + totalShap;

  const isInvite = label === 'Invite';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700">Contributions SHAP</h4>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm bg-emerald-400 inline-block" />
            Invite
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm bg-red-400 inline-block" />
            Reject
          </span>
        </div>
      </div>

      {/* Base value indicator */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <span className="w-24 text-right font-medium">Valeur de base</span>
        <div className="flex-1">
          <div className="h-5 flex items-center">
            <div
              className="h-1 bg-slate-300 rounded"
              style={{
                width: `${Math.abs(baseValue * scale) * 100}%`,
                marginLeft: baseValue >= 0 ? '0' : `${-baseValue * scale * 100}%`,
              }}
            />
          </div>
        </div>
        <span className="w-16 text-right font-mono">{baseValue.toFixed(4)}</span>
      </div>

      {/* SHAP value bars */}
      {entries.map(([feature, value]) => {
        const width = Math.abs(value * scale) * 100;
        const frenchLabel = SHAP_FEATURE_LABELS[feature] || feature;
        const isPositive = value >= 0;

        return (
          <div key={feature} className="flex items-center gap-2 text-xs group">
            <span className="w-24 text-right font-medium text-slate-600 truncate" title={frenchLabel}>
              {frenchLabel}
            </span>
            <div className="flex-1 relative">
              <div className="h-5 flex items-center">
                {isPositive ? (
                  <div
                    className="h-4 rounded-sm bg-emerald-400/80 group-hover:bg-emerald-400 transition-colors flex items-center justify-end pr-1.5 min-w-[2px]"
                    style={{ width: `${width}%` }}
                  >
                    {width > 8 && (
                      <span className="text-[10px] font-semibold text-emerald-900">{value > 0 ? '+' : ''}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-end w-full">
                    <div
                      className="h-4 rounded-sm bg-red-400/80 group-hover:bg-red-400 transition-colors flex items-center pl-1.5 min-w-[2px]"
                      style={{ width: `${width}%` }}
                    >
                      {width > 8 && <span className="text-[10px] font-semibold text-red-900">−</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span
              className={`w-16 text-right font-mono ${
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
        <span className="w-24 text-right font-semibold text-slate-700">Prédiction</span>
        <div className="flex-1">
          <div
            className={`h-5 rounded flex items-center px-2 ${
              isInvite ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            <span className="font-semibold">{predictionValue.toFixed(4)}</span>
            <span className="ml-2 text-[10px]">→ {label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
