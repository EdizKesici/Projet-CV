'use client';

interface FairnessGaugeProps {
  label: string;
  value: number;
  alert: boolean;
  description: string;
  type: 'epd' | 'rid' | 'delta_tpr';
}

export function FairnessGauge({ label, value, alert, description, type }: FairnessGaugeProps) {
  // Normalize value to a 0-100 scale for display
  let percentage: number;
  if (type === 'rid') {
    // RID ranges from 0 to 1 (ideal = 1)
    percentage = Math.min(value * 100, 100);
  } else {
    // EPD and Delta TPR: 0 is ideal, 20 is terrible
    percentage = Math.max(0, 100 - value * 5);
  }

  const getColor = () => {
    if (alert) return 'text-red-500';
    if (type === 'rid') {
      return value >= 0.8 ? 'text-emerald-500' : value >= 0.6 ? 'text-amber-500' : 'text-red-500';
    }
    return value <= 5 ? 'text-emerald-500' : value <= 10 ? 'text-amber-500' : 'text-red-500';
  };

  const getArcColor = () => {
    if (alert) return '#ef4444';
    if (type === 'rid') {
      return value >= 0.8 ? '#10b981' : value >= 0.6 ? '#f59e0b' : '#ef4444';
    }
    return value <= 5 ? '#10b981' : value <= 10 ? '#f59e0b' : '#ef4444';
  };

  const formatValue = () => {
    if (type === 'rid') return value.toFixed(3);
    return `${value.toFixed(1)} pts`;
  };

  const arcColor = getArcColor();
  // SVG arc: semicircle from left to right
  const circumference = Math.PI * 40; // radius=40
  const dashOffset = circumference * (1 - percentage / 100);

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
      <div className="relative w-28 h-16 mb-2">
        <svg viewBox="0 0 100 55" className="w-full h-full">
          {/* Background arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={arcColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-0.5">
          <span className={`text-xl font-bold ${getColor()}`}>{formatValue()}</span>
        </div>
      </div>
      <h4 className="text-sm font-semibold text-slate-700 text-center">{label}</h4>
      <p className="text-[11px] text-slate-500 text-center mt-1">{description}</p>
      {alert && (
        <div className="mt-2 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full">
          <span className="text-[10px] font-semibold text-red-600">⚠ Alerte</span>
        </div>
      )}
    </div>
  );
}
