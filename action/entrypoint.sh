#!/bin/sh
set -eu

# Forward the requested feature as a flag too: older pinned images must fail
# explicitly rather than ignoring an INPUT_* variable they do not recognise.
if [ -n "${INPUT_SCENARIOS:-}" ]; then
  set -- "$@" --scenarios "$INPUT_SCENARIOS"
fi

exec node /app/apps/server/dist/ci.js "$@"
