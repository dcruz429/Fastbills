#!/usr/bin/env bash
# Run only a purpose-created, socket-only PostgreSQL test cluster.
# Never source .env, inherit PG settings, or use the application's database.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_bin="$(command -v node)"
pg_bin="$(dirname -- "$(command -v initdb)")"
for executable in initdb postgres pg_ctl; do
  test -x "$pg_bin/$executable" || { echo "BLOCKED: local PostgreSQL tools unavailable"; exit 2; }
done
test -f "$root/node_modules/tsx/dist/cli.mjs"
home="$(mktemp -d /tmp/fb-call-pg-home.XXXXXX)"
chmod 700 "$home"
trap 'rmdir -- "$home" 2>/dev/null || true' EXIT
cd -- "$root"
# env -i is deliberate: no existing DATABASE_URL, PG*, session secrets,
# cloud credentials, npm configuration or personal HOME reaches the test.
env -i \
  PATH="$(dirname -- "$node_bin"):$pg_bin:/usr/bin:/bin" \
  HOME="$home" LANG=C LC_ALL=C TZ=UTC \
  "$node_bin" "$root/node_modules/tsx/dist/cli.mjs" \
  "$root/scripts/verify-call-supervision-postgres.ts" --pg-bin "$pg_bin"
