'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FairnessGauge } from './fairness-gauge';
import { fetchFairnessMetrics, fetchScreeningLog, fetchSavedAnalyses } from '@/lib/api';
import jsPDF from 'jspdf';
import { FEATURE_LABELS, SHAP_FEATURE_LABELS } from '@/lib/types';
import type { FairnessMetricsResponse, ScreeningLogEntry, PredictionResponse, CandidateStatus, ExportFormat } from '@/lib/types';
import { MOCK_PREDICTION, MOCK_REJECT_PREDICTION, MOCK_FAIRNESS_TREND } from '@/lib/mock-data';
import { ShapWaterfall, FeatureTable } from './shap-waterfall';
import { toast } from 'sonner';
import {
  Scale,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  Shield,
  Clock,
  FileText,
  RefreshCw,
  Users,
  Eye,
  ChevronRight,
  BarChart3,
  Search,
  X,
  Download,
  Calendar,
  ChevronDown,
  Info,
  Award,
  Trash2,
  GitCompareArrows,
  ChevronLeft,
  Tag,
  Sparkles,
  Target,
  Activity,
  Zap,
  FileJson,
  FileSpreadsheet,
  File,
} from 'lucide-react';

const ITEMS_PER_PAGE = 10;

// Status tag configuration
const STATUS_CONFIG: Record<string, { label: string; cssClass: string; dotColor: string }> = {
  'En attente': { label: 'En attente', cssClass: 'status-en-attente', dotColor: 'bg-amber-400' },
  'Entretien planifié': { label: 'Entretien', cssClass: 'status-entretien', dotColor: 'bg-emerald-400' },
  'Refusé': { label: 'Refusé', cssClass: 'status-refuse', dotColor: 'bg-red-400' },
  'Embauché': { label: 'Embauché', cssClass: 'status-embauche', dotColor: 'bg-teal-400' },
};

