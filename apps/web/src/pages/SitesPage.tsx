import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type SubmitEvent, useState } from 'react';
import { Button, Card, Field, LiveStatus, StatusBadge } from '../components/ui';
import { useI18n } from '../i18n/context';
import { api } from '../lib/api';

export function SitesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<'fillBoth' | Error | null>(null);

  const sites = useQuery({ queryKey: ['sites'], queryFn: api.listSites });

  const create = useMutation({
    mutationFn: api.createSite,
    onSuccess: () => {
      setName('');
      setUrl('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: (e: Error) => setError(e),
  });

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('fillBoth');
      return;
    }
    create.mutate({ name: name.trim(), url: url.trim() });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t.sites.title}</h1>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.sites.addHeading}</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field
              label={t.sites.nameLabel}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.sites.namePlaceholder}
            />
          </div>
          <div className="flex-1">
            <Field
              label={t.sites.urlLabel}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              hint={t.sites.urlHint}
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t.sites.submitting : t.sites.submit}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-sm text-critical">
            {error === 'fillBoth' ? t.sites.fillBoth : error.message}
          </p>
        )}
      </Card>

      {sites.isLoading && <LiveStatus>{t.sites.loading}</LiveStatus>}

      {sites.data?.length === 0 && <p className="text-sm text-muted">{t.sites.empty}</p>}

      {sites.data && sites.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sites.data.map((site) => (
            <li key={site.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <Link
                    to="/sites/$siteId"
                    params={{ siteId: site.id }}
                    className="font-medium text-accent underline"
                  >
                    {site.name}
                  </Link>
                  <p className="text-sm text-muted">{site.url}</p>
                </div>
                <div className="text-right">
                  {site.lastScanStatus ? (
                    <StatusBadge status={site.lastScanStatus} />
                  ) : (
                    <span className="text-sm text-muted">{t.sites.neverScanned}</span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
