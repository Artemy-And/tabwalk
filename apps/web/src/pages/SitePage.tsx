import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import { ScenarioEditor } from '../components/ScenarioEditor';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Field,
  LiveStatus,
  PageHeader,
  SelectField,
  StatusBadge,
  TextareaField,
} from '../components/ui';
import { useI18n } from '../i18n/context';
import {
  api,
  isScanActive,
  POLL_INTERVAL_MS,
  SCHEDULES,
  type ScanSchedule,
  type SiteDetail,
  type SiteUpdate,
} from '../lib/api';
import { formatDate, hostOf, isWithin } from '../lib/format';

const TH = 'px-3 py-3 text-[13px] font-semibold text-muted first:pl-5 last:pr-5';
const TD = 'px-3 py-4 align-top first:pl-5 last:pr-5';

const SOON_MS = 16 * 60 * 1000;

function ScheduleCard({ site }: { site: SiteDetail }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (schedule: ScanSchedule) => api.updateSite(site.id, { schedule }),
    onMutate: (schedule) => {
      qc.setQueryData(['site-info', site.id], { ...site, schedule });
      return site;
    },
    onSuccess: (updated) => qc.setQueryData(['site-info', site.id], updated),
    onError: (_error, _schedule, previous) => qc.setQueryData(['site-info', site.id], previous),
  });

  const next =
    site.schedule === 'off' || !site.nextScanAt
      ? t.schedule.manual
      : isWithin(site.nextScanAt, SOON_MS)
        ? t.schedule.soon
        : t.schedule.next(formatDate(site.nextScanAt, locale));

  return (
    <Card className="flex flex-col gap-3 p-5 md:flex-row md:items-end md:gap-5">
      <div className="md:w-56">
        <SelectField
          label={t.schedule.label}
          value={site.schedule}
          onChange={(e) => save.mutate(e.target.value as ScanSchedule)}
        >
          {SCHEDULES.map((option) => (
            <option key={option} value={option}>
              {t.schedule.options[option]}
            </option>
          ))}
        </SelectField>
      </div>
      <p aria-live="polite" className="text-[15px] text-muted md:pb-2.5">
        {save.isPending ? t.schedule.saving : save.isSuccess ? `${t.schedule.saved} ${next}` : next}
      </p>
      {save.isError && (
        <p role="alert" className="text-sm text-critical md:pb-2.5">
          {save.error.message}
        </p>
      )}
    </Card>
  );
}

// any whitespace separates paths and rule IDs, since neither can contain it
const words = (text: string) => text.split(/\s+/).filter(Boolean);

// a selector can hold spaces, so selectors go one per line
const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function parses(selector: string): boolean {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

// saves part of a site's settings and puts the answer back in the form
function useSiteUpdate(site: SiteDetail, onSaved: (updated: SiteDetail) => void) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (body: SiteUpdate) => api.updateSite(site.id, body),
    onSuccess: (updated) => {
      qc.setQueryData(['site-info', site.id], updated);
      onSaved(updated);
    },
  });
  // typing again takes back an earlier "Saved."
  const edit = (set: (value: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    save.reset();
  };
  return { save, edit };
}

function CrawlCard({ site }: { site: SiteDetail }) {
  const { t } = useI18n();
  const [maxPages, setMaxPages] = useState(site.maxPages === null ? '' : String(site.maxPages));
  const [include, setInclude] = useState(site.crawlInclude.join('\n'));
  const [exclude, setExclude] = useState(site.crawlExclude.join('\n'));
  const { save, edit } = useSiteUpdate(site, (updated) => {
    setInclude(updated.crawlInclude.join('\n'));
    setExclude(updated.crawlExclude.join('\n'));
  });

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate({
      maxPages: maxPages === '' ? null : Number(maxPages),
      crawlInclude: words(include),
      crawlExclude: words(exclude),
    });
  }

  return (
    <Card className="p-5">
      <h2 id="crawl-heading" className="text-[17px] font-semibold">
        {t.crawl.heading}
      </h2>
      <p className="mt-1 max-w-[700px] text-[15px] text-muted">{t.crawl.intro}</p>
      <form
        aria-labelledby="crawl-heading"
        onSubmit={onSubmit}
        className="mt-4 flex flex-col gap-4"
      >
        <div className="grid gap-4 md:grid-cols-[200px_1fr_1fr]">
          <Field
            label={t.crawl.maxPagesLabel}
            type="number"
            inputMode="numeric"
            min={1}
            max={site.pageCap}
            step={1}
            placeholder={String(site.pageCap)}
            value={maxPages}
            onChange={edit(setMaxPages)}
            hint={t.crawl.maxPagesHint(site.pageCap)}
          />
          <TextareaField
            label={t.crawl.includeLabel}
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            value={include}
            onChange={edit(setInclude)}
            hint={t.crawl.includeHint}
          />
          <TextareaField
            label={t.crawl.excludeLabel}
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            value={exclude}
            onChange={edit(setExclude)}
            hint={t.crawl.excludeHint}
          />
        </div>
        <p className="text-[15px] text-muted">{t.crawl.note}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t.crawl.saving : t.crawl.save}
          </Button>
          <p aria-live="polite" className="text-[15px] text-muted">
            {save.isSuccess ? t.crawl.saved : ''}
          </p>
        </div>
      </form>
      {save.isError && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {save.error.message}
        </p>
      )}
    </Card>
  );
}

