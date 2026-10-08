import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { SiteScenario } from '../scanner/scenarios.js';
import type {
  KeyboardCoverage,
  ScenarioEvidence,
  ScenarioSummary,
  StoredScenarioRun,
} from '../scanner/types.js';

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

interface ScanDetail {
  summary: { uniqueProblems: number; critical: number };
  comparison: { new: number; fixed: number } | null;
}

interface DismissedRow {
  fingerprint: string;
  isNew: boolean;
  dismissal: { reason: string; note: string | null; by: string | null } | null;
}

test('a dismissed finding stays in the report but counts nowhere', { skip }, async () => {
  const site = await seedSite();
  await seedScan(site.id, '2026-09-01T10:00:00Z', [
    { fingerprint: 'd-aaa' },
    { fingerprint: 'd-bbb' },
  ]);
  const scan = await seedScan(site.id, '2026-09-08T10:00:00Z', [
    { fingerprint: 'd-aaa' },
    { fingerprint: 'd-ccc', impact: 'critical' },
  ]);
  const detail = async () => (await (await get(`/api/scans/${scan.id}`)).json()) as ScanDetail;

  const before = await detail();
  assert.equal(before.summary.uniqueProblems, 2);
  assert.equal(before.comparison?.new, 1);
  assert.equal(before.comparison?.fixed, 1);

  const put = await send('PUT', `/api/sites/${site.id}/dismissals`, {
    fingerprint: 'd-ccc',
    reason: 'false_positive',
    note: ' decorative image ',
  });
  assert.equal(put.status, 200);

  const after = await detail();
  assert.equal(after.summary.uniqueProblems, 1);
  assert.equal(after.summary.critical, 0);
  assert.equal(after.comparison?.new, 0);
  assert.equal(after.comparison?.fixed, 1);

  const rows = (await (await get(`/api/scans/${scan.id}/issues`)).json()) as DismissedRow[];
  const ccc = rows.find((row) => row.fingerprint === 'd-ccc');
  assert.equal(ccc?.dismissal?.reason, 'false_positive');
  assert.equal(ccc?.dismissal?.note, 'decorative image');
  assert.equal(ccc?.dismissal?.by, 'noise@example.com');
  assert.equal(ccc?.isNew, false);

  const history = (await (await get(`/api/sites/${site.id}/scans`)).json()) as {
    id: string;
    uniqueProblems: number;
  }[];
  assert.equal(history.find((row) => row.id === scan.id)?.uniqueProblems, 1);

  const all = (await (await get('/api/sites')).json()) as {
    id: string;
    summary: { uniqueProblems: number } | null;
  }[];
  assert.equal(all.find((row) => row.id === site.id)?.summary?.uniqueProblems, 1);

  const pages = (await (await get(`/api/scans/${scan.id}/pages`)).json()) as {
    problems: number;
  }[];
  assert.equal(pages[0]?.problems, 1);

  const csv = await (await get(`/api/scans/${scan.id}/issues.csv`)).text();
  assert.ok(csv.includes(',false positive,decorative image,'));

  const { scanNews } = await import('../notify/notify.js');
  const news = await scanNews(scan.id);
  assert.equal(news?.news.problems, 1);
  assert.deepEqual(news?.news.newProblems, []);

  const reopened = await send('DELETE', `/api/sites/${site.id}/dismissals/d-ccc`);
  assert.equal(reopened.status, 204);
  assert.equal((await detail()).summary.uniqueProblems, 2);

  const bad = await send('PUT', `/api/sites/${site.id}/dismissals`, {
    fingerprint: 'd-ccc',
    reason: 'meh',
  });
  assert.equal(bad.status, 400);
  const missing = await send('PUT', '/api/sites/00000000-0000-4000-8000-000000000000/dismissals', {
    fingerprint: 'd-ccc',
    reason: 'wont_fix',
  });
  assert.equal(missing.status, 404);
});

