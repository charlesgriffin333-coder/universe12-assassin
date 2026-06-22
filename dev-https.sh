#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/.cert"
CERT="$CERT_DIR/quest-dev-cert.pem"
KEY="$CERT_DIR/quest-dev-key.pem"
PORT="${PORT:-8443}"

find_lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
  elif command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

LAN_IP="${LAN_IP:-$(find_lan_ip)}"
if [[ -z "$LAN_IP" ]]; then
  echo "Could not detect a LAN address. Run with LAN_IP=192.168.x.x ./scripts/dev-https.sh"
  exit 1
fi

mkdir -p "$CERT_DIR"

# Regenerate if the current Wi-Fi address is not covered by the certificate.
if [[ ! -f "$CERT" || ! -f "$KEY" ]] || ! openssl x509 -in "$CERT" -noout -text 2>/dev/null | grep -q "IP Address:$LAN_IP"; then
  echo "Generating a development certificate for ${LAN_IP}…"
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=Universe 12 Quest Dev" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$LAN_IP" \
    >/dev/null 2>&1
fi

echo
echo "Desktop: https://localhost:$PORT"
echo "Quest 3: https://$LAN_IP:$PORT"
echo "Both devices must be on the same Wi-Fi network. Press Ctrl+C to stop."
echo

exec python3 "$ROOT/scripts/https-server.py" \
  --port "$PORT" --cert "$CERT" --key "$KEY" --directory "$ROOT"
