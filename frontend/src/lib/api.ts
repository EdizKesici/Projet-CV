// LuxTalent V2 - API Client
// Connects directly to Flask API. No mock fallback in production.
// Mock data is only used by the Next.js API routes when NEXT_PUBLIC_USE_MOCK=true

import type {
  HealthResponse,
  PredictionResponse,
  FairnessMetricsResponse,
  ScreeningLogEntry,
} from './types';

// In Docker: NEXT_PUBLIC_FLASK_API_URL=/flask-api (proxied by Next.js rewrites)
// Locally:   defaults to http://localhost:8000
const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:8000';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (USE_MOCK) {
    // In development with mock mode, use Next.js API routes (/api prefix)
    const res = await fetch(`/api${path}`, options);
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json();
  }

  // Production: connect to Flask API (directly or through Next.js rewrites)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${FLASK_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`Flask API error: ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Le service d\'analyse est indisponible. Veuillez réessayer plus tard ou contacter l\'équipe technique.');
    }
    if (err instanceof TypeError) {
      throw new Error('Le service d\'analyse est indisponible. Veuillez contacter l\'équipe technique.');
    }
    throw err;
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}

export async function predictCV(cvText: string, filename: string): Promise<PredictionResponse> {
  return apiFetch<PredictionResponse>('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cvText, filename }),
  });
}

export async function fetchFairnessMetrics(): Promise<FairnessMetricsResponse> {
  return apiFetch<FairnessMetricsResponse>('/fairness-metrics');
}

export async function fetchScreeningLog(): Promise<ScreeningLogEntry[]> {
  return apiFetch<ScreeningLogEntry[]>('/screening-log');
}

// Save analysis to database (always uses Next.js API route)
export async function saveAnalysis(prediction: PredictionResponse, filename: string): Promise<unknown> {
  const res = await fetch('/api/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidateName: prediction.name,
      targetRole: prediction.target_role,
      filename,
      stage: prediction.stage,
      label: prediction.label,
      confidence: prediction.confidence,
      modelName: prediction.model_name,
      fairnessAdjusted: prediction.fairness_adjusted,
      topDriver: prediction.explanation?.top_features?.[0]?.[0]
        ? `${prediction.explanation.top_features[0][0]} (${prediction.explanation.top_features[0][1] > 0 ? '+' : ''}${prediction.explanation.top_features[0][1].toFixed(2)})`
        : 'N/A',
      reasons: prediction.hard_filter_reasons?.join('; ') || '',
      probabilitiesInvite: prediction.probabilities.Invite,
      probabilitiesReject: prediction.probabilities.Reject,
      shapValues: prediction.explanation?.shap_values || {},
      features: prediction.features || {},
      hardFilterReasons: prediction.hard_filter_reasons || [],
      decisionDrivers: prediction.explanation?.decision_drivers || '',
      version: prediction.version,
    }),
  });
  if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
  return res.json();
}

// DB analysis record type
export interface DbAnalysisRecord {
  id: string;
  candidateName: string;
  targetRole: string;
  filename: string;
  stage: string;
  label: string;
  confidence: number;
  modelName: string;
  fairnessAdjusted: boolean;
  topDriver: string;
  reasons: string;
  probabilitiesInvite: number;
  probabilitiesReject: number;
  shapValues: string;
  features: string;
  hardFilterReasons: string;
  decisionDrivers: string;
  version: string;
  createdAt: string;
}

// Fetch saved analyses from database (always uses Next.js API route)
export async function fetchSavedAnalyses(): Promise<DbAnalysisRecord[]> {
  try {
    const res = await fetch('/api/analyses');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
