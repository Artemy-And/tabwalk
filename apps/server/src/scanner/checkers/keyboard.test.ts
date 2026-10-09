import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Browser, chromium } from 'playwright';
import type { CheckFinding, CheckOptions, KeyboardCoverage } from '../types.js';
import { drawTabOrder, keyboardChecker } from './keyboard.js';

let browser: Browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
});

async function check(body: string, style = '', options?: CheckOptions): Promise<CheckFinding[]> {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('http://fixture.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><style>body{margin:0;font:16px sans-serif}${style}</style></head><body>${body}</body></html>`,
    }),
  );
  await page.goto('http://fixture.test/');
  try {
    return await keyboardChecker.run(page, options);
  } finally {
    await context.close();
  }
}

async function coverageOf(body: string, style = ''): Promise<KeyboardCoverage> {
  let coverage: KeyboardCoverage | undefined;
  await check(body, style, {
    onKeyboardCoverage: (value) => {
      coverage = value;
    },
  });
  assert.ok(coverage);
  return coverage;
}

test('a finished walk records the stops and both directions', async () => {
  const coverage = await coverageOf('<main><button>One</button><button>Two</button></main>');
  assert.equal(coverage.status, 'completed');
  assert.deepEqual(coverage.reasons, []);
  assert.equal(coverage.visitedStops, 2);
  assert.ok(coverage.forwardSteps >= 2);
  assert.ok(coverage.backwardSteps >= 2);
  assert.equal(coverage.focusStylesSkipped, 0);
});

test('links in a closed details element are not unreached stops', async () => {
  const coverage = await coverageOf(
    '<main><button>One</button><details><summary>Question</summary><a href="/a">Answer</a></details>' +
      '<details><summary>Last question</summary><a href="/b">Last answer</a></details></main>',
  );
  assert.equal(coverage.status, 'completed', coverage.reasons.join(', '));
  assert.equal(coverage.visitedStops, 3);
  assert.ok(coverage.backwardSteps >= 3);
});

test('a backward-only focus loop records partial coverage', async () => {
  const coverage = await coverageOf(
    '<button>One</button><button>Two</button><button id="third">Three</button><button id="last">Four</button>' +
      `<script>
        document.addEventListener('keydown', (event) => {
          if (event.key !== 'Tab' || !event.shiftKey) return;
          const third = document.getElementById('third');
          const last = document.getElementById('last');
          if (document.activeElement === third) {
            event.preventDefault();
            last.focus();
          }
        });
      </script>`,
  );
  assert.equal(coverage.visitedStops, 4);
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('unreached-stops'));
});

test('losing focus before finishing the backward walk records partial coverage', async () => {
  const coverage = await coverageOf(
    '<button>One</button><button>Two</button><button id="last">Three</button>' +
      `<script>
        document.getElementById('last').addEventListener('keydown', (event) => {
          if (event.key !== 'Tab' || !event.shiftKey) return;
          event.preventDefault();
          event.target.blur();
        });
      </script>`,
  );
  assert.equal(coverage.visitedStops, 3);
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('unreached-stops'));
});

test('the backward walk does not require controls in a dialog it already closed', async () => {
  const coverage = await coverageOf(
    '<div id="box" role="dialog" aria-label="Cookies"><input autofocus aria-label="Email"><button>Close</button></div>' +
      '<a href="/after">After</a>' +
      trapScript(false) +
      `<script>
        document.querySelector('#box button').addEventListener('click', () => {
          document.getElementById('box').remove();
        });
      </script>`,
  );
  assert.equal(coverage.status, 'completed');
  assert.deepEqual(coverage.reasons, []);
});

test('a trap before the last control in an open shadow root cannot look completed', async () => {
  const coverage = await coverageOf(
    `<div id="host"></div><script>
      const shadow = document.getElementById('host').attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button id="first">One</button><button id="second">Two</button><button>Three</button>';
      shadow.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const first = shadow.getElementById('first');
        const second = shadow.getElementById('second');
        if (!event.shiftKey && shadow.activeElement === second) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && shadow.activeElement === first) {
          event.preventDefault();
          second.focus();
        }
      });
    </script>`,
  );
  assert.equal(coverage.visitedStops, 2);
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('keyboard-trap'));
});

