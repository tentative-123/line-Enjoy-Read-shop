#!/usr/bin/env bash
set -euo pipefail

# The Node launcher binds Railway's public PORT before the first database
# bootstrap. This prevents Railway's network healthcheck from timing out while
# Wrangler creates the initial local D1 database.
exec node scripts/railway-server.mjs
