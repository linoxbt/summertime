#!/usr/bin/env bash
# DevNet rehearsal: run Summertime against a participant that requires Ledger API tokens, the
# way a DevNet node (self-hosted or node-as-a-service) does.
#
#   - Canton with JWT auth on the Ledger API (canton.conf), synchronizer only;
#   - a mock OAuth server issuing client-credentials tokens that expire in 2 minutes;
#   - one service user with participant_admin, as a provider would hand out;
#   - Summertime in single-user mode (LEDGER_AUTH=oauth): uploads its packages through the
#     Ledger API, allocates parties, grants itself the rights, then the full API test and the
#     features test run against it.
#
# Usage: tests/devnet-rehearsal/run.sh   (needs Postgres and dpm, like scripts/dev.sh;
#        stop scripts/dev.sh first if memory is tight)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
RUN="$ROOT/.run"
mkdir -p "$RUN"
export PATH="$HOME/.dpm/bin:$PATH"
PIDS=()
rm -f "$RUN"/rh-onboard.log
# Each background piece runs in its own process group, so cleanup stops it and its children.
bg() { setsid "$@" & PIDS+=($!); }
cleanup() { for p in "${PIDS[@]}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; }
# Database admin: the local postgres superuser, or PG_ADMIN_URL (CI's service container).
pgadmin() { if [ -n "${PG_ADMIN_URL:-}" ]; then psql "$PG_ADMIN_URL" -qc "$1"; else su postgres -c "psql -qc \"$1\""; fi; }
trap cleanup EXIT

if ! pg_isready -q -h 127.0.0.1 2>/dev/null; then pg_ctlcluster 16 main start; sleep 2; fi
[ -n "${PG_ADMIN_URL:-}" ] || su postgres -c "psql -qc \"CREATE ROLE summertime LOGIN PASSWORD 'summertime';\"" >/dev/null 2>&1 || true
(cd "$ROOT/daml" && dpm build --all >"$RUN/rh-build.log" 2>&1)
CANTON_JAR="$(ls "$HOME"/.dpm/cache/components/canton-open-source/*/lib/canton-open-source-*.jar | tail -1)"

bg java ${JAVA_OPTS:--Xmx2g} -jar "$CANTON_JAR" daemon -c "$HERE/canton.conf" --bootstrap "$HERE/bootstrap.canton" >"$RUN/rh-canton.log" 2>&1
bg node "$HERE/mock-oauth.mjs" >"$RUN/rh-oauth.log" 2>&1
for _ in $(seq 1 120); do grep -q "REHEARSAL LEDGER READY" "$RUN/rh-canton.log" 2>/dev/null && break; sleep 2; done
grep -q "REHEARSAL LEDGER READY" "$RUN/rh-canton.log" || { echo "✗ Canton did not start (see $RUN/rh-canton.log)" >&2; exit 1; }
echo "✓ ledger up, Ledger API auth on"

LEDGER=http://localhost:7675
OAUTH=http://127.0.0.1:7695/token
token() { curl -sf -d grant_type=client_credentials -d "client_id=$1" -d "client_secret=$2" "$OAUTH" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).access_token))'; }

# 1. Without a token, or with a forged one, the ledger refuses.
[ "$(curl -s -o /dev/null -w '%{http_code}' $LEDGER/v2/parties)" = 401 ] || { echo "✗ ledger answered without a token" >&2; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad' $LEDGER/v2/parties)" = 401 ] || { echo "✗ ledger accepted a forged token" >&2; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -d grant_type=client_credentials -d client_id=summertime-svc -d client_secret=wrong $OAUTH)" = 401 ] || { echo "✗ token server accepted a wrong secret" >&2; exit 1; }
echo "✓ requests without a valid token are refused"

# 2. The provider's part: a service user with participant_admin.
ADMIN="$(token participant_admin admin-secret)"
curl -sf -X POST "$LEDGER/v2/users" -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"user":{"id":"summertime-svc","primaryParty":"","isDeactivated":false,"identityProviderId":""},"rights":[{"kind":{"ParticipantAdmin":{"value":{}}}}]}' >/dev/null
echo "✓ service user summertime-svc (participant_admin)"

