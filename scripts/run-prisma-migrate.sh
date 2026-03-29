#!/usr/bin/env bash
# MongoDB: Prisma Migrate is not supported; sync schema with `db push`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"
node "$ROOT/scripts/require-node.mjs"
exec npx prisma db push
