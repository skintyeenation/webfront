/**
 * @skintyee/lookup-api CLI. Three commands:
 *
 *   lookup business <target>     # search registries by name
 *   lookup money    <keyword>    # search contracts / grants / bids
 *   lookup serve                 # start the HTTP/SSE server for the RN app
 *   lookup sources               # list known sources
 */

import { Command, Option } from 'commander';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { ALL_SOURCES, defaultSelected, sourceById, sourcesByMode } from './sources/index.js';
import { startJob } from './runner.js';
import type { SourceMode } from './types.js';
import { log, fmt } from './util/log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultOut = join(__dirname, '..', 'out');

const program = new Command();
program
  .name('lookup')
  .description('Skin Tyee Lookup — Canadian / BC business + government money lookup tool')
  .version('0.0.0');

program
  .command('sources')
  .description('List known lookup sources')
  .option('--mode <mode>', 'Filter by mode (business | money)')
  .action((opts: { mode?: SourceMode }) => {
    const list = opts.mode ? sourcesByMode(opts.mode) : ALL_SOURCES;
    console.log('');
    for (const s of list) {
      const auth = s.requiresAuth ? ` (${s.requiresAuth})` : '';
      const scrape = s.scrape ? fmt.green('● scrape') : fmt.grey('○ link only');
      console.log(`  ${fmt.bold(s.id.padEnd(28))} ${scrape}  ${fmt.dim(`[${s.mode}]`)} ${s.name}${auth}`);
      console.log(`  ${' '.repeat(28)}    ${fmt.dim(s.category + ' · ' + s.format)}`);
    }
    console.log('');
  });

interface LookupFlags {
  interactive?: boolean;
  sources?: string;
  all?: boolean;
  indigenousOnly?: boolean;
  website?: string;
  vendor?: string;
  from?: string;
  to?: string;
  minValue?: string;
  maxValue?: string;
  regionId?: string;
  bcOnly?: boolean;
  out?: string;
  noFetch?: boolean;
}

