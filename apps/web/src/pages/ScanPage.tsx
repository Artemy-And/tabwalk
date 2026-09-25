import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { IssuesTable } from '../components/IssuesTable';
import { Breadcrumbs, FilterChip, LiveStatus, PageHeader, StatCard } from '../components/ui';
import { useI18n } from '../i18n/context';
import { api, type IssueGroup, isScanActive, POLL_INTERVAL_MS } from '../lib/api';
import { formatDate } from '../lib/format';

type Filter = 'all' | 'critical' | 'review' | 'new' | 'fixed';

const FILTERS: Record<Exclude<Filter, 'fixed'>, (issue: IssueGroup) => boolean> = {
  all: () => true,
  critical: (issue) => issue.kind === 'violation' && issue.impact === 'critical',
  review: (issue) => issue.kind === 'incomplete',
  new: (issue) => issue.isNew === true,
};

export function ScanPage() {
  const { t, locale } = useI18n();
  const { scanId } = useParams({ from: '/scans/$scanId' });
  const [filter, setFilter] = useState<Filter>('all');

  const scan = useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => api.getScan(scanId),
    refetchInterval: (query) => (isScanActive(query.state.data?.status) ? POLL_INTERVAL_MS : false),
  });

  const done = scan.data?.status === 'done';
  const hasPrevious = Boolean(scan.data?.comparison);

  const issues = useQuery({
    queryKey: ['issues', scanId],
    queryFn: () => api.listIssues(scanId),
    enabled: done,
  });

  const fixed = useQuery({
    queryKey: ['fixed', scanId],
    queryFn: () => api.listFixed(scanId),
    enabled: done && hasPrevious,
  });

  const counts = useMemo(() => {
    const list = issues.data ?? [];
    return {
      all: list.length,
      critical: list.filter(FILTERS.critical).length,
      review: list.filter(FILTERS.review).length,
      new: list.filter(FILTERS.new).length,
    };
  }, [issues.data]);

  const visible = useMemo(() => {
    if (filter === 'fixed') return fixed.data ?? [];
    return (issues.data ?? []).filter(FILTERS[filter]);
  }, [filter, issues.data, fixed.data]);

  if (scan.isLoading) return <LiveStatus>{t.scan.loading}</LiveStatus>;
  if (!scan.data) return <p>{t.scan.notFound}</p>;

  const s = scan.data;
  const siteName = s.site?.name ?? t.scan.unknownSite;
  const date = formatDate(s.finishedAt ?? s.createdAt, locale);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          <Link key="sites" to="/">
            {t.layout.sites}
          </Link>,
          ...(s.site
            ? [
                <Link key="site" to="/sites/$siteId" params={{ siteId: s.site.id }}>
                  {s.site.name}
                </Link>,
              ]
            : []),
        ]}
        current={formatDate(s.createdAt, locale)}
      />

      <PageHeader
        title={siteName}
        subtitle={
          <span aria-live="polite">
            {s.status === 'done' && t.scan.finished(date, s.pages)}
            {s.status === 'running' && t.scan.running}
            {s.status === 'queued' && t.scan.queued}
            {s.status === 'failed' && (
              <span className="text-critical">{t.scan.failed(s.error ?? t.scan.unknownError)}</span>
            )}
          </span>
        }
      />

      {done && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            value={s.summary.uniqueProblems}
            label={t.scan.uniqueProblems(s.summary.uniqueProblems)}
          />
          <StatCard
            value={s.summary.critical}
            label={t.scan.criticalFindings(s.summary.critical)}
            tone="critical"
          />
          <StatCard
            value={s.summary.incomplete}
            label={t.scan.needHuman(s.summary.incomplete)}
            tone="review"
          />
          <StatCard value={s.pages} label={t.scan.pages(s.pages)} />
        </div>
      )}

      {done && (
        <section aria-labelledby="issues-heading" className="flex flex-col gap-4">
          <h2 id="issues-heading" className="visually-hidden">
            {t.scan.findingsHeading}
          </h2>

          {issues.isLoading && <LiveStatus>{t.scan.loadingFindings}</LiveStatus>}

          {issues.data && (
            <>
              <fieldset className="flex flex-wrap items-center gap-2.5">
                <legend className="visually-hidden">{t.scan.filters.label}</legend>
                <span aria-hidden="true" className="text-sm text-muted">
                  {t.scan.filters.label}:
                </span>
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                  {t.scan.filters.all} {counts.all}
                </FilterChip>
                <FilterChip active={filter === 'critical'} onClick={() => setFilter('critical')}>
                  {t.scan.filters.critical} {counts.critical}
                </FilterChip>
                <FilterChip active={filter === 'review'} onClick={() => setFilter('review')}>
                  {t.scan.filters.review} {counts.review}
                </FilterChip>
                {s.comparison && (
                  <>
                    <FilterChip active={filter === 'new'} onClick={() => setFilter('new')}>
                      {t.scan.filters.new} {counts.new}
                    </FilterChip>
                    <FilterChip active={filter === 'fixed'} onClick={() => setFilter('fixed')}>
                      {t.scan.filters.fixed} {s.comparison.fixed}
                    </FilterChip>
                  </>
                )}
              </fieldset>

              {filter === 'fixed' && fixed.isLoading ? (
                <LiveStatus>{t.scan.loadingFindings}</LiveStatus>
              ) : (
                <IssuesTable
                  issues={visible}
                  fixed={filter === 'fixed'}
                  emptyMessage={filter === 'all' ? undefined : t.issues.emptyFilter}
                />
              )}
            </>
          )}
        </section>
      )}

      <p className="max-w-[700px] text-[13px] text-muted">{t.sites.disclaimer}</p>
    </div>
  );
}