test('a finished walk through nested open shadow roots remains completed', async () => {
  const coverage = await coverageOf(
    `<div id="host"></div><script>
      const shadow = document.getElementById('host').attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button>One</button><div id="inner"></div>';
      shadow.getElementById('inner').attachShadow({ mode: 'open' }).innerHTML =
        '<button>Two</button><button>Three</button>';
    </script>`,
  );
  assert.equal(coverage.visitedStops, 3);
  assert.equal(coverage.status, 'completed');
  assert.deepEqual(coverage.reasons, []);
});

test('inert open shadow roots do not count as unreached keyboard controls', async () => {
  const coverage = await coverageOf(
    `<button>One</button><div id="host" inert></div><script>
      document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML =
        '<button>Unavailable</button>';
    </script>`,
  );
  assert.equal(coverage.visitedStops, 1);
  assert.equal(coverage.status, 'completed');
  assert.deepEqual(coverage.reasons, []);
});

test('a trapped walk records partial coverage even when it reports the trap', async () => {
  const coverage = await coverageOf(
    '<a href="/before">Before</a><div id="box"><input aria-label="Email"><button>Sign up</button></div>' +
      '<a href="/after">After</a>' +
      trapScript(false),
  );
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('keyboard-trap'));
});

test('the step cap is visible even when all visited controls have focus styles', async () => {
  const buttons = Array.from({ length: 310 }, (_, i) => `<button>Button ${i}</button>`).join('');
  const coverage = await coverageOf(buttons);
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('step-limit'));
  assert.equal(coverage.forwardSteps, 300);
  assert.equal(coverage.visitedStops, 300);
});

test('unverified focus styles beyond the visual cap are reported', async () => {
  const buttons = Array.from(
    { length: 45 },
    (_, i) => `<button class="focus-${i}" style="border-radius:${i}px">Button ${i}</button>`,
  ).join('');
  const coverage = await coverageOf(buttons);
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('focus-limit'));
  assert.equal(coverage.focusChecks, 40);
  assert.ok(coverage.focusStylesSkipped > 0);
});

test('running out of time is recorded even if no violation was detected', async (t) => {
  const page = await browser.newPage();
  await page.setContent('<button>One</button><button>Two</button>');
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const original = page.keyboard.press.bind(page.keyboard);
  t.mock.method(page.keyboard, 'press', async (key: string) => {
    now += 21_000;
    await original(key);
  });
  let coverage: KeyboardCoverage | undefined;
  await keyboardChecker.run(page, {
    onKeyboardCoverage: (value) => {
      coverage = value;
    },
  });
  await page.close();
  assert.ok(coverage);
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('time-limit'));
  assert.equal(coverage.visitedStops, 1);
});

test('a checker error cannot look like a completed walk', async () => {
  const page = await browser.newPage();
  await page.close();
  let coverage: KeyboardCoverage | undefined;
  await keyboardChecker.run(page, {
    onKeyboardCoverage: (value) => {
      coverage = value;
    },
  });
  assert.ok(coverage);
  assert.equal(coverage.status, 'partial');
  assert.ok(coverage.reasons.includes('error'));
});

function only(findings: CheckFinding[], ruleId: string): CheckFinding[] {
  return findings.filter((f) => f.ruleId === ruleId);
}

const links = '<nav><a href="/a">One</a> <a href="/b">Two</a> <a href="/c">Three</a></nav>';
const tall = '<p style="height:1600px">Long text</p>';

test('a page with default focus styles has no findings', async () => {
  const findings = await check(
    `${links}<main><button>Buy</button><input aria-label="Name"></main>`,
  );
  assert.deepEqual(findings, []);
});

