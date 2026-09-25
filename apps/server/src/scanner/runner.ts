import { eq, sql } from 'drizzle-orm';
import { type Browser, chromium } from 'playwright';
import { db } from '../db/index.js';
import { issues, pages, scans, sites } from '../db/schema.js';
import { env } from '../env.js';
import { axeChecker } from './checkers/axe.js';
import { discoverUrls } from './crawl.js';
import { fingerprint } from './fingerprint.js';
import type { Checker } from './types.js';

const CHECKERS: Checker[] = [axeChecker];

async function mapWithConcurrency<T, R>(
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

async function scanOnePage(browser: Browser, scanId: string, url: string): Promise<boolean> {
  const context = await browser.newContext({
    userAgent: 'Skiplink/0.1 (+accessibility scanner)',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.PAGE_TIMEOUT_MS });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const title = await page.title().catch(() => null);

    const [pageRow] = await db
      .insert(pages)
      .values({ scanId, url, title })
      .onConflictDoUpdate({
        target: [pages.scanId, pages.url],
        set: { title, error: null, scannedAt: new Date() },
      })
      .returning();

    if (!pageRow) throw new Error('Failed to store the page');

    const rows = [];
    for (const checker of CHECKERS) {
      const findings = await checker.run(page);
      for (const f of findings) {
        rows.push({
          scanId,
          pageId: pageRow.id,
          fingerprint: fingerprint(f.ruleId, f.html),
          kind: f.kind,
          checker: checker.name,
          ruleId: f.ruleId,
          impact: f.impact,
          help: f.help,
          helpUrl: f.helpUrl,
          wcagTags: f.wcagTags,
          target: f.target,
          html: f.html,
          failureSummary: f.failureSummary,
        });
      }
    }

    if (rows.length > 0) {
      await db.insert(issues).values(rows);
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .insert(pages)
      .values({ scanId, url, error: message })
      .onConflictDoUpdate({
        target: [pages.scanId, pages.url],
        set: { error: message, scannedAt: new Date() },
      });
    return false;
  } finally {
    await context.close().catch(() => {});
  }
}

export async function runScan(scanId: string): Promise<void> {
  const scan = await db.query.scans.findFirst({ where: eq(scans.id, scanId) });
  if (!scan) throw new Error(`Scan ${scanId} not found`);

  const site = await db.query.sites.findFirst({ where: eq(sites.id, scan.siteId) });
  if (!site) throw new Error(`Site ${scan.siteId} not found`);

  await db
    .update(scans)
    .set({ status: 'running', startedAt: new Date(), error: null, pagesScanned: 0, pagesFailed: 0 })
    .where(eq(scans.id, scanId));

  let browser: Browser | null = null;

  try {
    const urls = await discoverUrls(site.url, env.MAX_PAGES_PER_SCAN);
    if (urls.length === 0) throw new Error('No pages found to scan');

    console.log(`[scan ${scanId}] ${site.url}: ${urls.length} pages to check`);

    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      ...(env.CHROMIUM_EXECUTABLE ? { executablePath: env.CHROMIUM_EXECUTABLE } : {}),
    });

    const outcomes = await mapWithConcurrency(urls, env.SCAN_CONCURRENCY, async (url) => {
      const ok = await scanOnePage(browser as Browser, scanId, url);
      await db
        .update(scans)
        .set(
          ok
            ? { pagesScanned: sql`${scans.pagesScanned} + 1` }
            : { pagesFailed: sql`${scans.pagesFailed} + 1` },
        )
        .where(eq(scans.id, scanId));
      return ok;
    });

    const ok = outcomes.filter(Boolean).length;

    await db
      .update(scans)
      .set({
        status: 'done',
        finishedAt: new Date(),
        pagesScanned: ok,
        pagesFailed: outcomes.length - ok,
      })
      .where(eq(scans.id, scanId));

    console.log(`[scan ${scanId}] done: ${ok} of ${outcomes.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scan ${scanId}] failed:`, message);
    await db
      .update(scans)
      .set({ status: 'failed', finishedAt: new Date(), error: message })
      .where(eq(scans.id, scanId));
  } finally {
    await browser?.close().catch(() => {});
  }
}
