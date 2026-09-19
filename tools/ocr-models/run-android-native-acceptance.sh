#!/usr/bin/env bash
set -euo pipefail

phase=initialize
report_failure_phase() {
  status=$?
  if test "$status" -ne 0; then
    printf 'android_native_acceptance_failure_phase=%s\n' "$phase" >&2
    if test -n "${GITHUB_OUTPUT:-}"; then
      echo "status=$status" >> "$GITHUB_OUTPUT"
      echo "failure_phase=$phase" >> "$GITHUB_OUTPUT"
    fi
  fi
}
trap report_failure_phase EXIT

phase=resolve_tools
sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
emulator="$ANDROID_HOME/emulator/emulator"
adb="$ANDROID_HOME/platform-tools/adb"
test -x "$sdkmanager"
test -x "$emulator"
test -x "$adb"

phase=verify_sdk_revisions
system_image_revision=$("$sdkmanager" --list_installed 2>/dev/null | awk -F'|' '$1 ~ /system-images;android-35;google_apis;x86_64/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')
emulator_revision=$("$sdkmanager" --list_installed 2>/dev/null | awk -F'|' '$1 ~ /^[ \t]*emulator[ \t]*$/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')
test "$system_image_revision" = "9"
test "$emulator_revision" = "37.1.11"
phase=verify_device
test "$(timeout 5 "$adb" -s emulator-5554 get-state)" = "device"
test "$(timeout 5 "$adb" -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" = "1"

phase=emit_environment
: "${ImageOS:?Hosted runner image OS is unavailable}"
: "${ImageVersion:?Hosted runner image version is unavailable}"
: "${GITHUB_OUTPUT:?GitHub output path is unavailable}"
: "${RUNNER_TEMP:?Runner temporary path is unavailable}"
sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9_.:\[\]-' '_'; }
echo "runner_image=$(sanitize "${ImageOS}-${ImageVersion}")" >> "$GITHUB_OUTPUT"
echo "os_runtime=$(sanitize "android-api$(timeout 5 "$adb" -s emulator-5554 shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')-$(timeout 5 "$adb" -s emulator-5554 shell getprop ro.build.id 2>/dev/null | tr -d '\r')-$(timeout 5 "$adb" -s emulator-5554 shell getprop ro.build.version.incremental 2>/dev/null | tr -d '\r')")" >> "$GITHUB_OUTPUT"
echo "sdk_toolchain=$(sanitize "emulator-$emulator_revision")" >> "$GITHUB_OUTPUT"
echo "device=Android_Emulator_API_35_google_apis_x86_64" >> "$GITHUB_OUTPUT"
echo "native_image=$(sanitize "android-35-google_apis-x86_64-revision-${system_image_revision}-emulator-${emulator_revision}")" >> "$GITHUB_OUTPUT"

phase=isolate_airplane_mode
if ! timeout 30 "$adb" -s emulator-5554 shell cmd connectivity airplane-mode enable >/dev/null 2>&1; then
  timeout 30 "$adb" -s emulator-5554 shell settings put global airplane_mode_on 1 >/dev/null 2>&1
fi
phase=isolate_wifi
timeout 30 "$adb" -s emulator-5554 shell svc wifi disable >/dev/null 2>&1
phase=isolate_mobile_data
timeout 30 "$adb" -s emulator-5554 shell svc data disable >/dev/null 2>&1
phase=verify_network_controls
test "$(timeout 30 "$adb" -s emulator-5554 shell settings get global airplane_mode_on 2>/dev/null | tr -d '\r')" = "1"

phase=execute_flutter_test
status=0
node "$GITHUB_WORKSPACE/tools/ocr-models/bounded-process-capture.mjs" \
  --stdout="$RUNNER_TEMP/android-acceptance.log" \
  --stderr="$RUNNER_TEMP/android-acceptance.stderr.log" \
  --max-bytes=33554432 \
  -- flutter test integration_test/receipt_ocr_real_provider_test.dart -d emulator-5554 --timeout 6h --machine --no-pub || status=$?
echo "status=$status" >> "$GITHUB_OUTPUT"
echo "failure_phase=" >> "$GITHUB_OUTPUT"
phase=complete
exit 0
