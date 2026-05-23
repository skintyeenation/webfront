import { API_BASE } from 'lookup/config';
import type { JobOptions, ProgressEvent, SourceMeta, Mode } from 'lookup/models';

export interface SourcesResponse {
  items: SourceMeta[];
  defaults?: string[];
}

export async function getSources(mode?: Mode, indigenousOnly?: boolean): Promise<SourcesResponse> {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  if (indigenousOnly) params.set('indigenousOnly', '1');
  const res = await fetch(`${API_BASE}/api/sources${params.toString() ? `?${params}` : ''}`);
  if (!res.ok) throw new Error(`GET /api/sources → ${res.status}`);
  return res.json();
}

export interface RunResponse {
  jobId: string;
  sourceIds: string[];
}

export async function startRun(opts: JobOptions): Promise<RunResponse> {
  const res = await fetch(`${API_BASE}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`POST /api/run → ${res.status}`);
  return res.json();
}

export interface JobSourceResult {
  items: Array<{
    title: string;
    subtitle?: string;
    url?: string;
    snippet?: string;
    fields?: Record<string, string | number | boolean>;
  }>;
  searchUrl: string;
  notes?: string[];
  warnings?: string[];
}

export interface JobStateResponse {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt: number;
  events: ProgressEvent[];
  result?: {
    reportPath: string;
    durationMs: number;
    /** Per-source-id results map. `error` shape for failed sources. */
    results: Record<string, JobSourceResult | { error: string; searchUrl: string }>;
  };
}

export async function getJob(jobId: string): Promise<JobStateResponse> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId} → ${res.status}`);
  return res.json();
}

/**
 * Stream a job's progress events. Returns a cleanup function. On platforms
 * without EventSource (older RN), falls back to polling.
 */
export function streamJob(jobId: string, onEvent: (e: ProgressEvent) => void): () => void {
  const url = `${API_BASE}/api/jobs/${jobId}/stream`;
  // Web (and react-native-web) has EventSource. Native RN does not — poll there.
  if (typeof globalThis.EventSource !== 'undefined') {
    const es = new (globalThis as any).EventSource(url);
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse((e as any).data) as ProgressEvent;
        onEvent(data);
        if (data.type === 'job-done') es.close();
      } catch {}
    };
    // Subscribe to the named events the server emits.
    ['job-start', 'source-start', 'source-done', 'source-error', 'job-done', 'log'].forEach((t) =>
      es.addEventListener(t, handler),
    );
    return () => es.close();
  }
  // Fallback: poll /api/jobs/:id every 800ms and replay new events.
  let stopped = false;
  let lastIndex = 0;
  const tick = async () => {
    if (stopped) return;
    try {
      const state = await getJob(jobId);
      for (const e of state.events.slice(lastIndex)) onEvent(e);
      lastIndex = state.events.length;
      if (state.status === 'done' || state.status === 'failed') return;
    } catch {}
    setTimeout(tick, 800);
  };
  void tick();
  return () => {
    stopped = true;
  };
}

export async function getReportMarkdown(jobId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/report`);
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId}/report → ${res.status}`);
  return res.text();
}

export interface BandDetail {
  bandNumber: string;
  general?: {
    officialName?: string;
    address?: string;
    postalCode?: string;
    phone?: string;
    fax?: string;
    [k: string]: string | undefined;
  };
  governance?: { rows: Array<{ role?: string; name?: string; term?: string }> };
  reserves?: { rows: Array<{ name?: string; size?: string; community?: string; url?: string }> };
  population?: {
    rows: Array<{ label: string; count: number }>;
    total: number;
    asOf?: string;
    summary: {
      onReserve: number;
      offReserve: number;
      onOtherReserve: number;
      onCrownLand: number;
      male: number;
      female: number;
    };
  };
  funds?: { rows: Array<{ fiscalYear: string; documentName: string; documentUrl?: string }> };
  fnfta?: { searchUrl: string };
  errors?: Record<string, string>;
  cached?: boolean;
  fetchedAt?: string;
  stale?: boolean;
  warning?: string;
}

export async function getNationDetail(bandNumber: string, refresh = false): Promise<BandDetail> {
  const sp = new URLSearchParams();
  if (refresh) sp.set('refresh', '1');
  const res = await fetch(`${API_BASE}/api/nations/${bandNumber}${sp.toString() ? `?${sp}` : ''}`);
  if (!res.ok) throw new Error(`GET /api/nations/${bandNumber} → ${res.status}`);
  return res.json();
}
