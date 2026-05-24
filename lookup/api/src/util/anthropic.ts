/**
 * Anthropic Claude wrapper — used to OCR + structure scanned PDFs from the
 * federal Schedule of Federal Funding archive (band-level transfer payments).
 *
 * Gated by `ANTHROPIC_API_KEY`. When unset, callers should fall back
 * gracefully (return undefined / null). We never put a key on disk; it
 * comes from the shell or a gitignored `.env`.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

let client: Anthropic | null = null;
export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface FundingTransfer {
  /** Funding department / agency / source. */
  department?: string;
  /** Program / line item (e.g. "Education", "Capital", "Operations"). */
  program?: string;
  /** Amount in CAD. */
  amount: number;
  /** Free-form description / notes from the source line. */
  notes?: string;
}

export interface ExpenditureLine {
  /** Spending category (e.g. "Education", "Capital", "Administration"). */
  category: string;
  /** Optional sub-program / line detail. */
  detail?: string;
  /** Amount in CAD. */
  amount: number;
  /** Free-form notes. */
  notes?: string;
}

export interface BalanceSheetSnapshot {
  /** Current assets (cash, receivables, short-term investments). */
  currentAssets?: number;
  /** Tangible capital assets (buildings, equipment, infrastructure). */
  capitalAssets?: number;
  /** Sum of all assets. */
  totalAssets?: number;
  /** Current liabilities (accounts payable, short-term debt). */
  currentLiabilities?: number;
  /** Long-term debt / deferred liabilities. */
  longTermLiabilities?: number;
  /** Sum of all liabilities. */
  totalLiabilities?: number;
  /** Equity invested in capital assets. */
  equityInCapitalAssets?: number;
  /** Accumulated operating surplus (or deficit if negative). */
  accumulatedSurplus?: number;
  /** Total net assets / band equity. */
  netAssetsOrEquity?: number;
}

export interface ExtractedFunding {
  fiscalYear: string;
  bandNumber?: string;
  bandName?: string;
  /** Revenue / federal transfer payments INTO the band. */
  transfers: FundingTransfer[];
  /** Expenditures — where the band spent the money. */
  expenditures?: ExpenditureLine[];
  /** Total revenue declared on the document, when visible. May not equal sum(transfers). */
  declaredTotal?: number;
  /** Sum of `transfers[].amount` (revenue). */
  computedTotal: number;
  /** Sum of `expenditures[].amount`. */
  computedExpenditureTotal?: number;
  /** Surplus (+) / deficit (−) for the fiscal year — revenue minus expenditures. */
  surplusDeficit?: number;
  /** Balance-sheet snapshot if the audit shows one. */
  balanceSheet?: BalanceSheetSnapshot;
  /** Free-text caveats Claude noted (e.g. "page 3 illegible"). */
  notes?: string;
}

