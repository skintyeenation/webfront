import { Injectable, Logger } from '@nestjs/common';

// Reads a receipt image/PDF with Claude (Anthropic Messages API, vision) and
// returns structured expense fields + a suggested tag from the catalog. Zero
// deps — Node 20 global fetch, no SDK (matches graph-feed.service.ts). Config
// via env; secrets are Container App secrets in prod:
//
//   ANTHROPIC_API_KEY  (required)  Anthropic API key
//   ANTHROPIC_MODEL    (optional)  default claude-haiku-4-5-20251001
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
}

export interface ReceiptExtraction {
  amount: number | null;
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
  amount: null, vendor: null, date: null, currency: null, suggestedTagSlug: null, confidence: null, lineItems: [], status, message,
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
          vendor:     { type: ['string', 'null'], description: 'Merchant / vendor name.' },
          date:       { type: ['string', 'null'], description: 'Receipt date as YYYY-MM-DD.' },
          currency:   { type: ['string', 'null'], description: 'ISO currency code (e.g. CAD, USD). Default CAD if unclear.' },
          tagSlug:    { type: ['string', 'null'], description: `Best-matching expense tag slug from: ${slugs.join(', ')}` },
          confidence: { type: ['number', 'null'], description: 'Confidence 0..1 in this extraction.' },
          lineItems: {
            type: 'array',
            description: 'Individual purchased line items, IF the photo is clear enough to read them. Leave empty ([]) if blurry/illegible or the receipt has no itemisation.',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Item name / description.' },
                amount:      { type: ['number', 'null'], description: 'Line total (price × qty).' },
                qty:         { type: ['number', 'null'], description: 'Quantity, if shown.' },
              },
              required: ['description', 'amount', 'qty'],
            },
          },
        },
        required: ['amount', 'vendor', 'date', 'currency', 'tagSlug', 'confidence', 'lineItems'],
      },
    };

    const prompt =
      `Extract the expense details from this receipt. Pick the single best expense tag (by slug) from this catalog: ${tagList}. ` +
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
          max_tokens: 512,
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
      const toolUse = (data.content ?? []).find((c: any) => c.type === 'tool_use');
      const inp = toolUse?.input ?? {};
      const out: ReceiptExtraction = {
        amount:   typeof inp.amount === 'number' ? inp.amount : null,
        vendor:   typeof inp.vendor === 'string' && inp.vendor.trim() ? inp.vendor.trim() : null,
        date:     typeof inp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(inp.date) ? inp.date : null,
        currency: typeof inp.currency === 'string' && inp.currency.trim() ? inp.currency.trim().toUpperCase() : null,
        suggestedTagSlug: typeof inp.tagSlug === 'string' && slugs.includes(inp.tagSlug) ? inp.tagSlug : null,
        confidence: typeof inp.confidence === 'number' ? inp.confidence : null,
        lineItems: Array.isArray(inp.lineItems)
          ? inp.lineItems
              .filter((li: any) => li && typeof li.description === 'string' && li.description.trim())
              .map((li: any) => ({
                description: li.description.trim(),
                amount: typeof li.amount === 'number' ? li.amount : null,
                qty: typeof li.qty === 'number' ? li.qty : null,
              }))
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
