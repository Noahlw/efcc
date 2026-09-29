#!/bin/sh
set -eu

seed_sql_dir=$(mktemp -d "${TMPDIR:-/tmp}/efcc-seed-local.XXXXXX")
trap 'rm -rf "$seed_sql_dir"' EXIT HUP INT TERM

tsx tests/e2e/seed-dev-accounts.ts --reset > "$seed_sql_dir/reset.sql"
pnpm --filter web exec wrangler d1 execute efcc-identity --local --file="$seed_sql_dir/reset.sql"
tsx tests/e2e/seed-dev-accounts.ts --reset-legacy > "$seed_sql_dir/seed.sql"
pnpm --filter web exec wrangler d1 execute efcc-identity --local --file="$seed_sql_dir/seed.sql"
pnpm db:seed:disposable