function IgnoreCard({ site }: { site: SiteDetail }) {
  const { t } = useI18n();
  const [rules, setRules] = useState(site.ignoreRules.join('\n'));
  const [selectors, setSelectors] = useState(site.ignoreSelectors.join('\n'));
  const [problem, setProblem] = useState<string | null>(null);
  const { save, edit } = useSiteUpdate(site, (updated) => {
    setRules(updated.ignoreRules.join('\n'));
    setSelectors(updated.ignoreSelectors.join('\n'));
  });

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const list = lines(selectors);
    const broken = list.find((selector) => !parses(selector));
    setProblem(broken === undefined ? null : t.ignore.badSelector(broken));
    if (broken !== undefined) return;
    save.mutate({
      ignoreRules: words(rules).map((rule) => rule.toLowerCase()),
      ignoreSelectors: list,
    });
  }

  const error = problem ?? (save.isError ? save.error.message : null);

  return (
    <Card className="p-5">
      <h2 id="ignore-heading" className="text-[17px] font-semibold">
        {t.ignore.heading}
      </h2>
      <p className="mt-1 max-w-[700px] text-[15px] text-muted">{t.ignore.intro}</p>
      <form
        aria-labelledby="ignore-heading"
        onSubmit={onSubmit}
        className="mt-4 flex flex-col gap-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextareaField
            label={t.ignore.rulesLabel}
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            value={rules}
            onChange={edit(setRules)}
            hint={t.ignore.rulesHint}
          />
          <TextareaField
            label={t.ignore.selectorsLabel}
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            value={selectors}
            onChange={edit(setSelectors)}
            hint={t.ignore.selectorsHint}
          />
        </div>
        <p className="text-[15px] text-muted">{t.ignore.note}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t.ignore.saving : t.ignore.save}
          </Button>
          <p aria-live="polite" className="text-[15px] text-muted">
            {save.isSuccess ? t.ignore.saved : ''}
          </p>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}
    </Card>
  );
}

// "name<separator>value" entries, one per line or split further; null when all of them parse,
// else the number of the first line that does not
function parsePairs(text: string, separator: string, split?: RegExp) {
  const pairs: { name: string; value: string }[] = [];
  for (const [index, row] of text.split('\n').entries()) {
    for (const part of split ? row.split(split) : [row]) {
      const entry = part.trim();
      if (!entry) continue;
      const at = entry.indexOf(separator);
      if (at <= 0) return { pairs, bad: index + 1 };
      pairs.push({ name: entry.slice(0, at).trim(), value: entry.slice(at + 1).trim() });
    }
  }
  return { pairs, bad: null };
}

function LoginCard({ site }: { site: SiteDetail }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [headers, setHeaders] = useState('');
  const [cookies, setCookies] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [backToSummary, setBackToSummary] = useState(0);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // secrets are typed in fresh every time and leave the page once saved
  function close() {
    setEditing(false);
    setUsername('');
    setPassword('');
    setHeaders('');
    setCookies('');
    setProblem(null);
    setBackToSummary((n) => n + 1);
  }

  const { save, edit } = useSiteUpdate(site, close);

  // the form takes focus when it opens and gives it back to the summary when it closes
  useEffect(() => {
    if (editing) formRef.current?.querySelector('input')?.focus();
  }, [editing]);
  useEffect(() => {
    if (backToSummary > 0) summaryRef.current?.focus();
  }, [backToSummary]);

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const header = parsePairs(headers, ':');
    const cookie = parsePairs(cookies, '=', /;/);
    const bad =
      header.bad !== null
        ? t.login.badHeader(header.bad)
        : cookie.bad !== null
          ? t.login.badCookie(cookie.bad)
          : null;
    setProblem(bad);
    if (bad !== null) return;
    save.mutate({
      login: {
        username: username.trim() || undefined,
        password: password || undefined,
        headers: header.pairs,
        cookies: cookie.pairs,
      },
    });
  }

  const parts = site.login
    ? [
        site.login.username ? t.login.partBasic(site.login.username) : null,
        site.login.headers.length ? t.login.partHeaders(site.login.headers.join(', ')) : null,
        site.login.cookies.length ? t.login.partCookies(site.login.cookies.join(', ')) : null,
      ].filter((part) => part !== null)
    : [];
  const error = problem ?? (save.isError ? save.error.message : null);

  return (
    <Card className="p-5">
      <h2 id="login-heading" className="text-[17px] font-semibold">
        {t.login.heading}
      </h2>
      <p className="mt-1 max-w-[700px] text-[15px] text-muted">{t.login.intro}</p>
      <p ref={summaryRef} tabIndex={-1} className="mt-3 text-[15px]">
        {parts.length > 0 ? t.login.summary(parts.join('; ')) : t.login.none}
      </p>

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {site.login ? t.login.replace : t.login.add}
          </Button>
          {site.login && (
            <Button
              variant="danger"
              onClick={() => save.mutate({ login: null })}
              disabled={save.isPending}
            >
              {save.isPending ? t.login.removing : t.login.remove}
            </Button>
          )}
        </div>
      )}

      {editing && (
        <form
          ref={formRef}
          aria-labelledby="login-heading"
          onSubmit={onSubmit}
          className="mt-4 flex flex-col gap-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={t.login.usernameLabel}
              autoComplete="off"
              value={username}
              onChange={edit(setUsername)}
              hint={t.login.basicHint}
            />
            <Field
              label={t.login.passwordLabel}
              type="password"
              autoComplete="off"
              value={password}
              onChange={edit(setPassword)}
            />
            <TextareaField
              label={t.login.headersLabel}
              rows={3}
              spellCheck={false}
              autoCapitalize="none"
              value={headers}
              onChange={edit(setHeaders)}
              hint={t.login.headersHint}
            />
            <TextareaField
              label={t.login.cookiesLabel}
              rows={3}
              spellCheck={false}
              autoCapitalize="none"
              value={cookies}
              onChange={edit(setCookies)}
              hint={t.login.cookiesHint}
            />
          </div>
          <p className="max-w-[700px] text-[15px] text-muted">{t.login.note}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t.login.saving : t.login.save}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t.login.cancel}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}
    </Card>
  );
}

