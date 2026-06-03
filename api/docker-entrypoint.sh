#!/bin/sh
# Container entrypoint — keeps the Postgres schema in sync with the
# Prisma schema on every deploy, then starts the API server.
#
# Why `prisma db push` (not `migrate deploy`):
#   The api/ doesn't track migrations under prisma/migrations/. Schema
#   changes ride directly in prisma/schema.prisma + are applied on
#   deploy via `db push`, which is a fine fit for the POC + early
#   iteration phase. When we move to a hardened migration workflow,
#   swap this to `prisma migrate deploy`.
#
# Safety:
#   --skip-generate     don't regenerate the client (already done at
#                       image build, can't write to read-only fs anyway).
#   NO --accept-data-loss
#                       destructive changes (drop column, rename without
#                       @map, change required→optional) will fail this
#                       script and the container won't start — surfacing
#                       the drift loudly. For those, the dev applies
#                       the destructive push manually from their machine
#                       (see docs/features/documents-and-onboarding.md
#                       and bash scripts/setup-app-documents-blob.sh for
#                       firewall whitelist patterns).
#
# If DATABASE_URL isn't set we skip the push entirely and let the
# PrismaService fall back to in-memory mode — useful for ephemeral test
# containers / preview deploys.

set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  echo "▸ entrypoint: syncing Prisma schema (db push --skip-generate)…"
  if ! node_modules/.bin/prisma db push --skip-generate; then
    echo "✗ entrypoint: prisma db push failed."
    echo "  This is usually a destructive change Prisma won't apply without"
    echo "  --accept-data-loss. Apply manually from a dev machine, then redeploy."
    exit 1
  fi
  echo "  ✓ schema in sync"
else
  echo "▸ entrypoint: DATABASE_URL not set — skipping db push (in-memory mode)."
fi

echo "▸ entrypoint: starting api/ (node dist/main.js)…"
exec node dist/main.js
