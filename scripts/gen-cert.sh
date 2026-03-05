#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gen-cert.sh — Generate a self-signed TLS certificate for Tidslinjal
#
# Usage:
#   ./scripts/gen-cert.sh [OPTIONS]
#
# Options:
#   --days N       Certificate validity in days (default: 3650 = 10 years)
#   --host HOSTS   Comma-separated hostnames/IPs for Subject Alternative Names
#                  (default: localhost,127.0.0.1,::1)
#   --out DIR      Output directory (default: certs/)
#   --key-size N   RSA key size in bits (default: 2048)
#
# Output:
#   certs/server.crt   — Self-signed certificate (PEM)
#   certs/server.key   — Private key (PEM)
#
# Start Tidslinjal with TLS:
#   ./tidslinjal --tls-cert certs/server.crt --tls-key certs/server.key
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DAYS=3650
HOSTS="localhost,127.0.0.1,::1"
OUT_DIR="certs"
KEY_SIZE=2048

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --days)    DAYS="$2";     shift 2 ;;
    --host)    HOSTS="$2";    shift 2 ;;
    --out)     OUT_DIR="$2";  shift 2 ;;
    --key-size) KEY_SIZE="$2"; shift 2 ;;
    --help|-h)
      head -20 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Ensure openssl is available
if ! command -v openssl &>/dev/null; then
  echo "ERROR: openssl is not installed. Install it and try again." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
CERT="$OUT_DIR/server.crt"
KEY="$OUT_DIR/server.key"

# Build Subject Alternative Names
SAN_LIST=""
IFS=',' read -ra ADDRS <<< "$HOSTS"
for addr in "${ADDRS[@]}"; do
  addr="${addr// /}"   # trim spaces
  if [[ "$addr" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$addr" =~ :[0-9a-fA-F:]+ ]]; then
    SAN_LIST="${SAN_LIST:+$SAN_LIST,}IP:$addr"
  else
    SAN_LIST="${SAN_LIST:+$SAN_LIST,}DNS:$addr"
  fi
done

echo "Generating self-signed TLS certificate..."
echo "  Validity : ${DAYS} days"
echo "  SANs     : ${SAN_LIST}"
echo "  Key size : ${KEY_SIZE} bits"
echo "  Output   : ${CERT} / ${KEY}"

openssl req -x509 -nodes \
  -newkey "rsa:${KEY_SIZE}" \
  -keyout "$KEY" \
  -out "$CERT" \
  -days "$DAYS" \
  -subj "/CN=tidslinjal/O=Tidslinjal/C=SE" \
  -addext "subjectAltName=${SAN_LIST}" \
  2>/dev/null

chmod 600 "$KEY"

echo ""
echo "Certificate generated successfully."
echo ""
echo "Start Tidslinjal with HTTPS:"
echo "  ./tidslinjal --tls-cert ${CERT} --tls-key ${KEY}"
echo ""
echo "To trust this certificate in your browser (Linux/Chrome):"
echo "  certutil -d sql:\$HOME/.pki/nssdb -A -t 'CT,,' -n tidslinjal -i ${CERT}"
echo ""
echo "To trust on macOS:"
echo "  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${CERT}"
echo ""
echo "NOTE: Browsers will show a security warning for self-signed certificates."
echo "      For production, use a certificate from Let's Encrypt or another CA."