export function SitePage() {
  const { siteId } = useParams({ from: '/sites/$siteId' });
  const { t, locale } = useI18n();
  const qc = useQueryClient();

  const site = useQuery({ queryKey: ['site-info', siteId], queryFn: () => api.getSite(siteId) });

  const scans = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => api.listScans(siteId),
    refetchInterval: (query) =>
      query.state.data?.some((scan) => isScanActive(scan.status)) ? POLL_INTERVAL_MS : false,
  });

  const start = useMutation({
    mutationFn: () => api.startScan(siteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['site', siteId] });
      void qc.invalidateQueries({ queryKey: ['site-info', siteId] });
    },
  });

  if (site.isLoading) return <LiveStatus>{t.site.loading}</LiveStatus>;
  if (!site.data) return <p>{t.site.notFound}</p>;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          <Link key="sites" to="/">
            {t.layout.sites}
          </Link>,
        ]}
        current={site.data.name}
      />

      <PageHeader
        title={site.data.name}
        subtitle={
          <a href={site.data.url} className="font-mono text-sm text-muted">
            {hostOf(site.data.url)}
          </a>
        }
        actions={
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? t.site.queueing : t.site.run}
          </Button>
        }
      />

      <ScheduleCard site={site.data} />
      <CrawlCard site={site.data} />
      <IgnoreCard site={site.data} />
      <LoginCard site={site.data} />
      <ScenarioEditor key={site.data.id} site={site.data} />

      {start.isSuccess && <LiveStatus>{t.site.queued}</LiveStatus>}
      {start.isError && (
        <p role="alert" className="text-sm text-critical">
          {start.error.message}
        </p>
      )}

      {scans.isLoading && <LiveStatus>{t.site.loading}</LiveStatus>}

      {scans.data?.length === 0 && <p className="text-[15px] text-muted">{t.site.empty}</p>}

      {scans.data && scans.data.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-[15px]">
            <caption className="px-5 pt-4 pb-3 text-left text-sm text-muted">
              {t.site.caption}
            </caption>
            <thead>
              <tr className="border-y border-line bg-surface-alt">
                <th scope="col" aria-sort="descending" className={TH}>
                  {t.site.columns.date}
                </th>
                <th scope="col" className={TH}>
                  {t.site.columns.pages}
                </th>
                <th scope="col" className={TH}>
                  {t.site.columns.problems}
                </th>
                <th scope="col" className={TH}>
                  {t.site.columns.needsHuman}
                </th>
              </tr>
            </thead>
            <tbody>
              {scans.data.map((scan) => (
                <tr key={scan.id} className="border-b border-line-soft last:border-b-0">
                  <td className={TD}>
                    <Link
                      to="/scans/$scanId"
                      params={{ scanId: scan.id }}
                      className="font-semibold"
                    >
                      {formatDate(scan.createdAt, locale)}
                    </Link>
                    {scan.status !== 'done' && (
                      <div>
                        <StatusBadge status={scan.status} />
                      </div>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    {scan.pagesScanned}
                    {scan.pagesFailed > 0 && (
                      <span className="text-muted"> {t.site.pagesFailed(scan.pagesFailed)}</span>
                    )}
                  </td>
                  <td className={TD}>
                    {scan.status !== 'done' ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {scan.critical > 0 && (
                          <Badge tone="critical">{t.sites.critical(scan.critical)}</Badge>
                        )}
                        <span className="tabular-nums text-muted">
                          {t.sites.total(scan.uniqueProblems)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className={`${TD} font-semibold text-review tabular-nums`}>
                    {scan.status === 'done' ? (
                      scan.incomplete
                    ) : (
                      <span className="font-normal text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
