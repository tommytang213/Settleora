#!/usr/bin/env bash
set -euo pipefail

phase=initialize
device=""
network_environment_configured=false
read_simulator_environment() {
  local variable="$1"
  local value=""
  local read_status=0
  if value=$(xcrun simctl spawn "$device" launchctl getenv "$variable" 2>/dev/null); then
    :
  else
    read_status=$?
    test "$read_status" -eq 1 || return "$read_status"
  fi
  printf '%s' "$value"
}
report_failure_phase() {
  status=$?
  cleanup_status=0
  if "$network_environment_configured"; then
    unset SIMCTL_CHILD_DYLD_INSERT_LIBRARIES || cleanup_status=98
    unset SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION || cleanup_status=98
    unset SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE || cleanup_status=98
    unset SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED || cleanup_status=98
    if test -n "${SIMCTL_CHILD_DYLD_INSERT_LIBRARIES:-}" ||
        test -n "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION:-}" ||
        test -n "${SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE:-}" ||
        test -n "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED:-}"; then
      cleanup_status=98
    fi
    if ! xcrun simctl spawn "$device" launchctl unsetenv DYLD_INSERT_LIBRARIES >/dev/null 2>&1; then
      cleanup_status=98
    fi
    if ! xcrun simctl spawn "$device" launchctl unsetenv SETTLEORA_OCR_NETWORK_ISOLATION >/dev/null 2>&1; then
      cleanup_status=98
    fi
    if ! xcrun simctl spawn "$device" launchctl unsetenv SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED >/dev/null 2>&1; then
      cleanup_status=98
    fi
    persistent_dyld=""
    persistent_isolation=""
    persistent_constructor=""
    if ! persistent_dyld=$(read_simulator_environment DYLD_INSERT_LIBRARIES); then
      cleanup_status=98
    fi
    if ! persistent_isolation=$(read_simulator_environment SETTLEORA_OCR_NETWORK_ISOLATION); then
      cleanup_status=98
    fi
    if ! persistent_constructor=$(read_simulator_environment SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED); then
      cleanup_status=98
    fi
    if test -n "$persistent_dyld" || test -n "$persistent_isolation" ||
        test -n "$persistent_constructor"; then
      cleanup_status=98
    fi
    if test "$cleanup_status" -ne 0; then
      status=$cleanup_status
      phase=cleanup_network_isolation
    fi
  fi
  if test "$status" -ne 0; then
    printf 'ios_native_acceptance_failure_phase=%s\n' "$phase" >&2
    if test -n "${GITHUB_OUTPUT:-}"; then
      echo "status=$status" >> "$GITHUB_OUTPUT"
      echo "failure_phase=$phase" >> "$GITHUB_OUTPUT"
    fi
  fi
  trap - EXIT
  exit "$status"
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
network_deny_in_app="@executable_path/Frameworks/libSettleoraOcrNetworkDeny.dylib"
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

phase=verify_network_environment_clean
test -z "${SIMCTL_CHILD_DYLD_INSERT_LIBRARIES:-}"
test -z "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION:-}"
test -z "${SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE:-}"
test -z "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED:-}"
test -z "$(read_simulator_environment DYLD_INSERT_LIBRARIES)"
test -z "$(read_simulator_environment SETTLEORA_OCR_NETWORK_ISOLATION)"
test -z "$(read_simulator_environment SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED)"

phase=install_network_isolation
xcrun simctl spawn "$device" launchctl setenv DYLD_INSERT_LIBRARIES "$network_deny_in_app"
network_environment_configured=true
xcrun simctl spawn "$device" launchctl setenv SETTLEORA_OCR_NETWORK_ISOLATION socket_interpose_v1
export SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE="$network_deny"
export SIMCTL_CHILD_DYLD_INSERT_LIBRARIES="$network_deny_in_app"
export SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION=socket_interpose_v1
test "$SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE" = "$network_deny"
test "$SIMCTL_CHILD_DYLD_INSERT_LIBRARIES" = "$network_deny_in_app"
test "$SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION" = "socket_interpose_v1"
test "$(xcrun simctl spawn "$device" launchctl getenv DYLD_INSERT_LIBRARIES)" = "$network_deny_in_app"
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
