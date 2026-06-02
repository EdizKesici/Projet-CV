'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { predictCV, saveAnalysis, fetchSavedAnalyses } from '@/lib/api';
import type { DbAnalysisRecord } from '@/lib/api';
import { exportAnalysisPDF } from '@/lib/pdf-export';
import { ShapTopFeatures } from './shap-waterfall';
import type { PredictionResponse } from '@/lib/types';
import { toast } from 'sonner';
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  AlertTriangle,
  Shield,
  RotateCcw,
  Sparkles,
  FileUp,
  Brain,
  Download,
  Clock,
  Zap,
  BarChart3,
  Save,
  Keyboard,
  Copy,
  Calendar,
  Archive,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Eye,
  GitCompare,
  X,
  Timer,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface AnalysisRecord {
  result: PredictionResponse;
  filename: string;
  timestamp: Date;
  saved?: boolean;
  notes?: string;
  status?: 'pending' | 'invited' | 'archived';
  cvPreview?: string;
}

const PIPELINE_STEPS = ['Extraction', 'Prédiction', 'Équité', 'SHAP'];

// Sparkline SVG component for stat cards — enhanced with gradient fill
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 56;
  const h = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  }).join(' ');

  // Area fill points (closed path)
  const areaPoints = points + ` ${w},${h} 0,${h}`;

  return (
    <svg width={w} height={h} className="sparkline-enhanced">
      <defs>
        <linearGradient id={`spark-grad-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#spark-grad-${color.replace(/[^a-z0-9]/gi, '')})`}
        className="sparkline-area-fill"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={(data.length - 1) / (data.length - 1) * w}
        cy={h - ((data[data.length - 1] - min) / range) * (h - 6) - 3}
        r="3"
        fill={color}
        stroke="white"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// Score ring donut chart
function ScoreRing({ value, isInvite }: { value: number; isInvite: boolean }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = isInvite ? 'oklch(0.65 0.18 160)' : 'oklch(0.6 0.18 25)';
  const bgColor = isInvite ? 'oklch(0.92 0.05 160)' : 'oklch(0.92 0.05 25)';

  return (
    <svg width="80" height="80" className="flex-shrink-0 score-ring-glow">
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth="6"
      />
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="animate-score-ring"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '40px 40px' }}
      />
      <text
        x="40"
        y="38"
        textAnchor="middle"
        className="text-sm font-bold"
        fill={isInvite ? 'oklch(0.35 0.12 160)' : 'oklch(0.4 0.12 25)'}
        style={{ fontSize: '14px', fontWeight: 700 }}
      >
        {value.toFixed(0)}%
      </text>
      <text
        x="40"
        y="50"
        textAnchor="middle"
        fill="oklch(0.55 0 0)"
        style={{ fontSize: '8px' }}
      >
        confiance
      </text>
    </svg>
  );
}

// Animated counter hook
function useAnimatedCounter(target: number, duration: number = 1500, active: boolean = true) {
  const [animCount, setAnimCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || target === 0) return; // Skip animation, use target directly

    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimCount(Math.round(eased * target * 10) / 10);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, active]);

  // Use target directly when not animating, otherwise use animated count
  return (!active || target === 0) ? target : animCount;
}

// Confetti component
function ConfettiParticles({ active }: { active: boolean }) {
  if (!active) return null;
  const colors = ['oklch(0.65 0.18 160)', 'oklch(0.55 0.2 150)', 'oklch(0.75 0.15 160)', 'oklch(0.6 0.12 145)', 'oklch(0.7 0.18 155)'];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {colors.map((color, i) => (
        <div
          key={i}
          className="confetti-particle"
          style={{ backgroundColor: color, top: '10%' }}
        />
      ))}
      {[...Array(3)].map((_, i) => (
        <div
          key={`s-${i}`}
          className="confetti-particle"
          style={{
            backgroundColor: 'oklch(0.8 0.1 80)',
            top: '5%',
            width: '4px',
            height: '4px',
            borderRadius: '50%',
          }}
        />
      ))}
    </div>
  );
}

