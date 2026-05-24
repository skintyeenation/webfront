/**
 * Node http-stdlib HTTP + SSE server for the @skintyee/lookup-app frontend.
 *
 * Endpoints:
 *   GET  /api/sources                    → catalogue (id, name, mode, …)
 *   POST /api/run                        → start a job; returns { jobId, sourceIds }
 *   GET  /api/jobs/:id                   → job status + replayed events + result
 *   GET  /api/jobs/:id/stream            → SSE stream of progress events
 *   GET  /api/jobs/:id/report            → render report.md (text/markdown)
 *   GET  /api/health                     → { ok: true }
 *
 * CORS open by default — local dev tool. Bind 127.0.0.1 to keep it off the LAN.
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { ALL_SOURCES, sourceById, sourcesByMode, defaultSelected } from './sources/index.js';
import { startJob, getJob } from './runner.js';
import type { JobOptions, ProgressEvent, SourceMode } from './types.js';
import { log, fmt } from './util/log.js';
import { getBandDetail, type Section } from './sources/nations/band-detail.js';
import { describeFundsRows, summarizeFunds } from './sources/nations/funds-extract.js';
import { BUCKETS, ageMs, get as storeGet, put as storePut } from './util/store.js';
import { list as listJobs } from './util/queue.js';
import { startWorker } from './worker.js';

/**
 * Re-hydrate the `funds.extracted` array of a cached band-detail row
 * against the live queue + per-(band, fy) OCR cache. The rest of the
 * band detail (general / governance / reserves / population / geo) is
 * expensive to recompute and rarely changes between requests, so we
 * leave it as-is and only refresh the volatile funds statuses. This
 * keeps the cache fast AND makes the UI reflect worker progress without
 * the client having to force-refresh.
 */