async function pickSources(mode: SourceMode, opts: LookupFlags): Promise<string[]> {
  if (opts.all) {
    return sourcesByMode(mode).map((s) => s.id);
  }
  if (opts.sources) {
    return opts.sources.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (opts.interactive) {
    const selected = await checkbox({
      message: `Sources (${mode})`,
      choices: sourcesByMode(mode).map((s) => ({
        name: `${s.name}  ${s.scrape ? '⚡' : '↗'}  ${s.requiresAuth ? '(' + s.requiresAuth + ') ' : ''}— ${s.category}`,
        value: s.id,
        checked: opts.indigenousOnly
          ? !!(s.scrape || s.autoSelectOnIndigenous)
          : !!s.scrape,
      })),
      pageSize: 20,
    });
    return selected;
  }
  return defaultSelected(mode, !!opts.indigenousOnly);
}

async function runLookup(mode: SourceMode, target: string, opts: LookupFlags): Promise<void> {
  const sourceIds = await pickSources(mode, opts);
  if (!sourceIds.length) {
    log.warn('No sources selected.');
    return;
  }

  const job = startJob({
    mode,
    target,
    sourceIds,
    outDir: opts.out ?? defaultOut,
    indigenousOnly: !!opts.indigenousOnly || mode === 'nations',
    website: opts.website,
    vendor: opts.vendor,
    fromYear: opts.from ? Number(opts.from) : undefined,
    toYear: opts.to ? Number(opts.to) : undefined,
    minValue: opts.minValue ? Number(opts.minValue) : undefined,
    maxValue: opts.maxValue ? Number(opts.maxValue) : undefined,
    regionId: opts.regionId || (opts.bcOnly ? '9' : undefined),
    fetch: !opts.noFetch,
  });

  log.info('');
  log.info(fmt.cyan(`▸ Lookup ${mode}: "${target}"  ${opts.indigenousOnly ? fmt.yellow('(Indigenous-only)') : ''}`));
  log.info(fmt.dim(`  Sources: ${sourceIds.join(', ')}`));
  log.info('');

  await new Promise<void>((resolve) => {
    job.on('event', (e) => {
      switch (e.type) {
        case 'source-start':
          process.stdout.write(`  ${fmt.dim('…')} ${e.sourceName}`);
          break;
        case 'source-done':
          process.stdout.write(`\r  ${fmt.green('✔')} ${sourceById(e.sourceId)?.name ?? e.sourceId}  ${fmt.dim(`(${e.count} items)`)}\n`);
          break;
        case 'source-error':
          process.stdout.write(`\r  ${fmt.red('✖')} ${sourceById(e.sourceId)?.name ?? e.sourceId}  ${fmt.red(e.error)}\n`);
          break;
        case 'job-done':
          log.info('');
          log.ok(`Report → ${e.reportPath}`);
          resolve();
          break;
      }
    });
  });
}

const businessCmd = program
  .command('business <target>')
  .description('Search business registries by name')
  .option('-i, --interactive', 'Pick sources interactively')
  .option('-s, --sources <ids>', 'Comma-separated source ids')
  .option('--all', 'Use every business source')
  .option('--indigenous-only', 'Restrict / prioritise Indigenous-owned sources')
  .option('--website <url>', 'Also scrape this website (home/about/contact)')
  .option('--out <dir>', 'Output directory', defaultOut)
  .option('--no-fetch', 'Skip network — only emit search URLs')
  .action(async (target: string, opts: LookupFlags) => {
    await runLookup('business', target, opts);
  });

const moneyCmd = program
  .command('money <keyword>')
  .description('Search government contracts / grants / bids by keyword')
  .option('-i, --interactive', 'Pick sources interactively')
  .option('-s, --sources <ids>', 'Comma-separated source ids')
  .option('--all', 'Use every money source')
  .option('--indigenous-only', 'PSIB/CLCAA on contracts; ISC/CIRNAC on grants; Indigenous keywords on bids')
  .option('--vendor <name>', 'Restrict to a specific recipient/vendor')
  .option('--from <YYYY>', 'Start year')
  .option('--to <YYYY>', 'End year')
  .option('--min-value <n>', 'Minimum value')
  .option('--max-value <n>', 'Maximum value')
  .option('--out <dir>', 'Output directory', defaultOut)
  .option('--no-fetch', 'Skip network — only emit search URLs')
  .action(async (keyword: string, opts: LookupFlags) => {
    await runLookup('money', keyword, opts);
  });

const nationsCmd = program
  .command('nations <name>')
  .description('Search First Nation registries by name (band registry, FMA-certified Nations)')
  .option('-i, --interactive', 'Pick sources interactively')
  .option('-s, --sources <ids>', 'Comma-separated source ids')
  .option('--all', 'Use every nations source')
  .option('--bc-only', 'Restrict to BC bands (ISC region 9). Default off in CLI; default on in the app.')
  .option('--region-id <id>', 'ISC regional-office id (e.g. 9=BC). Wins over --bc-only.')
  .option('--out <dir>', 'Output directory', defaultOut)
  .option('--no-fetch', 'Skip network — only emit search URLs')
  .action(async (name: string, opts: LookupFlags) => {
    await runLookup('nations', name, opts);
  });

program
  .command('interactive')
  .alias('i')
  .description('Fully interactive: pick mode, target, sources, options')
  .action(async () => {
    const mode = (await select({
      message: 'Mode',
      choices: [
        { name: 'business — search registries by name', value: 'business' },
        { name: 'money — search contracts / grants / bids by keyword', value: 'money' },
      ],
    })) as SourceMode;
    const target = await input({ message: mode === 'business' ? 'Company / org name' : 'Keyword', validate: (s) => !!s.trim() });
    const indigenousOnly = await confirm({ message: 'Indigenous-only filter?', default: true });
    const opts: LookupFlags = { interactive: true, indigenousOnly };
    if (mode === 'business') {
      const w = await input({ message: 'Optional company website (blank to skip)' });
      if (w) opts.website = w;
    }
    await runLookup(mode, target, opts);
  });

void businessCmd; // referenced to keep TS happy if no other code uses the var
void moneyCmd;
void nationsCmd;

await program.parseAsync(process.argv);
