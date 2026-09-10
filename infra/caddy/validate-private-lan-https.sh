#!/bin/sh
set -eu
set -f

fail() {
  printf '%s\n' "Settleora private HTTPS preflight failed: $1" >&2
  exit 1
}

bind_address=${SETTLEORA_API_BIND_ADDRESS:-}
hostname=${SETTLEORA_HTTPS_HOSTNAME:-}
https_port=${SETTLEORA_API_HTTPS_PORT:-}
certificate_file=${SETTLEORA_TLS_CERTIFICATE_FILE:-/run/settleora-tls/tls.crt}
private_key_file=${SETTLEORA_TLS_PRIVATE_KEY_FILE:-/run/settleora-tls/tls.key}

[ -n "$bind_address" ] || fail "SETTLEORA_API_BIND_ADDRESS is required"

case "$bind_address" in
  0.0.0.0|::|\[::\]|\*|localhost)
    fail "the bind address must select one private RFC1918 IPv4 interface"
    ;;
  .*|*.|*[!0-9.]*)
    fail "the bind address must be an unambiguous IPv4 address"
    ;;
esac

printf '%s\n' "$bind_address" | awk -F. '
  NF != 4 { exit 1 }
  {
    for (i = 1; i <= 4; i++) {
      if ($i !~ /^(0|[1-9][0-9]{0,2})$/ || $i + 0 > 255) exit 1
    }
    if ($1 == 10 ||
        ($1 == 172 && $2 >= 16 && $2 <= 31) ||
        ($1 == 192 && $2 == 168)) exit 0
    exit 1
  }
' || fail "the bind address must be an unambiguous RFC1918 IPv4 address"

[ -n "$hostname" ] || fail "SETTLEORA_HTTPS_HOSTNAME is required"
[ "${#hostname}" -le 253 ] || fail "the HTTPS hostname is too long"
printf '%s\n' "$hostname" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' ||
  fail "the HTTPS hostname is malformed"
printf '%s\n' "$hostname" | grep -q '\.' ||
  fail "the HTTPS hostname must be a fully qualified private name"
printf '%s\n' "$hostname" | grep -Eq '(^|\.)localhost$' &&
  fail "the HTTPS hostname must not be localhost"
printf '%s\n' "$hostname" | grep -Eq '(^|\.)example$|(^|\.)example\.(com|net|org)$|(^|\.)invalid$|(^|\.)test$' &&
  fail "the HTTPS hostname must not use a documentation-only suffix"

printf '%s\n' "$hostname" | awk -F. '
  {
    for (i = 1; i <= NF; i++) {
      if (length($i) == 0 || length($i) > 63 || $i ~ /^-/ || $i ~ /-$/) exit 1
    }
  }
' || fail "the HTTPS hostname contains an invalid label"

case "$https_port" in
  ''|*[!0-9]*) fail "SETTLEORA_API_HTTPS_PORT must be a numeric port" ;;
esac
[ "$https_port" -ge 1 ] && [ "$https_port" -le 65535 ] ||
  fail "SETTLEORA_API_HTTPS_PORT must be between 1 and 65535"

[ -f "$certificate_file" ] && [ -r "$certificate_file" ] && [ -s "$certificate_file" ] ||
  fail "the external TLS certificate chain file is missing, unreadable, or empty"
[ -f "$private_key_file" ] && [ -r "$private_key_file" ] && [ -s "$private_key_file" ] ||
  fail "the external TLS private key file is missing, unreadable, or empty"
if key_mode=$(stat -c '%a' "$private_key_file" 2>/dev/null); then
  :
elif key_mode=$(stat -f '%Lp' "$private_key_file" 2>/dev/null); then
  :
else
  fail "the external TLS private key permissions could not be inspected"
fi
other_mode=${key_mode#${key_mode%?}}
case "$other_mode" in
  0) ;;
  *) fail "the external TLS private key must not grant permissions to other users" ;;
esac

printf '%s\n' "Settleora private HTTPS preflight passed."

if [ "${SETTLEORA_START_CADDY:-0}" = 1 ]; then
  # The official image gives /usr/bin/caddy a low-port file capability. Copying
  # it into the private tmpfs drops that capability so the proxy can run with
  # every container capability removed; this package listens on port 8443.
  cp "$(command -v caddy)" /tmp/settleora-caddy
  chmod 0555 /tmp/settleora-caddy
  exec /tmp/settleora-caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
fi
