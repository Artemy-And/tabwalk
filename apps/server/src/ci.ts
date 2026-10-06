import { appendFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { checkPage, launchBrowser, NotAPageError, type PageFinding } from './scanner/check.js';
import { crawl } from './scanner/crawl.js';

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
  standards: string[];
  fingerprint: string;
  target: string[];
  html: string;
  pages: string[];
  elements: number;
}

const USAGE = `Usage: ci <url> [options]

Starts at <url> and the site's sitemap, follows links from page to page, checks
every page and exits with code 1 when a problem at or above --fail-on is found.

Options:
  --max-pages <n>     pages to check, default 50
  --include <paths>   check only pages under these paths, like /blog/,/docs/*
  --exclude <paths>   skip pages under these paths, like /tag/,*?page=*
  --fail-on <level>   critical | serious | moderate | minor | none, default critical
  --report <path>     JSON report file, default tabwalk-report.json
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
    const label =
      g.kind === 'incomplete' ? 'needs review' : g.kind === 'recommendation' ? 'advice' : g.impact;
    return `| ${label} | ${cell(g.help)} \`${cell(
      g.target.join(' '),
    )}\` | ${rule} | ${g.pages.length} |`;
  });
  return ['| Impact | Problem | Rule | Pages |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'max-pages': { type: 'string', default: '50' },
    include: { type: 'string', multiple: true },
    exclude: { type: 'string', multiple: true },
    'fail-on': { type: 'string', default: 'critical' },
    report: { type: 'string', default: 'tabwalk-report.json' },
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// repeated flags, commas or new lines; the GitHub Action passes its inputs as INPUT_* variables
function patterns(flags: string[] | undefined, input: string | undefined): string[] {
  return [...(flags ?? []), input ?? '']
    .flatMap((value) => value.split(/[\n,]/))
    .map((value) => value.trim())
    .filter(Boolean);
}

const maxPages = positiveInt('max-pages', values['max-pages']);
const concurrency = positiveInt('concurrency', values.concurrency);
const timeoutMs = positiveInt('timeout', values.timeout);
const include = patterns(values.include, process.env.INPUT_INCLUDE);
const exclude = patterns(values.exclude, process.env.INPUT_EXCLUDE);

console.log(`Checking up to ${plural(maxPages, 'page')} of ${siteUrl}`);

const browser = await launchBrowser(process.env.CHROMIUM_EXECUTABLE);
const groups = new Map<string, Group>();
const failedPages: { url: string; error: string }[] = [];
let checked = 0;

await crawl(siteUrl, {
  limit: maxPages,
  concurrency,
  rules: { include, exclude },
  visit: async (url) => {
    try {
      const { findings, links } = await checkPage(browser, url, timeoutMs);
      checked += 1;
      for (const f of findings) {
        const key = `${f.kind}:${f.fingerprint}`;
        const group = groups.get(key) ?? {
          kind: f.kind,
          ruleId: f.ruleId,
          impact: impactOf(f.impact),
          help: f.help,
          helpUrl: f.helpUrl,
          wcagTags: f.wcagTags,
          standards: f.standards,
          fingerprint: f.fingerprint,
          target: f.target,
          html: f.html,
          pages: [],
          elements: 0,
        };
        if (!group.pages.includes(url)) group.pages.push(url);
        group.elements += 1;
        groups.set(key, group);
      }
      return links;
    } catch (err) {
      // a link to a file is not a page that failed
      if (!(err instanceof NotAPageError)) {
        failedPages.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
      return [];
    }
  },
});

await browser.close();

const sorted = [...groups.values()].sort(
  (a, b) => rank(a.impact) - rank(b.impact) || b.pages.length - a.pages.length,
);
const violations = sorted.filter((g) => g.kind === 'violation');
const incomplete = sorted.filter((g) => g.kind === 'incomplete');
const recommendations = sorted.filter((g) => g.kind === 'recommendation');
const count = (impact: ImpactLevel) => violations.filter((g) => g.impact === impact).length;
const blocking = failOn === 'none' ? [] : violations.filter((g) => rank(g.impact) <= rank(failOn));

const summary = {
  uniqueProblems: violations.length,
  critical: count('critical'),
  serious: count('serious'),
  moderate: count('moderate'),
  minor: count('minor'),
  incomplete: incomplete.length,
  recommendations: recommendations.length,
  elements: violations.reduce((sum, g) => sum + g.elements, 0),
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
      recommendations,
    },
    null,
    2,
  )}\n`,
);

const headline =
  `${plural(checked, 'page')} checked · ${plural(summary.uniqueProblems, 'unique problem')} ` +
  `on ${plural(summary.elements, 'element')} (${summary.critical} critical, ${summary.serious} serious) · ` +
  `${summary.incomplete} need a human · ${plural(summary.recommendations, 'recommendation')}`;

console.log(headline);
for (const g of violations) {
  const pages = plural(g.pages.length, 'page');
  console.log(`  [${g.impact}] ${g.ruleId} ${g.target.join(' ')}: ${g.help} (${pages})`);
}
if (failedPages.length > 0) console.log(`${plural(failedPages.length, 'page')} failed to load`);
console.log(`Report written to ${values.report}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const parts = [`## Accessibility: ${siteUrl}`, headline];
  if (violations.length > 0) parts.push(table(violations));
  if (incomplete.length > 0) {
    parts.push(
      `<details><summary>${plural(incomplete.length, 'result')} ${incomplete.length === 1 ? 'needs' : 'need'} a human</summary>\n\n${table(
        incomplete,
      )}\n\n</details>`,
    );
  }
  if (recommendations.length > 0) {
    parts.push(
      `<details><summary>${plural(recommendations.length, 'recommendation')} beyond WCAG</summary>

${table(recommendations)}

</details>`,
    );
  }
  if (failedPages.length > 0) {
    parts.push(
      `${plural(failedPages.length, 'page')} failed to load: ${failedPages.map((p) => p.url).join(', ')}`,
    );
  }
  parts.push(
    '> Automated checks catch part of what WCAG asks for. This is not a statement that the site ' +
      'meets any standard.',
  );
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${parts.join('\n\n')}\n`);
}

if (checked === 0) {
  console.error(
    failedPages.length > 0 ? 'No page could be loaded' : `No pages found at ${siteUrl}`,
  );
  process.exit(2);
}

if (blocking.length > 0) {
  const message = `${blocking.length} accessibility problems at or above "${failOn}"`;
  console.log(
    process.env.GITHUB_ACTIONS === 'true' ? `::error title=Tabwalk::${message}` : message,
  );
  process.exit(1);
}
