import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { useI18n } from '../i18n/context';
import { api, CHANNEL_KINDS, type Channel, type ChannelKind } from '../lib/api';
import { formatRelative } from '../lib/format';
import { Button, Card, Field, LiveStatus, SelectField } from './ui';

const TH = 'px-3 py-3 text-[13px] font-semibold text-muted first:pl-5 last:pr-5';
const TD = 'px-3 py-4 align-top first:pl-5 last:pr-5';

function ChannelRow({ channel }: { channel: Channel }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const test = useMutation({ mutationFn: () => api.testChannel(channel.id), onSettled: refresh });
  const remove = useMutation({
    mutationFn: () => api.removeChannel(channel.id),
    onSuccess: refresh,
  });
  const kind = t.notifications.kinds[channel.kind];

  return (
    <tr className="border-b border-line-soft last:border-b-0">
      <td className={`${TD} font-semibold`}>{kind}</td>
      <td className={`${TD} font-mono text-[13px] break-all`}>{channel.target}</td>
      <td className={TD}>
        {channel.lastError ? (
          <span className="text-critical">{t.notifications.failed(channel.lastError)}</span>
        ) : channel.lastSentAt ? (
          t.notifications.sent(formatRelative(channel.lastSentAt, locale))
        ) : (
          <span className="text-muted">{t.notifications.neverSent}</span>
        )}
        <p aria-live="polite" className="text-sm text-good">
          {test.isSuccess && t.notifications.testSent}
        </p>
      </td>
      <td className={TD}>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? t.notifications.testing : t.notifications.test}
          </Button>
          <Button
            variant="danger"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            aria-label={t.notifications.removeLabel(kind, channel.target)}
          >
            {t.notifications.remove}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AddChannelForm({ email }: { email: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [kind, setKind] = useState<ChannelKind>('slack');
  const [target, setTarget] = useState('');

  const add = useMutation({
    mutationFn: () => api.addChannel({ kind, target: target.trim() }),
    onSuccess: () => {
      setTarget('');
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    add.mutate();
  }

  return (
    <Card className="p-5">
      <h3 id="add-channel" className="mb-4 text-[17px] font-semibold">
        {t.notifications.addHeading}
      </h3>
      <form
        aria-labelledby="add-channel"
        onSubmit={onSubmit}
        className="flex flex-col gap-4 md:flex-row md:items-start"
      >
        <div className="md:w-56">
          <SelectField
            label={t.notifications.kindLabel}
            value={kind}
            onChange={(e) => setKind(e.target.value as ChannelKind)}
          >
            {CHANNEL_KINDS.map((option) => (
              <option key={option} value={option} disabled={option === 'email' && !email}>
                {option === 'email' && !email
                  ? t.notifications.emailOff
                  : t.notifications.kinds[option]}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grow">
          <Field
            label={t.notifications.targetLabel[kind]}
            type={kind === 'email' ? 'email' : 'url'}
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            hint={t.notifications.targetHint[kind]}
          />
        </div>
        <Button type="submit" disabled={add.isPending} className="md:mt-[26px]">
          {add.isPending ? t.notifications.adding : t.notifications.add}
        </Button>
      </form>
      {add.isError && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {add.error.message}
        </p>
      )}
    </Card>
  );
}

export function NotificationsSection() {
  const { t } = useI18n();
  const data = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });

  return (
    <section aria-labelledby="notifications-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="notifications-heading" className="text-[22px] font-bold tracking-[-0.01em]">
          {t.notifications.title}
        </h2>
        <p className="mt-1 max-w-[700px] text-[15px] text-muted">{t.notifications.intro}</p>
        {data.data && !data.data.links && (
          <p className="mt-1 max-w-[700px] text-[15px] text-muted">{t.notifications.noLinks}</p>
        )}
      </div>

      {data.isLoading && <LiveStatus>{t.notifications.loading}</LiveStatus>}

      {data.data && data.data.channels.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
            <caption className="px-5 pt-4 pb-3 text-left text-sm text-muted">
              {t.notifications.caption}
            </caption>
            <thead>
              <tr className="border-y border-line bg-surface-alt">
                <th scope="col" className={TH}>
                  {t.notifications.columns.kind}
                </th>
                <th scope="col" className={TH}>
                  {t.notifications.columns.target}
                </th>
                <th scope="col" className={TH}>
                  {t.notifications.columns.status}
                </th>
                <th scope="col" className={TH}>
                  <span className="visually-hidden">{t.notifications.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.data.channels.map((channel) => (
                <ChannelRow key={channel.id} channel={channel} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data.data?.channels.length === 0 && (
        <p className="text-[15px] text-muted">{t.notifications.empty}</p>
      )}

      {data.data && <AddChannelForm email={data.data.email} />}
    </section>
  );
}
