import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { type Browser, chromium } from 'playwright';
import { checkPageInEnvironments } from './check.js';
import { environmentOptions, environmentsSchema, scanEnvironments } from './environments.js';

let server: Server;
let browser: Browser;
let url: string;
const PAGE = `<!doctype html><html lang="en"><head><title>Responsive fixture</title>
<style>#narrow{display:none}@media(max-width:700px){#narrow{display:block}}
#probe{width:100vw;color:#bc1234;background:#ffccdd}</style></head><body><main><h1>Responsive</h1>
<button id="open">Open</button><button id="narrow" style="width:44px;height:44px"></button>
<div id="panel" hidden><button id="modal" style="width:44px;height:44px"></button></div>
<div id="probe">Probe</div></main><script>
document.getElementById('open').onclick=()=>{if(localStorage.getItem('opened'))return;localStorage.setItem('opened','yes');document.getElementById('panel').hidden=false;document.getElementById('modal').focus()};
if(matchMedia('(forced-colors: active)').matches){const img=document.createElement('img');img.id='forced';img.src='data:,';img.width=40;img.height=40;document.querySelector('main').append(img)}
</script></body></html>`;

before(async () => {
  server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

test('selected profiles find responsive and forced-color-only issues in independent scenario states', async () => {
  const result = await checkPageInEnvironments(browser, url, 10_000, {
    environments: ['mobile', 'zoom-200', 'zoom-400', 'forced-colors'],
    scenarios: [
      {
        name: 'Open panel',
        path: '/',
        steps: [
          { action: 'click', selector: '#open' },
          { action: 'expectFocus', selector: '#modal' },
        ],
      },
    ],
  });
  assert.deepEqual(
    result.environmentRuns.map((run) => run.environment.id),
    ['desktop', 'mobile', 'zoom-200', 'zoom-400', 'forced-colors'],
  );
  for (const run of result.environmentRuns) {
    assert.equal(run.status, 'completed');
    assert.ok(run.elapsedMs > 0);
    assert.equal(
      run.scenarioRuns[0]?.status,
      'completed',
      'each profile/scenario has fresh storage',
    );
  }
  const narrow = result.findings.filter(
    (f) => f.ruleId === 'button-name' && f.target.includes('#narrow'),
  );
  assert.deepEqual([...new Set(narrow.map((f) => f.environment?.id))].sort(), [
    'mobile',
    'zoom-200',
    'zoom-400',
  ]);
  const forced = result.findings.filter(
    (f) => f.ruleId === 'image-alt' && f.target.includes('#forced'),
  );
  assert.ok(forced.length > 0);
  assert.ok(forced.every((f) => f.environment?.id === 'forced-colors'));
  const modal = result.findings.filter(
    (f) => f.ruleId === 'button-name' && f.target.includes('#modal'),
  );
  assert.equal(modal.length, 5);
  assert.ok(modal.every((f) => f.scenario?.environment === f.environment?.id));
  assert.equal(browser.contexts().length, 0);
});

test('200%/400% layout reduces the CSS viewport and forced-colors changes computed colors', async () => {
  for (const profile of scanEnvironments(['zoom-200', 'zoom-400', 'forced-colors'])) {
    const context = await browser.newContext(environmentOptions(profile));
    try {
      const page = await context.newPage();
      await page.goto(url);
      const observed = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        scale: devicePixelRatio,
        forced: matchMedia('(forced-colors: active)').matches,
        color: getComputedStyle(document.getElementById('probe')!).color,
        widthOfProbe: document.getElementById('probe')!.getBoundingClientRect().width,
      }));
      assert.equal(observed.width, profile.viewport.width);
      assert.equal(observed.height, profile.viewport.height);
      assert.equal(observed.scale, profile.deviceScaleFactor);
      assert.equal(observed.widthOfProbe, profile.viewport.width);
      assert.equal(observed.forced, profile.forcedColors === 'active');
      if (observed.forced) assert.notEqual(observed.color, 'rgb(188, 18, 52)');
      else assert.equal(observed.color, 'rgb(188, 18, 52)');
    } finally {
      await context.close();
    }
  }
});

test('an extra environment failure preserves baseline findings and is recorded as failed', async () => {
  const failing = new Proxy(browser, {
    get(target, property) {
      if (property === 'newContext')
        return (options: Parameters<Browser['newContext']>[0]) => {
          if (options?.forcedColors === 'active') throw new Error('Environment unavailable');
          return target.newContext(options);
        };
      return Reflect.get(target, property);
    },
  });
  const result = await checkPageInEnvironments(failing, url, 10_000, {
    environments: ['mobile', 'forced-colors'],
  });
  assert.equal(result.environmentRuns[2]?.status, 'failed');
  assert.equal(result.environmentRuns[2]?.keyboardCoverage, null);
  assert.ok(
    result.findings.some((f) => f.environment?.id === 'mobile' && f.ruleId === 'button-name'),
  );
  assert.equal(result.environmentRuns[0]?.status, 'completed');
});

test('unknown and repeated environments are rejected', () => {
  assert.equal(environmentsSchema.safeParse(['mobile', 'mobile']).success, false);
  assert.equal(environmentsSchema.safeParse(['unknown']).success, false);
  assert.equal(environmentsSchema.safeParse([]).success, true);
});
