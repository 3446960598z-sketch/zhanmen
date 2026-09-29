#!/bin/bash
set -eu
cd /opt/zhanmen
export PGLITE_DATA_DIR="${PGLITE_DATA_DIR:-/var/lib/zhanmen/pg}"
export PATH="/opt/zhanmen/node_modules/.bin:/usr/local/bin:${PATH}"
mkdir -p "$PGLITE_DATA_DIR"
node scripts/with-app-env.mjs vite preview --host 127.0.0.1 --port 8081 &
preview_pid=$!
node scripts/public-entry.mjs &
proxy_pid=$!
cleanup() {
  kill "$preview_pid" "$proxy_pid" 2>/dev/null || true
}
trap cleanup TERM INT
wait -n
cleanup
wait || true
