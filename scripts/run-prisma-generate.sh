#!/usr/bin/env bash
# Runs prisma generate from apps/web; ignores stray npm CLI args (e.g. pasted comment text).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"
node "$ROOT/scripts/require-node.mjs"
exec npx prisma generate
