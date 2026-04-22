#!/usr/bin/env bash
# Args: $1 = DATABASE_URL for second origin (node B, relay_mvp_b)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DATABASE_URL_B="${1:?DATABASE_URL_B required}"
if [[ "${PREP:-}" == "1" ]]; then
  echo "→ db:migrate + db:seed (node B only)"
  DATABASE_URL="$DATABASE_URL_B" pnpm run db:migrate
  DATABASE_URL="$DATABASE_URL_B" pnpm run db:seed
fi
export PATH
exec pnpm exec concurrently -n o1,relay,idx,web1,o2,web2 -c blue,magenta,green,yellow,cyan,red \
  "ORIGIN_PORT=3001 pnpm run dev:origin" \
  "pnpm run dev:relay" \
  "pnpm run dev:indexer" \
  "pnpm run dev:web" \
  "env DATABASE_URL=\"$DATABASE_URL_B\" ORIGIN_PORT=3004 pnpm run dev:origin" \
  "pnpm run dev:web:peer"
