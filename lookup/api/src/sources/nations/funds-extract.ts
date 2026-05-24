/**
 * For each federal-funding PDF on a Nation's Schedule of Federal Funding
 * page, download it and ask Claude to OCR + extract structured transfer
 * payment rows. Each (band, fiscalYear) result is cached so we only spend
 * tokens once per document.
 *
 * Gated by `ANTHROPIC_API_KEY` — without it, this returns undefined and
 * the band-detail flow proceeds without enriched funding data.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFundingPdf, type ExtractedFunding } from '../../util/anthropic.js';
import { BUCKETS, get as storeGet, put as storePut } from '../../util/store.js';
import { log, fmt } from '../../util/log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Best-effort .env load — keeps the API key out of the shell when running CLI.
try {
  const envPath = join(__dirname, '..', '..', '..', '.env');
  if (existsSync(envPath)) {
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

export interface FundsRowWithExtract {
  fiscalYear: string;
  documentName: string;
  documentUrl?: string;
  extracted?: ExtractedFunding;
  extractError?: string;
  extractCached?: boolean;
}

const FUNDS_BUCKET = 'nations-funds';

function cacheKey(bandNumber: string, fiscalYear: string): string {
  return `${bandNumber}_${fiscalYear}`;
}

export async function extractFundsRows(
  bandNumber: string,
  bandName: string | undefined,
  rows: Array<{ fiscalYear: string; documentName: string; documentUrl?: string }>,
): Promise<FundsRowWithExtract[]> {
  const enabled = !!process.env.ANTHROPIC_API_KEY;
  const out: FundsRowWithExtract[] = [];
  for (const r of rows) {
    const base: FundsRowWithExtract = { ...r };
    if (!r.documentUrl) {
      out.push(base);
      continue;
    }
    const cached = storeGet<ExtractedFunding>(FUNDS_BUCKET, cacheKey(bandNumber, r.fiscalYear));
    if (cached) {
      out.push({ ...base, extracted: cached.data, extractCached: true });
      continue;
    }
    if (!enabled) {
      out.push({ ...base, extractError: 'ANTHROPIC_API_KEY not set — set it in a gitignored .env to enable OCR.' });
      continue;
    }
    try {
      log.info(`${fmt.cyan('▸')} OCRing ${r.documentName} (${r.fiscalYear}) via Claude…`);
      const extracted = await extractFundingPdf({ url: r.documentUrl }, {
        fiscalYear: r.fiscalYear,
        bandNumber,
        bandName,
      });
      if (extracted) {
        storePut(FUNDS_BUCKET, cacheKey(bandNumber, r.fiscalYear), extracted);
        out.push({ ...base, extracted, extractCached: false });
        log.ok(`extracted ${extracted.transfers.length} transfers, total $${extracted.computedTotal.toLocaleString()}`);
      } else {
        out.push({ ...base, extractError: 'Claude returned no parseable JSON.' });
      }
    } catch (err) {
      out.push({ ...base, extractError: (err as Error).message });
    }
  }
  return out;
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
