import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { api, type ScenarioStep, type SiteDetail, type SiteScenario } from '../lib/api';
import { Button, Card, Field, SelectField } from './ui';

const ACTIONS: ScenarioStep['action'][] = ['click', 'fill', 'press', 'waitFor', 'expectFocus'];
const MAX_SCENARIOS = 5;
const MAX_STEPS = 20;
let nextDraftId = 0;
const draftId = () => String(++nextDraftId);

interface StepDraft {
  id: string;
  action: ScenarioStep['action'];
  selector: string;
  value: string;
  key: string;
  state: 'visible' | 'hidden';
}

interface ScenarioDraft {
  id: string;
  name: string;
  path: string;
  steps: StepDraft[];
}

function draftStep(step: ScenarioStep = { action: 'click', selector: '' }): StepDraft {
  return {
    id: draftId(),
    action: step.action,
    selector: 'selector' in step ? step.selector : '',
    value: step.action === 'fill' ? step.value : '',
    key: step.action === 'press' ? step.key : 'Tab',
    state: step.action === 'waitFor' ? step.state : 'visible',
  };
}

function draftScenarios(scenarios: SiteScenario[]): ScenarioDraft[] {
  return scenarios.map((scenario) => ({
    ...scenario,
    id: draftId(),
    steps: scenario.steps.map(draftStep),
  }));
}

function toStep(step: StepDraft): ScenarioStep {
  const selector = step.selector.trim();
  switch (step.action) {
    case 'fill':
      return { action: 'fill', selector, value: step.value };
    case 'press':
      return { action: 'press', key: step.key.trim() };
    case 'waitFor':
      return { action: 'waitFor', selector, state: step.state };
    case 'expectFocus':
      return { action: 'expectFocus', selector };
    default:
      return { action: 'click', selector };
  }
}

function validPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\s]/.test(path)) return false;
  try {
    return new URL(path, 'https://example.test').pathname === path;
  } catch {
    return false;
  }
}

