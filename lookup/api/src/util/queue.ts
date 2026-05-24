/**
 * Simple JSON-file-backed FIFO job queue. Used to push slow / rate-limited
 * work (PDF OCR) off the request path and let a single in-process worker
 * grind through it serially with the polite delays Anthropic's tier-1 rate
 * limits require.
 *
 * Backed by a single file `lookup/api/data/queue.json` for atomic-ish
 * persistence (we're a single-writer system). On startup it reads the file
 * so jobs survive server restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, '..', '..', 'data', 'queue.json');

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Job<T = unknown, R = unknown> {
  id: string;
  type: string;
  /** Unique key — used to dedupe enqueues for the same logical work. */
  key: string;
  payload: T;
  status: JobStatus;
  enqueuedAt: string;
  claimedAt?: string;
  completedAt?: string;
  attempts: number;
  error?: string;
  result?: R;
}

let cache: Job[] | null = null;

function readAll(): Job[] {
  if (cache) return cache;
  if (!existsSync(QUEUE_FILE)) {
    mkdirSync(dirname(QUEUE_FILE), { recursive: true });
    cache = [];
    return cache;
  }
  try {
    cache = JSON.parse(readFileSync(QUEUE_FILE, 'utf8')) as Job[];
  } catch {
    cache = [];
  }
  return cache!;
}

function writeAll(): void {
  if (!cache) return;
  mkdirSync(dirname(QUEUE_FILE), { recursive: true });
  writeFileSync(QUEUE_FILE, JSON.stringify(cache, null, 2));
}

export function enqueue<T>(type: string, key: string, payload: T): Job<T> {
  const all = readAll();
  // Dedupe by (type, key) — if a pending/running job for the same key exists,
  // return that job instead of creating a duplicate.
  const existing = all.find((j) => j.type === type && j.key === key && (j.status === 'pending' || j.status === 'running'));
  if (existing) return existing as Job<T>;
  const job: Job<T> = {
    id: randomUUID(),
    type,
    key,
    payload,
    status: 'pending',
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };
  all.push(job);
  writeAll();
  return job;
}

export function list(filter?: { type?: string; status?: JobStatus }): Job[] {
  const all = readAll();
  return all.filter((j) => (!filter?.type || j.type === filter.type) && (!filter?.status || j.status === filter.status));
}

export function findByKey(type: string, key: string): Job | undefined {
  return readAll().find((j) => j.type === type && j.key === key);
}

/** Claim the oldest pending job of a given type. Returns undefined if none. */
export function claim(type: string): Job | undefined {
  const all = readAll();
  const pending = all.find((j) => j.type === type && j.status === 'pending');
  if (!pending) return undefined;
  pending.status = 'running';
  pending.claimedAt = new Date().toISOString();
  pending.attempts += 1;
  writeAll();
  return pending;
}

export function complete<R>(id: string, result?: R): void {
  const all = readAll();
  const job = all.find((j) => j.id === id);
  if (!job) return;
  job.status = 'done';
  job.completedAt = new Date().toISOString();
  if (result !== undefined) job.result = result;
  delete job.error;
  writeAll();
}

export function fail(id: string, error: string): void {
  const all = readAll();
  const job = all.find((j) => j.id === id);
  if (!job) return;
  job.status = 'failed';
  job.completedAt = new Date().toISOString();
  job.error = error;
  writeAll();
}

/** Re-queue any 'running' jobs older than `staleMs` — they were left mid-run
 *  by a process kill / restart and need another shot. */
export function recoverStuck(staleMs = 10 * 60 * 1000): number {
  const all = readAll();
  const now = Date.now();
  let count = 0;
  for (const j of all) {
    if (j.status !== 'running') continue;
    const claimed = j.claimedAt ? new Date(j.claimedAt).getTime() : 0;
    if (now - claimed > staleMs) {
      j.status = 'pending';
      delete j.claimedAt;
      count += 1;
    }
  }
  if (count) writeAll();
  return count;
}

/** Drop completed jobs older than `keepMs` (default 30 days). */
export function pruneCompleted(keepMs = 30 * 24 * 60 * 60 * 1000): number {
  const all = readAll();
  const cutoff = Date.now() - keepMs;
  const before = all.length;
  cache = all.filter((j) => {
    if (j.status !== 'done' && j.status !== 'failed') return true;
    const t = new Date(j.completedAt || j.enqueuedAt).getTime();
    return t > cutoff;
  });
  writeAll();
  return before - cache.length;
}

export function clearCache(): void {
  cache = null;
}
