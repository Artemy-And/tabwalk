import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { useRuleHelp } from '../i18n/ruleHelp';
import type { IssueGroup } from '../lib/api';
import { standardLabel } from '../lib/format';
import { Card, ImpactBadge } from './ui';

type SortKey = 'pagesAffected' | 'impact' | 'ruleId';
type SortDir = 'asc' | 'desc';

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

function selectorOf(target: string): string {
  try {
    const parsed: unknown = JSON.parse(target);
    return Array.isArray(parsed) ? parsed.map(String).join(' ') : target;
  } catch {
    return target;
  }
}

const TH = 'px-3 py-3 text-[13px] font-semibold text-muted first:pl-5 last:pr-5';
const TD = 'px-3 py-3.5 align-top first:pl-5 last:pr-5';

function SortButton({
  column,
  label,
  sortKey,
  sortDir,
  onToggle,
}: {
  column: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
}) {
  const { t } = useI18n();
  const active = column === sortKey;
  const nextAscending = active && sortDir === 'desc';
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className="inline-flex items-center gap-1 font-semibold hover:text-ink"
    >
      {label}
      <span aria-hidden="true">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      <span className="visually-hidden">{t.issues.sortAction(nextAscending)}</span>
    </button>
  );
}

export function IssuesTable({
  issues,
  variant = 'current',
  emptyMessage,
}: {
  issues: IssueGroup[];
  variant?: 'current' | 'fixed' | 'recommendations';
  emptyMessage?: string;
}) {
  const { t } = useI18n();
  const ruleHelp = useRuleHelp();
  const captions = {
    current: t.issues.caption,
    fixed: t.issues.fixedCaption,
    recommendations: t.issues.recommendationsCaption,
  };
  const [sortKey, setSortKey] = useState<SortKey>('impact');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const impactRank = (issue: IssueGroup) =>
      issue.kind === 'incomplete'
        ? 4
        : issue.kind === 'recommendation'
          ? 5
          : (IMPACT_ORDER[issue.impact ?? 'minor'] ?? 9);
    const copy = [...issues];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'pagesAffected') diff = a.pagesAffected - b.pagesAffected;
      else if (sortKey === 'ruleId') diff = a.ruleId.localeCompare(b.ruleId);
      else diff = impactRank(a) - impactRank(b) || b.pagesAffected - a.pagesAffected;
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [issues, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'impact' ? 'asc' : 'desc');
    }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (key !== sortKey) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  const sortProps = { sortKey, sortDir, onToggle: toggle };

  if (issues.length === 0) {
    return (
      <Card className="px-5 py-6">
        <p className="text-[15px] text-muted">{emptyMessage ?? t.issues.empty}</p>
      </Card>
    );
  }

  return (
    <>
      <p aria-live="polite" className="visually-hidden">
        {t.issues.sortAnnouncement(t.issues.sortedBy[sortKey], sortDir === 'asc')}
      </p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
          <caption className="px-5 pt-4 pb-3 text-left text-sm text-muted">
            {captions[variant]} {t.issues.rows(sorted.length)}
          </caption>
          <thead>
            <tr className="border-y border-line bg-surface-alt">
              <th scope="col" aria-sort={ariaSort('impact')} className={`${TH} w-44`}>
                <SortButton column="impact" label={t.issues.columns.impact} {...sortProps} />
              </th>
              <th scope="col" className={TH}>
                {t.issues.columns.problem}
              </th>
              <th scope="col" aria-sort={ariaSort('ruleId')} className={`${TH} w-48`}>
                <SortButton column="ruleId" label={t.issues.columns.ruleId} {...sortProps} />
              </th>
              <th scope="col" aria-sort={ariaSort('pagesAffected')} className={`${TH} w-28`}>
                <SortButton
                  column="pagesAffected"
                  label={t.issues.columns.pagesAffected}
                  {...sortProps}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((issue) => (
              <tr
                key={`${issue.kind}:${issue.impact ?? ''}:${issue.fingerprint}`}
                className={`border-b border-line-soft last:border-b-0 ${
                  issue.kind === 'incomplete' ? 'bg-review-row' : ''
                }`}
              >
                <td className={TD}>
                  <ImpactBadge impact={issue.impact} kind={issue.kind} />
                </td>
                <td className={TD}>
                  <p className="font-semibold">
                    {ruleHelp(issue.ruleId, issue.help)}
                    {variant === 'current' && issue.isNew && (
                      <span className="ml-2 inline-block rounded bg-surface-alt px-1.5 py-px align-[2px] text-xs font-semibold text-accent ring-1 ring-line">
                        {t.issues.newTag}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-mono text-[13px] break-all text-muted">
                    {selectorOf(issue.sampleTarget)}
                  </p>
                  {variant === 'fixed' && (
                    <p className="mt-1 text-sm text-good">{t.issues.fixedNote}</p>
                  )}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-muted">
                      {t.issues.showMarkup}
                    </summary>
                    <pre className="mt-2 max-w-2xl overflow-x-auto rounded-lg border border-line bg-surface-alt p-3 font-mono text-[13px] leading-relaxed">
                      <code>{issue.sampleHtml}</code>
                    </pre>
                    {issue.sampleSummary && (
                      <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-muted">
                        {issue.sampleSummary}
                      </p>
                    )}
                  </details>
                </td>
                <td className={`${TD} font-mono text-[13px] text-muted`}>
                  {issue.helpUrl ? (
                    <a href={issue.helpUrl} target="_blank" rel="noreferrer">
                      {issue.ruleId}
                      <span className="visually-hidden">{t.issues.opensInNewTab}</span>
                    </a>
                  ) : (
                    issue.ruleId
                  )}
                  {issue.wcagTags.length > 0 && <p>{issue.wcagTags.join(' · ')}</p>}
                  {issue.standards.length > 0 && (
                    <p className="mt-0.5 font-sans text-[13px]">
                      {issue.standards.map(standardLabel).join(' · ')}
                    </p>
                  )}
                </td>
                <td className={`${TD} tabular-nums`}>{issue.pagesAffected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
