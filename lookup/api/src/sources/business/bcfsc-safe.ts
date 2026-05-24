/**
 * BCFSC SAFE Companies — list of BC Forest Safety Council SAFE-certified
 * forestry contractors. Published as a single text-layer PDF (the BCFSC
 * homepage links to it):
 *
 *   https://www.bcforestsafe.org/wp-content/uploads/2021/04/SAFE_Certified_Companies.pdf
 *
 * (Despite the 2021 path, the file itself is updated regularly — header
 * line reads "SAFE List - Updated <date>".)
 *
 * We download the PDF once, extract the text with `pdftotext` (the macOS
 * Homebrew binary), parse each row into legal-name + trade-name + cert
 * number + status + expiry, and cache the parsed list for 24h. Each
 * scrape request filters the cached rows by the user's query.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { BUCKETS, ageMs, get as storeGet, put as storePut } from '../../util/store.js';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCH = join(__dirname, '..', '..', '..', 'data', 'scratch');

const PDF_URL = 'https://www.bcforestsafe.org/wp-content/uploads/2021/04/SAFE_Certified_Companies.pdf';
const BCFSC_BUCKET = 'bcfsc-safe';

export interface BcfscRow {
  legalName: string;
  tradeName?: string;
  conditions?: string;     // free-text flags (often empty)
  auditType?: string;      // "BASE" / "SEBASE" / "ISEBASE" / "IOO" — the SAFE program level
  certificate?: string;
  expires?: string;        // YYYY-MM-DD
  city?: string;
}

interface BcfscCache {
  updatedLine?: string;
  rows: BcfscRow[];
}

async function fetchAndParse(): Promise<BcfscCache> {
  if (!existsSync(SCRATCH)) mkdirSync(SCRATCH, { recursive: true });
  const pdfPath = join(SCRATCH, 'safe.pdf');
  await fetchBinary(PDF_URL, pdfPath);
  // pdftotext from poppler — installed via Homebrew on macOS. Layout mode
  // keeps column alignment so we can split rows reliably.
  let text = '';
  try {
    const r = await execFileP('pdftotext', ['-layout', pdfPath, '-']);
    text = r.stdout;
  } catch {
    // Fallback to plain mode if -layout isn't supported.
    const r = await execFileP('pdftotext', [pdfPath, '-']);
    text = r.stdout;
  }
  return parseBcfscText(text);
}

async function fetchBinary(url: string, outPath: string): Promise<void> {
  // The bcforestsafe Apache cert chain is missing an intermediate that
  // Node's bundled CA bundle doesn't fill in (curl does, via the system
  // store). Shelling out to curl sidesteps the TLS-chain mismatch and is
  // also less work — we write the PDF straight to disk for pdftotext.
  await execFileP('curl', [
    '-sLfo',
    outPath,
    '-A',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    url,
  ]);
}

/**
 * Parse the layout-preserving pdftotext output. The table has 7 columns:
 *
 *   Company Legal Name | Trade Name | Conditions | Audit Type | Certificate | Expires | City
 *
 * Column widths vary by row, so we right-anchor: find Expires (YYYY-MM-DD),
 * then work backwards (city is to the right of expires; certificate +
 * audit-type + conditions to the left; everything before that is
 * legal-name + trade-name split on a run of 2+ spaces).
 */