test('a site keeps its login, and the dashboard only learns what kind it is', {
  skip,
}, async () => {
  const site = await seedSite();
  const saved = await send('PATCH', `/api/sites/${site.id}`, {
    login: {
      username: ' staging ',
      password: 'hunter2',
      headers: [{ name: 'Authorization', value: 'Bearer abc' }],
      cookies: [{ name: 'session', value: 'xyz' }],
    },
  });
  assert.equal(saved.status, 200);
  const text = await saved.text();
  for (const secret of ['hunter2', 'Bearer abc', 'xyz']) {
    assert.ok(!text.includes(secret), `the answer holds ${secret}`);
  }
  assert.deepEqual((JSON.parse(text) as { login: unknown }).login, {
    username: 'staging',
    hasPassword: true,
    headers: ['Authorization'],
    cookies: ['session'],
  });
  assert.ok(!(await (await get(`/api/sites/${site.id}`)).text()).includes('hunter2'));

  // the scanner reads the real thing from the database
  const stored = await db.query.sites.findFirst({ where: (s, { eq }) => eq(s.id, site.id) });
  assert.equal(stored?.login?.password, 'hunter2');

  const cleared = await send('PATCH', `/api/sites/${site.id}`, {
    login: { username: '', headers: [], cookies: [] },
  });
  assert.equal(((await cleared.json()) as { login: unknown }).login, null);

  const owned = await send('PATCH', `/api/sites/${site.id}`, {
    login: { headers: [{ name: 'Host', value: 'example.com' }] },
  });
  assert.equal(owned.status, 400);
});

test('a pictured problem shows the element in its picture as the example', { skip }, async () => {
  const site = await seedSite();
  const scan = await seedScan(site.id, '2026-09-15T10:00:00Z', [
    { fingerprint: 'pic' },
    { fingerprint: 'nopic' },
  ]);
  const image = Buffer.from('RIFF0000WEBP');
  await db.insert(schema.issueShots).values({
    scanId: scan.id,
    fingerprint: 'pic',
    html: '<img src="hero.png">',
    target: ['main > img'],
    image,
    width: 120,
    height: 80,
  });

  const rows = (await (await get(`/api/scans/${scan.id}/issues`)).json()) as {
    fingerprint: string;
    shot: boolean;
    sampleHtml: string;
    sampleTarget: string;
  }[];
  const pictured = rows.find((row) => row.fingerprint === 'pic');
  assert.equal(pictured?.shot, true);
  assert.equal(pictured?.sampleHtml, '<img src="hero.png">');
  assert.deepEqual(JSON.parse(pictured?.sampleTarget ?? 'null'), ['main > img']);
  assert.equal(rows.find((row) => row.fingerprint === 'nopic')?.shot, false);

  const picture = await get(`/api/scans/${scan.id}/shots/pic`);
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/webp');
  assert.deepEqual(Buffer.from(await picture.arrayBuffer()), image);
  assert.equal((await get(`/api/scans/${scan.id}/shots/nopic`)).status, 404);
});

