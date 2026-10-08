import { useI18n } from '../i18n/context';
import type { IssueGroup, Scan, ScenarioStepEvidence, StoredScenarioRun } from '../lib/api';
import { KeyboardCoverageDetails } from './KeyboardCoverage';

export function ScenarioSteps({ steps }: { steps: ScenarioStepEvidence[] }) {
  const { t } = useI18n();
  return (
    <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
      {steps.map((step, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: evidence is an ordered immutable sequence
        <li key={index}>
          <span className="font-semibold">{t.scenarios.actions[step.action]}</span>{' '}
          <code className="break-all">{step.action === 'press' ? step.key : step.selector}</code>
          {step.action === 'waitFor' && ` · ${t.scenarios.states[step.state]}`}
          <span className={step.status === 'failed' ? 'ml-2 text-critical' : 'ml-2 text-muted'}>
            {t.scenarios[step.status]}
          </span>
          {step.actualFocus !== undefined && (
            <p className="mt-0.5 break-all text-muted">
              {t.scenarios.actualFocus(step.actualFocus ?? '—')}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ScenarioResults({
  runs,
  compact = false,
}: {
  runs?: StoredScenarioRun[];
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (!runs?.length) return null;
  return (
    <section className={compact ? 'mt-3 text-sm' : 'rounded-xl border border-line bg-surface p-5'}>
      <h2 className={compact ? 'font-semibold' : 'text-[18px] font-semibold'}>
        {t.scenarios.resultsHeading}
      </h2>
      {!compact && (
        <p className="mt-1 max-w-[700px] text-sm text-muted">{t.scenarios.resultsIntro}</p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        {runs.map((run) => (
          <div key={run.name} className="break-inside-avoid border-t border-line-soft pt-3">
            <h3 className="font-semibold">{run.name}</h3>
            <p className="mt-0.5">
              <code className="break-all text-muted">{run.path}</code>
              {' · '}
              <span className={run.status === 'failed' ? 'text-critical' : 'text-good'}>
                {t.scenarios[run.status]}
              </span>
              {' · '}
              {t.scenarios.findings(run.findings)}
            </p>
            <ScenarioSteps steps={run.steps} />
            {run.error && <p className="mt-2 text-sm break-all text-critical">{run.error}</p>}
            {run.keyboardCoverage && (
              <div className="mt-2">
                <p className="text-sm font-semibold">{t.coverage.heading}</p>
                <KeyboardCoverageDetails coverage={run.keyboardCoverage} compact />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function FindingScenarios({
  scenarios,
  expanded = false,
}: {
  scenarios?: IssueGroup['scenarios'];
  expanded?: boolean;
}) {
  const { t } = useI18n();
  if (!scenarios?.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {scenarios.map((scenario) => {
        const heading = t.scenarios.foundDuring(scenario.name);
        const evidence = (
          <>
            <a href={scenario.url} className="mt-1 block font-mono text-xs break-all">
              {scenario.url}
            </a>
            <ScenarioSteps steps={scenario.steps} />
          </>
        );
        return expanded ? (
          <div key={`${scenario.name}:${scenario.url}`}>
            <p className="text-sm font-semibold">{heading}</p>
            {evidence}
          </div>
        ) : (
          <details key={`${scenario.name}:${scenario.url}`}>
            <summary className="cursor-pointer text-sm text-muted">{heading}</summary>
            {evidence}
          </details>
        );
      })}
    </div>
  );
}

export function ScanScenarioSummary({ summary }: { summary?: Scan['scenarioSummary'] }) {
  const { t } = useI18n();
  if (!summary || summary.completed + summary.failed + summary.unmatched.length === 0) return null;
  const incomplete = summary.failed > 0 || summary.unmatched.length > 0;
  return (
    <section
      aria-label={t.scenarios.resultsHeading}
      className={
        incomplete
          ? 'rounded-xl border border-review-line bg-review-soft p-4'
          : 'text-sm text-muted'
      }
    >
      <p>{t.scenarios.completedCount(summary.completed)}</p>
      {incomplete && (
        <>
          <p className="mt-1 font-semibold text-review">{t.scenarios.incomplete}</p>
          {summary.failed > 0 && (
            <p className="mt-1 text-sm">{t.scenarios.failedCount(summary.failed)}</p>
          )}
          {summary.unmatched.length > 0 && (
            <>
              <p className="mt-2 text-sm font-semibold">{t.scenarios.unmatched}</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {summary.unmatched.map((scenario) => (
                  <li key={scenario.name}>
                    {scenario.name}: <code className="break-all">{scenario.path}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function PageScenarioLabel({ runs }: { runs?: StoredScenarioRun[] }) {
  const { t } = useI18n();
  if (!runs?.length) return null;
  const failed = runs.filter((run) => run.status === 'failed').length;
  return (
    <p className={failed > 0 ? 'mt-1 text-xs text-review' : 'mt-1 text-xs text-muted'}>
      {t.scenarios.completedCount(runs.length - failed)}
      {failed > 0 && <span className="block">{t.scenarios.failedCount(failed)}</span>}
    </p>
  );
}
