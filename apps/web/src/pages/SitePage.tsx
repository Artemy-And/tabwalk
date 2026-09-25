import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Button, Card, LiveStatus, StatusBadge } from '../components/ui';
import { useI18n } from '../i18n/context';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

export function SitePage() {
  const { siteId } = useParams({ from: '/sites/$siteId' });
  const { t, locale } = useI18n();
  const qc = useQueryClient();

  const scans = useQuery({ queryKey: ['site', siteId], queryFn: () => api.listScans(siteId) });

  const start = useMutation({
    mutationFn: () => api.startScan(siteId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['site', siteId] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.site.title}</h1>
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? t.site.queueing : t.site.run}
        </Button>
      </div>

      {start.isSuccess && <LiveStatus>{t.site.queued}</LiveStatus>}

      {scans.isLoading && <LiveStatus>{t.site.loading}</LiveStatus>}

      {scans.data?.length === 0 && <p className="text-sm text-muted">{t.site.empty}</p>}

      {scans.data && scans.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {scans.data.map((scan) => (
            <li key={scan.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <Link
                    to="/scans/$scanId"
                    params={{ scanId: scan.id }}
                    className="font-medium text-accent underline"
                  >
                    {formatDate(scan.createdAt, locale)}
                  </Link>
                  <p className="text-sm text-muted">
                    {t.site.pagesScanned(scan.pagesScanned)}
                    {scan.pagesFailed > 0 && t.site.pagesFailed(scan.pagesFailed)}
                  </p>
                </div>
                <StatusBadge status={scan.status} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
