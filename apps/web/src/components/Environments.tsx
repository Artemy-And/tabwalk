import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import {
  api,
  type EnvironmentRun,
  type ExtraEnvironment,
  type ScanEnvironment,
  type SiteDetail,
} from '../lib/api';
import { KeyboardCoverageDetails } from './KeyboardCoverage';
import { ScenarioResults } from './ScenarioResults';
import { Button, Card } from './ui';

const EXTRA: ExtraEnvironment[] = ['mobile', 'zoom-200', 'forced-colors'];

export function EnvironmentEditor({ site }: { site: SiteDetail }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ExtraEnvironment[]>(site.environments);
  const save = useMutation({
    mutationFn: () => api.updateSite(site.id, { environments: selected }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['site', site.id] });
    },
  });
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t.environments.heading}</h2>
      <p className="mt-2 text-sm text-muted">{t.environments.intro}</p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <fieldset className="flex flex-col gap-3" disabled={save.isPending}>
          <legend className="visually-hidden">{t.environments.heading}</legend>
          <p className="text-sm">{t.environments.labels.desktop} — 1280 × 720</p>
          {EXTRA.map((value) => (
            <label className="flex items-start gap-2 text-sm" key={value}>
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(value)}
                onChange={(event) => {
                  save.reset();
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, value]
                      : current.filter((id) => id !== value),
                  );
                }}
              />
              <span>
                {t.environments.labels[value]}
                <span className="mt-1 block text-muted">{t.environments.descriptions[value]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button type="submit" variant="secondary" disabled={save.isPending}>
          {t.environments.save}
        </Button>
        {save.isSuccess && (
          <p role="status" className="text-sm">
            {t.environments.saved}
          </p>
        )}
        {save.isError && (
          <p role="alert" className="text-sm text-critical">
            {save.error.message}
          </p>
        )}
      </form>
    </Card>
  );
}

export function FindingEnvironments({
  environments,
  shotContext,
}: {
  environments?: ScanEnvironment[];
  shotContext?: { url: string; environment: ScanEnvironment; scenario: string | null } | null;
}) {
  const { t } = useI18n();
  if (!environments?.length && !shotContext) return null;
  return (
    <div className="mt-2 text-sm text-muted">
      {environments?.length ? (
        <p>
          {t.environments.foundIn}:{' '}
          {environments.map((env) => t.environments.labels[env.id]).join(' · ')}
        </p>
      ) : null}
      {shotContext && (
        <p className="break-words">
          {t.environments.picture}: {t.environments.labels[shotContext.environment.id]} ·{' '}
          {shotContext.url}
          {shotContext.scenario ? ` · ${shotContext.scenario}` : ''}
        </p>
      )}
    </div>
  );
}

export function TestedEnvironments({ environments }: { environments?: ScanEnvironment[] | null }) {
  const { t } = useI18n();
  if (!environments?.length) return null;
  return (
    <section className="rounded-lg border border-line p-4" aria-label={t.environments.heading}>
      <h2 className="font-semibold">{t.environments.heading}</h2>
      <p className="mt-1 text-sm text-muted">{t.environments.limitations}</p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {environments.map((env) => (
          <li key={env.id}>
            {t.environments.labels[env.id]}: {env.viewport.width} × {env.viewport.height} CSS px ·{' '}
            {env.deviceScaleFactor}×
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EnvironmentFailures({ runs }: { runs: EnvironmentRun[] }) {
  const { t } = useI18n();
  const failed = runs.filter((run) => run.status === 'failed');
  if (!failed.length) return null;
  return (
    <p className="rounded-lg border border-review-line bg-review-soft p-3 text-sm text-review">
      {t.environments.incomplete}{' '}
      {failed.map((run) => t.environments.labels[run.environment.id]).join(' · ')}
    </p>
  );
}

export function EnvironmentResults({
  runs,
  expanded = false,
}: {
  runs?: EnvironmentRun[];
  expanded?: boolean;
}) {
  const { t } = useI18n();
  if (!runs?.length) return null;
  const content = (
    <div className="mt-2 flex flex-col gap-4">
      {runs.map((run) => (
        <div key={run.environment.id} className="break-inside-avoid border-t border-line pt-3">
          <h3 className="text-sm font-semibold">
            {t.environments.labels[run.environment.id]} ·{' '}
            {run.status === 'completed' ? t.environments.completed : t.environments.failed}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {run.environment.viewport.width} × {run.environment.viewport.height} CSS px ·{' '}
            {run.environment.deviceScaleFactor}× · {(run.elapsedMs / 1000).toFixed(1)} s ·{' '}
            {t.environments.occurrences}: {run.status === 'completed' ? run.findings : '—'}
          </p>
          {run.error && <p className="mt-1 text-sm text-critical">{run.error}</p>}
          {run.status === 'completed' && (
            <KeyboardCoverageDetails coverage={run.keyboardCoverage} />
          )}
          <ScenarioResults runs={run.scenarioRuns} compact />
        </div>
      ))}
    </div>
  );
  return expanded ? (
    <section>
      <h2 className="text-sm font-semibold">{t.environments.results}</h2>
      {content}
    </section>
  ) : (
    <details>
      <summary className="cursor-pointer text-sm text-muted">
        {t.environments.results}
        {runs.some((run) => run.status === 'failed') ? ` · ${t.environments.failed}` : ''}
      </summary>
      {content}
    </details>
  );
}
