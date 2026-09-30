import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { useI18n } from '../i18n/context';
import type { Impact, IssueKind, ScanStatus } from '../lib/api';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_BASE =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] px-[18px] ' +
  'text-[15px] font-semibold no-underline disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover hover:text-on-primary',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-alt hover:text-ink',
  danger: 'border border-critical bg-surface text-critical hover:bg-surface-alt',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  return (
    <a className={`${BUTTON_BASE} ${BUTTON_STYLES[variant]} ${className}`} {...props}>
      {children}
    </a>
  );
}

export function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink"
        {...props}
      />
      {hint && (
        <span id={hintId} className="text-[13px] text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="text-[13px] text-critical">
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={hint ? hintId : undefined}
        className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink"
        {...props}
      >
        {children}
      </select>
      {hint && (
        <span id={hintId} className="text-[13px] text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

const BADGE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-[9px] py-[3px] text-[13px] font-semibold';

const IMPACT_COLOR: Record<NonNullable<Impact>, string> = {
  critical: 'text-critical border-critical',
  serious: 'text-serious border-serious',
  moderate: 'text-moderate border-moderate',
  minor: 'text-minor border-minor',
};

export function Badge({ tone, children }: { tone: NonNullable<Impact>; children: ReactNode }) {
  return <span className={`${BADGE} ${IMPACT_COLOR[tone]}`}>{children}</span>;
}

function ReviewIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="4.5" />
      <path d="M6 4v2.5M6 8.2v.1" strokeLinecap="round" />
    </svg>
  );
}

export function ImpactBadge({ impact, kind }: { impact: Impact; kind: IssueKind }) {
  const { t } = useI18n();

  if (kind === 'incomplete') {
    return (
      <span className={`${BADGE} border-review text-review`}>
        <ReviewIcon />
        {t.impact.needsReview}
      </span>
    );
  }

  if (kind === 'recommendation') {
    return (
      <span className={`${BADGE} border-dashed border-line-strong text-muted`}>
        {t.impact.recommendation}
      </span>
    );
  }

  const key = impact ?? 'minor';
  return <Badge tone={key}>{t.impact[key]}</Badge>;
}

export function StatusBadge({ status }: { status: ScanStatus }) {
  const { t } = useI18n();
  const color = status === 'failed' ? 'text-critical' : 'text-muted';
  return <span className={`text-[15px] ${color}`}>{t.status[status]}</span>;
}

export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="text-[15px] text-muted">
      {children}
    </p>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-xl border border-line bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 grow">
        <h1 className="mb-1 text-[34px] leading-tight font-bold tracking-[-0.03em] break-words sm:text-[40px]">
          {title}
        </h1>
        {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Breadcrumbs({ items, current }: { items: ReactElement[]; current: string }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t.layout.breadcrumb} className="text-sm text-muted">
      <ol className="flex flex-wrap items-center">
        {items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the trail order is fixed
          <li key={i} className="flex items-center">
            {item}
            <span aria-hidden="true" className="px-1.5">
              /
            </span>
          </li>
        ))}
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}

export function StatCard({
  value,
  label,
  detail,
  tone = 'default',
}: {
  value: number;
  label: string;
  detail?: string;
  tone?: 'default' | 'critical' | 'review';
}) {
  const review = tone === 'review';
  const valueColor = tone === 'critical' ? 'text-critical' : review ? 'text-review' : 'text-ink';
  return (
    <div
      className={`rounded-xl border px-5 py-[18px] ${
        review ? 'border-review-line bg-review-soft' : 'border-line bg-surface'
      }`}
    >
      <p className={`text-[34px] leading-tight font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className={`mt-0.5 text-sm ${review ? 'font-semibold text-review' : 'text-muted'}`}>
        {label}
      </p>
      {detail && <p className="mt-0.5 text-[13px] text-muted">{detail}</p>}
    </div>
  );
}

export function TrendBars({ values, label }: { values: number[]; label: string }) {
  const width = 120;
  const height = 34;
  const slots = 8;
  const gap = 3;
  const barWidth = (width - gap * (slots - 1)) / slots;
  const max = Math.max(...values, 1);
  const last = values.length - 1;
  const first = values[0] ?? 0;
  const latest = values[last] ?? 0;
  const lastColor = latest > first ? 'fill-critical' : latest < first ? 'fill-good' : 'fill-minor';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      {values.map((v, i) => {
        const h = Math.max(3, Math.round((v / max) * height));
        const x = (slots - values.length + i) * (barWidth + gap);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional
            key={i}
            x={x}
            y={height - h}
            width={barWidth}
            height={h}
            rx="3"
            className={i === last ? lastColor : 'fill-trend'}
          />
        );
      })}
    </svg>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 rounded-full border px-3.5 text-sm ${
        active
          ? 'border-primary bg-primary font-semibold text-on-primary'
          : 'border-line-strong bg-surface text-ink hover:bg-surface-alt'
      }`}
    >
      {children}
    </button>
  );
}
