'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchFilterConfig, saveFilterConfig } from '@/lib/api';
import { DEFAULT_FILTER_CONFIG, EDUCATION_LEVELS } from '@/lib/types';
import type { FilterConfig } from '@/lib/types';
import { toast } from 'sonner';
import {
  Settings,
  Save,
  RotateCcw,
  Loader2,
  Plus,
  X,
  Languages,
  GraduationCap,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Shield,
  XCircle,
} from 'lucide-react';

export function FilterConfigPanel() {
  const [config, setConfig] = useState<FilterConfig>(DEFAULT_FILTER_CONFIG);
  const [savedConfig, setSavedConfig] = useState<FilterConfig>(DEFAULT_FILTER_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLanguage, setNewLanguage] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load config from DB on mount
  useEffect(() => {
    fetchFilterConfig()
      .then((data) => {
        setConfig(data);
        setSavedConfig(data);
        setHasChanges(false);
      })
      .catch(() => {
        toast.error('Impossible de charger la configuration');
      })
      .finally(() => setLoading(false));
  }, []);

  // Track changes
  useEffect(() => {
    setHasChanges(JSON.stringify(config) !== JSON.stringify(savedConfig));
  }, [config, savedConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await saveFilterConfig(config);
      setConfig(saved);
      setSavedConfig(saved);
      setHasChanges(false);
      toast.success('Configuration sauvegardée avec succès');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_FILTER_CONFIG);
  }, []);

  // Language management
  const addLanguage = useCallback(() => {
    const lang = newLanguage.trim();
    if (!lang) return;
    if (config.requiredLanguages.some((l) => l.toLowerCase() === lang.toLowerCase())) {
      toast.error('Cette langue est déjà dans la liste');
      return;
    }
    setConfig((prev) => ({
      ...prev,
      requiredLanguages: [...prev.requiredLanguages, lang],
    }));
    setNewLanguage('');
  }, [newLanguage, config.requiredLanguages]);

  const removeLanguage = useCallback((lang: string) => {
    setConfig((prev) => ({
      ...prev,
      requiredLanguages: prev.requiredLanguages.filter((l) => l !== lang),
    }));
  }, []);

  // Skill management
  const addSkill = useCallback(() => {
    const skill = newSkill.trim();
    if (!skill) return;
    if (config.requiredSkills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      toast.error('Cette compétence est déjà dans la liste');
      return;
    }
    setConfig((prev) => ({
      ...prev,
      requiredSkills: [...prev.requiredSkills, skill],
    }));
    setNewSkill('');
  }, [newSkill, config.requiredSkills]);

  const removeSkill = useCallback((skill: string) => {
    setConfig((prev) => ({
      ...prev,
      requiredSkills: prev.requiredSkills.filter((s) => s !== skill),
    }));
  }, []);

  // Toggle filter activation
  const toggleActive = useCallback((checked: boolean) => {
    setConfig((prev) => ({ ...prev, isActive: checked }));
  }, []);

  // Update numeric field with null support
  const updateNumericField = useCallback((field: 'minEducationLevel' | 'minYearsExperience' | 'minNbPositions', value: string) => {
    if (value === '') {
      setConfig((prev) => ({ ...prev, [field]: null }));
    } else {
      const num = field === 'minYearsExperience' ? parseFloat(value) : parseInt(value, 10);
      if (!isNaN(num) && num >= 0) {
        setConfig((prev) => ({ ...prev, [field]: num }));
      }
    }
  }, []);

  // Handle Enter key for language/skill inputs
  const handleLanguageKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLanguage();
    }
  }, [addLanguage]);

  const handleSkillKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSkill();
    }
  }, [addSkill]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        <span className="ml-3 text-slate-500 dark:text-slate-400">Chargement de la configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex items-center justify-center shadow-md">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Configuration</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Filtre éliminatoire pour le pré-screening des CV</p>
          </div>
        </div>
        {hasChanges && (
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/30">
            Modifications non sauvegardées
          </Badge>
        )}
      </div>

      {/* Activation switch */}
      <Card className="border-slate-200 dark:border-slate-700/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {config.isActive ? (
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Filtre éliminatoire</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {config.isActive
                    ? 'Les candidats ne remplissant pas les critères seront rejetés automatiquement'
                    : 'Tous les candidats passeront directement à l\'analyse ML'}
                </p>
              </div>
            </div>
            <Switch
              checked={config.isActive}
              onCheckedChange={toggleActive}
              aria-label="Activer le filtre éliminatoire"
            />
          </div>
        </CardContent>
      </Card>

      {/* Filter criteria — only shown when active */}
      {config.isActive && (
        <>
          {/* Required Languages */}
          <Card className="border-slate-200 dark:border-slate-700/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-blue-500" />
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Langues requises</CardTitle>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Les candidats doivent maîtriser toutes les langues listées
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Language tags */}
              {config.requiredLanguages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {config.requiredLanguages.map((lang) => (
                    <Badge
                      key={lang}
                      className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 pr-1"
                    >
                      <span className="mr-1">{lang}</span>
                      <button
                        onClick={() => removeLanguage(lang)}
                        className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800/50 rounded-full p-0.5 transition-colors"
                        aria-label={`Supprimer ${lang}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {/* Add language input */}
              <div className="flex gap-2">
                <Input
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                  onKeyDown={handleLanguageKeyDown}
                  placeholder="Ex: Français, Anglais, Allemand..."
                  className="flex-1 h-9 text-sm"
                />
                <Button
                  onClick={addLanguage}
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 border-blue-200 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  disabled={!newLanguage.trim()}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Required Skills */}
          <Card className="border-slate-200 dark:border-slate-700/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-violet-500" />
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Compétences requises</CardTitle>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Les candidats doivent posséder toutes les compétences listées
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Skill tags */}
              {config.requiredSkills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {config.requiredSkills.map((skill) => (
                    <Badge
                      key={skill}
                      className="bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 pr-1"
                    >
                      <span className="mr-1">{skill}</span>
                      <button
                        onClick={() => removeSkill(skill)}
                        className="ml-1 hover:bg-violet-200 dark:hover:bg-violet-800/50 rounded-full p-0.5 transition-colors"
                        aria-label={`Supprimer ${skill}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {/* Add skill input */}
              <div className="flex gap-2">
                <Input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  placeholder="Ex: Python, SQL, Leadership..."
                  className="flex-1 h-9 text-sm"
                />
                <Button
                  onClick={addSkill}
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 border-violet-200 dark:border-violet-800/30 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/30"
                  disabled={!newSkill.trim()}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Numeric criteria */}
          <Card className="border-slate-200 dark:border-slate-700/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Critères numériques</CardTitle>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Laissez vide pour ne pas appliquer le critère
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Education level */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Niveau d&apos;éducation minimum</Label>
                <Select
                  value={config.minEducationLevel !== null ? String(config.minEducationLevel) : 'none'}
                  onValueChange={(value) => {
                    if (value === 'none') {
                      setConfig((prev) => ({ ...prev, minEducationLevel: null }));
                    } else {
                      setConfig((prev) => ({ ...prev, minEducationLevel: parseInt(value, 10) }));
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Sélectionnez un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune exigence</SelectItem>
                    {Object.entries(EDUCATION_LEVELS).map(([level, label]) => (
                      <SelectItem key={level} value={level}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator className="bg-slate-100 dark:bg-slate-800" />

              {/* Years of experience */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Années d&apos;expérience minimum</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={config.minYearsExperience !== null ? config.minYearsExperience : ''}
                    onChange={(e) => updateNumericField('minYearsExperience', e.target.value)}
                    placeholder="Ex: 2"
                    className="h-9 text-sm w-32"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">année(s)</span>
                </div>
              </div>

              <Separator className="bg-slate-100 dark:bg-slate-800" />

              {/* Minimum positions */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nombre minimum de postes</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={config.minNbPositions !== null ? config.minNbPositions : ''}
                    onChange={(e) => updateNumericField('minNbPositions', e.target.value)}
                    placeholder="Ex: 1"
                    className="h-9 text-sm w-32"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">poste(s)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info banner */}
          <div className="p-4 bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium">Comment ça fonctionne</p>
                <p className="mt-1 text-blue-600 dark:text-blue-400">
                  Le filtre éliminatoire s&apos;applique <strong>avant</strong> l&apos;analyse ML. Un candidat qui ne remplit pas 
                  un seul critère sera automatiquement rejeté, sans passer par le modèle. Les critères vides ne sont pas vérifiés.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Inactive info */}
      {!config.isActive && (
        <div className="p-4 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-700 dark:text-amber-300">
              <p className="font-medium">Filtre désactivé</p>
              <p className="mt-1 text-amber-600 dark:text-amber-400">
                Tous les candidats passeront directement à l&apos;analyse ML sans filtrage préalable.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <Button
          onClick={handleReset}
          variant="outline"
          size="sm"
          className="text-slate-600 dark:text-slate-400"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Réinitialiser
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sauvegarde...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Sauvegarder
            </>
          )}
        </Button>
      </div>

      {/* Saved indicator */}
      {!hasChanges && savedConfig.isActive && (
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 pb-4">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Dernière sauvegarde : {savedConfig.updatedAt ? new Date(savedConfig.updatedAt).toLocaleString('fr-FR') : 'jamais'}</span>
        </div>
      )}
    </div>
  );
}
