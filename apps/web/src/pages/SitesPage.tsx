import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type SubmitEvent, useId, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Field,
  LiveStatus,
  PageHeader,
  PlusIcon,
  SelectField,
  StatusBadge,
  TrendBars,
} from '../components/ui';
import { useI18n } from '../i18n/context';
import {
  api,
  isScanActive,
  POLL_INTERVAL_MS,
  SCHEDULES,
  type ScanSchedule,
  type SiteRow,
} from '../lib/api';
import { formatRelative, hostOf } from '../lib/format';

const TH = 'px-3 py-3 text-[13px] font-semibold text-muted first:pl-5 last:pr-5';
const TD = 'px-3 py-4 align-top first:pl-5 last:pr-5';

function ProblemsCell({ site }: { site: SiteRow }) {
  const { t } = useI18n();
  const s = site.summary;

  if (!s) return <span className="text-muted">—</span>;
  if (s.uniqueProblems === 0) {
    return <span className="font-semibold text-good">{t.sites.noProblems}</span>;
  }

  const badge =
    s.critical > 0 ? (
      <Badge tone="critical">{t.sites.critical(s.critical)}</Badge>
    ) : s.serious > 0 ? (
      <Badge tone="serious">{t.sites.serious(s.serious)}</Badge>
    ) : (
      <Badge tone="minor">{t.sites.minorOnly}</Badge>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {badge}
      <span className="text-muted">{t.sites.total(s.uniqueProblems)}</span>
    </span>
  );
}

function LastScanCell({ site }: { site: SiteRow }) {
  const { t, locale } = useI18n();

  if (!site.lastScanId || !site.lastScanAt || !site.lastScanStatus) {
    return <span className="text-muted">{t.sites.neverScanned}</span>;
  }
  if (site.lastScanStatus !== 'done') return <StatusBadge status={site.lastScanStatus} />;

  return (
    <Link to="/scans/$scanId" params={{ scanId: site.lastScanId }}>
      {formatRelative(site.lastScanAt, locale)}
    </Link>
  );
}

function AddSiteForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [schedule, setSchedule] = useState<ScanSchedule>('weekly');
  const [error, setError] = useState<'fillBoth' | Error | null>(null);

  const create = useMutation({
    mutationFn: api.createSite,
    onSuccess: () => {
      setName('');
      setUrl('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['sites'] });
      onDone();
    },
    onError: (e: Error) => setError(e),
  });

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('fillBoth');
      return;
    }
    create.mutate({ name: name.trim(), url: url.trim(), schedule });
  }

  return (
    <Card className="p-5">
      <h2 id={id} className="mb-4 text-[17px] font-semibold">
        {t.sites.addHeading}
      </h2>
      <form
        aria-labelledby={id}
        onSubmit={onSubmit}
        className="flex flex-col gap-4 md:flex-row md:items-start"
      >
        <div className="md:w-64">
          <Field
            label={t.sites.nameLabel}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.sites.namePlaceholder}
          />
        </div>
        <div className="grow">
          <Field
            label={t.sites.urlLabel}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            hint={t.sites.urlHint}
          />
        </div>
        <div className="md:w-48">
          <SelectField
            label={t.schedule.label}
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as ScanSchedule)}
          >
            {SCHEDULES.map((option) => (
              <option key={option} value={option}>
                {t.schedule.options[option]}
              </option>
            ))}
          </SelectField>
        </div>
        <Button type="submit" disabled={create.isPending} className="md:mt-[26px]">
          {create.isPending ? t.sites.submitting : t.sites.submit}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error === 'fillBoth' ? t.sites.fillBoth : error.message}
        </p>
      )}
    </Card>
  );
}

export function SitesPage() {
  const { t } = useI18n();
  const formId = useId();
  const [formOpen, setFormOpen] = useState(false);

  const sites = useQuery({
    queryKey: ['sites'],
    queryFn: api.listSites,
    refetchInterval: (query) =>
      query.state.data?.some((site) => isScanActive(site.lastScanStatus))
        ? POLL_INTERVAL_MS
        : false,
  });

  const sorted = useMemo(
    () =>
      [...(sites.data ?? [])].sort((a, b) =>
        (b.lastScanAt ?? '').localeCompare(a.lastScanAt ?? ''),
      ),
    [sites.data],
  );

  const empty = sites.data?.length === 0;
  const showForm = formOpen || empty;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.sites.title}
        subtitle={sites.data && !empty ? t.sites.subtitle(sites.data.length) : undefined}
        actions={
          !empty && (
            <Button
              aria-expanded={formOpen}
              aria-controls={formOpen ? formId : undefined}
              onClick={() => setFormOpen(!formOpen)}
            >
              <PlusIcon />
              {t.sites.add}
            </Button>
          )
        }
      />

      {showForm && <AddSiteForm id={formId} onDone={() => setFormOpen(false)} />}

      {sites.isLoading && <LiveStatus>{t.sites.loading}</LiveStatus>}

      {empty && <p className="text-[15px] text-muted">{t.sites.empty}</p>}

      {sorted.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[15px]">
            <caption className="px-5 pt-4 pb-3 text-left text-sm text-muted">
              {t.sites.caption}
            </caption>
            <thead>
              <tr className="border-y border-line bg-surface-alt">
                <th scope="col" className={TH}>
                  {t.sites.columns.site}
                </th>
                <th scope="col" aria-sort="descending" className={TH}>
                  {t.sites.columns.lastScan}
                </th>
                <th scope="col" className={TH}>
                  {t.sites.columns.schedule}
                </th>
                <th scope="col" className={TH}>
                  {t.sites.columns.problems}
                </th>
                <th scope="col" className={TH}>
                  {t.sites.columns.needsHuman}
                </th>
                <th scope="col" className={TH}>
                  {t.sites.columns.trend}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((site) => (
                <tr key={site.id} className="border-b border-line-soft last:border-b-0">
                  <td className={TD}>
                    <Link
                      to="/sites/$siteId"
                      params={{ siteId: site.id }}
                      className="font-semibold"
                    >
                      {site.name}
                    </Link>
                    <div className="font-mono text-[13px] text-muted">{hostOf(site.url)}</div>
                  </td>
                  <td className={`${TD} text-muted`}>
                    <LastScanCell site={site} />
                  </td>
                  <td className={`${TD} ${site.schedule === 'off' ? 'text-muted' : ''}`}>
                    {t.schedule.options[site.schedule]}
                  </td>
                  <td className={TD}>
                    <ProblemsCell site={site} />
                  </td>
                  <td className={`${TD} font-semibold text-review tabular-nums`}>
                    {site.summary ? site.summary.incomplete : <span className="text-muted">—</span>}
                  </td>
                  <td className={TD}>
                    {site.trend.length >= 2 ? (
                      <TrendBars
                        values={site.trend}
                        label={t.sites.trendLabel(
                          site.trend[0] ?? 0,
                          site.trend[site.trend.length - 1] ?? 0,
                          site.trend.length,
                        )}
                      />
                    ) : (
                      <span className="text-sm text-muted">{t.sites.trendEmpty}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="max-w-[700px] text-[13px] text-muted">{t.sites.disclaimer}</p>
    </div>
  );
}
