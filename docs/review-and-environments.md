# Human assessment and scan environments

These features are implemented on `develop`. The published v0.4.0 image and the
Action's pinned image await a separately authorised release. Run the server and
CLI from source to use them now; apply migrations through `0015` before starting
the updated server.

## Assess findings that need a human

Open a completed scan and select **Needs a human**. Expand **Assess this finding**
and choose a decision:

- **Confirmed problem**: human testing established a problem.
- **Acceptable result**: the tested result is acceptable; record your reasoning.
- **Not applicable**: the check does not apply to this element or context.

An optional comment can contain up to 2,000 characters. Tabwalk records the
signed-in reviewer's email and server timestamp. Editing updates these fields;
**Return to pending** removes the current decision. This stores the current
assessment, not a versioned audit log. Attribution survives account removal.

Findings are grouped by repeated markup. Assess the listed pages, scenario
states and environments before deciding for that group. A decision belongs to
this scan only: subsequent scans require a fresh assessment. Existing site-level
dismissals remain available for automatic findings; reopen a legacy dismissed
uncertain finding before assessing it.

Automatic violation totals retain their original meaning. Human-confirmed
problems have a separate count and report section. Pending counts decrease as
findings are assessed. Reports and browser-generated PDFs include automatic
problems, human-confirmed problems, acceptable/not-applicable decisions and the
remaining queue, with comments, reviewer and date. CSV includes these fields;
`pending` identifies unassessed uncertain findings.

Assessments do not establish whole-site WCAG conformance and are not inherited
by CLI reports, notification thresholds or future scans.

## Choose additional environments

Select extra environments in the site's settings. The next scan always checks
the desktop initial state and adds each selected profile:

| Profile | CSS viewport | Device scale | Forced colors |
| --- | --- | --- | --- |
| `desktop` (always) | 1280 × 720 | 1 | none |
| `mobile` | 390 × 844 | 1 | none |
| `zoom-200` | 640 × 360 | 2 | none |
| `forced-colors` | 1280 × 720 | 1 | active |

`mobile` is a narrow desktop browser window, without phone user agent or touch
emulation. `zoom-200` emulates desktop reflow at 200% by halving the CSS viewport
and doubling pixel density; it does not use the browser's zoom menu.
`forced-colors` enables Chromium's forced-color media emulation. Actual OS
contrast settings still need manual testing. These runs repeat the existing axe
and keyboard checks. They do not add a dedicated reflow/overflow rule or certify
zoom/contrast support.

Each initial state and matching scenario opens in a fresh context with the
site's existing login. Scenarios check their final states independently in each
environment. Three extras can make checking roughly four times longer than
desktop alone, depending on the page and scenarios. Each keyboard walk retains
its existing bounds. Choose fewer profiles to reduce scan time.

The scan stores its profile configuration. Page evidence stores each run's
duration, completion/failure, violation occurrences, keyboard coverage and
scenario steps. Grouped findings list environments and scenario contexts;
screenshots identify their source URL, state and environment. The tab-order
picture represents the desktop initial state.

An extra environment failure preserves baseline findings and remains visible
in dashboard and PDF. A baseline page-load failure remains a failed page.
Coverage can be partial even when a run completed. Older scans have no recorded
environment configuration or run evidence.

## Source CLI and Action inputs

```sh
pnpm --filter @tabwalk/server exec tsx src/ci.ts https://example.com \
  --environments mobile,zoom-200,forced-colors \
  --scenarios scenarios.json --report tabwalk-report.json
```

Repeated `--environments` flags are accepted and take precedence over the
environment variable. `INPUT_ENVIRONMENTS` and the Action
input `environments` accept comma-separated or newline-separated IDs. Unknown or
repeated profiles fail validation. JSON/Markdown identify parameters and results
for every run. Extra environment failures exit with code 2 even with `--fail-on
none`. Partial keyboard coverage is shown with its reasons.

The Action wrapper forwards the input as a flag so its older pinned image fails
explicitly instead of silently ignoring requested checks. No image or tag was
updated in this work.

## Verification

Browser regressions exercise responsive controls, forced-color-only findings,
actual CSS viewport/device scale/computed colors, fresh scenario storage and a
failed extra profile. PostgreSQL/API tests verify configuration, persistence,
assessment validation, scan isolation, automatic totals and CSV evidence.
Worker/CLI integration tests exercise selected profiles end to end. Dashboard
checks cover save/reset focus, filters, all eight languages and English/Russian
PDF export.
