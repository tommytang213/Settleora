#!/usr/bin/env bash
set -euo pipefail

phase=initialize
device=""
network_environment_configured=false
report_failure_phase() {
  status=$?
  if "$network_environment_configured"; then
    xcrun simctl spawn "$device" launchctl unsetenv DYLD_INSERT_LIBRARIES >/dev/null 2>&1 || true
    xcrun simctl spawn "$device" launchctl unsetenv SETTLEORA_OCR_NETWORK_ISOLATION >/dev/null 2>&1 || true
  fi
  if test "$status" -ne 0; then
    printf 'ios_native_acceptance_failure_phase=%s\n' "$phase" >&2
    if test -n "${GITHUB_OUTPUT:-}"; then
      echo "status=$status" >> "$GITHUB_OUTPUT"
      echo "failure_phase=$phase" >> "$GITHUB_OUTPUT"
    fi
  fi
}
trap report_failure_phase EXIT

phase=validate_environment
: "${GITHUB_WORKSPACE:?GitHub workspace is unavailable}"
: "${GITHUB_OUTPUT:?GitHub output path is unavailable}"
: "${RUNNER_TEMP:?Runner temporary path is unavailable}"
device="${1:-}"
test "$(printf '%s' "$device" | tr -cd '0-9A-Fa-f-')" = "$device"
test "${#device}" -eq 36

phase=build_network_isolation
host_arch=$(uname -m)
case "$host_arch" in
  arm64|x86_64) ;;
  *) exit 98 ;;
esac
network_deny="$RUNNER_TEMP/libSettleoraOcrNetworkDeny.dylib"
xcrun --sdk iphonesimulator clang \
  -arch "$host_arch" \
  -mios-simulator-version-min=18.0 \
  -dynamiclib \
  -fvisibility=hidden \
  -Wall \
  -Wextra \
  -Werror \
  "$GITHUB_WORKSPACE/tools/ocr-models/ios-simulator-network-deny.c" \
  -o "$network_deny"
codesign --force --sign - "$network_deny" >/dev/null
file "$network_deny" | grep -F 'Mach-O' >/dev/null

phase=install_network_isolation
xcrun simctl spawn "$device" launchctl setenv DYLD_INSERT_LIBRARIES "$network_deny"
xcrun simctl spawn "$device" launchctl setenv SETTLEORA_OCR_NETWORK_ISOLATION socket_interpose_v1
network_environment_configured=true
test "$(xcrun simctl spawn "$device" launchctl getenv DYLD_INSERT_LIBRARIES)" = "$network_deny"
test "$(xcrun simctl spawn "$device" launchctl getenv SETTLEORA_OCR_NETWORK_ISOLATION)" = "socket_interpose_v1"

phase=execute_flutter_test
status=0
node "$GITHUB_WORKSPACE/tools/ocr-models/bounded-process-capture.mjs" \
  --stdout="$RUNNER_TEMP/ios-acceptance.log" \
  --stderr="$RUNNER_TEMP/ios-acceptance.stderr.log" \
  --max-bytes=33554432 \
  --platform=ios \
  --device="$device" || status=$?
echo "status=$status" >> "$GITHUB_OUTPUT"
echo "failure_phase=" >> "$GITHUB_OUTPUT"
phase=complete
exit 0
