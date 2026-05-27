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

export function FairnessHistory() {
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
  }, []);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await fetchFairnessMetrics();
      setMetrics(data);
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
      {/* ====== FAIRNESS SECTION ====== */}
      <section>
        <div className="fairness-mesh-bg rounded-2xl p-5 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center shadow-sm">
                  <Scale className="w-4 h-4 text-emerald-600" />
                </div>
                Audit d&apos;équité
                <span className="inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 live-dot" />
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Live</span>
                </span>
              </h2>
              <p className="text-sm text-slate-500 mt-1 ml-[42px]">
                Comparaison des métriques entre le modèle de base et le modèle corrigé
              </p>
            </div>
            <Button
              onClick={loadMetrics}
              disabled={metricsLoading}
              variant="outline"
              className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-2"
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
            {/* Fairness Composite Score + Trend Sparkline */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
              {/* Composite Score */}
              <Card className="shadow-sm border-emerald-100 overflow-hidden">
                <CardContent className="p-5 flex flex-col items-center">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Target className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Score d&apos;équité</span>
                  </div>
                  <div className="relative w-28 h-28">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="6" />
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
                      <span className="text-2xl font-bold text-emerald-600">{fairnessScore}</span>
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider">/ 100</span>
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
              <div className="grid grid-cols-3 gap-3">
                {/* EPD Card */}
                <div className="summary-card-glow rounded-xl border p-4 shadow-sm text-center relative bg-gradient-to-br from-emerald-50/30 to-white border-slate-200/80">
                  <div className="flex items-center justify-center gap-1 mb-2 cursor-help" onClick={() => setShowMetricInfo(showMetricInfo === 'epd' ? null : 'epd')}>
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-500 transition-colors" />
                    <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">EPD</span>
                  </div>
                  {showMetricInfo === 'epd' && (
                    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-xl max-w-[200px]">
                      Écart de Parité Démographique — Mesure la différence de taux d&apos;invitation entre groupes. Plus c&apos;est bas, mieux c&apos;est.
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Base</p>
                      <p className={`text-lg font-bold ${metrics.base_model.epd_alert ? 'text-red-500' : 'text-amber-500'}`}>
                        {metrics.base_model.epd.toFixed(1)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-400" />
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Corrigé</p>
                      <p className={`text-lg font-bold ${metrics.fair_model.epd_alert ? 'text-red-500' : 'text-emerald-500'}`}>
                        {metrics.fair_model.epd.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-1.5">
                    <TrendingDown className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-emerald-600 font-medium">−{(metrics.base_model.epd - metrics.fair_model.epd).toFixed(1)} pts</span>
                  </div>
                  {/* Mini progress ring for Corrigé */}
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
                <div className="summary-card-glow rounded-xl border p-4 shadow-sm text-center relative bg-gradient-to-br from-emerald-50/30 to-white border-slate-200/80">
                  <div className="flex items-center justify-center gap-1 mb-2 cursor-help" onClick={() => setShowMetricInfo(showMetricInfo === 'rid' ? null : 'rid')}>
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-500 transition-colors" />
                    <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">RID</span>
                  </div>
                  {showMetricInfo === 'rid' && (
                    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-xl max-w-[200px]">
                      Ratio d&apos;Impact Disparate — Ratio du taux d&apos;invitation entre groupes. Plus c&apos;est proche de 1.0, mieux c&apos;est.
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Base</p>
                      <p className={`text-lg font-bold ${metrics.base_model.rid_alert ? 'text-red-500' : 'text-amber-500'}`}>
                        {metrics.base_model.rid.toFixed(3)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-400" />
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Corrigé</p>
                      <p className={`text-lg font-bold ${metrics.fair_model.rid_alert ? 'text-red-500' : 'text-emerald-500'}`}>
                        {metrics.fair_model.rid.toFixed(3)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-emerald-600 font-medium">+{(metrics.fair_model.rid - metrics.base_model.rid).toFixed(3)}</span>
                  </div>
                  {/* Mini progress ring for Corrigé */}
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
                <div className="summary-card-glow rounded-xl border p-4 shadow-sm text-center relative bg-gradient-to-br from-emerald-50/30 to-white border-slate-200/80">
                  <div className="flex items-center justify-center gap-1 mb-2 cursor-help" onClick={() => setShowMetricInfo(showMetricInfo === 'delta_tpr' ? null : 'delta_tpr')}>
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-500 transition-colors" />
                    <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Delta TPR</span>
                  </div>
                  {showMetricInfo === 'delta_tpr' && (
                    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-xl max-w-[200px]">
                      Différence de Taux de Vrais Positifs — Écart de détection des candidats qualifiés entre groupes. Plus c&apos;est bas, mieux c&apos;est.
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Base</p>
                      <p className={`text-lg font-bold ${metrics.base_model.delta_tpr_alert ? 'text-red-500' : 'text-amber-500'}`}>
                        {metrics.base_model.delta_tpr.toFixed(1)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-400" />
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Corrigé</p>
                      <p className={`text-lg font-bold ${metrics.fair_model.delta_tpr_alert ? 'text-red-500' : 'text-emerald-500'}`}>
                        {metrics.fair_model.delta_tpr.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-1.5">
                    <TrendingDown className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-emerald-600 font-medium">−{(metrics.base_model.delta_tpr - metrics.fair_model.delta_tpr).toFixed(1)} pts</span>
                  </div>
                  {/* Mini progress ring for Corrigé */}
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
            </div>

            {/* Fairness Trend Mini-Chart (Sparkline) */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Tendance d&apos;équité</span>
                  </div>
                  <span className="text-[10px] text-slate-400">5 dernières sessions</span>
                </div>
                <div className="flex items-end gap-1 h-16">
                  <svg viewBox="0 0 200 60" className="w-full h-full">
                    {/* Grid lines */}
                    <line x1="0" y1="15" x2="200" y2="15" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4" />
                    <line x1="0" y1="30" x2="200" y2="30" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4" />
                    <line x1="0" y1="45" x2="200" y2="45" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4" />

                    {/* Area fill */}
                    <path
                      d={`M 0 ${60 - (trendData[0]?.composite_score || 0) * 0.55} ${trendData.map((p, i) => `L ${i * 50} ${60 - p.composite_score * 0.55}`).join(' ')} L ${(trendData.length - 1) * 50} 60 L 0 60 Z`}
                      fill="url(#sparklineGradient)"
                      opacity="0.3"
                    />

                    {/* Line */}
                    <path
                      d={trendData.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * 50} ${60 - p.composite_score * 0.55}`).join(' ')}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-sparkline"
                    />

                    {/* Dots */}
                    {trendData.map((p, i) => (
                      <g key={i}>
                        <circle cx={i * 50} cy={60 - p.composite_score * 0.55} r="4" fill="white" stroke="#10b981" strokeWidth="2" />
                        <text x={i * 50} y={60 - p.composite_score * 0.55 - 10} textAnchor="middle" className="text-[8px]" fill="#64748b">{p.composite_score}</text>
                      </g>
                    ))}

                    <defs>
                      <linearGradient id="sparklineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="flex justify-between mt-1">
                  {trendData.map((p, i) => (
                    <span key={i} className="text-[8px] text-slate-400">{new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Version info bar */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-50">{metrics.version}</Badge>
              <div className="h-4 w-px bg-slate-200" />
              <span className="text-sm text-slate-600">Contrainte : <strong className="text-slate-800">{metrics.fairness_constraint === 'equalized_odds' ? 'Égalité des chances' : metrics.fairness_constraint}</strong></span>
              <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Dernier entraînement</span>
              </div>
            </div>

            {/* Comparison Panels */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Base model */}
              <Card className="border-amber-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-700">Modèle de base</CardTitle>
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-50 gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Sans correction
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <FairnessGauge label="EPD" value={metrics.base_model.epd} alert={metrics.base_model.epd_alert} description="Écart Parité Démogr." type="epd" />
                    <FairnessGauge label="RID" value={metrics.base_model.rid} alert={metrics.base_model.rid_alert} description="Ratio Impact Diff." type="rid" />
                    <FairnessGauge label="Delta TPR" value={metrics.base_model.delta_tpr} alert={metrics.base_model.delta_tpr_alert} description="Égalité des Chances" type="delta_tpr" />
                  </div>
                  <GroupStatsTable groupStats={metrics.base_model.group_stats} />
                </CardContent>
              </Card>

              {/* Fair model */}
              <Card className="border-emerald-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-700">Modèle V2 (corrigé)</CardTitle>
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

            {/* Improvement indicators */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                  Améliorations apportées par la correction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ImprovementCard
                    icon={<TrendingDown className="w-4 h-4 text-emerald-500" />}
                    label="EPD"
                    before={`${metrics.base_model.epd.toFixed(1)} pts`}
                    after={`${metrics.fair_model.epd.toFixed(1)} pts`}
                    beforeAlert={metrics.base_model.epd_alert}
                    diff={`−${(metrics.base_model.epd - metrics.fair_model.epd).toFixed(1)} pts d'écart réduit`}
                  />
                  <ImprovementCard
                    icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
                    label="RID"
                    before={metrics.base_model.rid.toFixed(3)}
                    after={metrics.fair_model.rid.toFixed(3)}
                    beforeAlert={metrics.base_model.rid_alert}
                    diff={`+${(metrics.fair_model.rid - metrics.base_model.rid).toFixed(3)} plus proche de 1.0`}
                  />
                  <ImprovementCard
                    icon={<TrendingDown className="w-4 h-4 text-emerald-500" />}
                    label="Delta TPR"
                    before={`${metrics.base_model.delta_tpr.toFixed(1)} pts`}
                    after={`${metrics.fair_model.delta_tpr.toFixed(1)} pts`}
                    beforeAlert={metrics.base_model.delta_tpr_alert}
                    diff={`−${(metrics.base_model.delta_tpr - metrics.fair_model.delta_tpr).toFixed(1)} pts d'écart réduit`}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Performance + Proxy side by side on large screens */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Performance Comparison */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-700">Comparaison des performances</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: 'Accuracy', base: metrics.performance_comparison.base.accuracy, fair: metrics.performance_comparison.fair.accuracy },
                      { label: 'F1 Invite', base: metrics.performance_comparison.base.f1_invite, fair: metrics.performance_comparison.fair.f1_invite },
                      { label: 'F1 Reject', base: metrics.performance_comparison.base.f1_reject, fair: metrics.performance_comparison.fair.f1_reject },
                    ].map((item) => {
                      const diff = item.fair - item.base;
                      const isNeg = diff < 0;
                      return (
                        <div key={item.label} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-slate-500 w-20">{item.label}</span>
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-sm font-mono text-slate-500 w-12 text-right">{(item.base * 100).toFixed(0)}%</span>
                            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
                              <div className="absolute inset-y-0 left-0 bg-slate-300 rounded-full" style={{ width: `${item.base * 100}%` }} />
                              <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 animate-progress ${isNeg ? 'bg-gradient-to-r from-red-400 to-red-300' : 'bg-gradient-to-r from-emerald-400 to-emerald-300'}`} style={{ width: `${item.fair * 100}%` }} />
                            </div>
                            <span className="text-sm font-mono font-semibold text-slate-700 w-12">{(item.fair * 100).toFixed(0)}%</span>
                          </div>
                          <span className={`text-xs font-semibold w-12 text-right ${isNeg ? 'text-red-500' : 'text-emerald-500'}`}>
                            {isNeg ? '' : '+'}{(diff * 100).toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                    {metrics.performance_comparison.base.auc && (
                      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                        <span className="text-xs font-medium text-slate-500 w-20">AUC</span>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-sm font-mono text-slate-500">{(metrics.performance_comparison.base.auc * 100).toFixed(0)}%</span>
                          <span className="text-xs text-slate-400">(modèle de base)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Proxy Analysis */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Analyse des variables proxy
                    {metrics.proxy_analysis.some((p) => p.is_proxy) && (
                      <Badge className="bg-amber-50 text-amber-600 border border-amber-100 text-[10px] hover:bg-amber-50">
                        {metrics.proxy_analysis.filter((p) => p.is_proxy).length} proxy détecté
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-2 text-xs font-semibold text-slate-500 uppercase">Variable</th>
                          <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500 uppercase">r</th>
                          <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500 uppercase">p</th>
                          <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500 uppercase">MI</th>
                          <th className="text-center py-2 px-1 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.proxy_analysis.map((item) => {
                          const label = FEATURE_LABELS[item.feature] || item.feature;
                          return (
                            <tr key={item.feature} className={`border-b border-slate-50 transition-colors ${item.is_proxy ? 'bg-amber-50/50' : 'hover:bg-slate-50'}`}>
                              <td className="py-2 px-2 font-medium text-slate-700 text-xs">{label}</td>
                              <td className="py-2 px-2 text-center font-mono text-slate-600 text-xs">{item.pearson_r.toFixed(3)}</td>
                              <td className="py-2 px-2 text-center font-mono text-slate-600 text-xs">{item.pearson_pval.toFixed(2)}</td>
                              <td className="py-2 px-2 text-center font-mono text-slate-600 text-xs">{item.mutual_info.toFixed(3)}</td>
                              <td className="py-2 px-1 text-center">
                                {item.is_proxy ? (
                                  <Badge className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100 text-[10px] px-1.5">
                                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                    Proxy
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-50 text-emerald-600 border-0 hover:bg-emerald-50 text-[10px] px-1.5">
                                    <Shield className="w-2.5 h-2.5 mr-0.5" />
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
            </div>
          </div>
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

      {/* ====== ANALYTICS INSIGHTS SECTION ====== */}
      {logEntries.length > 0 && (
        <section className="animate-card-enter">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              Analyse des tendances
            </h2>
            <p className="text-sm text-slate-500 mt-1 ml-[42px]">
              Répartition et distribution des décisions par poste et confiance
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Role Breakdown with mini donut charts */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  Répartition par poste
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(roleBreakdown).map(([role, counts]) => {
                    const total = counts.invite + counts.reject;
                    const invitePct = total > 0 ? (counts.invite / total) * 100 : 0;
                    const rejectPct = total > 0 ? (counts.reject / total) * 100 : 0;
                    // CSS donut: invite angle
                    const inviteDeg = (counts.invite / total) * 360;
                    return (
                      <div key={role} className="p-3 bg-gradient-to-br from-slate-50/80 to-white rounded-xl border border-slate-100 flex items-center gap-3">
                        {/* Mini CSS donut */}
                        <div className="w-8 h-8 rounded-full flex-shrink-0 relative" style={{
                          background: counts.invite > 0 && counts.reject > 0
                            ? `conic-gradient(#10b981 0deg ${inviteDeg}deg, #ef4444 ${inviteDeg}deg 360deg)`
                            : counts.invite > 0 ? '#10b981' : '#ef4444'
                        }}>
                          <div className="absolute inset-1.5 rounded-full bg-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-700 truncate">{role}</span>
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="w-3 h-3" />
                                {counts.invite}
                              </span>
                              <span className="flex items-center gap-1 text-red-600">
                                <XCircle className="w-3 h-3" />
                                {counts.reject}
                              </span>
                            </div>
                          </div>
                          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 shadow-inner">
                            {counts.invite > 0 && (
                              <div
                                className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                                style={{ width: `${invitePct}%` }}
                              />
                            )}
                            {counts.reject > 0 && (
                              <div
                                className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
                                style={{ width: `${rejectPct}%` }}
                              />
                            )}
                          </div>
                          <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
                            <span>{invitePct.toFixed(0)}% Invités</span>
                            <span>{rejectPct.toFixed(0)}% Rejetés</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Insight badge */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-50 gap-1 text-[10px]">
                    <Sparkles className="w-3 h-3" />
                    Top poste : {Object.entries(roleBreakdown).sort((a, b) => (b[1].invite + b[1].reject) - (a[1].invite + a[1].reject))[0]?.[0] || '—'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Confidence Distribution */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                  Distribution de confiance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 px-2 pt-2 pb-2">
                  <div className="flex items-end justify-between gap-3 h-full">
                    {confidenceBins.map((count, i) => {
                      const binLabel = `${i * 20}–${(i + 1) * 20}%`;
                      const heightPct = maxBinCount > 0 ? (count / maxBinCount) * 100 : 0;
                      const isMax = count === maxBinCount && count > 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-600">{count}</span>
                          <div className="w-full flex flex-col justify-end flex-1">
                            <div
                              className={`w-full rounded-t-md transition-all duration-500 ${
                                isMax
                                  ? 'bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-sm shadow-emerald-200'
                                  : count > 0
                                    ? 'bg-gradient-to-t from-emerald-300 to-emerald-200'
                                    : 'bg-slate-100'
                              }`}
                              style={{ height: `${heightPct}%`, minHeight: count > 0 ? '4px' : '2px' }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-400 text-center leading-tight whitespace-nowrap">{binLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-slate-100">
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="w-3 h-2 rounded-sm bg-gradient-to-r from-emerald-400 to-emerald-500 inline-block" />
                    Plus fréquent
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="w-3 h-2 rounded-sm bg-emerald-200 inline-block" />
                    Moins fréquent
                  </span>
                </div>
                {/* Insight badges */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-50 gap-1 text-[10px]">
                    <Activity className="w-3 h-3" />
                    Confiance médiane : {confidenceMedian.toFixed(0)}%
                  </Badge>
                  <Badge className="bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-50 gap-1 text-[10px]">
                    <Zap className="w-3 h-3" />
                    Moyenne : {avgConfidence.toFixed(0)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
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

      {/* ====== HISTORY SECTION ====== */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center">
                <Clock className="w-4 h-4 text-emerald-600" />
              </div>
              Historique des analyses
            </h2>
            <p className="text-sm text-slate-500 mt-1 ml-[42px]">
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
                  className="border-slate-200 text-slate-600 hover:bg-slate-50 gap-1.5 rounded-r-none border-r-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Exporter</span>
                  <span className="text-[9px] text-slate-400 uppercase ml-0.5">{exportFormat}</span>
                </Button>
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="px-2 border border-slate-200 rounded-r-md text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              {showExportDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[130px] export-dropdown">
                  {([
                    { key: 'txt' as const, label: 'Texte (.txt)', icon: <File className="w-3 h-3" /> },
                    { key: 'csv' as const, label: 'CSV (.csv)', icon: <FileSpreadsheet className="w-3 h-3" /> },
                    { key: 'json' as const, label: 'JSON (.json)', icon: <FileJson className="w-3 h-3" /> },
                    { key: 'pdf' as const, label: 'PDF (.pdf)', icon: <FileText className="w-3 h-3" /> },
                  ]).map((fmt) => (
                    <button
                      key={fmt.key}
                      onClick={() => { setExportFormat(fmt.key); setShowExportDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                        exportFormat === fmt.key ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
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
              className={`gap-1.5 ${
                comparisonMode
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <GitCompareArrows className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{comparisonMode ? 'Annuler' : 'Comparer'}</span>
            </Button>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-40 pl-8 pr-7 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 transition-colors"
                >
                  <X className="w-2.5 h-2.5 text-slate-500" />
                </button>
              )}
            </div>

            {/* Date filter */}
            <div className="relative" ref={dateDropdownRef}>
              <button
                onClick={() => setShowDateDropdown(!showDateDropdown)}
                className="flex items-center gap-1.5 h-8 px-3 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">{dateFilterLabels[dateFilter]}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showDateDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                  {Object.entries(dateFilterLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setDateFilter(key as typeof dateFilter); setShowDateDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        dateFilter === key ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter buttons */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(['all', 'Invite', 'Reject'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterLabel(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    filterLabel === f
                      ? f === 'Invite'
                        ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                        : f === 'Reject'
                          ? 'bg-red-100 text-red-700 shadow-sm'
                          : 'bg-white text-slate-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f === 'all' ? 'Tous' : f}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(['all', 'En attente', 'Entretien planifié', 'Refusé', 'Embauché'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1.5 text-[10px] font-medium rounded-md transition-all ${
                    statusFilter === s
                      ? 'bg-white text-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            {[
              { label: 'Total analyses', value: totalEntries, icon: <BarChart3 className="w-3.5 h-3.5 text-slate-400" /> },
              { label: 'Taux d\'invitation', value: `${totalEntries > 0 ? ((inviteCount / totalEntries) * 100).toFixed(0) : 0}%`, icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> },
              { label: 'Confiance moyenne', value: `${avgConfidence.toFixed(0)}%`, icon: <Activity className="w-3.5 h-3.5 text-amber-400" /> },
              { label: 'Taux d\'ajustement', value: `${totalEntries > 0 ? ((fairnessAdjustedCount / totalEntries) * 100).toFixed(0) : 0}%`, icon: <Shield className="w-3.5 h-3.5 text-emerald-400" /> },
              { label: 'Poste le + analysé', value: mostAnalyzedRole, icon: <Users className="w-3.5 h-3.5 text-slate-400" /> },
              { label: 'Équité ajustée', value: `${fairnessAdjustedCount}/${totalEntries}`, icon: <Award className="w-3.5 h-3.5 text-emerald-400" /> },
            ].map((stat, i) => (
              <div key={i} className="batch-stat-card p-3 bg-white rounded-xl border border-slate-200/80 shadow-sm">
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
          <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-sm mb-4">
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
            <div className="w-px h-4 bg-slate-200" />
            <span className="text-xs text-slate-500">Équité ajustée :</span>
            <span className="text-sm font-bold text-emerald-600">{fairnessAdjustedCount}/{totalEntries}</span>
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
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar animate-page-slide" key={currentPage}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-slate-200">
                    <tr>
                      {comparisonMode && (
                        <th className="w-8 py-3 px-2 text-xs font-semibold text-slate-500 uppercase"></th>
                      )}
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Candidat</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Poste</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Décision</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Confiance</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Équité</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Statut</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Facteur principal</th>
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
                          className={`border-b border-slate-50 hover:bg-emerald-50/30 cursor-pointer transition-all group border-l-4 history-row-enter ${
                            entry.label === 'Invite'
                              ? 'border-l-emerald-400'
                              : 'border-l-red-400'
                          } ${isCompSelected ? 'bg-emerald-50/60 comparison-selected' : ''} ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}
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
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-xs">
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
                              <span className="font-medium text-slate-700">{entry.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs hidden sm:table-cell">{entry.target_role}</td>
                          <td className="py-3 px-4 text-center">
                            <Badge className={`text-xs border-0 shadow-sm ${
                              entry.label === 'Invite'
                                ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700'
                                : 'bg-gradient-to-r from-red-50 to-red-100 text-red-700'
                            }`}>
                              {entry.label}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {entry.confidence > 0 && (
                                <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                  <div
                                    className={`h-full rounded-full ${entry.label === 'Invite' ? 'bg-emerald-400' : 'bg-red-400'}`}
                                    style={{ width: `${Math.min(entry.confidence, 100)}%` }}
                                  />
                                </div>
                              )}
                              <span className="font-mono text-slate-600 text-xs">
                              {entry.confidence > 0 ? `${entry.confidence.toFixed(1)}%` : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center hidden md:table-cell">
                            {entry.fairness_adjusted ? (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 rounded-md">
                                <Shield className="w-3 h-3 text-emerald-500" />
                                <span className="text-[10px] text-emerald-600 font-medium">Oui</span>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center hidden lg:table-cell">
                            {statusCfg ? (
                              <Badge className={`text-[10px] border px-1.5 py-0 ${statusCfg.cssClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor} mr-1`} />
                                {statusCfg.label}
                              </Badge>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 hidden lg:table-cell truncate max-w-[180px]">
                            {entry.top_driver !== 'N/A' ? entry.top_driver : '—'}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-1">
                              {!comparisonMode && (
                                <button
                                  onClick={(e) => handleDeleteEntry(e, entry)}
                                  className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                  title="Supprimer"
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
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
                  <span className="text-xs text-slate-500">
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
                    <span className="text-xs text-slate-600 font-medium">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-overlay" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with colored top bar and frosted glass */}
        <div className={`h-2 rounded-t-2xl ${isInvite ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400' : 'bg-gradient-to-r from-red-400 via-red-500 to-rose-400'}`} />
        <div className="sticky top-0 frosted-glass border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${
              isInvite ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-200/50' : 'bg-gradient-to-br from-red-50 to-red-100 ring-1 ring-red-200/50'
            }`}>
              {isInvite ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">{entry.name}</h3>
              <p className="text-sm text-slate-500">{entry.target_role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {entry.fairness_adjusted && (
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 gap-1 hover:bg-emerald-50">
                <Shield className="w-3 h-3" />
                Équité
              </Badge>
            )}
            <Badge className={`font-bold border-0 shadow-sm ${
              isInvite ? 'bg-gradient-to-r from-emerald-100 to-emerald-50 text-emerald-700' : 'bg-gradient-to-r from-red-100 to-red-50 text-red-700'
            }`}>
              {entry.label}
            </Badge>
            <button
              onClick={onClose}
              className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 close-btn-hover"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Confiance</p>
              <p className="text-xl font-bold text-slate-800">{entry.confidence > 0 ? `${entry.confidence.toFixed(1)}%` : '—'}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Étape</p>
              <p className="text-sm font-semibold text-slate-800">{entry.stage === 'hard_filter' ? 'Filtre élimin.' : 'Modèle ML'}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Modèle</p>
              <p className="text-xs font-semibold text-slate-800 leading-tight">{entry.model_name}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Date</p>
              <p className="text-sm font-semibold text-slate-800">
                {new Date(entry.timestamp).toLocaleString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Status update */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-500" />
                <h4 className="text-sm font-semibold text-slate-700">Statut du candidat</h4>
              </div>
              <Badge className={`text-[10px] border ${entry.status ? STATUS_CONFIG[entry.status]?.cssClass : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
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
                        : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
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
            <div className="p-4 bg-slate-50/80 border border-slate-100 rounded-xl">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Facteur principal</p>
              <p className="text-sm font-semibold text-slate-700">{entry.top_driver}</p>
            </div>
          )}

          {/* Tabbed section: SHAP / Features / Résumé */}
          {entry.stage === 'ml_model' && (
            <>
              {/* Sidebar navigation within modal */}
              <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                {([
                  { key: 'shap' as const, label: 'SHAP', icon: <Eye className="w-3.5 h-3.5" /> },
                  { key: 'features' as const, label: 'Features', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                  { key: 'resume' as const, label: 'Résumé', icon: <FileText className="w-3.5 h-3.5" /> },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all ${
                      activeTab === tab.key
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === 'shap' && (
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm animate-card-enter">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-700">Analyse SHAP complète</h4>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-200 ml-auto">Simulé</Badge>
                  </div>
                  <ShapWaterfall
                    shapValues={simulatedPrediction.explanation.shap_values}
                    baseValue={simulatedPrediction.explanation.base_value}
                    label={entry.label}
                  />
                </div>
              )}

              {activeTab === 'features' && (
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm animate-card-enter">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-700">Features extraites</h4>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-200 ml-auto">Simulé</Badge>
                  </div>
                  <FeatureTable features={simulatedPrediction.features} />
                </div>
              )}

              {activeTab === 'resume' && (
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm animate-card-enter space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-700">Résumé de la décision</h4>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-emerald-50/50 to-emerald-50/20 border border-emerald-100 rounded-xl">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {simulatedPrediction.explanation.decision_drivers}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Probabilité Invite</p>
                      <p className="text-lg font-bold text-emerald-600">{simulatedPrediction.probabilities.Invite.toFixed(1)}%</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Probabilité Reject</p>
                      <p className="text-lg font-bold text-red-600">{simulatedPrediction.probabilities.Reject.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Decision drivers text (shown when not ml_model or as fallback) */}
          {entry.stage === 'ml_model' && activeTab !== 'resume' && simulatedPrediction.explanation && (
            <div className="p-4 bg-gradient-to-br from-emerald-50/50 to-emerald-50/20 border border-emerald-100 rounded-xl">
              <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Explication de la décision</p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {simulatedPrediction.explanation.decision_drivers}
              </p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 px-6 py-3 flex items-center justify-between">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-overlay" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-2 rounded-t-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400" />
        <div className="sticky top-0 frosted-glass border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-200/50">
              <GitCompareArrows className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Comparaison des candidats</h3>
              <p className="text-sm text-slate-500">Analyse comparative des profils</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 close-btn-hover"
          >
            ✕
          </button>
        </div>

        {/* Body - side by side */}
        <div className="px-6 py-5">
          {/* Names and decisions side by side with VS badge */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 mb-5 items-center">
            {/* Candidate A */}
            <div className={`p-4 rounded-xl border-2 ${entryA.label === 'Invite' ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  entryA.label === 'Invite' ? 'bg-emerald-100' : 'bg-red-100'
                }`}>
                  {entryA.label === 'Invite' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">{entryA.name}</h4>
                  <p className="text-xs text-slate-500">{entryA.target_role}</p>
                </div>
                <Badge className={`ml-auto text-xs border-0 ${
                  entryA.label === 'Invite'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {entryA.label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Confiance</span>
                  <p className="font-bold text-slate-700">{entryA.confidence > 0 ? `${entryA.confidence.toFixed(1)}%` : '—'}</p>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Étape</span>
                  <p className="font-bold text-slate-700">{entryA.stage === 'hard_filter' ? 'Filtre élimin.' : 'Modèle ML'}</p>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Équité</span>
                  <p className="font-bold text-slate-700">{entryA.fairness_adjusted ? 'Oui' : 'Non'}</p>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Facteur</span>
                  <p className="font-bold text-slate-700 truncate">{entryA.top_driver !== 'N/A' ? entryA.top_driver : '—'}</p>
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
            <div className={`p-4 rounded-xl border-2 ${entryB.label === 'Invite' ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  entryB.label === 'Invite' ? 'bg-emerald-100' : 'bg-red-100'
                }`}>
                  {entryB.label === 'Invite' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">{entryB.name}</h4>
                  <p className="text-xs text-slate-500">{entryB.target_role}</p>
                </div>
                <Badge className={`ml-auto text-xs border-0 ${
                  entryB.label === 'Invite'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {entryB.label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Confiance</span>
                  <p className="font-bold text-slate-700">{entryB.confidence > 0 ? `${entryB.confidence.toFixed(1)}%` : '—'}</p>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Étape</span>
                  <p className="font-bold text-slate-700">{entryB.stage === 'hard_filter' ? 'Filtre élimin.' : 'Modèle ML'}</p>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Équité</span>
                  <p className="font-bold text-slate-700">{entryB.fairness_adjusted ? 'Oui' : 'Non'}</p>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <span className="text-slate-400">Facteur</span>
                  <p className="font-bold text-slate-700 truncate">{entryB.top_driver !== 'N/A' ? entryB.top_driver : '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Metric comparison with colored highlights */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm mb-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              Comparaison des métriques
            </h4>
            <div className="space-y-2">
              {comparisons.map((comp) => {
                const aBetter = comp.higher ? comp.a > comp.b : comp.a < comp.b;
                const bBetter = comp.higher ? comp.b > comp.a : comp.b < comp.a;
                return (
                  <div key={comp.label} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    <div className={`p-2 rounded-lg text-xs text-right transition-colors ${aBetter ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50'}`}>
                      <span className={aBetter ? 'font-bold text-emerald-700' : 'text-slate-600'}>
                        {comp.binary ? (comp.a ? '✓ Oui' : '✗ Non') : `${comp.a.toFixed(1)}${comp.unit}`}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium w-24 text-center">{comp.label}</span>
                    <div className={`p-2 rounded-lg text-xs text-left transition-colors ${bBetter ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50'}`}>
                      <span className={bBetter ? 'font-bold text-emerald-700' : 'text-slate-600'}>
                        {comp.binary ? (comp.b ? '✓ Oui' : '✗ Non') : `${comp.b.toFixed(1)}${comp.unit}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary verdict */}
          <div className="p-4 bg-gradient-to-r from-emerald-50/80 to-emerald-50/40 border border-emerald-100 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">Verdict</span>
            </div>
            <p className="text-sm text-emerald-700">
              {verdict === 'Égalité'
                ? 'Les deux candidats présentent des profils équivalents selon les métriques comparées.'
                : `${verdict} présente un profil légèrement avantageux selon les métriques comparées.`
              }
            </p>
          </div>

          {/* SHAP Comparison side by side */}
          {entryA.stage === 'ml_model' && entryB.stage === 'ml_model' && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-3.5 h-3.5 text-emerald-500" />
                  <h4 className="text-sm font-semibold text-slate-700">SHAP — {entryA.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-200 ml-auto">Simulé</Badge>
                </div>
                <ShapWaterfall
                  shapValues={predA.explanation.shap_values}
                  baseValue={predA.explanation.base_value}
                  label={entryA.label}
                />
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-3.5 h-3.5 text-emerald-500" />
                  <h4 className="text-sm font-semibold text-slate-700">SHAP — {entryB.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-200 ml-auto">Simulé</Badge>
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
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                  <h4 className="text-sm font-semibold text-slate-700">Features — {entryA.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-200 ml-auto">Simulé</Badge>
                </div>
                <FeatureTable features={predA.features} />
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                  <h4 className="text-sm font-semibold text-slate-700">Features — {entryB.name}</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-200 ml-auto">Simulé</Badge>
                </div>
                <FeatureTable features={predB.features} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-slate-600">
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
