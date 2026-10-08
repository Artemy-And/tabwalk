import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { EnvironmentResults } from '../components/Environments';
import { KeyboardCoverageDetails } from '../components/KeyboardCoverage';
import { ScenarioResults } from '../components/ScenarioResults';
import { Breadcrumbs, Card, LiveStatus, PageHeader } from '../components/ui';
import { useI18n } from '../i18n/context';
import { api } from '../lib/api';
import { formatDate, pathOf, shortUrl } from '../lib/format';

export function PagePage() {
  const { t, locale } = useI18n();
  const { pageId } = useParams({ from: '/pages/$pageId' });
  const page = useQuery({ queryKey: ['page', pageId], queryFn: () => api.getPage(pageId) });

  if (page.isLoading) return <LiveStatus>{t.page.loading}</LiveStatus>;
  if (!page.data) return <p>{t.page.notFound}</p>;

  const p = page.data;
  const path = pathOf(p.url);
  const order = p.tabOrder;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          <Link key="sites" to="/">
            {t.layout.sites}
          </Link>,
          <Link key="site" to="/sites/$siteId" params={{ siteId: p.site.id }}>
            {p.site.name}
          </Link>,
          <Link key="scan" to="/scans/$scanId" params={{ scanId: p.scan.id }}>
            {formatDate(p.scan.createdAt, locale)}
          </Link>,
        ]}
        current={shortUrl(p.url)}
      />

      <PageHeader
        title={p.title?.length ? p.title : path}
        subtitle={
          <a href={p.url} className="font-mono text-sm break-all text-muted">
            {p.url}
          </a>
        }
      />

      <KeyboardCoverageDetails coverage={p.keyboardCoverage} />

      {!order && <p className="text-[15px] text-muted">{t.page.noPicture}</p>}

      {order && (
        <section aria-labelledby="order-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="order-heading" className="text-[22px] font-bold tracking-[-0.01em]">
              {t.page.tabOrder}
            </h2>
            <p className="mt-1 max-w-[700px] text-[15px] text-muted">
              {t.page.tabOrderIntro(order.stops.length)}
            </p>
          </div>

          <Card className="p-3">
            <img
              src={api.tabOrderUrl(p.id)}
              alt={t.page.pictureAlt(order.stops.length)}
              width={order.width}
              height={order.height}
              className="block h-auto max-w-full"
            />
          </Card>

          <details className="rounded-xl border border-line bg-surface px-5 py-4">
            <summary className="cursor-pointer font-semibold">{t.page.listHeading}</summary>
            <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-6 text-[15px]">
              {order.stops.map((stop, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the order is the content
                <li key={i}>
                  {stop.label || <span className="text-muted">{t.page.unnamed}</span>}{' '}
                  <span className="font-mono text-[13px] break-all text-muted">
                    {stop.selector}
                  </span>
                  {!stop.drawn && <span className="text-sm text-muted"> · {t.page.notDrawn}</span>}
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}

      <ScenarioResults runs={p.scenarioRuns} />
      <EnvironmentResults runs={p.environmentRuns} />
    </div>
  );
}
