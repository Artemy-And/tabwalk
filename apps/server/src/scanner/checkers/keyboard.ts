import type { Page } from 'playwright';
import type { Checker, CheckFinding } from '../types.js';
import {
  type Box,
  type Described,
  installKeyboardHelpers,
  type OrderStop,
  type Stop,
} from './keyboard-page.js';

const MAX_STOPS = 300;
const MAX_FRAME_STOPS = 100;
const MAX_VISUAL_CHECKS = 40;
const MAX_EXITS = 3;
const ORDER_MAX_HEIGHT = 6000;
const ORDER_SCALE = 0.75;
const TIME_BUDGET_MS = 20_000;
const CLIP_MARGIN = 6;

// tsx (esbuild keepNames) wraps named functions in __name(); a page may define its own
const INSTALL = `(() => { const __name = (fn) => fn; (${installKeyboardHelpers})(${CLIP_MARGIN}); })()`;

const RULES = {
  trap: {
    ruleId: 'keyboard-trap',
    impact: 'critical',
    help: 'Keyboard focus must not get stuck in one part of the page',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html',
    wcagTags: ['wcag2a', 'wcag212'],
    standards: ['EN-9.2.1.2', 'RGAA-12.9.1', 'section508'],
  },
  visible: {
    ruleId: 'focus-visible',
    impact: 'serious',
    help: 'Keyboard focus must be visible',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
    wcagTags: ['wcag2aa', 'wcag247'],
    standards: ['EN-9.2.4.7', 'RGAA-10.7.1', 'section508'],
  },
  obscured: {
    ruleId: 'focus-obscured',
    impact: 'serious',
    help: 'Focused elements must not be hidden under other content',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html',
    wcagTags: ['wcag22aa', 'wcag2411'],
    standards: [],
  },
  skip: {
    ruleId: 'skip-link-target',
    impact: 'moderate',
    help: 'Skip links must move keyboard focus past the repeated content',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html',
    wcagTags: ['wcag2a', 'wcag241'],
    standards: ['EN-9.2.4.1', 'RGAA-12.7.1', 'section508'],
  },
} as const;

type Rule = (typeof RULES)[keyof typeof RULES];

const APPROACH = {
  forward: 'while tabbing forward',
  backward: 'while tabbing backward',
  skip: 'after the skip link',
} as const;

interface Walk {
  stops: Stop[];
  visible: Map<string, boolean>;
  obscured: Map<number, { stop: Stop; how: keyof typeof APPROACH }>;
  findings: CheckFinding[];
}

function finding(
  rule: Rule,
  kind: CheckFinding['kind'],
  target: string,
  html: string,
  failureSummary: string,
): CheckFinding {
  return {
    kind,
    ruleId: rule.ruleId,
    impact: rule.impact,
    help: rule.help,
    helpUrl: rule.helpUrl,
    wcagTags: [...rule.wcagTags],
    standards: [...rule.standards],
    target: [target],
    html,
    failureSummary,
  };
}

function listOf(selectors: string[], max = 3): string {
  const more = selectors.length > max ? ` and ${selectors.length - max} more` : '';
  return `${selectors.slice(0, max).join(', ')}${more}`;
}

function settle(page: Page): Promise<void> {
  return page.evaluate(() => window.__tabwalkKeyboard?.settle());
}

function current(page: Page): Promise<Stop | null> {
  return page.evaluate(() => window.__tabwalkKeyboard?.active() ?? null);
}

async function press(page: Page, key: string, scroll: string | null): Promise<Stop | null> {
  await page.keyboard.press(key);
  const stop = await current(page);
  if (!stop) return null;
  const moved = scroll !== null && stop.scroll !== scroll;
  if (!moved && stop.onScreen && !stop.obscurer) return stop;
  await settle(page);
  if (!stop.onScreen || stop.obscurer) {
    await page.evaluate((id) => window.__tabwalkKeyboard?.animations(id), stop.id);
  }
  if (!stop.onScreen) await page.waitForTimeout(250);
  return current(page);
}

function shoot(page: Page, clip: Box): Promise<Buffer | null> {
  return page
    .screenshot({ clip, animations: 'disabled', caret: 'hide', scale: 'css' })
    .catch(() => null);
}

function visualKey(stop: Stop): string {
  return `${stop.styleKey}|${stop.onScreen}`;
}

function sameBox(a: Box | null, b: Box): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function signature(page: Page, id: number): Promise<string> {
  return page.evaluate((i) => window.__tabwalkKeyboard?.signature(i) ?? '', id);
}

