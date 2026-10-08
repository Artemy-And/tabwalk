import { type Browser, chromium, type Page } from 'playwright';
import { axeChecker } from './checkers/axe.js';
import { drawTabOrder, keyboardChecker, type TabOrder } from './checkers/keyboard.js';
import { USER_AGENT } from './crawl.js';
import { fingerprint } from './fingerprint.js';
import { runScenario, type ScenarioRun, type SiteScenario } from './scenarios.js';
import { type ElementShot, shootElements } from './shots.js';
import type {
  Checker,
  CheckFinding,
  KeyboardCoverage,
  ScenarioEvidence,
  SiteLogin,
  StoredScenarioRun,
} from './types.js';

const CHECKERS: Checker[] = [axeChecker, keyboardChecker];

export interface PageFinding extends CheckFinding {
  checker: string;
  fingerprint: string;
  scenario?: ScenarioEvidence | null;
}

export interface PageResult {
  title: string | null;
  findings: PageFinding[];
  tabOrder: TabOrder | null;
  keyboardCoverage: KeyboardCoverage | null;
  scenarioRun: ScenarioRun | null;
  shots: ElementShot[];
  links: string[];
}

// the address answered with a file or a download instead of a page
export class NotAPageError extends Error {}

// what a site asked a scan to leave out: whole rules, and everything inside some elements
export interface IgnoreRules {
  rules: string[];
  selectors: string[];
}

// axe skips ignored elements itself; this catches what the tab walk reported inside them
async function outsideIgnored(
  page: Page,
  findings: PageFinding[],
  selectors: string[],
): Promise<PageFinding[]> {
  if (selectors.length === 0 || findings.length === 0) return findings;
  const inside = await page
    .evaluate(
      ({ targets, selectors }) =>
        targets.map((target) => {
          try {
            const element = target ? document.querySelector(target) : null;
            return (
              element !== null &&
              selectors.some((selector) => {
                try {
                  return element.closest(selector) !== null;
                } catch {
                  return false;
                }
              })
            );
          } catch {
            return false;
          }
        }),
      { targets: findings.map((f) => f.target[0] ?? ''), selectors },
    )
    .catch(() => findings.map(() => false));
  return findings.filter((_, i) => !inside[i]);
}

export function launchBrowser(executablePath?: string): Promise<Browser> {
  return chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    ...(executablePath ? { executablePath } : {}),
  });
}

export async function checkPage(
  browser: Browser,
  url: string,
  timeoutMs: number,
  options: {
    tabOrder?: boolean;
    ignore?: IgnoreRules;
    login?: SiteLogin | null;
    scenario?: SiteScenario;
    // fingerprints the scan already has a picture of; the ones this page adds go in too
    pictured?: Set<string>;
  } = {},
): Promise<PageResult> {
  const ignore = options.ignore ?? { rules: [], selectors: [] };
  const login = options.login;
  // the page's own address; scripts and images from elsewhere never see the login
  const origin = new URL(url).origin;
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    reducedMotion: 'reduce',
    ...(login?.username
      ? { httpCredentials: { username: login.username, password: login.password ?? '', origin } }
      : {}),
  });
  if (login?.cookies?.length) {
    await context.addCookies(
      login.cookies.map(({ name, value }) => ({ name, value, url: origin })),
    );
  }
  if (login?.headers?.length) {
    const extra = Object.fromEntries(login.headers.map(({ name, value }) => [name, value]));
    await context.route('**/*', (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin) return route.continue();
      return route.continue({ headers: { ...request.headers(), ...extra } });
    });
  }
  const page = await context.newPage();

  try {
    const response = await page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes('Download is starting')) {
          throw new NotAPageError(`Not a web page: ${url}`);
        }
        throw err;
      });
    // checking the "Unauthorized" page itself would tell nobody anything
    if (response?.status() === 401) {
      throw new Error('The page asks for a login (HTTP 401)');
    }
    const type = response?.headers()['content-type'];
    if (type && !/html/i.test(type)) throw new NotAPageError(`Not a web page: ${type}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const scenarioRun = options.scenario ? await runScenario(page, options.scenario) : null;
    const title = await page.title().catch(() => null);
    if (scenarioRun?.status === 'failed') {
      return {
        title,
        findings: [],
        tabOrder: null,
        keyboardCoverage: null,
        scenarioRun,
        links: [],
        shots: [],
      };
    }

    // read before the tab walk, which presses keys on the page
    const links = await page
      .$$eval('a[href], area[href]', (elements) =>
        elements.map((el) => {
          try {
            return new URL(el.getAttribute('href') ?? '', document.baseURI).href;
          } catch {
            return '';
          }
        }),
      )
      .catch(() => [] as string[]);

    const findings: PageFinding[] = [];
    let keyboardCoverage: KeyboardCoverage | null = null;
    for (const checker of CHECKERS) {
      for (const f of await checker.run(page, {
        ignoreSelectors: ignore.selectors,
        onKeyboardCoverage: (coverage) => {
          keyboardCoverage = coverage;
        },
      })) {
        if (ignore.rules.includes(f.ruleId)) continue;
        findings.push({
          ...f,
          checker: checker.name,
          fingerprint: fingerprint(f.ruleId, f.html),
          scenario: scenarioRun
            ? { name: scenarioRun.name, path: scenarioRun.path, steps: scenarioRun.steps }
            : null,
        });
      }
    }
    const kept = await outsideIgnored(page, findings, ignore.selectors);

    const tabOrder = options.tabOrder ? await drawTabOrder(page).catch(() => null) : null;

    const shots = options.pictured ? await shootElements(page, kept, options.pictured) : [];

    return { title, findings: kept, tabOrder, keyboardCoverage, scenarioRun, links, shots };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function checkPageWithScenarios(
  browser: Browser,
  url: string,
  timeoutMs: number,
  options: Omit<NonNullable<Parameters<typeof checkPage>[3]>, 'scenario'> & {
    scenarios?: SiteScenario[];
  } = {},
): Promise<PageResult & { scenarioRuns: StoredScenarioRun[] }> {
  const { scenarios = [], ...pageOptions } = options;
  const initial = await checkPage(browser, url, timeoutMs, pageOptions);
  const scenarioRuns: StoredScenarioRun[] = [];
  for (const scenario of scenarios) {
    if (scenario.path !== new URL(url).pathname) continue;
    try {
      // Every state opens independently, with the same site login, before any checker presses keys.
      const result = await checkPage(browser, url, timeoutMs, {
        ...pageOptions,
        tabOrder: false,
        scenario,
      });
      if (!result.scenarioRun) throw new Error('Scenario did not run');
      scenarioRuns.push({
        ...result.scenarioRun,
        keyboardCoverage: result.keyboardCoverage,
        findings: result.findings.filter((f) => f.kind === 'violation').length,
      });
      initial.findings.push(...result.findings);
      initial.shots.push(...result.shots);
      initial.links.push(...result.links);
    } catch {
      scenarioRuns.push({
        name: scenario.name,
        path: scenario.path,
        status: 'failed',
        steps: [],
        error: 'The scenario page could not be loaded or checked.',
        keyboardCoverage: null,
        findings: 0,
      });
    }
  }
  return { ...initial, links: [...new Set(initial.links)], scenarioRuns };
}
