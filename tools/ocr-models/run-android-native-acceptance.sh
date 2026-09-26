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
test "$(timeout 5 "$adb" -s emulator-5554 get-state 2>/dev/null)" = "device"
test "$(timeout 5 "$adb" -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1"

phase=emit_environment
: "${ImageOS:?Hosted runner image OS is unavailable}"
: "${ImageVersion:?Hosted runner image version is unavailable}"
: "${GITHUB_OUTPUT:?GitHub output path is unavailable}"
: "${RUNNER_TEMP:?Runner temporary path is unavailable}"
sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9_.:\[\]-' '_'; }
java_version_output=$(java -version 2>&1)
test -n "$java_version_output"
java_version_sha256=$(printf '%s' "$java_version_output" | sha256sum | awk '{print $1}')
test "${#java_version_sha256}" -eq 64
echo "runner_image=$(sanitize "${ImageOS}-${ImageVersion}")" >> "$GITHUB_OUTPUT"
echo "os_runtime=$(sanitize "android-api$(timeout 5 "$adb" -s emulator-5554 shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')-$(timeout 5 "$adb" -s emulator-5554 shell getprop ro.build.id 2>/dev/null | tr -d '\r')-$(timeout 5 "$adb" -s emulator-5554 shell getprop ro.build.version.incremental 2>/dev/null | tr -d '\r')")" >> "$GITHUB_OUTPUT"
echo "sdk_toolchain=$(sanitize "emulator-$emulator_revision-java-version-sha256-$java_version_sha256")" >> "$GITHUB_OUTPUT"
echo "device=Android_Emulator_API_35_google_apis_x86_64" >> "$GITHUB_OUTPUT"
echo "native_image=$(sanitize "android-35-google_apis-x86_64-revision-${system_image_revision}-emulator-${emulator_revision}")" >> "$GITHUB_OUTPUT"

phase=isolate_airplane_mode
if ! timeout 30 "$adb" -s emulator-5554 shell cmd connectivity airplane-mode enable >/dev/null 2>&1; then
  timeout 30 "$adb" -s emulator-5554 shell settings put global airplane_mode_on 1 >/dev/null 2>&1
fi
# API 35 can report command success before its global setting reflects the
# requested state. Pin the observable setting before verifying isolation.
timeout 30 "$adb" -s emulator-5554 shell settings put global airplane_mode_on 1 >/dev/null 2>&1
phase=isolate_wifi
timeout 30 "$adb" -s emulator-5554 shell svc wifi disable >/dev/null 2>&1
phase=isolate_mobile_data
if ! timeout 30 "$adb" -s emulator-5554 shell svc data disable >/dev/null 2>&1; then
  timeout 30 "$adb" -s emulator-5554 shell settings put global mobile_data 0 >/dev/null 2>&1
fi
timeout 30 "$adb" -s emulator-5554 shell settings put global mobile_data 0 >/dev/null 2>&1
phase=verify_airplane_mode
test "$(timeout 30 "$adb" -s emulator-5554 shell cmd connectivity airplane-mode 2>/dev/null | tr -d '\r')" = "enabled"
test "$(timeout 30 "$adb" -s emulator-5554 shell settings get global airplane_mode_on 2>/dev/null | tr -d '\r')" = "1"
phase=verify_mobile_data
test "$(timeout 30 "$adb" -s emulator-5554 shell settings get global mobile_data 2>/dev/null | tr -d '\r')" = "0"

phase=execute_flutter_test
status=0
node "$GITHUB_WORKSPACE/tools/ocr-models/bounded-process-capture.mjs" \
  --stdout="$RUNNER_TEMP/android-acceptance.log" \
  --stderr="$RUNNER_TEMP/android-acceptance.stderr.log" \
  --max-bytes=33554432 \
  --platform=android \
  --device=emulator-5554 || status=$?
echo "status=$status" >> "$GITHUB_OUTPUT"
echo "failure_phase=" >> "$GITHUB_OUTPUT"
phase=complete
exit 0
