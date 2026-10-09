import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { type Browser, chromium } from 'playwright';
import { checkPage, checkPageInEnvironments } from '../check.js';
import { scanEnvironments } from '../environments.js';
import type { CheckFinding } from '../types.js';
import { reflowChecker } from './reflow.js';

let browser: Browser;
let server: Server;
let url: string;
before(async () => {
  browser = await chromium.launch();
  const fixture = await readFile(
    new URL('../../../../../examples/reflow/index.html', import.meta.url),
    'utf8',
  );
  server = createServer((_, response) =>
    response.writeHead(200, { 'content-type': 'text/html' }).end(fixture),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
after(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

async function measure(content: string, width = 320, ignoreSelectors: string[] = []) {
  const context = await browser.newContext({ viewport: { width, height: 180 } });
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html lang="en"><head><title>Reflow</title><style>
      body{margin:0;font:16px/24px sans-serif}*{box-sizing:border-box}
      </style></head><body><main>${content}</main></body></html>`);
    return await reflowChecker.run(page, { ignoreSelectors });
  } finally {
    await context.close();
  }
}
const matches = (findings: CheckFinding[], rule: string, selector: string) =>
  findings.filter((finding) => finding.ruleId === rule && finding.target.includes(selector));

test('broken/fixed fixture reports manual reflow evidence only in selected narrow profiles', async () => {
  const broken = await checkPageInEnvironments(browser, url, 10_000, {
    environments: ['zoom-200', 'zoom-400'],
  });
  const reflow = broken.findings.filter((finding) => finding.checker === 'reflow');
  assert.ok(reflow.length >= 4);
  assert.deepEqual([...new Set(reflow.map((finding) => finding.environment?.id))].sort(), [
    'zoom-200',
    'zoom-400',
  ]);
  assert.ok(
    reflow.every(
      (finding) => finding.kind === 'incomplete' && finding.wcagTags.includes('wcag1410'),
    ),
  );
  for (const environment of ['zoom-200', 'zoom-400']) {
    const findings = reflow.filter((finding) => finding.environment?.id === environment);
    assert.equal(matches(findings, 'reflow-horizontal-scroll', '#wide').length, 1);
    assert.equal(matches(findings, 'reflow-clipped-content', '#lost').length, 1);
    assert.match(
      matches(findings, 'reflow-clipped-content', '#lost')[0]!.failureSummary!,
      /vertical clipping/,
    );
  }
  assert.match(
    reflow.find((finding) => finding.environment?.id === 'zoom-400')!.failureSummary!,
    /320 × 180 CSS px/,
  );
  const fixed = await checkPageInEnvironments(browser, `${url}?fixed`, 10_000, {
    environments: ['zoom-200', 'zoom-400'],
  });
  assert.equal(fixed.findings.filter((finding) => finding.checker === 'reflow').length, 0);
});

test('root overflow requires meaningful text or controls, not decorative width alone', async () => {
  assert.deepEqual(
    await measure('<div style="width:900px;height:20px"></div><p>Readable text</p>'),
    [],
  );
  const findings = await measure(
    '<div style="width:900px"><button id="outside" style="margin-left:700px">Continue</button></div>',
  );
  assert.equal(matches(findings, 'reflow-horizontal-scroll', '#outside').length, 1);
  assert.match(findings[0]!.failureSummary!, /document width 900 CSS px/);
});

test('visible text clipping detects both axes and points to the clipping ancestor', async () => {
  const findings = await measure(
    '<div id="clip" style="width:140px;height:24px;overflow:hidden"><p id="text" style="margin:0;white-space:nowrap">Instructions which extend beyond the available width<br>Another essential line</p></div>',
  );
  const clipped = matches(findings, 'reflow-clipped-content', '#text');
  assert.equal(clipped.length, 1);
  assert.match(clipped[0]!.failureSummary!, /clipping by #clip/);
  assert.equal(
    findings.some((finding) => finding.ruleId === 'reflow-horizontal-scroll'),
    false,
  );
});

test('root overflow hidden reports clipping instead of offering horizontal scrolling', async () => {
  const findings = await measure(
    '<style>html{overflow-x:hidden}</style><p id="hidden" style="width:900px;white-space:nowrap">Long instructions with critical content at the end of the line beyond a narrow viewport</p>',
  );
  assert.equal(matches(findings, 'reflow-clipped-content', '#hidden').length, 1);
  assert.equal(
    findings.some((finding) => finding.ruleId === 'reflow-horizontal-scroll'),
    false,
  );
});

test('zero-height clipping loses a control, while display:contents creates no clipping box', async () => {
  const findings = await measure(
    '<div id="closed" style="height:0;overflow:hidden"><button id="lost-control">Continue</button></div><div style="display:contents;overflow:hidden"><p>Ordinary readable text</p></div>',
  );
  assert.equal(matches(findings, 'reflow-clipped-content', '#lost-control').length, 1);
  assert.match(findings[0]!.failureSummary!, /vertical clipping by #closed/);
  assert.equal(findings.length, 1);
});

test('local reading scroll is flagged while fitting carousel panels and editable text are allowed', async () => {
  const findings =
    await measure(`<div style="width:300px;overflow:auto"><p id="line" style="white-space:nowrap">Long reading line with several words extending well beyond the local scroll port width</p></div>
    <div style="width:300px;overflow:auto"><div style="display:flex;width:900px"><p style="flex:0 0 300px">First panel</p><p style="flex:0 0 300px">Second panel</p><button style="flex:0 0 200px">Third panel</button></div></div>
    <label>Message<textarea style="width:200px;height:60px">Editable long text which can be scrolled normally inside the control</textarea></label>`);
  assert.equal(matches(findings, 'reflow-horizontal-scroll', '#line').length, 1);
  assert.equal(findings.length, 1);
});

test('table/code exceptions allow horizontal scrolling but do not excuse clipped cell text', async () => {
  const findings =
    await measure(`<table style="width:900px"><tr><td>Wide table</td><td><div style="height:24px;overflow:hidden"><p id="cell" style="margin:0">First line<br>Lost line</p></div></td></tr></table>
    <pre style="width:900px">Code with spatial formatting</pre>`);
  assert.equal(
    findings.some((finding) => finding.ruleId === 'reflow-horizontal-scroll'),
    false,
  );
  assert.equal(matches(findings, 'reflow-clipped-content', '#cell').length, 1);
});

test('hidden/inert content, visually hidden labels and ignored subtrees are excluded', async () => {
  const broken =
    '<p style="width:900px;white-space:nowrap">Long content which would require horizontal scrolling</p>';
  const findings = await measure(
    `<div hidden>${broken}</div><div inert>${broken}</div><div aria-hidden="true">${broken}</div>
    <div style="opacity:0">${broken}</div><div style="visibility:hidden">${broken}</div>
    <div style="position:absolute;width:1px;height:1px;overflow:hidden">${broken}</div><div id="ignore">${broken}</div>`,
    320,
    ['#ignore', 'not a [valid selector'],
  );
  assert.deepEqual(findings, []);
});

test('open shadow content is measured with reproducible selectors and host exclusions', async () => {
  const html = `<div id="widget"></div><script>document.querySelector('#widget').attachShadow({mode:'open'}).innerHTML='<p id="shadow-text" style="white-space:nowrap;width:900px">Long shadow instructions which extend beyond the available viewport width</p>';</script>`;
  const findings = await measure(html);
  assert.equal(matches(findings, 'reflow-horizontal-scroll', '#widget >>> #shadow-text').length, 1);
  assert.deepEqual(await measure(html, 320, ['#widget']), []);
});

test('rendered embedded frames advertise partial coverage rather than silently passing', async () => {
  const findings = await measure(
    '<iframe title="Embedded example" srcdoc="<p>Embedded content</p>"></iframe>',
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, 'reflow-check-limited');
  assert.match(findings[0]!.failureSummary!, /frame-content/);
  assert.deepEqual(findings[0]?.wcagTags, []);
});

test('node, finding and text budgets expose partial coverage', async () => {
  for (const [html, reason] of [
    ['<span></span>'.repeat(5100), 'node-limit'],
    [
      Array.from(
        { length: 55 },
        (_, index) =>
          `<p id="line-${index}" style="white-space:nowrap">${'Long ordinary text '.repeat(8)}</p>`,
      ).join(''),
      'finding-limit',
    ],
    [`<p>${'a'.repeat(4001)}</p>`, 'text-limit'],
  ]) {
    const findings = await measure(html!);
    const limited = findings.find((finding) => finding.ruleId === 'reflow-check-limited');
    assert.ok(limited, reason);
    assert.match(limited.failureSummary!, new RegExp(reason!));
    assert.ok(findings.length <= 51);
  }
});

test('scenario final state carries its environment, and rule exclusions apply', async () => {
  const environment = scanEnvironments(['zoom-400'])[1]!;
  const scenario = {
    name: 'Repair layout',
    path: '/',
    steps: [{ action: 'press' as const, key: 'Enter' }],
  };
  const checked = await checkPage(browser, url, 10_000, { environment, scenario });
  const finding = checked.findings.find((item) => item.checker === 'reflow');
  assert.equal(finding?.scenario?.environment, 'zoom-400');
  assert.equal(finding?.scenario?.name, 'Repair layout');
  const excluded = await checkPage(browser, url, 10_000, {
    environment,
    ignore: { rules: ['reflow-horizontal-scroll'], selectors: ['#clipped'] },
  });
  assert.equal(
    excluded.findings.some((item) => item.checker === 'reflow'),
    false,
  );
});
