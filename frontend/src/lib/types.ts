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

export interface BatchResult {
  filename: string;
  name: string;
  target_role: string;
  label: 'Invite' | 'Reject';
  confidence: number;
  error?: string;
}

export interface ProcessInboxResponse {
  total: number;
  invited: number;
  rejected: number;
  errors: number;
  results: BatchResult[];
}

export interface ProcessedFilesResponse {
  count: number;
  files: string[];
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
}

export interface HardFilterConfig {
  required_languages: string[];
  required_skills: string[];
  min_education_level: number;
  min_years_experience: number;
  min_positions: number;
}

export type SectionGroup = 'rh' | 'tech';

export type SectionId =
  | 'rh-dashboard'
  | 'batch-processor'
  | 'screening-log'
  | 'tech-dashboard'
  | 'fairness-audit'
  | 'advanced-logs'
  | 'processed-files'
  | 'configuration';