export function CvDrop() {
  const [dragActive, setDragActive] = useState(false);
  const [dragInvalidType, setDragInvalidType] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [analysisDuration, setAnalysisDuration] = useState<number | null>(null);
  const [cvText, setCvText] = useState<string | null>(null);
  const [showCvPreview, setShowCvPreview] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [analysisNotes, setAnalysisNotes] = useState('');
  const [candidateStatus, setCandidateStatus] = useState<'pending' | 'invited' | 'archived'>('archived');
  const [showComparison, setShowComparison] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisStartRef = useRef<number>(0);
  const sessionStartRef = useRef<number>(Date.now());

  // Animated confidence counter
  const animatedConfidence = useAnimatedCounter(
    result?.confidence ?? 0,
    1500,
    !!result
  );

  // Load history from DB on mount
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    setHistoryLoading(true);
    fetchSavedAnalyses()
      .then((records) => {
        if (records.length > 0) {
          const restoredHistory: AnalysisRecord[] = records.map((r) => ({
            result: {
              name: r.candidateName,
              target_role: r.targetRole,
              stage: r.stage,
              passed: r.label === 'Invite',
              label: r.label as 'Invite' | 'Reject',
              confidence: r.confidence,
              probabilities: { Invite: r.probabilitiesInvite, Reject: r.probabilitiesReject },
              model_name: r.modelName,
              fairness_adjusted: r.fairnessAdjusted,
              version: r.version,
              features: JSON.parse(r.features || '{}'),
              explanation: {
                base_value: 0,
                shap_values: JSON.parse(r.shapValues || '{}'),
                top_features: Object.entries(JSON.parse(r.shapValues || '{}'))
                  .sort((a, b) => Math.abs((b as number[])[1]) - Math.abs((a as number[])[1]))
                  .slice(0, 3) as [string, number][],
                decision_drivers: r.decisionDrivers,
              },
              hard_filter_reasons: r.hardFilterReasons ? JSON.parse(r.hardFilterReasons) : undefined,
            },
            filename: r.filename,
            timestamp: new Date(r.createdAt),
            saved: true,
            notes: '',
            status: 'archived' as const,
          }));
          setAnalysisHistory(restoredHistory.slice(0, 10));
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  // Session timer
  useEffect(() => {
    sessionStartRef.current = Date.now();
    const interval = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatSessionTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  // Confetti trigger on Invite result
  useEffect(() => {
    if (result?.label === 'Invite' && !loading) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
    setShowConfetti(false);
  }, [result, loading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && result) {
        e.preventDefault();
        exportAnalysis();
      }
      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showComparison) { setShowComparison(false); return; }
        if (result && !loading) reset();
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [result, loading, showShortcuts, showComparison]);

  // Pipeline step animation during loading
  useEffect(() => {
    if (!loading) {
      setPipelineStep(0);
      return;
    }
    const interval = setInterval(() => {
      setPipelineStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 800);
    return () => clearInterval(interval);
  }, [loading]);

  // Detect dragged file type
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
    // Check if the dragged item is a non-txt file
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const item = items[0];
      if (item.kind === 'file') {
        // We can't reliably get the filename in dragover, but we can check type
        // For .txt files, the MIME type might be text/plain or empty
        // We'll check on drop instead, but show warning for known non-txt types
        if (item.type && item.type !== 'text/plain' && !item.type.startsWith('text/')) {
          setDragInvalidType(true);
        } else {
          setDragInvalidType(false);
        }
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    setDragInvalidType(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    setDragInvalidType(false);
    setError(null);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      setError('Format non supporté. Veuillez déposer un fichier .txt uniquement.');
      toast.error('Format non supporté', { description: 'Veuillez déposer un fichier .txt uniquement.' });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setCvText(content);
      analyzeCV(content, file.name);
    };
    reader.readAsText(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      setError('Format non supporté. Veuillez déposer un fichier .txt uniquement.');
      toast.error('Format non supporté', { description: 'Veuillez déposer un fichier .txt uniquement.' });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setCvText(content);
      analyzeCV(content, file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const analyzeCV = async (cvTextContent: string, filename: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setAnalysisDuration(null);
    setShowCvPreview(false);
    setShowNotes(false);
    setAnalysisNotes('');
    setCandidateStatus('archived'); // Auto-archive all candidates
    analysisStartRef.current = performance.now();

    try {
      const data = await predictCV(cvTextContent, filename);
      const elapsed = performance.now() - analysisStartRef.current;
      setAnalysisDuration(elapsed);
      setResult(data);

      // Save to database in background
      let saved = false;
      try {
        await saveAnalysis(data, filename);
        saved = true;
        toast.success('Analyse sauvegardée dans la base', {
          description: `${data.name} — ${data.target_role}`,
          icon: <Save className="w-4 h-4" />,
        });
      } catch (saveErr) {
        console.error('Erreur sauvegarde DB :', saveErr);
        toast.error('Erreur de sauvegarde', {
          description: 'L\'analyse n\'a pas pu être sauvegardée dans la base de données.',
        });
      }

      setAnalysisHistory((prev) => [{
        result: data,
        filename,
        timestamp: new Date(),
        saved,
        cvPreview: cvTextContent.substring(0, 200),
        notes: '',
        status: 'archived',
      }, ...prev].slice(0, 10));

      toast.success(data.label === 'Invite' ? 'Candidat invité' : 'Candidat rejeté', {
        description: `${data.name} — ${data.target_role} (${data.confidence.toFixed(1)}%)${saved ? ' • Sauvegardé' : ''}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'analyse du CV.';
      setError(msg);
      toast.error('Erreur d\'analyse', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setFileName(null);
    setAnalysisDuration(null);
    setCvText(null);
    setShowCvPreview(false);
    setShowNotes(false);
    setAnalysisNotes('');
    setCandidateStatus('archived'); // Auto-archive
  };

  const saveNotes = () => {
    if (!result) return;
    setAnalysisHistory((prev) =>
      prev.map((r, i) => i === 0 ? { ...r, notes: analysisNotes } : r)
    );
    toast.success('Note sauvegardée', { description: 'Votre note a été ajoutée à l\'analyse.' });
  };

  const copyAnalysisSummary = () => {
    if (!result) return;
    const currentNotes = analysisHistory[0]?.notes || analysisNotes;
    const lines = [
      `Candidat : ${result.name}`,
      `Poste : ${result.target_role}`,
      `Décision : ${result.label}`,
      `Confiance : ${result.confidence.toFixed(1)}%`,
      `Invite : ${result.probabilities.Invite.toFixed(1)}% | Reject : ${result.probabilities.Reject.toFixed(1)}%`,
      `Étape : ${result.stage === 'hard_filter' ? 'Filtre éliminatoire' : 'Modèle ML'}`,
      `Équité : ${result.fairness_adjusted ? 'Oui' : 'Non'}`,
    ];
    if (result.hard_filter_reasons?.length) {
      lines.push(`Filtres : ${result.hard_filter_reasons.join(', ')}`);
    }
    if (result.explanation?.top_features?.length) {
      lines.push('Facteurs principaux :');
      result.explanation.top_features.slice(0, 3).forEach(([f, v]) => {
        lines.push(`  ${f}: ${v > 0 ? '+' : ''}${v.toFixed(4)}`);
      });
    }
    lines.push(`Modèle : ${result.model_name} (${result.version})`);
    if (currentNotes) {
      lines.push(`Notes : ${currentNotes}`);
    }
    if (candidateStatus !== 'pending') {
      lines.push(`Statut : ${candidateStatus === 'invited' ? 'Entretien planifié' : 'Archivé'}`);
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success('Résumé copié', { description: 'L\'analyse a été copiée dans le presse-papiers.' });
    }).catch(() => {
      toast.error('Erreur de copie', { description: 'Impossible de copier dans le presse-papiers.' });
    });
  };

  const exportAnalysis = () => {
    if (!result) return;
    const currentNotes = analysisHistory[0]?.notes || analysisNotes;
    const lines = [
      '═══════════════════════════════════════════',
      '  RAPPORT D\'ANALYSE CV — LuxTalent V2',
      '═══════════════════════════════════════════',
      '',
      `Candidat : ${result.name}`,
      `Poste cible : ${result.target_role}`,
      `Décision : ${result.label}`,
      `Confiance : ${result.confidence.toFixed(1)}%`,
      `Probabilités : Invite ${result.probabilities.Invite.toFixed(1)}% / Reject ${result.probabilities.Reject.toFixed(1)}%`,
      `Étape : ${result.stage === 'hard_filter' ? 'Filtre éliminatoire' : 'Modèle ML'}`,
      `Ajustement d'équité : ${result.fairness_adjusted ? 'Oui' : 'Non'}`,
      `Modèle : ${result.model_name}`,
      `Version : ${result.version}`,
    ];

    if (candidateStatus !== 'pending') {
      lines.push(`Statut : ${candidateStatus === 'invited' ? 'Entretien planifié' : 'Archivé'}`);
    }
    if (currentNotes) {
      lines.push(`Notes RH : ${currentNotes}`);
    }

    lines.push('', '── Facteurs principaux ──');
    lines.push(...result.explanation.top_features.map(
      ([feat, val]) => `  ${feat}: ${val > 0 ? '+' : ''}${val.toFixed(4)}`
    ));
    lines.push('', '── Explication ──', result.explanation.decision_drivers, '');

    if (result.hard_filter_reasons && result.hard_filter_reasons.length > 0) {
      lines.push('── Filtres éliminatoires ──');
      result.hard_filter_reasons.forEach((r) => lines.push(`  • ${r}`));
      lines.push('');
    }

    lines.push('── Valeurs SHAP complètes ──');
    Object.entries(result.explanation.shap_values)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .forEach(([feat, val]) => {
        lines.push(`  ${feat}: ${val > 0 ? '+' : ''}${val.toFixed(4)}`);
      });

    lines.push('', `Généré le : ${new Date().toLocaleString('fr-FR')}`);
    if (analysisDuration !== null) {
      lines.push(`Durée d'analyse : ${(analysisDuration / 1000).toFixed(1)}s`);
    }
    lines.push('═══════════════════════════════════════════');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analyse-${result.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Rapport exporté', { description: 'Le fichier a été téléchargé.' });
  };

  const exportAnalysisPDFReport = () => {
    if (!result) return;
    const currentNotes = analysisHistory[0]?.notes || analysisNotes;
    exportAnalysisPDF(result, fileName || 'cv.txt', analysisDuration, currentNotes);
    toast.success('Rapport PDF exporté', { description: 'Le fichier PDF a été téléchargé.' });
  };

  const isInvite = result?.label === 'Invite';

  // Sparkline data from history
  const inviteSparkData = analysisHistory.map((_, i) => analysisHistory.slice(0, i + 1).filter(a => a.result.label === 'Invite').length);
  const rejectSparkData = analysisHistory.map((_, i) => analysisHistory.slice(0, i + 1).filter(a => a.result.label === 'Reject').length);
  const confSparkData = analysisHistory.map(a => a.result.confidence);
  const fairnessSparkData = analysisHistory.map((_, i) => {
    const slice = analysisHistory.slice(0, i + 1);
    return Math.round((slice.filter(a => a.result.fairness_adjusted).length / slice.length) * 100);
  });

  return (
    <div className="space-y-6">
      {/* Animated Welcome Banner — Enhanced with gradient mesh */}
      <div className="animate-banner-mount welcome-banner-mesh noise-texture rounded-2xl px-5 py-4 flex items-center gap-3 relative overflow-hidden">
        {/* Decorative floating shapes */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-emerald-400/10 dark:bg-emerald-500/5 animate-float-shape pointer-events-none" />
        <div className="absolute right-24 top-1/3 w-8 h-8 rounded-full bg-emerald-300/10 dark:bg-emerald-400/5 animate-float-shape pointer-events-none" style={{ animationDelay: '2s' }} />
        <div className="absolute left-4 bottom-1 w-6 h-6 rounded-full bg-emerald-300/8 dark:bg-emerald-400/5 animate-float-shape pointer-events-none" style={{ animationDelay: '4s' }} />
        <div className="relative flex items-center gap-3 w-full">
          <div className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md flex-shrink-0 ring-2 ring-emerald-400/20" aria-hidden="true">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-emerald-800 dark:text-emerald-200">Bienvenue sur l&apos;analyse CV</h2>
            <p className="text-[10px] sm:text-xs text-emerald-700/70 dark:text-emerald-400/60 mt-0.5">Déposez un CV et laissez l&apos;IA vous guider dans la pré-sélection</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <div className="session-timer-pill flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700/80 dark:text-emerald-300/80" aria-label={`Session en cours depuis ${formatSessionTime(sessionSeconds)}`}>
              <Timer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Session : {formatSessionTime(sessionSeconds)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Cards — Enhanced with gradients, trends, sparklines */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card-enhanced-v2 stat-card-gradient-analyses rounded-xl border border-slate-200/80 dark:border-slate-700/50 p-4 shadow-sm border-l-4 border-l-emerald-400 relative overflow-hidden noise-texture">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Analyses</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{analysisHistory.length}</p>
                {analysisHistory.length > 0 && <TrendingUp className="w-3.5 h-3.5 trend-arrow-up" />}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">analyses</p>
            </div>
            <MiniSparkline data={inviteSparkData} color="oklch(0.65 0.18 160)" />
          </div>
        </div>
        <div className="stat-card-enhanced-v2 stat-card-gradient-invites rounded-xl border border-slate-200/80 dark:border-slate-700/50 p-4 shadow-sm border-l-4 border-l-emerald-400 relative overflow-hidden noise-texture">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Invités</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analysisHistory.filter((a) => a.result.label === 'Invite').length}</p>
                {analysisHistory.filter((a) => a.result.label === 'Invite').length > 0 && <TrendingUp className="w-3.5 h-3.5 trend-arrow-up" />}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">candidats</p>
            </div>
            <MiniSparkline data={rejectSparkData} color="oklch(0.65 0.18 160)" />
          </div>
        </div>
        <div className="stat-card-enhanced-v2 stat-card-gradient-rejects rounded-xl border border-slate-200/80 dark:border-slate-700/50 p-4 shadow-sm border-l-4 border-l-red-400 relative overflow-hidden noise-texture">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <XCircle className="w-3.5 h-3.5 text-red-400 dark:text-red-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Rejetés</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-2xl font-bold text-red-500 dark:text-red-400">{analysisHistory.filter((a) => a.result.label === 'Reject').length}</p>
                {analysisHistory.filter((a) => a.result.label === 'Reject').length > 0 && <TrendingDown className="w-3.5 h-3.5 trend-arrow-down" />}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">candidats</p>
            </div>
            <MiniSparkline data={confSparkData} color="oklch(0.6 0.15 25)" />
          </div>
        </div>
        <div className="stat-card-enhanced-v2 stat-card-gradient-equity rounded-xl border border-slate-200/80 dark:border-slate-700/50 p-4 shadow-sm border-l-4 border-l-emerald-300 relative overflow-hidden noise-texture">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Équité</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{analysisHistory.length > 0 ? Math.round((analysisHistory.filter((a) => a.result.fairness_adjusted).length / analysisHistory.length) * 100) : 0}%</p>
                {analysisHistory.filter((a) => a.result.fairness_adjusted).length > 0 && <TrendingUp className="w-3.5 h-3.5 trend-arrow-up" />}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">ajustés</p>
            </div>
            <MiniSparkline data={fairnessSparkData} color="oklch(0.55 0.12 160)" />
          </div>
        </div>
      </div>

      {/* Process Steps Section removed per user request */}

      {/* Loading state with animated pipeline */}
      {loading && (
        <Card className="border-emerald-100 shadow-sm animate-card-enter">
          <CardContent className="p-10 flex flex-col items-center justify-center gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/80 flex items-center justify-center">
                <Brain className="w-10 h-10 text-emerald-500 animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-700">Analyse en cours</p>
              <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
                Traitement du CV en 4 étapes
              </p>
            </div>
            {fileName && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">{fileName}</span>
              </div>
            )}
            {/* Animated pipeline steps — wrap on mobile */}
            <div className="flex flex-wrap items-center justify-center gap-1 mt-1" role="status" aria-label="Progression de l&#39;analyse">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-1">
                  <div className={`px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-medium transition-all duration-500 ${
                    i < pipelineStep
                      ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                      : i === pipelineStep
                        ? 'bg-emerald-50 text-emerald-600 ring-2 ring-emerald-200 shadow-sm'
                        : 'bg-slate-50 text-slate-300'
                  }`}>
                    <span className="flex items-center gap-1.5">
                      {i < pipelineStep ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : i === pipelineStep ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-slate-200" />
                      )}
                      {step}
                    </span>
                  </div>
                  {i < 3 && (
                    <div className={`w-3 h-px transition-colors duration-500 ${
                      i < pipelineStep ? 'bg-emerald-400' : 'bg-slate-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && (
        <Card className="border-red-200 bg-red-50/80 shadow-sm animate-card-enter">
          <CardContent className="p-5 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">Impossible d&apos;analyser le CV</p>
              <p className="text-sm text-red-600/80 mt-0.5">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="border-red-200 text-red-600 hover:bg-red-50 flex-shrink-0">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result card with score ring, animated counter, confetti */}
      {result && !loading && (
        <Card className={`border-2 shadow-md overflow-hidden animate-result-enter relative ${
          isInvite ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'
        }`}>
          <ConfettiParticles active={showConfetti} />
          {/* Color bar at top — animated gradient */}
          <div className={`h-2 ${isInvite ? 'animate-gradient-bar-invite' : 'animate-gradient-bar-reject'}`} />
          <CardContent className="p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-sm ${
                  isInvite ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 ring-1 ring-emerald-200/50 dark:ring-emerald-700/30' : 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 ring-1 ring-red-200/50 dark:ring-red-700/30'
                }`}>
                  {isInvite ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-7 h-7 text-red-500 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{result.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>{result.target_role}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs">{result.stage === 'hard_filter' ? 'Filtre éliminatoire' : 'Modèle ML'}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {/* Time badge showing analysis duration */}
                {analysisDuration !== null && (
                  <div className="time-badge flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{(analysisDuration / 1000).toFixed(1)}s</span>
                  </div>
                )}
                {result.fairness_adjusted && (
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-50 gap-1">
                    <Shield className="w-3 h-3" />
                    Équité
                  </Badge>
                )}
                {result.confidence >= 90 && (
                  <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 gap-1 text-[10px]">
                    <Zap className="w-3 h-3" />
                    Haute confiance
                  </Badge>
                )}
                {result.confidence < 60 && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100 gap-1 text-[10px]">
                    <AlertTriangle className="w-3 h-3" />
                    Basse confiance
                  </Badge>
                )}
                <Badge className={`text-sm font-bold px-3 py-1 border-0 shadow-sm ${
                  isInvite
                    ? 'bg-gradient-to-r from-emerald-100 to-emerald-50 text-emerald-700 decision-badge-glow-invite'
                    : 'bg-gradient-to-r from-red-100 to-red-50 text-red-700 decision-badge-glow-reject'
                }`}>
                  {result.label}
                </Badge>
              </div>
            </div>

            {/* Confidence highlight with Score Ring */}
            <div className={`p-4 rounded-xl ${isInvite ? 'bg-emerald-50/60 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30' : 'bg-red-50/60 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30'}`}>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ScoreRing value={result.confidence} isInvite={isInvite} />
                <div className="flex-1 w-full sm:w-auto">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-semibold text-slate-700">Niveau de confiance</span>
                    <span className={`text-2xl font-bold confidence-glow ${isInvite ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {animatedConfidence.toFixed(1)}%
                    </span>
                  </div>
                  {/* Dual bar */}
                  <div className="flex h-5 rounded-full overflow-hidden bg-slate-200/80 shadow-inner">
                    <div
                      className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700 ease-out flex items-center justify-center animate-progress"
                      style={{ width: `${result.probabilities.Invite}%` }}
                    >
                      {result.probabilities.Invite > 15 && (
                        <span className="text-[10px] font-bold text-white drop-shadow-sm">{result.probabilities.Invite.toFixed(0)}%</span>
                      )}
                    </div>
                    <div
                      className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700 ease-out flex items-center justify-center animate-progress"
                      style={{ width: `${result.probabilities.Reject}%` }}
                    >
                      {result.probabilities.Reject > 15 && (
                        <span className="text-[10px] font-bold text-white drop-shadow-sm">{result.probabilities.Reject.toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                      Invite
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                      Reject
                      <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-red-400 to-red-500" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Time saved indicator removed per user request */}

            {/* Hard filter reasons */}
            {result.stage === 'hard_filter' && result.hard_filter_reasons && result.hard_filter_reasons.length > 0 && (
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <span className="text-sm font-semibold text-amber-700">Filtre éliminatoire</span>
                </div>
                <ul className="text-sm text-amber-700 space-y-1.5">
                  {result.hard_filter_reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 ml-0.5">
                      <span className="text-amber-400 mt-0.5">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top 3 SHAP features — enhanced visual separation */}
            {result.stage === 'ml_model' && result.explanation && (
              <div className="shap-section-divider p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Facteurs principaux de la décision</h4>
                </div>
                <ShapTopFeatures shapValues={result.explanation.shap_values} label={result.label} />
                <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/50">
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {result.explanation.decision_drivers}
                  </p>
                </div>
              </div>
            )}

            {/* CV Text Preview */}
            {cvText && (
              <div className="bg-slate-50/60 border border-slate-200/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowCvPreview(!showCvPreview)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5" />
                    Aperçu du CV
                  </span>
                  {showCvPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showCvPreview && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap bg-white rounded-lg p-3 border border-slate-100 max-h-32 overflow-y-auto custom-scrollbar">
                      {cvText.length > 200 ? (
                        <>
                          {showCvPreview ? cvText : cvText.substring(0, 200) + '...'}
                          {cvText.length > 200 && (
                            <button
                              onClick={() => setShowCvPreview(true)}
                              className="text-emerald-600 hover:text-emerald-700 font-medium ml-1"
                            >
                              {cvText.length > 200 ? '' : 'Voir plus'}
                            </button>
                          )}
                        </>
                      ) : cvText}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1.5">{cvText.length} caractères • {fileName}</p>
                  </div>
                )}
              </div>
            )}

            {/* Auto-archived indicator — all candidates are automatically archived */}
            <div className="flex items-center gap-2">
              <Badge className="bg-slate-100 text-slate-600 border border-slate-200 gap-1.5 px-3 py-1">
                <Archive className="w-3.5 h-3.5" />
                Archivé automatiquement
              </Badge>
            </div>

            {/* Analysis Notes */}
            <div className="bg-amber-50/30 border border-amber-100/50 rounded-xl overflow-hidden">
              {!showNotes ? (
                <button
                  onClick={() => { setShowNotes(true); setAnalysisNotes(analysisHistory[0]?.notes || ''); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-700/80 hover:bg-amber-50/50 transition-colors"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  Ajouter une note
                </button>
              ) : (
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700/80">
                    <StickyNote className="w-3.5 h-3.5" />
                    <span>Note sur le candidat</span>
                  </div>
                  <Textarea
                    value={analysisNotes}
                    onChange={(e) => setAnalysisNotes(e.target.value)}
                    placeholder="Ajoutez vos observations sur ce candidat..."
                    className="note-textarea min-h-[60px] text-sm border-amber-200/50 bg-white resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={saveNotes} className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 text-xs h-7">
                      <Save className="w-3 h-3" />
                      Sauvegarder
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowNotes(false)} className="text-amber-600/60 hover:text-amber-700 text-xs h-7">
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs text-slate-400">{result.model_name}</p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-200">{result.version}</Badge>
                {analysisDuration !== null && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    Analyse en {(analysisDuration / 1000).toFixed(1)}s
                  </span>
                )}
                {analysisHistory[0]?.saved && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                    <Save className="w-3 h-3" />
                    Sauvegardé
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyAnalysisSummary}
                  className="text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-slate-200 gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copier
                </Button>
                <Button variant="outline" size="sm" onClick={exportAnalysis} className="text-emerald-600 hover:bg-emerald-50 border-emerald-200 gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  TXT
                </Button>
                <Button variant="outline" size="sm" onClick={exportAnalysisPDFReport} className="text-emerald-600 hover:bg-emerald-50 border-emerald-200 gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="text-slate-500 hover:text-slate-700 gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Nouvelle analyse
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drop zone with enhanced animations */}
      {!loading && (
        <Card className={`border-2 border-dashed transition-all duration-300 shadow-sm overflow-hidden relative drop-zone-glow drop-zone-hover-scale ${
          dragInvalidType
            ? 'drop-zone-invalid'
            : dragActive
              ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20 drop-zone-active scale-[1.01]'
              : result
                ? 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30 hover:border-slate-300'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/50 hover:border-emerald-300 hover:bg-emerald-50/20 dark:hover:bg-emerald-900/10'
        }`}>
          {/* Emerald gradient at top of drop zone when no result */}
          {!result && (
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-50/60 dark:from-emerald-900/20 to-transparent pointer-events-none" />
          )}
          {/* Dot pattern background when no result */}
          {!result && (
            <div className="absolute inset-0 dot-pattern opacity-[0.03] pointer-events-none" />
          )}
          {/* Drag-over expanding ring */}
          {dragActive && !dragInvalidType && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-20 h-20 rounded-full border-2 border-emerald-400/50 animate-drag-ring" />
            </div>
          )}
          {/* Invalid format overlay */}
          {dragInvalidType && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/30 rounded-xl px-4 py-2 shadow-lg">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Format non supporté — fichiers .txt uniquement
                </p>
              </div>
            </div>
          )}
          {/* Hidden file input — always in DOM so ref works even after result */}
          <input ref={fileInputRef} type="file" accept=".txt" onChange={handleFileSelect} className="hidden" aria-label="Sélectionner un fichier CV" />
          <CardContent className={`flex flex-col items-center justify-center text-center transition-all duration-300 relative ${
            result ? 'p-8' : 'p-12 sm:p-20'
          }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            tabIndex={0}
            role="button"
            aria-label="Zone de dépôt de CV — glissez un fichier ou appuyez sur Entrée pour parcourir"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            {!result ? (
              <>
                <div className={`rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 relative ${
                  dragActive
                    ? 'w-24 h-24 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-800/30 scale-110'
                    : 'w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/20'
                }`}>
                  <div className="animate-float relative">
                    <Upload className={`transition-all duration-300 ${dragActive ? 'w-12 h-12 text-emerald-600 dark:text-emerald-400' : 'w-10 h-10 text-emerald-500 dark:text-emerald-400'}`} />
                    {/* Pulsing ring when idle */}
                    {!dragActive && (
                      <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-upload-pulse" />
                    )}
                  </div>
                </div>

                <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                  {dragInvalidType ? 'Format non supporté' : dragActive ? 'Déposez votre CV' : 'Glissez votre CV ici'}
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                  {dragInvalidType
                    ? 'Veuillez déposer un fichier .txt uniquement'
                    : 'Analyse instantanée avec explications SHAP et correction d\'équité'
                  }
                </p>

                {/* 3-Step process illustration — simpler/smaller on mobile */}
                {!dragActive && !dragInvalidType && (
                  <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 mt-5 drop-zone-illustration-step">
                    <div className="drop-zone-step flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50/80 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-600/50">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 flex items-center justify-center">
                        <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 dark:text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Glissez</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-500 drop-zone-step-arrow hidden sm:block" />
                    <div className="w-px h-2 bg-slate-300 dark:bg-slate-600 sm:hidden" aria-hidden="true" />
                    <div className="drop-zone-step flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50/80 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-600/50">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 flex items-center justify-center">
                        <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 dark:text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Analyse</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-500 drop-zone-step-arrow hidden sm:block" style={{ animationDelay: '0.3s' }} />
                    <div className="w-px h-2 bg-slate-300 dark:bg-slate-600 sm:hidden" aria-hidden="true" />
                    <div className="drop-zone-step flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50/80 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-600/50">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 dark:text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Résultat</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-4">
                  <div className="h-px w-8 bg-slate-200 dark:bg-slate-600" />
                  <span className="text-sm text-slate-400 dark:text-slate-500">ou</span>
                  <div className="h-px w-8 bg-slate-200 dark:bg-slate-600" />
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 min-h-[44px] px-6 sm:px-8 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-200/50 dark:shadow-emerald-900/30 transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Parcourir les fichiers
                </Button>
                <p className="text-xs text-slate-400/70 dark:text-slate-500/60 mt-2 browse-hint-pulse">
                  ou appuyez sur Parcourir
                </p>

                {/* Keyboard shortcut hint */}
                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-3 hidden sm:block">
                  <Keyboard className="w-3 h-3 inline mr-1" />
                  Raccourci : <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-500 dark:text-slate-400 font-mono">Ctrl+O</kbd> pour ouvrir • <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-500 dark:text-slate-400 font-mono">?</kbd> pour l&apos;aide
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Glissez un autre CV pour réanalyser
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 mt-2"
                >
                  <FileText className="w-4 h-4 mr-1.5" />
                  Parcourir
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guided empty state for first-time users */}
      {analysisHistory.length === 0 && !result && !loading && !historyLoading && (
        <div className="animate-fade-in-up">
          <Card className="border-emerald-100/50 bg-gradient-to-b from-white to-emerald-50/20 shadow-sm overflow-hidden">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 flex items-center justify-center mb-4 shadow-sm">
                <FileText className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 mb-1.5">Prêt pour votre première analyse</h3>
              <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-4">
                Déposez un fichier <span className="font-semibold text-slate-600">.txt</span> contenant un CV dans la zone ci-dessus. L&apos;IA analysera le profil et vous donnera une recommandation avec explications détaillées.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Correction d&apos;équité automatique</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Explications SHAP transparentes</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                  <Archive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Archivage automatique</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Analysis History with 3D tilt + comparison */}
      {analysisHistory.length > 1 && !loading && (
        <div className="animate-card-enter">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-600">Analyses récentes</h3>
            <span className="text-xs text-slate-400">({analysisHistory.length} analyses)</span>
            {analysisHistory.length >= 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1.5 text-xs h-7"
                onClick={() => setShowComparison(true)}
              >
                <GitCompare className="w-3.5 h-3.5" />
                Comparer
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analysisHistory.slice(1).map((record, i) => {
              const recInvite = record.result.label === 'Invite';
              return (
                <div
                  key={i}
                  className={`history-card-3d p-3 rounded-xl border cursor-pointer relative overflow-hidden ${
                    recInvite ? 'bg-emerald-50/50 border-emerald-100 hover:border-emerald-200' : 'bg-red-50/50 border-red-100 hover:border-red-200'
                  }`}
                  onClick={() => {
                    setResult(record.result);
                    setFileName(record.filename);
                    setCandidateStatus(record.status || 'pending');
                    setAnalysisNotes(record.notes || '');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {/* Click overlay */}
                  <div className="history-card-overlay">
                    <span className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      Voir l&apos;analyse
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-slate-700 truncate">{record.result.name}</span>
                    <div className="flex items-center gap-1">
                      {record.saved && <Save className="w-3 h-3 text-emerald-400" />}
                      {record.status === 'invited' && <Calendar className="w-3 h-3 text-emerald-500" />}
                      {record.status === 'archived' && <Archive className="w-3 h-3 text-slate-400" />}
                      <Badge className={`text-[10px] border-0 ${
                        recInvite ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {record.result.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate">{record.result.target_role}</span>
                    <span className="font-mono font-medium">{record.result.confidence.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{record.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-slate-300">•</span>
                    <span>{record.filename}</span>
                  </div>
                  {/* Notes indicator */}
                  {record.notes && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-600/80">
                      <StickyNote className="w-3 h-3" />
                      <span className="truncate">{record.notes}</span>
                    </div>
                  )}
                  {/* Mini confidence bar */}
                  <div className="mt-2 h-[2px] w-full rounded-full bg-slate-200/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        recInvite
                          ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                          : 'bg-gradient-to-r from-red-400 to-red-500'
                      }`}
                      style={{ width: `${record.result.confidence}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analysis Comparison Modal */}
      {showComparison && analysisHistory.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-overlay-enhanced" onClick={() => setShowComparison(false)} role="dialog" aria-modal="true" aria-label="Comparaison d&#39;analyses">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[80vh] overflow-y-auto custom-scrollbar animate-comparison-slide" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 p-4 flex items-center justify-between rounded-t-2xl z-10">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-emerald-500" />
                Comparaison d&apos;analyses
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowComparison(false)} className="close-btn-hover h-8 w-8 min-w-[44px] min-h-[44px] p-0 rounded-full" aria-label="Fermer la comparaison">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {analysisHistory.slice(0, 2).map((record, i) => {
                  const recInvite = record.result.label === 'Invite';
                  return (
                    <div key={i} className={`p-4 rounded-xl border-2 ${
                      recInvite ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'
                    }`}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-800 truncate">{record.result.name}</h4>
                          <Badge className={`text-[10px] border-0 ${
                            recInvite ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {record.result.label}
                          </Badge>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Poste</span>
                            <span className="font-medium text-slate-700 truncate ml-2">{record.result.target_role}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Confiance</span>
                            <span className={`font-bold ${recInvite ? 'text-emerald-600' : 'text-red-600'}`}>{record.result.confidence.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Invite</span>
                            <span className="font-medium text-emerald-600">{record.result.probabilities.Invite.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Reject</span>
                            <span className="font-medium text-red-600">{record.result.probabilities.Reject.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Étape</span>
                            <span className="font-medium text-slate-700">{record.result.stage === 'hard_filter' ? 'Filtre' : 'ML'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Équité</span>
                            <span className={`font-medium ${record.result.fairness_adjusted ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {record.result.fairness_adjusted ? 'Oui' : 'Non'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Fichier</span>
                            <span className="font-medium text-slate-700 truncate ml-2">{record.filename}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Heure</span>
                            <span className="font-medium text-slate-700">{record.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          {record.notes && (
                            <div className="pt-2 border-t border-slate-100">
                              <span className="text-slate-500">Notes</span>
                              <p className="text-slate-700 mt-0.5 italic">{record.notes}</p>
                            </div>
                          )}
                          {record.status && record.status !== 'pending' && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Statut</span>
                              <span className={`font-medium ${record.status === 'invited' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                {record.status === 'invited' ? 'Entretien planifié' : 'Archivé'}
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Top features */}
                        {record.result.explanation?.top_features && (
                          <div className="pt-2 border-t border-slate-100">
                            <p className="text-[10px] text-slate-500 mb-1.5">Top facteurs</p>
                            {record.result.explanation.top_features.slice(0, 2).map(([feat, val]) => (
                              <div key={feat} className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 truncate">{feat}</span>
                                <span className={`font-mono ${val > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {val > 0 ? '+' : ''}{val.toFixed(3)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* VS badge */}
              <div className="flex justify-center -mt-6 relative z-10">
                <div className="bg-white border-2 border-slate-200 rounded-full w-10 h-10 flex items-center justify-center shadow-md text-xs font-bold text-slate-500">
                  VS
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts overlay with enhanced animation */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-overlay-enhanced" onClick={() => setShowShortcuts(false)} role="dialog" aria-modal="true" aria-label="Raccourcis clavier">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-4 sm:p-6 animate-modal-enhanced" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-emerald-500" />
                Raccourcis clavier
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowShortcuts(false)} className="close-btn-hover h-8 w-8 min-w-[44px] min-h-[44px] p-0 rounded-full" aria-label="Fermer les raccourcis">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {[
                { keys: 'Ctrl + O', desc: 'Ouvrir un fichier CV' },
                { keys: 'Ctrl + E', desc: 'Exporter le rapport d\'analyse' },
                { keys: 'Échap', desc: 'Réinitialiser / Fermer' },
                { keys: '?', desc: 'Afficher cette aide' },
              ].map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{shortcut.desc}</span>
                  <kbd className="px-2.5 py-1.5 bg-slate-50 rounded-lg text-xs font-mono text-slate-700 border border-slate-200 shadow-sm">
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowShortcuts(false)} className="mt-5 w-full min-h-[44px] border-emerald-200 text-emerald-600 hover:bg-emerald-50 active:scale-95">
              Fermer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
