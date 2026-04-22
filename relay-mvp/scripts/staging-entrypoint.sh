#!/bin/sh
set -eu

cd /app

echo "→ wait for Postgres + migrate (retry)…"
i=0
ok=0
while [ "$i" -lt 45 ]; do
  if pnpm run db:migrate 2>/dev/null; then
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "db:migrate failed" >&2
  exit 1
fi

if [ "${RELAY_MVP_STAGING_SEED:-1}" = "1" ]; then
  echo "→ db:seed"
  pnpm run db:seed
fi

echo "→ start origin, relay, indexer, web (vite preview)…"
exec pnpm exec concurrently -k -n o,rel,idx,web -c blue,magenta,green,yellow \
  "node apps/origin/dist/index.js" \
  "node apps/relay/dist/index.js" \
  "node apps/indexer/dist/index.js" \
  "pnpm --filter @relay-mvp/web exec vite preview --host 0.0.0.0 --port 4173"
