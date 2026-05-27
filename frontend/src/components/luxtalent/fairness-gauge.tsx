'use client';

import { useEffect, useState, useRef } from 'react';

interface FairnessGaugeProps {
  label: string;
  value: number;
  alert: boolean;
  description: string;
  type: 'epd' | 'rid' | 'delta_tpr';
}

export function FairnessGauge({ label, value, alert, description, type }: FairnessGaugeProps) {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const hasAnimated = useRef(false);

  let percentage: number;
  if (type === 'rid') {
    percentage = Math.min(value * 100, 100);
  } else {
    percentage = Math.max(0, 100 - value * 5);
  }

  const getColor = () => {
    if (alert) return 'text-red-500';
    if (type === 'rid') {
      return value >= 0.8 ? 'text-emerald-500' : value >= 0.6 ? 'text-amber-500' : 'text-red-500';
    }
    return value <= 5 ? 'text-emerald-500' : value <= 10 ? 'text-amber-500' : 'text-red-500';
  };

  const getArcGradientId = () => {
    if (alert) return 'gauge-gradient-red';
    if (type === 'rid') {
      return value >= 0.8 ? 'gauge-gradient-emerald' : value >= 0.6 ? 'gauge-gradient-amber' : 'gauge-gradient-red';
    }
    return value <= 5 ? 'gauge-gradient-emerald' : value <= 10 ? 'gauge-gradient-amber' : 'gauge-gradient-red';
  };

  const formatValue = () => {
    if (type === 'rid') return value.toFixed(3);
    return `${value.toFixed(1)} pts`;
  };

  const circumference = Math.PI * 40;
  const dashOffset = circumference * (1 - animatedPercentage / 100);
  const gradientId = getArcGradientId();

  // Animate gauge on mount
  useEffect(() => {
    if (!hasAnimated.current) {
      hasAnimated.current = true;
      const timer = setTimeout(() => {
        setAnimatedPercentage(percentage);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // On subsequent percentage changes, animate directly
      const raf = requestAnimationFrame(() => setAnimatedPercentage(percentage));
      return () => cancelAnimationFrame(raf);
    }
  }, [percentage]);

  // Generate tick marks
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI + (Math.PI * i) / 10;
    const cx = 50 + 46 * Math.cos(angle);
    const cy = 50 + 46 * Math.sin(angle);
    const isMajor = i % 5 === 0;
    ticks.push({ cx, cy, isMajor, key: i });
  }

  return (
    <div className={`flex flex-col items-center p-3 rounded-xl border transition-all duration-200 ${
      alert
        ? 'bg-red-50/30 border-red-100'
        : 'bg-white border-slate-100 hover:shadow-sm'
    }`}>
      <div className="relative w-24 h-14 mb-1">
        <svg viewBox="0 0 100 55" className="w-full h-full">
          <defs>
            <linearGradient id="gauge-gradient-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6ee7b7" />
              <stop offset="50%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="gauge-gradient-amber" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="gauge-gradient-red" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fca5a5" />
              <stop offset="50%" stopColor="#f87171" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id="gauge-glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Tick marks */}
          {ticks.map((tick) => (
            <circle
              key={tick.key}
              cx={tick.cx}
              cy={tick.cy}
              r={tick.isMajor ? 1.2 : 0.7}
              fill={tick.isMajor ? '#94a3b8' : '#cbd5e1'}
            />
          ))}

          {/* Background arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Value arc with gradient fill */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            filter="url(#gauge-glow)"
          />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-0.5">
          <span className={`text-lg font-bold ${getColor()}`}>{formatValue()}</span>
        </div>
      </div>
      <h4 className="text-xs font-semibold text-slate-700 text-center">{label}</h4>
      <p className="text-[10px] text-slate-500 text-center mt-0.5">{description}</p>
      {alert && (
        <div className="mt-1.5 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full">
          <span className="text-[10px] font-semibold text-red-600">⚠ Alerte</span>
        </div>
      )}
      {!alert && (
        <div className="mt-1.5 px-2 py-0.5 bg-emerald-50/50 border border-emerald-100 rounded-full">
          <span className="text-[10px] font-semibold text-emerald-600">✓ OK</span>
        </div>
      )}
    </div>
  );
}
