import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { type Browser, chromium } from 'playwright';
import { checkPage, type PageFinding } from './check.js';
import { loginHeaders, type SiteLogin } from './types.js';

// an image without alt text and a button without a focus style, once more inside a chat widget
const PAGE = `<!doctype html><html lang="en"><head><title>Shop</title><style>
body{margin:0;font:16px sans-serif}.buy:focus,.send:focus{outline:none}
</style></head><body>
<nav><a href="/a">One</a> <a href="/b">Two</a> <a href="/c">Three</a></nav>
<main><h1>Shop</h1><button class="buy">Buy</button><img class="photo" src="data:," width="40" height="40">
<div id="chat"><button class="send">Send</button><img class="avatar" src="data:," width="40" height="40"></div>
</main></body></html>`;

let server: Server;
let url: string;
let browser: Browser;

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
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
  const { findings } = await checkPage(browser, url, 10_000);
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
