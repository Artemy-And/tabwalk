import { type Browser, chromium, type Page } from 'playwright';
import { axeChecker } from './checkers/axe.js';
import { drawTabOrder, keyboardChecker, type TabOrder } from './checkers/keyboard.js';
import { USER_AGENT } from './crawl.js';
import { fingerprint } from './fingerprint.js';
import type { Checker, CheckFinding } from './types.js';

const CHECKERS: Checker[] = [axeChecker, keyboardChecker];

export interface PageFinding extends CheckFinding {
  checker: string;
  fingerprint: string;
}

export interface PageResult {
  title: string | null;
  findings: PageFinding[];
  tabOrder: TabOrder | null;
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
  options: { tabOrder?: boolean; ignore?: IgnoreRules } = {},
): Promise<PageResult> {
  const ignore = options.ignore ?? { rules: [], selectors: [] };
  const context = await browser.newContext({ userAgent: USER_AGENT, reducedMotion: 'reduce' });
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
    const type = response?.headers()['content-type'];
    if (type && !/html/i.test(type)) throw new NotAPageError(`Not a web page: ${type}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const title = await page.title().catch(() => null);

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
    for (const checker of CHECKERS) {
      for (const f of await checker.run(page, { ignoreSelectors: ignore.selectors })) {
        if (ignore.rules.includes(f.ruleId)) continue;
        findings.push({ ...f, checker: checker.name, fingerprint: fingerprint(f.ruleId, f.html) });
      }
    }
    const kept = await outsideIgnored(page, findings, ignore.selectors);

    const tabOrder = options.tabOrder ? await drawTabOrder(page).catch(() => null) : null;

    return { title, findings: kept, tabOrder, links };
  } finally {
    await context.close().catch(() => {});
  }
}