function refreshFundsExtractedLive(cachedDetail: any): any {
  if (!cachedDetail?.funds?.rows?.length) return cachedDetail;
  const bandNumber = String(cachedDetail.bandNumber ?? '');
  const bandName = cachedDetail.general?.officialName;
  const extracted = describeFundsRows(bandNumber, bandName, cachedDetail.funds.rows);
  const summary = summarizeFunds(extracted);
  return {
    ...cachedDetail,
    funds: { ...cachedDetail.funds, extracted, summary },
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultOut = join(__dirname, '..', 'out');

const PORT = Number(process.env.PORT || 5050);
const HOST = process.env.HOST || '127.0.0.1';

// In-flight per (bandNumber, sections) — shared promise so concurrent
// /api/nations requests don't fire duplicate OCR runs.
const bandFetchInflight = new Map<
  string,
  Promise<{ ok: true; detail: any } | { ok: false; error: Error }>
>();

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

interface RunBody {
  mode: SourceMode;
  target: string;
  sourceIds?: string[];
  indigenousOnly?: boolean;
  website?: string;
  vendor?: string;
  fromYear?: number;
  toYear?: number;
  minValue?: number;
  maxValue?: number;
  regionId?: string;
  fetch?: boolean;
  outDir?: string;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const path = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && path === '/api/health') {
      return json(res, 200, { ok: true, port: PORT });
    }

    // GET /api/queue[?type=…&status=…] — peek at the background worker's queue
    if (req.method === 'GET' && path === '/api/queue') {
      const type = url.searchParams.get('type') || undefined;
      const status = (url.searchParams.get('status') || undefined) as any;
      const items = listJobs({ type, status });
      const counts = { pending: 0, running: 0, done: 0, failed: 0 };
      for (const j of listJobs()) (counts as any)[j.status] += 1;
      return json(res, 200, { counts, items });
    }

    // POST /api/nations/:bandNumber/funds/:fiscalYear/retry
    //   Requeue / re-OCR one fiscal year's PDF. Drops any cached extraction
    //   so the next worker pickup re-runs from scratch.
    const retryMatch = path.match(/^\/api\/nations\/(\d{1,5})\/funds\/([\w-]+)\/retry$/);
    if (req.method === 'POST' && retryMatch) {
      const [, bandNumber, fiscalYear] = retryMatch;
      // Drop the cached OCR result so describeFundsRows enqueues a fresh job.
      const fundsBucket = 'nations-funds';
      const key = `${bandNumber}_${fiscalYear}`;
      const cachePath = (await import('node:path')).join(__dirname, '..', 'data', fundsBucket, `${key}.json`);
      try {
        await (await import('node:fs/promises')).unlink(cachePath);
      } catch {
        /* not cached — fine */
      }
      // Drop the queued job (if any) — describeFundsRows will re-enqueue.
      const fs = await import('node:fs/promises');
      const queuePath = (await import('node:path')).join(__dirname, '..', 'data', 'queue.json');
      try {
        const buf = await fs.readFile(queuePath, 'utf8');
        const arr = JSON.parse(buf) as any[];
        const kept = arr.filter((j) => !(j.type === 'pdf-ocr' && j.key === key));
        await fs.writeFile(queuePath, JSON.stringify(kept, null, 2));
        // queue.ts caches in memory — bust it.
        const { clearCache } = await import('./util/queue.js');
        clearCache();
      } catch {
        /* no queue file yet — fine */
      }
      // Drop the band cache so the next GET re-runs describeFundsRows.
      const bandPath = (await import('node:path')).join(__dirname, '..', 'data', 'nations', `${bandNumber}.json`);
      try {
        await fs.unlink(bandPath);
      } catch {
        /* not cached — fine */
      }
      return json(res, 200, { ok: true, fiscalYear, bandNumber });
    }

    if (req.method === 'GET' && path === '/api/sources') {
      const mode = url.searchParams.get('mode') as SourceMode | null;
      const list = mode ? sourcesByMode(mode) : ALL_SOURCES;
      const indigenous = url.searchParams.get('indigenousOnly') === '1';
      const items = list.map((s) => ({
        id: s.id,
        name: s.name,
        mode: s.mode,
        format: s.format,
        category: s.category,
        homepage: s.homepage,
        description: s.description,
        scrapable: !!s.scrape,
        indigenousFilter: s.indigenousFilter,
        autoSelectOnIndigenous: !!s.autoSelectOnIndigenous,
        requiresAuth: s.requiresAuth ?? false,
      }));
      const defaults = mode ? defaultSelected(mode, indigenous) : undefined;
      return json(res, 200, { items, defaults });
    }

    if (req.method === 'POST' && path === '/api/run') {
      const body = JSON.parse((await readBody(req)) || '{}') as RunBody;
      if (!body.mode || !body.target) return json(res, 400, { error: 'mode + target required' });
      const sourceIds = body.sourceIds?.length
        ? body.sourceIds
        : defaultSelected(body.mode, !!body.indigenousOnly);
      const opts: JobOptions = {
        mode: body.mode,
        target: body.target,
        sourceIds,
        outDir: body.outDir ?? defaultOut,
        indigenousOnly: !!body.indigenousOnly,
        website: body.website,
        vendor: body.vendor,
        fromYear: body.fromYear,
        toYear: body.toYear,
        minValue: body.minValue,
        maxValue: body.maxValue,
        regionId: body.regionId,
        fetch: body.fetch !== false,
      };
      const job = startJob(opts);
      return json(res, 200, { jobId: job.id, sourceIds });
    }

    // GET /api/nations/:bandNumber[?sections=…&refresh=1]
    const nationMatch = path.match(/^\/api\/nations\/(\d{1,5})$/);
    if (req.method === 'GET' && nationMatch) {
      const [, bandNumber] = nationMatch;
      const refresh = url.searchParams.get('refresh') === '1';
      const sectionsParam = url.searchParams.get('sections');
      const sections = (sectionsParam ? sectionsParam.split(',') : undefined) as Section[] | undefined;
      // Cache lookup — 1 day TTL. Stale-while-revalidate semantics aren't worth
      // it for a single-user dev tool, so a refresh=1 query forces a re-scrape.
      const cached = storeGet<any>(BUCKETS.nations, bandNumber);
      if (cached && !refresh && ageMs(cached) < 24 * 60 * 60 * 1000) {
        const live = refreshFundsExtractedLive(cached.data);
        return json(res, 200, { ...live, cached: true, fetchedAt: cached.fetchedAt });
      }
      // In-flight dedup — a fresh fetch can take minutes (PDF OCR is heavily
      // rate-limited). Reuse the same promise for concurrent callers so a
      // page refresh doesn't kick off a second OCR run.
      const inflightKey = `${bandNumber}:${sectionsParam || 'all'}`;
      let p = bandFetchInflight.get(inflightKey);
      if (!p) {
        p = (async () => {
          try {
            const detail = await getBandDetail(bandNumber, sections);
            storePut(BUCKETS.nations, bandNumber, detail);
            return { ok: true as const, detail };
          } catch (err) {
            return { ok: false as const, error: err as Error };
          } finally {
            // Clear *after* the body resolves so dedup covers the whole run.
            setTimeout(() => bandFetchInflight.delete(inflightKey), 0);
          }
        })();
        bandFetchInflight.set(inflightKey, p);
      }
      const result = await p;
      if (result.ok) {
        return json(res, 200, { ...result.detail, cached: false, fetchedAt: new Date().toISOString() });
      }
      if (cached) {
        const live = refreshFundsExtractedLive(cached.data);
        return json(res, 200, { ...live, cached: true, stale: true, fetchedAt: cached.fetchedAt, warning: result.error.message });
      }
      return json(res, 502, { error: result.error.message });
    }

    const jobMatch = path.match(/^\/api\/jobs\/([\w-]+)(\/(stream|report))?$/);
    if (req.method === 'GET' && jobMatch) {
      const [, jobId, , sub] = jobMatch;
      const job = getJob(jobId);
      if (!job) return json(res, 404, { error: 'unknown job' });

      if (sub === 'stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'access-control-allow-origin': '*',
        });
        // Replay backlog
        for (const e of job.events) {
          res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
        }
        if (job.status === 'done' || job.status === 'failed') {
          res.end();
          return;
        }
        const onEvent = (e: ProgressEvent) => {
          res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
          if (e.type === 'job-done') {
            res.end();
            job.off('event', onEvent);
          }
        };
        job.on('event', onEvent);
        req.on('close', () => job.off('event', onEvent));
        return;
      }

      if (sub === 'report') {
        if (!job.result?.reportPath) return json(res, 409, { error: 'job not done' });
        const md = await readFile(job.result.reportPath, 'utf8');
        res.writeHead(200, {
          'content-type': 'text/markdown; charset=utf-8',
          'access-control-allow-origin': '*',
        });
        res.end(md);
        return;
      }

      return json(res, 200, {
        id: job.id,
        status: job.status,
        startedAt: job.startedAt,
        events: job.events,
        result: job.result,
        options: job.options,
      });
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (err) {
    log.err((err as Error).message);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
});

server.listen(PORT, HOST, () => {
  log.ok(`${fmt.bold('@skintyee/lookup-api')} listening on http://${HOST}:${PORT}`);
  log.info(`  ${fmt.dim('GET  /api/sources              — catalogue')}`);
  log.info(`  ${fmt.dim('POST /api/run                  — start a job')}`);
  log.info(`  ${fmt.dim('GET  /api/jobs/:id/stream      — SSE progress')}`);
  log.info(`  ${fmt.dim('GET  /api/jobs/:id/report      — markdown report')}`);
  log.info(`  ${fmt.dim('GET  /api/nations/:bandNumber  — band detail (PDF OCR runs in the background worker)')}`);
  log.info(`  ${fmt.dim('GET  /api/queue                — peek at worker queue (pending / running / done / failed)')}`);
});

// Start the in-process worker — set LOOKUP_DISABLE_INPROC_WORKER=1 to skip it
// (e.g. when running a dedicated `pnpm worker` process alongside).
if (!process.env.LOOKUP_DISABLE_INPROC_WORKER) {
  startWorker();
}
