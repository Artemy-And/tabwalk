# Reflow and clipped content

This source fixture has a fixed-width reading line and a vertically clipped
paragraph. `?fixed` enables responsive wrapping and lets the full paragraph grow.
Both variants run without dependencies.

From the repository root, serve the example:

```sh
python -m http.server 8080 --directory examples/reflow --bind 127.0.0.1
```

In another terminal, run the CLI from `develop`:

```sh
pnpm --filter @tabwalk/server exec tsx src/ci.ts http://127.0.0.1:8080/ \
  --max-pages 1 --environments zoom-200,zoom-400 --report reflow-broken.json

pnpm --filter @tabwalk/server exec tsx src/ci.ts 'http://127.0.0.1:8080/?fixed' \
  --max-pages 1 --environments zoom-200,zoom-400 --report reflow-fixed.json
```

The broken variant produces `reflow-horizontal-scroll` and
`reflow-clipped-content` in `incomplete`, with geometry and environment context.
The fixed variant produces neither. Desktop alone skips these geometry checks.
Reflow observations require a human decision and do not block CI by themselves.
Confirm that the text is readable and that no equivalent accessible interaction
provides the missing content before recording a confirmed problem.

These profiles emulate layout at reduced CSS widths, not the browser's zoom menu.
The published v0.4.0 image does not contain this checker. See
[configuration, assessment and coverage limits](../../docs/review-and-environments.md).
