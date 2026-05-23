/**
 * Tiny key/value store backed by JSON files on disk — used to cache scraped
 * band details across runs. Zero deps (no SQLite native compile), simple to
 * inspect (one file per record), survives server restarts.
 *
 * Records land under `lookup/api/data/<bucket>/<key>.json`. Each record is
 * envelope-shaped:
 *
 *   { fetchedAt: <ISO>, data: <T> }
 *
 * Reads are sync (small files; happens once per request). Writes are async.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, '..', '..', 'data');

export interface Record<T> {
  fetchedAt: string;
  data: T;
}

function bucketPath(bucket: string): string {
  const p = join(DATA_ROOT, bucket);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
  return p;
}

function recordPath(bucket: string, key: string): string {
  // Defensive — don't let `..` or `/` escape the bucket dir.
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(bucketPath(bucket), `${safe}.json`);
}

export function get<T>(bucket: string, key: string): Record<T> | undefined {
  const p = recordPath(bucket, key);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<T>;
  } catch {
    return undefined;
  }
}

export function put<T>(bucket: string, key: string, data: T): Record<T> {
  const env: Record<T> = { fetchedAt: new Date().toISOString(), data };
  writeFileSync(recordPath(bucket, key), JSON.stringify(env, null, 2));
  return env;
}

export function list<T>(bucket: string): Array<Record<T> & { key: string }> {
  const p = bucketPath(bucket);
  if (!existsSync(p)) return [];
  const out: Array<Record<T> & { key: string }> = [];
  for (const f of readdirSync(p)) {
    if (!f.endsWith('.json')) continue;
    try {
      const env = JSON.parse(readFileSync(join(p, f), 'utf8')) as Record<T>;
      out.push({ ...env, key: f.replace(/\.json$/, '') });
    } catch {
      // skip malformed records
    }
  }
  return out.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
}

export function ageMs<T>(record: Record<T>): number {
  return Date.now() - new Date(record.fetchedAt).getTime();
}

/** Buckets used by the lookup tool. */
export const BUCKETS = {
  nations: 'nations',
} as const;
