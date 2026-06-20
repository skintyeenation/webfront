#!/bin/bash
# Seed / refresh the standard expense-tag catalog (the GL-coded categories the
# Expenses module ships with). Idempotent: upserts the 16 standard tags — fills
# in any that are missing and backfills the GL account on existing ones, without
# touching admin-renamed labels for non-standard tags.
#
# The api/ also auto-seeds these on boot (ExpensesService.seedTagsIfNeeded), so
# a normal deploy seeds a fresh DB on its own. Use this when you want to seed /
# backfill WITHOUT a redeploy, or against an arbitrary database.
#
# Keep the SEED list in sync with api/src/expense-tags.seed.ts.
#
# Usage:
#   bash scripts/seed-expense-tags.sh                  # local (api/.env DATABASE_URL)
#   DATABASE_URL=postgres://… bash scripts/seed-expense-tags.sh
#   bash scripts/seed-expense-tags.sh --prod           # pull DATABASE_URL from api-prod
#
# --prod resolves the URL from the api-prod Container App env (needs `az` login
# + a Postgres firewall rule for your IP — see scripts/grant-pg-firewall.sh).

set -uo pipefail
CYAN=$'\033[36m'; GRN=$'\033[32m'; RED=$'\033[31m'; RST=$'\033[0m'
say() { printf '%s▸%s %s\n' "$CYAN" "$RST" "$*"; }
die() { printf '  %s✗%s %s\n' "$RED" "$RST" "$*" >&2; exit 1; }

RG="${RG:-skintyee-prod-rg}"
CA_API_NAME="${CA_API_NAME:-api-prod}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" == "--prod" ]]; then
  say "Resolving DATABASE_URL from $CA_API_NAME…"
  DATABASE_URL="$(az containerapp show --name "$CA_API_NAME" --resource-group "$RG" \
    --query 'properties.template.containers[0].env[?name==`DATABASE_URL`].value' -o tsv 2>/dev/null || echo)"
  [[ -n "$DATABASE_URL" ]] || die "Couldn't read DATABASE_URL from $CA_API_NAME (az login? secret ref?)."
  export DATABASE_URL
fi

# Prisma client + .env (for the local/no-arg case) both live in api/.
cd "$ROOT/api" || die "api/ not found"

node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
// Mirror of api/src/expense-tags.seed.ts
const SEED = [
  ["travel","Travel","5010"],
  ["meals","Meals & Entertainment","5020"],
  ["fuel-mileage","Fuel / Mileage","5030"],
  ["accommodation","Accommodation","5040"],
  ["office-supplies","Office Supplies","5050"],
  ["equipment","Equipment","5060"],
  ["professional-services","Professional Services","5070"],
  ["training","Training & Conferences","5080"],
  ["utilities","Utilities","5090"],
  ["telecom","Telecom / Internet","5100"],
  ["postage-shipping","Postage & Shipping","5110"],
  ["bank-fees","Bank / Admin Fees","5120"],
  ["vehicle-repairs","Vehicle / Repairs","5130"],
  ["software","Subscriptions / Software","5140"],
  ["honoraria","Honoraria","5150"],
  ["miscellaneous","Miscellaneous","5900"],
];
(async () => {
  let created = 0, updated = 0;
  for (const [slug, label, glAccount] of SEED) {
    const before = await p.expenseTag.findUnique({ where: { slug } });
    await p.expenseTag.upsert({
      where: { slug },
      // Only backfill GL where missing; leave admin-edited labels/active alone.
      update: before && before.glAccount ? {} : { glAccount },
      create: { slug, label, glAccount, active: true },
    });
    if (before) updated++; else created++;
  }
  const total = await p.expenseTag.count();
  console.log(`  created ${created}, backfilled/kept ${updated} — ${total} expense tags total`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
' && printf '  %s✓%s Done.\n' "$GRN" "$RST"
