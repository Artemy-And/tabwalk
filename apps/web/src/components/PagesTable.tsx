import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useI18n } from '../i18n/context';
import { api } from '../lib/api';
import { pathOf } from '../lib/format';
import { KeyboardCoverageLabel } from './KeyboardCoverage';
import { PageScenarioLabel } from './ScenarioResults';
import { Card, LiveStatus } from './ui';

const TH = 'px-3 py-3 text-[13px] font-semibold text-muted first:pl-5 last:pr-5';
const TD = 'px-3 py-4 align-top first:pl-5 last:pr-5';

export function PagesTable({ scanId }: { scanId: string }) {
  const { t } = useI18n();
  const pages = useQuery({ queryKey: ['pages', scanId], queryFn: () => api.listPages(scanId) });

  return (
    <section aria-labelledby="pages-heading" className="flex flex-col gap-4">
      <h2 id="pages-heading" className="text-[22px] font-bold tracking-[-0.01em]">
        {t.pages.heading}
      </h2>

      {pages.isLoading && <LiveStatus>{t.pages.loading}</LiveStatus>}

      {pages.data && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
            <caption className="px-5 pt-4 pb-3 text-left text-sm text-muted">
              {t.pages.caption}
            </caption>
            <thead>
              <tr className="border-y border-line bg-surface-alt">
                <th scope="col" className={TH}>
                  {t.pages.columns.page}
                </th>
                <th scope="col" className={`${TH} w-32`}>
                  {t.pages.columns.problems}
                </th>
                <th scope="col" className={`${TH} w-32`}>
                  {t.pages.columns.tabStops}
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.data.map((page) => (
                <tr key={page.id} className="border-b border-line-soft last:border-b-0">
                  <td className={TD}>
                    <Link
                      to="/pages/$pageId"
                      params={{ pageId: page.id }}
                      className="font-mono text-[14px] break-all"
                    >
                      {pathOf(page.url)}
                    </Link>
                    {page.title && <p className="mt-0.5 text-sm text-muted">{page.title}</p>}
                    <PageScenarioLabel runs={page.scenarioRuns} />
                    {page.error && (
                      <p className="mt-0.5 text-sm text-critical">{t.pages.failed(page.error)}</p>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums`}>{page.error ? '—' : page.problems}</td>
                  <td className={`${TD} tabular-nums`}>
                    {page.keyboardCoverage?.visitedStops ?? page.tabStops ?? '—'}
                    {!page.error && <KeyboardCoverageLabel coverage={page.keyboardCoverage} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
