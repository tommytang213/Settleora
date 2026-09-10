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
esac

old_ifs=$IFS
IFS=.
set -- $bind_address
IFS=$old_ifs
[ "$#" -eq 4 ] || fail "the bind address must be an unambiguous IPv4 address"

for octet in "$@"; do
  case "$octet" in
    0|[1-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]) ;;
    *) fail "the bind address contains an invalid or ambiguous IPv4 octet" ;;
  esac
done

first=$1
second=$2
is_private=false
if [ "$first" -eq 10 ]; then
  is_private=true
elif [ "$first" -eq 172 ] && [ "$second" -ge 16 ] && [ "$second" -le 31 ]; then
  is_private=true
elif [ "$first" -eq 192 ] && [ "$second" -eq 168 ]; then
  is_private=true
fi
[ "$is_private" = true ] || fail "the bind address must be in an RFC1918 private range"

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

old_ifs=$IFS
IFS=.
set -- $hostname
IFS=$old_ifs
for label in "$@"; do
  [ -n "$label" ] || fail "the HTTPS hostname contains an empty label"
  [ "${#label}" -le 63 ] || fail "the HTTPS hostname contains an overlong label"
  case "$label" in
    -*) fail "the HTTPS hostname contains a label starting with a hyphen" ;;
    *-) fail "the HTTPS hostname contains a label ending with a hyphen" ;;
  esac
done

case "$https_port" in
  ''|*[!0-9]*) fail "SETTLEORA_API_HTTPS_PORT must be a numeric port" ;;
esac
[ "$https_port" -ge 1 ] && [ "$https_port" -le 65535 ] ||
  fail "SETTLEORA_API_HTTPS_PORT must be between 1 and 65535"

[ -f "$certificate_file" ] && [ -r "$certificate_file" ] && [ -s "$certificate_file" ] ||
  fail "the external TLS certificate chain file is missing, unreadable, or empty"
[ -f "$private_key_file" ] && [ -r "$private_key_file" ] && [ -s "$private_key_file" ] ||
  fail "the external TLS private key file is missing, unreadable, or empty"

printf '%s\n' "Settleora private HTTPS preflight passed."

if [ "${SETTLEORA_START_CADDY:-0}" = 1 ]; then
  # The official image gives /usr/bin/caddy a low-port file capability. Copying
  # it into the private tmpfs drops that capability so the proxy can run with
  # every container capability removed; this package listens on port 8443.
  cp "$(command -v caddy)" /tmp/settleora-caddy
  chmod 0555 /tmp/settleora-caddy
  exec /tmp/settleora-caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
fi
