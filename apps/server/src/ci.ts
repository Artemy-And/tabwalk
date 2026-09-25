import { appendFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { checkPage, launchBrowser, mapWithConcurrency, type PageFinding } from './scanner/check.js';
import { discoverUrls } from './scanner/crawl.js';

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const;
type ImpactLevel = (typeof IMPACTS)[number];
type Threshold = ImpactLevel | 'none';

interface Group {
  kind: PageFinding['kind'];
  ruleId: string;
  impact: ImpactLevel;
  help: string;
  helpUrl: string | null;
  wcagTags: string[];
  fingerprint: string;
  target: string[];
  html: string;
  pages: string[];
}

const USAGE = `Usage: ci <url> [options]

Crawls the site from its sitemap (or home page links), checks every page
and exits with code 1 when a problem at or above --fail-on is found.

Options:
  --max-pages <n>     pages to check, default 50
  --fail-on <level>   critical | serious | moderate | minor | none, default critical
  --report <path>     JSON report file, default skiplink-report.json
  --concurrency <n>   pages checked at once, default 3
  --timeout <ms>      page load timeout, default 30000
`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function positiveInt(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) fail(`--${name} must be a positive integer, got "${raw}"`);
  return n;
}

function impactOf(raw: string | null): ImpactLevel {
  return IMPACTS.includes(raw as ImpactLevel) ? (raw as ImpactLevel) : 'minor';
}

function rank(impact: ImpactLevel): number {
  return IMPACTS.indexOf(impact);
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function table(groups: Group[]): string {
  const rows = groups.map((g) => {
    const rule = g.helpUrl ? `[${g.ruleId}](${g.helpUrl})` : g.ruleId;
    return `| ${g.kind === 'incomplete' ? 'needs review' : g.impact} | ${cell(g.help)} \`${cell(
      g.target.join(' '),
    )}\` | ${rule} | ${g.pages.length} |`;
  });
  return ['| Impact | Problem | Rule | Pages |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'max-pages': { type: 'string', default: '50' },
    'fail-on': { type: 'string', default: 'critical' },
    report: { type: 'string', default: 'skiplink-report.json' },
    concurrency: { type: 'string', default: '3' },
    timeout: { type: 'string', default: '30000' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const siteUrl = positionals[0];
if (!siteUrl) fail('Pass the URL of the site to check');
try {
  new URL(siteUrl);
} catch {
  fail(`Not a valid URL: ${siteUrl}`);
}

const failOn = values['fail-on'] as Threshold;
if (failOn !== 'none' && !IMPACTS.includes(failOn)) {
  fail(`--fail-on must be one of ${[...IMPACTS, 'none'].join(', ')}, got "${failOn}"`);
}

const maxPages = positiveInt('max-pages', values['max-pages']);
const concurrency = positiveInt('concurrency', values.concurrency);
const timeoutMs = positiveInt('timeout', values.timeout);

const urls = await discoverUrls(siteUrl, maxPages);
if (urls.length === 0) {
  console.error(`No pages found at ${siteUrl}`);
  process.exit(2);
}

console.log(`Checking ${urls.length} pages of ${siteUrl}`);

const browser = await launchBrowser(process.env.CHROMIUM_EXECUTABLE);
const groups = new Map<string, Group>();
const failedPages: { url: string; error: string }[] = [];

await mapWithConcurrency(urls, concurrency, async (url) => {
  try {
    const { findings } = await checkPage(browser, url, timeoutMs);
    for (const f of findings) {
      const key = `${f.kind}:${f.fingerprint}`;
      const group = groups.get(key) ?? {
        kind: f.kind,
        ruleId: f.ruleId,
        impact: impactOf(f.impact),
        help: f.help,
        helpUrl: f.helpUrl,
        wcagTags: f.wcagTags,
        fingerprint: f.fingerprint,
        target: f.target,
        html: f.html,
        pages: [],
      };
      if (!group.pages.includes(url)) group.pages.push(url);
      groups.set(key, group);
    }
  } catch (err) {
    failedPages.push({ url, error: err instanceof Error ? err.message : String(err) });
  }
});

await browser.close();

const sorted = [...groups.values()].sort(
  (a, b) => rank(a.impact) - rank(b.impact) || b.pages.length - a.pages.length,
);
const violations = sorted.filter((g) => g.kind === 'violation');
const incomplete = sorted.filter((g) => g.kind === 'incomplete');
const count = (impact: ImpactLevel) => violations.filter((g) => g.impact === impact).length;
const blocking = failOn === 'none' ? [] : violations.filter((g) => rank(g.impact) <= rank(failOn));
const checked = urls.length - failedPages.length;

const summary = {
  uniqueProblems: violations.length,
  critical: count('critical'),
  serious: count('serious'),
  moderate: count('moderate'),
  minor: count('minor'),
  incomplete: incomplete.length,
};

await writeFile(
  values.report,
  `${JSON.stringify(
    {
      url: siteUrl,
      scannedAt: new Date().toISOString(),
      pagesChecked: checked,
      failedPages,
      failOn,
      failed: blocking.length > 0,
      summary,
      violations,
      incomplete,
    },
    null,
    2,
  )}\n`,
);

const headline =
  `${checked} pages checked · ${summary.uniqueProblems} unique problems ` +
  `(${summary.critical} critical, ${summary.serious} serious) · ` +
  `${summary.incomplete} need a human`;

console.log(headline);
for (const g of violations) {
  const pages = `${g.pages.length} ${g.pages.length === 1 ? 'page' : 'pages'}`;
  console.log(`  [${g.impact}] ${g.ruleId} ${g.target.join(' ')}: ${g.help} (${pages})`);
}
if (failedPages.length > 0) console.log(`${failedPages.length} pages failed to load`);
console.log(`Report written to ${values.report}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const parts = [`## Accessibility: ${siteUrl}`, headline];
  if (violations.length > 0) parts.push(table(violations));
  if (incomplete.length > 0) {
    parts.push(
      `<details><summary>${incomplete.length} results need a human</summary>\n\n${table(
        incomplete,
      )}\n\n</details>`,
    );
  }
  if (failedPages.length > 0) {
    parts.push(
      `${failedPages.length} pages failed to load: ${failedPages.map((p) => p.url).join(', ')}`,
    );
  }
  parts.push(
    '> Automated checks catch part of what WCAG asks for. This is not a statement that the site ' +
      'meets any standard.',
  );
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${parts.join('\n\n')}\n`);
}

if (checked === 0) {
  console.error('No page could be loaded');
  process.exit(2);
}

if (blocking.length > 0) {
  const message = `${blocking.length} accessibility problems at or above "${failOn}"`;
  console.log(
    process.env.GITHUB_ACTIONS === 'true' ? `::error title=Skiplink::${message}` : message,
  );
  process.exit(1);
}