# 3. Summertime, configured as it would be for a node provider.
pgadmin 'DROP DATABASE IF EXISTS summertime_rehearsal WITH (FORCE);' >/dev/null
pgadmin 'CREATE DATABASE summertime_rehearsal OWNER summertime;' >/dev/null
D="$ROOT/daml"
export LEDGER_URL=$LEDGER LEDGER_AUTH=oauth LEDGER_OAUTH_TOKEN_URL=$OAUTH LEDGER_OAUTH_CLIENT_ID=summertime-svc LEDGER_OAUTH_CLIENT_SECRET=svc-secret LEDGER_USER_ID=summertime-svc
export DATABASE_URL=postgres://summertime:summertime@127.0.0.1:5432/summertime_rehearsal
export API_PORT=7680 REGISTRY_PORT=7690 REGISTRY_URL=http://localhost:7690 PROGRESS_INTERVAL_SECONDS=15 OPS_INTERVAL_SECONDS=15
export UPLOAD_DARS="$D/summertime-core/.daml/dist/summertime-core-0.1.0.dar,$D/dars/splice-test-token-v1-1.0.2.dar"
(cd "$ROOT" && npm run --silent bootstrap -w @summertime/api >"$RUN/rh-bootstrap.log" 2>&1) || { echo "✗ bootstrap failed (see $RUN/rh-bootstrap.log)" >&2; tail -5 "$RUN/rh-bootstrap.log" >&2; exit 1; }
echo "✓ packages uploaded and parties allocated through the authenticated Ledger API"
unset UPLOAD_DARS

cd "$ROOT"
bg npm start -w @summertime/dev-registry >"$RUN/rh-registry.log" 2>&1
bg npm start -w @summertime/api >"$RUN/rh-api.log" 2>&1
bg npm start -w @summertime/worker >"$RUN/rh-worker.log" 2>&1
for _ in $(seq 1 60); do curl -sf http://localhost:7680/healthz >/dev/null && curl -sf http://localhost:7690/healthz >/dev/null && break; sleep 1; done
echo "✓ registry, API and worker running against it"

# 4. The full flows.
(cd "$ROOT" && API_URL=http://localhost:7680 npx tsx tests/e2e/api.e2e.ts) | tail -3
(cd "$ROOT" && API_URL=http://localhost:7680 npx tsx tests/e2e/features.e2e.ts) | tail -1

# 5. Onboarding as for a real network (onboard.ts), into a fresh database, twice: the second
#    run must change nothing. The instrument is the rehearsal's token, standing in for USDCx.
pgadmin 'DROP DATABASE IF EXISTS summertime_rehearsal_onboard WITH (FORCE);' >/dev/null
pgadmin 'CREATE DATABASE summertime_rehearsal_onboard OWNER summertime;' >/dev/null
ADMIN_PARTY="$(psql -tA "$DATABASE_URL" -c "SELECT value->>'registryAdmin' FROM system_config WHERE key = 'deployment'")"
onboard() {
  (cd "$ROOT" && DATABASE_URL=postgres://summertime:summertime@127.0.0.1:5432/summertime_rehearsal_onboard \
    NETWORK=devnet INSTRUMENT_ADMIN="$ADMIN_PARTY" INSTRUMENT_ID=USDCx DEMO_MODE=false \
    OPERATOR_EMAIL=ops@example.com OPERATOR_PASSWORD='rehearsal passphrase' OPERATOR_PARTY_HINT=rehearsal-operator \
    npx tsx services/api/src/onboard.ts >>"$RUN/rh-onboard.log" 2>&1)
}
onboard && onboard || { echo "✗ onboarding failed (see $RUN/rh-onboard.log)" >&2; tail -5 "$RUN/rh-onboard.log" >&2; exit 1; }
DEP="$(psql -tA postgres://summertime:summertime@127.0.0.1:5432/summertime_rehearsal_onboard -c "SELECT (value->>'network') || ' ' || (value->>'operatorParty') FROM system_config WHERE key = 'deployment'")"
OPS="$(psql -tA postgres://summertime:summertime@127.0.0.1:5432/summertime_rehearsal_onboard -c "SELECT count(*) FROM users WHERE role = 'operator'")"
case "$DEP" in "devnet rehearsal-operator::"*) ;; *) echo "✗ unexpected deployment record: $DEP" >&2; exit 1;; esac
[ "$OPS" = 1 ] || { echo "✗ expected one operator account, found $OPS" >&2; exit 1; }
echo "✓ real-network onboarding: package, operator party and deployment recorded; a second run changes nothing"

# 6. Tokens were renewed during the run, and every service stayed on the service user.
ISSUED="$(curl -sf http://127.0.0.1:7695/stats | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).issued))')"
[ "$ISSUED" -gt 4 ] || { echo "✗ expected token renewals, saw $ISSUED tokens" >&2; exit 1; }
echo "✓ $ISSUED tokens issued: renewed before expiry"
# Ledger-side auth failures only (the API's own 401s for signed-out users are expected).
if grep -qE 'failed \((401|403)\)|PERMISSION_DENIED|Ledger token request failed' "$RUN"/rh-{api,worker,registry,bootstrap,onboard}.log; then
  echo "✗ ledger auth errors in the service logs" >&2
  grep -E 'failed \((401|403)\)|PERMISSION_DENIED|Ledger token request failed' "$RUN"/rh-{api,worker,registry,bootstrap,onboard}.log | head -5 >&2
  exit 1
fi
echo "DEVNET REHEARSAL PASSED"
