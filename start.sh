#!/usr/bin/env bash
# start.sh — macOS/Linux equivalent of start.cmd. Starts only the half that is down, installs
# node_modules if missing, opens http://localhost:4316. Logs/pids go to .satoru/run/ (the only runtime write location).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/.satoru/run"; mkdir -p "$RUN"
up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
command -v node >/dev/null || { echo "Node.js not found — install Node.js LTS (22.x)."; exit 1; }
node "$ROOT/scripts/card.mjs"
for d in "$ROOT" "$ROOT/server" "$ROOT/web"; do
  [ -d "$d/node_modules" ] || { echo "Installing dependencies in $d …"; (cd "$d" && npm install); }
done
start_half() { # name dir port
  if up "$3"; then echo "$1 already running on port $3 — leaving it alone."; return; fi
  echo "Starting $1 on port $3 …"
  # own session/process group (pgid = pid written to the pid file) so stop.sh can kill the whole tree;
  # all fds redirected so nothing keeps this script's stdout open.
  (cd "$2" && exec setsid bash -c 'echo $$ > "$1"; exec npm run dev' _ "$RUN/$1.pid") > "$RUN/$1.log" 2>&1 < /dev/null &
}
start_half server "$ROOT/server" 4317
start_half web "$ROOT/web" 4316
for i in $(seq 1 180); do up 4316 && up 4317 && break; sleep 0.5; done
if up 4316 && up 4317; then
  echo "up: http://localhost:4316"
  if [ -z "${NO_BROWSER:-}" ]; then (command -v xdg-open >/dev/null && xdg-open http://localhost:4316 >/dev/null 2>&1 &) || (command -v open >/dev/null && open http://localhost:4316) || true; fi
else
  echo "timed out — see $RUN/server.log and $RUN/web.log"; exit 1
fi
