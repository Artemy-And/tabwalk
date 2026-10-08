import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Browser } from 'playwright';
import { db } from '../db/index.js';
import { issueShots, issues, pages, scans, sites, tabOrders } from '../db/schema.js';
import { env } from '../env.js';
import { notifyScan } from '../notify/notify.js';
import { checkPageWithScenarios, type IgnoreRules, launchBrowser, NotAPageError } from './check.js';
import { crawl } from './crawl.js';
import type { SiteScenario } from './scenarios.js';
import {
  loginHeaders,
  type ScenarioSummary,
  type SiteLogin,
  type StoredScenarioRun,
} from './types.js';

type PageOutcome = { ok: boolean; links: string[]; scenarioRuns: StoredScenarioRun[] } | null;

// null when the address turned out to be a file, which is not a page to report
async function scanOnePage(
  browser: Browser,
  scanId: string,
  url: string,
  options: {
    ignore: IgnoreRules;
    login: SiteLogin | null;
    pictured: Set<string>;
    scenarios: SiteScenario[];
  },
): Promise<PageOutcome> {
  try {
    const { title, findings, tabOrder, keyboardCoverage, scenarioRuns, links, shots } =
      await checkPageWithScenarios(browser, url, env.PAGE_TIMEOUT_MS, {
        tabOrder: true,
        ...options,
      });

    const [pageRow] = await db
      .insert(pages)
      .values({ scanId, url, title, keyboardCoverage, scenarioRuns })
      .onConflictDoUpdate({
        target: [pages.scanId, pages.url],
        set: { title, keyboardCoverage, scenarioRuns, error: null, scannedAt: new Date() },
      })
      .returning();

    if (!pageRow) throw new Error('Failed to store the page');

    if (shots.length > 0) {
      // two pages may picture the same new problem at once; the first one stays
      await db
        .insert(issueShots)
        .values(shots.map((shot) => ({ scanId, ...shot })))
        .onConflictDoNothing();
    }

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
          scenario: f.scenario ?? null,
        })),
      );
    }

    return { ok: true, links, scenarioRuns };
  } catch (err) {
    if (err instanceof NotAPageError) return null;
    // Playwright appends a multi-line call log; the first line says what went wrong
    const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
    await db
      .insert(pages)
      .values({ scanId, url, error: message })
      .onConflictDoUpdate({
        target: [pages.scanId, pages.url],
        set: { error: message, keyboardCoverage: null, scenarioRuns: [], scannedAt: new Date() },
      });
    return { ok: false, links: [], scenarioRuns: [] };
  }
}

export async function runScan(scanId: string): Promise<void> {
  const scan = await db.query.scans.findFirst({ where: eq(scans.id, scanId) });
  if (!scan) throw new Error(`Scan ${scanId} not found`);

  const site = await db.query.sites.findFirst({ where: eq(sites.id, scan.siteId) });
  if (!site) throw new Error(`Site ${scan.siteId} not found`);

  const ignore: IgnoreRules = { rules: site.ignoreRules, selectors: site.ignoreSelectors };

  await db
    .update(scans)
    .set({
      status: 'running',
      startedAt: new Date(),
      error: null,
      pagesScanned: 0,
      pagesFailed: 0,
      scenarioSummary: null,
      ignored: ignore,
    })
    .where(eq(scans.id, scanId));

  let browser: Browser | null = null;

  try {
    const limit = Math.min(site.maxPages ?? env.MAX_PAGES_PER_SCAN, env.MAX_PAGES_PER_SCAN);
    console.log(`[scan ${scanId}] ${site.url}: checking up to ${limit} pages`);

    browser = await launchBrowser(env.CHROMIUM_EXECUTABLE);

    const pictured = new Set<string>();
    let ok = 0;
    let failed = 0;
    const executed = new Set<string>();
    const scenarioSummary: ScenarioSummary = { completed: 0, failed: 0, unmatched: [] };
    await crawl(site.url, {
      limit,
      concurrency: env.SCAN_CONCURRENCY,
      rules: { include: site.crawlInclude, exclude: site.crawlExclude },
      headers: loginHeaders(site.login),
      visit: async (url) => {
        const outcome = await scanOnePage(browser as Browser, scanId, url, {
          ignore,
          login: site.login,
          pictured,
          scenarios: site.scenarios,
        });
        if (!outcome) return [];
        for (const run of outcome.scenarioRuns) {
          executed.add(run.name);
          scenarioSummary[run.status === 'completed' ? 'completed' : 'failed']++;
        }
        if (outcome.ok) ok += 1;
        else failed += 1;
        await db
          .update(scans)
          .set(
            outcome.ok
              ? { pagesScanned: sql`${scans.pagesScanned} + 1` }
              : { pagesFailed: sql`${scans.pagesFailed} + 1` },
          )
          .where(eq(scans.id, scanId));
        return outcome.links;
      },
    });

    if (ok === 0 && failed === 0) throw new Error('No pages found to scan');
    if (ok === 0) {
      const failed = await db.query.pages.findFirst({
        where: and(eq(pages.scanId, scanId), isNotNull(pages.error)),
        columns: { error: true },
      });
      throw new Error(`No page could be loaded: ${failed?.error ?? 'unknown error'}`);
    }

    scenarioSummary.unmatched = site.scenarios
      .filter((s) => !executed.has(s.name))
      .map(({ name, path }) => ({ name, path }));
    await db
      .update(scans)
      .set({
        status: 'done',
        scenarioSummary,
        finishedAt: new Date(),
        pagesScanned: ok,
        pagesFailed: failed,
      })
      .where(eq(scans.id, scanId));

    // pictures are kept for the latest scan of each site only
    await db.delete(tabOrders).where(
      sql`${tabOrders.pageId} in (
        select p.id from pages p join scans s on s.id = p.scan_id
        where s.site_id = ${site.id} and s.id <> ${scanId}
      )`,
    );
    await db.delete(issueShots).where(
      sql`${issueShots.scanId} in (
        select s.id from scans s where s.site_id = ${site.id} and s.id <> ${scanId}
      )`,
    );

    console.log(`[scan ${scanId}] done: ${ok} of ${ok + failed}`);
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
