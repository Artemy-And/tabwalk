import { readFile } from 'node:fs/promises';
import type { PageFinding } from '../scanner/check.js';

export const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const;
export type ImpactLevel = (typeof IMPACTS)[number];
export type Threshold = ImpactLevel | 'none';

export interface Group {
  kind: PageFinding['kind'];
  ruleId: string;
  impact: ImpactLevel;
  help: string;
  helpUrl: string | null;
  wcagTags: string[];
  standards: string[];
  fingerprint: string;
  target: string[];
  html: string;
  pages: string[];
  elements: number;
  // set only when there is a baseline to compare with
  new?: boolean;
}

export interface Baseline {
  path: string;
  // null while the file is not there yet, as on the first run: then every problem counts
  problems: Group[] | null;
}

export interface Outcome {
  siteUrl: string;
  checked: number;
  failedPages: { url: string; error: string }[];
  failOn: Threshold;
  // what was left out as asked, already formatted
  ignored: string;
  violations: Group[];
  incomplete: Group[];
  recommendations: Group[];
  baseline: Baseline | null;
  // baseline problems this run did not find
  gone: Group[];
  blocking: Group[];
}

export class BaselineError extends Error {}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function impactOf(raw: string | null): ImpactLevel {
  return IMPACTS.includes(raw as ImpactLevel) ? (raw as ImpactLevel) : 'minor';
}

export function rank(impact: ImpactLevel): number {
  return IMPACTS.indexOf(impact);
}

// an earlier run's report; any tabwalk-report.json will do
export async function readBaseline(path: string): Promise<Baseline> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { path, problems: null };
    throw new BaselineError(`Could not read the baseline ${path}`);
  }
  let report: unknown;
  try {
    report = JSON.parse(text);
  } catch {
    throw new BaselineError(`The baseline ${path} is not JSON`);
  }
  const violations = (report as { violations?: unknown } | null)?.violations;
  if (
    !Array.isArray(violations) ||
    !violations.every((v) => typeof (v as { fingerprint?: unknown })?.fingerprint === 'string')
  ) {
    throw new BaselineError(`The baseline ${path} is not a Tabwalk report`);
  }
  return { path, problems: violations as Group[] };
}

// marks each problem new or known, and finds the known ones this run no longer sees
export function compare(violations: Group[], baseline: Baseline | null) {
  if (!baseline?.problems) return { violations, gone: [] as Group[] };
  const known = new Set(baseline.problems.map((p) => p.fingerprint));
  const now = new Set(violations.map((g) => g.fingerprint));
  return {
    violations: violations.map((g) => ({ ...g, new: !known.has(g.fingerprint) })),
    gone: baseline.problems.filter((p) => !now.has(p.fingerprint)),
  };
}

export function blockingOf(violations: Group[], failOn: Threshold): Group[] {
  if (failOn === 'none') return [];
  return violations.filter((g) => rank(g.impact) <= rank(failOn) && g.new !== false);
}

export function summarize(o: Outcome) {
  const count = (impact: ImpactLevel) => o.violations.filter((g) => g.impact === impact).length;
  return {
    uniqueProblems: o.violations.length,
    critical: count('critical'),
    serious: count('serious'),
    moderate: count('moderate'),
    minor: count('minor'),
    incomplete: o.incomplete.length,
    recommendations: o.recommendations.length,
    elements: o.violations.reduce((sum, g) => sum + g.elements, 0),
    ...(o.baseline?.problems
      ? { new: o.violations.filter((g) => g.new).length, noLongerFound: o.gone.length }
      : {}),
  };
}

export function headline(o: Outcome): string {
  const s = summarize(o);
  return (
    `${plural(o.checked, 'page')} checked · ${plural(s.uniqueProblems, 'unique problem')} ` +
    `on ${plural(s.elements, 'element')} (${s.critical} critical, ${s.serious} serious)` +
    (s.new === undefined ? '' : ` · ${s.new} new`) +
    ` · ${s.incomplete} need a human · ${plural(s.recommendations, 'recommendation')}`
  );
}

export function verdict(o: Outcome): string {
  const what = o.baseline?.problems ? 'new problem' : 'problem';
  if (o.failOn === 'none') return 'The job does not fail on problems (fail-on: none).';
  if (o.blocking.length > 0) {
    return `Fails: ${plural(o.blocking.length, what)} at or above ${o.failOn}.`;
  }
  return `Passes: no ${what}s at or above ${o.failOn}.`;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export function table(groups: Group[], limit = Number.POSITIVE_INFINITY): string {
  const rows = groups.slice(0, limit).map((g) => {
    const rule = g.helpUrl ? `[${g.ruleId}](${g.helpUrl})` : g.ruleId;
    const label =
      g.kind === 'incomplete' ? 'needs review' : g.kind === 'recommendation' ? 'advice' : g.impact;
    return `| ${label} | ${cell(g.help)} \`${cell(
      g.target.join(' '),
    )}\` | ${rule} | ${g.pages.length} |`;
  });
  const lines = ['| Impact | Problem | Rule | Pages |', '| --- | --- | --- | --- |', ...rows];
  const rest = groups.length - rows.length;
  return rest > 0
    ? `${lines.join('\n')}\n\nAnd ${rest} more in the full report.`
    : lines.join('\n');
}

const details = (summary: string, body: string) =>
  `<details><summary>${summary}</summary>\n\n${body}\n\n</details>`;

// the job summary, and the pull request comment with a cap on rows
export function markdown(o: Outcome, options: { limit?: number; link?: string } = {}): string {
  const { limit } = options;
  const parts = [`## Accessibility: ${o.siteUrl}`, `**${verdict(o)}** ${headline(o)}`];
  if (o.ignored) parts.push(`Not reported, as asked: ${o.ignored}`);

  if (o.baseline && !o.baseline.problems) {
    parts.push(`No baseline at \`${o.baseline.path}\` yet, so every problem counts.`);
  }
  if (o.baseline?.problems) {
    const fresh = o.violations.filter((g) => g.new);
    const known = o.violations.filter((g) => !g.new);
    parts.push(
      fresh.length > 0
        ? `### New since the baseline\n\n${table(fresh, limit)}`
        : 'No new problems since the baseline.',
    );
    if (known.length > 0) {
      parts.push(
        details(`${plural(known.length, 'known problem')} from the baseline`, table(known, limit)),
      );
    }
    if (o.gone.length > 0) {
      parts.push(
        details(
          `${plural(o.gone.length, 'problem')} from the baseline no longer found`,
          table(o.gone, limit),
        ),
      );
    }
  } else if (o.violations.length > 0) {
    parts.push(table(o.violations, limit));
  }

  if (o.incomplete.length > 0) {
    parts.push(
      details(
        `${plural(o.incomplete.length, 'result')} ${o.incomplete.length === 1 ? 'needs' : 'need'} a human`,
        table(o.incomplete, limit),
      ),
    );
  }
  if (o.recommendations.length > 0) {
    parts.push(
      details(
        `${plural(o.recommendations.length, 'recommendation')} beyond WCAG`,
        table(o.recommendations, limit),
      ),
    );
  }
  if (o.failedPages.length > 0) {
    parts.push(
      `${plural(o.failedPages.length, 'page')} failed to load: ${o.failedPages.map((p) => p.url).join(', ')}`,
    );
  }
  if (options.link) parts.push(`[Full results](${options.link})`);
  parts.push(
    '> Automated checks catch part of what WCAG asks for. This is not a statement that the site ' +
      'meets any standard.',
  );
  return `${parts.join('\n\n')}\n`;
}
