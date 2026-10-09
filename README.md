<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/tabwalk-logo-on-dark.png">
    <img src="docs/brand/tabwalk-logo.png" alt="Tabwalk" width="320">
  </picture>
</h1>

**Catch keyboard bugs before your users do.**

Tabwalk opens your site in a real browser and presses **Tab, Shift+Tab and
Escape** to find keyboard traps, invisible focus and controls hidden under
sticky content. It adds axe-core checks, groups repeated problems, and reports
what changed since the last scan.

Free, open source and self-hosted. Scheduled scans, Slack, Discord, ntfy and
email notifications help you catch regressions.

[Explore the demo](https://tabwalk-demo.pages.dev/demo/) · [Quick start](#quick-start) · [GitHub Action](#github-action)

<a href="https://tabwalk-demo.pages.dev/demo/">
  <img src="docs/screenshots/keyboard-demo.webp" alt="Watch a newsletter form trap keyboard focus, then see how removing its custom Tab handler restores native keyboard navigation" width="900">
</a>

The public demo is deployed at [tabwalk-demo.pages.dev/demo/](https://tabwalk-demo.pages.dev/demo/).
It includes a short recording, both versions of the keyboard example,
and a real scan of the demo shop with screenshots, Tab order and downloadable
JSON. No account needed. [Source and regeneration instructions](examples/public-demo/README.md).

On `develop`, uncertain findings now support human assessment with author,
date and comments, shown separately in reports and PDF. Optional narrow-screen,
200%/400% layout and forced-color checks record their environments, duration and
coverage. Narrow profiles also identify potential horizontal overflow and clipped
text/controls for human assessment. [Details and emulation limits](docs/review-and-environments.md).
These features are not in the published v0.4.0 image; no new release was made.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/report-dark.png">
  <img src="docs/screenshots/report-light.png" alt="A Tabwalk report for a demo shop: 17 unique problems on 81 elements, 8 critical, 4 that need a human, filters for new and fixed problems, and the findings table">
</picture>

One command to install. No Redis — the job queue lives in the same Postgres.

> Tabwalk collects evidence. It is not a legal opinion and it does not make
> your site compliant. Automated checks cover part of WCAG;
> other page states and manual accessibility checks still need a person. Uncertain
> automated results are flagged for review.

Named after the tab walk — pressing Tab through a page to see whether every
control can be reached and used without a mouse. It is the first thing an
accessibility tester does by hand, and Tabwalk does it on every page it scans.

## What it checks

Every page is opened in Chromium and checked twice:

- **axe-core** runs the WCAG 2.2 A and AA rules against the markup.
- **The tab walk** presses Tab and Shift+Tab through the page and follows the
  skip link, looking for what only shows up when you use the keyboard:

| Rule | WCAG | What it finds |
|---|---|---|
| `keyboard-trap` | 2.1.2 | Focus that cannot leave a widget, a form or a frame |
| `focus-visible` | 2.4.7 | Elements that take focus while nothing changes on the screen |
| `focus-obscured` | 2.4.11 | Focused elements hidden under a sticky header, a cookie banner or other fixed content |
| `skip-link-target` | 2.4.1 | Skip links that leave focus where it was |

A cookie banner or a pop-up that holds focus is closed the way a keyboard user
would close it, with Enter on its accept or close button, and the walk goes on
to the page behind it.

Every page also gets a picture of its Tab order: a screenshot with each stop
outlined, numbered and joined to the next one, plus the same stops as a list.
Open a page from the scan report to see it. Each problem in the report also
gets a picture of the first element that has it, outlined, under **Show the
element**; keyboard problems are pictured with the element focused. Pictures
are kept for the latest scan of each site.

**On develop, for the next release:** each page also records keyboard coverage:
visited stops, focus style samples checked, and reasons for a partial walk.
Time and step limits, blocked dialogs, frames and unverified focus styles are
visible in the page view, printed report and CI output. Older scans say that
coverage was not recorded. Coverage records the checks performed; it is not a
percentage of WCAG compliance.

**Also on develop:** named scan scenarios can open a menu or dialog, fill sample
text, press keys, wait for an element and check expected focus. Each state runs
in a fresh browser session and keeps its steps, findings and keyboard coverage.
Failed or unreached scenarios are visible in reports and fail CI with exit code
2. [Configuration, CLI usage and a broken/fixed dialog example](docs/scenarios.md).
The published v0.4.0 image does not include these features yet.

**Also on develop:** narrow states get geometry checks for horizontal reading
scroll and clipped content. Results require human assessment and include the
viewport and affected element; legitimate layout exceptions still need a person.
[Try the broken/fixed reflow example](examples/reflow/README.md).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/tab-order-dark.png">
  <img src="docs/screenshots/tab-order-light.png" alt="The Tab order of the demo shop's home page: 13 numbered stops joined by a line, from the logo and the menu through the product cards to the link in the footer">
</picture>

What a script cannot decide on its own, such as a loop that Shift+Tab can leave
or a text field whose only sign of focus is the caret, goes to **needs a human**
instead of the problem count.

Problems are WCAG 2.2 A/AA failures only. axe-core `best-practice` rules run
too, but they are shown apart as recommendations: they are not counted as
problems and never fail the GitHub Action.

Next to the WCAG criterion, each problem lists the matching clauses of
EN 301 549 (the standard behind the European Accessibility Act), RGAA (France)
and Section 508 (US federal sites), in the dashboard and in the CSV export.

For people who will not open the dashboard, **PDF report** on a scan gives a
page made for printing: the summary, each problem with its picture, an example
and how to fix it, then what needs a human, what was dismissed and the pages
checked. Print it, or save it as a PDF from the browser's print dialog.

## Quick start

```bash
git clone https://github.com/Artemy-And/tabwalk.git
cd tabwalk
cp .env.example .env      # Windows: copy .env.example .env
docker compose up -d
```

Open http://localhost:8080, create the admin account and add a site. It is
scanned within 15 minutes and then weekly; pick daily or off on the site's page,
or press **Run a scan** to check it right away.

The first person to open a new Tabwalk creates the admin account, so do it
before the dashboard is reachable by anyone else. Lost the password? This prints
a new one:

```bash
docker compose exec api node dist/reset-password.js you@example.com
```

To pin a version instead of `latest`, set `TABWALK_VERSION=0.4.0` in `.env`.

### Try it on the demo shop

`examples/demo-site` is a small shop with accessibility problems built in. Start it next to Tabwalk:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d
```

Then add `http://acmestore.example/` as a site and run a scan.

## GitHub Action

Check a site on every push or pull request, without running the dashboard:

```yaml
name: Accessibility
on: [pull_request]

jobs:
  tabwalk:
    runs-on: ubuntu-latest
    steps:
      - uses: Artemy-And/tabwalk@v0.4.0
        with:
          url: https://staging.example.com
          fail-on: serious
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: accessibility-report
          path: tabwalk-report.json
```

| Input | Default | Meaning |
|---|---|---|
| `url` | — | Site to check. Tabwalk starts here, reads the sitemap and follows links from page to page |
| `max-pages` | 50 | Page cap |
| `include` | — | Check only pages under these paths, one per line, like `/blog/` or `/docs/*` |
| `exclude` | — | Skip pages under these paths, one per line, like `/tag/` or `*?page=*` |
| `ignore-rules` | — | Leave out these rules, one per line, like `color-contrast` |
| `ignore-selectors` | — | Leave out problems inside elements matching these CSS selectors, one per line, like `#chat-widget` |
| `http-username`, `http-password` | — | HTTP Basic login, as most staging sites have. Pass them from secrets |
| `headers` | — | Headers sent to the site only, one `Name: value` per line, like `Authorization: Bearer …` |
| `cookies` | — | Cookies set before the first page opens, one `name=value` per line |
| `fail-on` | `critical` | Lowest impact that fails the job: `critical`, `serious`, `moderate`, `minor` or `none` |
| `baseline` | — | A report from an earlier run. Only problems it does not have fail the job |
| `comment` | `false` | Comment on the pull request with the results |
| `github-token` | `github.token` | Token to comment with |
| `report` | `tabwalk-report.json` | JSON report path in the workspace |

The job summary lists every problem; results that need a human are listed too
but never fail the job.

### Fail only on new problems

A site with problems already can still keep new ones out. Commit a report as
the baseline, and the job fails only on problems the baseline does not have.
The summary lists the new problems first, then the known ones and the ones no
longer found. With `comment: true` the same summary goes to the pull request
as one comment, edited on every run:

```yaml
name: Accessibility
on: [pull_request]

permissions:
  contents: read
  pull-requests: write

jobs:
  tabwalk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Artemy-And/tabwalk@v0.4.0
        with:
          url: https://staging.example.com
          fail-on: serious
          baseline: .github/tabwalk-baseline.json
          comment: true
```

To make the baseline, run the check once and commit its `tabwalk-report.json`
as `.github/tabwalk-baseline.json`; commit a newer report whenever you accept
the problems it has. Until the file is there, every problem counts. Pull
requests from forks get a read-only token, so they get the job summary but no
comment.

The same check runs locally:

```bash
docker run --rm -v "$PWD:/out" -w /out --user root \
  --entrypoint node ghcr.io/artemy-and/tabwalk-server \
  /app/apps/server/dist/ci.js https://example.com --fail-on serious
```

## Development with Docker

Builds the images from source:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

The first build takes a while — it downloads Chromium.

## Development without Docker

Requires Node.js 22+, pnpm and a running Postgres.

```bash
pnpm install
pnpm --filter @tabwalk/server exec playwright install chromium

cp .env.example .env
# point DATABASE_URL at localhost instead of db

pnpm db:migrate

pnpm --filter @tabwalk/server dev          # API on :3000
pnpm --filter @tabwalk/server dev:worker   # scan worker
pnpm --filter @tabwalk/web dev             # UI on :5173
```

## Try the scanner without a database

```bash
cd apps/server
npx tsx src/smoke.ts https://example.com
```

Prints findings with their fingerprints. Handy while working on checkers.

## How it works

```
                 ┌──────────┐
   browser ────► │   web    │  nginx: static files + /api proxy
                 └────┬─────┘
                      │
                 ┌────▼─────┐        ┌────────────┐
                 │   api    │───────►│  Postgres  │◄──┐
                 │  (Hono)  │        │  data +    │   │
                 └──────────┘        │  job queue │   │
                                     └────────────┘   │
                 ┌──────────┐                         │
                 │  worker  │─────────────────────────┘
                 │  Playwright + axe-core
                 └──────────┘
```

`api` and `worker` are the same image with different commands. The worker also
runs the schedule: every 15 minutes it queues a scan for each site that is due.

### Design decisions

| Decision | Why |
|---|---|
| Postgres, not MongoDB | One store for data and queue, real joins for reports |
| pg-boss, not BullMQ | No Redis: one container fewer, one failure mode fewer |
| Schedules in pg-boss too | No cron container; the schedule lives in the same Postgres |
| Checkers behind a `Checker` interface | Trackers and PCI checks plug in without a storage rewrite |
| axe-core hidden behind that interface | The engine belongs to a competitor (Deque); don't hard-wire it |
| Organizations in the schema from day one | Retrofitting multi-tenancy means rewriting every query |
| Finding fingerprints | One template mistake on 500 pages is one row, not 500 |
| `incomplete` results are stored | Competitors hide this bucket; it becomes the manual-review checklist |

### Layout

```
apps/server/src/
  api/app.ts            Hono routes
  auth/                 sign-in, sessions and password hashing
  db/schema.ts          Drizzle tables
  notify/               Slack, Discord, ntfy, webhook and email messages
  queue/boss.ts         pg-boss setup
  queue/schedule.ts     daily and weekly scans
  scanner/
    types.ts            Checker interface — the extension point
    crawl.ts            sitemaps from robots.txt, then links on every page it opens
    fingerprint.ts      collapses repeated findings
    checkers/
      axe.ts            the axe-core checker
      keyboard.ts       the tab walk: traps, invisible and hidden focus
      keyboard-page.ts  its helpers that run inside the page
    check.ts            opens one page and runs every checker
    runner.ts           orchestrates one scan
  ci.ts                 command-line check used by the GitHub Action
apps/web/src/
  router.tsx            pages and routes
  components/           accessible UI primitives
```

## Configuration

All of it lives in `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `MAX_PAGES_PER_SCAN` | 50 | Page cap per scan. A site can set a lower one on its page |
| `SCAN_CONCURRENCY` | 3 | Tabs at once. Each costs 300–500 MB |
| `PAGE_TIMEOUT_MS` | 30000 | Per-page load timeout |
| `CHROMIUM_EXECUTABLE` | — | Your own Chromium, if the bundled one won't start |
| `PUBLIC_URL` | — | The dashboard's address, e.g. `https://a11y.example.com`. Makes the sign-in cookie Secure |

### Which pages are checked

Tabwalk starts at the site's address, reads the sitemaps listed in `robots.txt`
(or `/sitemap.xml`), then follows the links on every page it opens until it
reaches the page cap. Links are read after the page's scripts have run, so a
single-page app without a sitemap is checked page by page. Links to files such
as PDFs and images are skipped.

On a site's page in the dashboard, **Pages to check** narrows the crawl with
paths, one per line. `*` stands for anything, and the site's own address is
always checked:

| Field | Example | Effect |
|---|---|---|
| Only check these paths | `/blog/` | Only addresses that start with `/blog/` |
| Skip these paths | `/tag/` and `*?page=*` | No tag pages and no paginated lists |

### Ignoring problems

For code you can't change, like a chat widget from another company, a site's
page has **Problems to ignore**: rule IDs (`color-contrast`) and CSS selectors
(`#chat-widget`). A scan leaves those problems out and doesn't store them, and
its report says what it left out. The GitHub Action takes the same lists as
`ignore-rules` and `ignore-selectors`.

### Dismissing a finding

In a report, **Dismiss** under a finding marks it as a false positive or as
won't fix, with an optional note. It stays in the data and is listed under
**Dismissed** with who dismissed it and when, but it no longer counts for any
scan of the site: not in totals, trends, comparisons or notifications.
**Reopen** brings it back.

### Pages behind a login

**Signing in** on a site's page takes an HTTP Basic user and password, headers
such as `Authorization: Bearer …`, and cookies copied from a browser. They go to
the site's own address only, never to scripts or images from other addresses.
Tabwalk keeps them in its Postgres as entered, like notification webhooks, and
never shows them in the dashboard again, so use an account that can only read.
A page that answers HTTP 401 is reported as needing a login instead of being
checked. Logging in through a form is not supported yet.

### Notifications

Under **Settings**, add a Slack, Discord or ntfy channel, a webhook that gets
JSON, or an email address. Tabwalk sends a message when a scan finds new
problems, when a site gets its first scan and when a scan fails. Set
`PUBLIC_URL` so every message links to its report. Email goes out through your
own SMTP server:

```bash
SMTP_URL=smtps://user:password@smtp.example.com:465
SMTP_FROM=Tabwalk <tabwalk@example.com>
```

### Single sign-on

Google Workspace, Microsoft Entra ID, Keycloak, Authentik or any other OpenID
Connect provider can sign people in next to the password:

```bash
PUBLIC_URL=https://a11y.example.com
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_LABEL=Sign in with Google
OIDC_ALLOWED_DOMAINS=example.com
```

Register `https://a11y.example.com/api/auth/oidc/callback` as the redirect URI.
People from `OIDC_ALLOWED_DOMAINS` get an account on their first sign-in; anyone
else needs an account with the same email first.

## Accessibility of Tabwalk itself

An accessibility tool has to pass its own check. Two failures that a 2026 audit
found to be common in dashboards are handled here deliberately:

- **Focus ring.** Popular component libraries ship a default that fails the 3:1
  contrast requirement. Tabwalk defines its own in `index.css`, verified in
  both light and dark themes.
- **Data table.** The most common dashboard failure: no `caption`, no
  `aria-sort`, sorting never announced. `IssuesTable.tsx` handles all three.

Run Tabwalk against its own dashboard before every release.

## Roadmap

Phase 2 adds the AI layer: plain-language reports, the `incomplete` bucket
turned into a manual-review checklist, alt-text judged by a vision model, and
suggested code fixes (suggested — never applied automatically).

Known MVP gaps: one organization where every account sees every site, and no
login through a form: pages behind a login need HTTP Basic, a header or a cookie.

## Community

- Questions and setup help: [Discussions](https://github.com/Artemy-And/tabwalk/discussions)
- Bugs and feature requests: [Issues](https://github.com/Artemy-And/tabwalk/issues/new/choose)
- Want to help? Read [CONTRIBUTING.md](CONTRIBUTING.md) and look for a
  [`good first issue`](https://github.com/Artemy-And/tabwalk/labels/good%20first%20issue)

## License

[AGPL-3.0](LICENSE). Use it, self-host it and change it freely; if you offer a modified
Tabwalk to others over a network, publish your changes under the same license.
