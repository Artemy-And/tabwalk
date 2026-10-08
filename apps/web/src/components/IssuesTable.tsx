import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { useRuleHelp } from '../i18n/ruleHelp';
import { api, DISMISSAL_REASONS, type DismissalReason, type IssueGroup } from '../lib/api';
import { formatDay, standardLabel } from '../lib/format';
import { FindingEnvironments } from './Environments';
import { ManualReviewForm, ReviewDetails } from './ManualReview';
import { FindingScenarios } from './ScenarioResults';
import { Badge, Button, Card, Field, ImpactBadge } from './ui';

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

// a dismissal changes the counts of every report and list of the site
function useRefresh(scanId: string, siteId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      ['issues', scanId],
      ['scan', scanId],
      ['fixed', scanId],
      ['pages', scanId],
      ['site', siteId],
      ['sites'],
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

interface RowActions {
  siteId: string;
  scanId: string;
  // the row leaves the list, so the page says what happened and takes focus
  onChange: (notice: string) => void;
}

function DismissForm({
  issue,
  title,
  actions,
}: {
  issue: IssueGroup;
  title: string;
  actions: RowActions;
}) {
  const { t } = useI18n();
  const id = useId();
  const [reason, setReason] = useState<DismissalReason>('false_positive');
  const [note, setNote] = useState('');
  const refresh = useRefresh(actions.scanId, actions.siteId);
  const dismiss = useMutation({
    mutationFn: () =>
      api.dismiss(actions.siteId, {
        fingerprint: issue.fingerprint,
        reason,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      actions.onChange(t.issues.dismissedNotice(title));
      refresh();
    },
  });

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm text-muted">{t.issues.dismiss}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          dismiss.mutate();
        }}
        className="mt-2 flex max-w-xl flex-col gap-3"
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold text-ink">{t.issues.dismissReason}</legend>
          {DISMISSAL_REASONS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-[15px]">
              <input
                type="radio"
                name={`${id}-reason`}
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
              />
              {t.issues.reasons[value]}
            </label>
          ))}
        </fieldset>
        <Field
          label={t.issues.dismissNote}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={dismiss.isPending}>
            {dismiss.isPending ? t.issues.dismissing : t.issues.dismissSubmit}
          </Button>
          {dismiss.isError && (
            <p role="alert" className="text-sm text-critical">
              {dismiss.error.message}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}

function Dismissed({
  issue,
  title,
  actions,
}: {
  issue: IssueGroup;
  title: string;
  actions: RowActions;
}) {
  const { t, locale } = useI18n();
  const refresh = useRefresh(actions.scanId, actions.siteId);
  const reopen = useMutation({
    mutationFn: () => api.reopen(actions.siteId, issue.fingerprint),
    onSuccess: () => {
      actions.onChange(t.issues.reopenedNotice(title));
      refresh();
    },
  });
  if (!issue.dismissal) return null;
  const { reason, note, createdAt, by } = issue.dismissal;

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <p className="text-sm text-muted">
        {t.issues.dismissedAs(t.issues.reasonShort[reason], formatDay(createdAt, locale), by)}
      </p>
      {note && <p className="max-w-2xl text-sm whitespace-pre-line">{note}</p>}
      <Button variant="secondary" onClick={() => reopen.mutate()} disabled={reopen.isPending}>
        {reopen.isPending ? t.issues.reopening : t.issues.reopen}
      </Button>
      {reopen.isError && (
        <p role="alert" className="text-sm text-critical">
          {reopen.error.message}
        </p>
      )}
    </div>
  );
}

export function IssuesTable({
  issues,
  variant = 'current',
  emptyMessage,
  scanDate,
  scanId,
  actions,
}: {
  issues: IssueGroup[];
  variant?: 'current' | 'fixed' | 'recommendations' | 'dismissed';
  emptyMessage?: string;
  // the scan's own date: a problem first seen before it gets a "first seen" line
  scanDate?: string;
  // where the pictures of this scan's elements come from
  scanId?: string;
  // dismissing and reopening, when the scan still has its site
  actions?: RowActions;
}) {
  const { t, locale } = useI18n();
  const ruleHelp = useRuleHelp();
  const captions = {
    current: t.issues.caption,
    fixed: t.issues.fixedCaption,
    recommendations: t.issues.recommendationsCaption,
    dismissed: t.issues.dismissedCaption,
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
                  {issue.review ? (
                    <Badge tone="review">{t.manualReview.statuses[issue.review.status]}</Badge>
                  ) : (
                    <ImpactBadge impact={issue.impact} kind={issue.kind} />
                  )}
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
                  {variant === 'current' &&
                    issue.firstSeenAt &&
                    scanDate &&
                    issue.firstSeenAt < scanDate && (
                      <p className="mt-1 text-sm text-muted">
                        {t.issues.firstSeen(formatDay(issue.firstSeenAt, locale))}
                      </p>
                    )}
                  {variant === 'fixed' && (
                    <p className="mt-1 text-sm text-good">{t.issues.fixedNote}</p>
                  )}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-muted">
                      {t.issues.showElement}
                    </summary>
                    {issue.shot && scanId && (
                      <img
                        src={api.shotUrl(scanId, issue.fingerprint)}
                        alt={t.issues.shotAlt}
                        loading="lazy"
                        className="mt-2 block max-w-full rounded-lg border border-line"
                      />
                    )}
                    <pre className="mt-2 max-w-2xl overflow-x-auto rounded-lg border border-line bg-surface-alt p-3 font-mono text-[13px] leading-relaxed">
                      <code>{issue.sampleHtml}</code>
                    </pre>
                    {issue.sampleSummary && (
                      <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-muted">
                        {issue.sampleSummary}
                      </p>
                    )}
                  </details>
                  <FindingScenarios scenarios={issue.scenarios} />
                  <FindingEnvironments
                    environments={issue.environments}
                    shotContext={issue.shotContext}
                  />
                  <ReviewDetails review={issue.review} />
                  {actions && variant === 'current' && issue.kind === 'incomplete' && (
                    <ManualReviewForm
                      key={issue.review?.reviewedAt ?? 'pending'}
                      issue={issue}
                      actions={actions}
                    />
                  )}
                  {actions && variant === 'dismissed' && (
                    <Dismissed
                      issue={issue}
                      title={ruleHelp(issue.ruleId, issue.help)}
                      actions={actions}
                    />
                  )}
                  {actions &&
                    issue.kind !== 'incomplete' &&
                    (variant === 'current' || variant === 'recommendations') && (
                      <DismissForm
                        issue={issue}
                        title={ruleHelp(issue.ruleId, issue.help)}
                        actions={actions}
                      />
                    )}
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
