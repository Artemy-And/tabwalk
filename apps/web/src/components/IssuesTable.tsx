import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import type { IssueGroup } from '../lib/api';
import { ImpactBadge } from './ui';

type SortKey = 'pagesAffected' | 'impact' | 'ruleId';
type SortDir = 'asc' | 'desc';

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

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
      className="inline-flex items-center gap-1 font-semibold"
    >
      {label}
      <span aria-hidden="true">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      <span className="visually-hidden">{t.issues.sortAction(nextAscending)}</span>
    </button>
  );
}

export function IssuesTable({ issues }: { issues: IssueGroup[] }) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>('pagesAffected');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const copy = [...issues];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'pagesAffected') diff = a.pagesAffected - b.pagesAffected;
      else if (sortKey === 'ruleId') diff = a.ruleId.localeCompare(b.ruleId);
      else {
        const av = IMPACT_ORDER[a.impact ?? 'minor'] ?? 9;
        const bv = IMPACT_ORDER[b.impact ?? 'minor'] ?? 9;
        diff = av - bv;
      }
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [issues, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (key !== sortKey) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  const sortProps = { sortKey, sortDir, onToggle: toggle };

  if (issues.length === 0) {
    return <p className="text-sm text-muted">{t.issues.empty}</p>;
  }

  return (
    <>
      <p aria-live="polite" className="visually-hidden">
        {t.issues.sortAnnouncement(t.issues.sortedBy[sortKey], sortDir === 'asc')}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="pb-3 text-left text-sm text-muted">
            {t.issues.caption} {t.issues.rows(sorted.length)}
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" aria-sort={ariaSort('impact')} className="py-2 pr-4">
                <SortButton column="impact" label={t.issues.columns.impact} {...sortProps} />
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t.issues.columns.problem}
              </th>
              <th scope="col" aria-sort={ariaSort('ruleId')} className="py-2 pr-4">
                <SortButton column="ruleId" label={t.issues.columns.ruleId} {...sortProps} />
              </th>
              <th scope="col" aria-sort={ariaSort('pagesAffected')} className="py-2 pr-4">
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
              <tr key={issue.fingerprint} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <ImpactBadge impact={issue.impact} kind={issue.kind} />
                </td>
                <td className="py-3 pr-4">
                  <p className="text-ink">{issue.help}</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted">
                      {t.issues.showMarkup}
                    </summary>
                    <pre className="mt-2 max-w-2xl overflow-x-auto rounded bg-canvas p-2 text-xs">
                      <code>{issue.sampleHtml}</code>
                    </pre>
                    {issue.sampleSummary && (
                      <p className="mt-2 max-w-2xl text-xs text-muted">{issue.sampleSummary}</p>
                    )}
                  </details>
                </td>
                <td className="py-3 pr-4">
                  {issue.helpUrl ? (
                    <a
                      href={issue.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline"
                    >
                      {issue.ruleId}
                      <span className="visually-hidden">{t.issues.opensInNewTab}</span>
                    </a>
                  ) : (
                    issue.ruleId
                  )}
                  {issue.wcagTags.length > 0 && (
                    <p className="text-xs text-muted">{issue.wcagTags.join(', ')}</p>
                  )}
                </td>
                <td className="py-3 pr-4 tabular-nums">{issue.pagesAffected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
