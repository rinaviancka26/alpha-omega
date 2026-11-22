#!/usr/bin/env bash
# Restarts the dev daemon against the proof sandbox (ALPHA_OMEGA_ROOT) and waits for health.
pkill -f "tsx src/index.ts" 2>/dev/null; pkill -f "tsx watch src/index.ts" 2>/dev/null; sleep 0.8
(cd "$(dirname "$0")/../../server" && ALPHA_OMEGA_ROOT="${AO_SANDBOX:-/tmp/claude-0/aoroot}" exec setsid npx tsx src/index.ts) > /tmp/claude-0/server.log 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -sf http://localhost:4317/api/health >/dev/null && echo "server up (root=${AO_SANDBOX:-/tmp/claude-0/aoroot})" && exit 0; sleep 0.25; done
echo "server failed"; cat /tmp/claude-0/server.log; exit 1
