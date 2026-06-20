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

export interface ReceiptExtraction {
  amount: number | null;
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  currency: string | null; // ISO, e.g. CAD
  suggestedTagSlug: string | null;
  confidence: number | null; // 0..1
}

const EMPTY: ReceiptExtraction = {
  amount: null, vendor: null, date: null, currency: null, suggestedTagSlug: null, confidence: null,
};

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
      return { ...EMPTY };
    }

    // Build the media content block (image vs PDF document).
    let media: any;
    if (mimeType === 'application/pdf') {
      media = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } };
    } else if (IMAGE_TYPES.includes(mimeType)) {
      media = { type: 'image', source: { type: 'base64', media_type: mimeType, data: bytes.toString('base64') } };
    } else {
      this.log.warn(`extractReceipt: unsupported mimeType ${mimeType} — skipping`);
      return { ...EMPTY };
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
        },
        required: ['amount', 'vendor', 'date', 'currency', 'tagSlug', 'confidence'],
      },
    };

    const prompt =
      `Extract the expense details from this receipt. Pick the single best expense tag (by slug) from this catalog: ${tagList}. ` +
      `If the image is not a readable receipt, set every field to null. Respond by calling the record_receipt tool.`;

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
        throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
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
      };
      this.log.log(`extractReceipt: ${out.vendor ?? '?'} ${out.amount ?? '?'} → tag ${out.suggestedTagSlug ?? '∅'}`);
      return out;
    } catch (e: any) {
      this.log.warn(`extractReceipt failed: ${e?.message ?? e}`);
      return { ...EMPTY };
    }
  }
}