export function parseBcfscText(text: string): BcfscCache {
  const updatedMatch = text.match(/SAFE List\s*-\s*Updated\s*([^\n]+)/i);
  const updatedLine = updatedMatch ? updatedMatch[1].trim() : undefined;
  const rows: BcfscRow[] = [];
  const lines = text.split(/\r?\n/);
  const expiresRe = /(\d{4}-\d{2}-\d{2})/;
  const auditRe = /\b(SEBASE|ISEBASE|BASE|IOO|SEFR|FR|ISE|IS|SE)\b/;
  for (const raw of lines) {
    const line = raw.replace(/\f/g, '');
    if (!line.trim()) continue;
    if (/Company Legal Name/i.test(line)) continue;
    if (/^SAFE List/i.test(line.trim())) continue;
    if (/^Page \d+/i.test(line.trim())) continue;
    if (/^Certificate number/i.test(line.trim())) continue;
    if (/^SAFE Companies/i.test(line.trim())) continue;
    if (/^are listed/i.test(line.trim())) continue;
    const m = expiresRe.exec(line);
    if (!m) continue; // every data row carries a YYYY-MM-DD; no date → skip
    const expires = m[1];
    const before = line.slice(0, m.index).trimEnd();
    const after = line.slice(m.index + expires.length).trimStart();
    // Pull the certificate (run of digits/letters at end of `before`).
    const certMatch = before.match(/([A-Za-z0-9]+)\s*$/);
    const certificate = certMatch ? certMatch[1] : '';
    const beforeCert = certMatch ? before.slice(0, certMatch.index).trimEnd() : before;
    // Pull the audit type from the end (BASE / SEBASE / ISEBASE / IOO etc.).
    const auditMatch = beforeCert.match(/(SEBASE|ISEBASE|BASE|IOO|SEFR|FR|ISE|IS|SE)\s*$/);
    const auditType = auditMatch ? auditMatch[1] : '';
    const beforeAudit = auditMatch ? beforeCert.slice(0, auditMatch.index).trimEnd() : beforeCert;
    // Whatever's left in `beforeAudit` is "Legal name [whitespace>=2] Trade name [whitespace>=2] Conditions(optional)".
    const segments = beforeAudit.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    const legalName = segments[0] || '';
    let tradeName: string | undefined;
    let conditions: string | undefined;
    if (segments.length >= 3) {
      tradeName = segments[1];
      conditions = segments.slice(2).join(' ');
    } else if (segments.length === 2) {
      tradeName = segments[1];
    }
    const city = after.trim() || undefined;
    if (!legalName || legalName.length < 2) continue;
    // Audit-type leakage check: sometimes "BASE/SEBASE" sit on their own
    // line as a header — if our row has no legal-name-looking content, skip.
    if (auditRe.test(legalName) && legalName.length < 8) continue;
    rows.push({
      legalName,
      tradeName,
      conditions: conditions || undefined,
      auditType: auditType || undefined,
      certificate: certificate || undefined,
      expires,
      city,
    });
  }
  return { updatedLine, rows };
}

async function ensureCache(forceRefresh = false): Promise<BcfscCache> {
  const cached = storeGet<BcfscCache>(BUCKETS.bcfscSafe, 'all');
  if (cached && !forceRefresh && ageMs(cached) < 24 * 60 * 60 * 1000) {
    return cached.data;
  }
  try {
    const fresh = await fetchAndParse();
    storePut(BUCKETS.bcfscSafe, 'all', fresh);
    return fresh;
  } catch (err) {
    if (cached) return cached.data; // serve stale rather than fail
    throw err;
  }
}

const buildHumanUrl = (q: string): string =>
  q.trim()
    ? `https://www.bcforestsafe.org/?s=${encodeURIComponent(q)}`
    : 'https://www.bcforestsafe.org/safe-companies/safe-program/safe-companies-list/';

export const bcfsc: Source = {
  id: 'bcfsc-safe',
  name: 'BCFSC SAFE Companies',
  mode: 'business',
  format: 'csv-bulk',
  category: 'Safety / certification',
  homepage: 'https://www.bcforestsafe.org/safe-companies/safe-program/safe-companies-list/',
  indigenousFilter: 'none',
  description:
    'BC Forest Safety Council SAFE-certified forestry contractors — parsed from the SAFE_Certified_Companies.pdf (text-layer PDF, ~530 KB, refreshed ~weekly by BCFSC). Cached 24h.',
  searchUrl: (q) => buildHumanUrl(q),
  async scrape(q): Promise<ScrapeResult> {
    const cache = await ensureCache(false);
    const needle = q.trim().toLowerCase();
    const matched = needle
      ? cache.rows.filter(
          (r) =>
            r.legalName.toLowerCase().includes(needle) ||
            (r.tradeName || '').toLowerCase().includes(needle) ||
            (r.certificate || '').toLowerCase().includes(needle),
        )
      : cache.rows;
    const items: SourceItem[] = matched.slice(0, 25).map((r) => ({
      title: r.legalName,
      subtitle: r.tradeName && r.tradeName !== r.legalName ? `Trading as ${r.tradeName}` : undefined,
      snippet: [
        r.auditType && `SAFE level ${r.auditType}`,
        r.certificate && `Cert #${r.certificate}`,
        r.expires && `Expires ${r.expires}`,
        r.city,
        r.conditions,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
      fields: {
        ...(r.tradeName ? { trade_name: r.tradeName } : {}),
        ...(r.auditType ? { audit_type: r.auditType } : {}),
        ...(r.certificate ? { certificate: r.certificate } : {}),
        ...(r.expires ? { expires: r.expires } : {}),
        ...(r.city ? { city: r.city } : {}),
        ...(r.conditions ? { conditions: r.conditions } : {}),
      },
    }));
    return {
      items,
      searchUrl: buildHumanUrl(q),
      notes: [
        `BCFSC SAFE list ${cache.updatedLine ? `updated ${cache.updatedLine}` : '(date unknown)'}; ${cache.rows.length} certified companies total; matched ${matched.length}.`,
      ],
    };
  },
};

// Expose the parser separately so tests / scripts can use it.
export { fetchAndParse as fetchBcfscList };
