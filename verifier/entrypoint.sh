#!/bin/sh
# Link the baked client deps so the generated client can build offline (network is off in the sandbox).
if [ -d /work/web ] && [ ! -e /work/web/node_modules ]; then
  ln -s /deps/node_modules /work/web/node_modules 2>/dev/null || true
fi
exec node /runner/runner.mjs /work
