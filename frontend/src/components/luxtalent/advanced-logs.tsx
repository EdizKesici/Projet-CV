'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchScreeningLog } from '@/lib/api';
import type { ScreeningLogEntry } from '@/lib/types';
import {
  FileText,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  RefreshCw,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

type SortField = 'timestamp' | 'name' | 'confidence' | 'label' | 'stage' | 'fairness_adjusted';
type SortDir = 'asc' | 'desc';

export function AdvancedLogs() {
  const [entries, setEntries] = useState<ScreeningLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLabel, setFilterLabel] = useState<string>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterFairness, setFilterFairness] = useState<string>('all');

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const loadLog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScreeningLog();
      setEntries(data);
    } catch {
      setError('Erreur lors du chargement des logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLog();
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = entries.filter((entry) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        entry.name.toLowerCase().includes(q) ||
        entry.filename.toLowerCase().includes(q) ||
        entry.target_role.toLowerCase().includes(q) ||
        entry.top_driver.toLowerCase().includes(q) ||
        entry.reasons.toLowerCase().includes(q);
      if (!match) return false;
    }
    // Label filter
    if (filterLabel !== 'all' && entry.label !== filterLabel) return false;
    // Stage filter
    if (filterStage !== 'all' && entry.stage !== filterStage) return false;
    // Fairness filter
    if (filterFairness === 'yes' && !entry.fairness_adjusted) return false;
    if (filterFairness === 'no' && entry.fairness_adjusted) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'timestamp':
        cmp = a.timestamp.localeCompare(b.timestamp);
        break;
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'confidence':
        cmp = a.confidence - b.confidence;
        break;
      case 'label':
        cmp = a.label.localeCompare(b.label);
        break;
      case 'stage':
        cmp = a.stage.localeCompare(b.stage);
        break;
      case 'fairness_adjusted':
        cmp = Number(a.fairness_adjusted) - Number(b.fairness_adjusted);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      className={`w-3 h-3 ml-1 inline-block ${sortField === field ? 'text-blue-500' : 'text-slate-300'}`}
    />
  );

  const exportCSV = () => {
    const headers = ['Timestamp', 'Fichier', 'Candidat', 'Poste', 'Étape', 'Décision', 'Confiance', 'Fairness', 'Facteur', 'Raisons'];
    const rows = sorted.map((e) => [
      e.timestamp,
      e.filename,
      e.name,
      e.target_role,
      e.stage,
      e.label,
      e.confidence.toFixed(1),
      e.fairness_adjusted ? 'Oui' : 'Non',
      `"${e.top_driver}"`,
      `"${e.reasons}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `luxtalent_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Logs Avancés</h2>
          <p className="text-slate-500 text-sm mt-1">
            Journal détaillé avec filtres et export — toutes les informations techniques de screening
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={sorted.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadLog} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">Filtres</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            {/* Label filter */}
            <Select value={filterLabel} onValueChange={setFilterLabel}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Décision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les décisions</SelectItem>
                <SelectItem value="Invite">Invite</SelectItem>
                <SelectItem value="Reject">Reject</SelectItem>
              </SelectContent>
            </Select>
            {/* Stage filter */}
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Étape" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les étapes</SelectItem>
                <SelectItem value="hard_filter">Hard Filter</SelectItem>
                <SelectItem value="ml_model">Modèle ML</SelectItem>
              </SelectContent>
            </Select>
            {/* Fairness filter */}
            <Select value={filterFairness} onValueChange={setFilterFairness}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Fairness" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="yes">Ajusté Fairness</SelectItem>
                <SelectItem value="no">Non ajusté</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Active filters summary */}
          {(searchQuery || filterLabel !== 'all' || filterStage !== 'all' || filterFairness !== 'all') && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                {sorted.length} résultat{sorted.length !== 1 ? 's' : ''} sur {entries.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-500 hover:text-slate-700 h-6"
                onClick={() => {
                  setSearchQuery('');
                  setFilterLabel('all');
                  setFilterStage('all');
                  setFilterFairness('all');
                }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">Chargement...</span>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {!loading && sorted.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="w-8 py-2.5 px-2" />
                    <th
                      className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      onClick={() => toggleSort('timestamp')}
                    >
                      Date <SortIcon field="timestamp" />
                    </th>
                    <th
                      className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      onClick={() => toggleSort('name')}
                    >
                      Candidat <SortIcon field="name" />
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Poste</th>
                    <th
                      className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      onClick={() => toggleSort('stage')}
                    >
                      Étape <SortIcon field="stage" />
                    </th>
                    <th
                      className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      onClick={() => toggleSort('label')}
                    >
                      Décision <SortIcon field="label" />
                    </th>
                    <th
                      className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      onClick={() => toggleSort('confidence')}
                    >
                      Confiance <SortIcon field="confidence" />
                    </th>
                    <th
                      className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      onClick={() => toggleSort('fairness_adjusted')}
                    >
                      Fairness <SortIcon field="fairness_adjusted" />
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Modèle</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((entry, i) => {
                    const isExpanded = expandedRows.has(i);
                    return (
                      <>
                        <tr
                          key={`row-${i}`}
                          className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => toggleRow(i)}
                        >
                          <td className="py-2.5 px-2 text-center">
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                            {new Date(entry.timestamp).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                          <td className="py-2.5 px-3">
                            <div>
                              <p className="font-medium text-slate-700">{entry.name}</p>
                              <p className="text-xs text-slate-400 font-mono">{entry.filename}</p>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-xs">{entry.target_role}</td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                entry.stage === 'ml_model'
                                  ? 'border-blue-200 text-blue-600'
                                  : 'border-amber-200 text-amber-600'
                              }`}
                            >
                              {entry.stage === 'ml_model' ? 'ML' : 'Filtre'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              className={`text-xs ${
                                entry.label === 'Invite'
                                  ? 'bg-emerald-100 text-emerald-700 border-0'
                                  : 'bg-red-100 text-red-700 border-0'
                              }`}
                            >
                              {entry.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {entry.confidence > 0 ? `${entry.confidence.toFixed(1)}%` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {entry.fairness_adjusted ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Oui</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-400">Non</Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{entry.model_name}</td>
                        </tr>
                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr key={`detail-${i}`} className="bg-slate-50/50">
                            <td colSpan={9} className="py-4 px-6">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Facteur principal</p>
                                  <p className="text-slate-700">{entry.top_driver || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Raisons</p>
                                  <p className="text-slate-600 text-xs">{entry.reasons || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Détails techniques</p>
                                  <div className="space-y-1 text-xs text-slate-500">
                                    <p>Étape : <span className="font-mono text-slate-700">{entry.stage}</span></p>
                                    <p>Modèle : <span className="font-mono text-slate-700">{entry.model_name}</span></p>
                                    <p>Fairness : <span className="text-slate-700">{entry.fairness_adjusted ? 'Ajusté' : 'Non ajusté'}</span></p>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && sorted.length === 0 && entries.length > 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Aucun résultat ne correspond aux filtres</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-sm"
              onClick={() => {
                setSearchQuery('');
                setFilterLabel('all');
                setFilterStage('all');
                setFilterFairness('all');
              }}
            >
              Réinitialiser les filtres
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && entries.length === 0 && !error && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Aucune entrée dans les logs</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
