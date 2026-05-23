/**
 * Report writer — emits `report.md` + per-source `<id>.json` and `<id>.raw.html`
 * (or `.raw.json`) into a self-contained folder.
 */

import { join } from 'node:path';
import type { Job } from './runner.js';
import type { ScrapeResult } from './types.js';
import { sourceById } from './sources/index.js';
import { ensureDir, writeOut } from './util/fs.js';

interface WriteOpts {
  dir: string;
  job: Job;
  results: Record<string, ScrapeResult | { error: string; searchUrl: string }>;
}

export async function writeReport(opts: WriteOpts): Promise<string> {
  const { dir, job, results } = opts;
  await ensureDir(dir);
  const { target, mode, indigenousOnly, sourceIds, vendor, fromYear, toYear, minValue, maxValue, website } = job.options;

  const lines: string[] = [];
  lines.push(`# Lookup — "${target}"`);
  lines.push('');
  lines.push(`- **Mode:** ${mode}`);
  lines.push(`- **Indigenous-only:** ${indigenousOnly ? 'yes' : 'no'}`);
  lines.push(`- **Started:** ${new Date(job.startedAt).toISOString()}`);
  if (vendor) lines.push(`- **Vendor:** ${vendor}`);
  if (fromYear || toYear) lines.push(`- **Years:** ${fromYear ?? '…'} – ${toYear ?? '…'}`);
  if (minValue || maxValue) lines.push(`- **Value:** ${minValue ?? '…'} – ${maxValue ?? '…'}`);
  if (website) lines.push(`- **Website:** ${website}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Source | Result | Search URL |');
  lines.push('|---|---:|---|');
  for (const sid of sourceIds) {
    const s = sourceById(sid);
    if (!s) continue;
    const r = results[sid];
    if (r && 'error' in r) {
      lines.push(`| ${s.name} | ⚠ ${r.error} | [link](${r.searchUrl}) |`);
    } else if (r) {
      const count = (r as ScrapeResult).items.length;
      const searchUrl = (r as ScrapeResult).searchUrl || s.searchUrl(target, job.options);
      lines.push(`| ${s.name} | ${count} | [link](${searchUrl}) |`);
    } else {
      lines.push(`| ${s.name} | – | – |`);
    }
  }
  lines.push('');

  for (const sid of sourceIds) {
    const s = sourceById(sid);
    if (!s) continue;
    const r = results[sid];
    lines.push(`## ${s.name}`);
    lines.push('');
    lines.push(`*${s.category} · ${s.format}* — ${s.description}`);
    lines.push('');
    if (!r) {
      lines.push('_(skipped)_');
      lines.push('');
      continue;
    }
    if ('error' in r) {
      lines.push(`> **Error:** ${r.error}`);
      lines.push('');
      lines.push(`Open the search manually → <${r.searchUrl}>`);
      lines.push('');
      continue;
    }
    const sr = r as ScrapeResult;
    if (sr.searchUrl) {
      lines.push(`Search → <${sr.searchUrl}>`);
      lines.push('');
    }
    if (sr.notes?.length) {
      for (const n of sr.notes) lines.push(`> ${n}`);
      lines.push('');
    }
    if (sr.warnings?.length) {
      for (const w of sr.warnings) lines.push(`> ⚠ ${w}`);
      lines.push('');
    }
    if (sr.items.length === 0) {
      lines.push('_No items extracted — follow the link above._');
      lines.push('');
    } else {
      for (const it of sr.items) {
        const head = it.url ? `[${it.title}](${it.url})` : it.title;
        lines.push(`- **${head}**${it.subtitle ? ` — ${it.subtitle}` : ''}`);
        if (it.snippet) lines.push(`  - ${it.snippet}`);
        if (it.fields) {
          for (const [k, v] of Object.entries(it.fields)) {
            if (v === '' || v === undefined || v === null) continue;
            lines.push(`  - \`${k}\`: ${v}`);
          }
        }
      }
      lines.push('');
    }

    // Per-source files: structured JSON + raw if present.
    const jsonPath = join(dir, 'sources', `${sid}.json`);
    await writeOut(jsonPath, JSON.stringify(sr, null, 2));
    if (sr.raw) {
      const ext = sr.raw.contentType.includes('json') ? 'json' : 'html';
      await writeOut(join(dir, 'sources', `${sid}.raw.${ext}`), sr.raw.body);
    }
  }

  const reportPath = join(dir, 'report.md');
  await writeOut(reportPath, lines.join('\n'));
  await writeOut(join(dir, 'inputs.json'), JSON.stringify(job.options, null, 2));
  return reportPath;
}
