import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { useI18n } from '../i18n/context';
import type { Impact, IssueKind, ScanStatus } from '../lib/api';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const styles: Record<string, string> = {
    primary: 'bg-accent text-canvas hover:opacity-90',
    ghost: 'border border-line text-ink hover:bg-canvas',
    danger: 'border border-critical text-critical hover:bg-canvas',
  };

  return <button type="button" className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        {...props}
      />
      {hint && (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="text-xs text-critical">
          {error}
        </span>
      )}
    </div>
  );
}

const IMPACT_COLOR: Record<NonNullable<Impact>, string> = {
  critical: 'text-critical border-critical',
  serious: 'text-serious border-serious',
  moderate: 'text-moderate border-moderate',
  minor: 'text-minor border-minor',
};

export function ImpactBadge({ impact, kind }: { impact: Impact; kind: IssueKind }) {
  const { t } = useI18n();

  if (kind === 'incomplete') {
    return (
      <span className="inline-block rounded border border-review px-2 py-0.5 text-xs text-review">
        {t.impact.needsReview}
      </span>
    );
  }

  const key = impact ?? 'minor';
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs ${IMPACT_COLOR[key]}`}>
      {t.impact[key]}
    </span>
  );
}

export function StatusBadge({ status }: { status: ScanStatus }) {
  const { t } = useI18n();
  return <span className="text-sm text-muted">{t.status[status]}</span>;
}

export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="text-sm text-muted">
      {children}
    </p>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-surface p-4 ${className}`}>{children}</div>
  );
}
