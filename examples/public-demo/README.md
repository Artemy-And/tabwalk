# Public demo

Live: [tabwalk-demo.pages.dev/demo/](https://tabwalk-demo.pages.dev/demo/).
Published 2026-10-08 from `develop`, with no application release.

The public report is a snapshot produced by the same checkers used by the worker
and GitHub Action. It includes the deliberately broken shop in `examples/demo-site`
and a keyboard trap with a fixed variant in `examples/keyboard-trap`.

From the repository root, after installing dependencies and Chromium:

```sh
pnpm --filter @tabwalk/server demo:build
```

This scans the local fixtures, verifies the keyboard trap and its fix, and
generates `apps/site/demo/index.html`, JSON, element pictures, tab order pictures
and a roughly 25-second WebM recording. It requires no database or login.

The HTML template is here; the stylesheet and progressive enhancements live in
`apps/site/demo`. The generated report is checked in so Cloudflare Pages can
serve it as static files. Regenerate it when scanner behaviour or fixtures change.
`report.json` records the generation time, viewport, source paths and coverage.

Serve `apps/site` as the web root and open `/demo/` to preview it. Opening the
HTML directly as a file will not resolve the site-wide fonts and styles.

The public static project is `tabwalk-demo`, with production branch `develop`.
After authenticating to its Cloudflare account, deploy directly without changing
Git branches:

```sh
wrangler pages deploy apps/site --project-name tabwalk-demo --branch develop
```

This copy is a mirror of the site: its canonical, Open Graph and sitemap
addresses point at `tabwalk.dev`, where the demo goes with the next release, so
search engines keep `tabwalk.dev` as the site. Verify public assets, video, filters and JSON after each upload. Publishing this
snapshot does not deploy or release the dashboard/server.

Printing includes the currently filtered findings and every page's keyboard
coverage. The deliberately broken fixture is shown in a recording so visitors
can explore the report without entering its focus trap.
