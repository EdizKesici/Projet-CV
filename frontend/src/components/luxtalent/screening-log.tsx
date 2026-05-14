'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchScreeningLog } from '@/lib/api';
import type { ScreeningLogEntry } from '@/lib/types';
import { ClipboardList, Loader2, AlertTriangle, ArrowUpDown, RefreshCw } from 'lucide-react';

type SortField = 'timestamp' | 'name' | 'confidence' | 'label';
type SortDir = 'asc' | 'desc';

export function ScreeningLog() {
  const [entries, setEntries] = useState<ScreeningLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadLog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScreeningLog();
      setEntries(data);
    } catch {
      setError('Erreur lors du chargement du journal.');
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

  const sorted = [...entries].sort((a, b) => {
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
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      className={`w-3 h-3 ml-1 inline-block ${sortField === field ? 'text-emerald-500' : 'text-slate-300'}`}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Journal de Screening</h2>
          <p className="text-slate-500 text-sm mt-1">Historique de toutes les évaluations de CV</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLog} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
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
      {!loading && entries.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
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
                    <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Étape</th>
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
                    <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Fairness</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Facteur principal</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((entry, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
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
                        <Badge variant="outline" className="text-[10px] border-slate-200">
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
                      <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[200px] truncate" title={entry.top_driver}>
                        {entry.top_driver || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && !error && (
        <Card>
          <CardContent className="p-8 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Aucune entrée dans le journal</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