test('a button without a focus style fails focus-visible', async () => {
  const findings = await check(
    `${links}<button class="buy">Buy</button>`,
    '.buy:focus{outline:none}',
  );
  const visible = only(findings, 'focus-visible');
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.kind, 'violation');
  assert.equal(visible[0]?.target[0], 'button.buy');
});

test('a focus style on the label of a hidden checkbox counts', async () => {
  const findings = await check(
    '<input type="checkbox" id="c" class="box"><label for="c">Remember me</label>',
    '.box{position:absolute;opacity:0}.box:focus-visible+label{outline:2px solid blue}',
  );
  assert.deepEqual(only(findings, 'focus-visible'), []);
});

test('a focus ring drawn on a wrapper counts', async () => {
  const findings = await check(
    '<div class="stat"><button class="value">135+</button><p>currencies</p></div>',
    '.stat{padding:16px;width:200px}.stat:focus-within{outline:2px solid blue}.value{outline:none;border:0;background:none}',
  );
  assert.deepEqual(only(findings, 'focus-visible'), []);
});

test('a hidden link that highlights its card counts', async () => {
  const findings = await check(
    '<article class="card"><a class="hidden" href="/post">Read the post</a><h2>Post title</h2></article>',
    '.card{padding:16px;border:1px solid #ccc}.card:focus-within{border-color:blue}' +
      '.hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}',
  );
  assert.deepEqual(only(findings, 'focus-visible'), []);
});

test('a walk that starts in a banner at the end of the page still covers the page', async () => {
  const findings = await check(
    `${links}<button class="buy">Buy</button><div id="consent"><button autofocus>Accept</button></div>`,
    '.buy:focus{outline:none}',
  );
  assert.equal(only(findings, 'focus-visible')[0]?.target[0], 'button.buy');
});

test('a skip link that stays off screen fails focus-visible', async () => {
  const findings = await check(
    `<a class="skip" href="#main">Skip</a>${links}<main id="main">Text</main>`,
    '.skip{position:absolute;left:-9999px}',
  );
  const visible = only(findings, 'focus-visible');
  assert.equal(visible.length, 1);
  assert.match(visible[0]?.failureSummary ?? '', /not visible on the screen/);
});

test('a text field with only a caret needs a human', async () => {
  const findings = await check(
    '<input aria-label="Name" class="plain">',
    '.plain:focus{outline:none}',
  );
  const visible = only(findings, 'focus-visible');
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.kind, 'incomplete');
});

const trapScript = (shiftEscapes: boolean) => `<script>
  const box = document.getElementById('box');
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const [first, last] = box.querySelectorAll('input, button');
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    ${shiftEscapes ? '' : 'else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }'}
  });
</script>`;

test('focus that cannot leave a box is a keyboard trap', async () => {
  const findings = await check(
    `${links}<div id="box"><input aria-label="Email"><button>Sign up</button></div><a href="/d">After</a>${trapScript(false)}`,
  );
  const traps = only(findings, 'keyboard-trap');
  assert.equal(traps.length, 1);
  assert.equal(traps[0]?.kind, 'violation');
  assert.equal(traps[0]?.target[0], '#box');
});

test('a loop that Shift+Tab can leave needs a human', async () => {
  const findings = await check(
    `${links}<div id="box"><input aria-label="Email"><button>Sign up</button></div><a href="/d">After</a>${trapScript(true)}`,
  );
  const traps = only(findings, 'keyboard-trap');
  assert.equal(traps.length, 1);
  assert.equal(traps[0]?.kind, 'incomplete');
});

test('date fields and media controls with stops of their own are not traps', async () => {
  let coverage: KeyboardCoverage | undefined;
  const findings = await check(
    `${links}<main><label>Day <input type="date"></label>` +
      '<label>Starts <input type="datetime-local"></label>' +
      '<audio controls src="data:audio/wav;base64," aria-label="Recording"></audio>' +
      '<a href="/d">After</a></main>',
    '',
    {
      onKeyboardCoverage: (value) => {
        coverage = value;
      },
    },
  );
  assert.deepEqual(only(findings, 'keyboard-trap'), []);
  assert.equal(coverage?.status, 'completed', coverage?.reasons.join(', '));
});

