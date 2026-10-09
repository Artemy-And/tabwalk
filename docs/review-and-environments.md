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
this scan only: subsequent scans require a fresh assessment. To stop a finding
from coming back on every scan, dismiss it as a false positive or as won't fix
instead: a dismissal belongs to the site, as it does for automatic findings.
Reopen a dismissed finding before assessing it.

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
| `zoom-400` | 320 × 180 | 4 | none |
| `forced-colors` | 1280 × 720 | 1 | active |

`mobile` is a narrow desktop browser window, without phone user agent or touch
emulation. `zoom-200` and `zoom-400` emulate desktop layout at 200% and 400% by
reducing the CSS viewport and increasing pixel density; they do not use the
browser's zoom menu. The 320 CSS px width corresponds to the vertical-scrolling
case in [WCAG 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
`forced-colors` enables Chromium's forced-color media emulation. Actual OS
contrast settings still need manual testing. These runs repeat the existing axe
and keyboard checks, plus the geometry checks below in narrow viewports.

Each initial state and matching scenario opens in a fresh context with the
site's existing login. Scenarios check their final states independently in each
environment. Four extras can make checking roughly five times longer than
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

## Review potential reflow and clipping problems

At widths of 640 CSS px or less, the `reflow` checker measures rendered text and
controls before the keyboard walk changes page state. Desktop-only scans do not
run this check. The initial state and every completed scenario are checked.

- `reflow-horizontal-scroll`: ordinary text or controls extend beyond a viewport
  with actual document overflow, or a text line is wider than a local scroll port.
- `reflow-clipped-content`: text or control bounds extend beyond an ancestor
  with `overflow: hidden` or `clip`, horizontally or vertically.
- `reflow-check-limited`: traversal reached a budget or encountered a rendered
  embedded frame whose contents were not measured.

All three are **Needs a human**, not automatic violations. Evidence includes CSS
viewport dimensions, document width and the clipping ancestor or local scroll
port. Check the complete reading/interaction flow and any equivalent way to
access the content before recording a decision. A WCAG reference identifies the
related criterion; it does not establish a failure.

Horizontal checks allow known two-dimensional content (tables, grids, maps/media
containers and code blocks) and carousel panels whose contents fit the scroll
port. Clipped text inside a table cell can still need review. These exclusions
are conservative: a person must verify table cells, custom widgets and other
layout exceptions. Decorative overflow alone, hidden/inert content, common
visually hidden labels, native input/textarea text scrolling and ignored subtrees
are excluded.
Open shadow roots are traversed; closed shadow roots and frame contents are not.

Each state has budgets of 5,000 visited nodes, two seconds of traversal, 50
geometry findings, 4,000 characters per text node and 80 ancestors. Reaching a
budget adds an explicit partial-coverage finding. These are traversal budgets,
not a hard browser execution deadline. Geometry cannot decide whether ellipses,
line clamping or off-screen panels have an accessible alternative; transforms,
vertical writing and browser text-only zoom require manual checks. No findings
does not certify reflow or resized-text support. Element pictures are illustrations
captured after the keyboard walk, not the original measurement state.

The dashboard, CSV and PDF use the existing assessment workflow. CLI JSON and
Markdown retain measurements and context for the first example in a group,
alongside its other tested environments/states. Pending reflow observations do
not enter automatic totals or fail accessibility thresholds.

Try the [broken/fixed fixture](../examples/reflow/README.md) from source.

## Source CLI and Action inputs

```sh
pnpm --filter @tabwalk/server exec tsx src/ci.ts https://example.com \
  --environments mobile,zoom-200,zoom-400,forced-colors \
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
failed extra profile. Reflow regressions cover broken/fixed layout, text/control
overflow, clipping, local scroll ports, tables, exclusions, open shadow roots and
explicit partial coverage. PostgreSQL/API tests verify configuration, persistence,
assessment validation, scan isolation, automatic totals and CSV evidence.
Worker/CLI integration tests exercise selected profiles end to end. Dashboard
checks cover save/reset focus, filters, all eight languages and English/Russian
PDF export.
