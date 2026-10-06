import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// clears the sites and users tables, so it only runs against a database named for tests;
// run it with --test-concurrency=1 next to auth/routes.test.ts, which clears users too
const url = process.env.TABWALK_TEST_DATABASE_URL;
const skip = !url && 'set TABWALK_TEST_DATABASE_URL';

type App = typeof import('./app.js')['app'];
type Db = typeof import('../db/index.js');
type Schema = typeof import('../db/schema.js');
let app: App;
let db: Db['db'];
let pool: Db['pool'];
let schema: Schema;
let cookie = '';

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  ({ app } = await import('./app.js'));
  ({ db, pool } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  await db.delete(schema.sites);
  await db.delete(schema.users);
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'noise@example.com', password: 'noise-test-password' }),
  });
  cookie =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith('tabwalk_session='))
      ?.split(';')[0] ?? '';
});

after(async () => {
  if (!url) return;
  await db.delete(schema.sites);
  await db.delete(schema.users);
  await pool.end();
});

const get = (path: string) => app.request(path, { headers: { cookie } });
const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

interface Finding {
  fingerprint: string;
  ruleId?: string;
  impact?: string;
  kind?: 'violation' | 'incomplete' | 'recommendation';
}

async function seedSite() {
  const { defaultOrgId } = await import('../db/org.js');
  const [site] = await db
    .insert(schema.sites)
    .values({ orgId: await defaultOrgId(), name: 'Noise', url: 'https://noise.test/' })
    .returning();
  if (!site) throw new Error('no site');
  return site;
}

// a finished scan with one page that holds the findings
async function seedScan(siteId: string, at: string, findings: Finding[]) {
  const [scan] = await db
    .insert(schema.scans)
    .values({
      siteId,
      status: 'done',
      createdAt: new Date(at),
      finishedAt: new Date(at),
      pagesScanned: 1,
    })
    .returning();
  if (!scan) throw new Error('no scan');
  const [page] = await db
    .insert(schema.pages)
    .values({ scanId: scan.id, url: 'https://noise.test/' })
    .returning();
  if (!page) throw new Error('no page');
  await db.insert(schema.issues).values(
    findings.map((f) => ({
      scanId: scan.id,
      pageId: page.id,
      fingerprint: f.fingerprint,
      kind: f.kind ?? 'violation',
      checker: 'axe-core',
      ruleId: f.ruleId ?? 'image-alt',
      impact: f.impact ?? 'serious',
      help: `Problem ${f.fingerprint}`,
      html: `<img data-f="${f.fingerprint}">`,
    })),
  );
  return scan;
}

interface IssueRow {
  fingerprint: string;
  isNew: boolean;
  firstSeenAt: string;
}

test('each finding says when it first turned up on the site', { skip }, async () => {
  const site = await seedSite();
  const first = await seedScan(site.id, '2026-09-01T10:00:00Z', [
    { fingerprint: 'aaa' },
    { fingerprint: 'bbb' },
  ]);
  const second = await seedScan(site.id, '2026-09-08T10:00:00Z', [
    { fingerprint: 'aaa' },
    { fingerprint: 'ccc' },
  ]);

  const later = (await (await get(`/api/scans/${second.id}/issues`)).json()) as IssueRow[];
  const byFingerprint = new Map(later.map((row) => [row.fingerprint, row]));
  assert.equal(byFingerprint.get('aaa')?.firstSeenAt, '2026-09-01T10:00:00.000Z');
  assert.equal(byFingerprint.get('aaa')?.isNew, false);
  assert.equal(byFingerprint.get('ccc')?.firstSeenAt, '2026-09-08T10:00:00.000Z');
  assert.equal(byFingerprint.get('ccc')?.isNew, true);

  // an older report knows nothing of the scans after it
  const earlier = (await (await get(`/api/scans/${first.id}/issues`)).json()) as IssueRow[];
  assert.equal(
    earlier.find((row) => row.fingerprint === 'aaa')?.firstSeenAt,
    '2026-09-01T10:00:00.000Z',
  );

  const csv = await (await get(`/api/scans/${second.id}/issues.csv`)).text();
  assert.ok(csv.includes(',New since last scan,First seen,'));
  assert.ok(csv.includes(',no,2026-09-01,') && csv.includes(',yes,2026-09-08,'));
});

test('a site keeps the rules and the elements to ignore', { skip }, async () => {
  const site = await seedSite();
  const saved = await send('PATCH', `/api/sites/${site.id}`, {
    ignoreRules: [' Color-Contrast ', 'region'],
    ignoreSelectors: ['#chat-widget', '.cookie-banner > button'],
  });
  assert.equal(saved.status, 200);
  const body = (await saved.json()) as { ignoreRules: string[]; ignoreSelectors: string[] };
  assert.deepEqual(body.ignoreRules, ['color-contrast', 'region']);
  assert.deepEqual(body.ignoreSelectors, ['#chat-widget', '.cookie-banner > button']);

  const bad = await send('PATCH', `/api/sites/${site.id}`, { ignoreRules: ['color contrast'] });
  assert.equal(bad.status, 400);
  assert.match(((await bad.json()) as { error: string }).error, /letters, digits and dashes/);
});
