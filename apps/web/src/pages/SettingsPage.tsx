import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { NotificationsSection } from '../components/NotificationsSection';
import { Button, Card, Field, PageHeader } from '../components/ui';
import { useI18n } from '../i18n/context';
import { api } from '../lib/api';

function PasswordForm() {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');

  const save = useMutation({
    mutationFn: () => api.changePassword({ current, password }),
    onSuccess: () => {
      setCurrent('');
      setPassword('');
    },
  });

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Card className="flex max-w-[480px] flex-col gap-4 p-5">
      <h3 id="password-heading" className="text-[17px] font-semibold">
        {t.account.passwordHeading}
      </h3>
      <form aria-labelledby="password-heading" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label={t.account.current}
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label={t.account.next}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint={t.auth.passwordHint}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={save.isPending} className="self-start">
          {save.isPending ? t.account.saving : t.account.save}
        </Button>
      </form>
      <p aria-live="polite" className="text-sm text-good">
        {save.isSuccess && t.account.saved}
      </p>
      {save.isError && (
        <p role="alert" className="text-sm text-critical">
          {save.error.message}
        </p>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  const signOut = useMutation({
    mutationFn: api.logout,
    onSuccess: () => qc.resetQueries(),
  });

  if (!me.data) return null;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={t.settings.title}
        subtitle={t.account.signedInAs(me.data.email)}
        actions={
          <Button variant="secondary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            {t.account.signOut}
          </Button>
        }
      />
      <NotificationsSection />
      <section aria-labelledby="account-heading" className="flex flex-col gap-4">
        <h2 id="account-heading" className="text-[22px] font-bold tracking-[-0.01em]">
          {t.account.title}
        </h2>
        {me.data.hasPassword ? (
          <PasswordForm />
        ) : (
          <p className="text-[15px] text-muted">{t.account.ssoOnly}</p>
        )}
      </section>
    </div>
  );
}
