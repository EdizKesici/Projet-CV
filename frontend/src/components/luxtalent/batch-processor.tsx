'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { processInbox } from '@/lib/api';
import type { BatchResult, ProcessInboxResponse } from '@/lib/types';
import {
  FolderUp,
  Loader2,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
} from 'lucide-react';

export function BatchProcessor() {
  const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessInboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.txt'));
    droppedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setFiles((prev) => {
          if (prev.some((f) => f.name === file.name)) return prev;
          return [...prev, { name: file.name, content }];
        });
      };
      reader.readAsText(file);
    });
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter((f) => f.name.endsWith('.txt'));
    selectedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setFiles((prev) => {
          if (prev.some((f) => f.name === file.name)) return prev;
          return [...prev, { name: file.name, content }];
        });
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, []);

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleProcess = async () => {
    setLoading(true);
    setError(null);
    try {
      const batchResult = await processInbox();
      setResult(batchResult);
    } catch (err) {
      setError('Erreur lors du traitement batch.');
    } finally {
      setLoading(false);
    }
  };

  const summaryCards = result
    ? [
        { label: 'Total', value: result.total, icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50' },
        { label: 'Invités', value: result.invited, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Rejetés', value: result.rejected, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
        { label: 'Erreurs', value: result.errors, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Traitement Batch</h2>
        <p className="text-slate-500 text-sm mt-1">Traitez plusieurs CVs en une seule opération</p>
      </div>

      {/* Drop Zone */}
      <Card>
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive
                ? 'border-emerald-400 bg-emerald-50/50'
                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <Upload className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-emerald-500' : 'text-slate-400'}`} />
            <p className="text-sm font-medium text-slate-700">
              Glissez-déposez vos fichiers <span className="font-mono">.txt</span> ici
            </p>
            <p className="text-xs text-slate-400 mt-1">ou</p>
            <label className="mt-2 inline-block">
              <input type="file" multiple accept=".txt" onChange={handleFileSelect} className="hidden" />
              <Button variant="outline" size="sm" className="mt-2" asChild>
                <span className="cursor-pointer">Parcourir les fichiers</span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-700">
              Fichiers sélectionnés ({files.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {files.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-700">{file.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(file.name)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              onClick={handleProcess}
              disabled={loading}
              className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Traitement en cours...
                </>
              ) : (
                <>
                  <FolderUp className="w-4 h-4 mr-2" />
                  Lancer le traitement
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Results Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-700">Résultats détaillés</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Fichier</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Candidat</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Poste</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Décision</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Confiance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r: BatchResult, i: number) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{r.filename}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">{r.name}</td>
                        <td className="py-2.5 px-3 text-slate-600">{r.target_role}</td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            className={`text-xs ${
                              r.label === 'Invite'
                                ? 'bg-emerald-100 text-emerald-700 border-0'
                                : 'bg-red-100 text-red-700 border-0'
                            }`}
                          >
                            {r.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">{r.confidence.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
