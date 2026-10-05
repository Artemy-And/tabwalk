import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Browser } from 'playwright';
import { db } from '../db/index.js';
import { issues, pages, scans, sites, tabOrders } from '../db/schema.js';
import { env } from '../env.js';
import { notifyScan } from '../notify/notify.js';
import { checkPage, launchBrowser, mapWithConcurrency } from './check.js';
import { discoverUrls } from './crawl.js';

async function scanOnePage(browser: Browser, scanId: string, url: string): Promise<boolean> {
  try {
    const { title, findings, tabOrder } = await checkPage(browser, url, env.PAGE_TIMEOUT_MS, {
      tabOrder: true,
    });

    const [pageRow] = await db
      .insert(pages)
      .values({ scanId, url, title })
      .onConflictDoUpdate({
        target: [pages.scanId, pages.url],
        set: { title, error: null, scannedAt: new Date() },
      })
      .returning();

    if (!pageRow) throw new Error('Failed to store the page');

    if (tabOrder) {
      await db
        .insert(tabOrders)
        .values({ pageId: pageRow.id, ...tabOrder })
        .onConflictDoUpdate({ target: tabOrders.pageId, set: tabOrder });
    }

    if (findings.length > 0) {
      await db.insert(issues).values(
        findings.map((f) => ({
          scanId,
          pageId: pageRow.id,
          fingerprint: f.fingerprint,
          kind: f.kind,
          checker: f.checker,
          ruleId: f.ruleId,
          impact: f.impact,
          help: f.help,
          helpUrl: f.helpUrl,
          wcagTags: f.wcagTags,
          standards: f.standards,
          target: f.target,
          html: f.html,
          failureSummary: f.failureSummary,
        })),
      );
    }

    return true;
  } catch (err) {
    // Playwright appends a multi-line call log; the first line says what went wrong
    const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
    await db
      .insert(pages)
      .values({ scanId, url, error: message })
      .onConflictDoUpdate({
        target: [pages.scanId, pages.url],
        set: { error: message, scannedAt: new Date() },
      });
    return false;
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

    browser = await launchBrowser(env.CHROMIUM_EXECUTABLE);

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
    if (ok === 0) {
      const failed = await db.query.pages.findFirst({
        where: and(eq(pages.scanId, scanId), isNotNull(pages.error)),
        columns: { error: true },
      });
      throw new Error(`No page could be loaded: ${failed?.error ?? 'unknown error'}`);
    }

    await db
      .update(scans)
      .set({
        status: 'done',
        finishedAt: new Date(),
        pagesScanned: ok,
        pagesFailed: outcomes.length - ok,
      })
      .where(eq(scans.id, scanId));

    // pictures are kept for the latest scan of each site only
    await db.delete(tabOrders).where(
      sql`${tabOrders.pageId} in (
        select p.id from pages p join scans s on s.id = p.scan_id
        where s.site_id = ${site.id} and s.id <> ${scanId}
      )`,
    );

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

  await notifyScan(scanId).catch((err: unknown) => {
    console.warn(
      `[scan ${scanId}] notifications failed:`,
      err instanceof Error ? err.message : err,
    );
  });
}
