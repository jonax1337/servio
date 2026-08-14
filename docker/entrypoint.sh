#!/bin/sh
# Boot the containerised app: reconcile the DB schema, seed once per volume, then
# start Next. Uses `prisma db push` (matching the project's dev workflow, since the
# committed migrations have drifted) — reconcile migrations before a real prod run.
set -e

echo "[servio] applying schema (prisma db push)…"
pnpm prisma db push --skip-generate

# Seed exactly once per data volume (guard file lives on the mounted /data).
if [ ! -f /data/.seeded ]; then
  echo "[servio] seeding initial data…"
  pnpm prisma db seed && touch /data/.seeded || echo "[servio] seed skipped/failed (continuing)"
fi

echo "[servio] starting Next…"
exec "$@"