test('a legacy picture shared by multiple finding kinds cannot replace either group element evidence', {
  skip,
}, async () => {
  const site = await seedSite();
  const [scan] = await db
    .insert(schema.scans)
    .values({
      siteId: site.id,
      status: 'done',
      pagesScanned: 1,
    })
    .returning();
  assert.ok(scan);
  const [page] = await db
    .insert(schema.pages)
    .values({
      scanId: scan.id,
      url: 'https://noise.test/',
    })
    .returning();
  assert.ok(page);
  const violation = {
    kind: 'violation' as const,
    html: '<p id="violation">Confirmed contrast problem</p>',
    target: ['#violation'],
  };
  const review = {
    kind: 'incomplete' as const,
    html: '<p id="review">Contrast requires a human check</p>',
    target: ['#review'],
  };
  await db.insert(schema.issues).values(
    [violation, review].map((finding) => ({
      scanId: scan.id,
      pageId: page.id,
      fingerprint: 'shared-picture',
      checker: 'axe-core',
      ruleId: 'color-contrast',
      impact: 'serious',
      help: 'Elements must have sufficient color contrast',
      ...finding,
    })),
  );
  await db.insert(schema.issueShots).values({
    scanId: scan.id,
    fingerprint: 'shared-picture',
    html: violation.html,
    target: violation.target,
    image: Buffer.from('RIFF0000WEBP'),
    width: 120,
    height: 80,
  });
  const response = await get(`/api/scans/${scan.id}/issues`);
  assert.equal(response.status, 200);
  const rows = (await response.json()) as {
    fingerprint: string;
    kind: string;
    shot: boolean;
    sampleHtml: string;
    sampleTarget: string;
  }[];
  const shared = rows.filter((row) => row.fingerprint === 'shared-picture');
  assert.equal(shared.length, 2);
  for (const expected of [violation, review]) {
    const row = shared.find((finding) => finding.kind === expected.kind);
    assert.ok(row);
    assert.equal(row.shot, false);
    assert.equal(row.sampleHtml, expected.html);
    assert.deepEqual(JSON.parse(row.sampleTarget), expected.target);
  }
});

