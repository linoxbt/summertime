#!/usr/bin/env bash
# Spec 26.2: run a campaign across three Canton participants and check that no importer's
# participant receives another importer's data.
#
#   tests/multi-participant/run.sh
#
# Starts Canton (one sequencer, one mediator, participants summertime / importer-a /
# importer-b, all in memory), runs Summertime.Test.MultiParticipant with wall-clock time,
# runs check.ts, and stops Canton. Needs dpm (Daml SDK 3.7.1), Java 21 and Node 22.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
RUN="$ROOT/.run"
mkdir -p "$RUN"
export PATH="$HOME/.dpm/bin:$PATH"

(cd "$ROOT/daml" && dpm build --all >"$RUN/mp-build.log" 2>&1)
CANTON_JAR="$(ls "$HOME"/.dpm/cache/components/canton-open-source/*/lib/canton-open-source-*.jar | tail -1)"
D="$ROOT/daml"
export SUMMERTIME_DARS="$D/summertime-core/.daml/dist/summertime-core-0.1.0.dar,$D/dars/splice-test-token-v1-1.0.2.dar,$D/summertime-test/.daml/dist/summertime-test-0.1.0.dar"

java ${JAVA_OPTS:--Xmx2g} -jar "$CANTON_JAR" daemon -c "$HERE/canton.conf" --bootstrap "$HERE/bootstrap.canton" >"$RUN/mp-canton.log" 2>&1 &
CANTON=$!
trap 'kill $CANTON 2>/dev/null || true' EXIT
for _ in $(seq 1 120); do
  grep -q "MULTI-PARTICIPANT READY" "$RUN/mp-canton.log" 2>/dev/null && break
  kill -0 $CANTON 2>/dev/null || { echo "Canton exited (see $RUN/mp-canton.log)" >&2; exit 1; }
  sleep 2
done
grep -q "MULTI-PARTICIPANT READY" "$RUN/mp-canton.log" || { echo "Canton did not start" >&2; exit 1; }
echo "• network up: 3 participants, 1 synchronizer"

cat >"$RUN/mp-participants.json" <<'EOF'
{
  "default_participant": { "host": "localhost", "port": 5011 },
  "participants": {
    "summertime": { "host": "localhost", "port": 5011 },
    "importer-a": { "host": "localhost", "port": 5021 },
    "importer-b": { "host": "localhost", "port": 5031 }
  },
  "party_participants": {}
}
EOF

dpm script --dar "$D/summertime-test/.daml/dist/summertime-test-0.1.0.dar" \
  --script-name Summertime.Test.MultiParticipant:successAcrossParticipants \
  --participant-config "$RUN/mp-participants.json" --wall-clock-time \
  --output-file "$RUN/mp-result.json" >"$RUN/mp-script.log" 2>&1 || { echo "script failed (see $RUN/mp-script.log)" >&2; tail -20 "$RUN/mp-script.log" >&2; exit 1; }
echo "• campaign settled across participants"

cd "$ROOT" && npx tsx tests/multi-participant/check.ts "$RUN/mp-result.json"
