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

export interface ExtractedFunding {
  fiscalYear: string;
  bandNumber?: string;
  bandName?: string;
  transfers: FundingTransfer[];
  /** Total declared on the document, when visible. May not equal sum(transfers). */
  declaredTotal?: number;
  /** Sum of `transfers[].amount`. */
  computedTotal: number;
  /** Free-text caveats Claude noted (e.g. "page 3 illegible"). */
  notes?: string;
}

const SYSTEM_PROMPT = `You are extracting transfer-payment data from a scanned PDF that is a federal Schedule of Federal Funding for a Canadian First Nation. The PDF lists payments TO the band FROM federal departments/agencies for a single fiscal year. The pages are scanned images; OCR them carefully.

Return a single JSON object matching this schema, with NO commentary:

{
  "fiscalYear": "YYYY-YYYY",            // e.g. "2006-2007"
  "bandNumber": "string",                // e.g. "729"
  "bandName": "string",                  // e.g. "Skin Tyee"
  "transfers": [                         // one row per payment line
    {
      "department": "string",            // e.g. "Indian and Northern Affairs Canada"
      "program": "string",               // e.g. "Capital", "Education", "Operations"
      "amount": 0,                       // CAD, numeric (no $ or commas)
      "notes": "string"                  // optional, brief
    }
  ],
  "declaredTotal": 0,                    // total printed on the doc if visible; else omit
  "notes": "string"                      // brief caveats only (illegible pages etc.)
}

Rules:
- Output JSON only — no markdown fences, no commentary.
- Amounts are positive integers in CAD; strip $ and commas.
- If a transfer's program is unclear, leave it as "".
- If a value is unreadable, omit that line rather than guess.
- Skip header / totals rows in "transfers"; capture the total under declaredTotal.`;

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
  return {
    fiscalYear: String(parsed.fiscalYear || hint.fiscalYear),
    bandNumber: String(parsed.bandNumber || hint.bandNumber),
    bandName: parsed.bandName || hint.bandName,
    transfers,
    declaredTotal: typeof parsed.declaredTotal === 'number' ? parsed.declaredTotal : undefined,
    computedTotal,
    notes: parsed.notes,
  };
}
