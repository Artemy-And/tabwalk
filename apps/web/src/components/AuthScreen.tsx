import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { useI18n } from '../i18n/context';
import { type AuthConfig, api } from '../lib/api';
import { Button, ButtonLink, Card, Field } from './ui';

// a failed single sign-on comes back as ?sso_error=; show it once
function takeSsoError(): string | null {
  const message = new URLSearchParams(window.location.search).get('sso_error');
  if (message) window.history.replaceState(null, '', window.location.pathname);
  return message;
}

export function AuthScreen({ config }: { config: AuthConfig }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ssoError] = useState(takeSsoError);
  const setup = config.setup;

  const submit = useMutation({
    mutationFn: () => (setup ? api.setup : api.login)({ email: email.trim(), password }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    submit.mutate();
  }

  const error = submit.error?.message ?? ssoError;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-5 py-4">
      <div>
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.02em]">
          {setup ? t.auth.setupTitle : t.auth.loginTitle}
        </h1>
        {setup && <p className="mt-2 text-[15px] text-muted">{t.auth.setupIntro}</p>}
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field
            label={t.auth.email}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label={t.auth.password}
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            required
            minLength={setup ? 8 : undefined}
            hint={setup ? t.auth.passwordHint : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={submit.isPending}>
            {setup
              ? submit.isPending
                ? t.auth.creating
                : t.auth.create
              : submit.isPending
                ? t.auth.signingIn
                : t.auth.signIn}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}

        {!setup && config.sso && (
          <ButtonLink variant="secondary" href={api.ssoUrl}>
            {config.sso.label}
          </ButtonLink>
        )}
      </Card>

      {!setup && (
        <p className="text-[13px] text-muted">
          {t.auth.forgot}
          <code className="mt-1 block font-mono">
            docker compose exec api node dist/reset-password.js you@example.com
          </code>
        </p>
      )}
    </div>
  );
}
