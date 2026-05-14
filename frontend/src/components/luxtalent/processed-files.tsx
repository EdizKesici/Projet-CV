'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchProcessedFiles, deleteProcessedFile } from '@/lib/api';
import type { ProcessedFilesResponse } from '@/lib/types';
import { FolderOpen, Loader2, Trash2, AlertTriangle, RefreshCw, FileText } from 'lucide-react';

export function ProcessedFiles() {
  const [data, setData] = useState<ProcessedFilesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProcessedFiles();
      setData(result);
    } catch {
      setError('Erreur lors du chargement des fichiers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleDelete = async (filename: string) => {
    if (!confirm(`Supprimer ${filename} du registre ?`)) return;
    setDeleting(filename);
    try {
      await deleteProcessedFile(filename);
      if (data) {
        setData({
          count: data.count - 1,
          files: data.files.filter((f) => f !== filename),
        });
      }
    } catch {
      setError('Erreur lors de la suppression.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Fichiers Traités</h2>
          <p className="text-slate-500 text-sm mt-1">
            Registre des fichiers CV déjà traités par le système
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
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

      {/* Stats */}
      {data && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-700">
                Registre des fichiers traités
              </CardTitle>
              <Badge className="bg-slate-100 text-slate-600 border-0">
                {data.count} fichier{data.count !== 1 ? 's' : ''}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {data.files.length > 0 ? (
              <div className="space-y-2">
                {data.files.map((file) => (
                  <div
                    key={file}
                    className="flex items-center justify-between py-3 px-4 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700 font-mono">{file}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(file)}
                      disabled={deleting === file}
                      className="h-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                    >
                      {deleting === file ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Aucun fichier traité</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
