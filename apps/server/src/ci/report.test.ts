import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { KeyboardCoverage, StoredScenarioRun } from '../scanner/types.js';
import {
  BaselineError,
  blockingOf,
  compare,
  type Group,
  hasScenarioFailures,
  markdown,
  type Outcome,
  readBaseline,
  verdict,
} from './report.js';

function group(fingerprint: string, impact: Group['impact'] = 'serious'): Group {
  return {
    kind: 'violation',
    ruleId: 'image-alt',
    impact,
    help: `Problem ${fingerprint}`,
    helpUrl: null,
    wcagTags: [],
    standards: [],
    fingerprint,
    target: [`#${fingerprint}`],
    html: '<img>',
    pages: ['https://example.com/'],
    elements: 1,
  };
}

function outcome(violations: Group[], extra: Partial<Outcome> = {}): Outcome {
  return {
    siteUrl: 'https://example.com/',
    checked: 1,
    failedPages: [],
    failOn: 'serious',
    ignored: '',
    violations,
    incomplete: [],
    recommendations: [],
    baseline: null,
    gone: [],
    blocking: blockingOf(violations, 'serious'),
    ...extra,
  };
}

test('only problems the baseline lacks fail the check', () => {
  const baseline = { path: 'base.json', problems: [group('old'), group('fixed')] };
  const { violations, gone } = compare([group('old'), group('fresh')], baseline);

  assert.deepEqual(
    violations.map((g) => [g.fingerprint, g.new]),
    [
      ['old', false],
      ['fresh', true],
    ],
  );
  assert.deepEqual(
    gone.map((g) => g.fingerprint),
    ['fixed'],
  );
  assert.deepEqual(
    blockingOf(violations, 'serious').map((g) => g.fingerprint),
    ['fresh'],
  );
  // below the threshold a new problem still passes
  assert.deepEqual(blockingOf([{ ...group('minor', 'minor'), new: true }], 'serious'), []);
  assert.deepEqual(blockingOf(violations, 'none'), []);
});

test('without a baseline file yet every problem counts', () => {
  const { violations, gone } = compare([group('a')], { path: 'base.json', problems: null });
  assert.equal(violations[0]?.new, undefined);
  assert.deepEqual(gone, []);
  assert.equal(blockingOf(violations, 'serious').length, 1);
});

test('a baseline is any report from an earlier run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tabwalk-baseline-'));
  const report = join(dir, 'tabwalk-report.json');
  await writeFile(report, JSON.stringify({ violations: [group('a')] }));
  assert.deepEqual(
    (await readBaseline(report)).problems?.map((g) => g.fingerprint),
    ['a'],
  );

  assert.equal((await readBaseline(join(dir, 'missing.json'))).problems, null);

  const broken = join(dir, 'broken.json');
  await writeFile(broken, '{"violations": ');
  await assert.rejects(readBaseline(broken), BaselineError);
  await writeFile(broken, '{"pages": []}');
  await assert.rejects(readBaseline(broken), /not a Tabwalk report/);
});

test('the summary puts new problems first and folds the known ones', () => {
  const baseline = { path: 'base.json', problems: [group('old'), group('fixed')] };
  const { violations, gone } = compare([group('old'), group('fresh')], baseline);
  const text = markdown(
    outcome(violations, { baseline, gone, blocking: blockingOf(violations, 'serious') }),
    { link: 'https://github.com/o/r/actions/runs/1' },
  );

  assert.ok(text.includes('**Fails: 1 new problem at or above serious.**'));
  assert.ok(text.indexOf('### New since the baseline') < text.indexOf('Problem fresh'));
  assert.ok(text.indexOf('Problem fresh') < text.indexOf('1 known problem from the baseline'));
  assert.ok(text.includes('1 problem from the baseline no longer found'));
  assert.ok(text.includes('[Full results](https://github.com/o/r/actions/runs/1)'));

  const clean = markdown(outcome([], { baseline, gone: [] }));
  assert.ok(clean.includes('**Passes: no new problems at or above serious.**'));
  assert.ok(clean.includes('No new problems since the baseline.'));
});

test('a long table is cut in the comment', () => {
  const many = Array.from({ length: 30 }, (_, i) => group(`p${i}`));
  const text = markdown(outcome(many), { limit: 25 });
  assert.ok(text.includes('Problem p24'));
  assert.ok(!text.includes('Problem p25'));
  assert.ok(text.includes('And 5 more in the full report.'));
});

