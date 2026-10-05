import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { channels, issues, scans, sites } from '../db/schema.js';
import { env } from '../env.js';
import type { NewProblem, ScanNews } from './message.js';
import { deliver } from './send.js';

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

async function problemsOf(scanId: string): Promise<Map<string, NewProblem>> {
  const rows = await db
    .select({
      fingerprint: issues.fingerprint,
      impact: issues.impact,
      help: issues.help,
      ruleId: issues.ruleId,
      pages: sql<number>`count(distinct ${issues.pageId})::int`,
    })
    .from(issues)
    .where(and(eq(issues.scanId, scanId), eq(issues.kind, 'violation')))
    .groupBy(issues.fingerprint, issues.impact, issues.help, issues.ruleId);
  return new Map(rows.map(({ fingerprint, ...problem }) => [fingerprint, problem]));
}

export function reportUrl(scanId: string): string | null {
  return env.PUBLIC_URL ? new URL(`/scans/${scanId}`, env.PUBLIC_URL).toString() : null;
}

export async function scanNews(scanId: string): Promise<{ orgId: string; news: ScanNews } | null> {
  const scan = await db.query.scans.findFirst({ where: eq(scans.id, scanId) });
  const site = scan && (await db.query.sites.findFirst({ where: eq(sites.id, scan.siteId) }));
  if (!scan || !site) return null;

  const base = { siteName: site.name, siteUrl: site.url, reportUrl: reportUrl(scan.id) };
  if (scan.status === 'failed') {
    const news = { ...base, first: false, error: scan.error ?? 'Unknown error', problems: 0 };
    return { orgId: site.orgId, news: { ...news, critical: 0, newProblems: [], fixed: 0 } };
  }

  const previous = await db.query.scans.findFirst({
    where: and(
      eq(scans.siteId, scan.siteId),
      eq(scans.status, 'done'),
      lt(scans.createdAt, scan.createdAt),
    ),
    orderBy: desc(scans.createdAt),
  });
  const current = await problemsOf(scan.id);
  const before = previous ? new Set((await problemsOf(previous.id)).keys()) : null;
  const newProblems = [...current]
    .filter(([fingerprint]) => !before?.has(fingerprint))
    .map(([, problem]) => problem)
    .sort(
      (a, b) =>
        (IMPACT_ORDER[a.impact ?? ''] ?? 4) - (IMPACT_ORDER[b.impact ?? ''] ?? 4) ||
        b.pages - a.pages,
    );

  return {
    orgId: site.orgId,
    news: {
      ...base,
      first: !previous,
      error: null,
      problems: current.size,
      critical: [...current.values()].filter((p) => p.impact === 'critical').length,
      newProblems,
      fixed: before ? [...before].filter((fingerprint) => !current.has(fingerprint)).length : 0,
    },
  };
}

export async function notifyScan(scanId: string): Promise<void> {
  const found = await scanNews(scanId);
  if (!found) return;
  const { orgId, news } = found;
  if (!news.error && !news.first && news.newProblems.length === 0) return;

  const targets = await db.select().from(channels).where(eq(channels.orgId, orgId));
  for (const channel of targets) {
    try {
      await deliver(channel, news);
      await db
        .update(channels)
        .set({ lastSentAt: new Date(), lastError: null })
        .where(eq(channels.id, channel.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[notify] ${channel.kind} ${channel.id}: ${message}`);
      await db.update(channels).set({ lastError: message }).where(eq(channels.id, channel.id));
    }
  }
}
