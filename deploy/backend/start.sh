#!/usr/bin/env bash
# Start the Summertime backend inside one container:
#   exclusive lock → ledger (Canton on Postgres) → bootstrap → dev registry → worker → API.
#
# The ledger keeps its state in Postgres (canton_* databases next to the app database), so
# accounts, parties and contracts survive restarts and redeploys. Bootstrap only seeds a
# ledger that is new. If any long-running process exits, everything stops and the container
# exits, so the platform restarts it.
set -uo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
export API_PORT="${PORT:-8080}" API_HOST=0.0.0.0
export LEDGER_URL=http://127.0.0.1:7575 REGISTRY_URL=http://127.0.0.1:7590 REGISTRY_PORT=7590
export SUMMERTIME_DARS=/opt/summertime/summertime-core-0.1.0.dar,/opt/summertime/splice-test-token-v1-1.0.2.dar
cd /app

log() { echo "[start] $*"; }
pids=()
run() { # run NAME CMD... in the background with prefixed logs
  local name=$1; shift
  "$@" > >(sed -u "s/^/[$name] /") 2>&1 &
  pids+=($!)
}
stop_all() { kill "${pids[@]}" 2>/dev/null; wait 2>/dev/null; }
trap 'log "stopping"; stop_all; exit 0' TERM INT

# 1. Only one ledger may use the databases at a time (old and new deploys can overlap).
rm -f /tmp/ledger.lock
run lock node deploy/backend/ledger-lock.mjs /tmp/ledger.lock
until [ -f /tmp/ledger.lock ]; do
  kill -0 "${pids[0]}" 2>/dev/null || { log "could not take the ledger lock"; exit 1; }
  sleep 1
done

# 2. Canton's databases and connection settings.
exports="$(node deploy/backend/prepare-db.mjs)" || { log "database preparation failed"; stop_all; exit 1; }
eval "$exports"

# 3. The ledger.
log "starting the ledger"
java ${JAVA_OPTS:--Xms512m -Xmx2g} -jar /opt/summertime/canton.jar daemon \
  -c deploy/backend/canton.conf --bootstrap deploy/backend/bootstrap.canton \
  > >(tee /tmp/ledger.log | sed -u 's/^/[ledger] /') 2>&1 &
pids+=($!)
ledger_pid=$!

ready=""
for _ in $(seq 1 240); do
  if grep -q "SUMMERTIME LEDGER READY" /tmp/ledger.log 2>/dev/null && curl -fsS -o /dev/null http://127.0.0.1:7575/v2/version; then
    ready=1; break
  fi
  kill -0 "$ledger_pid" 2>/dev/null || { log "ledger exited"; stop_all; exit 1; }
  sleep 2
done
[ -n "$ready" ] || { log "ledger did not become ready"; stop_all; exit 1; }
log "ledger ready"

# 4. Seed a new ledger; leave an existing one alone. Packages can take a moment to be vetted.
for attempt in $(seq 1 12); do
  if node_modules/.bin/tsx services/api/src/bootstrap.ts 2>&1 | sed -u 's/^/[bootstrap] /'; [ "${PIPESTATUS[0]}" -eq 0 ]; then
    log "bootstrap done"; break
  fi
  [ "$attempt" -eq 12 ] && { log "bootstrap failed"; stop_all; exit 1; }
  log "bootstrap attempt $attempt failed; retrying"; sleep 5
done

# 5. Services.
run registry node_modules/.bin/tsx services/dev-registry/src/main.ts
for _ in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:7590/healthz && break; sleep 1; done
run worker node_modules/.bin/tsx services/worker/src/main.ts
run api node_modules/.bin/tsx services/api/src/main.ts
log "api starting on port $API_PORT"

wait -n "${pids[@]}"
log "a process exited; stopping the container"
stop_all
exit 1