async function focusShows(page: Page, stop: Stop): Promise<boolean | null> {
  const { clip } = stop;
  if (!clip) return null;
  const styled = stop.onScreen ? await signature(page, stop.id) : null;
  await page.evaluate((id) => window.__tabwalkKeyboard?.blur(id), stop.id);
  const restyled = styled !== null && styled !== (await signature(page, stop.id));
  const now = await page.evaluate((id) => window.__tabwalkKeyboard?.clip(id) ?? null, stop.id);
  const stable = sameBox(now, clip);
  const blurred = stable && !restyled ? await shoot(page, clip) : null;
  const refocused = await page.evaluate(
    (id) => window.__tabwalkKeyboard?.focus(id) ?? false,
    stop.id,
  );
  if (restyled || !stable) return true;
  if (!blurred || !refocused) return null;
  const focused = await shoot(page, clip);
  return focused === null ? null : !focused.equals(blurred);
}

async function leaves(page: Page, key: string, cycle: Set<number>): Promise<boolean> {
  for (let i = 0; i < cycle.size + 2; i++) {
    const stop = await press(page, key, null);
    if (!stop || !cycle.has(stop.id)) return true;
  }
  return false;
}

function inDialog(page: Page, cycle: Stop[]): Promise<boolean> {
  return page.evaluate(
    (ids) => window.__tabwalkKeyboard?.inDialog(ids) ?? false,
    cycle.map((s) => s.id),
  );
}