test('a single control that keeps focus is still a keyboard trap', async () => {
  const findings = await check(
    `${links}<input id="stuck" aria-label="Code"><a href="/d">After</a><script>
      document.getElementById('stuck').addEventListener('keydown', (e) => {
        if (e.key === 'Tab') e.preventDefault();
      });
    </script>`,
  );
  const traps = only(findings, 'keyboard-trap');
  assert.equal(traps.length, 1);
  assert.equal(traps[0]?.kind, 'violation');
});

test('a loop that Escape closes is not a trap', async () => {
  const findings = await check(
    `${links}<div id="box"><input aria-label="Email"><button>Sign up</button></div><a href="/d">After</a>
    <script>
      const box = document.getElementById('box');
      let open = true;
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') open = false;
        if (e.key !== 'Tab' || !open) return;
        const [first, last] = box.querySelectorAll('input, button');
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      });
    </script>`,
  );
  assert.deepEqual(only(findings, 'keyboard-trap'), []);
});

test('a dialog that holds focus is not a keyboard trap', async () => {
  const findings = await check(
    `${links}<div id="box" role="dialog" aria-label="Newsletter"><input aria-label="Email"><button>Sign up</button></div><a href="/d">After</a>${trapScript(false)}`,
  );
  assert.deepEqual(
    only(findings, 'keyboard-trap').map((f) => f.kind),
    ['incomplete'],
  );
});

test('a dialog that cannot be closed from the keyboard stops the walk', async () => {
  const findings = await check(
    `<div id="box" class="consent" role="dialog" aria-modal="true" aria-label="Cookies"><button autofocus>Accept</button><button>Decline</button></div>
     ${links}${tall}<footer><a href="/terms">Terms</a></footer>${trapScript(false)}`,
    '.consent{position:fixed;left:0;right:0;bottom:0;height:200px;background:#fff}',
  );
  assert.deepEqual(
    findings.map((f) => `${f.ruleId} ${f.kind}`),
    ['keyboard-trap incomplete'],
  );
});

test('a cookie dialog is closed from the keyboard and the walk goes on', async () => {
  const findings = await check(
    `<div id="box" class="consent" role="dialog" aria-modal="true" aria-label="Cookies"><button autofocus>Accept all</button><button>Reject all</button></div>
     ${links}<button class="buy">Buy</button>${trapScript(false)}
     <script>document.getElementById('box').addEventListener('click', () => document.getElementById('box').remove());</script>`,
    '.consent{position:fixed;left:0;right:0;bottom:0;height:200px;background:#fff}.buy:focus{outline:none}',
  );
  assert.deepEqual(only(findings, 'keyboard-trap'), []);
  assert.equal(only(findings, 'focus-visible')[0]?.target[0], 'button.buy');
});

test('a loop that a close button ends is not a trap', async () => {
  const findings = await check(
    `${links}<div id="box"><input aria-label="Email"><button id="close">Close</button></div><a href="/d">After</a>${trapScript(false)}
     <script>document.getElementById('close').addEventListener('click', () => { document.getElementById('box').hidden = true; });</script>`,
  );
  assert.deepEqual(only(findings, 'keyboard-trap'), []);
});

const trapFrame =
  '<iframe title="Sign up" srcdoc="<input aria-label=Email><button>Sign up</button><script>' +
  "document.addEventListener('keydown', (e) => { if (e.key !== 'Tab') return; e.preventDefault();" +
  " const [a, b] = document.querySelectorAll('input, button'); (document.activeElement === a ? b : a).focus(); });" +
  '</script>"></iframe>';

