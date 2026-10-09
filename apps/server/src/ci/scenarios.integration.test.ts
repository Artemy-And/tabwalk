import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Group, Outcome } from './report.js';

let server: Server;
let url: string;
let directory: string;

const PAGE = `<!doctype html><html lang="en"><head><title>Settings</title></head><body>
<main><h1>Settings</h1><input id="field" aria-label="Test field">
<button id="open">Open settings</button><div id="panel" hidden>
<img id="missing-alt" src="data:," width="20" height="20">
<img id="another-missing-alt" src="data:," width="20" height="20"></div></main>
<script>document.querySelector('#open').addEventListener('click', () => {
document.querySelector('#panel').hidden = false;
});</script></body></html>`;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tabwalk-ci-scenarios-'));
  const reflow = await readFile(
    new URL('../../../../examples/reflow/index.html', import.meta.url),
    'utf8',
  );
  server = createServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://fixture.test').pathname === '/reflow') {
      response.writeHead(200, { 'content-type': 'text/html' }).end(reflow);
      return;
    }
    if (request.url !== '/') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

interface CliResult {
  code: number | null;
  output: string;
  reportPath: string;
  summaryPath: string;
}

async function cli(
  configuration: string,
  viaInput = false,
  environments: string[] = [],
  forwardEnvironments = false,
  target = url,
  failOn = 'none',
): Promise<CliResult> {
  const runDirectory = await mkdtemp(join(directory, 'run-'));
  const scenariosPath = join(runDirectory, 'scenarios.json');
  const reportPath = join(runDirectory, 'report.json');
  const summaryPath = join(runDirectory, 'summary.md');
  await writeFile(scenariosPath, configuration);
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('INPUT_') || key.startsWith('GITHUB_')) delete environment[key];
  }
  environment.GITHUB_STEP_SUMMARY = summaryPath;
  if (viaInput) environment.INPUT_SCENARIOS = scenariosPath;
  if (viaInput && environments.length) environment.INPUT_ENVIRONMENTS = environments.join(',');

  const args = [
    '--import',
    'tsx',
    fileURLToPath(new URL('../ci.ts', import.meta.url)),
    target,
    '--max-pages',
    '1',
    '--concurrency',
    '1',
    '--fail-on',
    failOn,
    '--report',
    reportPath,
    ...(viaInput ? [] : ['--scenarios', scenariosPath]),
    ...((!viaInput || forwardEnvironments) && environments.length
      ? ['--environments', environments.join(',')]
      : []),
  ];
  const child = spawn(process.execPath, args, {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { code, output, reportPath, summaryPath };
}

interface CliReport {
  environments: { id: string }[];
  environmentRuns: {
    url: string;
    runs: { environment: { id: string }; status: string; elapsedMs: number }[];
  }[];
  failed: boolean;
  violations: Group[];
  incomplete: Group[];
  scenarioRuns: NonNullable<Outcome['scenarioRuns']>;
  unmatchedScenarios: NonNullable<Outcome['unmatchedScenarios']>;
}

test('CLI checks every selected environment and reports the actual scope via INPUT_ENVIRONMENTS', async () => {
  const result = await cli('[]', true, ['mobile', 'zoom-200', 'zoom-400', 'forced-colors'], true);
  assert.equal(result.code, 0, result.output);
  const report = JSON.parse(await readFile(result.reportPath, 'utf8')) as CliReport;
  assert.deepEqual(
    report.environments.map((profile) => profile.id),
    ['desktop', 'mobile', 'zoom-200', 'zoom-400', 'forced-colors'],
  );
  assert.equal(report.environmentRuns[0]?.runs.length, 5);
  assert.ok(
    report.environmentRuns[0]?.runs.every((run) => run.status === 'completed' && run.elapsedMs > 0),
  );
  const summary = await readFile(result.summaryPath, 'utf8');
  assert.match(summary, /Tested environments/);
  assert.match(summary, /zoom-200 \(640×360 CSS px, scale 2/);
  assert.match(summary, /zoom-400 \(320×180 CSS px, scale 4/);
  assert.match(summary, /forced-colors/);
});

test('CLI retains reflow measurements and manual findings do not fail automatic thresholds', async () => {
  const broken = await cli('[]', false, ['zoom-400'], false, `${url}reflow`, 'serious');
  assert.equal(broken.code, 0, broken.output);
  const report = JSON.parse(await readFile(broken.reportPath, 'utf8')) as CliReport;
  assert.equal(report.failed, false);
  assert.equal(report.violations.length, 0);
  assert.equal(report.incomplete.length, 2);
  for (const finding of report.incomplete) {
    assert.equal(finding.kind, 'incomplete');
    assert.equal(finding.evidence?.environment?.id, 'zoom-400');
    assert.equal(finding.evidence?.url, `${url}reflow`);
    assert.match(finding.evidence!.summary, /320 × 180 CSS px/);
  }
  const summary = await readFile(broken.summaryPath, 'utf8');
  assert.match(summary, /Example evidence/);
  assert.match(summary, /clipping by #clipped/);
  assert.match(summary, /requiring human assessment/);
  const fixed = await cli('[]', false, ['zoom-400'], false, `${url}reflow?fixed`, 'serious');
  assert.equal(fixed.code, 0, fixed.output);
  const fixedReport = JSON.parse(await readFile(fixed.reportPath, 'utf8')) as CliReport;
  assert.equal(fixedReport.incomplete.length, 0);
});

test('invalid environment flags fail explicitly before scanning', async () => {
  for (const environments of [['mobile', 'mobile'], ['unknown']]) {
    const result = await cli('[]', false, environments);
    assert.equal(result.code, 2);
    assert.match(result.output, /--environments must list/);
  }
});

test('CLI scans named states, groups findings and writes redacted reproduction contexts', async () => {
  const secret = 'configuration-fill-value-is-private';
  const configuration = JSON.stringify(
    ['Reveal', 'Reveal again'].map((name) => ({
      name,
      path: '/',
      steps: [
        { action: 'fill', selector: '#field', value: secret },
        { action: 'click', selector: '#open' },
      ],
    })),
  );
  const result = await cli(configuration);
  assert.equal(result.code, 0, result.output);
  const raw = await readFile(result.reportPath, 'utf8');
  const report = JSON.parse(raw) as CliReport;
  assert.equal(report.failed, false);
  assert.deepEqual(report.unmatchedScenarios, []);
  assert.equal(report.scenarioRuns.length, 1);
  assert.equal(report.scenarioRuns[0]?.url, url);
  assert.ok(report.scenarioRuns[0]?.runs.every((run) => run.status === 'completed'));
  const finding = report.violations.find((group) => group.ruleId === 'image-alt');
  assert.ok(finding);
  assert.deepEqual(finding.pages, [url]);
  assert.equal(finding.elements, 4);
  assert.deepEqual(
    finding.scenarios?.map((context) => [context.name, context.url]),
    [
      ['Reveal', url],
      ['Reveal again', url],
    ],
  );
  assert.equal(raw.includes(secret), false);
  assert.equal(result.output.includes(secret), false);
  const summary = await readFile(result.summaryPath, 'utf8');
  assert.equal(summary.includes(secret), false);
  assert.match(summary, /fill #field/);
  assert.match(summary, /Reveal again/);
});

test('GitHub Action INPUT_SCENARIOS failures exit 2 even with fail-on none', async () => {
  const result = await cli(
    JSON.stringify([
      {
        name: 'Focus mismatch',
        path: '/',
        steps: [{ action: 'expectFocus', selector: '#field' }],
      },
    ]),
    true,
  );
  assert.equal(result.code, 2, result.output);
  const report = JSON.parse(await readFile(result.reportPath, 'utf8')) as CliReport;
  assert.equal(report.failed, true);
  assert.equal(report.scenarioRuns[0]?.runs[0]?.status, 'failed');
  assert.deepEqual(report.unmatchedScenarios, []);
  assert.match(result.output, /Focus mismatch.*failed/);
  const summary = await readFile(result.summaryPath, 'utf8');
  assert.match(summary, /\*\*Fails:/);
  assert.match(summary, /expectFocus #field; actual focus: body/);
});

test('unmatched exact pathnames fail operationally and preserve no configuration values', async () => {
  const secret = 'unmatched-fill-value';
  const result = await cli(
    JSON.stringify([
      {
        name: 'Unvisited',
        path: '/not-crawled',
        steps: [{ action: 'fill', selector: '#field', value: secret }],
      },
    ]),
  );
  assert.equal(result.code, 2, result.output);
  const raw = await readFile(result.reportPath, 'utf8');
  const report = JSON.parse(raw) as CliReport;
  assert.equal(report.failed, true);
  assert.deepEqual(report.scenarioRuns, []);
  assert.deepEqual(report.unmatchedScenarios, [{ name: 'Unvisited', path: '/not-crawled' }]);
  assert.equal(raw.includes(secret), false);
  assert.equal(result.output.includes(secret), false);
  assert.match(await readFile(result.summaryPath, 'utf8'), /Unvisited: \/not-crawled/);
});

test('malformed scenario JSON and invalid steps fail before scanning without echoing values', async () => {
  const secret = 'invalid-config-secret-value';
  for (const configuration of [
    `{"private":"${secret}"`,
    JSON.stringify([{ name: 'Bad', path: '/', steps: [{ action: 'unknown', value: secret }] }]),
  ]) {
    const result = await cli(configuration);
    assert.equal(result.code, 2, result.output);
    assert.equal(result.output.includes(secret), false);
    assert.equal(result.output.includes('Checking up to'), false);
    assert.match(result.output, /scenarios file/);
    await assert.rejects(readFile(result.reportPath), { code: 'ENOENT' });
  }
});
