import { Injectable, Logger } from '@nestjs/common';

// Reads a receipt image/PDF with Claude (Anthropic Messages API, vision) and
// returns structured expense fields + a suggested tag from the catalog. Zero
// deps — Node 20 global fetch, no SDK (matches graph-feed.service.ts). Config
// via env; secrets are Container App secrets in prod:
//
//   ANTHROPIC_API_KEY    (required)  Anthropic API key
//   ANTHROPIC_MODEL      (optional)  default claude-haiku-4-5-20251001
//   ANTHROPIC_MAX_TOKENS (optional)  output-token cap per call; default 32768,
//                                    clamped to [512, 64000]. This is a CAP,
//                                    not a charge — you pay only for tokens
//                                    actually generated (see docs/pricing-overview.md).
//
// Best-effort: when the key is unset OR anything fails, returns all-nulls so the
// submitter can still enter the receipt manually.

// Outcome of an extraction attempt, surfaced to the UI so the submitter knows
// WHY a receipt didn't auto-fill (not just silently nothing).
export type ExtractStatus = 'extracted' | 'unconfigured' | 'unsupported' | 'failed';

export interface ReceiptLineItem {
  description: string;
  amount: number | null;
  qty: number | null;
  // Summary rows (subtotal / total / tax / balance / change …) — displayed but
  // NOT user-toggleable and NOT counted toward the claimed amount (like tax).
  isSummary?: boolean;
}

export interface ReceiptExtraction {
  amount: number | null;
  tax: number | null; // tax portion (GST/PST/HST) of the total
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  currency: string | null; // ISO, e.g. CAD
  suggestedTagSlug: string | null;
  confidence: number | null; // 0..1
  // Itemised lines when the photo is legible enough; empty otherwise.
  lineItems: ReceiptLineItem[];
  status: ExtractStatus;
  message: string | null; // human-readable note when status != 'extracted'
}