async function released(page: Page, gone: (now: Stop | null) => boolean): Promise<boolean> {
  await page.keyboard.press('Enter');
  for (let i = 0; i < 20; i++) {
    await settle(page);
    if (gone(await current(page))) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

async function closeCycle(page: Page, cycle: Stop[]): Promise<boolean> {
  const ids = cycle.map((s) => s.id);
  const picked = await page.evaluate(
    (list) => window.__tabwalkKeyboard?.pickExit(list) ?? false,
    ids,
  );
  return picked && (await released(page, (now) => !now || !ids.includes(now.id)));
}

async function closeFrame(page: Page, stop: Stop): Promise<boolean> {
  const handle = await page.evaluateHandle(
    (id) => window.__tabwalkKeyboard?.element(id) ?? null,
    stop.id,
  );
  const frame = await handle.asElement()?.contentFrame();
  await handle.dispose();
  if (!frame) return false;
  const picked = await frame
    .evaluate(INSTALL)
    .then(() => frame.evaluate(() => window.__tabwalkKeyboard?.pickExit(null) ?? false))
    .catch(() => false);
  return picked && (await released(page, (now) => now?.id !== stop.id));
}

async function container(page: Page, cycle: Stop[]): Promise<Described | null> {
  return page.evaluate(
    (ids) => window.__tabwalkKeyboard?.container(ids) ?? null,
    cycle.map((s) => s.id),
  );
}

async function tryToLeave(page: Page, cycle: Stop[]): Promise<CheckFinding | 'left'> {
  const ids = cycle.map((s) => s.id);
  const inCycle = new Set(ids);
  const backOut = await leaves(page, 'Shift+Tab', inCycle);

  await page.evaluate((id) => window.__tabwalkKeyboard?.focus(id), ids[0] ?? 0);
  await page.keyboard.press('Escape');
  if (await leaves(page, 'Tab', inCycle)) return 'left';
  if (await closeCycle(page, cycle)) return 'left';

  const box = (await container(page, cycle)) ?? cycle[0];
  if (!box) return 'left';

  const list = listOf(
    cycle.map((s) => s.selector),
    5,
  );

  return backOut
    ? finding(
        RULES.trap,
        'incomplete',
        box.selector,
        box.html,
        `Tab keeps cycling between ${cycle.length} elements: ${list}. Shift+Tab leaves. ` +
          'Check that the rest of the page can be reached with the keyboard.',
      )
    : finding(
        RULES.trap,
        'violation',
        box.selector,
        box.html,
        `Focus cycles between ${cycle.length} elements and never leaves: ${list}. ` +
          'Tab, Shift+Tab and Escape do not get out.',
      );
}

async function walk(page: Page, result: Walk): Promise<void> {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const inTime = () => Date.now() < deadline;
  const { stops, visible, obscured, findings } = result;

  await page.evaluate(INSTALL);

  const recorded = new Set<number>();
  const index = new Map<number, number>();
  const run: Stop[] = [];
  const unreached = () =>
    page.evaluate(
      (ids) => window.__tabwalkKeyboard?.unreached(ids) ?? 0,
      stops.map((s) => s.id),
    );
  let visualChecks = 0;
  let scroll: string | null = null;
  let ended = false;
  let lostFocus = 0;
  let frame = -1;
  let frameRun = 0;
  let exits = 0;
  let start = 0;

  // after closing a dialog or frame: if it was all the walk had seen, the page starts after it
  const restart = (closed: Stop[]) => {
    exits++;
    const ids = new Set(closed.map((s) => s.id));
    if (stops.slice(start).every((s) => ids.has(s.id))) start = stops.length;
    index.clear();
    run.length = 0;
    frame = -1;
    frameRun = 0;
    scroll = null;
  };

  for (let i = 0; i < MAX_STOPS && inTime(); i++) {
    const stop = await press(page, 'Tab', scroll);
    if (!stop) {
      if (lostFocus < 2 && (await unreached()) > 0) {
        lostFocus++;
        continue;
      }
      ended = true;
      break;
    }
    scroll = stop.scroll;

    if (stop.frame && stop.id === frame) {
      if (++frameRun < MAX_FRAME_STOPS) continue;
      const floating = await page.evaluate(
        (id) => window.__tabwalkKeyboard?.floating(id) ?? false,
        stop.id,
      );
      if (floating && exits < MAX_EXITS && (await closeFrame(page, stop))) {
        restart([stop]);
        continue;
      }
      findings.push(
        finding(
          RULES.trap,
          'incomplete',
          stop.selector,
          stop.html,
          `Focus stayed inside this frame for ${MAX_FRAME_STOPS} presses of Tab. ` +
            'Check that keyboard users can get out of it.',
        ),
      );
      if (floating) return;
      break;
    }
    frame = stop.frame ? stop.id : -1;
    frameRun = 0;

    const seen = index.get(stop.id);
    if (seen !== undefined) {
      if (seen === 0 && (lostFocus > 0 || (await unreached()) === 0)) {
        ended = true;
        break;
      }
      const cycle = run.slice(seen);
      if (await inDialog(page, cycle)) {
        if (exits < MAX_EXITS && (await closeCycle(page, cycle))) {
          restart(cycle);
          continue;
        }
        const box = (await container(page, cycle)) ?? stop;
        findings.push(
          finding(
            RULES.trap,
            'incomplete',
            box.selector,
            box.html,
            'Focus stays inside this dialog and Tabwalk could not close it from the keyboard. ' +
              'Check that keyboard users can close it and reach the rest of the page.',
          ),
        );
        return;
      }
      const trap = await tryToLeave(page, cycle);
      if (trap === 'left' && exits < MAX_EXITS) {
        restart(cycle);
        continue;
      }
      if (trap !== 'left') findings.push(trap);
      break;
    }
    index.set(stop.id, run.length);
    run.push(stop);
    if (recorded.has(stop.id)) continue;
    recorded.add(stop.id);
    stops.push(stop);

    const key = visualKey(stop);
    if (stop.obscurer) {
      obscured.set(stop.id, { stop, how: 'forward' });
    } else if (!stop.frame && !visible.has(key) && visualChecks < MAX_VISUAL_CHECKS) {
      visualChecks++;
      const shows = await focusShows(page, stop);
      if (shows !== null) visible.set(key, shows);
    }
  }

  let last: Stop | null = null;
  if (!ended && inTime()) {
    const focused = await page.evaluate(() => window.__tabwalkKeyboard?.focusLast() ?? false);
    if (focused) last = await current(page);
    if (!last) return;
  }
  const back = new Set<number>();
  if (last) {
    back.add(last.id);
    if (last.obscurer && !obscured.has(last.id)) {
      obscured.set(last.id, { stop: last, how: 'backward' });
    }
  }
  frame = -1;
  frameRun = 0;
  for (let i = 0; i < MAX_STOPS && inTime(); i++) {
    const stop: Stop | null = await press(page, 'Shift+Tab', last?.scroll ?? null);
    if (!stop) break;
    last = stop;
    if (stop.frame && stop.id === frame) {
      if (++frameRun > MAX_FRAME_STOPS) break;
      continue;
    }
    frame = stop.frame ? stop.id : -1;
    frameRun = 0;
    if (back.has(stop.id)) break;
    back.add(stop.id);
    if (stop.obscurer && !obscured.has(stop.id)) {
      obscured.set(stop.id, { stop, how: 'backward' });
    }
  }

  const first = stops[start];
  if (!first || !inTime()) return;
  const target = await page.evaluate(
    (id) => window.__tabwalkKeyboard?.skipTarget(id) ?? null,
    first.id,
  );
  if (!target?.found) return;
  if (!(await page.evaluate(() => window.__tabwalkKeyboard?.anyPastSkipTarget() ?? false))) return;
  await page.evaluate((id) => window.__tabwalkKeyboard?.focus(id), first.id);
  await page.keyboard.press('Enter');
  await settle(page);
  await page.waitForTimeout(300);
  const landed = await press(page, 'Tab', null);
  if (!landed) return;
  const past = await page.evaluate(
    (id) => window.__tabwalkKeyboard?.pastSkipTarget(id) ?? false,
    landed.id,
  );
  if (!past) {
    findings.push(
      finding(
        RULES.skip,
        'violation',
        first.selector,
        first.html,
        `After the skip link, Tab moves to ${landed.selector}, which comes before ` +
          `#${target.fragment}, so the link does not skip anything.`,
      ),
    );
  } else if (landed.obscurer && !obscured.has(landed.id)) {
    obscured.set(landed.id, { stop: landed, how: 'skip' });
  }
}

function report({ stops, visible, obscured, findings: walked }: Walk): CheckFinding[] {
  const findings = [...walked];

  for (const stop of stops) {
    if (stop.frame || obscured.has(stop.id) || visible.get(visualKey(stop)) !== false) continue;
    if (!stop.onScreen) {
      findings.push(
        finding(
          RULES.visible,
          'violation',
          stop.selector,
          stop.html,
          'Keyboard focus moves to this element, but it is not visible on the screen.',
        ),
      );
    } else {
      findings.push(
        stop.textField
          ? finding(
              RULES.visible,
              'incomplete',
              stop.selector,
              stop.html,
              'Only the text cursor shows that this field has keyboard focus. Check that it is easy to see.',
            )
          : finding(
              RULES.visible,
              'violation',
              stop.selector,
              stop.html,
              'Nothing on the screen changes when this element receives keyboard focus.',
            ),
      );
    }
  }

  const byCover = new Map<string, { cover: Described; covered: string[]; ways: Set<string> }>();
  for (const { stop, how } of obscured.values()) {
    if (!stop.obscurer) continue;
    const group = byCover.get(stop.obscurer.selector) ?? {
      cover: stop.obscurer,
      covered: [],
      ways: new Set<string>(),
    };
    if (!group.covered.includes(stop.selector)) group.covered.push(stop.selector);
    group.ways.add(APPROACH[how]);
    byCover.set(stop.obscurer.selector, group);
  }

  for (const { cover, covered, ways } of byCover.values()) {
    const when = [...ways].join(' and ');
    findings.push(
      finding(
        RULES.obscured,
        'violation',
        cover.selector,
        cover.html,
        covered.length === 1
          ? `Covers ${covered[0]} when it receives keyboard focus ${when}.`
          : `Covers ${covered.length} elements when they receive keyboard focus ${when}: ` +
              `${listOf(covered)}.`,
      ),
    );
  }

  // a page that re-renders its menus hands the walk new copies of the same elements
  const reported = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.kind}|${f.ruleId}|${f.target.join(' ')}|${f.html}`;
    if (reported.has(key)) return false;
    reported.add(key);
    return true;
  });
}

function emptyWalk(): Walk {
  return { stops: [], visible: new Map(), obscured: new Map(), findings: [] };
}

export const keyboardChecker: Checker = {
  name: 'keyboard',

  async run(page: Page): Promise<CheckFinding[]> {
    let result = emptyWalk();
    for (let attempt = 0; ; attempt++) {
      try {
        await walk(page, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // closing a cookie banner sometimes reloads the page
        if (attempt === 0 && /context was destroyed|navigat/i.test(message)) {
          await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
          result = emptyWalk();
          continue;
        }
        console.warn(`[keyboard] ${page.url()}: ${message}`);
      }
      await page
        .evaluate(
          (list) => window.__tabwalkKeyboard?.setOrder(list),
          result.stops.map((s) => ({ id: s.id, visible: s.onScreen })),
        )
        .catch(() => {});
      return report(result);
    }
  },
};

export interface TabOrder {
  image: Buffer;
  width: number;
  height: number;
  stops: OrderStop[];
}

export async function drawTabOrder(page: Page): Promise<TabOrder | null> {
  const layout = await page.evaluate(
    ([max, scale]) => window.__tabwalkKeyboard?.drawOrder(max, scale) ?? null,
    [ORDER_MAX_HEIGHT, ORDER_SCALE] as const,
  );
  if (!layout) return null;
  try {
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 60,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: layout.width, height: layout.height, scale: ORDER_SCALE },
    });
    await cdp.detach();
    return {
      image: Buffer.from(data, 'base64'),
      width: Math.round(layout.width * ORDER_SCALE),
      height: Math.round(layout.height * ORDER_SCALE),
      stops: layout.stops,
    };
  } finally {
    await page.evaluate(() => window.__tabwalkKeyboard?.clearOrder()).catch(() => {});
  }
}
