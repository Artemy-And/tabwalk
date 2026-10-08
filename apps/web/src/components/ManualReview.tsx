import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import {
  api,
  type FindingReview,
  type IssueGroup,
  type ManualSummary,
  type ReviewStatus,
} from '../lib/api';
import { formatDate } from '../lib/format';
import { Button, TextareaField } from './ui';

const STATUSES: ReviewStatus[] = ['confirmed', 'acceptable', 'not_applicable'];

export function ReviewDetails({ review }: { review?: FindingReview | null }) {
  const { t, locale } = useI18n();
  if (!review) return null;
  return (
    <div className="mt-3 flex flex-col gap-1 text-sm">
      <p className="font-semibold">{t.manualReview.statuses[review.status]}</p>
      <p className="break-words text-muted">
        {review.by} · {formatDate(review.reviewedAt, locale)}
      </p>
      {review.note && <p className="whitespace-pre-wrap break-words">{review.note}</p>}
    </div>
  );
}

export function ManualReviewSummary({ summary }: { summary?: ManualSummary }) {
  const { t } = useI18n();
  if (!summary || summary.total === 0) return null;
  return (
    <section className="rounded-lg border border-line p-4" aria-label={t.manualReview.heading}>
      <h2 className="font-semibold">{t.manualReview.heading}</h2>
      <p className="mt-1 text-sm text-muted">{t.manualReview.scope}</p>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {(
          [
            [t.manualReview.pending, summary.pending],
            [t.manualReview.statuses.confirmed, summary.confirmed],
            [t.manualReview.statuses.acceptable, summary.acceptable],
            [t.manualReview.statuses.not_applicable, summary.notApplicable],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="inline">{label}: </dt>
            <dd className="inline font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ManualReviewForm({
  issue,
  actions,
}: {
  issue: IssueGroup;
  actions: { scanId: string; siteId: string; onChange: (notice: string) => void };
}) {
  const { t } = useI18n();
  const id = useId();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReviewStatus>(issue.review?.status ?? 'confirmed');
  const [note, setNote] = useState(issue.review?.note ?? '');
  const mutation = useMutation({
    mutationFn: (reset: boolean) =>
      reset
        ? api.resetReview(actions.scanId, issue.fingerprint)
        : api.reviewFinding(actions.scanId, { fingerprint: issue.fingerprint, status, note }),
    onSuccess: (_, reset) => {
      actions.onChange(reset ? t.manualReview.resetNotice : t.manualReview.savedNotice);
      for (const key of [
        ['issues', actions.scanId],
        ['scan', actions.scanId],
        ['site', actions.siteId],
        ['sites'],
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-muted">
        {issue.review ? t.manualReview.edit : t.manualReview.assess}
      </summary>
      <form
        className="mt-3 flex max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(false);
        }}
      >
        <fieldset className="flex flex-col gap-2" disabled={mutation.isPending}>
          <legend className="mb-2 font-semibold text-sm">{t.manualReview.heading}</legend>
          {STATUSES.map((value) => (
            <label className="flex items-center gap-2 text-sm" key={value}>
              <input
                type="radio"
                name={`${id}-status`}
                checked={status === value}
                onChange={() => setStatus(value)}
              />
              {t.manualReview.statuses[value]}
            </label>
          ))}
        </fieldset>
        <TextareaField
          label={t.manualReview.note}
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="secondary" disabled={mutation.isPending}>
            {t.manualReview.save}
          </Button>
          {issue.review && (
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              {t.manualReview.reset}
            </Button>
          )}
        </div>
        {mutation.isError && (
          <p role="alert" className="text-sm text-critical">
            {mutation.error.message}
          </p>
        )}
      </form>
    </details>
  );
}
