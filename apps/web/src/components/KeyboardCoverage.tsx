import { useI18n } from '../i18n/context';
import type { KeyboardCoverage } from '../lib/api';

export function KeyboardCoverageLabel({ coverage }: { coverage?: KeyboardCoverage | null }) {
  const { t } = useI18n();
  const label = !coverage
    ? t.coverage.unknown
    : coverage.status === 'partial'
      ? t.coverage.partial
      : t.coverage.completed;
  return (
    <span
      className={`mt-1 block text-[12px] ${coverage?.status === 'partial' ? 'text-review' : 'text-muted'}`}
    >
      {label}
    </span>
  );
}

export function KeyboardCoverageDetails({
  coverage,
  compact = false,
}: {
  coverage?: KeyboardCoverage | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={compact ? 'mt-2 text-sm' : 'rounded-xl border border-line bg-surface px-5 py-4'}
    >
      {!compact && <h2 className="text-[18px] font-semibold">{t.coverage.heading}</h2>}
      <KeyboardCoverageLabel coverage={coverage} />
      {coverage && (
        <p className="mt-1 text-sm text-muted">
          {t.coverage.counts(
            coverage.visitedStops,
            coverage.focusStylesTested,
            coverage.focusStylesSkipped,
          )}
        </p>
      )}
      {coverage && coverage.reasons.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {coverage.reasons.map((reason) => (
            <li key={reason}>{t.coverage.reasons[reason]}</li>
          ))}
        </ul>
      )}
      {!compact && <p className="mt-2 max-w-[700px] text-sm text-muted">{t.coverage.intro}</p>}
    </div>
  );
}
