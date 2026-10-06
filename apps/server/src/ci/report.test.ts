import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BaselineError,
  blockingOf,
  compare,
  type Group,
  markdown,
  type Outcome,
  readBaseline,
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
