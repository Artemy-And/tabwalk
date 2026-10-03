import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, getTableColumns, lt, lte, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  issues,
  organizations,
  pages,
  type Scan,
  scanSchedule,
  scans,
  sites,
} from '../db/schema.js';
import { enqueueScan, nextScanAt } from '../queue/schedule.js';
import { toCsv } from './csv.js';

async function defaultOrgId(): Promise<string> {
  const existing = await db.query.organizations.findFirst();
  if (existing) return existing.id;

  const [created] = await db.insert(organizations).values({ name: 'My organization' }).returning();

  if (!created) throw new Error('Could not create the default organization');
  return created.id;
}

const uuidParam = z.object({ id: z.string().uuid() });

const scheduleField = z.enum(scanSchedule.enumValues);

const TREND_LENGTH = 8;

const summaryColumns = {
  uniqueProblems: sql<number>`count(distinct ${issues.fingerprint})
    filter (where ${issues.kind} = 'violation')::int`,
  critical: sql<number>`count(distinct ${issues.fingerprint})
    filter (where ${issues.kind} = 'violation' and ${issues.impact} = 'critical')::int`,
  serious: sql<number>`count(distinct ${issues.fingerprint})
    filter (where ${issues.kind} = 'violation' and ${issues.impact} = 'serious')::int`,
  incomplete: sql<number>`count(distinct ${issues.fingerprint})
    filter (where ${issues.kind} = 'incomplete')::int`,
  recommendations: sql<number>`count(distinct ${issues.fingerprint})
    filter (where ${issues.kind} = 'recommendation')::int`,
  elements: sql<number>`count(*) filter (where ${issues.kind} = 'violation')::int`,
};

type Summary = { [K in keyof typeof summaryColumns]: number };

const EMPTY_SUMMARY: Summary = {
  uniqueProblems: 0,
  critical: 0,
  serious: 0,
  incomplete: 0,
  recommendations: 0,
  elements: 0,
};

function groupedIssues(scanId: string) {
  return db
    .select({
      fingerprint: issues.fingerprint,
      kind: issues.kind,
      checker: issues.checker,
      ruleId: issues.ruleId,
      impact: issues.impact,
      help: issues.help,
      helpUrl: issues.helpUrl,
      wcagTags: issues.wcagTags,
      occurrences: sql<number>`count(*)::int`,
      pagesAffected: sql<number>`count(distinct ${issues.pageId})::int`,
      sampleHtml: sql<string>`min(${issues.html})`,
      sampleTarget: sql<string>`min(${issues.target}::text)`,
      sampleSummary: sql<string | null>`min(${issues.failureSummary})`,
    })
    .from(issues)
    .where(eq(issues.scanId, scanId))
    .groupBy(
      issues.fingerprint,
      issues.kind,
      issues.checker,
      issues.ruleId,
      issues.impact,
      issues.help,
      issues.helpUrl,
      issues.wcagTags,
    )
    .orderBy(desc(sql`count(distinct ${issues.pageId})`));
}

function previousDoneScan(scan: Scan) {
  return db.query.scans.findFirst({
    where: and(
      eq(scans.siteId, scan.siteId),
      eq(scans.status, 'done'),
      lt(scans.createdAt, scan.createdAt),
    ),
    orderBy: desc(scans.createdAt),
  });
}

async function fingerprints(scanId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ fingerprint: issues.fingerprint })
    .from(issues)
    .where(and(eq(issues.scanId, scanId), ne(issues.kind, 'recommendation')));
  return new Set(rows.map((r) => r.fingerprint));
}

async function issuesWithNewFlag(scan: Scan) {
  const [rows, previous] = await Promise.all([groupedIssues(scan.id), previousDoneScan(scan)]);
  const before = previous ? await fingerprints(previous.id) : null;

  return rows.map((row) => ({
    ...row,
    isNew: before && row.kind !== 'recommendation' ? !before.has(row.fingerprint) : false,
    compared: before !== null,
  }));
}

async function pageUrlsByIssue(scanId: string): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      fingerprint: issues.fingerprint,
      kind: issues.kind,
      urls: sql<string[]>`array_agg(distinct ${pages.url} order by ${pages.url})`,
    })
    .from(issues)
    .innerJoin(pages, eq(pages.id, issues.pageId))
    .where(eq(issues.scanId, scanId))
    .groupBy(issues.fingerprint, issues.kind);
  return new Map(rows.map((r) => [`${r.kind}|${r.fingerprint}`, r.urls]));
}

const KIND_LABEL = {
  violation: 'Violation',
  incomplete: 'Needs review',
  recommendation: 'Recommendation',
} as const;

