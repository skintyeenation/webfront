/**
 * Shared types for the @skintyee/lookup tool.
 *
 * A `Source` is one search endpoint we know how to query (or, when we don't,
 * one we emit a clickable search URL for). Each source has a `mode`
 * (business or money) and an optional `scrape` function that performs the
 * automated lookup. Sources without `scrape` are link-only — the report still
 * lists them with a deep search URL the user can click.
 */

export type SourceMode = 'business' | 'money' | 'nations';

export type SourceFormat =
  | 'json-api' // OrgBook BC, CKAN, …
  | 'html-search' // search.open.canada.ca, MERX, MRAS, …
  | 'ckan' // CKAN package_search / datastore_search
  | 'csv-bulk' // bulk dataset download
  | 'link-only'; // we only emit a deep search URL

export type IndigenousFilter =
  | 'inherent' // the source is intrinsically Indigenous (ISC IBD, CCAB, …)
  | 'flag' // a query param flips it (PSIB / CLCAA on contracts, …)
  | 'org-filter' // restrict by funding department (ISC / CIRNAC on grants)
  | 'keyword-or' // OR-in Indigenous keywords to the search text
  | 'none'; // can't filter — cross-reference manually

export interface SourceLookupOpts {
  indigenousOnly: boolean;
  /** Optional company website (business mode) to also scrape if supported. */
  website?: string;
  /** Year range (money mode). */
  fromYear?: number;
  toYear?: number;
  /** Value bounds (money mode). */
  minValue?: number;
  maxValue?: number;
  /** Restrict contract/grant results to a specific recipient name. */
  vendor?: string;
  /** Override for OpenCorporates token (if a source needs it). */
  apiToken?: string;
  /**
   * Nations mode — restrict to a single ISC region. Used by fn-profiles:
   * a leading-only `%` partial match is applied to the name, and the
   * dropdown is set to this region (e.g. `9` = BRITISH COLUMBIA).
   */
  regionId?: string;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export interface SourceItem {
  /** Primary line — usually a company / contract / grant title. */
  title: string;
  /** Optional secondary line — e.g. "BC1234567 · Active". */
  subtitle?: string;
  /** Click-through URL for this specific record. */
  url?: string;
  /** A few lines of human-readable context (status, value, dates, …). */
  snippet?: string;
  /** Arbitrary structured key/value pairs to include in the report. */
  fields?: Record<string, string | number | boolean>;
}

export interface ScrapeResult {
  /** Structured items extracted from the source. */
  items: SourceItem[];
  /** A clickable search URL — useful in the report even when scrape worked. */
  searchUrl: string;
  /** Optional raw payload (HTML / JSON string) to save to disk for review. */
  raw?: { contentType: string; body: string };
  /** Free-form notes about the lookup (rate-limit, fallback used, …). */
  notes?: string[];
  /** Non-fatal warnings or hints — written to the report. */
  warnings?: string[];
}

export interface Source {
  /** Stable id, kebab-case (e.g. `orgbook-bc`). */
  id: string;
  /** Human-readable name. */
  name: string;
  /**
   * Which lookup tab(s) this source belongs to. A single value means the
   * source appears only there; an array surfaces it in every listed mode
   * (e.g. federal grants are useful in both Funding *and* Business — the
   * latter answers "has this vendor received federal grants?").
   */
  mode: SourceMode | SourceMode[];
  format: SourceFormat;
  /** Group heading (matches sections in lookup-endpoints.md). */
  category: string;
  /** Public homepage / landing for human reference. */
  homepage: string;
  /** Always produces a clickable search URL — even when scrape isn't implemented. */
  searchUrl: (q: string, opts: SourceLookupOpts) => string;
  /** Automated scraper — optional. If absent, the source is link-only. */
  scrape?: (q: string, opts: SourceLookupOpts) => Promise<ScrapeResult>;
  /** How (or whether) the Indigenous-only filter applies to this source. */
  indigenousFilter: IndigenousFilter;
  /** Note on auth / cost. */
  requiresAuth?: 'api-key' | 'paid' | false;
  /** One-line description for the picker UI. */
  description: string;
  /** When true, auto-checked if `--indigenous-only` is set. */
  autoSelectOnIndigenous?: boolean;
}

export type ProgressEvent =
  | { type: 'job-start'; jobId: string; mode: SourceMode; target: string; sources: string[]; indigenousOnly: boolean }
  | { type: 'source-start'; sourceId: string; sourceName: string }
  | { type: 'source-done'; sourceId: string; count: number; searchUrl: string; warnings?: string[] }
  | { type: 'source-error'; sourceId: string; error: string }
  | { type: 'job-done'; jobId: string; reportPath: string; durationMs: number }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export interface JobOptions extends SourceLookupOpts {
  mode: SourceMode;
  target: string;
  sourceIds: string[];
  outDir: string;
  fetch?: boolean; // when false, only emit links (no network)
}

export interface JobResult {
  jobId: string;
  reportPath: string;
  results: Record<string, ScrapeResult | { error: string; searchUrl: string }>;
  durationMs: number;
}
