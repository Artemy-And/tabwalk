import type { Page } from 'playwright';
import type { Checker, CheckFinding } from '../types.js';
import { type Box, type Described, installKeyboardHelpers, type Stop } from './keyboard-page.js';

const MAX_STOPS = 300;
const MAX_FRAME_STOPS = 100;
const MAX_VISUAL_CHECKS = 40;
const TIME_BUDGET_MS = 20_000;
const CLIP_MARGIN = 6;

const RULES = {
  trap: {
    ruleId: 'keyboard-trap',
    impact: 'critical',
    help: 'Keyboard focus must not get stuck in one part of the page',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html',
    wcagTags: ['wcag2a', 'wcag212'],
  },
  visible: {
    ruleId: 'focus-visible',
    impact: 'serious',
    help: 'Keyboard focus must be visible',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
    wcagTags: ['wcag2aa', 'wcag247'],
  },
  obscured: {
    ruleId: 'focus-obscured',
    impact: 'serious',
    help: 'Focused elements must not be hidden under other content',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html',
    wcagTags: ['wcag22aa', 'wcag2411'],
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
  traps: CheckFinding[];
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

async function trapFinding(page: Page, cycle: Stop[]): Promise<CheckFinding | null> {
  const ids = cycle.map((s) => s.id);
  const inCycle = new Set(ids);
  const backOut = await leaves(page, 'Shift+Tab', inCycle);

  await page.evaluate((id) => window.__tabwalkKeyboard?.focus(id), ids[0] ?? 0);
  await page.keyboard.press('Escape');
  if (await leaves(page, 'Tab', inCycle)) return null;

  const box = await page.evaluate((list) => window.__tabwalkKeyboard?.container(list) ?? null, ids);
  if (!box) return null;

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
  const { stops, visible, obscured } = result;

  // tsx (esbuild keepNames) wraps named functions in __name(); a page may define its own
  await page.evaluate(
    `(() => { const __name = (fn) => fn; (${installKeyboardHelpers})(${CLIP_MARGIN}); })()`,
  );

  const index = new Map<number, number>();
  const unreached = () =>
    page.evaluate(
      (ids) => window.__tabwalkKeyboard?.unreached(ids) ?? 0,
      stops.map((s) => s.id),
    );
  let visualChecks = 0;
  let scroll: string | null = null;
  let ended = false;
  let lostFocus = 0;
  let cycleFrom = -1;
  let frame = -1;
  let frameRun = 0;

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
      result.traps.push(
        finding(
          RULES.trap,
          'incomplete',
          stop.selector,
          stop.html,
          `Focus stayed inside this frame for ${MAX_FRAME_STOPS} presses of Tab. ` +
            'Check that keyboard users can get out of it.',
        ),
      );
      if (await page.evaluate((id) => window.__tabwalkKeyboard?.floating(id), stop.id)) return;
      break;
    }
    frame = stop.frame ? stop.id : -1;
    frameRun = 0;

    const seen = index.get(stop.id);
    if (seen !== undefined) {
      if (seen === 0 && lostFocus > 0) ended = true;
      else cycleFrom = seen;
      break;
    }
    index.set(stop.id, stops.length);
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

  if (cycleFrom >= 0) {
    const cycle = stops.slice(cycleFrom);
    if (cycleFrom === 0 && (await unreached()) === 0) {
      ended = true;
    } else if (await inDialog(page, cycle)) {
      return;
    } else {
      const trap = await trapFinding(page, cycle);
      if (trap) result.traps.push(trap);
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

  const first = stops[0];
  if (!first || !inTime()) return;
  const hasTarget = await page.evaluate(
    (id) => window.__tabwalkKeyboard?.skipTarget(id) ?? null,
    first.id,
  );
  if (!hasTarget) return;
  await page.evaluate((id) => window.__tabwalkKeyboard?.focus(id), first.id);
  await page.keyboard.press('Enter');
  await settle(page);
  const landed = await press(page, 'Tab', null);
  if (!landed?.obscurer || obscured.has(landed.id)) return;
  const past = await page.evaluate(
    (id) => window.__tabwalkKeyboard?.pastSkipTarget(id) ?? false,
    landed.id,
  );
  if (past) obscured.set(landed.id, { stop: landed, how: 'skip' });
}

function report({ stops, visible, obscured, traps }: Walk): CheckFinding[] {
  const findings = [...traps];

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
    group.covered.push(stop.selector);
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

  return findings;
}

export const keyboardChecker: Checker = {
  name: 'keyboard',

  async run(page: Page): Promise<CheckFinding[]> {
    const result: Walk = { stops: [], visible: new Map(), obscured: new Map(), traps: [] };
    try {
      await walk(page, result);
    } catch (err) {
      console.warn(`[keyboard] ${page.url()}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return report(result);
  },
};
