import type {
  UploadMediaResponse,
  CreateJobRequest,
  CreateJobResponse,
  PollJobStatusResponse,
  RetrieveAssetsResponse,
  TrendQuery,
  TrendAnalysisResult,
} from '@content-storyteller/shared';

const API_URL = import.meta.env.VITE_API_URL || '';

export async function uploadFiles(files: File[]): Promise<UploadMediaResponse[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_URL}/api/v1/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Upload failed: ${res.status}`);
  }

  const data = await res.json();
  return data.uploads as UploadMediaResponse[];
}

export async function createJob(req: CreateJobRequest): Promise<CreateJobResponse> {
  const res = await fetch(`${API_URL}/api/v1/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Job creation failed: ${res.status}`);
  }

  return res.json();
}

export async function pollJob(jobId: string): Promise<PollJobStatusResponse> {
  const res = await fetch(`${API_URL}/api/v1/jobs/${encodeURIComponent(jobId)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Poll failed: ${res.status}`);
  }

  return res.json();
}

export async function getAssets(jobId: string): Promise<RetrieveAssetsResponse> {
  const res = await fetch(`${API_URL}/api/v1/jobs/${encodeURIComponent(jobId)}/assets`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Get assets failed: ${res.status}`);
  }

  return res.json();
}

export function createSSEConnection(jobId: string): EventSource {
  return new EventSource(`${API_URL}/api/v1/jobs/${encodeURIComponent(jobId)}/stream`);
}

/* ── Live Agent Mode API ─────────────────────────────────────── */

import type {
  StartLiveSessionResponse,
  LiveInputResponse,
  StopLiveSessionResponse,
} from '@content-storyteller/shared';

export async function startLiveSession(): Promise<StartLiveSessionResponse> {
  const res = await fetch(`${API_URL}/api/v1/live/start`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Start session failed: ${res.status}`);
  }
  return res.json();
}

export async function sendLiveInput(sessionId: string, text: string): Promise<LiveInputResponse> {
  const res = await fetch(`${API_URL}/api/v1/live/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Send input failed: ${res.status}`);
  }
  return res.json();
}

export async function stopLiveSession(sessionId: string): Promise<StopLiveSessionResponse> {
  const res = await fetch(`${API_URL}/api/v1/live/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Stop session failed: ${res.status}`);
  }
  return res.json();
}

/* ── Trend Analyzer API ──────────────────────────────────────── */

export async function analyzeTrends(query: TrendQuery): Promise<TrendAnalysisResult> {
  const res = await fetch(`${API_URL}/api/v1/trends/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Trend analysis failed: ${res.status}`);
  }
  return res.json();
}

export async function getTrendResult(queryId: string): Promise<TrendAnalysisResult> {
  const res = await fetch(`${API_URL}/api/v1/trends/${encodeURIComponent(queryId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Get trend result failed: ${res.status}`);
  }
  return res.json();
}
