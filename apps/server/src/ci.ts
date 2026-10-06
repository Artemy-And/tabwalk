import { appendFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { commentMarker, GitHubError, pullRequestNumber, upsertComment } from './ci/github.js';
import {
  type Baseline,
  BaselineError,
  blockingOf,
  compare,
  type Group,
  headline,
  IMPACTS,
  impactOf,
  markdown,
  type Outcome,
  plural,
  rank,
  readBaseline,
  summarize,
  type Threshold,
} from './ci/report.js';
import { checkPage, launchBrowser, NotAPageError } from './scanner/check.js';
import { crawl } from './scanner/crawl.js';
import { loginHeaders, type SiteLogin } from './scanner/types.js';

const USAGE = `Usage: ci <url> [options]

Starts at <url> and the site's sitemap, follows links from page to page, checks
every page and exits with code 1 when a problem at or above --fail-on is found.

Options:
  --max-pages <n>           pages to check, default 50
  --include <paths>         check only pages under these paths, like /blog/,/docs/*
  --exclude <paths>         skip pages under these paths, like /tag/,*?page=*
  --ignore-rules <ids>      leave out these rules, like color-contrast,region
  --ignore-selectors <css>  leave out problems inside these elements, one selector per flag
  --http-username <user>    HTTP Basic login, like the one most staging sites have
  --http-password <pass>    its password
  --header "Name: value"    sent to the site only, like "Authorization: Bearer …"; repeat for more
  --cookie name=value       set before the first page opens; repeat for more
  --fail-on <level>         critical | serious | moderate | minor | none, default critical
  --baseline <path>         a report from an earlier run: only problems it lacks fail
  --comment                 comment on the pull request the run is for (GitHub Actions)
  --report <path>           JSON report file, default tabwalk-report.json
  --concurrency <n>         pages checked at once, default 3
  --timeout <ms>            page load timeout, default 30000
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

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'max-pages': { type: 'string', default: '50' },
    include: { type: 'string', multiple: true },
    exclude: { type: 'string', multiple: true },
    'ignore-rules': { type: 'string', multiple: true },
    'ignore-selectors': { type: 'string', multiple: true },
    'http-username': { type: 'string' },
    'http-password': { type: 'string' },
    header: { type: 'string', multiple: true },
    cookie: { type: 'string', multiple: true },
    'fail-on': { type: 'string', default: 'critical' },
    baseline: { type: 'string' },
    comment: { type: 'boolean', default: false },
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

// one selector per flag or per line, since a comma belongs to the selector
function lines(flags: string[] | undefined, input: string | undefined): string[] {
  return [...(flags ?? []), ...(input ?? '').split('\n')]
    .map((value) => value.trim())
    .filter(Boolean);
}

const ignore = {
  rules: patterns(values['ignore-rules'], process.env['INPUT_IGNORE-RULES']).map((rule) =>
    rule.toLowerCase(),
  ),
  selectors: lines(values['ignore-selectors'], process.env['INPUT_IGNORE-SELECTORS']),
};
const ignoredNote = (code: (text: string) => string) =>
  [
    ignore.rules.length > 0 ? `rules ${ignore.rules.map(code).join(', ')}` : '',
    ignore.selectors.length > 0 ? `elements inside ${ignore.selectors.map(code).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');

// a malformed entry is reported without its value, which may be a secret
function pairs(entries: string[], separator: string, what: string) {
  return entries.map((entry) => {
    const at = entry.indexOf(separator);
    if (at <= 0) fail(`Each ${what} must look like "name${separator}value"`);
    return { name: entry.slice(0, at).trim(), value: entry.slice(at + 1).trim() };
  });
}

const login: SiteLogin = {
  username: values['http-username'] || process.env['INPUT_HTTP-USERNAME'] || undefined,
  password: values['http-password'] || process.env['INPUT_HTTP-PASSWORD'] || undefined,
  headers: pairs(lines(values.header, process.env.INPUT_HEADERS), ':', 'header'),
  // a whole Cookie header pasted from a browser splits into its cookies
  cookies: pairs(
    lines(values.cookie, process.env.INPUT_COOKIES).flatMap((line) =>
      line
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
    '=',
    'cookie',
  ),
};
const signIn = [
  login.username ? 'HTTP Basic' : '',
  login.headers?.length ? plural(login.headers.length, 'header') : '',
  login.cookies?.length ? plural(login.cookies.length, 'cookie') : '',
]
  .filter(Boolean)
  .join(', ');

// read before the crawl, so a broken baseline stops the run at once
const baselinePath = values.baseline || process.env.INPUT_BASELINE || '';
let baseline: Baseline | null = null;
try {
  baseline = baselinePath ? await readBaseline(baselinePath) : null;
} catch (err) {
  if (err instanceof BaselineError) fail(err.message);
  throw err;
}
const comment = values.comment || process.env.INPUT_COMMENT?.trim().toLowerCase() === 'true';

console.log(`Checking up to ${plural(maxPages, 'page')} of ${siteUrl}`);
if (signIn) console.log(`Signing in with ${signIn}`);
if (ignoredNote(String)) console.log(`Not reported, as asked: ${ignoredNote(String)}`);
if (baseline?.problems) {
  console.log(`Comparing with ${plural(baseline.problems.length, 'problem')} in ${baseline.path}`);
} else if (baseline) {
  console.log(`No baseline at ${baseline.path} yet, so every problem counts`);
}

const browser = await launchBrowser(process.env.CHROMIUM_EXECUTABLE);
const groups = new Map<string, Group>();
const failedPages: { url: string; error: string }[] = [];
let checked = 0;

await crawl(siteUrl, {
  limit: maxPages,
  concurrency,
  rules: { include, exclude },
  headers: loginHeaders(login),
  visit: async (url) => {
    try {
      const { findings, links } = await checkPage(browser, url, timeoutMs, { ignore, login });
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
const { violations, gone } = compare(
  sorted.filter((g) => g.kind === 'violation'),
  baseline,
);
const outcome: Outcome = {
  siteUrl,
  checked,
  failedPages,
  failOn,
  ignored: ignoredNote((text) => `\`${text}\``),
  violations,
  incomplete: sorted.filter((g) => g.kind === 'incomplete'),
  recommendations: sorted.filter((g) => g.kind === 'recommendation'),
  baseline,
  gone,
  blocking: blockingOf(violations, failOn),
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
      failed: outcome.blocking.length > 0,
      ignored: ignore,
      baseline: baseline && {
        path: baseline.path,
        found: baseline.problems !== null,
        noLongerFound: gone,
      },
      summary: summarize(outcome),
      violations,
      incomplete: outcome.incomplete,
      recommendations: outcome.recommendations,
    },
    null,
    2,
  )}\n`,
);

console.log(headline(outcome));
for (const g of violations) {
  const pages = plural(g.pages.length, 'page');
  const tag = g.new === true ? ' new' : g.new === false ? ' known' : '';
  console.log(`  [${g.impact}${tag}] ${g.ruleId} ${g.target.join(' ')}: ${g.help} (${pages})`);
}
if (gone.length > 0) console.log(`${plural(gone.length, 'baseline problem')} no longer found`);
if (failedPages.length > 0) console.log(`${plural(failedPages.length, 'page')} failed to load`);
console.log(`Report written to ${values.report}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown(outcome));
}

const warn = (message: string) =>
  console.log(
    process.env.GITHUB_ACTIONS === 'true' ? `::warning title=Tabwalk::${message}` : message,
  );

// a comment that cannot be posted never fails the check itself
if (comment) {
  const number = await pullRequestNumber(process.env.GITHUB_EVENT_PATH);
  const token = process.env['INPUT_GITHUB-TOKEN'] || process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  if (number === null) {
    console.log('Not a pull request, so no comment');
  } else if (!token || !repository) {
    warn('No GitHub token to comment on the pull request with');
  } else {
    const run = process.env.GITHUB_RUN_ID;
    try {
      const done = await upsertComment(
        {
          apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
          repository,
          number,
          token,
        },
        commentMarker(siteUrl),
        markdown(outcome, {
          limit: 25,
          link: run ? `${server}/${repository}/actions/runs/${run}` : undefined,
        }),
      );
      console.log(`Comment ${done} on pull request #${number}`);
    } catch (err) {
      const status = err instanceof GitHubError ? err.status : null;
      warn(
        status === 403 || status === 404
          ? `Could not comment on pull request #${number} (HTTP ${status}). The job needs ` +
              '"permissions: pull-requests: write"; pull requests from forks only get a read-only token'
          : `Could not comment on pull request #${number}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

if (checked === 0) {
  console.error(
    failedPages.length > 0 ? 'No page could be loaded' : `No pages found at ${siteUrl}`,
  );
  process.exit(2);
}

if (outcome.blocking.length > 0) {
  const what = baseline?.problems ? 'new accessibility problem' : 'accessibility problem';
  const message = `${plural(outcome.blocking.length, what)} at or above "${failOn}"`;
  console.log(
    process.env.GITHUB_ACTIONS === 'true' ? `::error title=Tabwalk::${message}` : message,
  );
  process.exit(1);
}
