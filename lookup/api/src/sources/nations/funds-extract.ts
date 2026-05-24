/**
 * For each federal-funding PDF on a Nation's Schedule of Federal Funding
 * page, mark its OCR status — done (cache hit), pending (job enqueued for
 * the background worker), or disabled (no Anthropic key set). The actual
 * OCR is no longer done on the band-detail request path; it's enqueued and
 * picked up serially by the background worker, so a fresh band detail
 * returns in seconds even when there are 5+ PDFs.
 *
 * Set `ANTHROPIC_API_KEY` in `lookup/.env` (gitignored) to enable OCR.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ExtractedFunding } from '../../util/anthropic.js';
import { BUCKETS, get as storeGet } from '../../util/store.js';
import { enqueue, findByKey } from '../../util/queue.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Best-effort .env load — keeps the API key out of the shell when running CLI.
// Try `lookup/.env` (workspace root, recommended) and `lookup/api/.env`
// (package-local fallback). This file lives at lookup/api/src/sources/nations
// so the relative paths are 4-up + 3-up respectively.
try {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', '.env'), // lookup/.env
    join(__dirname, '..', '..', '..', '.env'), // lookup/api/.env
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      let v = raw.trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
} catch {}

export type ExtractStatus = 'done' | 'cached' | 'pending' | 'running' | 'failed' | 'disabled';

export interface FundsRowWithExtract {
  fiscalYear: string;
  documentName: string;
  documentUrl?: string;
  extracted?: ExtractedFunding;
  extractStatus: ExtractStatus;
  /** Job id if pending/running/failed; lets the UI poll for updates. */
  jobId?: string;
  /** Last attempt count if a job exists. */
  attempts?: number;
  /** Last error message if status === 'failed'. */
  extractError?: string;
}

const FUNDS_BUCKET = 'nations-funds';

function cacheKey(bandNumber: string, fiscalYear: string): string {
  return `${bandNumber}_${fiscalYear}`;
}

/**
 * For each fiscal-year PDF row, attach a status describing whether OCR has
 * completed, is queued, or is disabled. **Never** runs OCR synchronously —
 * jobs are pushed to the worker queue for background processing.
 */
export function describeFundsRows(
  bandNumber: string,
  bandName: string | undefined,
  rows: Array<{ fiscalYear: string; documentName: string; documentUrl?: string }>,
): FundsRowWithExtract[] {
  const enabled = !!process.env.ANTHROPIC_API_KEY;
  return rows.map((r) => {
    const base: FundsRowWithExtract = { ...r, extractStatus: 'disabled' };
    const cached = storeGet<ExtractedFunding>(FUNDS_BUCKET, cacheKey(bandNumber, r.fiscalYear));
    if (cached) {
      return { ...base, extracted: cached.data, extractStatus: 'cached' };
    }
    if (!r.documentUrl) {
      return { ...base, extractStatus: 'disabled', extractError: 'No PDF URL on the source row.' };
    }
    if (!enabled) {
      return { ...base, extractStatus: 'disabled', extractError: 'ANTHROPIC_API_KEY not set — see lookup/api/README.md.' };
    }
    // Check the queue — if a job already exists for this (band, fy), reuse
    // its id. Otherwise enqueue a fresh one.
    const key = cacheKey(bandNumber, r.fiscalYear);
    const existing = findByKey('pdf-ocr', key);
    if (existing) {
      return {
        ...base,
        extractStatus:
          existing.status === 'done'
            ? 'done'
            : existing.status === 'failed'
              ? 'failed'
              : existing.status === 'running'
                ? 'running'
                : 'pending',
        jobId: existing.id,
        attempts: existing.attempts,
        extractError: existing.status === 'failed' ? existing.error : undefined,
      };
    }
    const job = enqueue('pdf-ocr', key, {
      documentUrl: r.documentUrl,
      bandNumber,
      bandName,
      fiscalYear: r.fiscalYear,
    });
    return { ...base, extractStatus: 'pending', jobId: job.id, attempts: job.attempts };
  });
}

export function summarizeFunds(extracted: FundsRowWithExtract[]): {
  byYear: Array<{ fiscalYear: string; total: number; count: number }>;
  byDepartment: Array<{ department: string; total: number; count: number }>;
  byProgram: Array<{ program: string; total: number; count: number }>;
} {
  const yearMap = new Map<string, { total: number; count: number }>();
  const deptMap = new Map<string, { total: number; count: number }>();
  const progMap = new Map<string, { total: number; count: number }>();
  for (const row of extracted) {
    if (!row.extracted) continue;
    const fy = row.fiscalYear;
    for (const t of row.extracted.transfers) {
      const amt = Number(t.amount) || 0;
      if (!amt) continue;
      const y = yearMap.get(fy) ?? { total: 0, count: 0 };
      y.total += amt;
      y.count += 1;
      yearMap.set(fy, y);
      const dept = (t.department || 'Unknown').trim() || 'Unknown';
      const d = deptMap.get(dept) ?? { total: 0, count: 0 };
      d.total += amt;
      d.count += 1;
      deptMap.set(dept, d);
      const prog = (t.program || 'Unspecified').trim() || 'Unspecified';
      const p = progMap.get(prog) ?? { total: 0, count: 0 };
      p.total += amt;
      p.count += 1;
      progMap.set(prog, p);
    }
  }
  return {
    byYear: [...yearMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fiscalYear, v]) => ({ fiscalYear, ...v })),
    byDepartment: [...deptMap.entries()].sort((a, b) => b[1].total - a[1].total).map(([department, v]) => ({ department, ...v })),
    byProgram: [...progMap.entries()].sort((a, b) => b[1].total - a[1].total).map(([program, v]) => ({ program, ...v })),
  };
}