const empty = (status: ExtractStatus, message: string | null = null): ReceiptExtraction => ({
  amount: null, tax: null, vendor: null, date: null, currency: null, suggestedTagSlug: null, confidence: null, lineItems: [], status, message,
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@Injectable()
export class AnthropicService {
  private readonly log = new Logger(AnthropicService.name);

  get configured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  private get model(): string {
    return process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  }

  // Output-token ceiling per receipt extraction. A CAP (not a charge): cost is
  // driven by tokens actually generated, so a generous cap only prevents the
  // lineItems array from truncating mid-stream on long receipts. Clamped so a
  // stray env value can't truncate to nothing or exceed Haiku 4.5's 64K cap.
  private get maxTokens(): number {
    const raw = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? '', 10);
    if (!Number.isFinite(raw)) return 32768;
    return Math.min(Math.max(raw, 512), 64000);
  }

  async extractReceipt(
    bytes: Buffer,
    mimeType: string,
    tags: Array<{ slug: string; label: string }>,
  ): Promise<ReceiptExtraction> {
    if (!this.configured) {
      this.log.warn('Anthropic not configured (ANTHROPIC_API_KEY unset) — skipping receipt extraction');
      return empty('unconfigured', 'AI receipt reading isn’t set up on the server — enter the details manually.');
    }

    // Build the media content block (image vs PDF document).
    let media: any;
    if (mimeType === 'application/pdf') {
      media = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } };
    } else if (IMAGE_TYPES.includes(mimeType)) {
      media = { type: 'image', source: { type: 'base64', media_type: mimeType, data: bytes.toString('base64') } };
    } else {
      this.log.warn(`extractReceipt: unsupported mimeType ${mimeType} — skipping`);
      return empty('unsupported', `Can’t AI-read this file type (${mimeType}) — enter the details manually.`);
    }

    const slugs = tags.map((t) => t.slug);
    const tagList = tags.map((t) => `${t.slug} (${t.label})`).join(', ');
    const tool = {
      name: 'record_receipt',
      description: 'Record the structured details extracted from a receipt.',
      input_schema: {
        type: 'object',
        properties: {
          amount:     { type: ['number', 'null'], description: 'Grand total paid, including tax.' },
          tax:        { type: ['number', 'null'], description: 'Total tax portion (GST/PST/HST) of the grand total, if shown.' },
          vendor:     { type: ['string', 'null'], description: 'Merchant / vendor name.' },
          date:       { type: ['string', 'null'], description: 'Receipt date as YYYY-MM-DD.' },
          currency:   { type: ['string', 'null'], description: 'ISO currency code (e.g. CAD, USD). Default CAD if unclear.' },
          tagSlug:    { type: ['string', 'null'], description: `Best-matching expense tag slug from: ${slugs.join(', ')}` },
          confidence: { type: ['number', 'null'], description: 'Confidence 0..1 in this extraction.' },
          lineItems: {
            type: 'array',
            description: 'Receipt lines, IF the photo is clear enough to read them. Leave empty ([]) if blurry/illegible or the receipt has no itemisation. Include actual purchased items; you may also include summary rows (subtotal/total/tax/balance/change) but mark them isSummary:true.',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Item name / description (or the summary row label, e.g. "Subtotal").' },
                amount:      { type: ['number', 'null'], description: 'Line total (price × qty), or the summary amount.' },
                qty:         { type: ['number', 'null'], description: 'Quantity, if shown.' },
                isSummary:   { type: 'boolean', description: 'true for summary/total rows (subtotal, total, tax, balance, change, amount due, tip); false for actual purchased items.' },
              },
              required: ['description', 'amount', 'qty', 'isSummary'],
            },
          },
        },
        required: ['amount', 'tax', 'vendor', 'date', 'currency', 'tagSlug', 'confidence', 'lineItems'],
      },
    };

    const prompt =
      `Extract the expense details from this receipt. Capture the grand total (amount), the tax portion (tax), and the currency. ` +
      `Pick the single best expense tag (by slug) from this catalog: ${tagList}. ` +
      `If the photo is clear enough, also itemise the purchased line items into lineItems (description + amount, and qty when shown); ` +
      `if it's too blurry to read them, leave lineItems empty. ` +
      `If the image is not a readable receipt, set every field to null and lineItems to []. Respond by calling the record_receipt tool.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          // record_receipt emits lineItems LAST, so a tight cap truncates the
          // tool_use input mid-array — the scalar fields (amount/vendor/date)
          // survive but line items come back partial or empty. An itemised
          // grocery/hardware receipt can run well past 512 output tokens; the
          // default 32768 leaves ample headroom (override via ANTHROPIC_MAX_TOKENS;
          // Haiku 4.5 allows up to 64K). It's a cap, not a charge — see maxTokens.
          max_tokens: this.maxTokens,
          tools: [tool],
          tool_choice: { type: 'tool', name: 'record_receipt' },
          messages: [{ role: 'user', content: [media, { type: 'text', text: prompt }] }],
        }),
      });
      if (!res.ok) {
        const raw = await res.text();
        let msg = `Anthropic API error ${res.status}`;
        try { const j = JSON.parse(raw); if (j?.error?.message) msg = j.error.message; } catch { /* keep default */ }
        // Friendly mapping for the common billing case.
        if (/credit balance is too low|too low to access/i.test(msg)) {
          msg = 'AI reading is unavailable — the Anthropic account is out of credits. Top up billing to enable it.';
        } else {
          msg = `AI couldn’t read the receipt (${msg}). Enter the details manually.`;
        }
        this.log.warn(`extractReceipt failed: ${raw.slice(0, 300)}`);
        return empty('failed', msg);
      }
      const data: any = await res.json();
      // stop_reason === 'max_tokens' means the response was cut off — the
      // tool_use input is likely incomplete, so line items may be partial.
      // Log it so a recurring truncation is visible rather than silent.
      if (data.stop_reason === 'max_tokens') {
        this.log.warn('extractReceipt: hit max_tokens — line items may be truncated; consider raising max_tokens');
      }
      const toolUse = (data.content ?? []).find((c: any) => c.type === 'tool_use');
      const inp = toolUse?.input ?? {};
      const out: ReceiptExtraction = {
        amount:   typeof inp.amount === 'number' ? inp.amount : null,
        tax:      typeof inp.tax === 'number' ? inp.tax : null,
        vendor:   typeof inp.vendor === 'string' && inp.vendor.trim() ? inp.vendor.trim() : null,
        date:     typeof inp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(inp.date) ? inp.date : null,
        currency: typeof inp.currency === 'string' && inp.currency.trim() ? inp.currency.trim().toUpperCase() : null,
        suggestedTagSlug: typeof inp.tagSlug === 'string' && slugs.includes(inp.tagSlug) ? inp.tagSlug : null,
        confidence: typeof inp.confidence === 'number' ? inp.confidence : null,
        lineItems: Array.isArray(inp.lineItems)
          ? inp.lineItems
              .filter((li: any) => li && typeof li.description === 'string' && li.description.trim())
              .map((li: any) => {
                const description = li.description.trim();
                // Defensive: flag obvious summary rows even if the model didn't.
                const looksSummary = /^(sub-?total|total|balance(\s*due)?|amount\s*due|change|tax|gst|hst|pst|qst|tip|gratuity|rounding|cash|visa|mastercard|debit|payment)\b/i.test(description);
                return {
                  description,
                  amount: typeof li.amount === 'number' ? li.amount : null,
                  qty: typeof li.qty === 'number' ? li.qty : null,
                  isSummary: li.isSummary === true || looksSummary,
                };
              })
          : [],
        status: 'extracted',
        message: null,
      };
      this.log.log(`extractReceipt: ${out.vendor ?? '?'} ${out.amount ?? '?'} → tag ${out.suggestedTagSlug ?? '∅'} (${out.lineItems.length} line items)`);
      return out;
    } catch (e: any) {
      this.log.warn(`extractReceipt failed: ${e?.message ?? e}`);
      return empty('failed', `AI couldn’t read the receipt (${e?.message ?? 'network error'}). Enter the details manually.`);
    }
  }
}
