// LuxTalent V2 - API Client
// Tries Flask API first (localhost:8000), falls back to Next.js mock API routes

import type {
  HealthResponse,
  PredictionResponse,
  FairnessMetricsResponse,
  ProcessedFilesResponse,
  ScreeningLogEntry,
  ProcessInboxResponse,
  ParseResponse,
} from './types';

const FLASK_API_URL = 'http://localhost:8000';

async function fetchWithFallback<T>(flaskPath: string, mockPath: string, options?: RequestInit): Promise<T> {
  try {
    // Try Flask API first
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${FLASK_API_URL}${flaskPath}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      return res.json();
    }
    throw new Error('Flask API error');
  } catch {
    // Fall back to Next.js mock API
    const res = await fetch(mockPath, options);
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json();
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchWithFallback<HealthResponse>('/health', '/api/health');
}

export async function predictCV(cvText: string): Promise<PredictionResponse> {
  return fetchWithFallback<PredictionResponse>('/predict', '/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cv_text: cvText }),
  });
}

export async function explainCandidate(cvText: string): Promise<PredictionResponse> {
  return fetchWithFallback<PredictionResponse>('/explain', '/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cv_text: cvText }),
  });
}

export async function parseCV(cvText: string): Promise<ParseResponse> {
  return fetchWithFallback<ParseResponse>('/parse', '/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cv_text: cvText }),
  });
}

export async function processInbox(): Promise<ProcessInboxResponse> {
  return fetchWithFallback<ProcessInboxResponse>('/process-inbox', '/api/process-inbox', {
    method: 'POST',
  });
}

export async function fetchProcessedFiles(): Promise<ProcessedFilesResponse> {
  return fetchWithFallback<ProcessedFilesResponse>('/processed-files', '/api/processed-files');
}

export async function deleteProcessedFile(filename: string): Promise<{ success: boolean }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${FLASK_API_URL}/processed-files/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) return res.json();
    throw new Error('Flask API error');
  } catch {
    const res = await fetch(`/api/processed-files?file=${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    return res.json();
  }
}

export async function fetchFairnessMetrics(): Promise<FairnessMetricsResponse> {
  return fetchWithFallback<FairnessMetricsResponse>('/fairness-metrics', '/api/fairness-metrics');
}

export async function fetchScreeningLog(): Promise<ScreeningLogEntry[]> {
  return fetchWithFallback<ScreeningLogEntry[]>('/screening-log', '/api/screening-log');
}
