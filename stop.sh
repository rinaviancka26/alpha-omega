#!/usr/bin/env bash
# stop.sh — frees ports 4316 and 4317 (kills the process groups started by start.sh, then anything still listening).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/.satoru/run"
listeners() { # pids listening on $1
  if command -v lsof >/dev/null; then lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null
  else ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2; fi
}
for n in server web; do
  if [ -f "$RUN/$n.pid" ]; then pid=$(cat "$RUN/$n.pid"); kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null; rm -f "$RUN/$n.pid"; fi
done
sleep 0.8
ME=$(ps -o pgid= -p $$ | tr -d ' ')
for p in 4316 4317; do for pid in $(listeners $p); do
  g=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  # kill the listener's whole process group (e.g. "tsx watch" would otherwise restart it), never our own group
  if [ -n "$g" ] && [ "$g" != "$ME" ]; then kill -TERM -- "-$g" 2>/dev/null; else kill -TERM "$pid" 2>/dev/null; fi
done; done
sleep 0.8
for p in 4316 4317; do for pid in $(listeners $p); do kill -KILL "$pid" 2>/dev/null; done; done
busy=""; for p in 4316 4317; do [ -n "$(listeners $p)" ] && busy="$busy $p"; done
if [ -n "$busy" ]; then echo "still listening:$busy"; exit 1; fi
echo "ports 4316 and 4317 are free."
