import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { type Browser, chromium } from 'playwright';
import { checkPage, type PageFinding } from './check.js';

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
