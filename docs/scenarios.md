# Scan scenarios (develop)

Scenarios are prepared on `develop` for the next release. The published v0.4.0
image and the Action's pinned image do not execute scenarios. No release or
image update is included in this work.

A scenario opens a visited page in a fresh browser context, executes its named
steps and checks the resulting state with axe-core and the keyboard checker.
The initial page state is still checked separately. Each scenario starts again
from that page with the site's configured login, so one scenario cannot leave
local storage, focus or a dialog open for the next one.

## Configure a site

Open a site's settings and use **Scan scenarios** to add up to five scenarios,
with up to twenty ordered steps each. Give each scenario a unique name and an
exact pathname, such as `/settings` or `/contact.html`. Queries and fragments are
not part of the path. A scenario runs on each visited URL with that pathname;
it does not add a new URL to the crawl. Include its page in the crawl and page
limit. The scan summary lists scenarios whose pages were never reached.

| Step | Fields | What it checks or performs |
| --- | --- | --- |
| `click` | `selector` | Click a visible element |
| `fill` | `selector`, `value` | Fill a normal text field |
| `press` | `key` | Press a key such as `Tab`, `Shift+Tab` or `Escape` |
| `waitFor` | `selector`, `state` | Wait until the element is `visible` or `hidden` |
| `expectFocus` | `selector` | Check that the element already has focus |

Use CSS selectors that identify one element. Each step has a five-second limit;
the whole sequence has a thirty-second limit. A failed step stops the sequence,
and that state is not passed to the accessibility checkers. Leaving the site's
origin also stops the scenario.

Use a test environment and ordinary sample text: clicks and key presses can
submit a form or change data on the tested site. Fill values are stored in the
site configuration, but are omitted from recorded steps, JSON output and errors.
Page content and screenshots can still show text that the site renders.
Password fields are unsupported; use the existing Basic auth, cookie or header
settings to start in an authenticated session.

## Reproduce the dialog example

Serve `examples/scenarios` as the web root, then scan its root URL with
`examples/scenarios/scenarios.json`. **Dialog open** reveals an unnamed icon
button that is hidden in the initial state. **Dialog closes and returns focus**
presses Escape and checks focus on the trigger; the broken page fails this step.

Open the same URL with `?fixed` and scan it again. Both scenario sequences
execute successfully, the icon button has a name, and Escape returns focus to
the trigger. The pathname is still `/`, so the same scenarios apply.

From the repository root, after installing dependencies and Chromium:

```sh
pnpm --filter @tabwalk/server exec tsx src/ci.ts http://localhost:8080/ \
  --max-pages 1 --scenarios ../../examples/scenarios/scenarios.json \
  --fail-on none --report ../../tabwalk-report.json
```

The command runs from `apps/server`, so the JSON path is relative to that
directory. Use your static server of choice for the example directory.

## Read the evidence

A completed sequence means that its steps executed; it does not mean that
accessibility checks passed. Open a page in the report to see the executed
steps, failed step, expected and actual focus, violation count and keyboard
coverage for that state. Grouped findings list scenario names, source URLs and
steps alongside their usual element evidence.

The CLI records redacted runs in `scenarioRuns`, and unreachable configurations
in `unmatchedScenarios`. Failed or unmatched scenarios return exit code 2,
including when `--fail-on none` is selected. Accessibility thresholds and the
baseline retain their existing semantics for successfully checked states.

The Action has a `scenarios` input for a workspace-relative JSON path. It will
be usable when a scenario-capable image is published. Its entrypoint forwards
the option explicitly so the current pinned image fails instead of silently
ignoring a requested scenario.