test('page endpoints preserve partial coverage and unknown coverage on older scans', {
  skip,
}, async () => {
  const site = await seedSite();
  const scan = await seedScan(site.id, '2026-10-08T10:00:00Z', [{ fingerprint: 'coverage' }]);
  const coverage: KeyboardCoverage = {
    status: 'partial',
    reasons: ['time-limit'],
    visitedStops: 12,
    forwardSteps: 14,
    backwardSteps: 0,
    focusChecks: 3,
    focusStylesTested: 3,
    focusStylesSkipped: 0,
    elapsedMs: 20_001,
    limits: { timeMs: 20_000, stepsPerDirection: 300, focusChecks: 40 },
  };
  const [partial] = await db
    .insert(schema.pages)
    .values({
      scanId: scan.id,
      url: 'https://noise.test/partial',
      keyboardCoverage: coverage,
    })
    .returning();
  assert.ok(partial);
  const response = await get(`/api/scans/${scan.id}/pages`);
  assert.equal(response.status, 200);
  const rows = (await response.json()) as {
    id: string;
    keyboardCoverage: KeyboardCoverage | null;
  }[];
  assert.deepEqual(rows.find((p) => p.id === partial.id)?.keyboardCoverage, coverage);
  const legacy = rows.find((p) => p.id !== partial.id);
  assert.ok(legacy);
  assert.equal(legacy.keyboardCoverage, null);

  const detail = await get(`/api/pages/${partial.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(
    ((await detail.json()) as { keyboardCoverage: unknown }).keyboardCoverage,
    coverage,
  );
  const old = await get(`/api/pages/${legacy.id}`);
  assert.equal(old.status, 200);
  assert.equal(((await old.json()) as { keyboardCoverage: unknown }).keyboardCoverage, null);
});

test('a site validates, stores and clears its scenario configuration', { skip }, async () => {
  const site = await seedSite();
  const scenarios: SiteScenario[] = [
    {
      name: 'Profile dialog',
      path: '/settings',
      steps: [
        { action: 'click', selector: '#open' },
        { action: 'waitFor', selector: '#dialog', state: 'visible' },
        { action: 'fill', selector: '#email', value: 'demo@example.test' },
        { action: 'press', key: 'Escape' },
        { action: 'expectFocus', selector: '#open' },
      ],
    },
  ];
  const saved = await send('PATCH', `/api/sites/${site.id}`, { scenarios });
  assert.equal(saved.status, 200);
  assert.deepEqual(((await saved.json()) as { scenarios: SiteScenario[] }).scenarios, scenarios);
  assert.deepEqual(
    ((await (await get(`/api/sites/${site.id}`)).json()) as { scenarios: SiteScenario[] })
      .scenarios,
    scenarios,
  );
  for (const invalid of [
    [{ ...scenarios[0], path: '/settings?tab=profile' }],
    [{ ...scenarios[0], steps: [] }],
    [{ ...scenarios[0], steps: [{ action: 'evaluate', script: 'void 0' }] }],
    [{ ...scenarios[0], steps: [{ action: 'click', selector: '#open', value: 'extra' }] }],
    [scenarios[0], { ...scenarios[0], name: 'PROFILE DIALOG' }],
    Array.from({ length: 6 }, (_, index) => ({ ...scenarios[0], name: `State ${index}` })),
  ]) {
    const bad = await send('PATCH', `/api/sites/${site.id}`, { scenarios: invalid });
    assert.equal(bad.status, 400);
  }
  const unchanged = (await (await get(`/api/sites/${site.id}`)).json()) as {
    scenarios: SiteScenario[];
  };
  assert.deepEqual(unchanged.scenarios, scenarios, 'invalid patches never change stored scenarios');
  const cleared = await send('PATCH', `/api/sites/${site.id}`, { scenarios: [] });
  assert.equal(cleared.status, 200);
  assert.deepEqual(((await cleared.json()) as { scenarios: SiteScenario[] }).scenarios, []);
});

test('page and scan endpoints preserve scenario execution evidence and legacy defaults', {
  skip,
}, async () => {
  const site = await seedSite();
  const summary: ScenarioSummary = {
    completed: 1,
    failed: 1,
    unmatched: [{ name: 'Checkout', path: '/checkout' }],
  };
  const [scan] = await db
    .insert(schema.scans)
    .values({
      siteId: site.id,
      status: 'done',
      pagesScanned: 2,
      scenarioSummary: summary,
    })
    .returning();
  assert.ok(scan);
  const runs: StoredScenarioRun[] = [
    {
      name: 'Profile dialog',
      path: '/settings',
      status: 'completed',
      steps: [{ action: 'click', selector: '#open', status: 'completed' }],
      error: null,
      keyboardCoverage: null,
      findings: 2,
    },
    {
      name: 'Focus returns',
      path: '/settings',
      status: 'failed',
      steps: [
        { action: 'expectFocus', selector: '#open', status: 'failed', actualFocus: '#other' },
      ],
      error: 'Step 1 (expectFocus) failed: the expected element did not have focus.',
      keyboardCoverage: null,
      findings: 0,
    },
  ];
  const [current] = await db
    .insert(schema.pages)
    .values({
      scanId: scan.id,
      url: 'https://noise.test/settings',
      scenarioRuns: runs,
    })
    .returning();
  const [legacy] = await db
    .insert(schema.pages)
    .values({
      scanId: scan.id,
      url: 'https://noise.test/',
    })
    .returning();
  assert.ok(current);
  assert.ok(legacy);
  const listed = await get(`/api/scans/${scan.id}/pages`);
  assert.equal(listed.status, 200);
  const rows = (await listed.json()) as { id: string; scenarioRuns: StoredScenarioRun[] }[];
  assert.deepEqual(rows.find((page) => page.id === current.id)?.scenarioRuns, runs);
  assert.deepEqual(rows.find((page) => page.id === legacy.id)?.scenarioRuns, []);
  for (const [page, expected] of [
    [current, runs],
    [legacy, []],
  ] as const) {
    const detail = await get(`/api/pages/${page.id}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(
      ((await detail.json()) as { scenarioRuns: StoredScenarioRun[] }).scenarioRuns,
      expected,
    );
  }
  const scanDetail = await get(`/api/scans/${scan.id}`);
  assert.equal(scanDetail.status, 200);
  assert.deepEqual(
    ((await scanDetail.json()) as { scenarioSummary: ScenarioSummary }).scenarioSummary,
    summary,
  );
  const scanRows = (await (await get(`/api/sites/${site.id}/scans`)).json()) as {
    id: string;
    scenarioSummary: ScenarioSummary | null;
  }[];
  assert.deepEqual(scanRows.find((row) => row.id === scan.id)?.scenarioSummary, summary);
  const older = await seedScan(site.id, '2026-09-01T10:00:00Z', [
    { fingerprint: 'legacy-scenario' },
  ]);
  const olderDetail = await get(`/api/scans/${older.id}`);
  assert.equal(olderDetail.status, 200);
  assert.equal(
    ((await olderDetail.json()) as { scenarioSummary: ScenarioSummary | null }).scenarioSummary,
    null,
  );
});

