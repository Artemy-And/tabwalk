import assert from 'node:assert/strict';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPage, launchBrowser, type PageFinding, type PageResult } from './scanner/check.js';
import type { OrderStop } from './scanner/checkers/keyboard-page.js';
import type { KeyboardCoverageReason } from './scanner/types.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const siteDir = resolve(root, 'apps/site');
const output = resolve(siteDir, 'demo');
const shopDir = resolve(root, 'examples/demo-site');
const fixtureDir = resolve(root, 'examples/keyboard-trap');
const repository = 'https://github.com/Artemy-And/tabwalk';
const coverageReasons: Record<KeyboardCoverageReason, string> = {
  'time-limit': 'The 20-second time budget was reached.',
  'step-limit': 'The 300-step limit in a direction was reached.',
  'keyboard-trap': 'A focus cycle prevented the forward walk from continuing.',
  'dialog-blocked': 'A dialog could not be closed with the keyboard.',
  'frame-limit': 'The keyboard walk could not finish traversing a frame.',
  'frame-content': 'Focus styles inside embedded frames were not checked.',
  'focus-limit': 'The 40-check focus-style limit was reached.',
  'focus-unavailable': 'Some focus styles could not be verified.',
  'unreached-stops': 'Some potentially focusable controls were not reached.',
  error: 'The keyboard checker encountered an error.',
};
const esc = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webm': 'video/webm',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let base = shopDir;
    let relative = pathname.slice(1);
    if (pathname.startsWith('/keyboard-trap/')) {
      base = fixtureDir;
      relative = pathname.slice('/keyboard-trap/'.length);
    } else if (pathname.startsWith('/preview/')) {
      base = siteDir;
      relative = pathname.slice('/preview/'.length);
    }
    const file = resolve(base, relative + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(base + sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await launchBrowser(process.env.CHROMIUM_EXECUTABLE);

interface SamplePage {
  path: string;
  title: string | null;
  findings: PageFinding[];
  keyboardCoverage: PageResult['keyboardCoverage'];
  tabOrder: { image: string; width: number; height: number; stops: OrderStop[] } | null;
}
interface DemoPicture {
  image: string;
  width: number;
  height: number;
  sourcePath: string;
  finding: PageFinding;
}
interface FindingGroup extends PageFinding {
  pages: string[];
  occurrences: number;
  shot?: Omit<DemoPicture, 'finding'>;
}

async function snapshot(path: string, name: string): Promise<SamplePage> {
  const result = await checkPage(browser, origin + path, 30_000, { tabOrder: true, pictured });
  const tabOrder = result.tabOrder;
  if (tabOrder) await writeFile(resolve(output, `order-${name}.webp`), tabOrder.image);
  for (const shot of result.shots) {
    await writeFile(resolve(output, `finding-${shot.fingerprint}.webp`), shot.image);
    const finding = result.findings.find(
      (f) =>
        f.fingerprint === shot.fingerprint &&
        f.html === shot.html &&
        JSON.stringify(f.target) === JSON.stringify(shot.target),
    );
    assert.ok(finding, 'Every screenshot must have matching element evidence');
    pictures.set(`${finding.kind}:${shot.fingerprint}`, {
      image: `finding-${shot.fingerprint}.webp`,
      width: shot.width,
      height: shot.height,
      sourcePath: path,
      finding,
    });
  }
  return {
    path,
    title: result.title,
    findings: result.findings,
    keyboardCoverage: result.keyboardCoverage,
    tabOrder: tabOrder
      ? {
          image: `order-${name}.webp`,
          width: tabOrder.width,
          height: tabOrder.height,
          stops: tabOrder.stops,
        }
      : null,
  };
}
const pictured = new Set<string>();
const pictures = new Map<string, DemoPicture>();
const wcag = (page: SamplePage, checker: string) =>
  page.findings.filter((f) => f.kind === 'violation' && f.checker === checker).length;

try {
  await mkdir(output, { recursive: true });
  const broken = await snapshot('/keyboard-trap/', 'broken');
  const fixed = await snapshot('/keyboard-trap/?fixed', 'fixed');
  assert.equal(
    wcag(broken, 'axe-core'),
    0,
    'The story requires a fixture with no axe WCAG violations',
  );
  assert.equal(wcag(fixed, 'axe-core'), 0);
  assert.ok(broken.findings.some((f) => f.ruleId === 'keyboard-trap' && f.kind === 'violation'));
  assert.equal(wcag(fixed, 'keyboard'), 0);
  console.log(
    'Verified the example: axe has no WCAG violations; the keyboard trap disappears after the fix.',
  );

  const paths = (await readdir(shopDir, { recursive: true }))
    .filter((file) => file.endsWith('.html'))
    .sort()
    .map((file) => (file === 'index.html' ? '/' : `/${file.replaceAll('\\', '/')}`));
  const pages: SamplePage[] = [];
  for (const [index, path] of paths.entries()) {
    console.log(`Scanning demo shop ${path}`);
    pages.push(await snapshot(path, String(index)));
  }
  const groups = new Map<string, FindingGroup>();
  for (const page of pages) {
    for (const finding of page.findings) {
      const key = `${finding.kind}:${finding.fingerprint}`;
      const picture = pictures.get(key);
      const group = groups.get(key) ?? {
        ...(picture?.finding ?? finding),
        pages: [],
        occurrences: 0,
        shot: picture
          ? {
              image: picture.image,
              width: picture.width,
              height: picture.height,
              sourcePath: picture.sourcePath,
            }
          : undefined,
      };
      if (!group.pages.includes(page.path)) group.pages.push(page.path);
      group.occurrences++;
      groups.set(key, group);
    }
  }
  const rank = (f: FindingGroup) =>
    f.kind === 'incomplete'
      ? 4
      : f.kind === 'recommendation'
        ? 5
        : ['critical', 'serious', 'moderate', 'minor'].indexOf(f.impact ?? 'minor');
  const findings = [...groups.values()].sort(
    (a, b) =>
      rank(a) - rank(b) || b.pages.length - a.pages.length || a.ruleId.localeCompare(b.ruleId),
  );
  const violations = findings.filter((f) => f.kind === 'violation');
  const summary = {
    uniqueProblems: violations.length,
    critical: violations.filter((f) => f.impact === 'critical').length,
    needsHuman: findings.filter((f) => f.kind === 'incomplete').length,
    affectedElements: violations.reduce((n, f) => n + f.occurrences, 0),
    pagesChecked: pages.length,
    partialKeyboardPages: pages.filter((p) => p.keyboardCoverage?.status !== 'completed').length,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      repository,
      branch: 'develop',
      build: 'unreleased',
      fixtures: ['examples/demo-site', 'examples/keyboard-trap'],
      viewport: { width: 1280, height: 720 },
      command: 'pnpm --filter @tabwalk/server demo:build',
    },
    summary,
    keyboardExample: { broken, fixed },
    findings,
    pages,
  };
  await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const comparison = `<table class="comparison"><caption class="sr-only">WCAG violations detected in the two versions</caption><thead><tr><th scope="col">Check</th><th scope="col">Broken</th><th scope="col">Fixed</th></tr></thead><tbody><tr><th scope="row">axe-core violations</th><td>${wcag(broken, 'axe-core')}</td><td>${wcag(fixed, 'axe-core')}</td></tr><tr><th scope="row">Keyboard violations</th><td class="c-critical">${wcag(broken, 'keyboard')} trap</td><td class="c-good">${wcag(fixed, 'keyboard')}</td></tr></tbody></table>`;
  const stats = [
    [summary.uniqueProblems, 'unique problems', ''],
    [summary.critical, 'critical', 'c-critical'],
    [summary.needsHuman, 'need a human', 'c-review'],
    [summary.pagesChecked, 'pages checked', ''],
  ]
    .map(
      ([n, label, tone]) =>
        `<div class="demo-stat"><strong class="${tone}">${n}</strong><span>${label}</span></div>`,
    )
    .join('\n');
  const findingHtml = findings
    .map((f, i) => {
      const label =
        f.kind === 'incomplete'
          ? 'Needs a human'
          : f.kind === 'recommendation'
            ? 'Recommendation'
            : f.impact;
      const tone =
        f.kind !== 'violation' ? 'c-review' : f.impact === 'critical' ? 'c-critical' : 'c-serious';
      return `<details class="finding" data-checker="${esc(f.checker)}" data-kind="${esc(f.kind)}"${i === 0 ? ' open' : ''}><summary><span class="badge ${tone}">${esc(label)}</span>${esc(f.help)}</summary>
<p class="finding-meta">${esc(f.checker)} · ${esc(f.ruleId)} · ${f.pages.length} page(s) · ${f.occurrences} element(s)</p>
<p class="finding-meta">${esc([...f.wcagTags, ...f.standards].join(' · '))}</p>
${f.shot ? `<img src="${esc(f.shot.image)}" width="${f.shot.width}" height="${f.shot.height}" loading="lazy" alt="An affected element, outlined on the demo page"><p class="finding-meta">Pictured on: ${esc(f.shot.sourcePath)}. The HTML and selector below describe this element.</p>` : ''}
<pre><code>${esc(f.html)}</code></pre><p class="finding-meta">${esc(f.target.join(' '))}</p>
${f.failureSummary ? `<p>${esc(f.failureSummary)}</p>` : ''}
<p>Found on: ${f.pages.map(esc).join(', ')}</p>
${f.helpUrl ? `<p><a href="${esc(f.helpUrl)}">Read the rule guidance</a></p>` : ''}</details>`;
    })
    .join('\n');
  const pageHtml = pages
    .map((p) => {
      const c = p.keyboardCoverage;
      const coverage = c
        ? `${c.status === 'completed' ? 'Walk completed' : 'Partial walk'} · ${c.visitedStops} stops visited · ${c.focusStylesTested} focus style samples tested${c.focusStylesSkipped ? ` · ${c.focusStylesSkipped} unverified` : ''}`
        : 'Coverage not recorded';
      return `<details><summary>${esc(p.path)} — ${esc(p.title)}</summary><p class="coverage">${esc(coverage)}</p>${c?.reasons.length ? `<p class="coverage">Limits or omissions: ${esc(c.reasons.map((reason) => coverageReasons[reason]).join(' '))}</p>` : ''}
${p.tabOrder ? `<img src="${esc(p.tabOrder.image)}" width="${p.tabOrder.width}" height="${p.tabOrder.height}" loading="lazy" alt="Numbered keyboard stops on ${esc(p.path)}"><ol>${p.tabOrder.stops.map((s) => `<li>${esc(s.label || 'No text')} <code>${esc(s.selector)}</code></li>`).join('')}</ol>` : ''}</details>`;
    })
    .join('\n');
  let html = await readFile(resolve(root, 'examples/public-demo/report.html'), 'utf8');
  const values: Record<string, string> = {
    COMPARISON: comparison,
    STATS: stats,
    FINDINGS: findingHtml,
    PAGES: pageHtml,
    FINDING_COUNT: String(findings.length),
    SCAN_META: `Generated ${report.generatedAt.slice(0, 10)} · develop snapshot · ${summary.affectedElements} affected elements · ${summary.partialKeyboardPages} page(s) with partial keyboard coverage. Open a finding for evidence and a page for its Tab order.`,
  };
  for (const [key, value] of Object.entries(values)) html = html.replaceAll(`{{${key}}}`, value);
  assert.ok(!html.includes('{{'), 'Every report template value must be filled');
  await writeFile(resolve(output, 'index.html'), html);

  // The recording uses real keyboard presses on both versions, rather than an animated mock.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
    recordVideo: { dir: output, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  const video = page.video();
  await page.goto(`${origin}/keyboard-trap/`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(output, 'keyboard-poster.webp'), type: 'webp' });
  for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Escape', 'Tab']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1100);
  }
  assert.equal(await page.locator('input').evaluate((el) => document.activeElement === el), true);
  await page.goto(`${origin}/keyboard-trap/?fixed`);
  await page.waitForTimeout(2000);
  for (const [i, key] of [
    'Tab',
    'Tab',
    'Tab',
    'Tab',
    'Shift+Tab',
    'Shift+Tab',
    'Shift+Tab',
  ].entries()) {
    await page.keyboard.press(key);
    if (i === 3)
      assert.equal(
        await page.locator('.after').evaluate((el) => document.activeElement === el),
        true,
      );
    await page.waitForTimeout(1100);
  }
  await page.waitForTimeout(3000);
  await context.close();
  assert.ok(video);
  await video.saveAs(resolve(output, 'keyboard-demo.webm'));
  await video.delete();
  await copyFile(
    resolve(output, 'keyboard-poster.webp'),
    resolve(root, 'docs/screenshots/keyboard-demo.webp'),
  );
  console.log(JSON.stringify(summary));
  console.log('Generated apps/site/demo/index.html, report.json and the keyboard recording.');
} finally {
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}
