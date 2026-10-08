import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { type Browser, chromium } from 'playwright';
import { checkPage, checkPageWithScenarios, type PageFinding } from './check.js';
import type { SiteScenario } from './scenarios.js';
import { loginHeaders, type SiteLogin } from './types.js';

// an image without alt text and a button without a focus style, once more inside a chat widget
const PAGE = `<!doctype html><html lang="en"><head><title>Shop</title><style>
body{margin:0;font:16px sans-serif}.buy:focus,.send:focus{outline:none}
</style></head><body>
<nav><a href="/a">One</a> <a href="/b">Two</a> <a href="/c">Three</a></nav>
<main><h1>Shop</h1><button class="buy">Buy</button><img class="photo" src="data:," width="40" height="40">
<div id="chat"><button class="send">Send</button><img class="avatar" src="data:," width="40" height="40"></div>
</main></body></html>`;

const SCENARIO_PAGE = `<!doctype html><html lang="en"><head><title>Settings</title></head><body>
<main><h1>Settings</h1><button id="open">Open settings</button>
<dialog id="settings" aria-label="Profile settings">
<label for="field">Email</label><input id="field" type="email" autofocus>
<button id="unnamed" style="width:40px;height:40px"></button>
<img id="modal-image" src="data:," width="40" height="40">
</dialog></main>
<script>
  document.getElementById('open').addEventListener('click', () => {
    if (localStorage.getItem('scenario-opened')) return;
    localStorage.setItem('scenario-opened', 'yes');
    document.getElementById('settings').showModal();
  });
</script></body></html>`;

const FAILED_SCENARIO_PAGE = `<!doctype html><html lang="en"><head><title>Failed state</title></head><body>
<main><h1>Failed state</h1><label for="field">Email</label><input id="field">
<button id="other">Other</button><img src="data:," width="40" height="40"></main></body></html>`;

let server: Server;
let url: string;
let browser: Browser;

