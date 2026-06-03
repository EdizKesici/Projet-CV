// LuxTalent V2 CV Pre-Screening System - TypeScript Types

export interface HealthResponse {
  status: string;
  model_ready: boolean;
  model_name: string;
  fairness_enabled: boolean;
  version: string;
}

export interface ShapExplanation {
  base_value: number;
  shap_values: Record<string, number>;
  top_features: [string, number][];
  decision_drivers: string;
}

export interface PredictionResponse {
  name: string;
  target_role: string;
  stage: string;
  passed: boolean;
  label: 'Invite' | 'Reject';
  confidence: number;
  probabilities: { Invite: number; Reject: number };
  model_name: string;
  fairness_adjusted: boolean;
  version: string;
  features: Record<string, number>;
  explanation: ShapExplanation;
  hard_filter_reasons?: string[];
}

export interface ExplainResponse {
  name: string;
  target_role: string;
  explanation: ShapExplanation;
}

export interface ParseResponse {
  name: string;
  target_role: string;
  features: Record<string, number>;
}

export interface GroupStats {
  n: number;
  invite_rate: number;
  tpr: number;
  fpr: number;
}

export interface FairnessModelMetrics {
  epd: number;
  epd_alert: boolean;
  rid: number;
  rid_alert: boolean;
  delta_tpr: number;
  delta_tpr_alert: boolean;
  group_stats: Record<string, GroupStats>;
}

export interface PerformanceMetrics {
  accuracy: number;
  f1_invite: number;
  f1_reject: number;
  auc?: number;
}

export interface ProxyAnalysisItem {
  feature: string;
  pearson_r: number;
  pearson_pval: number;
  mutual_info: number;
  is_proxy: boolean;
}

export interface FairnessMetricsResponse {
  version: string;
  fairness_constraint: string;
  base_model: FairnessModelMetrics;
  fair_model: FairnessModelMetrics;
  performance_comparison: {
    base: PerformanceMetrics;
    fair: PerformanceMetrics;
  };
  proxy_analysis: ProxyAnalysisItem[];
}

export type CandidateStatus = 'En attente' | 'Entretien planifié' | 'Refusé' | 'Embauché';

export interface ScreeningLogEntry {
  timestamp: string;
  filename: string;
  name: string;
  target_role: string;
  stage: string;
  label: 'Invite' | 'Reject';
  confidence: number;
  model_name: string;
  fairness_adjusted: boolean;
  top_driver: string;
  reasons: string;
  status?: CandidateStatus;
}

export interface FairnessTrendPoint {
  date: string;
  epd: number;
  rid: number;
  delta_tpr: number;
  composite_score: number;
}

export type ExportFormat = 'txt' | 'csv' | 'json' | 'pdf';

export type TabId = 'cv-drop' | 'fairness' | 'configuration';

export interface FilterConfig {
  id?: string;
  name: string;
  requiredLanguages: string[];
  requiredSkills: string[];
  minEducationLevel: number | null;
  minYearsExperience: number | null;
  minNbPositions: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  name: 'default',
  requiredLanguages: [],
  requiredSkills: [],
  minEducationLevel: 2,
  minYearsExperience: 0,
  minNbPositions: 0,
  isActive: true,
};

// French labels for features
export const FEATURE_LABELS: Record<string, string> = {
  age: 'Âge',
  years_experience: "Années d'expérience",
  education_level: "Niveau d'éducation",
  nb_certifications: 'Certifications',
  nb_extra_languages: 'Langues suppl.',
  nb_extra_skills: 'Compétences suppl.',
  has_management_experience: 'Exp. management',
  has_international_experience: 'Exp. internationale',
  gender: 'Genre',
};

export const EDUCATION_LEVELS: Record<number, string> = {
  1: 'Bac',
  2: 'Bac+2/3',
  3: 'Licence',
  4: 'Master',
  5: 'Doctorat',
};

export const SHAP_FEATURE_LABELS: Record<string, string> = {
  Age: 'Âge',
  'Years of Experience': "Années d'expérience",
  'Education Level': "Niveau d'éducation",
  Certifications: 'Certifications',
  'Extra Languages': 'Langues suppl.',
  'Extra Skills': 'Compétences suppl.',
  'Management Experience': 'Exp. management',
  'International Experience': 'Exp. internationale',
};
