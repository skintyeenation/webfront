// Full-page screenshots of the WordPress pages -> docs/media/website/.
//
// Requires the installed Google Chrome + puppeteer-core (no bundled browser):
//   npm i -g puppeteer-core   (or run from a dir where it's installed)
//   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     node docs/scripts/shoot.mjs
//
// Reads /tmp/pages.json (produced by docs/scripts/mklist.py): [{url, file}].
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'media', 'website');
const pages = JSON.parse(fs.readFileSync(process.env.PAGES || '/tmp/pages.json', 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function autoscroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const t = setInterval(() => {
        window.scrollBy(0, 400);
        y += 400;
        if (y >= document.body.scrollHeight) { clearInterval(t); window.scrollTo(0, 0); resolve(); }
      }, 80);
    });
  });
  await sleep(400);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 1000, deviceScaleFactor: 1 });

let ok = 0;
for (const p of pages) {
  try {
    await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 45000 });
    await autoscroll(page);
    await page.screenshot({ path: `${OUT}/${p.file}.png`, fullPage: true });
    ok++; console.log(`✓ ${p.file}`);
  } catch (e) {
    console.log(`✗ ${p.file} — ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
console.log(`\nDone: ${ok}/${pages.length} -> ${OUT}`);
