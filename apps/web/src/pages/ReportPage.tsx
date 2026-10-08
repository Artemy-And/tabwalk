import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  EnvironmentFailures,
  EnvironmentResults,
  FindingEnvironments,
  TestedEnvironments,
} from '../components/Environments';
import { KeyboardCoverageDetails } from '../components/KeyboardCoverage';
import { ManualReviewSummary, ReviewDetails } from '../components/ManualReview';
import {
  FindingScenarios,
  ScanScenarioSummary,
  ScenarioResults,
} from '../components/ScenarioResults';
import { Badge, Button, ImpactBadge, LiveStatus, StatCard } from '../components/ui';
import { useI18n } from '../i18n/context';
import { useRuleHelp } from '../i18n/ruleHelp';
import { api, type IssueGroup } from '../lib/api';
import { formatDate, formatDay, pathOf, standardLabel } from '../lib/format';

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

const byWeight = (a: IssueGroup, b: IssueGroup) =>
  (IMPACT_ORDER[a.impact ?? 'minor'] ?? 4) - (IMPACT_ORDER[b.impact ?? 'minor'] ?? 4) ||
  b.pagesAffected - a.pagesAffected;

function Finding({ issue, scanId }: { issue: IssueGroup; scanId: string }) {
  const { t, locale } = useI18n();
  const ruleHelp = useRuleHelp();
  const rule = [issue.ruleId, ...issue.wcagTags, ...issue.standards.map(standardLabel)].join(' · ');

  return (
    <div className="break-inside-avoid border-t border-line py-4">
      <div className="flex flex-wrap items-center gap-3">
        {issue.review ? (
          <Badge tone="review">{t.manualReview.statuses[issue.review.status]}</Badge>
        ) : (
          <ImpactBadge impact={issue.impact} kind={issue.kind} />
        )}
        <h3 className="text-[17px] font-semibold">{ruleHelp(issue.ruleId, issue.help)}</h3>
      </div>
      <p className="mt-1.5 text-sm text-muted">
        {t.report.where(issue.pagesAffected, issue.occurrences)}
        {issue.firstSeenAt && ` · ${t.issues.firstSeen(formatDay(issue.firstSeenAt, locale))}`}
      </p>
      <p className="mt-0.5 font-mono text-[12px] text-muted">{rule}</p>
      {issue.shot && (
        <img
          src={api.shotUrl(scanId, issue.fingerprint)}
          alt={t.issues.shotAlt}
          className="mt-3 block max-h-[300px] max-w-full rounded border border-line"
        />
      )}
      <FindingScenarios scenarios={issue.scenarios} expanded />
      <FindingEnvironments environments={issue.environments} shotContext={issue.shotContext} />
      <ReviewDetails review={issue.review} />
      <p className="mt-3 text-sm font-semibold">{t.report.example}</p>
      <pre className="mt-1 rounded border border-line bg-surface-alt p-2.5 font-mono text-[12px] whitespace-pre-wrap break-all">
        {issue.sampleHtml}
      </pre>
      {issue.sampleSummary && (
        <>
          <p className="mt-3 text-sm font-semibold">{t.report.howToFix}</p>
          <p className="mt-1 text-sm whitespace-pre-line">{issue.sampleSummary}</p>
        </>
      )}
    </div>
  );
}