test('grouped scenario contexts keep their steps and page URLs within each finding kind', {
  skip,
}, async () => {
  const site = await seedSite();
  const scan = await seedScan(site.id, '2026-10-08T11:00:00Z', [
    { fingerprint: 'shared-scenario', kind: 'violation' },
    { fingerprint: 'shared-scenario', kind: 'incomplete' },
  ]);
  const [settings] = await db
    .insert(schema.pages)
    .values({
      scanId: scan.id,
      url: 'https://noise.test/settings?tab=profile',
    })
    .returning();
  const [checkout] = await db
    .insert(schema.pages)
    .values({
      scanId: scan.id,
      url: 'https://noise.test/checkout',
    })
    .returning();
  assert.ok(settings);
  assert.ok(checkout);
  const profile: ScenarioEvidence = {
    name: 'Profile dialog',
    path: '/settings',
    steps: [
      { action: 'click', selector: '#open', status: 'completed' },
      { action: 'fill', selector: '#email', status: 'completed' },
    ],
  };
  const payment: ScenarioEvidence = {
    name: 'Payment dialog',
    path: '/checkout',
    steps: [{ action: 'expectFocus', selector: '#pay', status: 'completed', actualFocus: '#pay' }],
  };
  const review: ScenarioEvidence = {
    name: 'Review focus',
    path: '/settings',
    steps: [{ action: 'press', key: 'Tab', status: 'completed' }],
  };
  await db.insert(schema.issues).values(
    [
      { page: settings, kind: 'violation' as const, scenario: profile },
      { page: settings, kind: 'violation' as const, scenario: profile },
      { page: checkout, kind: 'violation' as const, scenario: payment },
      { page: settings, kind: 'incomplete' as const, scenario: review },
    ].map(({ page, kind, scenario }) => ({
      scanId: scan.id,
      pageId: page.id,
      fingerprint: 'shared-scenario',
      kind,
      checker: 'axe-core',
      ruleId: 'image-alt',
      impact: 'serious',
      help: 'Problem shared-scenario',
      html: '<img data-f="shared-scenario">',
      scenario,
    })),
  );
  const response = await get(`/api/scans/${scan.id}/issues`);
  assert.equal(response.status, 200);
  const rows = (await response.json()) as {
    fingerprint: string;
    kind: string;
    occurrences: number;
    pagesAffected: number;
    scenarios: (ScenarioEvidence & { url: string })[];
  }[];
  const violations = rows.find(
    (row) => row.fingerprint === 'shared-scenario' && row.kind === 'violation',
  );
  const incomplete = rows.find(
    (row) => row.fingerprint === 'shared-scenario' && row.kind === 'incomplete',
  );
  assert.ok(violations);
  assert.ok(incomplete);
  assert.equal(violations.occurrences, 4);
  assert.equal(violations.pagesAffected, 3);
  assert.deepEqual(
    violations.scenarios.sort((a, b) => a.name.localeCompare(b.name)),
    [
      { ...payment, url: checkout.url },
      { ...profile, url: settings.url },
    ],
    'duplicate evidence is collapsed without merging classification contexts',
  );
  assert.equal(incomplete.occurrences, 2);
  assert.equal(incomplete.pagesAffected, 2);
  assert.deepEqual(incomplete.scenarios, [{ ...review, url: settings.url }]);
});
