#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8080}"
DATA_DIR="${RAILWAY_DATA_DIR:-/data}"
PERSIST_DIR="$DATA_DIR/wrangler"
mkdir -p "$PERSIST_DIR"

node scripts/railway-env.mjs

# Bootstrap once per persistent volume. The marker is written only after both
# statements succeed, so a failed first deployment safely retries on restart.
if [[ ! -f "$DATA_DIR/.line-harness-initialized" ]]; then
  pnpm --filter worker exec wrangler d1 execute line-harness \
    --local --persist-to "$PERSIST_DIR" --file ../../packages/db/bootstrap.sql
  pnpm --filter worker exec wrangler d1 execute line-harness \
    --local --persist-to "$PERSIST_DIR" --file ../../packages/db/migrations/050_unmanned_cafe.sql
  touch "$DATA_DIR/.line-harness-initialized"
fi

exec pnpm --filter worker exec wrangler dev \
  --local --persist-to "$PERSIST_DIR" --ip 0.0.0.0 --port "$PORT" \
  --no-show-interactive-dev-session
