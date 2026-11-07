#!/bin/sh
set -eu
# Kernel-held lock survives PID reuse safely and releases automatically on exit.
# All instances must share the same /state volume; run one replica only.
if [ "${COMFLOW_CONTAINER_LOCKED:-}" != "1" ]; then
  exec flock --no-fork --nonblock /state/container.lock env COMFLOW_CONTAINER_LOCKED=1 "$0" "$@"
fi
if [ "${1:-}" = "--rehearsal" ]; then
  shift
  exec node worker/node_modules/tsx/dist/cli.mjs --tsconfig worker/tsconfig.json worker/src/hostingRehearsal.ts "$@"
fi
exec node worker/node_modules/tsx/dist/cli.mjs --tsconfig worker/tsconfig.json worker/src/index.ts "$@"
