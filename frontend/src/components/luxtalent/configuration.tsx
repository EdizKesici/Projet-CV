'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_HARD_FILTER_CONFIG, EDUCATION_LEVELS } from '@/lib/mock-data';
import type { HardFilterConfig } from '@/lib/types';
import { Settings, Save, X, Plus, CheckCircle2, RotateCcw } from 'lucide-react';

function loadStoredConfig(): HardFilterConfig {
  if (typeof window === 'undefined') return DEFAULT_HARD_FILTER_CONFIG;
  const stored = localStorage.getItem('luxtalent-hard-filter-config');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_HARD_FILTER_CONFIG;
    }
  }
  return DEFAULT_HARD_FILTER_CONFIG;
}

export function Configuration() {
  const [config, setConfig] = useState<HardFilterConfig>(loadStoredConfig);
  const [saved, setSaved] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [newSkill, setNewSkill] = useState('');

  const handleSave = () => {
    localStorage.setItem('luxtalent-hard-filter-config', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setConfig(DEFAULT_HARD_FILTER_CONFIG);
    localStorage.setItem('luxtalent-hard-filter-config', JSON.stringify(DEFAULT_HARD_FILTER_CONFIG));
  };

  const addLanguage = () => {
    const trimmed = newLang.trim();
    if (trimmed && !config.required_languages.includes(trimmed)) {
      setConfig({ ...config, required_languages: [...config.required_languages, trimmed] });
      setNewLang('');
    }
  };

  const removeLanguage = (lang: string) => {
    setConfig({ ...config, required_languages: config.required_languages.filter((l) => l !== lang) });
  };

  const addSkill = () => {
    const trimmed = newSkill.trim();
    if (trimmed && !config.required_skills.includes(trimmed)) {
      setConfig({ ...config, required_skills: [...config.required_skills, trimmed] });
      setNewSkill('');
    }
  };

  const removeSkill = (skill: string) => {
    setConfig({ ...config, required_skills: config.required_skills.filter((s) => s !== skill) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Configuration</h2>
        <p className="text-slate-500 text-sm mt-1">Paramètres des filtres durs pour le pré-screening</p>
      </div>

      {/* Hard Filter Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            <CardTitle className="text-base font-semibold text-slate-700">Filtres durs</CardTitle>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Les candidats qui ne respectent pas ces critères seront automatiquement rejetés
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Required Languages */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Langues requises</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {config.required_languages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium"
                >
                  {lang}
                  <button
                    onClick={() => removeLanguage(lang)}
                    className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ajouter une langue..."
                value={newLang}
                onChange={(e) => setNewLang(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLanguage()}
                className="flex-1 text-sm"
              />
              <Button variant="outline" size="sm" onClick={addLanguage} disabled={!newLang.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Required Skills */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Compétences requises</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {config.required_skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium"
                >
                  {skill}
                  <button
                    onClick={() => removeSkill(skill)}
                    className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ajouter une compétence..."
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSkill()}
                className="flex-1 text-sm"
              />
              <Button variant="outline" size="sm" onClick={addSkill} disabled={!newSkill.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Min Education Level */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Niveau d&apos;éducation minimum</Label>
            <Select
              value={String(config.min_education_level)}
              onValueChange={(v) => setConfig({ ...config, min_education_level: parseInt(v) })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EDUCATION_LEVELS).map(([level, label]) => (
                  <SelectItem key={level} value={level}>
                    Niveau {level} — {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Min Years Experience */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">
              Années d&apos;expérience minimum
            </Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={config.min_years_experience}
              onChange={(e) =>
                setConfig({ ...config, min_years_experience: parseInt(e.target.value) || 0 })
              }
              className="text-sm"
            />
          </div>

          {/* Min Positions */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">
              Nombre minimum de postes occupés
            </Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={config.min_positions}
              onChange={(e) =>
                setConfig({ ...config, min_positions: parseInt(e.target.value) || 0 })
              }
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          className={`${
            saved ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
          } text-white transition-colors`}
        >
          {saved ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Sauvegardé !
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Sauvegarder
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Réinitialiser
        </Button>
      </div>

      {/* Info card */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4">
          <p className="text-xs text-slate-500">
            <strong className="text-slate-600">Note :</strong> La configuration est stockée localement
            dans votre navigateur. Les filtres durs sont appliqués avant l&apos;évaluation du modèle ML.
            Les candidats ne respectant pas les critères sont automatiquement rejetés à l&apos;étape
            &quot;hard_filter&quot;.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
