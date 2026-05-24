/**
 * Background worker for slow / rate-limited jobs (PDF OCR via Claude).
 *
 * Can be embedded inside the HTTP server process (default for
 * `pnpm lookup:serve`) or run standalone (`pnpm --filter @skintyee/lookup-api worker`).
 *
 * Polls the JSON-file queue every few seconds, claims one job at a time,
 * processes it with the rate-limit-aware OCR helper, persists the result to
 * the existing per-(band, fiscalYear) cache, and updates job state. A
 * polite gap between jobs keeps us under Anthropic's tokens-per-minute cap.
 */

import { extractFundingPdf } from './util/anthropic.js';
import { claim, complete, fail, recoverStuck, pruneCompleted, requeue } from './util/queue.js';
import { put as storePut } from './util/store.js';
import { log, fmt } from './util/log.js';

const FUNDS_BUCKET = 'nations-funds';
const POLL_MS = 4000;
// Polite gap between successful OCR jobs to stay under the tokens-per-minute
// rate window (30k tokens/min on tier 1, and a single multi-page scanned PDF
// is comfortably 20k+ input tokens).
const GAP_AFTER_SUCCESS_MS = 65000;

export interface OcrJobPayload {
  documentUrl: string;
  bandNumber: string;
  bandName?: string;
  fiscalYear: string;
}

let running = false;
let stopRequested = false;

async function processNext(): Promise<boolean> {
  const job = claim('pdf-ocr');
  if (!job) return false;
  const payload = job.payload as OcrJobPayload;
  log.info(
    `${fmt.cyan('▸')} OCR job ${job.id.slice(0, 8)} — ${payload.fiscalYear} ${payload.bandName || payload.bandNumber} (attempt ${job.attempts})`,
  );
  try {
    const extracted = await extractFundingPdf(
      { url: payload.documentUrl },
      { fiscalYear: payload.fiscalYear, bandNumber: payload.bandNumber, bandName: payload.bandName },
    );
    if (!extracted) {
      fail(job.id, 'Claude returned no parseable JSON.');
      log.warn(`job ${job.id.slice(0, 8)} — no parseable JSON.`);
      return true;
    }
    const key = `${payload.bandNumber}_${payload.fiscalYear}`;
    storePut(FUNDS_BUCKET, key, extracted);
    complete(job.id, { computedTotal: extracted.computedTotal, transfers: extracted.transfers.length });
    log.ok(
      `job ${job.id.slice(0, 8)} ✔ ${extracted.transfers.length} transfers · $${extracted.computedTotal.toLocaleString()}`,
    );
    // Polite gap — leave the per-minute window before claiming the next.
    await new Promise((r) => setTimeout(r, GAP_AFTER_SUCCESS_MS));
    return true;
  } catch (err) {
    const msg = (err as Error).message || 'unknown error';
    const status = (err as any).status;
    const retryable =
      status === 429 || status === 529 || status === 503 || /rate_limit_error|overloaded_error/i.test(msg);
    const MAX_ATTEMPTS = 6;
    if (retryable && job.attempts < MAX_ATTEMPTS) {
      requeue(job.id, msg);
      log.warn(
        `job ${job.id.slice(0, 8)} ${status === 429 ? '429' : status ?? 'transient'} → requeued (attempt ${job.attempts}/${MAX_ATTEMPTS}); sleeping ${GAP_AFTER_SUCCESS_MS / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, GAP_AFTER_SUCCESS_MS));
      return true;
    }
    fail(job.id, msg);
    log.err(`job ${job.id.slice(0, 8)} ✖ ${msg.slice(0, 140)}`);
    // Wait at least one rate-window before claiming the next so a flood of
    // 429s doesn't burn through every job in seconds.
    await new Promise((r) => setTimeout(r, GAP_AFTER_SUCCESS_MS));
    return true;
  }
}

export function startWorker(): void {
  if (running) return;
  running = true;
  log.info(`${fmt.dim('worker:')} started — polling every ${POLL_MS / 1000}s for pending OCR jobs`);
  const recovered = recoverStuck();
  if (recovered) log.warn(`worker: recovered ${recovered} stuck job(s) from a previous run`);
  pruneCompleted();
  void (async function loop(): Promise<void> {
    while (!stopRequested) {
      try {
        const processed = await processNext();
        if (!processed) {
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (err) {
        log.err(`worker error: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }
    running = false;
    log.info(`${fmt.dim('worker:')} stopped`);
  })();
}

export function stopWorker(): void {
  stopRequested = true;
}

// Standalone entry: `pnpm --filter @skintyee/lookup-api worker` runs this directly.
const isStandalone = process.argv[1] && process.argv[1].endsWith('worker.ts');
if (isStandalone) {
  startWorker();
  process.on('SIGINT', () => {
    log.info(`${fmt.dim('worker:')} SIGINT — stopping…`);
    stopWorker();
    setTimeout(() => process.exit(0), 500);
  });
}
