/**
 * Fetch federal Grants & Contributions records that match a Nation (by name)
 * — gives a second, independent source of band-level transfer payments to
 * cross-check against the OCR'd Schedule of Federal Funding PDFs.
 *
 * Uses the existing search.open.canada.ca/grants HTML scrape under the hood.
 */

import { openCanadaGrants } from '../money/open-canada-grants.js';
import type { SourceItem } from '../../types.js';

export interface FederalGrant {
  recipient: string;
  agreementValue?: number;
  fiscalYear?: string;
  agreementStart?: string;
  agreementEnd?: string;
  department?: string;
  description?: string;
  url?: string;
}

export interface FederalFundingHistory {
  recipientNameSearched: string;
  totalRecords: number;
  byYear: Array<{ fiscalYear: string; total: number; count: number }>;
  byDepartment: Array<{ department: string; total: number; count: number }>;
  records: FederalGrant[];
}

/**
 * Pull federal grant disclosures that mention the band by name. Limited to a
 * single first page on purpose (the HTML search is slow at scale; the goal
 * is a directional cross-check, not exhaustive historical reconciliation).
 */
export async function fetchFederalFunding(bandName: string): Promise<FederalFundingHistory> {
  let items: SourceItem[] = [];
  try {
    const res = await openCanadaGrants.scrape!(bandName, { indigenousOnly: false });
    items = res.items;
  } catch {
    items = [];
  }
  // The grants search keyword-matches across all fields, so a query like
  // "Skin Tyee" returns the most-recent grants regardless of recipient. Strict
  // post-filter: keep only records whose recipient (title) actually contains
  // the band name. Drops a lot of false-positives but keeps the comparison
  // meaningful.
  const needle = bandName.toLowerCase();
  const filteredItems = items.filter((it) => (it.title || '').toLowerCase().includes(needle));
  const records: FederalGrant[] = filteredItems.map((it) => parseGrant(it));
  const yearMap = new Map<string, { total: number; count: number }>();
  const deptMap = new Map<string, { total: number; count: number }>();
  for (const r of records) {
    const fy = r.fiscalYear || (r.agreementStart ? fiscalYearOf(r.agreementStart) : '');
    if (fy && r.agreementValue) {
      const y = yearMap.get(fy) ?? { total: 0, count: 0 };
      y.total += r.agreementValue;
      y.count += 1;
      yearMap.set(fy, y);
    }
    const dept = r.department || 'Unknown';
    if (r.agreementValue) {
      const d = deptMap.get(dept) ?? { total: 0, count: 0 };
      d.total += r.agreementValue;
      d.count += 1;
      deptMap.set(dept, d);
    }
  }
  return {
    recipientNameSearched: bandName,
    totalRecords: records.length,
    records,
    byYear: [...yearMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fiscalYear, v]) => ({ fiscalYear, ...v })),
    byDepartment: [...deptMap.entries()].sort((a, b) => b[1].total - a[1].total).map(([department, v]) => ({ department, ...v })),
  };
}

const VAL_RE = /\$\s*([0-9][\d,]*\.?\d*)/;
const DATE_RE = /from\s+([A-Z][a-z]+ \d{1,2}, \d{4})/;
const TO_RE = /to\s+([A-Z][a-z]+ \d{1,2}, \d{4})/;
const DEPT_RE = /Organization:\s*([^·]+?)(?:·|$)/;

function parseGrant(it: SourceItem): FederalGrant {
  const text = `${it.subtitle || ''} ${it.snippet || ''}`;
  const v = text.match(VAL_RE);
  const start = text.match(DATE_RE);
  const end = text.match(TO_RE);
  const dept = text.match(DEPT_RE);
  const value = v ? Number(v[1].replace(/,/g, '')) : undefined;
  return {
    recipient: it.title,
    url: it.url,
    agreementValue: value,
    agreementStart: start ? start[1] : undefined,
    agreementEnd: end ? end[1] : undefined,
    fiscalYear: start ? fiscalYearOf(start[1]) : undefined,
    department: dept ? dept[1].trim() : undefined,
    description: it.snippet?.slice(0, 240),
  };
}

function fiscalYearOf(dateStr: string): string {
  // Canadian federal fiscal year: April 1 – March 31. April→Dec belongs to YYYY-(YYYY+1).
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth(); // 0-based
  const y = d.getFullYear();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export interface FundingComparison {
  byYear: Array<{
    fiscalYear: string;
    pdfTotal?: number;
    federalTotal?: number;
    delta?: number;
    deltaPct?: number;
  }>;
}

export function compareFundingSources(
  pdfByYear: Array<{ fiscalYear: string; total: number }>,
  federalByYear: Array<{ fiscalYear: string; total: number }>,
): FundingComparison {
  const pdfMap = new Map(pdfByYear.map((r) => [r.fiscalYear, r.total]));
  const fedMap = new Map(federalByYear.map((r) => [r.fiscalYear, r.total]));
  const years = new Set<string>([...pdfMap.keys(), ...fedMap.keys()]);
  const byYear = [...years]
    .sort()
    .map((fiscalYear) => {
      const p = pdfMap.get(fiscalYear);
      const f = fedMap.get(fiscalYear);
      const delta = p !== undefined && f !== undefined ? p - f : undefined;
      const denom = p && f ? Math.max(p, f) : 0;
      const deltaPct = delta !== undefined && denom ? (delta / denom) * 100 : undefined;
      return { fiscalYear, pdfTotal: p, federalTotal: f, delta, deltaPct };
    });
  return { byYear };
}
