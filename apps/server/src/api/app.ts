import { zValidator } from '@hono/zod-validator';
import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';
import { db } from '../db/index.js';
import { issues, organizations, pages, scans, sites } from '../db/schema.js';
import { getBoss, SCAN_QUEUE } from '../queue/boss.js';

async function defaultOrgId(): Promise<string> {
  const existing = await db.query.organizations.findFirst();
  if (existing) return existing.id;

  const [created] = await db.insert(organizations).values({ name: 'My organization' }).returning();

  if (!created) throw new Error('Could not create the default organization');
  return created.id;
}

const uuidParam = z.object({ id: z.string().uuid() });

export const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors());

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/sites', async (c) => {
  const rows = await db
    .select({
      id: sites.id,
      name: sites.name,
      url: sites.url,
      createdAt: sites.createdAt,
      lastScanId: sql<string | null>`(
        select s.id from scans s where s.site_id = ${sites.id}
        order by s.created_at desc limit 1
      )`,
      lastScanStatus: sql<string | null>`(
        select s.status from scans s where s.site_id = ${sites.id}
        order by s.created_at desc limit 1
      )`,
      lastScanAt: sql<string | null>`(
        select s.created_at from scans s where s.site_id = ${sites.id}
        order by s.created_at desc limit 1
      )`,
    })
    .from(sites)
    .orderBy(desc(sites.createdAt));

  return c.json(rows);
});

app.post(
  '/api/sites',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(200),
      url: z.string().url(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json');
    const orgId = await defaultOrgId();

    const [created] = await db
      .insert(sites)
      .values({ orgId, name: body.name, url: body.url })
      .returning();

    return c.json(created, 201);
  },
);

app.get('/api/sites/:id', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');
  const site = await db.query.sites.findFirst({ where: eq(sites.id, id) });
  if (!site) return c.json({ error: 'Site not found' }, 404);
  return c.json(site);
});

app.delete('/api/sites/:id', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');
  await db.delete(sites).where(eq(sites.id, id));
  return c.body(null, 204);
});

app.get('/api/sites/:id/scans', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');
  const rows = await db
    .select()
    .from(scans)
    .where(eq(scans.siteId, id))
    .orderBy(desc(scans.createdAt))
    .limit(50);
  return c.json(rows);
});

app.post('/api/sites/:id/scans', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const site = await db.query.sites.findFirst({ where: eq(sites.id, id) });
  if (!site) return c.json({ error: 'Site not found' }, 404);

  const [scan] = await db.insert(scans).values({ siteId: id }).returning();
  if (!scan) return c.json({ error: 'Could not create the scan' }, 500);

  const boss = await getBoss();
  await boss.send(SCAN_QUEUE, { scanId: scan.id });

  return c.json(scan, 202);
});

app.get('/api/scans/:id', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const scan = await db.query.scans.findFirst({ where: eq(scans.id, id) });
  if (!scan) return c.json({ error: 'Scan not found' }, 404);

  const [summary] = await db
    .select({
      violations: sql<number>`count(*) filter (where ${issues.kind} = 'violation')::int`,
      incomplete: sql<number>`count(*) filter (where ${issues.kind} = 'incomplete')::int`,
      critical: sql<number>`count(*) filter (where ${issues.impact} = 'critical')::int`,
      serious: sql<number>`count(*) filter (where ${issues.impact} = 'serious')::int`,
      uniqueProblems: sql<number>`count(distinct ${issues.fingerprint})::int`,
    })
    .from(issues)
    .where(eq(issues.scanId, id));

  const [pageStats] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pages)
    .where(eq(pages.scanId, id));

  return c.json({
    ...scan,
    summary: summary ?? {
      violations: 0,
      incomplete: 0,
      critical: 0,
      serious: 0,
      uniqueProblems: 0,
    },
    pages: pageStats?.total ?? 0,
  });
});

app.get('/api/scans/:id/issues', zValidator('param', uuidParam), async (c) => {
  const { id } = c.req.valid('param');

  const rows = await db
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
    .where(eq(issues.scanId, id))
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

  return c.json(rows);
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
        where i.page_id = ${pages.id} and i.kind = 'violation'
      )::int`,
    })
    .from(pages)
    .where(eq(pages.scanId, id))
    .orderBy(pages.url);

  return c.json(rows);
});
