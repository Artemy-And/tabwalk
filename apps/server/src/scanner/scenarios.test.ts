import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Browser, chromium, type Page } from 'playwright';
import { runScenario, type SiteScenario } from './scenarios.js';

let browser: Browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
});

async function fixture<T>(body: string, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><title>Scenario fixture</title><body>${body}</body></html>`,
    }),
  );
  // Browser callbacks must not depend on a helper supplied by the page.
  await page.addInitScript('window.__name = () => { throw new Error("Page helper was called"); };');
  await page.goto('http://fixture.test/settings');
  try {
    return await run(page);
  } finally {
    await context.close();
  }
}

function scenario(steps: SiteScenario['steps']): SiteScenario {
  return { name: 'Settings dialog', path: '/settings', steps };
}

test('opens an accessible modal, closes it with Escape and checks focus returns to its trigger', async () => {
  await fixture(
    `<button id="open">Open settings</button>
     <dialog id="settings" aria-labelledby="title">
       <h1 id="title">Settings</h1><button id="close" autofocus>Close</button>
     </dialog>
     <script>
       document.querySelector('#open').addEventListener('click', () => {
         document.querySelector('#settings').showModal();
       });
       document.querySelector('#close').addEventListener('click', () => {
         document.querySelector('#settings').close();
       });
     </script>`,
    async (page) => {
      const result = await runScenario(
        page,
        scenario([
          { action: 'click', selector: '#open' },
          { action: 'waitFor', selector: '#settings', state: 'visible' },
          { action: 'expectFocus', selector: '#close' },
          { action: 'press', key: 'Escape' },
          { action: 'waitFor', selector: '#settings', state: 'hidden' },
          { action: 'expectFocus', selector: '#open' },
        ]),
      );
      assert.equal(result.status, 'completed');
      assert.equal(result.error, null);
      assert.equal(result.name, 'Settings dialog');
      assert.equal(result.path, '/settings');
      assert.equal(result.steps.length, 6);
      assert.ok(result.steps.every((step) => step.status === 'completed'));
      assert.equal(result.steps[2]?.actualFocus, '#close');
      assert.equal(result.steps[5]?.actualFocus, '#open');
      assert.equal(await page.locator('#settings').isVisible(), false);
    },
  );
});

test('a missing selector fails within the step budget and later steps do not run', async () => {
  await fixture('<input id="untouched">', async (page) => {
    const started = Date.now();
    const result = await runScenario(
      page,
      scenario([
        { action: 'click', selector: '#missing' },
        { action: 'fill', selector: '#untouched', value: 'must not be filled' },
      ]),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0]?.status, 'failed');
    assert.match(result.error ?? '', /^Step 1 \(click\) (failed|exceeded its time limit)\.$/);
    assert.ok(Date.now() - started < 6_500, 'the 5 second limit bounds the failing step');
    assert.equal(await page.locator('#untouched').inputValue(), '');
  });
});

test('an invalid selector returns a controlled error without the Playwright call log', async () => {
  await fixture('<button>Open</button>', async (page) => {
    const result = await runScenario(
      page,
      scenario([{ action: 'click', selector: 'not a [valid selector' }]),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'Step 1 (click) failed.');
    assert.deepEqual(result.steps, [
      { action: 'click', selector: 'not a [valid selector', status: 'failed' },
    ]);
  });
});

test('a focus expectation fails on the real active element and stops the scenario', async () => {
  await fixture(
    '<button id="first">First</button><button id="other">Other</button>',
    async (page) => {
      const result = await runScenario(
        page,
        scenario([
          { action: 'click', selector: '#first' },
          { action: 'expectFocus', selector: '#other' },
          { action: 'click', selector: '#other' },
        ]),
      );
      assert.equal(result.status, 'failed');
      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0]?.status, 'completed');
      assert.deepEqual(result.steps[1], {
        action: 'expectFocus',
        selector: '#other',
        status: 'failed',
        actualFocus: '#first',
      });
      assert.equal(
        result.error,
        'Step 2 (expectFocus) failed: the expected element did not have focus.',
      );
      assert.equal(
        await page.locator('#first').evaluate((element) => element === document.activeElement),
        true,
      );
    },
  );
});

test('focus expectations inspect the active element inside an open shadow root', async () => {
  await fixture(
    `<div id="host"></div><script>
       document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML =
         '<button id="shadow-button">Inside</button>';
     </script>`,
    async (page) => {
      const result = await runScenario(
        page,
        scenario([
          { action: 'click', selector: '#shadow-button' },
          { action: 'expectFocus', selector: '#shadow-button' },
        ]),
      );
      assert.equal(result.status, 'completed');
      assert.equal(result.steps[1]?.actualFocus, '#shadow-button');
    },
  );
});

test('a successful fill records its selector and status without retaining the value', async () => {
  await fixture('<input id="field">', async (page) => {
    const secret = 'private-password-123';
    const result = await runScenario(
      page,
      scenario([{ action: 'fill', selector: '#field', value: secret }]),
    );
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.steps, [{ action: 'fill', selector: '#field', status: 'completed' }]);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(await page.locator('#field').inputValue(), secret);
  });
});

test('a failed fill never exposes its value or Playwright error details', async () => {
  await fixture('<button id="not-input">Button</button>', async (page) => {
    const secret = 'private-password-that-must-not-appear';
    const result = await runScenario(
      page,
      scenario([{ action: 'fill', selector: '#not-input', value: secret }]),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'Step 1 (fill) failed.');
    assert.deepEqual(result.steps, [{ action: 'fill', selector: '#not-input', status: 'failed' }]);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes('Call log'), false);
  });
});

test('the overall scenario budget stops later steps', async (t) => {
  await fixture('<button>First</button><input id="untouched">', async (page) => {
    let now = Date.now();
    t.mock.method(Date, 'now', () => now);
    const original = page.keyboard.press.bind(page.keyboard);
    t.mock.method(page.keyboard, 'press', async (key: string) => {
      await original(key);
      now += 30_001;
    });
    const result = await runScenario(
      page,
      scenario([
        { action: 'press', key: 'Tab' },
        { action: 'fill', selector: '#untouched', value: 'must not be filled' },
      ]),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'Scenario exceeded its time limit.');
    assert.deepEqual(result.steps, [
      { action: 'press', key: 'Tab', status: 'completed' },
      { action: 'fill', selector: '#untouched', status: 'failed' },
    ]);
    assert.equal(await page.locator('#untouched').inputValue(), '');
  });
});

test('password fields are rejected before any input and later steps do not run', async () => {
  await fixture(
    '<input id="password" type="password"><button id="submit">Submit</button>',
    async (page) => {
      const secret = 'must-never-enter-a-password-field';
      const result = await runScenario(
        page,
        scenario([
          { action: 'fill', selector: '#password', value: secret },
          { action: 'click', selector: '#submit' },
        ]),
      );
      assert.equal(result.status, 'failed');
      assert.equal(
        result.error,
        'Step 1 (fill) failed: password fields cannot be filled by scenarios.',
      );
      assert.deepEqual(result.steps, [{ action: 'fill', selector: '#password', status: 'failed' }]);
      assert.equal(JSON.stringify(result).includes(secret), false);
      assert.equal(await page.locator('#password').inputValue(), '');
    },
  );
});

test('navigation to another origin stops the scenario before the next step', async () => {
  await fixture(
    '<a id="leave" href="http://elsewhere.test/next">Leave</a><input id="untouched">',
    async (page) => {
      const result = await runScenario(
        page,
        scenario([
          { action: 'click', selector: '#leave' },
          { action: 'fill', selector: '#untouched', value: 'must not be filled' },
        ]),
      );
      assert.equal(result.status, 'failed');
      assert.equal(result.error, "Scenario left the site's origin.");
      assert.equal(result.steps.length, 1);
      assert.equal(await page.locator('#untouched').inputValue(), '');
    },
  );
});

test('navigation to another pathname on the same origin is allowed', async () => {
  await fixture('<a id="next" href="/next">Next</a><input id="field">', async (page) => {
    const result = await runScenario(
      page,
      scenario([
        { action: 'click', selector: '#next' },
        { action: 'fill', selector: '#field', value: 'test field' },
      ]),
    );
    assert.equal(result.status, 'completed');
    assert.equal(new URL(page.url()).pathname, '/next');
    assert.equal(await page.locator('#field').inputValue(), 'test field');
  });
});