test('a frame that keeps focus does not end the walk', async () => {
  const findings = await check(
    `<a class="skip" href="#main">Skip</a><header>${links}</header>
     <main id="main"><p><a href="/crumb">Home</a> / Page</p>${trapFrame}${tall}<a href="/end">End</a></main>`,
    'header{position:sticky;top:0;height:90px;background:#fff}.skip:focus{position:static}',
  );
  assert.equal(only(findings, 'keyboard-trap')[0]?.kind, 'incomplete');
  assert.match(only(findings, 'focus-obscured')[0]?.failureSummary ?? '', /after the skip link/);
});

test('the page behind a floating frame that keeps focus is not walked', async () => {
  const findings = await check(
    `<div class="consent">${trapFrame}</div>${links}${tall}<footer><a href="/terms">Terms</a></footer>`,
    '.consent{position:fixed;left:0;right:0;bottom:0;height:200px;background:#fff}' +
      '.consent iframe{width:100%;height:100%;border:0}',
  );
  assert.deepEqual(
    findings.map((f) => `${f.ruleId} ${f.kind}`),
    ['keyboard-trap incomplete'],
  );
});

test('a cookie frame is closed from the keyboard and the walk goes on', async () => {
  const consent =
    '<div class="consent"><iframe title="Cookies" srcdoc="<button>Accept all</button><button>Reject all</button><script>' +
    "document.addEventListener('keydown', (e) => { if (e.key !== 'Tab') return; e.preventDefault();" +
    " const [a, b] = document.querySelectorAll('button'); (document.activeElement === a ? b : a).focus(); });" +
    " document.addEventListener('click', () => parent.document.querySelector('.consent').remove());" +
    '</script>"></iframe></div>';
  const findings = await check(
    `${consent}${links}<button class="buy">Buy</button>`,
    '.consent{position:fixed;left:0;right:0;bottom:0;height:200px;background:#fff}' +
      '.consent iframe{width:100%;height:100%;border:0}.buy:focus{outline:none}',
  );
  assert.deepEqual(only(findings, 'keyboard-trap'), []);
  assert.equal(only(findings, 'focus-visible')[0]?.target[0], 'button.buy');
});