before(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    const pathname = new URL(req.url ?? '/', 'http://fixture.test').pathname;
    res.end(
      pathname === '/scenario'
        ? SCENARIO_PAGE
        : pathname === '/scenario-failed'
          ? FAILED_SCENARIO_PAGE
          : PAGE,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const targets = (findings: PageFinding[], ruleId: string) =>
  findings.filter((f) => f.ruleId === ruleId).map((f) => f.target.join(' '));

test('without anything to ignore, both copies of each problem are reported', async () => {
  const { findings, keyboardCoverage } = await checkPage(browser, url, 10_000);
  assert.equal(keyboardCoverage?.status, 'completed');
  assert.equal(keyboardCoverage?.visitedStops, 5);
  assert.equal(targets(findings, 'image-alt').length, 2);
  assert.equal(targets(findings, 'focus-visible').length, 2);
});

test('problems inside an ignored element are left out, from axe and the tab walk alike', async () => {
  const { findings } = await checkPage(browser, url, 10_000, {
    // a selector that does not parse must not cost the rest of the page
    ignore: { rules: [], selectors: ['#chat', 'not a [valid selector'] },
  });
  const images = targets(findings, 'image-alt');
  const buttons = targets(findings, 'focus-visible');
  assert.equal(images.length, 1);
  assert.ok(images[0]?.includes('photo'), images[0]);
  assert.equal(buttons.length, 1);
  assert.ok(buttons[0]?.includes('buy'), buttons[0]);
});

test('an ignored rule is left out, the others stay', async () => {
  const { findings } = await checkPage(browser, url, 10_000, {
    ignore: { rules: ['image-alt'], selectors: [] },
  });
  assert.equal(targets(findings, 'image-alt').length, 0);
  assert.equal(targets(findings, 'focus-visible').length, 2);
});

// a staging site that opens only with the right login, whose page pulls a script from elsewhere
let staging: Server;
let elsewhere: Server;
let stagingUrl: string;
const seenElsewhere: { authorization?: string; token?: string; cookie?: string }[] = [];

before(async () => {
  elsewhere = createServer((req, res) => {
    seenElsewhere.push({
      authorization: req.headers.authorization,
      token: req.headers['x-staging-token'] as string | undefined,
      cookie: req.headers.cookie,
    });
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end('void 0;');
  });
  await new Promise<void>((resolve) => elsewhere.listen(0, resolve));
  // another host name, so not even a cookie for 127.0.0.1 may go there
  const script = `http://localhost:${(elsewhere.address() as AddressInfo).port}/lib.js`;

  const basic = `Basic ${Buffer.from('user:secret').toString('base64')}`;
  staging = createServer((req, res) => {
    const allowed =
      req.headers.authorization === basic ||
      req.headers['x-staging-token'] === 'abc' ||
      (req.headers.cookie ?? '').includes('session=abc');
    if (!allowed) {
      res.writeHead(401, {
        'www-authenticate': 'Basic realm="staging"',
        'content-type': 'text/html',
      });
      res.end('<p>Unauthorized</p>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      `<!doctype html><html lang="en"><title>Staging</title><main><h1>Staging</h1>` +
        `<img src="data:," width="10" height="10"></main><script src="${script}"></script></html>`,
    );
  });
  await new Promise<void>((resolve) => staging.listen(0, resolve));
  stagingUrl = `http://127.0.0.1:${(staging.address() as AddressInfo).port}/`;
});

after(async () => {
  await new Promise<void>((resolve) => staging.close(() => resolve()));
  await new Promise<void>((resolve) => elsewhere.close(() => resolve()));
});

test('a page behind a login fails with a clear reason when there is none', async () => {
  await assert.rejects(checkPage(browser, stagingUrl, 10_000), /asks for a login/);
});

const logins: [string, SiteLogin][] = [
  ['HTTP Basic', { username: 'user', password: 'secret' }],
  ['a header', { headers: [{ name: 'X-Staging-Token', value: 'abc' }] }],
  ['a cookie', { cookies: [{ name: 'session', value: 'abc' }] }],
];

for (const [label, login] of logins) {
  test(`${label} opens the page, and the script from elsewhere never sees it`, async () => {
    seenElsewhere.length = 0;
    const { findings } = await checkPage(browser, stagingUrl, 10_000, { login });
    assert.ok(findings.some((f) => f.ruleId === 'image-alt'));
    assert.ok(seenElsewhere.length > 0, 'the script was loaded');
    for (const seen of seenElsewhere) {
      assert.deepEqual(seen, { authorization: undefined, token: undefined, cookie: undefined });
    }
  });
}

test('the login headers a plain fetch needs', () => {
  assert.deepEqual(
    loginHeaders({
      username: 'user',
      password: 'secret',
      headers: [{ name: 'X-Staging-Token', value: 'abc' }],
      cookies: [
        { name: 'session', value: 'abc' },
        { name: 'theme', value: 'dark' },
      ],
    }),
    {
      authorization: `Basic ${Buffer.from('user:secret').toString('base64')}`,
      'x-staging-token': 'abc',
      cookie: 'session=abc; theme=dark',
    },
  );
  assert.deepEqual(loginHeaders(null), {});
});

test('each new problem gets one picture, and a later page with the same problems none', async () => {
  const pictured = new Set<string>();
  const first = await checkPage(browser, url, 10_000, { pictured });
  const problems = new Set(
    first.findings.filter((f) => f.kind !== 'recommendation').map((f) => f.fingerprint),
  );
  assert.equal(first.shots.length, problems.size);
  for (const shot of first.shots) {
    assert.ok(problems.has(shot.fingerprint));
    assert.equal(shot.image.subarray(8, 12).toString('ascii'), 'WEBP');
    assert.ok(shot.width > 0 && shot.height > 0);
  }

  const again = await checkPage(browser, url, 10_000, { pictured });
  assert.equal(again.shots.length, 0);
});

test('scenarios check independently opened modal states and retain only redacted step evidence', async () => {
  const secrets = ['private-scenario-first@example.test', 'private-scenario-second@example.test'];
  const scenarios: SiteScenario[] = secrets.map((value, index) => ({
    name: `Profile state ${index + 1}`,
    path: '/scenario',
    steps: [
      { action: 'click', selector: '#open' },
      { action: 'waitFor', selector: '#settings', state: 'visible' },
      { action: 'fill', selector: '#field', value },
      { action: 'expectFocus', selector: '#field' },
    ],
  }));
  scenarios.push({
    name: 'Other pathname',
    path: '/scenario/',
    steps: [{ action: 'click', selector: '#must-not-run' }],
  });
  const result = await checkPageWithScenarios(browser, `${url}scenario`, 10_000, { scenarios });
  assert.equal(result.scenarioRun, null);
  assert.equal(result.scenarioRuns.length, 2);
  assert.equal(result.keyboardCoverage?.status, 'completed');
  for (const [index, run] of result.scenarioRuns.entries()) {
    assert.equal(run.name, scenarios[index]?.name);
    assert.equal(run.path, '/scenario');
    assert.equal(run.status, 'completed');
    assert.equal(run.error, null);
    assert.equal(run.steps.length, 4);
    assert.ok(run.steps.every((step) => step.status === 'completed'));
    assert.deepEqual(run.steps[2], { action: 'fill', selector: '#field', status: 'completed' });
    assert.equal(run.steps[3]?.actualFocus, '#field');
    assert.ok(run.keyboardCoverage);
    assert.ok(run.findings >= 2, 'the open modal is checked for real accessibility findings');
  }
  const modalFindings = result.findings.filter(
    (finding) => finding.ruleId === 'image-alt' && finding.target.includes('#modal-image'),
  );
  assert.equal(modalFindings.length, 2);
  assert.deepEqual(modalFindings.map((finding) => finding.scenario?.name).sort(), [
    'Profile state 1',
    'Profile state 2',
  ]);
  for (const finding of modalFindings) {
    assert.deepEqual(finding.scenario, {
      environment: 'desktop',
      name: finding.scenario?.name,
      path: '/scenario',
      steps: result.scenarioRuns.find((run) => run.name === finding.scenario?.name)?.steps,
    });
  }
  assert.equal(
    result.findings.some((finding) => !finding.scenario && finding.target.includes('#modal-image')),
    false,
    'the hidden modal must not be reported in the initial state',
  );
  for (const secret of secrets) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(browser.contexts().length, 0, 'every initial and scenario context is closed');
});

test('a failed scenario skips accessibility checkers and keeps earlier fill values out of results', async () => {
  const secret = 'private-failed-scenario@example.test';
  const result = await checkPage(browser, `${url}scenario-failed`, 10_000, {
    tabOrder: true,
    pictured: new Set(),
    scenario: {
      name: 'Focus must move',
      path: '/scenario-failed',
      steps: [
        { action: 'fill', selector: '#field', value: secret },
        { action: 'expectFocus', selector: '#other' },
        { action: 'click', selector: '#other' },
      ],
    },
  });
  assert.equal(result.scenarioRun?.status, 'failed');
  assert.equal(result.scenarioRun?.steps.length, 2, 'later steps are skipped');
  assert.deepEqual(result.scenarioRun?.steps[0], {
    action: 'fill',
    selector: '#field',
    status: 'completed',
  });
  assert.deepEqual(result.scenarioRun?.steps[1], {
    action: 'expectFocus',
    selector: '#other',
    status: 'failed',
    actualFocus: '#field',
  });
  assert.equal(result.keyboardCoverage, null);
  assert.equal(result.tabOrder, null);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.shots, []);
  assert.deepEqual(result.links, []);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(browser.contexts().length, 0);
});

test('a failed scenario preserves the initial findings and does not prevent a later state from being checked', async () => {
  const result = await checkPageWithScenarios(browser, `${url}scenario-failed`, 10_000, {
    scenarios: [
      {
        name: 'Wrong initial focus',
        path: '/scenario-failed',
        steps: [{ action: 'expectFocus', selector: '#other' }],
      },
      {
        name: 'Field filled',
        path: '/scenario-failed',
        steps: [
          { action: 'fill', selector: '#field', value: 'private-later-state@example.test' },
          { action: 'expectFocus', selector: '#field' },
        ],
      },
    ],
  });
  assert.deepEqual(
    result.scenarioRuns.map((run) => run.status),
    ['failed', 'completed'],
  );
  assert.equal(result.scenarioRuns[0]?.keyboardCoverage, null);
  assert.equal(result.scenarioRuns[0]?.findings, 0);
  assert.ok(result.scenarioRuns[1]?.keyboardCoverage);
  const missingAlt = result.findings.filter((finding) => finding.ruleId === 'image-alt');
  assert.equal(missingAlt.length, 2);
  assert.equal(missingAlt.filter((finding) => !finding.scenario).length, 1);
  assert.equal(missingAlt.filter((finding) => finding.scenario?.name === 'Field filled').length, 1);
  assert.equal(
    result.findings.some((finding) => finding.scenario?.name === 'Wrong initial focus'),
    false,
  );
  assert.equal(JSON.stringify(result).includes('private-later-state@example.test'), false);
  assert.equal(browser.contexts().length, 0);
});