const KIND_ORDER = { violation: 0, incomplete: 1, recommendation: 2 } as const;

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function selectorOf(target: string): string {
  try {
    const parsed: unknown = JSON.parse(target);
    return Array.isArray(parsed) ? parsed.map(String).join(' ') : target;
  } catch {
    return target;
  }
}

function csvFilename(siteUrl: string | undefined, date: Date): string {
  let host = 'scan';
  try {
    if (siteUrl) host = new URL(siteUrl).hostname;
  } catch {
    // keep the fallback
  }
  return `tabwalk-${host}-${date.toISOString().slice(0, 10)}.csv`;
}

export const app = new Hono();

app.use('*', logger());

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/sites', async (c) => {
  const rows = await db
    .select({
      id: sites.id,
      name: sites.name,
      url: sites.url,
      schedule: sites.schedule,
      createdAt: sites.createdAt,
      lastScanId: sql<string | null>`(
        select s.id from scans s where s.site_id = sites.id
        order by s.created_at desc limit 1
      )`,
      lastScanStatus: sql<string | null>`(
        select s.status from scans s where s.site_id = sites.id
        order by s.created_at desc limit 1
      )`,
      lastScanAt: sql<Date | null>`(
        select s.created_at from scans s where s.site_id = sites.id
        order by s.created_at desc limit 1
      )`.mapWith(scans.createdAt),
    })
    .from(sites)
    .orderBy(desc(sites.createdAt));

  const ranked = db
    .select({
      id: scans.id,
      siteId: scans.siteId,
      createdAt: scans.createdAt,
      rank: sql<number>`row_number() over (
        partition by ${scans.siteId} order by ${scans.createdAt} desc
      )`.as('rank'),
    })
    .from(scans)
    .where(eq(scans.status, 'done'))
    .as('ranked');

  const recent = await db
    .select({
      scanId: ranked.id,
      siteId: ranked.siteId,
      createdAt: ranked.createdAt,
      ...summaryColumns,
    })
    .from(ranked)
    .leftJoin(issues, eq(issues.scanId, ranked.id))
    .where(lte(ranked.rank, TREND_LENGTH))
    .groupBy(ranked.id, ranked.siteId, ranked.createdAt)
    .orderBy(desc(ranked.createdAt));

  const bySite = new Map<string, typeof recent>();
  for (const row of recent) {
    const list = bySite.get(row.siteId) ?? [];
    list.push(row);
    bySite.set(row.siteId, list);
  }

  return c.json(
    rows.map((site) => {
      const done = bySite.get(site.id) ?? [];
      const latest = done[0];
      return {
        ...site,
        lastDoneScanId: latest?.scanId ?? null,
        summary: latest
          ? {
              uniqueProblems: latest.uniqueProblems,
              critical: latest.critical,
              serious: latest.serious,
              incomplete: latest.incomplete,
              recommendations: latest.recommendations,
              elements: latest.elements,
            }
          : null,
        trend: done.map((scan) => scan.uniqueProblems).reverse(),
      };
    }),
  );
});

app.post(
  '/api/sites',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(200),
      url: z.string().url(),
      schedule: scheduleField.optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json');
    const orgId = await defaultOrgId();

    const [created] = await db
      .insert(sites)
      .values({ orgId, name: body.name, url: body.url, schedule: body.schedule })
      .returning();

    return c.json(created, 201);
  },
);

async function siteWithNextScan(id: string) {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, id) });
  if (!site) return null;

  const last = await db.query.scans.findFirst({
    where: eq(scans.siteId, id),
    orderBy: desc(scans.createdAt),
    columns: { createdAt: true },
  });

  return { ...site, nextScanAt: nextScanAt(site.schedule, last?.createdAt ?? null) };
}

app.get('/api/sites/:id', zValidator('param', uuidParam), async (c) => {
  const site = await siteWithNextScan(c.req.valid('param').id);
  if (!site) return c.json({ error: 'Site not found' }, 404);
  return c.json(site);
});

app.patch(
  '/api/sites/:id',
  zValidator('param', uuidParam),
  zValidator('json', z.object({ schedule: scheduleField })),
  async (c) => {
    const { id } = c.req.valid('param');
    const updated = await db
      .update(sites)
      .set({ schedule: c.req.valid('json').schedule })
      .where(eq(sites.id, id))
      .returning({ id: sites.id });
    if (updated.length === 0) return c.json({ error: 'Site not found' }, 404);

    return c.json(await siteWithNextScan(id));
  },
);

app.delete('/api/sites/:id', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');
  await db.delete(sites).where(eq(sites.id, id));
  return c.body(null, 204);
});

