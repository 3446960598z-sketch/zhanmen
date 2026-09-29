#!/bin/bash
# Install the panel onto a Debian/Ubuntu machine that already has 3x-ui.
# Does not install or restart Xray by itself. Does not overwrite /etc/zhanmen/env.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/zhanmen
ENV_FILE=/etc/zhanmen/env

if [[ "$ROOT" == "$APP" ]]; then
  echo "run this from a git checkout, not from $APP" >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl python3

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if [[ ! -x /usr/local/x-ui/bin/xray-linux-amd64 ]]; then
  echo "3x-ui is not installed. Create the VLESS REALITY inbound first, then rerun." >&2
  echo "Do not downgrade the Xray core. This panel expects 26.9.9 or newer." >&2
  exit 1
fi

mkdir -p /etc/zhanmen /var/lib/zhanmen/pg
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/deploy/env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "wrote $ENV_FILE — fill it in, then rerun this script" >&2
  exit 2
fi

rm -rf "$APP"
mkdir -p "$APP"
tar -C "$ROOT" \
  --exclude node_modules \
  --exclude .vercel \
  --exclude .git \
  --exclude artifacts \
  --exclude screenshots \
  -cf - . | tar -C "$APP" -xf -
cd "$APP"
npm ci
npm run build

libs="$APP/.vercel/output/functions/__server.func/_libs"
mkdir -p "$libs"
find "$APP/node_modules/@electric-sql/pglite" -type f \( -name 'pglite.data' -o -name '*.wasm' \) -exec cp -n {} "$libs/" \;

install -m 644 "$ROOT/deploy/zhanmen.service" /etc/systemd/system/zhanmen.service
systemctl daemon-reload
systemctl enable zhanmen.service
systemctl restart zhanmen.service

for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:${PUBLIC_PORT:-8443}/"; then
    echo "panel is up"
    exit 0
  fi
  sleep 0.5
done

echo "panel did not answer. journalctl -u zhanmen -n 80" >&2
exit 1
