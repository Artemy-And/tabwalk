import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { SiteScenario } from './scenarios.js';

// Use --test-concurrency=1 with the other database suites. Only this test's
// organization is removed, and a database explicitly named for tests is required.
const databaseUrl = process.env.TABWALK_TEST_DATABASE_URL;
const skip = !databaseUrl && 'set TABWALK_TEST_DATABASE_URL';

type Db = typeof import('../db/index.js');
type Schema = typeof import('../db/schema.js');
let db: Db['db'];
let pool: Db['pool'] | undefined;
let schema: Schema;
let server: Server | undefined;
let siteUrl = '';
let orgId: string | null = null;

const PAGE = `<!doctype html><html lang="en"><head><title>Worker scenario fixture</title></head><body>
<main><h1>Settings</h1><button id="open">Open settings</button><button id="after">After</button>
<dialog id="settings" aria-label="Profile settings">
<label for="field">Email</label><input id="field" type="email">
<button id="unnamed" style="width:40px;height:40px"></button>
<p id="reflow-worker" style="width:900px;white-space:nowrap">Profile settings instructions with important information extending beyond the available narrow viewport width</p>
</dialog></main>
<script>
  document.getElementById('open').addEventListener('click', () => {
    document.getElementById('settings').showModal();
    document.getElementById('field').focus();
  });
</script></body></html>`;

before(async () => {
  if (!databaseUrl) return;
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  assert.match(
    databaseName,
    /(?:^|[_-])test(?:$|[_-])/i,
    'the worker test requires a database named for tests',
  );
  process.env.DATABASE_URL = databaseUrl;
  ({ db, pool } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name: 'Worker scenario test' })
    .returning();
  assert.ok(organization);
  orgId = organization.id;
  server = createServer((req, res) => {
    if (new URL(req.url ?? '/', 'http://fixture.test').pathname !== '/') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (!pool) return;
  try {
    if (orgId) await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  } finally {
    await pool.end();
  }
});

test('the worker persists successful and failed scenario runs, unmatched states and redacted finding provenance', {
  skip,
}, async () => {
  assert.ok(orgId);
  const successfulValue = 'private-worker-success@example.test';
  const failedValue = 'private-worker-failure@example.test';
  const scenarios: SiteScenario[] = [
    {
      name: 'Open profile',
      path: '/',
      steps: [
        { action: 'click', selector: '#open' },
        { action: 'waitFor', selector: '#settings', state: 'visible' },
        { action: 'fill', selector: '#field', value: successfulValue },
        { action: 'expectFocus', selector: '#field' },
      ],
    },
    {
      name: 'Wrong return focus',
      path: '/',
      steps: [
        { action: 'click', selector: '#open' },
        { action: 'fill', selector: '#field', value: failedValue },
        { action: 'expectFocus', selector: '#open' },
      ],
    },
    {
      name: 'Unvisited page',
      path: '/missing',
      steps: [{ action: 'click', selector: '#open' }],
    },
  ];
  const [site] = await db
    .insert(schema.sites)
    .values({
      orgId,
      environments: ['mobile', 'zoom-400'],
      name: 'Worker fixture',
      url: siteUrl,
      schedule: 'off',
      maxPages: 1,
      scenarios,
    })
    .returning();
  assert.ok(site);
  const [scan] = await db.insert(schema.scans).values({ siteId: site.id }).returning();
  assert.ok(scan);

  const { runScan } = await import('./runner.js');
  await runScan(scan.id);

  const storedScan = await db.query.scans.findFirst({ where: eq(schema.scans.id, scan.id) });
  assert.ok(storedScan);
  assert.equal(storedScan.status, 'done', storedScan.error ?? 'the worker should finish');
  assert.equal(storedScan.error, null);
  assert.equal(storedScan.pagesScanned, 1);
  assert.equal(storedScan.pagesFailed, 0);
  assert.ok(storedScan.startedAt);
  assert.ok(storedScan.finishedAt);
  assert.deepEqual(storedScan.scenarioSummary, {
    completed: 3,
    failed: 3,
    unmatched: [{ name: 'Unvisited page', path: '/missing' }],
  });
  assert.deepEqual(
    storedScan.environments?.map((environment) => environment.id),
    ['desktop', 'mobile', 'zoom-400'],
  );

  const storedPages = await db.select().from(schema.pages).where(eq(schema.pages.scanId, scan.id));
  assert.equal(storedPages.length, 1);
  const page = storedPages[0];
  assert.ok(page);
  assert.equal(page.url, siteUrl);
  assert.equal(page.title, 'Worker scenario fixture');
  assert.equal(page.error, null);
  assert.equal(page.keyboardCoverage?.status, 'completed');
  assert.equal(page.keyboardCoverage?.visitedStops, 2);
  assert.equal(page.scenarioRuns.length, 2);
  assert.equal(page.environmentRuns.length, 3);
  assert.ok(
    page.environmentRuns.every(
      (run) => run.status === 'completed' && run.elapsedMs > 0 && run.scenarioRuns.length === 2,
    ),
  );
  const completed = page.scenarioRuns.find((run) => run.name === 'Open profile');
  const failed = page.scenarioRuns.find((run) => run.name === 'Wrong return focus');
  assert.ok(completed);
  assert.ok(failed);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.error, null);
  assert.ok(completed.keyboardCoverage);
  assert.ok(completed.findings >= 1);
  assert.deepEqual(completed.steps[2], { action: 'fill', selector: '#field', status: 'completed' });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.keyboardCoverage, null);
  assert.equal(failed.findings, 0);
  assert.equal(failed.steps.length, 3);
  assert.deepEqual(failed.steps[2], {
    action: 'expectFocus',
    selector: '#open',
    status: 'failed',
    actualFocus: '#field',
  });

  const tabOrder = await db.query.tabOrders.findFirst({
    where: eq(schema.tabOrders.pageId, page.id),
  });
  assert.ok(tabOrder, 'the initial state keeps its keyboard picture');
  assert.equal(tabOrder.stops.length, 2);
  const findings = await db.select().from(schema.issues).where(eq(schema.issues.scanId, scan.id));
  const unnamed = findings.filter(
    (finding) => finding.ruleId === 'button-name' && finding.target.includes('#unnamed'),
  );
  assert.equal(
    unnamed.length,
    3,
    'only completed modal states create this finding, once in each environment',
  );
  assert.deepEqual(unnamed.map((finding) => finding.environment?.id).sort(), [
    'desktop',
    'mobile',
    'zoom-400',
  ]);
  const reflow = findings.filter(
    (finding) => finding.checker === 'reflow' && finding.target.includes('#reflow-worker'),
  );
  assert.equal(reflow.length, 2);
  assert.deepEqual(reflow.map((finding) => finding.environment?.id).sort(), ['mobile', 'zoom-400']);
  assert.ok(
    reflow.every(
      (finding) => finding.kind === 'incomplete' && finding.scenario?.name === 'Open profile',
    ),
  );
  assert.deepEqual(unnamed[0]?.scenario, {
    environment: 'desktop',
    name: 'Open profile',
    path: '/',
    steps: completed.steps,
  });
  assert.equal(
    findings.some((finding) => finding.scenario?.name === 'Wrong return focus'),
    false,
  );
  assert.equal(
    findings.some((finding) => finding.scenario?.name === 'Unvisited page'),
    false,
  );
  const persistedEvidence = JSON.stringify({ findings, scenarioRuns: page.scenarioRuns });
  assert.equal(persistedEvidence.includes(successfulValue), false);
  assert.equal(persistedEvidence.includes(failedValue), false);
});
