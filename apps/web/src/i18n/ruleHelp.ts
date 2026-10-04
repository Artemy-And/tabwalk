import { useQuery } from '@tanstack/react-query';
import { type Locale, useI18n } from './context';

type RuleHelp = Record<string, string>;

const dictionaries = import.meta.glob<RuleHelp>('./rules/*.json', { import: 'default' });

function loaderFor(locale: Locale) {
  return dictionaries[`./rules/${locale}.json`];
}

export function useRuleHelp(): (ruleId: string, fallback: string) => string {
  const { locale, t } = useI18n();
  const own: Partial<RuleHelp> = t.rules;

  const { data } = useQuery({
    queryKey: ['rule-help', locale],
    queryFn: () => loaderFor(locale)?.() ?? Promise.resolve<RuleHelp>({}),
    enabled: loaderFor(locale) !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (ruleId, fallback) => own[ruleId] ?? data?.[ruleId] ?? fallback;
}
