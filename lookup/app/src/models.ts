export type Mode = 'business' | 'money';

export interface SourceMeta {
  id: string;
  name: string;
  mode: Mode;
  format: 'json-api' | 'html-search' | 'ckan' | 'csv-bulk' | 'link-only';
  category: string;
  homepage: string;
  description: string;
  scrapable: boolean;
  indigenousFilter: 'inherent' | 'flag' | 'org-filter' | 'keyword-or' | 'none';
  autoSelectOnIndigenous: boolean;
  requiresAuth: 'api-key' | 'paid' | false;
}

export interface SourceItem {
  title: string;
  subtitle?: string;
  url?: string;
  snippet?: string;
  fields?: Record<string, string | number | boolean>;
}

export interface ScrapeResult {
  items: SourceItem[];
  searchUrl: string;
  notes?: string[];
  warnings?: string[];
}

export interface JobOptions {
  mode: Mode;
  target: string;
  sourceIds: string[];
  indigenousOnly: boolean;
  website?: string;
  vendor?: string;
  fromYear?: number;
  toYear?: number;
  minValue?: number;
  maxValue?: number;
}

export type ProgressEvent =
  | { type: 'job-start'; jobId: string; mode: Mode; target: string; sources: string[]; indigenousOnly: boolean }
  | { type: 'source-start'; sourceId: string; sourceName: string }
  | { type: 'source-done'; sourceId: string; count: number; searchUrl: string; warnings?: string[] }
  | { type: 'source-error'; sourceId: string; error: string }
  | { type: 'job-done'; jobId: string; reportPath: string; durationMs: number }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export interface JobState {
  id: string;
  options: JobOptions;
  events: ProgressEvent[];
  status: 'pending' | 'running' | 'done' | 'failed';
  reportPath?: string;
  durationMs?: number;
  /** Per-source last status (start/done/error). */
  perSource: Record<string, { status: 'idle' | 'running' | 'done' | 'error'; count?: number; error?: string; searchUrl?: string }>;
}

export interface HistoryEntry {
  jobId: string;
  startedAt: number;
  mode: Mode;
  target: string;
  indigenousOnly: boolean;
  reportPath?: string;
  sourceCount: number;
  status: 'done' | 'failed' | 'running';
}
