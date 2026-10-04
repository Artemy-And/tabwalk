<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/tabwalk-logo-on-dark.png">
    <img src="docs/brand/tabwalk-logo.png" alt="Tabwalk" width="320">
  </picture>
</h1>

**See what's actually broken. On your own server.**

Self-hosted accessibility monitoring. Tabwalk crawls your site every day or
every week, checks each page with axe-core, presses Tab through it, collapses
repeated problems into one row, and shows what is new and what got fixed since
the last scan.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/report-dark.png">
  <img src="docs/screenshots/report-light.png" alt="A Tabwalk report for a demo shop: 13 unique problems on 66 elements, 6 critical, 3 that need a human, filters for new and fixed problems, and the findings table">
</picture>

One command to install. No Redis — the job queue lives in the same Postgres.

> Tabwalk collects evidence. It is not a legal opinion and it does not make
> your site compliant. Automated checks catch less than half of WCAG problems;
> the rest needs a human. We show you which parts those are.

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

What a script cannot decide on its own, such as a loop that Shift+Tab can leave
or a text field whose only sign of focus is the caret, goes to **needs a human**
instead of the problem count.

Problems are WCAG 2.2 A/AA failures only. axe-core `best-practice` rules run
too, but they are shown apart as recommendations: they are not counted as
problems and never fail the GitHub Action.

## Quick start

```bash
git clone https://github.com/Artemy-And/tabwalk.git
cd tabwalk
cp .env.example .env      # Windows: copy .env.example .env
docker compose up -d
```

Open http://localhost:8080 and add a site. It is scanned within 15 minutes and
then weekly; pick daily or off on the site's page, or press **Run a scan** to
check it right away.

To pin a version instead of `latest`, set `TABWALK_VERSION=0.2.2` in `.env`.

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
      - uses: Artemy-And/tabwalk@v0.2.2
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
| `url` | — | Site to check; pages come from its sitemap or home page links |
| `max-pages` | 50 | Page cap |
| `fail-on` | `critical` | Lowest impact that fails the job: `critical`, `serious`, `moderate`, `minor` or `none` |
| `report` | `tabwalk-report.json` | JSON report path in the workspace |

The job summary lists every problem; results that need a human are listed too
but never fail the job. The same check runs locally:

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
  db/schema.ts          Drizzle tables
  queue/boss.ts         pg-boss setup
  queue/schedule.ts     daily and weekly scans
  scanner/
    types.ts            Checker interface — the extension point
    crawl.ts            sitemap.xml, falling back to link discovery
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
| `MAX_PAGES_PER_SCAN` | 50 | Page cap per scan |
| `SCAN_CONCURRENCY` | 3 | Tabs at once. Each costs 300–500 MB |
| `PAGE_TIMEOUT_MS` | 30000 | Per-page load timeout |
| `CHROMIUM_EXECUTABLE` | — | Your own Chromium, if the bundled one won't start |

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

Known MVP gaps: no authentication (a single organization) and pages behind a
login are not scanned.

## Community

- Questions and setup help: [Discussions](https://github.com/Artemy-And/tabwalk/discussions)
- Bugs and feature requests: [Issues](https://github.com/Artemy-And/tabwalk/issues/new/choose)
- Want to help? Read [CONTRIBUTING.md](CONTRIBUTING.md) and look for a
  [`good first issue`](https://github.com/Artemy-And/tabwalk/labels/good%20first%20issue)

## License

[AGPL-3.0](LICENSE). Use it, self-host it and change it freely; if you offer a modified
Tabwalk to others over a network, publish your changes under the same license.
