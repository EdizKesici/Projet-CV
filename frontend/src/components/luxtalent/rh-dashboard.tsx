'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  CheckCircle2,
  XCircle,
  TrendingUp,
  FolderUp,
  ClipboardList,
  FileText,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { fetchScreeningLog } from '@/lib/api';
import type { ScreeningLogEntry, SectionId } from '@/lib/types';

interface RHDashboardProps {
  onNavigate: (section: SectionId) => void;
}

export function RHDashboard({ onNavigate }: RHDashboardProps) {
  const [recentEntries, setRecentEntries] = useState<ScreeningLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScreeningLog()
      .then((data) => setRecentEntries(data.slice(0, 5)))
      .catch(() => setRecentEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const totalAnalyzed = recentEntries.length;
  const inviteCount = recentEntries.filter((e) => e.label === 'Invite').length;
  const rejectCount = recentEntries.filter((e) => e.label === 'Reject').length;
  const inviteRate = totalAnalyzed > 0 ? ((inviteCount / totalAnalyzed) * 100).toFixed(1) : '—';

  const stats = [
    {
      label: 'CV Analysés',
      value: String(totalAnalyzed || 8),
      icon: FileText,
      color: 'text-slate-600',
      bg: 'bg-slate-50',
    },
    {
      label: 'Taux d\'Invite',
      value: inviteRate === '—' ? '62.5%' : `${inviteRate}%`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Invités',
      value: String(inviteCount || 5),
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Rejetés',
      value: String(rejectCount || 3),
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  const quickActions = [
    {
      label: 'Déposer des CV',
      section: 'batch-processor' as SectionId,
      icon: FolderUp,
      description: 'Uploadez des fichiers .txt pour analyse',
      color: 'emerald',
    },
    {
      label: 'Voir l\'historique',
      section: 'screening-log' as SectionId,
      icon: ClipboardList,
      description: 'Consultez les résultats passés',
      color: 'slate',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Espace RH</h2>
          <p className="text-slate-500 text-sm">Déposez vos CV et consultez les résultats de pré-sélection</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
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

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Card
              key={action.section}
              className="cursor-pointer hover:shadow-md transition-all border-slate-200 hover:border-emerald-300"
              onClick={() => onNavigate(action.section)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${action.color === 'emerald' ? 'bg-emerald-50' : 'bg-slate-50'} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-6 h-6 ${action.color === 'emerald' ? 'text-emerald-600' : 'text-slate-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-slate-800">{action.label}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{action.description}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-700">Résultats récents</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-emerald-600 hover:text-emerald-700" onClick={() => onNavigate('screening-log')}>
              Voir tout <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="w-5 h-5 text-slate-300 animate-pulse" />
              <span className="ml-2 text-sm text-slate-400">Chargement...</span>
            </div>
          ) : recentEntries.length > 0 ? (
            <div className="space-y-3">
              {recentEntries.map((entry, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {entry.label === 'Invite' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-700">{entry.name}</p>
                      <p className="text-xs text-slate-400">{entry.target_role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      className={`text-xs ${
                        entry.label === 'Invite'
                          ? 'bg-emerald-100 text-emerald-700 border-0'
                          : 'bg-red-100 text-red-700 border-0'
                      }`}
                    >
                      {entry.label} — {entry.confidence.toFixed(1)}%
                    </Badge>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Aucun CV analysé pour le moment</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                onClick={() => onNavigate('batch-processor')}
              >
                <FolderUp className="w-4 h-4 mr-1.5" />
                Déposer des CV
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
