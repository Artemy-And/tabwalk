import type { Page } from 'playwright';

export type ScenarioStep =
  | { action: 'click'; selector: string }
  | { action: 'fill'; selector: string; value: string }
  | { action: 'press'; key: string }
  | { action: 'waitFor'; selector: string; state: 'visible' | 'hidden' }
  | { action: 'expectFocus'; selector: string };

export interface SiteScenario {
  name: string;
  // Exact pathname of the page on which the caller starts this scenario.
  path: string;
  steps: ScenarioStep[];
}

export type ScenarioStepEvidence = (
  | { action: 'click' | 'fill' | 'expectFocus'; selector: string }
  | { action: 'press'; key: string }
  | { action: 'waitFor'; selector: string; state: 'visible' | 'hidden' }
) & {
  status: 'completed' | 'failed';
  actualFocus?: string | null;
};

export interface ScenarioRun {
  name: string;
  path: string;
  status: 'completed' | 'failed';
  steps: ScenarioStepEvidence[];
  error: string | null;
}

const STEP_TIMEOUT_MS = 5_000;
const SCENARIO_TIMEOUT_MS = 30_000;
const TIMED_OUT = Symbol('scenario-timeout');
const PASSWORD_FIELD = Symbol('scenario-password-field');

interface FocusCheck {
  matches: boolean;
  actualFocus: string | null;
}

// Keep browser callbacks self contained without nested named functions: tsx can
// otherwise insert __name calls that depend on a helper supplied by the page.
function inspectFocus(target: Element): FocusCheck {
  let actual = target.ownerDocument.activeElement;
  while (actual?.shadowRoot?.activeElement) actual = actual.shadowRoot.activeElement;
  const actualFocus = actual ? (actual.id ? `#${CSS.escape(actual.id)}` : actual.localName) : null;
  return { matches: actual === target, actualFocus };
}

function evidenceOf(step: ScenarioStep): ScenarioStepEvidence {
  // Never spread a step: fill values can contain passwords or other secrets.
  switch (step.action) {
    case 'press':
      return { action: step.action, key: step.key, status: 'failed' };
    case 'waitFor':
      return {
        action: step.action,
        selector: step.selector,
        state: step.state,
        status: 'failed',
      };
    default:
      return { action: step.action, selector: step.selector, status: 'failed' };
  }
}

async function bounded<T>(operation: () => Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(TIMED_OUT), timeout);
  });
  try {
    return await Promise.race([operation(), limit]);
  } finally {
    clearTimeout(timer);
  }
}

async function execute(
  page: Page,
  step: ScenarioStep,
  evidence: ScenarioStepEvidence,
  timeout: number,
): Promise<boolean> {
  switch (step.action) {
    case 'click':
      await page.locator(step.selector).click({ timeout });
      return true;
    case 'fill': {
      const target = page.locator(step.selector);
      const passwordField = await target.evaluate(
        (element) => element instanceof HTMLInputElement && element.type === 'password',
        undefined,
        { timeout },
      );
      if (passwordField) throw PASSWORD_FIELD;
      await target.fill(step.value, { timeout });
      return true;
    }
    case 'press':
      await page.keyboard.press(step.key);
      return true;
    case 'waitFor':
      await page.locator(step.selector).waitFor({ state: step.state, timeout });
      return true;
    case 'expectFocus': {
      const focus = await page
        .locator(step.selector)
        .evaluate(inspectFocus, undefined, { timeout });
      evidence.actualFocus = focus.actualFocus;
      return focus.matches;
    }
  }
}

// The caller owns navigation, login and context cleanup. A failed run must not be
// checked: a timed-out browser command may still be settling until its context closes.
export async function runScenario(page: Page, scenario: SiteScenario): Promise<ScenarioRun> {
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
  const origin = new URL(page.url()).origin;
  const run: ScenarioRun = {
    name: scenario.name,
    path: scenario.path,
    status: 'completed',
    steps: [],
    error: null,
  };

  for (const [index, step] of scenario.steps.entries()) {
    const evidence = evidenceOf(step);
    run.steps.push(evidence);
    if (new URL(page.url()).origin !== origin) {
      run.status = 'failed';
      run.error = "Scenario left the site's origin.";
      return run;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      run.status = 'failed';
      run.error = 'Scenario exceeded its time limit.';
      return run;
    }

    try {
      const completed = await bounded(
        () => execute(page, step, evidence, Math.min(STEP_TIMEOUT_MS, remaining)),
        Math.min(STEP_TIMEOUT_MS, remaining),
      );
      if (new URL(page.url()).origin !== origin) {
        run.status = 'failed';
        run.error = "Scenario left the site's origin.";
        return run;
      }
      if (!completed) {
        run.status = 'failed';
        run.error = `Step ${index + 1} (expectFocus) failed: the expected element did not have focus.`;
        return run;
      }
      evidence.status = 'completed';
    } catch (error) {
      run.status = 'failed';
      // Playwright errors include call logs, page content and sometimes fill values.
      run.error =
        error === TIMED_OUT
          ? `Step ${index + 1} (${step.action}) exceeded its time limit.`
          : error === PASSWORD_FIELD
            ? `Step ${index + 1} (fill) failed: password fields cannot be filled by scenarios.`
            : `Step ${index + 1} (${step.action}) failed.`;
      return run;
    }
  }
  return run;
}
