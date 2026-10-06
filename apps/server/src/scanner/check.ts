import { type Browser, chromium } from 'playwright';
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
  options: { tabOrder?: boolean } = {},
): Promise<PageResult> {
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
      for (const f of await checker.run(page)) {
        findings.push({ ...f, checker: checker.name, fingerprint: fingerprint(f.ruleId, f.html) });
      }
    }

    const tabOrder = options.tabOrder ? await drawTabOrder(page).catch(() => null) : null;

    return { title, findings, tabOrder, links };
  } finally {
    await context.close().catch(() => {});
  }
}