function validSelector(selector: string): boolean {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

export function ScenarioEditor({ site }: { site: SiteDetail }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [scenarios, setScenarios] = useState(() => draftScenarios(site.scenarios));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (next: SiteScenario[]) => api.updateSite(site.id, { scenarios: next }),
    onSuccess: (updated) => {
      qc.setQueryData(['site-info', site.id], updated);
      setScenarios(draftScenarios(updated.scenarios));
    },
  });

  function edit(next: ScenarioDraft[]) {
    setScenarios(next);
    setProblem(null);
    save.reset();
  }

  function updateScenario(id: string, patch: Partial<ScenarioDraft>) {
    edit(scenarios.map((scenario) => (scenario.id === id ? { ...scenario, ...patch } : scenario)));
  }

  function updateStep(scenario: ScenarioDraft, id: string, patch: Partial<StepDraft>) {
    updateScenario(scenario.id, {
      steps: scenario.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    });
  }

  function focusStep(id: string) {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(`[data-step-id="${id}"] select`)?.focus();
    });
  }

  function moveStep(scenario: ScenarioDraft, index: number, offset: number) {
    const steps = [...scenario.steps];
    const next = index + offset;
    const current = steps[index];
    const target = steps[next];
    if (!current || !target) return;
    [steps[index], steps[next]] = [target, current];
    updateScenario(scenario.id, { steps });
    focusStep(current.id);
  }

  function addScenario() {
    let n = scenarios.length + 1;
    while (
      scenarios.some(
        (scenario) =>
          scenario.name.trim().toLowerCase() === t.scenarios.defaultName(n).toLowerCase(),
      )
    )
      n++;
    const id = draftId();
    edit([
      ...scenarios,
      {
        id,
        name: t.scenarios.defaultName(n),
        path: new URL(site.url).pathname,
        steps: [draftStep()],
      },
    ]);
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>(`[data-scenario-id="${id}"] input`)?.focus(),
    );
  }

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = scenarios.map((scenario) => ({
      name: scenario.name.trim(),
      path: scenario.path.trim(),
      steps: scenario.steps.map(toStep),
    }));
    if (
      next.some((scenario) => !scenario.name) ||
      new Set(next.map((scenario) => scenario.name.toLowerCase())).size !== next.length
    ) {
      setProblem(t.scenarios.duplicateNames);
      return;
    }
    if (next.some((scenario) => !validPath(scenario.path))) {
      setProblem(t.scenarios.badPath);
      return;
    }
    if (next.some((scenario) => scenario.steps.length === 0)) {
      setProblem(t.scenarios.needsStep);
      return;
    }
    for (const scenario of next) {
      const broken = scenario.steps.find(
        (step) => 'selector' in step && !validSelector(step.selector),
      );
      if (broken && 'selector' in broken) {
        setProblem(t.scenarios.badSelector(broken.selector));
        return;
      }
    }
    setProblem(null);
    save.mutate(next);
  }

  const error = problem ?? (save.isError ? save.error.message : null);

  return (
    <Card className="p-5">
      <h2 id="scenarios-heading" className="text-[17px] font-semibold">
        {t.scenarios.heading}
      </h2>
      <p className="mt-1 max-w-[700px] text-[15px] text-muted">{t.scenarios.intro}</p>
      <p className="mt-2 max-w-[700px] text-sm text-muted">{t.scenarios.note}</p>
      <form ref={formRef} aria-labelledby="scenarios-heading" onSubmit={onSubmit} className="mt-4">
        <fieldset disabled={save.isPending} className="flex min-w-0 flex-col gap-4">
          <legend className="visually-hidden">{t.scenarios.heading}</legend>
          {scenarios.length === 0 && <p className="text-[15px] text-muted">{t.scenarios.empty}</p>}
          {scenarios.map((scenario, scenarioIndex) => (
            <fieldset
              key={scenario.id}
              data-scenario-id={scenario.id}
              className="min-w-0 rounded-lg border border-line bg-surface-alt p-4"
            >
              <legend className="px-1 font-semibold">
                {scenario.name || t.scenarios.defaultName(scenarioIndex + 1)}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t.scenarios.name}
                  hint={t.scenarios.nameHint}
                  required
                  maxLength={80}
                  value={scenario.name}
                  onChange={(e) => updateScenario(scenario.id, { name: e.target.value })}
                />
                <Field
                  label={t.scenarios.path}
                  hint={t.scenarios.pathHint}
                  required
                  maxLength={1000}
                  autoComplete="off"
                  spellCheck={false}
                  value={scenario.path}
                  onChange={(e) => updateScenario(scenario.id, { path: e.target.value })}
                />
              </div>
              <ol className="mt-4 flex flex-col gap-3">
                {scenario.steps.map((step, index) => (
                  <li key={step.id} data-step-id={step.id}>
                    <fieldset className="min-w-0 rounded-lg border border-line bg-surface p-3">
                      <legend className="px-1 text-sm font-semibold">
                        {t.scenarios.step(index + 1)}
                      </legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SelectField
                          label={t.scenarios.action}
                          value={step.action}
                          onChange={(e) =>
                            updateStep(scenario, step.id, {
                              action: e.target.value as ScenarioStep['action'],
                              value: '',
                            })
                          }
                        >
                          {ACTIONS.map((action) => (
                            <option key={action} value={action}>
                              {t.scenarios.actions[action]}
                            </option>
                          ))}
                        </SelectField>
                        {step.action !== 'press' && (
                          <Field
                            label={t.scenarios.selector}
                            hint={t.scenarios.selectorHint}
                            required
                            maxLength={1000}
                            autoComplete="off"
                            spellCheck={false}
                            value={step.selector}
                            onChange={(e) =>
                              updateStep(scenario, step.id, { selector: e.target.value })
                            }
                          />
                        )}
                        {step.action === 'fill' && (
                          <Field
                            label={t.scenarios.value}
                            hint={t.scenarios.valueHint}
                            maxLength={2000}
                            autoComplete="off"
                            value={step.value}
                            onChange={(e) =>
                              updateStep(scenario, step.id, { value: e.target.value })
                            }
                          />
                        )}
                        {step.action === 'press' && (
                          <Field
                            label={t.scenarios.key}
                            hint={t.scenarios.keyHint}
                            required
                            maxLength={80}
                            pattern={'.*\\S.*'}
                            autoComplete="off"
                            spellCheck={false}
                            value={step.key}
                            onChange={(e) => updateStep(scenario, step.id, { key: e.target.value })}
                          />
                        )}
                        {step.action === 'waitFor' && (
                          <SelectField
                            label={t.scenarios.state}
                            value={step.state}
                            onChange={(e) =>
                              updateStep(scenario, step.id, {
                                state: e.target.value as 'visible' | 'hidden',
                              })
                            }
                          >
                            <option value="visible">{t.scenarios.states.visible}</option>
                            <option value="hidden">{t.scenarios.states.hidden}</option>
                          </SelectField>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          aria-label={`${t.scenarios.moveUp}: ${t.scenarios.step(index + 1)}`}
                          disabled={index === 0}
                          onClick={() => moveStep(scenario, index, -1)}
                        >
                          {t.scenarios.moveUp}
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`${t.scenarios.moveDown}: ${t.scenarios.step(index + 1)}`}
                          disabled={index === scenario.steps.length - 1}
                          onClick={() => moveStep(scenario, index, 1)}
                        >
                          {t.scenarios.moveDown}
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`${t.scenarios.removeStep}: ${t.scenarios.step(index + 1)}`}
                          onClick={() => {
                            const steps = scenario.steps.filter((item) => item.id !== step.id);
                            updateScenario(scenario.id, { steps });
                            const target = steps[Math.min(index, steps.length - 1)];
                            if (target) focusStep(target.id);
                            else
                              requestAnimationFrame(() =>
                                formRef.current
                                  ?.querySelector<HTMLButtonElement>(
                                    `[data-scenario-id="${scenario.id}"] [data-add-step]`,
                                  )
                                  ?.focus(),
                              );
                          }}
                        >
                          {t.scenarios.removeStep}
                        </Button>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  data-add-step
                  disabled={scenario.steps.length >= MAX_STEPS}
                  onClick={() => {
                    const step = draftStep();
                    updateScenario(scenario.id, { steps: [...scenario.steps, step] });
                    focusStep(step.id);
                  }}
                >
                  {t.scenarios.addStep}
                </Button>
                <Button
                  variant="danger"
                  aria-label={t.scenarios.removeLabel(scenario.name)}
                  onClick={() => {
                    const next = scenarios.filter((item) => item.id !== scenario.id);
                    edit(next);
                    const target = next[Math.min(scenarioIndex, next.length - 1)];
                    requestAnimationFrame(() => {
                      const selector = target
                        ? `[data-scenario-id="${target.id}"] input`
                        : '[data-add-scenario]';
                      formRef.current?.querySelector<HTMLElement>(selector)?.focus();
                    });
                  }}
                >
                  {t.scenarios.remove}
                </Button>
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              data-add-scenario
              disabled={scenarios.length >= MAX_SCENARIOS}
              onClick={addScenario}
            >
              {t.scenarios.add}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t.scenarios.saving : t.scenarios.save}
            </Button>
            <p aria-live="polite" className="text-sm text-muted">
              {save.isSuccess ? t.scenarios.saved : ''}
            </p>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 text-sm text-critical">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
