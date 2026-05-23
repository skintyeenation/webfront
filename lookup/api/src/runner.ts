/**
 * Job runner. Orchestrates scrapers for a single lookup request, emits
 * ProgressEvents through an async iterable that both the CLI and the HTTP/SSE
 * server can consume.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type {
  JobOptions,
  JobResult,
  ProgressEvent,
  ScrapeResult,
  SourceLookupOpts,
} from './types.js';
import { sourceById } from './sources/index.js';
import { writeReport } from './report.js';
import { slug, timestampSlug } from './util/slug.js';

export class Job extends EventEmitter {
  id: string;
  options: JobOptions;
  events: ProgressEvent[] = [];
  status: 'pending' | 'running' | 'done' | 'failed' = 'pending';
  result?: JobResult;
  startedAt = Date.now();

  constructor(options: JobOptions) {
    super();
    this.id = randomUUID();
    this.options = options;
  }

  emitEvent(e: ProgressEvent): void {
    this.events.push(e);
    super.emit('event', e);
  }
}

const jobs = new Map<string, Job>();

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/**
 * Start a job — returns immediately. Run progresses on the event loop; consume
 * via job.on('event', …) or by replaying job.events for late SSE subscribers.
 */
export function startJob(options: JobOptions): Job {
  const job = new Job(options);
  jobs.set(job.id, job);
  // Kick off async; don't await.
  void execute(job).catch((err) => {
    job.status = 'failed';
    job.emitEvent({ type: 'log', level: 'error', message: String((err as Error).message) });
    job.emitEvent({
      type: 'job-done',
      jobId: job.id,
      reportPath: '',
      durationMs: Date.now() - job.startedAt,
    });
  });
  return job;
}

async function execute(job: Job): Promise<void> {
  job.status = 'running';
  const { mode, target, sourceIds, outDir, fetch: doFetch = true, ...rest } = job.options;
  const opts: SourceLookupOpts = rest;

  job.emitEvent({
    type: 'job-start',
    jobId: job.id,
    mode,
    target,
    sources: sourceIds,
    indigenousOnly: opts.indigenousOnly,
  });

  const results: Record<string, ScrapeResult | { error: string; searchUrl: string }> = {};

  for (const sid of sourceIds) {
    const source = sourceById(sid);
    if (!source) {
      job.emitEvent({ type: 'source-error', sourceId: sid, error: 'unknown source id' });
      continue;
    }
    job.emitEvent({ type: 'source-start', sourceId: source.id, sourceName: source.name });
    const searchUrl = source.searchUrl(target, opts);
    if (!doFetch || !source.scrape) {
      results[source.id] = { items: [], searchUrl } as unknown as ScrapeResult;
      job.emitEvent({ type: 'source-done', sourceId: source.id, count: 0, searchUrl });
      continue;
    }
    try {
      const res = await source.scrape(target, opts);
      results[source.id] = res;
      job.emitEvent({
        type: 'source-done',
        sourceId: source.id,
        count: res.items.length,
        searchUrl: res.searchUrl || searchUrl,
        warnings: res.warnings,
      });
    } catch (err) {
      const msg = (err as Error).message;
      results[source.id] = { error: msg, searchUrl };
      job.emitEvent({ type: 'source-error', sourceId: source.id, error: msg });
    }
  }

  const reportDir = join(outDir, slug(target) || 'lookup', timestampSlug());
  const reportPath = await writeReport({
    dir: reportDir,
    job,
    results,
  });

  job.status = 'done';
  job.result = {
    jobId: job.id,
    reportPath,
    results,
    durationMs: Date.now() - job.startedAt,
  };
  job.emitEvent({
    type: 'job-done',
    jobId: job.id,
    reportPath,
    durationMs: job.result.durationMs,
  });
}
