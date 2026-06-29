import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Reads the local submission store that /api/program-submission writes to
// (web/submissions/<area>/<slug>/submissions/<stamp>_<who>/). POC only — Phase 2 reads this
// from SharePoint. Powers the submission-status indicators on each area accordion (roll-up)
// and each program card (per program).
export type SubmissionStat = { count: number; latest?: string };
export type AreaStatus = { total: SubmissionStat; programs: Record<string, SubmissionStat> };

export async function submissionStatus(): Promise<Record<string, AreaStatus>> {
  const root = path.join(process.cwd(), 'submissions');
  const out: Record<string, AreaStatus> = {};

  let areas: string[] = [];
  try {
    areas = await readdir(root);
  } catch {
    return out; // no submissions yet
  }

  for (const area of areas) {
    const programs: Record<string, SubmissionStat> = {};
    let totalCount = 0;
    let totalLatest: number | undefined;

    let slugs: string[] = [];
    try {
      slugs = await readdir(path.join(root, area));
    } catch {
      continue;
    }
    for (const slug of slugs) {
      // submissions/<kind>/<stamp_who>/ — count across both kinds (paw + dci).
      const subDir = path.join(root, area, slug, 'submissions');
      let kinds: string[] = [];
      try {
        kinds = await readdir(subDir);
      } catch {
        continue;
      }
      let count = 0;
      let latest: number | undefined;
      for (const kind of kinds) {
        let entries: string[] = [];
        try {
          entries = await readdir(path.join(subDir, kind));
        } catch {
          continue;
        }
        for (const e of entries) {
          count++;
          try {
            const t = (await stat(path.join(subDir, kind, e))).mtimeMs;
            if (latest == null || t > latest) latest = t;
          } catch {
            /* ignore */
          }
        }
      }
      if (count > 0) {
        programs[slug] = { count, latest: latest ? new Date(latest).toISOString() : undefined };
        totalCount += count;
        if (totalLatest == null || (latest ?? 0) > totalLatest) totalLatest = latest;
      }
    }

    if (totalCount > 0) {
      out[area] = {
        total: { count: totalCount, latest: totalLatest ? new Date(totalLatest).toISOString() : undefined },
        programs,
      };
    }
  }
  return out;
}

// "today" / "yesterday" / "3 days ago" / "2 mo ago" — computed server-side at render/revalidate.
export function relativeTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  const day = 86_400_000;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  const days = Math.floor(diff / day);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} mo ago` : `${Math.floor(months / 12)} yr ago`;
}