// the scan report laid out for paper: everything open, nothing to click, light on any screen
export function ReportPage() {
  const { scanId } = useParams({ from: '/scans/$scanId/report' });
  const { t, locale } = useI18n();
  const ruleHelp = useRuleHelp();

  const scan = useQuery({ queryKey: ['scan', scanId], queryFn: () => api.getScan(scanId) });
  const done = scan.data?.status === 'done';
  const issues = useQuery({
    queryKey: ['issues', scanId],
    queryFn: () => api.listIssues(scanId),
    enabled: done,
  });
  const pages = useQuery({
    queryKey: ['pages', scanId],
    queryFn: () => api.listPages(scanId),
    enabled: done,
  });

  if (scan.isLoading) return <LiveStatus>{t.scan.loading}</LiveStatus>;
  if (!scan.data) return <p>{t.scan.notFound}</p>;
  if (!done) return <p>{t.report.notDone}</p>;
  if (issues.isLoading || pages.isLoading) return <LiveStatus>{t.scan.loadingFindings}</LiveStatus>;
  if (issues.isError || pages.isError)
    return <p role="alert">{issues.error?.message ?? pages.error?.message}</p>;

  const s = scan.data;
  const list = issues.data ?? [];
  const open = list.filter((issue) => !issue.dismissal);
  const problems = open.filter((issue) => issue.kind === 'violation').sort(byWeight);
  const review = open
    .filter((issue) => issue.kind === 'incomplete' && !issue.review)
    .sort(byWeight);
  const confirmed = open.filter((issue) => issue.review?.status === 'confirmed').sort(byWeight);
  const assessed = open
    .filter((issue) => issue.review && issue.review.status !== 'confirmed')
    .sort(byWeight);
  const recommendations = open.filter((issue) => issue.kind === 'recommendation').length;
  const dismissed = list.filter((issue) => issue.dismissal);
  const ignored = [
    s.ignored?.rules.length ? t.scan.ignoredRules(s.ignored.rules.join(', ')) : null,
    s.ignored?.selectors.length ? t.scan.ignoredSelectors(s.ignored.selectors.join(', ')) : null,
  ].filter((part) => part !== null);

  return (
    <article className="mx-auto flex max-w-[860px] flex-col gap-8">
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <Button onClick={() => window.print()}>{t.report.print}</Button>
        <Link to="/scans/$scanId" params={{ scanId }}>
          {t.report.back}
        </Link>
      </div>

      <header>
        <p className="text-sm font-semibold text-muted">{t.report.kicker}</p>
        <h1 className="mt-1 text-[34px] leading-tight font-bold tracking-[-0.03em]">
          {s.site?.name ?? t.scan.unknownSite}
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {s.site?.url} · {t.report.scanned(formatDate(s.finishedAt ?? s.createdAt, locale))}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          value={s.summary.uniqueProblems}
          label={t.scan.uniqueProblems(s.summary.uniqueProblems)}
          detail={t.scan.elements(s.summary.elements)}
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

      <div className="flex flex-col gap-2 text-[15px] text-muted">
        <p>{t.sites.disclaimer}</p>
        {ignored.length > 0 && <p>{t.scan.ignored(ignored.join('; '))}</p>}
      </div>

      <ScanScenarioSummary summary={s.scenarioSummary} />
      <ManualReviewSummary summary={s.manualSummary} />
      <TestedEnvironments environments={s.environments} />
      <EnvironmentFailures runs={(pages.data ?? []).flatMap((page) => page.environmentRuns)} />

      <section aria-labelledby="report-problems">
        <h2 id="report-problems" className="mb-2 text-[22px] font-bold">
          {t.report.problemsHeading}
        </h2>
        <p className="mb-2 text-sm text-muted">{t.manualReview.automatic}</p>
        {problems.length === 0 && <p className="text-[15px]">{t.report.none}</p>}
        {problems.map((issue) => (
          <Finding key={`${issue.kind}:${issue.fingerprint}`} issue={issue} scanId={scanId} />
        ))}
        {recommendations > 0 && (
          <p className="mt-4 text-sm text-muted">{t.report.recommendations(recommendations)}</p>
        )}
      </section>

      {confirmed.length > 0 && (
        <section aria-labelledby="report-confirmed">
          <h2 id="report-confirmed" className="text-[22px] font-bold">
            {t.manualReview.confirmedHeading}
          </h2>
          {confirmed.map((issue) => (
            <Finding key={issue.fingerprint} issue={issue} scanId={scanId} />
          ))}
        </section>
      )}
      {assessed.length > 0 && (
        <section aria-labelledby="report-assessed">
          <h2 id="report-assessed" className="text-[22px] font-bold">
            {t.manualReview.reviewed}
          </h2>
          {assessed.map((issue) => (
            <Finding key={issue.fingerprint} issue={issue} scanId={scanId} />
          ))}
        </section>
      )}

      {review.length > 0 && (
        <section aria-labelledby="report-review">
          <h2 id="report-review" className="text-[22px] font-bold">
            {t.scan.filters.review}
          </h2>
          <p className="mt-1 mb-2 text-[15px] text-muted">{t.report.reviewIntro}</p>
          {review.map((issue) => (
            <Finding key={`${issue.kind}:${issue.fingerprint}`} issue={issue} scanId={scanId} />
          ))}
        </section>
      )}

      {dismissed.length > 0 && (
        <section aria-labelledby="report-dismissed" className="break-inside-avoid">
          <h2 id="report-dismissed" className="text-[22px] font-bold">
            {t.scan.filters.dismissed}
          </h2>
          <p className="mt-1 mb-3 text-[15px] text-muted">{t.report.dismissedIntro}</p>
          <ul className="flex flex-col gap-2 text-[15px]">
            {dismissed.map((issue) => (
              <li key={`${issue.kind}:${issue.fingerprint}`}>
                <span className="font-semibold">{ruleHelp(issue.ruleId, issue.help)}</span>
                {issue.dismissal &&
                  ` — ${t.issues.reasonShort[issue.dismissal.reason]}${
                    issue.dismissal.note ? `: ${issue.dismissal.note}` : ''
                  }`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="report-pages">
        <h2 id="report-pages" className="mb-3 text-[22px] font-bold">
          {t.report.pagesHeading}
        </h2>
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t.pages.columns.page}
              </th>
              <th scope="col" className="py-2 font-semibold">
                {t.pages.columns.problems}
              </th>
            </tr>
          </thead>
          <tbody>
            {(pages.data ?? []).map((page) => (
              <tr key={page.id} className="break-inside-avoid border-b border-line-soft">
                <td className="py-1.5 pr-3 align-top">
                  <span className="font-mono text-[12px] break-all">{pathOf(page.url)}</span>
                  {!page.error && page.environmentRuns.length === 0 && (
                    <KeyboardCoverageDetails coverage={page.keyboardCoverage} compact />
                  )}
                  {page.environmentRuns.length === 0 && (
                    <ScenarioResults runs={page.scenarioRuns} compact />
                  )}
                  <EnvironmentResults runs={page.environmentRuns} expanded />
                </td>
                <td className="py-1.5 align-top tabular-nums">
                  {page.error ? t.pages.failed(page.error) : page.problems}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}