export function FairnessHistory({ refreshKey }: { refreshKey?: number }) {
  const [metrics, setMetrics] = useState<FairnessMetricsResponse | null>(null);
  const [logEntries, setLogEntries] = useState<ScreeningLogEntry[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(true);
  const [logError, setLogError] = useState<string | null>(null);
  const [filterLabel, setFilterLabel] = useState<'all' | 'Invite' | 'Reject'>('all');
  const [selectedEntry, setSelectedEntry] = useState<ScreeningLogEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showMetricInfo, setShowMetricInfo] = useState<string | null>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  // Comparison mode state
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<ScreeningLogEntry[]>([]);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  // New features state
  const [currentPage, setCurrentPage] = useState(1);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('txt');
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all'>('all');
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Analytics dashboard toggle
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setShowDateDropdown(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load both screening log and fairness metrics on mount
  // Priority: DB data > mock data
  useEffect(() => {
    setLogLoading(true);
    
    // Try loading from DB first
    fetchSavedAnalyses()
      .then((dbRecords) => {
        if (dbRecords.length > 0) {
          const dbEntries: ScreeningLogEntry[] = dbRecords.map((r) => ({
            timestamp: r.createdAt,
            filename: r.filename,
            name: r.candidateName,
            target_role: r.targetRole,
            stage: r.stage,
            label: r.label as 'Invite' | 'Reject',
            confidence: r.confidence,
            model_name: r.modelName,
            fairness_adjusted: r.fairnessAdjusted,
            top_driver: r.topDriver,
            reasons: r.reasons,
            status: 'En attente' as CandidateStatus,
          }));
          setLogEntries(dbEntries);
          setLogLoading(false);
        } else {
          // Fall back to mock/screening-log API
          fetchScreeningLog()
            .then((data) => setLogEntries(data))
            .catch((err) => {
              setLogError(err instanceof Error ? err.message : 'Erreur lors du chargement de l\'historique.');
              toast.error('Erreur', { description: 'Impossible de charger l\'historique.' });
            })
            .finally(() => setLogLoading(false));
        }
      })
      .catch(() => {
        // Fall back to mock/screening-log API
        fetchScreeningLog()
          .then((data) => setLogEntries(data))
          .catch((err) => {
            setLogError(err instanceof Error ? err.message : 'Erreur lors du chargement de l\'historique.');
            toast.error('Erreur', { description: 'Impossible de charger l\'historique.' });
          })
          .finally(() => setLogLoading(false));
      });

    loadMetrics();
  }, [refreshKey]);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await fetchFairnessMetrics();
      setMetrics(data);
      setLastUpdated(new Date());
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : 'Erreur lors du chargement des métriques.');
      toast.error('Erreur', { description: 'Impossible de charger les métriques de fairness.' });
    } finally {
      setMetricsLoading(false);
    }
  };

  const filteredEntries = logEntries
    .filter((e) => filterLabel === 'all' || e.label === filterLabel)
    .filter((e) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.target_role.toLowerCase().includes(q) ||
        e.filename.toLowerCase().includes(q)
      );
    })
    .filter((e) => {
      if (dateFilter === 'all') return true;
      const entryDate = new Date(e.timestamp);
      const now = new Date();
      if (dateFilter === 'today') {
        return entryDate.toDateString() === now.toDateString();
      }
      if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return entryDate >= weekAgo;
      }
      if (dateFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return entryDate >= monthAgo;
      }
      return true;
    })
    .filter((e) => {
      if (statusFilter === 'all') return true;
      return e.status === statusFilter;
    });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ITEMS_PER_PAGE));
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const entryRangeStart = filteredEntries.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0;
  const entryRangeEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredEntries.length);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterLabel, searchQuery, dateFilter, statusFilter]);

  // Keyboard support: close modal on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (selectedEntry) {
        setSelectedEntry(null);
      }
      if (showComparisonModal) {
        setShowComparisonModal(false);
      }
    }
  }, [selectedEntry, showComparisonModal]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedEntry || showComparisonModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedEntry, showComparisonModal]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Summary stats
  const totalEntries = logEntries.length;
  const inviteCount = logEntries.filter((e) => e.label === 'Invite').length;
  const rejectCount = logEntries.filter((e) => e.label === 'Reject').length;
  const fairnessAdjustedCount = logEntries.filter((e) => e.fairness_adjusted).length;
  const avgConfidence = logEntries.length > 0
    ? logEntries.filter((e) => e.confidence > 0).reduce((sum, e) => sum + e.confidence, 0) / logEntries.filter((e) => e.confidence > 0).length
    : 0;

  // Most analyzed role
  const roleCounts = logEntries.reduce<Record<string, number>>((acc, e) => {
    acc[e.target_role] = (acc[e.target_role] || 0) + 1;
    return acc;
  }, {});
  const mostAnalyzedRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  // Analytics: Role breakdown
  const roleBreakdown = logEntries.reduce<Record<string, { invite: number; reject: number }>>((acc, e) => {
    if (!acc[e.target_role]) {
      acc[e.target_role] = { invite: 0, reject: 0 };
    }
    if (e.label === 'Invite') {
      acc[e.target_role].invite++;
    } else {
      acc[e.target_role].reject++;
    }
    return acc;
  }, {});

  // Analytics: Confidence distribution bins
  const confidenceBins = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
  logEntries.forEach((e) => {
    if (e.confidence <= 0) return;
    const binIndex = Math.min(Math.floor(e.confidence / 20), 4);
    confidenceBins[binIndex]++;
  });
  const maxBinCount = Math.max(...confidenceBins, 1);

  // Confidence median
  const validConfidences = logEntries.filter((e) => e.confidence > 0).map((e) => e.confidence).sort((a, b) => a - b);
  const confidenceMedian = validConfidences.length > 0
    ? validConfidences[Math.floor(validConfidences.length / 2)]
    : 0;

  // Fairness Score Composite
  const computeFairnessScore = (): number => {
    if (!metrics) return 0;
    const epdScore = Math.max(0, Math.min(100, 100 - metrics.fair_model.epd * 5));
    const ridScore = Math.min(100, metrics.fair_model.rid * 100);
    const deltaTprScore = Math.max(0, Math.min(100, 100 - metrics.fair_model.delta_tpr * 5));
    // Weighted: EPD 35%, RID 40%, Delta TPR 25%
    return Math.round(epdScore * 0.35 + ridScore * 0.40 + deltaTprScore * 0.25);
  };
  const fairnessScore = computeFairnessScore();

  // Trend data
  const trendData = MOCK_FAIRNESS_TREND;

  // Delete entry handler
  const handleDeleteEntry = (e: React.MouseEvent, entry: ScreeningLogEntry) => {
    e.stopPropagation();
    setLogEntries((prev) => prev.filter((item) => item !== entry));
    setSelectedForComparison((prev) => prev.filter((item) => item !== entry));
    toast.success('Entrée supprimée de l\'historique');
  };

  // Update entry status
  const handleUpdateStatus = (entry: ScreeningLogEntry, newStatus: CandidateStatus) => {
    setLogEntries((prev) => prev.map((item) => item === entry ? { ...item, status: newStatus } : item));
    toast.success(`Statut mis à jour : ${newStatus}`);
  };

  // Comparison mode handlers
  const toggleComparisonMode = () => {
    if (comparisonMode) {
      setSelectedForComparison([]);
    }
    setComparisonMode(!comparisonMode);
  };

  const toggleComparisonSelection = (entry: ScreeningLogEntry) => {
    setSelectedForComparison((prev) => {
      const exists = prev.find((e) => e === entry);
      if (exists) {
        return prev.filter((e) => e !== entry);
      }
      if (prev.length >= 2) {
        return [prev[1], entry];
      }
      return [...prev, entry];
    });
  };

  const isSelectedForComparison = (entry: ScreeningLogEntry) => {
    return selectedForComparison.some((e) => e === entry);
  };

  // Export functions
  const exportAsTxt = () => {
    const lines = [
      '═══════════════════════════════════════════════════',
      '  HISTORIQUE DES ANALYSES — LuxTalent V2',
      '═══════════════════════════════════════════════════',
      '',
      `Date d'export : ${new Date().toLocaleString('fr-FR')}`,
      `Nombre total d'analyses : ${totalEntries}`,
      `Invités : ${inviteCount} | Rejetés : ${rejectCount}`,
      `Confiance moyenne : ${avgConfidence.toFixed(1)}%`,
      '',
      '── Détail des analyses ──',
      '',
    ];

    logEntries.forEach((entry, i) => {
      lines.push(`${i + 1}. ${entry.name} — ${entry.target_role}`);
      lines.push(`   Décision : ${entry.label} (${entry.confidence > 0 ? entry.confidence.toFixed(1) + '%' : 'N/A'})`);
      lines.push(`   Date : ${new Date(entry.timestamp).toLocaleString('fr-FR')}`);
      lines.push(`   Facteur principal : ${entry.top_driver}`);
      if (entry.status) lines.push(`   Statut : ${entry.status}`);
      if (entry.reasons) lines.push(`   Raisons : ${entry.reasons}`);
      lines.push('');
    });

    if (metrics) {
      lines.push('═══════════════════════════════════════════════════');
      lines.push('  MÉTRIQUES DE FAIRNESS');
      lines.push('═══════════════════════════════════════════════════');
      lines.push('');
      lines.push('Modèle de base :');
      lines.push(`  EPD : ${metrics.base_model.epd.toFixed(1)} pts ${metrics.base_model.epd_alert ? '⚠ ALERTE' : '✓'}`);
      lines.push(`  RID : ${metrics.base_model.rid.toFixed(3)} ${metrics.base_model.rid_alert ? '⚠ ALERTE' : '✓'}`);
      lines.push(`  Delta TPR : ${metrics.base_model.delta_tpr.toFixed(1)} pts ${metrics.base_model.delta_tpr_alert ? '⚠ ALERTE' : '✓'}`);
      lines.push('');
      lines.push('Modèle corrigé :');
      lines.push(`  EPD : ${metrics.fair_model.epd.toFixed(1)} pts ${metrics.fair_model.epd_alert ? '⚠ ALERTE' : '✓'}`);
      lines.push(`  RID : ${metrics.fair_model.rid.toFixed(3)} ${metrics.fair_model.rid_alert ? '⚠ ALERTE' : '✓'}`);
      lines.push(`  Delta TPR : ${metrics.fair_model.delta_tpr.toFixed(1)} pts ${metrics.fair_model.delta_tpr_alert ? '⚠ ALERTE' : '✓'}`);
    }

    return lines.join('\n');
  };

  const exportAsCsv = () => {
    const headers = ['Nom', 'Poste', 'Décision', 'Confiance', 'Date', 'Facteur Principal', 'Équité Ajustée', 'Statut', 'Raisons'];
    const rows = logEntries.map((entry) => [
      `"${entry.name}"`,
      `"${entry.target_role}"`,
      entry.label,
      entry.confidence > 0 ? entry.confidence.toFixed(1) : 'N/A',
      `"${new Date(entry.timestamp).toLocaleString('fr-FR')}"`,
      `"${entry.top_driver}"`,
      entry.fairness_adjusted ? 'Oui' : 'Non',
      `"${entry.status || '—'}"`,
      `"${entry.reasons || ''}"`,
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  const exportAsJson = () => {
    const data = {
      export_date: new Date().toISOString(),
      summary: {
        total: totalEntries,
        invites: inviteCount,
        rejects: rejectCount,
        avg_confidence: avgConfidence,
        fairness_adjusted_count: fairnessAdjustedCount,
        most_analyzed_role: mostAnalyzedRole,
      },
      entries: logEntries.map((entry) => ({
        name: entry.name,
        target_role: entry.target_role,
        label: entry.label,
        confidence: entry.confidence,
        timestamp: entry.timestamp,
        top_driver: entry.top_driver,
        fairness_adjusted: entry.fairness_adjusted,
        status: entry.status || null,
        reasons: entry.reasons || null,
      })),
      fairness_metrics: metrics ? {
        base_model: metrics.base_model,
        fair_model: metrics.fair_model,
      } : null,
    };
    return JSON.stringify(data, null, 2);
  };

  const exportAsPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageWidth, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LuxTalent Advisory — Historique des analyses', margin, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Exporté le ${new Date().toLocaleString('fr-FR')}`, margin, 18);

    y = 32;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total : ${totalEntries} analyses | Invités : ${inviteCount} | Rejetés : ${rejectCount}`, margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Confiance moyenne : ${avgConfidence.toFixed(1)}% | Taux d'invitation : ${totalEntries > 0 ? ((inviteCount / totalEntries) * 100).toFixed(0) : 0}%`, margin, y);
    y += 8;

    // Table header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 3, pageWidth - margin * 2, 6, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', margin + 1, y);
    doc.text('Candidat', margin + 28, y);
    doc.text('Poste', margin + 65, y);
    doc.text('Décision', margin + 110, y);
    doc.text('Confiance', margin + 130, y);
    doc.text('Équité', margin + 148, y);
    y += 5;

    // Table rows
    doc.setFont('helvetica', 'normal');
    logEntries.forEach((entry, i) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      const dateStr = new Date(entry.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(dateStr, margin + 1, y);
      doc.setTextColor(30, 41, 59);
      doc.text(entry.name, margin + 28, y);
      doc.text(entry.target_role.substring(0, 25), margin + 65, y);

      // Decision
      if (entry.label === 'Invite') {
        doc.setTextColor(16, 185, 129);
      } else {
        doc.setTextColor(239, 68, 68);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(entry.label, margin + 110, y);

      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'normal');
      doc.text(entry.confidence > 0 ? `${entry.confidence.toFixed(1)}%` : 'N/A', margin + 130, y);
      doc.text(entry.fairness_adjusted ? 'Oui' : 'Non', margin + 148, y);

      y += 5;
    });

    // Fairness metrics section
    if (metrics) {
      if (y > 230) { doc.addPage(); y = 20; }
      y += 5;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Métriques de Fairness', margin, y);
      y += 6;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Base — EPD: ${metrics.base_model.epd.toFixed(1)} pts ${metrics.base_model.epd_alert ? '⚠' : '✓'} | RID: ${metrics.base_model.rid.toFixed(3)} ${metrics.base_model.rid_alert ? '⚠' : '✓'} | ΔTPR: ${metrics.base_model.delta_tpr.toFixed(1)} pts ${metrics.base_model.delta_tpr_alert ? '⚠' : '✓'}`, margin, y);
      y += 4;
      doc.text(`Corrigé — EPD: ${metrics.fair_model.epd.toFixed(1)} pts ${metrics.fair_model.epd_alert ? '⚠' : '✓'} | RID: ${metrics.fair_model.rid.toFixed(3)} ${metrics.fair_model.rid_alert ? '⚠' : '✓'} | ΔTPR: ${metrics.fair_model.delta_tpr.toFixed(1)} pts ${metrics.fair_model.delta_tpr_alert ? '⚠' : '✓'}`, margin, y);
    }

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('LuxTalent Advisory Group — Historique des analyses', margin, footerY);

    return doc;
  };

  const exportHistory = () => {
    // PDF export uses jsPDF directly
    if (exportFormat === 'pdf') {
      const doc = exportAsPdf();
      doc.save(`historique-analyses-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Historique exporté', { description: 'Format : PDF' });
      return;
    }

    let content: string;
    let mimeType: string;
    let extension: string;

    switch (exportFormat) {
      case 'csv':
        content = exportAsCsv();
        mimeType = 'text/csv;charset=utf-8';
        extension = 'csv';
        break;
      case 'json':
        content = exportAsJson();
        mimeType = 'application/json;charset=utf-8';
        extension = 'json';
        break;
      default:
        content = exportAsTxt();
        mimeType = 'text/plain;charset=utf-8';
        extension = 'txt';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-analyses-${new Date().toISOString().split('T')[0]}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Historique exporté', { description: `Format : ${extension.toUpperCase()}` });
  };

  const dateFilterLabels: Record<string, string> = {
    all: 'Toutes les dates',
    today: "Aujourd'hui",
    week: '7 derniers jours',
    month: '30 derniers jours',
  };

  return (
    <div className="space-y-8">
      {/* ====== HISTORY SECTION ====== */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 flex items-center justify-center">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Historique des analyses
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-[42px]">
              {comparisonMode
                ? 'Sélectionnez 2 candidats pour les comparer'
                : 'Cliquez sur une entrée pour voir le détail complet'
              }
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Export button with format selection */}
            <div className="relative" ref={exportDropdownRef}>
              <div className="flex">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportHistory}
                  className="border-slate-200 text-slate-600 hover:bg-slate-50 gap-1.5 rounded-r-none border-r-0 min-h-[44px]"
                  aria-label="Exporter l'historique"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Exporter</span>
                  <span className="text-[9px] text-slate-400 uppercase ml-0.5">{exportFormat}</span>
                </Button>
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="px-2 min-w-[44px] min-h-[44px] border border-slate-200 rounded-r-md text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 active:scale-95"
                  aria-expanded={showExportDropdown}
                  aria-haspopup="true"
                  aria-label="Choisir le format d'export"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              {showExportDropdown && (
                <div className="absolute left-0 sm:left-auto right-0 sm:right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 py-1 min-w-[130px] export-dropdown" role="menu" aria-label="Formats d'export">
                  {([
                    { key: 'txt' as const, label: 'Texte (.txt)', icon: <File className="w-3 h-3" /> },
                    { key: 'csv' as const, label: 'CSV (.csv)', icon: <FileSpreadsheet className="w-3 h-3" /> },
                    { key: 'json' as const, label: 'JSON (.json)', icon: <FileJson className="w-3 h-3" /> },
                    { key: 'pdf' as const, label: 'PDF (.pdf)', icon: <FileText className="w-3 h-3" /> },
                  ]).map((fmt) => (
                    <button
                      key={fmt.key}
                      onClick={() => { setExportFormat(fmt.key); setShowExportDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 min-h-[44px] text-xs flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
                        exportFormat === fmt.key ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {fmt.icon}
                      {fmt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Compare button */}
            <Button
              variant={comparisonMode ? 'default' : 'outline'}
              size="sm"
              onClick={toggleComparisonMode}
              className={`gap-1.5 min-h-[44px] ${
                comparisonMode
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              aria-label={comparisonMode ? 'Annuler la comparaison' : 'Comparer des candidats'}
            >
              <GitCompareArrows className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{comparisonMode ? 'Annuler' : 'Comparer'}</span>
            </Button>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Rechercher dans l'historique"
                className="h-8 min-h-[44px] w-40 pl-8 pr-7 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 dark:focus:border-emerald-600 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-700 dark:text-slate-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                  aria-label="Effacer la recherche"
                >
                  <X className="w-2.5 h-2.5 text-slate-500 dark:text-slate-300" />
                </button>
              )}
            </div>

            {/* Date filter */}
            <div className="relative" ref={dateDropdownRef}>
              <button
                onClick={() => setShowDateDropdown(!showDateDropdown)}
                className="flex items-center gap-1.5 min-h-[44px] px-3 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 active:scale-95"
                aria-expanded={showDateDropdown}
                aria-haspopup="true"
                aria-label="Filtrer par date"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span className="hidden sm:inline">{dateFilterLabels[dateFilter]}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              </button>
              {showDateDropdown && (
                <div className="absolute left-0 sm:left-auto right-0 sm:right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 py-1 min-w-[160px]" role="menu" aria-label="Filtres de date">
                  {Object.entries(dateFilterLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setDateFilter(key as typeof dateFilter); setShowDateDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 min-h-[44px] text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
                        dateFilter === key ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter buttons with count badges */}
            <div className="flex flex-wrap bg-slate-100 dark:bg-slate-700/50 rounded-lg p-0.5">
              {(['all', 'Invite', 'Reject'] as const).map((f) => {
                const countForFilter = f === 'all'
                  ? logEntries.length
                  : logEntries.filter((e) => e.label === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilterLabel(f)}
                    className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-md transition-all flex items-center gap-1.5 active:scale-95 ${
                      filterLabel === f
                        ? f === 'Invite'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm'
                          : f === 'Reject'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 shadow-sm'
                            : 'bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'Tous' : f}
                    <span className={`filter-count-badge ${
                      filterLabel === f
                        ? f === 'Invite'
                          ? 'bg-emerald-200/60 dark:bg-emerald-800/40 text-emerald-800 dark:text-emerald-300'
                          : f === 'Reject'
                            ? 'bg-red-200/60 dark:bg-red-800/40 text-red-800 dark:text-red-300'
                            : 'bg-slate-200/60 dark:bg-slate-500/40 text-slate-700 dark:text-slate-300'
                        : 'bg-slate-200/60 dark:bg-slate-600/40 text-slate-500 dark:text-slate-400'
                    }`}>
                      {countForFilter}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap bg-slate-100 dark:bg-slate-700/50 rounded-lg p-0.5">
              {(['all', 'En attente', 'Entretien planifié', 'Refusé', 'Embauché'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1.5 min-h-[44px] text-[10px] font-medium rounded-md transition-all active:scale-95 ${
                    statusFilter === s
                      ? 'bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {s === 'all' ? 'Statut' : STATUS_CONFIG[s]?.label || s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Batch Statistics Summary */}
        {totalEntries > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Total analyses', value: totalEntries, icon: <BarChart3 className="w-3.5 h-3.5 text-slate-400" /> },
              { label: 'Taux d\'invitation', value: `${totalEntries > 0 ? ((inviteCount / totalEntries) * 100).toFixed(0) : 0}%`, icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> },
              { label: 'Confiance moyenne', value: `${avgConfidence.toFixed(0)}%`, icon: <Activity className="w-3.5 h-3.5 text-amber-400" /> },
              { label: 'Poste le + analysé', value: mostAnalyzedRole, icon: <Users className="w-3.5 h-3.5 text-slate-400" /> },
            ].map((stat, i) => (
              <div key={i} className="batch-stat-card p-3 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1">
                  {stat.icon}
                  <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider leading-tight">{stat.label}</span>
                </div>
                <p className="text-sm font-bold text-slate-700 truncate">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Average confidence bar */}
        {totalEntries > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm mb-4">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Confiance moyenne :</span>
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden shadow-inner max-w-xs relative">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full animate-progress flex items-center justify-end pr-2"
                style={{ width: `${avgConfidence}%`, minWidth: avgConfidence > 0 ? '48px' : '0' }}
              >
                {avgConfidence > 15 && (
                  <span className="text-[10px] font-bold text-white drop-shadow-sm">{avgConfidence.toFixed(1)}%</span>
                )}
              </div>
            </div>
            {avgConfidence <= 15 && (
              <span className="text-sm font-bold text-slate-700">{avgConfidence.toFixed(1)}%</span>
            )}
          </div>
        )}

        {/* Errors */}
        {logError && (
          <Card className="border-red-200 bg-red-50/80 mb-4 shadow-sm">
            <CardContent className="p-5 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Erreur de chargement</p>
                <p className="text-sm text-red-600/80 mt-0.5">{logError}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {logLoading && (
          <Card className="shadow-sm">
            <CardContent className="p-8 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
              <span className="text-sm text-slate-500">Chargement de l&apos;historique...</span>
            </CardContent>
          </Card>
        )}

        {/* Empty state — guided for first-time users */}
        {!logLoading && filteredEntries.length === 0 && (
          <Card className="shadow-sm border-emerald-100/50 overflow-hidden">
            <CardContent className="p-10 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 flex items-center justify-center mb-2 shadow-sm">
                <FileText className="w-8 h-8 text-emerald-400" />
              </div>
              {filterLabel !== 'all' || dateFilter !== 'all' || statusFilter !== 'all' || searchQuery ? (
                <>
                  <p className="text-sm font-semibold text-slate-600">Aucun résultat pour ces filtres</p>
                  <p className="text-xs text-slate-400 max-w-sm text-center">
                    Modifiez les filtres ou la recherche pour retrouver des candidats dans l&apos;historique.
                  </p>
                </>
              ) : logEntries.length === 0 ? (
                <>
                  <p className="text-sm font-semibold text-slate-600">Aucun CV analysé pour le moment</p>
                  <p className="text-xs text-slate-400 max-w-sm text-center leading-relaxed">
                    Les analyses de CV apparaîtront ici automatiquement. Commencez par déposer un CV dans l&apos;onglet <strong className="text-slate-500">« Analyse CV »</strong>.
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-emerald-600">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Les données sont persistées — elles seront là au prochain chargement</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-600">Aucun résultat</p>
                  <p className="text-xs text-slate-400">Les analyses apparaîtront ici après le traitement des CV</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* History table */}
        {!logLoading && filteredEntries.length > 0 && (
          <Card className="shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto overflow-x-auto custom-scrollbar animate-page-slide" key={currentPage}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 table-header-frosted z-10 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {comparisonMode && (
                        <th className="w-8 py-3 px-2 text-xs font-semibold text-slate-500 uppercase"></th>
                      )}
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Candidat</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase hidden sm:table-cell">Poste</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Décision</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Confiance</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase hidden lg:table-cell">Statut</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase hidden lg:table-cell">Facteur principal</th>
                      <th className="w-8 py-3 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntries.map((entry, i) => {
                      const isCompSelected = isSelectedForComparison(entry);
                      const statusCfg = entry.status ? STATUS_CONFIG[entry.status] : null;
                      return (
                        <tr
                          key={`${entry.timestamp}-${entry.name}-${i}`}
                          className={`border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-all group border-l-4 history-row-highlight ${
                            entry.label === 'Invite'
                              ? 'border-l-emerald-400 dark:border-l-emerald-500'
                              : 'border-l-red-400 dark:border-l-red-500'
                          } ${isCompSelected ? 'bg-emerald-50/60 dark:bg-emerald-900/20 comparison-selected' : ''} ${i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900/20'}`}
                          onClick={() => {
                            if (comparisonMode) {
                              toggleComparisonSelection(entry);
                            } else {
                              setSelectedEntry(entry);
                            }
                          }}
                        >
                          {comparisonMode && (
                            <td className="py-3 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isCompSelected}
                                onChange={() => toggleComparisonSelection(entry)}
                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                            {new Date(entry.timestamp).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.label === 'Invite' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                              <span className="font-medium text-slate-700 dark:text-slate-200">{entry.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs hidden sm:table-cell">{entry.target_role}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`status-pill ${
                              entry.label === 'Invite'
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/30'
                                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800/30'
                            }`}>
                              {entry.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {entry.confidence > 0 && (
                                <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                                  <div
                                    className={`h-full rounded-full ${entry.label === 'Invite' ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-red-400 dark:bg-red-500'}`}
                                    style={{ width: `${Math.min(entry.confidence, 100)}%` }}
                                  />
                                </div>
                              )}
                              <span className="font-mono text-slate-600 dark:text-slate-300 text-xs">
                              {entry.confidence > 0 ? `${entry.confidence.toFixed(1)}%` : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center hidden lg:table-cell">
                            {statusCfg ? (
                              <span className={`status-pill ${statusCfg.cssClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`} />
                                {statusCfg.label}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 hidden lg:table-cell truncate max-w-[180px]">
                            {entry.top_driver !== 'N/A' ? entry.top_driver : '—'}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-1">
                              {!comparisonMode && (
                                <button
                                  onClick={(e) => handleDeleteEntry(e, entry)}
                                  className="w-6 h-6 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                                  title="Supprimer"
                                  aria-label={`Supprimer l'entrée de ${entry.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!comparisonMode && (
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredEntries.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {entryRangeStart}–{entryRangeEnd} sur {filteredEntries.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="h-7 px-2.5 text-xs gap-1 border-slate-200"
                    >
                      <ChevronLeft className="w-3 h-3" />
                      Précédent
                    </Button>
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      Page {currentPage} sur {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="h-7 px-2.5 text-xs gap-1 border-slate-200"
                    >
                      Suivant
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ====== DECORATIVE DIVIDER 1 ====== */}
      <div className="relative flex items-center justify-center py-3">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent" />
        <div className="absolute flex items-center gap-3">
          <div className="w-2 h-2 bg-emerald-400 rotate-45 animate-diamond shadow-sm shadow-emerald-200" />
          <div className="w-3 h-3 bg-emerald-500 rotate-45 animate-diamond shadow-sm shadow-emerald-300" style={{ animationDelay: '0.5s' }} />
          <div className="w-2 h-2 bg-emerald-400 rotate-45 animate-diamond shadow-sm shadow-emerald-200" style={{ animationDelay: '1s' }} />
        </div>
      </div>

      {/* ====== ANALYTICS DASHBOARD SECTION ====== */}
      {logEntries.length > 0 && (
        <section className="animate-card-enter">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                Tableau de bord analytique
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-[42px]">
                Répartition et distribution des décisions par poste et confiance
              </p>
            </div>
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              {showAnalytics ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" />
                  Masquer
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform" />
                  Afficher
                </>
              )}
            </button>
          </div>

          {showAnalytics && (
            <div className="collapse-expand-enter space-y-4">
              {/* Summary Insight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Taux d'invitation */}
                <div className="analytics-insight-card p-4 rounded-xl border bg-gradient-to-br from-emerald-50/40 to-white dark:from-emerald-900/10 dark:to-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider">Taux d&apos;invitation</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {totalEntries > 0 ? ((inviteCount / totalEntries) * 100).toFixed(0) : 0}%
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{inviteCount} invités sur {totalEntries}</p>
                </div>

                {/* Confiance médiane */}
                <div className="analytics-insight-card p-4 rounded-xl border bg-gradient-to-br from-amber-50/40 to-white dark:from-amber-900/10 dark:to-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider">Confiance médiane</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {confidenceMedian.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Moyenne : {avgConfidence.toFixed(1)}%</p>
                </div>

                {/* Poste principal */}
                <div className="analytics-insight-card p-4 rounded-xl border bg-gradient-to-br from-slate-50/40 to-white dark:from-slate-700/10 dark:to-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider">Poste principal</span>
                  </div>
                  <p className="text-lg font-bold text-slate-700 dark:text-slate-200 truncate">
                    {mostAnalyzedRole}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{roleCounts[mostAnalyzedRole] || 0} analyses</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Role Distribution Chart — Horizontal Bar Chart (inline SVG) */}
                <Card className="shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      Répartition par poste
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(roleBreakdown).map(([role, counts]) => {
                        const total = counts.invite + counts.reject;
                        const invitePct = total > 0 ? (counts.invite / total) * 100 : 0;
                        const rejectPct = total > 0 ? (counts.reject / total) * 100 : 0;
                        const maxTotal = Math.max(...Object.values(roleBreakdown).map((c) => c.invite + c.reject), 1);
                        const barScale = total / maxTotal;
                        return (
                          <div key={role} className="group">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[60%]">{role}</span>
                              <div className="flex items-center gap-2 text-[10px]">
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {counts.invite}
                                </span>
                                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                  <XCircle className="w-3 h-3" />
                                  {counts.reject}
                                </span>
                              </div>
                            </div>
                            {/* Horizontal stacked bar */}
                            <div className="flex h-5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700/50 shadow-inner" style={{ width: `${Math.max(barScale * 100, 20)}%` }}>
                              {counts.invite > 0 && (
                                <div
                                  className="bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 animate-bar-grow-h flex items-center justify-center"
                                  style={{ width: `${invitePct}%` }}
                                >
                                  {invitePct > 15 && <span className="text-[8px] font-bold text-white">{invitePct.toFixed(0)}%</span>}
                                </div>
                              )}
                              {counts.reject > 0 && (
                                <div
                                  className="bg-gradient-to-r from-red-400 to-red-500 dark:from-red-500 dark:to-red-600 animate-bar-grow-h flex items-center justify-center"
                                  style={{ width: `${rejectPct}%` }}
                                >
                                  {rejectPct > 15 && <span className="text-[8px] font-bold text-white">{rejectPct.toFixed(0)}%</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Insight badge */}
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-2">
                      <Badge className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30 hover:bg-emerald-50 gap-1 text-[10px]">
                        <Sparkles className="w-3 h-3" />
                        Top poste : {Object.entries(roleBreakdown).sort((a, b) => (b[1].invite + b[1].reject) - (a[1].invite + a[1].reject))[0]?.[0] || '—'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>


              </div>
            </div>
          )}
        </section>
      )}

      {/* ====== DECORATIVE DIVIDER 2 ====== */}
      <div className="relative flex items-center justify-center py-3">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <div className="absolute flex items-center gap-4">
          <div className="w-1.5 h-1.5 bg-emerald-300 rotate-45 animate-diamond" style={{ animationDelay: '0.3s' }} />
          <div className="w-2 h-2 bg-emerald-400 rotate-45 animate-diamond shadow-sm shadow-emerald-200" />
          <div className="w-1.5 h-1.5 bg-emerald-300 rotate-45 animate-diamond" style={{ animationDelay: '0.7s' }} />
        </div>
      </div>

      {/* ====== FAIRNESS SECTION ====== */}
      <section>
        <div className="relative fairness-mesh-bg fairness-pattern-bg rounded-2xl p-6 mb-6 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/30 flex items-center justify-center shadow-sm ring-1 ring-emerald-200/50 dark:ring-emerald-700/30">
                  <Scale className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                Audit d&apos;équité
                <span className="live-badge-modern">
                  <span className="live-dot-modern" />
                  Live
                </span>
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-12">
                Métriques d&apos;équité du modèle corrigé
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Button
                onClick={loadMetrics}
                disabled={metricsLoading}
                variant="outline"
                className="border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 gap-2"
              >
                {metricsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Actualiser
                  </>
                )}
              </Button>
              {lastUpdated && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 timestamp-text">
                  Dernière màj : {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metrics loading skeleton */}
        {metricsLoading && !metrics && (
          <Card className="shadow-sm">
            <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm text-slate-500">Chargement des métriques de fairness...</p>
            </CardContent>
          </Card>
        )}

        {metricsError && (
          <Card className="border-red-200 bg-red-50/80 mb-4 shadow-sm">
            <CardContent className="p-5 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Impossible de charger les métriques</p>
                <p className="text-sm text-red-600/80 mt-0.5">{metricsError}</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadMetrics} className="border-red-200 text-red-600 hover:bg-red-50">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {metrics && (
          <div className="space-y-4 animate-card-enter">
            {/* Fairness Composite Score + Metric Cards — Equal Height Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Composite Score */}
              <Card className="shadow-sm border-emerald-100 dark:border-emerald-800/30 overflow-hidden flex flex-col">
                <CardContent className="p-5 flex flex-col items-center flex-1">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Target className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Score d&apos;équité</span>
                  </div>
                  <div className="relative w-28 h-28 equity-ring-glow">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" className="dark:stroke-slate-700" strokeWidth="6" />
                      <circle
                        cx="50" cy="50" r="45"
                        fill="none"
                        stroke="url(#scoreGradient)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={283}
                        strokeDashoffset={283 - (283 * fairnessScore) / 100}
                        className="animate-score-circle"
                        style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                      />
                      <defs>
                        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#6ee7b7" />
                          <stop offset="50%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#10b981" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fairnessScore}</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">/ 100</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-emerald-600 font-medium">+{trendData.length >= 2 ? (trendData[trendData.length - 1].composite_score - trendData[trendData.length - 2].composite_score) : 0} pts</span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 text-center">EPD 35% · RID 40% · ΔTPR 25%</p>
                </CardContent>
              </Card>

              {/* Summary Cards with enhancements */}
              {/* EPD Card */}
              <div className="summary-card-glow fairness-metric-card rounded-xl border p-4 shadow-sm text-center relative bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-900/10 dark:to-slate-800/50 border-slate-200/80 dark:border-slate-700/50 flex flex-col">
                <div className="flex items-center justify-center gap-1 mb-2 cursor-help" onClick={() => setShowMetricInfo(showMetricInfo === 'epd' ? null : 'epd')}>
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-500 transition-colors" />
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">EPD</span>
                </div>
                {showMetricInfo === 'epd' && (
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-xl max-w-[200px]">
                    Écart de Parité Démographique — Mesure la différence de taux d&apos;invitation entre groupes. Plus c&apos;est bas, mieux c&apos;est.
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 flex-1">
                  <p className={`text-2xl font-bold ${metrics.fair_model.epd_alert ? 'text-red-500' : 'text-emerald-500'}`}>
                    {metrics.fair_model.epd.toFixed(1)}
                  </p>
                  {metrics.fair_model.epd_alert ? (
                    <Badge className="bg-red-50 text-red-600 border border-red-100 hover:bg-red-50 text-[9px] px-1.5 gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Alerte
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-50 text-[9px] px-1.5 gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      OK
                    </Badge>
                  )}
                </div>
                {/* Mini progress ring */}
                <div className="flex justify-center mt-2">
                  <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="14" fill="none"
                      stroke={metrics.fair_model.epd_alert ? '#ef4444' : '#10b981'}
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={88}
                      strokeDashoffset={88 - (88 * Math.max(0, 100 - metrics.fair_model.epd * 5)) / 100}
                      className="animate-ring-fill"
                    />
                  </svg>
                </div>
              </div>

              {/* RID Card */}
              <div className="summary-card-glow fairness-metric-card rounded-xl border p-4 shadow-sm text-center relative bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-900/10 dark:to-slate-800/50 border-slate-200/80 dark:border-slate-700/50 flex flex-col">
                <div className="flex items-center justify-center gap-1 mb-2 cursor-help" onClick={() => setShowMetricInfo(showMetricInfo === 'rid' ? null : 'rid')}>
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-500 transition-colors" />
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">RID</span>
                </div>
                {showMetricInfo === 'rid' && (
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-xl max-w-[200px]">
                    Ratio d&apos;Impact Disparate — Ratio du taux d&apos;invitation entre groupes. Plus c&apos;est proche de 1.0, mieux c&apos;est.
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 flex-1">
                  <p className={`text-2xl font-bold ${metrics.fair_model.rid_alert ? 'text-red-500' : 'text-emerald-500'}`}>
                    {metrics.fair_model.rid.toFixed(3)}
                  </p>
                  {metrics.fair_model.rid_alert ? (
                    <Badge className="bg-red-50 text-red-600 border border-red-100 hover:bg-red-50 text-[9px] px-1.5 gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Alerte
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-50 text-[9px] px-1.5 gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      OK
                    </Badge>
                  )}
                </div>
                {/* Mini progress ring */}
                <div className="flex justify-center mt-2">
                  <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="14" fill="none"
                      stroke={metrics.fair_model.rid_alert ? '#ef4444' : '#10b981'}
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={88}
                      strokeDashoffset={88 - (88 * Math.min(metrics.fair_model.rid, 1)) / 1}
                      className="animate-ring-fill"
                    />
                  </svg>
                </div>
              </div>

              {/* Delta TPR Card */}
              <div className="summary-card-glow fairness-metric-card rounded-xl border p-4 shadow-sm text-center relative bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-900/10 dark:to-slate-800/50 border-slate-200/80 dark:border-slate-700/50 flex flex-col">
                <div className="flex items-center justify-center gap-1 mb-2 cursor-help" onClick={() => setShowMetricInfo(showMetricInfo === 'delta_tpr' ? null : 'delta_tpr')}>
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-500 transition-colors" />
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Delta TPR</span>
                </div>
                {showMetricInfo === 'delta_tpr' && (
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-xl max-w-[200px]">
                    Différence de Taux de Vrais Positifs — Écart de détection des candidats qualifiés entre groupes. Plus c&apos;est bas, mieux c&apos;est.
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 flex-1">
                  <p className={`text-2xl font-bold ${metrics.fair_model.delta_tpr_alert ? 'text-red-500' : 'text-emerald-500'}`}>
                    {metrics.fair_model.delta_tpr.toFixed(1)}
                  </p>
                  {metrics.fair_model.delta_tpr_alert ? (
                    <Badge className="bg-red-50 text-red-600 border border-red-100 hover:bg-red-50 text-[9px] px-1.5 gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Alerte
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-50 text-[9px] px-1.5 gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      OK
                    </Badge>
                  )}
                </div>
                {/* Mini progress ring */}
                <div className="flex justify-center mt-2">
                  <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="14" fill="none"
                      stroke={metrics.fair_model.delta_tpr_alert ? '#ef4444' : '#10b981'}
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={88}
                      strokeDashoffset={88 - (88 * Math.max(0, 100 - metrics.fair_model.delta_tpr * 5)) / 100}
                      className="animate-ring-fill"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Fair model metrics */}
            <Card className="border-emerald-200 dark:border-emerald-800/30 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Métriques d&apos;équité</CardTitle>
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-50 gap-1">
                    <Award className="w-3 h-3" />
                    ThresholdOptimizer
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <FairnessGauge label="EPD" value={metrics.fair_model.epd} alert={metrics.fair_model.epd_alert} description="Écart Parité Démogr." type="epd" />
                  <FairnessGauge label="RID" value={metrics.fair_model.rid} alert={metrics.fair_model.rid_alert} description="Ratio Impact Diff." type="rid" />
                  <FairnessGauge label="Delta TPR" value={metrics.fair_model.delta_tpr} alert={metrics.fair_model.delta_tpr_alert} description="Égalité des Chances" type="delta_tpr" />
                </div>
                <GroupStatsTable groupStats={metrics.fair_model.group_stats} />
              </CardContent>
            </Card>

          </div>
        )}
      </section>

      {/* Comparison floating bar */}
      {comparisonMode && selectedForComparison.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-scale-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 px-5 py-3 flex items-center gap-4">
            <div className="flex items-center gap-3">
              {selectedForComparison.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && (
                    <span className="text-slate-300 text-sm font-light">vs</span>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
                    <span className="text-sm font-medium text-slate-700 max-w-[120px] truncate">{entry.name}</span>
                    <Badge className={`text-[10px] border-0 ${
                      entry.label === 'Invite'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {entry.label}
                    </Badge>
                    <span className="text-xs font-mono text-slate-500">
                      {entry.confidence > 0 ? `${entry.confidence.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {selectedForComparison.length === 2 && (
              <Button
                size="sm"
                onClick={() => setShowComparisonModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                Voir comparaison
              </Button>
            )}
            {selectedForComparison.length < 2 && (
              <span className="text-xs text-slate-400">
                Sélectionnez {2 - selectedForComparison.length} candidat{2 - selectedForComparison.length > 1 ? 's' : ''} de plus
              </span>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEntry && (
        <EntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} onUpdateStatus={handleUpdateStatus} />
      )}

      {/* Comparison Modal */}
      {showComparisonModal && selectedForComparison.length === 2 && (
        <ComparisonModal
          entryA={selectedForComparison[0]}
          entryB={selectedForComparison[1]}
          onClose={() => setShowComparisonModal(false)}
        />
      )}
    </div>
  );
}

// Sub-components

function GroupStatsTable({ groupStats }: { groupStats: Record<string, { n: number; invite_rate: number; tpr: number; fpr: number }> }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 tracking-wide">Statistiques par groupe</h4>
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
            {Object.entries(groupStats).map(([group, stats]) => (
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
  );
}

function ImprovementCard({ icon, label, before, after, beforeAlert, diff }: {
  icon: React.ReactNode;
  label: string;
  before: string;
  after: string;
  beforeAlert: boolean;
  diff: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/50 to-slate-50/80 border border-emerald-100/50">
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <div className="flex items-center gap-2.5 text-sm">
        <span className={`${beforeAlert ? 'text-red-600' : 'text-slate-500'} font-mono`}>{before}</span>
        <ArrowRight className="w-4 h-4 text-emerald-400" />
        <span className="text-emerald-600 font-mono font-bold">{after}</span>
      </div>
      <p className="text-xs text-emerald-600/80 mt-1.5">{diff}</p>
    </div>
  );
}

// Enhanced detail modal with frosted glass header, sidebar navigation, improved close button
function EntryDetailModal({ entry, onClose, onUpdateStatus }: { entry: ScreeningLogEntry; onClose: () => void; onUpdateStatus: (entry: ScreeningLogEntry, status: CandidateStatus) => void }) {
  const isInvite = entry.label === 'Invite';
  const [activeTab, setActiveTab] = useState<'shap' | 'features' | 'resume'>('shap');

  const simulatedPrediction: PredictionResponse = isInvite
    ? { ...MOCK_PREDICTION, name: entry.name, target_role: entry.target_role }
    : { ...MOCK_REJECT_PREDICTION, name: entry.name, target_role: entry.target_role };

  const exportDetail = () => {
    const lines = [
      '═══════════════════════════════════════════',
      `  DÉTAIL ANALYSE — ${entry.name}`,
      '═══════════════════════════════════════════',
      '',
      `Candidat : ${entry.name}`,
      `Poste cible : ${entry.target_role}`,
      `Décision : ${entry.label}`,
      `Confiance : ${entry.confidence > 0 ? entry.confidence.toFixed(1) + '%' : 'N/A'}`,
      `Date : ${new Date(entry.timestamp).toLocaleString('fr-FR')}`,
      `Fichier : ${entry.filename}`,
      `Facteur principal : ${entry.top_driver}`,
      `Statut : ${entry.status || '—'}`,
      '',
    ];

    if (entry.reasons) {
      lines.push('── Raisons ──');
      lines.push(entry.reasons);
      lines.push('');
    }

    lines.push('── Valeurs SHAP ──');
    Object.entries(simulatedPrediction.explanation.shap_values)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .forEach(([feat, val]) => {
        lines.push(`  ${feat}: ${val > 0 ? '+' : ''}${val.toFixed(4)}`);
      });

    lines.push('', `Généré le : ${new Date().toLocaleString('fr-FR')}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detail-${entry.name.replace(/\s+/g, '-').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Détail exporté');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-overlay-enhanced" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Détail de l'analyse — ${entry.name}`}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with colored top bar and frosted glass */}
        <div className={`h-2 rounded-t-2xl ${isInvite ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400' : 'bg-gradient-to-r from-red-400 via-red-500 to-rose-400'}`} />
        <div className="sticky top-0 modal-frosted-header border-b border-slate-100 dark:border-slate-700/50 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${
              isInvite ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 ring-1 ring-emerald-200/50 dark:ring-emerald-700/30' : 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 ring-1 ring-red-200/50 dark:ring-red-700/30'
            }`}>
              {isInvite ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{entry.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{entry.target_role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`font-bold border-0 shadow-sm ${
              isInvite ? 'bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20 text-emerald-700 dark:text-emerald-400' : 'bg-gradient-to-r from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-800/20 text-red-700 dark:text-red-400'
            }`}>
              {entry.label}
            </Badge>
            <button
              onClick={onClose}
              className="ml-1 w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 close-btn-hover focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              aria-label="Fermer le détail"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700/20 dark:to-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-600/50">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold mb-1">Confiance</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{entry.confidence > 0 ? `${entry.confidence.toFixed(1)}%` : '—'}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700/20 dark:to-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-600/50">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold mb-1">Étape</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.stage === 'hard_filter' ? 'Filtre élimin.' : 'Modèle ML'}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700/20 dark:to-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-600/50">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold mb-1">Modèle</p>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">{entry.model_name}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700/20 dark:to-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-600/50">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold mb-1">Date</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {new Date(entry.timestamp).toLocaleString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Status update */}
          <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Statut du candidat</h4>
              </div>
              <Badge className={`text-[10px] border ${entry.status ? STATUS_CONFIG[entry.status]?.cssClass : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-600'}`}>
                {entry.status ? STATUS_CONFIG[entry.status]?.label : 'Non défini'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['En attente', 'Entretien planifié', 'Refusé', 'Embauché'] as CandidateStatus[]).map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => onUpdateStatus(entry, s)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      entry.status === s
                        ? `${cfg.cssClass} border-current font-semibold`
                        : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} inline-block mr-1.5`} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hard filter reasons */}
          {entry.stage === 'hard_filter' && entry.reasons && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-sm font-semibold text-amber-700">Raisons du rejet (filtre éliminatoire)</span>
              </div>
              <p className="text-sm text-amber-700">{entry.reasons}</p>
            </div>
          )}

          {/* Top driver */}
          {entry.top_driver && entry.top_driver !== 'N/A' && (
            <div className="p-4 bg-slate-50/80 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-600/50 rounded-xl">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold mb-1">Facteur principal</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{entry.top_driver}</p>
            </div>
          )}

          {/* Tabbed section: SHAP / Features / Résumé */}
          {entry.stage === 'ml_model' && (
            <>
              {/* Sidebar navigation within modal */}
              <div className="tab-nav-enhanced flex bg-slate-100 dark:bg-slate-700/50 rounded-lg p-1 gap-1">
                {([
                  { key: 'shap' as const, label: 'SHAP', icon: <Eye className="w-3.5 h-3.5" /> },
                  { key: 'features' as const, label: 'Features', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                  { key: 'resume' as const, label: 'Résumé', icon: <FileText className="w-3.5 h-3.5" /> },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-md transition-all ${
                      activeTab === tab.key
                        ? 'bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-600/50'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === 'shap' && (
                <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm animate-card-enter">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Eye className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Analyse SHAP complète</h4>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 ml-auto">Simulé</Badge>
                  </div>
                  <ShapWaterfall
                    shapValues={simulatedPrediction.explanation.shap_values}
                    baseValue={simulatedPrediction.explanation.base_value}
                    label={entry.label}
                  />
                </div>
              )}

              {activeTab === 'features' && (
                <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm animate-card-enter">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                      <BarChart3 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Features extraites</h4>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 ml-auto">Simulé</Badge>
                  </div>
                  <FeatureTable features={simulatedPrediction.features} />
                </div>
              )}

              {activeTab === 'resume' && (
                <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm animate-card-enter space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Résumé de la décision</h4>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-emerald-50/50 to-emerald-50/20 dark:from-emerald-900/20 dark:to-emerald-800/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {simulatedPrediction.explanation.decision_drivers}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-600/50">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold mb-1">Probabilité Invite</p>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{simulatedPrediction.probabilities.Invite.toFixed(1)}%</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-600/50">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold mb-1">Probabilité Reject</p>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">{simulatedPrediction.probabilities.Reject.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Decision drivers text (shown when not ml_model or as fallback) */}
          {entry.stage === 'ml_model' && activeTab !== 'resume' && simulatedPrediction.explanation && (
            <div className="p-4 bg-gradient-to-br from-emerald-50/50 to-emerald-50/20 dark:from-emerald-900/20 dark:to-emerald-800/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Explication de la décision</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {simulatedPrediction.explanation.decision_drivers}
              </p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="sticky bottom-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-t border-slate-100 dark:border-slate-700/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileText className="w-3.5 h-3.5" />
            <span>{entry.filename}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportDetail} className="text-emerald-600 hover:bg-emerald-50 border-emerald-200 gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Exporter
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} className="text-slate-600">
              Fermer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Enhanced Comparison Modal with VS badge, colored highlights, summary verdict
function ComparisonModal({ entryA, entryB, onClose }: { entryA: ScreeningLogEntry; entryB: ScreeningLogEntry; onClose: () => void }) {
  const getSimulatedPrediction = (entry: ScreeningLogEntry): PredictionResponse => {
    return entry.label === 'Invite'
      ? { ...MOCK_PREDICTION, name: entry.name, target_role: entry.target_role }
      : { ...MOCK_REJECT_PREDICTION, name: entry.name, target_role: entry.target_role };
  };

  const predA = getSimulatedPrediction(entryA);
  const predB = getSimulatedPrediction(entryB);

  // Comparison metrics
  const comparisons = [
    { label: 'Confiance', a: entryA.confidence, b: entryB.confidence, unit: '%', higher: true },
    { label: 'Prob. Invite', a: predA.probabilities.Invite, b: predB.probabilities.Invite, unit: '%', higher: true },
    { label: 'Ajusté équité', a: entryA.fairness_adjusted ? 1 : 0, b: entryB.fairness_adjusted ? 1 : 0, unit: '', higher: true, binary: true },
  ];

  // Verdict
  const aWins = comparisons.filter((c) => c.higher ? c.a > c.b : c.a < c.b).length;
  const bWins = comparisons.filter((c) => c.higher ? c.b > c.a : c.b < c.a).length;
  const verdict = aWins > bWins ? entryA.name : bWins > aWins ? entryB.name : 'Égalité';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-overlay-enhanced" onClick={onClose} role="dialog" aria-modal="true" aria-label="Comparaison des candidats">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-2 rounded-t-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400" />
        <div className="sticky top-0 modal-frosted-header border-b border-slate-100 dark:border-slate-700/50 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 ring-1 ring-emerald-200/50 dark:ring-emerald-700/30">
              <GitCompareArrows className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Comparaison des candidats</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Analyse comparative des profils</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 close-btn-hover focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            aria-label="Fermer la comparaison"
          >
            ✕
          </button>
        </div>

        {/* Body - side by side */}
        <div className="px-6 py-5">
          {/* Names and decisions side by side with VS badge */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-3 mb-5 items-center">
            {/* Candidate A */}
            <div className={`p-4 rounded-xl border-2 ${entryA.label === 'Invite' ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-red-200 dark:border-red-800/40 bg-red-50/30 dark:bg-red-900/10'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  entryA.label === 'Invite' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  {entryA.label === 'Invite' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100">{entryA.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{entryA.target_role}</p>
                </div>
                <Badge className={`ml-auto text-xs border-0 ${
                  entryA.label === 'Invite'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {entryA.label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Confiance</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200">{entryA.confidence > 0 ? `${entryA.confidence.toFixed(1)}%` : '—'}</p>
                </div>
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Étape</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200">{entryA.stage === 'hard_filter' ? 'Filtre élimin.' : 'Modèle ML'}</p>
                </div>
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Équité</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200">{entryA.fairness_adjusted ? 'Oui' : 'Non'}</p>
                </div>
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Facteur</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200 truncate">{entryA.top_driver !== 'N/A' ? entryA.top_driver : '—'}</p>
                </div>
              </div>
            </div>

            {/* VS Badge */}
            <div className="flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200/50 animate-vs-badge">
                <span className="text-xs font-black text-white">VS</span>
              </div>
            </div>

            {/* Candidate B */}
            <div className={`p-4 rounded-xl border-2 ${entryB.label === 'Invite' ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-red-200 dark:border-red-800/40 bg-red-50/30 dark:bg-red-900/10'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  entryB.label === 'Invite' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  {entryB.label === 'Invite' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100">{entryB.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{entryB.target_role}</p>
                </div>
                <Badge className={`ml-auto text-xs border-0 ${
                  entryB.label === 'Invite'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {entryB.label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Confiance</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200">{entryB.confidence > 0 ? `${entryB.confidence.toFixed(1)}%` : '—'}</p>
                </div>
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Étape</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200">{entryB.stage === 'hard_filter' ? 'Filtre élimin.' : 'Modèle ML'}</p>
                </div>
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Équité</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200">{entryB.fairness_adjusted ? 'Oui' : 'Non'}</p>
                </div>
                <div className="p-2 bg-white/60 dark:bg-slate-700/30 rounded-lg">
                  <span className="text-slate-400 dark:text-slate-500">Facteur</span>
                  <p className="font-bold text-slate-700 dark:text-slate-200 truncate">{entryB.top_driver !== 'N/A' ? entryB.top_driver : '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Metric comparison with colored highlights */}
          <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm mb-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              Comparaison des métriques
            </h4>
            <div className="space-y-2">
              {comparisons.map((comp) => {
                const aBetter = comp.higher ? comp.a > comp.b : comp.a < comp.b;
                const bBetter = comp.higher ? comp.b > comp.a : comp.b < comp.a;
                return (
                  <div key={comp.label} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    <div className={`p-2 rounded-lg text-xs text-right transition-colors ${aBetter ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-200 dark:ring-emerald-700/50' : 'bg-slate-50 dark:bg-slate-700/20'}`}>
                      <span className={aBetter ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}>
                        {comp.binary ? (comp.a ? '✓ Oui' : '✗ Non') : `${comp.a.toFixed(1)}${comp.unit}`}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium w-24 text-center">{comp.label}</span>
                    <div className={`p-2 rounded-lg text-xs text-left transition-colors ${bBetter ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-200 dark:ring-emerald-700/50' : 'bg-slate-50 dark:bg-slate-700/20'}`}>
                      <span className={bBetter ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}>
                        {comp.binary ? (comp.b ? '✓ Oui' : '✗ Non') : `${comp.b.toFixed(1)}${comp.unit}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary verdict */}
          <div className="p-4 bg-gradient-to-r from-emerald-50/80 to-emerald-50/40 dark:from-emerald-900/20 dark:to-emerald-800/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Verdict</span>
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {verdict === 'Égalité'
                ? 'Les deux candidats présentent des profils équivalents selon les métriques comparées.'
                : `${verdict} présente un profil légèrement avantageux selon les métriques comparées.`
              }
            </p>
          </div>

          {/* SHAP Comparison side by side */}
          {entryA.stage === 'ml_model' && entryB.stage === 'ml_model' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">SHAP — {entryA.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 ml-auto">Simulé</Badge>
                </div>
                <ShapWaterfall
                  shapValues={predA.explanation.shap_values}
                  baseValue={predA.explanation.base_value}
                  label={entryA.label}
                />
              </div>
              <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">SHAP — {entryB.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 ml-auto">Simulé</Badge>
                </div>
                <ShapWaterfall
                  shapValues={predB.explanation.shap_values}
                  baseValue={predB.explanation.base_value}
                  label={entryB.label}
                />
              </div>
            </div>
          )}

          {/* Features comparison side by side */}
          {entryA.stage === 'ml_model' && entryB.stage === 'ml_model' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Features — {entryA.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 ml-auto">Simulé</Badge>
                </div>
                <FeatureTable features={predA.features} />
              </div>
              <div className="p-4 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Features — {entryB.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 ml-auto">Simulé</Badge>
                </div>
                <FeatureTable features={predB.features} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-t border-slate-100 dark:border-slate-700/50 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-slate-600">
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