const SYSTEM_PROMPT = `You are extracting financial data from a scanned audit submission PDF for a Canadian First Nation. The document is the band's audited financial statements for a single fiscal year, attached to the federal "Schedule of Federal Funding" page. It includes both revenue (federal transfer payments) AND the band's audited financial statements: expenditures, balance sheet (assets, liabilities, equity), and operating result. The pages are scanned images; OCR them carefully.

Return a single JSON object matching this schema, with NO commentary:

{
  "fiscalYear": "YYYY-YYYY",
  "bandNumber": "string",
  "bandName": "string",

  // REVENUE — federal transfer payments INTO the band, one row per line item:
  "transfers": [
    {
      "department": "string",            // e.g. "Indian and Northern Affairs Canada"
      "program": "string",               // e.g. "Capital", "Education", "Operations"
      "amount": 0,                       // CAD, numeric (no $ or commas)
      "notes": "string"                  // optional, brief
    }
  ],

  // EXPENDITURES — how the band spent money during the year:
  "expenditures": [
    {
      "category": "string",              // e.g. "Education", "Capital", "Administration", "Health", "Social Development"
      "detail": "string",                // optional sub-program / line item
      "amount": 0,
      "notes": "string"
    }
  ],

  // BALANCE SHEET — year-end snapshot. Include any fields visible; omit ones you can't read:
  "balanceSheet": {
    "currentAssets": 0,                  // cash, receivables, short-term investments
    "capitalAssets": 0,                  // buildings, equipment, infrastructure (net of depreciation)
    "totalAssets": 0,
    "currentLiabilities": 0,             // accounts payable, short-term debt
    "longTermLiabilities": 0,            // long-term debt, deferred liabilities
    "totalLiabilities": 0,
    "equityInCapitalAssets": 0,
    "accumulatedSurplus": 0,             // accumulated surplus / (deficit if negative)
    "netAssetsOrEquity": 0               // total band equity / net assets
  },

  // OPERATING RESULT for the fiscal year:
  "surplusDeficit": 0,                   // revenue minus expenditures; positive if surplus, negative if deficit

  // META:
  "declaredTotal": 0,                    // total revenue printed on the doc if visible
  "notes": "string"                      // brief caveats only (illegible pages etc.)
}

Rules:
- Output JSON only — no markdown fences, no commentary.
- Amounts are integers in CAD; strip $ and commas. Negative numbers (deficits) keep their minus sign.
- Skip header / subtotal / total rows in the arrays; capture totals via declaredTotal / balanceSheet.*.
- If a value is unreadable or absent, omit that key/line rather than guess.
- If the document only contains the Schedule of Federal Funding (revenue side, no audit), populate "transfers" and leave "expenditures", "balanceSheet", and "surplusDeficit" out.`;

/**
 * Send a PDF (as a base64 data URL or HTTPS URL) to Claude and ask for
 * structured funding extraction. Returns undefined if no key is set or the
 * model returned unparseable JSON.
 */
export async function extractFundingPdf(
  source: { url: string } | { base64: string },
  hint: { fiscalYear: string; bandNumber: string; bandName?: string },
): Promise<ExtractedFunding | undefined> {
  const c = getClient();
  if (!c) return undefined;

  const documentBlock: any =
    'url' in source
      ? { type: 'document', source: { type: 'url', url: source.url } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: source.base64 } };

  const userText = `Extract the federal transfer-payment data from this PDF.

Context (verified from the federal FN Profiles page that links this PDF):
- Fiscal year: ${hint.fiscalYear}
- Band number: ${hint.bandNumber}
- Band name: ${hint.bandName || '(unknown — read from the document)'}

Return the JSON object only.`;

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [documentBlock, { type: 'text', text: userText }],
      },
    ],
  });

  // Pull the first text block.
  const block = msg.content.find((b: any) => b.type === 'text') as { type: 'text'; text: string } | undefined;
  if (!block) return undefined;
  const text = block.text.trim();
  // Tolerate accidental markdown fencing.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return undefined;
  }
  const transfers: FundingTransfer[] = Array.isArray(parsed.transfers) ? parsed.transfers : [];
  const computedTotal = transfers.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expenditures: ExpenditureLine[] | undefined = Array.isArray(parsed.expenditures) ? parsed.expenditures : undefined;
  const computedExpenditureTotal = expenditures
    ? expenditures.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    : undefined;
  // Trust the doc's explicit P/L if Claude found one, else derive it.
  const surplusDeficit =
    typeof parsed.surplusDeficit === 'number'
      ? parsed.surplusDeficit
      : computedExpenditureTotal !== undefined
        ? computedTotal - computedExpenditureTotal
        : undefined;
  return {
    fiscalYear: String(parsed.fiscalYear || hint.fiscalYear),
    bandNumber: String(parsed.bandNumber || hint.bandNumber),
    bandName: parsed.bandName || hint.bandName,
    transfers,
    expenditures,
    balanceSheet: parsed.balanceSheet && typeof parsed.balanceSheet === 'object' ? parsed.balanceSheet : undefined,
    declaredTotal: typeof parsed.declaredTotal === 'number' ? parsed.declaredTotal : undefined,
    computedTotal,
    computedExpenditureTotal,
    surplusDeficit,
    notes: parsed.notes,
  };
}