app.get('/api/sites/:id/scans', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');
  const rows = await db
    .select({ ...getTableColumns(scans), ...summaryColumns })
    .from(scans)
    .leftJoin(issues, eq(issues.scanId, scans.id))
    .where(eq(scans.siteId, id))
    .groupBy(scans.id)
    .orderBy(desc(scans.createdAt))
    .limit(50);
  return c.json(rows);
});

app.post('/api/sites/:id/scans', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const site = await db.query.sites.findFirst({ where: eq(sites.id, id) });
  if (!site) return c.json({ error: 'Site not found' }, 404);

  return c.json(await enqueueScan(id), 202);
});

app.get('/api/scans/:id', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const scan = await db.query.scans.findFirst({ where: eq(scans.id, id) });
  if (!scan) return c.json({ error: 'Scan not found' }, 404);

  const site = await db.query.sites.findFirst({
    where: eq(sites.id, scan.siteId),
    columns: { id: true, name: true, url: true },
  });

  const [summary] = await db.select(summaryColumns).from(issues).where(eq(issues.scanId, id));

  const [pageStats] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pages)
    .where(eq(pages.scanId, id));

  const previous = scan.status === 'done' ? await previousDoneScan(scan) : undefined;
  let comparison: { previousScanId: string; new: number; fixed: number } | null = null;
  if (previous) {
    const [current, before] = await Promise.all([fingerprints(id), fingerprints(previous.id)]);
    comparison = {
      previousScanId: previous.id,
      new: [...current].filter((f) => !before.has(f)).length,
      fixed: [...before].filter((f) => !current.has(f)).length,
    };
  }

  return c.json({
    ...scan,
    site: site ?? null,
    summary: summary ?? EMPTY_SUMMARY,
    pages: pageStats?.total ?? 0,
    comparison,
  });
});

app.get('/api/scans/:id/issues', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const scan = await db.query.scans.findFirst({ where: eq(scans.id, id) });
  if (!scan) return c.json({ error: 'Scan not found' }, 404);

  const rows = await issuesWithNewFlag(scan);
  return c.json(rows.map(({ compared: _, ...row }) => row));
});

app.get('/api/scans/:id/issues.csv', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const scan = await db.query.scans.findFirst({ where: eq(scans.id, id) });
  if (!scan) return c.json({ error: 'Scan not found' }, 404);

  const [rows, urls, site] = await Promise.all([
    issuesWithNewFlag(scan),
    pageUrlsByIssue(id),
    db.query.sites.findFirst({ where: eq(sites.id, scan.siteId), columns: { url: true } }),
  ]);

  rows.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (IMPACT_ORDER[a.impact ?? ''] ?? 4) - (IMPACT_ORDER[b.impact ?? ''] ?? 4) ||
      b.pagesAffected - a.pagesAffected,
  );

  const csv = toCsv(
    [
      'Type',
      'Impact',
      'Rule',
      'WCAG',
      'What is wrong',
      'Help URL',
      'Pages',
      'Elements',
      'New since last scan',
      'Selector',
      'HTML',
      'How to fix',
      'Page URLs',
    ],
    rows.map((row) => [
      KIND_LABEL[row.kind],
      row.impact,
      row.ruleId,
      row.wcagTags.join(' '),
      row.help,
      row.helpUrl,
      row.pagesAffected,
      row.occurrences,
      row.compared && row.kind !== 'recommendation' ? (row.isNew ? 'yes' : 'no') : '',
      selectorOf(row.sampleTarget),
      row.sampleHtml,
      row.sampleSummary,
      (urls.get(`${row.kind}|${row.fingerprint}`) ?? []).join('\n'),
    ]),
  );

  const filename = csvFilename(site?.url, scan.finishedAt ?? scan.createdAt);
  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
  });
});

app.get('/api/scans/:id/fixed', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const scan = await db.query.scans.findFirst({ where: eq(scans.id, id) });
  if (!scan) return c.json({ error: 'Scan not found' }, 404);

  const previous = await previousDoneScan(scan);
  if (!previous) return c.json([]);

  const [current, rows] = await Promise.all([fingerprints(id), groupedIssues(previous.id)]);
  return c.json(
    rows.filter((row) => row.kind !== 'recommendation' && !current.has(row.fingerprint)),
  );
});

app.get('/api/scans/:id/pages', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');
  const rows = await db
    .select({
      id: pages.id,
      url: pages.url,
      title: pages.title,
      error: pages.error,
      problems: sql<number>`(
        select count(*) from issues i
        where i.page_id = pages.id and i.kind = 'violation'
      )::int`,
    })
    .from(pages)
    .where(eq(pages.scanId, id))
    .orderBy(pages.url);

  return c.json(rows);
});
