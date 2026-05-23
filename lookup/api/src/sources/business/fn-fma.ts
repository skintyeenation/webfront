/**
 * First Nations Financial Management Board — list of FMA-certified First
 * Nations. The page is plain HTML; we extract names matching "<thing> Nation"
 * or "<thing> First Nation"/"Band"/"Cree"/"Métis" and filter by the query.
 */

import type { Source, ScrapeResult, SourceItem } from '../../types.js';
import { getText } from '../../util/http.js';

const PAGE = 'https://fnfmb.com/en/our-work/financial-management-system-certification';

const buildHumanUrl = (_q: string): string => PAGE;

export const fnFma: Source = {
  id: 'fn-fma',
  name: 'FN Financial Management Board (certified Nations)',
  mode: 'business',
  format: 'html-search',
  category: 'First Nations',
  homepage: 'https://fnfmb.com/',
  indigenousFilter: 'inherent',
  autoSelectOnIndigenous: true,
  description: 'First Nations Financial Management Board — list of FMA-certified First Nations.',
  searchUrl: () => PAGE,
  async scrape(q): Promise<ScrapeResult> {
    const html = await getText(PAGE);
    // The page is content-heavy; pull plain-text nation names out from the
    // markup, then filter by the user's query.
    const text = html.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ');
    const re = /\|([A-Z][A-Za-zÀ-ÿ'\s\-\.]{4,80}(?:Nation|Band|Cree|Métis))\|/g;
    const seen = new Set<string>();
    const allNames: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const s = m[1].trim();
      if (s.length > 80 || seen.has(s)) continue;
      seen.add(s);
      allNames.push(s);
    }
    const needle = q.trim().toLowerCase();
    const matched = needle ? allNames.filter((n) => n.toLowerCase().includes(needle)) : allNames;
    const items: SourceItem[] = matched.slice(0, 25).map((n) => ({
      title: n,
      subtitle: 'FMA-certified',
      url: PAGE,
    }));
    return {
      items,
      searchUrl: buildHumanUrl(q),
      notes: [`FN FMB page lists ${allNames.length} candidate Nations; matched ${matched.length} for "${q}".`],
    };
  },
};
