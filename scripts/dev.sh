#!/usr/bin/env bash
# Run the whole Summertime stack locally:
#   Postgres → Daml build → Canton sandbox (JSON Ledger API) → bootstrap → dev registry →
#   API → worker → web.
#
# Usage:
#   scripts/dev.sh          start everything (idempotent; reuses running pieces)
#   scripts/dev.sh stop     stop everything started by this script
#   scripts/dev.sh status   show what is running
#
# Logs go to .run/*.log. Requires: dpm (Daml SDK 3.7.1), Node 22, PostgreSQL 16.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$ROOT/.run"
mkdir -p "$RUN"
export PATH="$HOME/.dpm/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgres://summertime:summertime@127.0.0.1:5432/summertime}"
export LEDGER_URL="${LEDGER_URL:-http://localhost:7575}"
export REGISTRY_URL="${REGISTRY_URL:-http://localhost:7590}"
export API_URL="${API_URL:-http://localhost:7580}"
# Demo pacing: publish progress every 15 s instead of hourly.
export PROGRESS_INTERVAL_SECONDS="${PROGRESS_INTERVAL_SECONDS:-15}"
export DEMO_MODE="${DEMO_MODE:-true}"

up() { curl -fsS -o /dev/null "$1" 2>/dev/null; }
wait_for() {
  local name=$1 url=$2 tries=${3:-60}
  for _ in $(seq 1 "$tries"); do up "$url" && return 0; sleep 2; done
  echo "✗ $name did not start (see $RUN/$name.log)" >&2
  exit 1
}
start_bg() {
  local name=$1; shift
  if [ -f "$RUN/$name.pid" ] && kill -0 "$(cat "$RUN/$name.pid")" 2>/dev/null; then
    echo "• $name already running"
    return
  fi
  (cd "$ROOT" && nohup "$@" >"$RUN/$name.log" 2>&1 & echo $! >"$RUN/$name.pid")
  echo "• started $name"
}

case "${1:-start}" in
  stop)
    for n in web worker api registry sandbox; do
      if [ -f "$RUN/$n.pid" ]; then
        pkill -TERM -P "$(cat "$RUN/$n.pid")" 2>/dev/null || true
        kill "$(cat "$RUN/$n.pid")" 2>/dev/null || true
        rm -f "$RUN/$n.pid"
        echo "• stopped $n"
      fi
    done
    exit 0
    ;;
  status)
    for pair in "sandbox $LEDGER_URL/v2/version" "registry $REGISTRY_URL/healthz" "api $API_URL/healthz" "web http://localhost:3000/"; do
      set -- $pair
      if up "$2"; then echo "✓ $1"; else echo "✗ $1"; fi
    done
    exit 0
    ;;
esac

# 1. PostgreSQL
if ! pg_isready -q -h 127.0.0.1 2>/dev/null; then
  if command -v pg_ctlcluster >/dev/null; then
    pg_ctlcluster 16 main start
    sleep 2
  else
    echo "✗ PostgreSQL is not running on 127.0.0.1:5432" >&2
    exit 1
  fi
fi
if ! psql "$DATABASE_URL" -c 'select 1' >/dev/null 2>&1; then
  echo "• creating database role and database (needs local postgres superuser)"
  su postgres -c "psql -qc \"CREATE ROLE summertime LOGIN PASSWORD 'summertime';\"" 2>/dev/null || true
  su postgres -c "psql -qc 'CREATE DATABASE summertime OWNER summertime;'" 2>/dev/null || true
fi
echo "✓ postgres"

# 2. Daml packages
(cd "$ROOT/daml" && dpm build --all >"$RUN/daml-build.log" 2>&1) || { echo "✗ daml build failed (see $RUN/daml-build.log)" >&2; exit 1; }
echo "✓ daml build"

# 3. Canton sandbox with Summertime and the reference token
if ! up "$LEDGER_URL/v2/version"; then
  start_bg sandbox dpm sandbox --json-api-port 7575 --ledger-api-port 6865 \
    --dar "$ROOT/daml/summertime-core/.daml/dist/summertime-core-0.1.0.dar" \
    --dar "$ROOT/daml/dars/splice-test-token-v1-1.0.2.dar"
  wait_for sandbox "$LEDGER_URL/v2/version" 90
fi
echo "✓ canton sandbox"

# 4. Parties, users, token registry, demo balances
(cd "$ROOT" && npm run --silent bootstrap -w @summertime/api >"$RUN/bootstrap.log" 2>&1) || { echo "✗ bootstrap failed (see $RUN/bootstrap.log)" >&2; exit 1; }
echo "✓ bootstrap"

# 5. Services
start_bg registry npm start -w @summertime/dev-registry
wait_for registry "$REGISTRY_URL/healthz"
start_bg api npm start -w @summertime/api
wait_for api "$API_URL/healthz"
start_bg worker npm start -w @summertime/worker
if [ -d "$ROOT/web/.next" ] && [ -z "${WEB_DEV:-}" ]; then
  start_bg web npm run start -w web
else
  start_bg web npm run dev -w web
fi
wait_for web "http://localhost:3000/" 90

echo
echo "Summertime is running: http://localhost:3000  (API $API_URL, ledger $LEDGER_URL)"
echo "Stop with: scripts/dev.sh stop"
