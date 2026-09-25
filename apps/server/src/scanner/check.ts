import { type Browser, chromium } from 'playwright';
import { axeChecker } from './checkers/axe.js';
import { USER_AGENT } from './crawl.js';
import { fingerprint } from './fingerprint.js';
import type { Checker, CheckFinding } from './types.js';

const CHECKERS: Checker[] = [axeChecker];

export interface PageFinding extends CheckFinding {
  checker: string;
  fingerprint: string;
}

export interface PageResult {
  title: string | null;
  findings: PageFinding[];
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
): Promise<PageResult> {
  const context = await browser.newContext({ userAgent: USER_AGENT, reducedMotion: 'reduce' });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const title = await page.title().catch(() => null);

    const findings: PageFinding[] = [];
    for (const checker of CHECKERS) {
      for (const f of await checker.run(page)) {
        findings.push({ ...f, checker: checker.name, fingerprint: fingerprint(f.ruleId, f.html) });
      }
    }

    return { title, findings };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
