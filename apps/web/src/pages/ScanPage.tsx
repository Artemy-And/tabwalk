import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { IssuesTable } from '../components/IssuesTable';
import { Card, LiveStatus } from '../components/ui';
import { useI18n } from '../i18n/context';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

export function ScanPage() {
  const { t, locale } = useI18n();
  const { scanId } = useParams({ from: '/scans/$scanId' });

  const scan = useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => api.getScan(scanId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 3000 : false;
    },
  });

  const issues = useQuery({
    queryKey: ['issues', scanId],
    queryFn: () => api.listIssues(scanId),
    enabled: scan.data?.status === 'done',
  });

  if (scan.isLoading) return <LiveStatus>{t.scan.loading}</LiveStatus>;
  if (!scan.data) return <p>{t.scan.notFound}</p>;

  const s = scan.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.scan.title(formatDate(s.createdAt, locale))}</h1>
        <LiveStatus>
          {s.status === 'running' && t.scan.running}
          {s.status === 'queued' && t.scan.queued}
          {s.status === 'done' && t.scan.done(s.pagesScanned)}
          {s.status === 'failed' && t.scan.failed(s.error ?? t.scan.unknownError)}
        </LiveStatus>
      </div>

      {s.status === 'done' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <p className="text-2xl font-semibold tabular-nums">{s.summary.uniqueProblems}</p>
            <p className="text-sm text-muted">{t.scan.uniqueProblems(s.summary.uniqueProblems)}</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold tabular-nums text-critical">
              {s.summary.critical}
            </p>
            <p className="text-sm text-muted">{t.scan.criticalFindings(s.summary.critical)}</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold tabular-nums text-review">
              {s.summary.incomplete}
            </p>
            <p className="text-sm text-muted">{t.scan.needHuman(s.summary.incomplete)}</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold tabular-nums">{s.pages}</p>
            <p className="text-sm text-muted">{t.scan.pages(s.pages)}</p>
          </Card>
        </div>
      )}

      {s.status === 'done' && (
        <section aria-labelledby="issues-heading">
          <h2 id="issues-heading" className="mb-3 text-lg font-semibold">
            {t.scan.findingsHeading}
          </h2>
          {issues.isLoading && <LiveStatus>{t.scan.loadingFindings}</LiveStatus>}
          {issues.data && <IssuesTable issues={issues.data} />}
        </section>
      )}
    </div>
  );
}
