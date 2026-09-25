# Skiplink

**See what's actually broken. Weekly. On your own server.**

Self-hosted accessibility monitoring. Skiplink crawls your site, checks every
page with axe-core, collapses repeated problems into one row, and shows you a
report you can hand to a client.

One command to install. No Redis — the job queue lives in the same Postgres.

> Skiplink collects evidence. It is not a legal opinion and it does not make
> your site compliant. Automated checks catch less than half of WCAG problems;
> the rest needs a human. We show you which parts those are.

Named after the skip link — the "skip to content" link at the top of a page
required by WCAG 2.4.1. Skiplink's own interface has one, of course.

## Quick start

```bash
git clone https://github.com/Artemy-And/skiplink.git
cd skiplink
cp .env.example .env      # Windows: copy .env.example .env
docker compose up -d
```

Open http://localhost:8080, add a site, press **Run a scan**.

To pin a version instead of `latest`, set `SKIPLINK_VERSION=0.1.0` in `.env`.

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
pnpm --filter @skiplink/server exec playwright install chromium

cp .env.example .env
# point DATABASE_URL at localhost instead of db

pnpm db:migrate

pnpm --filter @skiplink/server dev          # API on :3000
pnpm --filter @skiplink/server dev:worker   # scan worker
pnpm --filter @skiplink/web dev             # UI on :5173
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

`api` and `worker` are the same image with different commands.

### Design decisions

| Decision | Why |
|---|---|
| Postgres, not MongoDB | One store for data and queue, real joins for reports |
| pg-boss, not BullMQ | No Redis: one container fewer, one failure mode fewer |
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
  scanner/
    types.ts            Checker interface — the extension point
    crawl.ts            sitemap.xml, falling back to link discovery
    fingerprint.ts      collapses repeated findings
    checkers/axe.ts     the axe-core checker
    runner.ts           orchestrates one scan
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

## Accessibility of Skiplink itself

An accessibility tool has to pass its own check. Two failures that a 2026 audit
found to be common in dashboards are handled here deliberately:

- **Focus ring.** Popular component libraries ship a default that fails the 3:1
  contrast requirement. Skiplink defines its own in `index.css`, verified in
  both light and dark themes.
- **Data table.** The most common dashboard failure: no `caption`, no
  `aria-sort`, sorting never announced. `IssuesTable.tsx` handles all three.

Run Skiplink against its own dashboard before every release.

## Roadmap

Phase 2 adds the AI layer: plain-language reports, the `incomplete` bucket
turned into a manual-review checklist, alt-text judged by a vision model, and
suggested code fixes (suggested — never applied automatically).

Known MVP gaps: no authentication (a single organization), pages behind a login
are not scanned, and only WCAG A/AA rules run — `best-practice` rules are off.

## License

[MIT](LICENSE)