test('a skip link that does not move focus fails skip-link-target', async () => {
  const findings = await check(
    `<a class="skip" href="#main">Skip</a>${links}<main id="main"><a href="/read">Read</a></main>
     <script>document.querySelector('.skip').addEventListener('click', (e) => e.preventDefault());</script>`,
  );
  assert.match(only(findings, 'skip-link-target')[0]?.failureSummary ?? '', /comes before #main/);
});

test('a working skip link passes', async () => {
  const findings = await check(
    `<a class="skip" href="#main">Skip</a>${links}<main id="main"><a href="/read">Read</a></main>`,
  );
  assert.deepEqual(findings, []);
});

test('the skip link is still checked after a loop that Escape closes', async () => {
  const findings = await check(
    `<a class="skip" href="#main">Skip</a>${links}
     <div id="box"><input aria-label="Email"><button>Sign up</button></div>
     <main id="main"><a href="/read">Read</a></main>
     <script>
       document.querySelector('.skip').addEventListener('click', (e) => e.preventDefault());
       const box = document.getElementById('box');
       let open = true;
       box.addEventListener('keydown', (e) => {
         if (e.key === 'Escape') open = false;
         if (e.key !== 'Tab' || !open) return;
         const [first, last] = box.querySelectorAll('input, button');
         if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
         else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
       });
     </script>`,
  );
  assert.deepEqual(only(findings, 'keyboard-trap'), []);
  assert.equal(only(findings, 'skip-link-target').length, 1);
});

test('a page with its own __name helper is still checked', async () => {
  const findings = await check(
    `<script>window.__name = function (_n, v) { return v; };</script>${links}<button class="buy">Buy</button>`,
    '.buy:focus{outline:none}',
  );
  assert.equal(only(findings, 'focus-visible')[0]?.target[0], 'button.buy');
});

test('a fixed bar over a focused link fails focus-obscured', async () => {
  const findings = await check(
    `${links}${tall}<footer><a href="/terms">Terms</a></footer><div class="bar">We use cookies</div>`,
    '.bar{position:fixed;left:0;right:0;bottom:0;height:120px;background:#222;color:#fff}',
  );
  const obscured = only(findings, 'focus-obscured');
  assert.equal(obscured.length, 1);
  assert.equal(obscured[0]?.target[0], 'div.bar');
  assert.match(obscured[0]?.failureSummary ?? '', /footer > a/);
});

test('a fixed bar over several focused links is one finding', async () => {
  const findings = await check(
    `${links}${tall}<footer><a href="/terms">Terms</a> <a href="/privacy">Privacy</a> <a href="/help">Help</a></footer><div class="bar">We use cookies</div>`,
    '.bar{position:fixed;left:0;right:0;bottom:0;height:120px;background:#222;color:#fff}',
  );
  const obscured = only(findings, 'focus-obscured');
  assert.equal(obscured.length, 1);
  assert.match(obscured[0]?.failureSummary ?? '', /^Covers 3 elements .*footer > a/);
});

test('a sticky header over the content after the skip link fails focus-obscured', async () => {
  const findings = await check(
    `<a class="skip" href="#main">Skip</a><header>${links}</header>
     <main id="main"><p><a href="/crumb">Home</a> / Page</p>${tall}</main>`,
    'header{position:sticky;top:0;height:90px;background:#fff}.skip:focus{position:static}',
  );
  const obscured = only(findings, 'focus-obscured');
  assert.equal(obscured.length, 1);
  assert.equal(obscured[0]?.target[0], 'header');
  assert.match(obscured[0]?.failureSummary ?? '', /after the skip link/);
});

test('a focused link that a fixed bar only partly covers passes', async () => {
  const findings = await check(
    `${links}${tall}<footer><a href="/terms">Terms</a></footer><div class="bar">We use cookies</div>`,
    'footer{height:130px}footer a{display:block;height:40px}' +
      '.bar{position:fixed;left:0;right:0;bottom:0;height:110px;background:#222;color:#fff}',
  );
  assert.deepEqual(only(findings, 'focus-obscured'), []);
});

test('a skip link that fades in over a sticky header passes', async () => {
  const findings = await check(
    `<a class="skip" href="#main">Skip</a><header>${links}</header><main id="main">${tall}</main>`,
    'header{position:sticky;top:0;height:60px;background:#fff;z-index:1}' +
      '.skip{position:fixed;top:8px;left:8px;z-index:2;background:#fff;opacity:0;transition:opacity .4s}' +
      '.skip:focus{opacity:1}',
  );
  assert.deepEqual(findings, []);
});

test('a link drawn over a sticky header with pointer-events off is not obscured', async () => {
  const findings = await check(
    `<div class="skip"><a href="#main">Skip</a></div><header>${links}</header><main id="main">${tall}</main>`,
    'header{position:sticky;top:0;height:60px;background:#fff;z-index:1}' +
      '.skip{position:fixed;top:8px;left:8px;z-index:2;pointer-events:none;background:#fff}',
  );
  assert.deepEqual(only(findings, 'focus-obscured'), []);
});

test('the tab order is drawn as a numbered picture', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.setContent(
    '<!doctype html><html lang="en"><body>' +
      '<a href="/a">One</a> <a href="/b">Two</a><p style="height:900px"></p><button>Buy</button>' +
      '<a href="/hidden" style="position:absolute;left:-9999px">Hidden</a></body></html>',
  );
  try {
    await keyboardChecker.run(page);
    const order = await drawTabOrder(page);
    assert.ok(order);
    assert.equal(order.image.subarray(8, 12).toString(), 'WEBP');
    assert.deepEqual(
      order.stops.map((s) => [s.label, s.drawn]),
      [
        ['One', true],
        ['Two', true],
        ['Buy', true],
        ['Hidden', false],
      ],
    );
    assert.equal(await page.locator('svg').count(), 0);
    if (process.env.TAB_ORDER_OUT)
      (await import('node:fs')).writeFileSync(process.env.TAB_ORDER_OUT, order.image);
  } finally {
    await context.close();
  }
});
