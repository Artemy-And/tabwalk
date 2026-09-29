import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  LiveStatus,
  PageHeader,
  SelectField,
  StatusBadge,
} from '../components/ui';
import { useI18n } from '../i18n/context';
import {
  api,
  isScanActive,
  POLL_INTERVAL_MS,
  SCHEDULES,
  type ScanSchedule,
  type SiteDetail,
} from '../lib/api';
import { formatDate, hostOf, isWithin } from '../lib/format';

const TH = 'px-3 py-3 text-[13px] font-semibold text-muted first:pl-5 last:pr-5';
const TD = 'px-3 py-4 align-top first:pl-5 last:pr-5';

const SOON_MS = 16 * 60 * 1000;

function ScheduleCard({ site }: { site: SiteDetail }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (schedule: ScanSchedule) => api.setSchedule(site.id, schedule),
    onMutate: (schedule) => {
      qc.setQueryData(['site-info', site.id], { ...site, schedule });
      return site;
    },
    onSuccess: (updated) => qc.setQueryData(['site-info', site.id], updated),
    onError: (_error, _schedule, previous) => qc.setQueryData(['site-info', site.id], previous),
  });

  const next =
    site.schedule === 'off' || !site.nextScanAt
      ? t.schedule.manual
      : isWithin(site.nextScanAt, SOON_MS)
        ? t.schedule.soon
        : t.schedule.next(formatDate(site.nextScanAt, locale));

  return (
    <Card className="flex flex-col gap-3 p-5 md:flex-row md:items-end md:gap-5">
      <div className="md:w-56">
        <SelectField
          label={t.schedule.label}
          value={site.schedule}
          onChange={(e) => save.mutate(e.target.value as ScanSchedule)}
        >
          {SCHEDULES.map((option) => (
            <option key={option} value={option}>
              {t.schedule.options[option]}
            </option>
          ))}
        </SelectField>
      </div>
      <p aria-live="polite" className="text-[15px] text-muted md:pb-2.5">
        {save.isPending ? t.schedule.saving : save.isSuccess ? `${t.schedule.saved} ${next}` : next}
      </p>
      {save.isError && (
        <p role="alert" className="text-sm text-critical md:pb-2.5">
          {save.error.message}
        </p>
      )}
    </Card>
  );
}

export function SitePage() {
  const { siteId } = useParams({ from: '/sites/$siteId' });
  const { t, locale } = useI18n();
  const qc = useQueryClient();

  const site = useQuery({ queryKey: ['site-info', siteId], queryFn: () => api.getSite(siteId) });

  const scans = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => api.listScans(siteId),
    refetchInterval: (query) =>
      query.state.data?.some((scan) => isScanActive(scan.status)) ? POLL_INTERVAL_MS : false,
  });

  const start = useMutation({
    mutationFn: () => api.startScan(siteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['site', siteId] });
      void qc.invalidateQueries({ queryKey: ['site-info', siteId] });
    },
  });

  if (site.isLoading) return <LiveStatus>{t.site.loading}</LiveStatus>;
  if (!site.data) return <p>{t.site.notFound}</p>;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          <Link key="sites" to="/">
            {t.layout.sites}
          </Link>,
        ]}
        current={site.data.name}
      />

      <PageHeader
        title={site.data.name}
        subtitle={
          <a href={site.data.url} className="font-mono text-sm text-muted">
            {hostOf(site.data.url)}
          </a>
        }
        actions={
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? t.site.queueing : t.site.run}
          </Button>
        }
      />

      <ScheduleCard site={site.data} />

      {start.isSuccess && <LiveStatus>{t.site.queued}</LiveStatus>}
      {start.isError && (
        <p role="alert" className="text-sm text-critical">
          {start.error.message}
        </p>
      )}

      {scans.isLoading && <LiveStatus>{t.site.loading}</LiveStatus>}

      {scans.data?.length === 0 && <p className="text-[15px] text-muted">{t.site.empty}</p>}

      {scans.data && scans.data.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-[15px]">
            <caption className="px-5 pt-4 pb-3 text-left text-sm text-muted">
              {t.site.caption}
            </caption>
            <thead>
              <tr className="border-y border-line bg-surface-alt">
                <th scope="col" aria-sort="descending" className={TH}>
                  {t.site.columns.date}
                </th>
                <th scope="col" className={TH}>
                  {t.site.columns.pages}
                </th>
                <th scope="col" className={TH}>
                  {t.site.columns.problems}
                </th>
                <th scope="col" className={TH}>
                  {t.site.columns.needsHuman}
                </th>
              </tr>
            </thead>
            <tbody>
              {scans.data.map((scan) => (
                <tr key={scan.id} className="border-b border-line-soft last:border-b-0">
                  <td className={TD}>
                    <Link
                      to="/scans/$scanId"
                      params={{ scanId: scan.id }}
                      className="font-semibold"
                    >
                      {formatDate(scan.createdAt, locale)}
                    </Link>
                    {scan.status !== 'done' && (
                      <div>
                        <StatusBadge status={scan.status} />
                      </div>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    {scan.pagesScanned}
                    {scan.pagesFailed > 0 && (
                      <span className="text-muted"> {t.site.pagesFailed(scan.pagesFailed)}</span>
                    )}
                  </td>
                  <td className={TD}>
                    {scan.status !== 'done' ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {scan.critical > 0 && (
                          <Badge tone="critical">{t.sites.critical(scan.critical)}</Badge>
                        )}
                        <span className="tabular-nums text-muted">
                          {t.sites.total(scan.uniqueProblems)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className={`${TD} font-semibold text-review tabular-nums`}>
                    {scan.status === 'done' ? (
                      scan.incomplete
                    ) : (
                      <span className="font-normal text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
