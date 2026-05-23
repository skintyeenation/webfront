/**
 * Puppeteer helper — launches a singleton headless Chrome (via puppeteer-core
 * + the user's installed browser) and exposes a `withPage` runner. Used for
 * sources whose real data only exists after JS execution
 * (Corporations Canada, CRA Charities, ISC IBD, CCAB at ccib.ca, …).
 *
 * Same dependency model as docs/scripts/shoot.mjs: no bundled chromium,
 * we point at the installed Chrome via $CHROME (default macOS path).
 */

import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { log } from './log.js';

const CHROME_PATHS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[];

let _browser: Promise<Browser> | null = null;

async function resolveExecutable(): Promise<string> {
  const { existsSync } = await import('node:fs');
  for (const p of CHROME_PATHS) {
    if (p && existsSync(p)) return p;
  }
  throw new Error(
    `No installed Chrome found. Set $CHROME to your Chrome binary, e.g.:\n  export CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`,
  );
}

async function getBrowser(): Promise<Browser> {
  if (!_browser) {
    _browser = (async () => {
      const executablePath = await resolveExecutable();
      log.info(`launching puppeteer (${executablePath})…`);
      const b = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      // Close gracefully on process exit.
      process.once('exit', () => { void b.close(); });
      process.once('SIGINT', () => { void b.close().then(() => process.exit(130)); });
      return b;
    })();
  }
  return _browser;
}

export async function withPage<T>(fn: (page: Page) => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.setDefaultTimeout(opts.timeoutMs ?? 25000);
  await page.setUserAgent('Mozilla/5.0 (compatible; skintyee-lookup/0.1)');
  await page.setViewport({ width: 1280, height: 900 });
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    const b = await _browser.catch(() => null);
    _browser = null;
    if (b) await b.close().catch(() => {});
  }
}
