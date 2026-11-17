#!/usr/bin/env bash
# Start the Summertime backend inside one container:
#   Canton sandbox → bootstrap → dev registry → worker → API (public, on $PORT).
# If any long-running process exits, everything stops and the container exits, so the
# platform restarts it from a clean ledger.
set -uo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
export API_PORT="${PORT:-8080}" API_HOST=0.0.0.0
export LEDGER_URL=http://127.0.0.1:7575 REGISTRY_URL=http://127.0.0.1:7590 REGISTRY_PORT=7590
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

log "starting Canton sandbox"
java ${JAVA_OPTS:--Xms512m -Xmx2g} -jar /opt/summertime/canton.jar sandbox \
  --json-api-port 7575 --ledger-api-port 6865 \
  --dar /opt/summertime/summertime-core-0.1.0.dar \
  --dar /opt/summertime/splice-test-token-v1-1.0.2.dar \
  > >(tee /tmp/sandbox.log | sed -u 's/^/[sandbox] /') 2>&1 &
pids+=($!)

ready=""
for _ in $(seq 1 180); do
  if grep -q "Canton sandbox is ready" /tmp/sandbox.log 2>/dev/null && curl -fsS -o /dev/null http://127.0.0.1:7575/v2/version; then
    ready=1; break
  fi
  kill -0 "${pids[0]}" 2>/dev/null || { log "sandbox exited"; exit 1; }
  sleep 2
done
[ -n "$ready" ] || { log "sandbox did not become ready"; stop_all; exit 1; }
log "sandbox ready"

# Packages can take a moment to be vetted after the sandbox reports ready.
for attempt in $(seq 1 12); do
  if node_modules/.bin/tsx services/api/src/bootstrap.ts 2>&1 | sed -u 's/^/[bootstrap] /'; [ "${PIPESTATUS[0]}" -eq 0 ]; then
    log "bootstrap done"; break
  fi
  [ "$attempt" -eq 12 ] && { log "bootstrap failed"; stop_all; exit 1; }
  log "bootstrap attempt $attempt failed; retrying"; sleep 5
done

run registry node_modules/.bin/tsx services/dev-registry/src/main.ts
for _ in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:7590/healthz && break; sleep 1; done
run worker node_modules/.bin/tsx services/worker/src/main.ts
run api node_modules/.bin/tsx services/api/src/main.ts
log "api starting on port $API_PORT"

wait -n "${pids[@]}"
log "a process exited; stopping the container"
stop_all
exit 1