test('a passing summary still shows partial keyboard coverage and its reason', () => {
  const coverage: KeyboardCoverage = {
    status: 'partial',
    reasons: ['time-limit'],
    visitedStops: 2,
    forwardSteps: 2,
    backwardSteps: 0,
    focusChecks: 1,
    focusStylesTested: 1,
    focusStylesSkipped: 0,
    elapsedMs: 20_001,
    limits: { timeMs: 20_000, stepsPerDirection: 300, focusChecks: 40 },
  };
  const text = markdown(
    outcome([], {
      keyboardCoverage: [
        { url: 'https://example.com/', coverage },
        { url: 'https://example.com/old', coverage: null },
      ],
    }),
  );
  assert.match(text, /Passes:/);
  assert.match(text, /Keyboard coverage is partial on 2 pages/);
  assert.match(text, /time-limit/);
  assert.match(text, /coverage not recorded/);
  assert.match(text, /checks performed/);
});

function storedScenario(extra: Partial<StoredScenarioRun> = {}): StoredScenarioRun {
  return {
    name: 'Open settings',
    path: '/settings',
    status: 'completed',
    steps: [{ action: 'click', selector: '#open', status: 'completed' }],
    error: null,
    keyboardCoverage: null,
    findings: 0,
    ...extra,
  };
}

test('failed and unmatched scenarios fail the verdict even when fail-on is none', () => {
  const failed = outcome([], {
    failOn: 'none',
    scenarioRuns: [
      {
        url: 'https://example.com/settings',
        runs: [
          storedScenario({
            status: 'failed',
            error: 'Step 2 (expectFocus) failed: the expected element did not have focus.',
            steps: [
              { action: 'click', selector: '#open', status: 'completed' },
              { action: 'expectFocus', selector: '#close', status: 'failed', actualFocus: '#open' },
            ],
          }),
        ],
      },
    ],
  });
  assert.equal(hasScenarioFailures(failed), true);
  assert.match(verdict(failed), /^Fails:/);
  const text = markdown(failed);
  assert.match(text, /Step 2 \(expectFocus\) failed/);
  assert.match(text, /expectFocus #close; actual focus: #open/);
  assert.match(text, /1\. completed: click #open/);
  assert.equal(text.includes('does not fail'), false);

  const unmatched = outcome([], {
    failOn: 'none',
    unmatchedScenarios: [{ name: 'Open preferences', path: '/unvisited' }],
  });
  assert.equal(hasScenarioFailures(unmatched), true);
  assert.match(verdict(unmatched), /^Fails:/);
  assert.match(markdown(unmatched), /Open preferences: \/unvisited/);
  assert.match(markdown(unmatched), /did not run because its path was not checked/);
});

test('scenario reproduction lists safe step fields and omits fill values', () => {
  const secret = 'fill-value-never-in-markdown';
  const run = storedScenario({
    steps: [
      {
        action: 'fill',
        selector: '#field',
        status: 'completed',
        value: secret,
      } as StoredScenarioRun['steps'][number],
      { action: 'waitFor', selector: '#panel', state: 'visible', status: 'completed' },
      { action: 'press', key: 'Escape', status: 'completed' },
    ],
  });
  const finding = {
    ...group('scenario'),
    scenarios: [
      { url: 'https://example.com/settings', name: run.name, path: run.path, steps: run.steps },
    ],
  };
  const text = markdown(
    outcome([finding], {
      scenarioRuns: [{ url: 'https://example.com/settings', runs: [run] }],
    }),
  );
  assert.match(text, /Scenarios/);
  assert.match(text, /Open settings \(https:\/\/example.com\/settings\)/);
  assert.match(text, /fill #field/);
  assert.match(text, /waitFor #panel \(visible\)/);
  assert.match(text, /press Escape/);
  assert.equal(text.includes(secret), false);
});

test('completed scenarios with partial keyboard coverage keep a passing verdict and show reasons', () => {
  const run = storedScenario({
    keyboardCoverage: {
      status: 'partial',
      reasons: ['dialog-blocked'],
      visitedStops: 2,
      forwardSteps: 3,
      backwardSteps: 0,
      focusChecks: 2,
      focusStylesTested: 2,
      focusStylesSkipped: 0,
      elapsedMs: 200,
      limits: { timeMs: 20_000, stepsPerDirection: 300, focusChecks: 40 },
    },
  });
  const result = outcome([], {
    scenarioRuns: [{ url: 'https://example.com/settings', runs: [run] }],
  });
  assert.equal(hasScenarioFailures(result), false);
  assert.match(verdict(result), /^Passes:/);
  const text = markdown(result);
  assert.match(text, /Keyboard coverage is partial in 1 scenario run/);
  assert.match(text, /Open settings on https:\/\/example.com\/settings: dialog-blocked/);
  assert.match(text, /checks performed/);
});
