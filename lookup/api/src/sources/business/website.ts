/**
 * Generic company-website scraper — when the user passes `--website <url>`,
 * fetch the homepage + /about + /contact and extract title, meta description,
 * email addresses, phone numbers.
 *
 * Triggers only when opts.website is set.
 */

import * as cheerio from 'cheerio';
import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getText } from '../../util/http.js';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/g;

export const website: Source = {
  id: 'website',
  name: 'Company website',
  mode: 'business',
  format: 'html-search',
  category: 'Self-disclosed',
  homepage: '',
  indigenousFilter: 'none',
  description: 'Scrape the target company website (homepage + /about + /contact) for emails, phones and metadata.',
  searchUrl: (_q, opts) => opts.website || '',
  async scrape(_q, opts): Promise<ScrapeResult> {
    if (!opts.website) {
      return { items: [], searchUrl: '', notes: ['No --website provided; skipping.'] };
    }
    const base = opts.website.replace(/\/+$/, '');
    const urls = [base, `${base}/about`, `${base}/about-us`, `${base}/contact`, `${base}/contact-us`];
    const items: SourceItem[] = [];
    const emails = new Set<string>();
    const phones = new Set<string>();
    let firstHtml = '';
    let firstTitle = '';
    let firstDescription = '';

    for (const u of urls) {
      try {
        const html = await getText(u);
        if (!firstHtml) firstHtml = html;
        const $ = cheerio.load(html);
        if (!firstTitle) firstTitle = $('title').first().text().trim();
        if (!firstDescription) firstDescription = $('meta[name="description"]').attr('content')?.trim() ?? '';
        (html.match(EMAIL_RE) ?? []).forEach((e) => emails.add(e));
        (html.match(PHONE_RE) ?? []).forEach((p) => phones.add(p));
      } catch {
        // 404s are fine — about/contact may not exist
      }
    }

    items.push({
      title: firstTitle || base,
      subtitle: base,
      url: base,
      snippet: firstDescription || undefined,
      fields: {
        ...(emails.size ? { emails: [...emails].slice(0, 10).join(', ') } : {}),
        ...(phones.size ? { phones: [...phones].slice(0, 10).join(', ') } : {}),
      },
    });

    return {
      items,
      searchUrl: base,
      raw: firstHtml ? { contentType: 'text/html', body: firstHtml } : undefined,
    };
  },
};
