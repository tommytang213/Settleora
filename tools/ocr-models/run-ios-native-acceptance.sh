#!/usr/bin/env bash
set -euo pipefail

phase=initialize
device=""
network_environment_configured=false
network_link_configured=false
network_project_configured=false
app_delegate_configured=false
debug_config=""
network_config_backup=""
runner_project=""
runner_project_backup=""
app_delegate=""
app_delegate_backup=""
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
  if "$network_link_configured"; then
    if ! cp -p "$network_config_backup" "$debug_config" ||
        ! cmp -s "$network_config_backup" "$debug_config"; then
      cleanup_status=98
    fi
  fi
  if "$network_project_configured"; then
    if ! cp -p "$runner_project_backup" "$runner_project" ||
        ! cmp -s "$runner_project_backup" "$runner_project"; then
      cleanup_status=98
    fi
  fi
  if "$app_delegate_configured"; then
    if ! cp -p "$app_delegate_backup" "$app_delegate" ||
        ! cmp -s "$app_delegate_backup" "$app_delegate"; then
      cleanup_status=98
    fi
  fi
  if "$network_environment_configured"; then
    unset SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION || cleanup_status=98
    unset SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE || cleanup_status=98
    unset SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED || cleanup_status=98
    if test -n "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION:-}" ||
        test -n "${SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE:-}" ||
        test -n "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED:-}"; then
      cleanup_status=98
    fi
    if ! xcrun simctl spawn "$device" launchctl unsetenv SETTLEORA_OCR_NETWORK_ISOLATION >/dev/null 2>&1; then
      cleanup_status=98
    fi
    if ! xcrun simctl spawn "$device" launchctl unsetenv SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED >/dev/null 2>&1; then
      cleanup_status=98
    fi
    persistent_isolation=""
    persistent_constructor=""
    if ! persistent_isolation=$(read_simulator_environment SETTLEORA_OCR_NETWORK_ISOLATION); then
      cleanup_status=98
    fi
    if ! persistent_constructor=$(read_simulator_environment SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED); then
      cleanup_status=98
    fi
    if test -n "$persistent_isolation" ||
        test -n "$persistent_constructor"; then
      cleanup_status=98
    fi
  fi
  if test "$cleanup_status" -ne 0; then
    status=$cleanup_status
    phase=cleanup_network_isolation
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
  "-Wl,-install_name,$network_deny_in_app" \
  -fvisibility=hidden \
  -Wall \
  -Wextra \
  -Werror \
  "$GITHUB_WORKSPACE/tools/ocr-models/ios-simulator-network-deny.c" \
  -o "$network_deny"
codesign --force --sign - "$network_deny" >/dev/null
file "$network_deny" | grep -F 'Mach-O' >/dev/null
test "$(xcrun otool -D "$network_deny" | tail -n 1)" = "$network_deny_in_app"
test "$(xcrun nm -gU "$network_deny" | awk '$2 == "T" && $3 == "_settleora_network_interposer_loaded" { count++ } END { print count + 0 }')" = 1
printf 'ios_simulator_interposer_export=present\n'

phase=verify_network_environment_clean
test -z "${SIMCTL_CHILD_DYLD_INSERT_LIBRARIES:-}"
test -z "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION:-}"
test -z "${SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE:-}"
test -z "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED:-}"
test -z "$(read_simulator_environment DYLD_INSERT_LIBRARIES)"
test -z "$(read_simulator_environment SETTLEORA_OCR_NETWORK_ISOLATION)"
test -z "$(read_simulator_environment SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED)"

phase=install_network_isolation
debug_config="$GITHUB_WORKSPACE/apps/mobile/ios/Flutter/Debug.xcconfig"
network_config_backup="$RUNNER_TEMP/settleora-ocr-debug.xcconfig.original"
phase=verify_debug_link_config
debug_config_sha=$(shasum -a 256 "$debug_config" | cut -d ' ' -f 1)
case "$debug_config_sha" in
  # Tracked one-line config, or exact CocoaPods 1.17.0 projection observed in
  # Xcode 16.4 job 108190884239 before the acceptance link modification.
  a82d7765b37116ee4821d2cd1d65942febf8032353757ffb0826eabde785b4a6|690b8a8b1ae15ddd29b241429963e971bbc6720ab22f154cf8cf6b085b6d4925) ;;
  *) printf 'debug_link_config_sha256=%s\n' "$debug_config_sha" >&2; exit 98 ;;
esac
phase=verify_network_link_path
case "$network_deny" in
  *[[:space:]]*) exit 98 ;;
esac
phase=save_debug_link_config
cp -p "$debug_config" "$network_config_backup"
network_link_configured=true
runner_project="$GITHUB_WORKSPACE/apps/mobile/ios/Runner.xcodeproj/project.pbxproj"
runner_project_backup="$RUNNER_TEMP/settleora-ocr-runner-project.original"
phase=save_runner_project
cp -p "$runner_project" "$runner_project_backup"
network_project_configured=true
app_delegate="$GITHUB_WORKSPACE/apps/mobile/ios/Runner/AppDelegate.swift"
app_delegate_backup="$RUNNER_TEMP/settleora-ocr-app-delegate.original"
phase=verify_app_delegate_source
test "$(shasum -a 256 "$app_delegate" | cut -d ' ' -f 1)" = 991e81eb3b6be2a8f4625f2d7c00d5caa2996845c381b512d0efbf36300e3f17
phase=save_app_delegate
cp -p "$app_delegate" "$app_delegate_backup"
app_delegate_configured=true
phase=apply_app_delegate_probe
node - "$app_delegate" <<'NODE'
const fs = require('node:fs');
const sourcePath = process.argv[2];
let source = fs.readFileSync(sourcePath, 'utf8');
const replaceOnce = (from, to) => {
  if (source.split(from).length !== 2) process.exit(98);
  source = source.replace(from, to);
};
replaceOnce('import UIKit\n\n@main\n',
  'import UIKit\n\n@_silgen_name("settleora_network_interposer_loaded")\nfunc settleoraNetworkInterposerLoaded() -> Int32\n\n@main\n');
replaceOnce('  ) -> Bool {\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n',
  '  ) -> Bool {\n    guard settleoraNetworkInterposerLoaded() == 1 else { return false }\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n');
fs.writeFileSync(sourcePath, source);
NODE
printf 'ios_simulator_app_delegate_probe=present\n'
phase=apply_runner_project_link
node - "$runner_project" "$network_deny" <<'NODE'
const fs = require('node:fs');
const [projectPath, dylibPath] = process.argv.slice(2);
let source = fs.readFileSync(projectPath, 'utf8');
const buildId = 'E13080000000000000000001';
const fileId = 'E13080000000000000000002';
if (source.includes(buildId) || source.includes(fileId) || !/^\/[^\s";]+$/.test(dylibPath)) process.exit(98);
const replaceOnce = (from, to) => {
  if (source.split(from).length !== 2) process.exit(98);
  source = source.replace(from, to);
};
replaceOnce('/* End PBXBuildFile section */',
  `\t\t${buildId} /* OCR test interposer in Frameworks */ = {isa = PBXBuildFile; fileRef = ${fileId} /* OCR test interposer */; };\n/* End PBXBuildFile section */`);
replaceOnce('/* End PBXFileReference section */',
  `\t\t${fileId} /* OCR test interposer */ = {isa = PBXFileReference; lastKnownFileType = "compiled.mach-o.dylib"; path = "${dylibPath}"; sourceTree = "<absolute>"; };\n/* End PBXFileReference section */`);
replaceOnce('97C146EB1CF9000F007C117D /* Frameworks */ = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (',
  `97C146EB1CF9000F007C117D /* Frameworks */ = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t\t${buildId} /* OCR test interposer in Frameworks */,`);
fs.writeFileSync(projectPath, source);
NODE
plutil -lint "$runner_project" >/dev/null
printf 'ios_simulator_runner_framework_link=present\n'
phase=apply_debug_link_config
printf '\nENABLE_DEBUG_DYLIB = NO\nOTHER_LDFLAGS = $(inherited) -Wl,-needed_library,%s\nLIBRARY_SEARCH_PATHS = $(inherited) %s\n' "$network_deny" "$RUNNER_TEMP" >> "$debug_config"
phase=verify_debug_link_setting
test "$(tail -n 3 "$debug_config" | head -n 1)" = 'ENABLE_DEBUG_DYLIB = NO'
test "$(tail -n 2 "$debug_config" | head -n 1)" = "OTHER_LDFLAGS = \$(inherited) -Wl,-needed_library,$network_deny"
test "$(tail -n 1 "$debug_config")" = "LIBRARY_SEARCH_PATHS = \$(inherited) $RUNNER_TEMP"
phase=verify_resolved_debug_link_setting
resolved_debug_settings=$(xcodebuild -project "$GITHUB_WORKSPACE/apps/mobile/ios/Runner.xcodeproj" \
  -target Runner -configuration Debug -sdk iphonesimulator -showBuildSettings 2>/dev/null)
resolved_link_flags=$(sed -n 's/^[[:space:]]*OTHER_LDFLAGS = //p' <<< "$resolved_debug_settings")
resolved_library_search_paths=$(sed -n 's/^[[:space:]]*LIBRARY_SEARCH_PATHS = //p' <<< "$resolved_debug_settings")
resolved_debug_dylib=$(sed -n 's/^[[:space:]]*ENABLE_DEBUG_DYLIB = //p' <<< "$resolved_debug_settings")
case "$resolved_link_flags" in
  *"-Wl,-needed_library,$network_deny"*) ;;
  *) printf 'ios_simulator_link_setting=missing\n' >&2; exit 98 ;;
esac
case "$resolved_library_search_paths" in
  *"$RUNNER_TEMP"*) ;;
  *) printf 'ios_simulator_library_search_path=missing\n' >&2; exit 98 ;;
esac
test "$resolved_debug_dylib" = NO || { printf 'ios_simulator_debug_dylib_setting=unexpected\n' >&2; exit 98; }
printf 'ios_simulator_link_setting=present ios_simulator_library_search_path=present ios_simulator_debug_dylib_setting=NO\n'
phase=enable_simulator_isolation
network_environment_configured=true
xcrun simctl spawn "$device" launchctl setenv SETTLEORA_OCR_NETWORK_ISOLATION socket_interpose_v1
export SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE="$network_deny"
export SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION=socket_interpose_v1
test "$SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE" = "$network_deny"
test "$SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION" = "socket_interpose_v1"
test "$(xcrun simctl spawn "$device" launchctl getenv SETTLEORA_OCR_NETWORK_ISOLATION)" = "socket_interpose_v1"

phase=build_simulator_interposer_link
build_trace="$RUNNER_TEMP/settleora-ios-build-link-trace.log"
build_errors="$RUNNER_TEMP/settleora-ios-build-link-errors.log"
build_status=0
node --input-type=module - "$build_trace" "$build_errors" "$GITHUB_WORKSPACE" <<'NODE' || build_status=$?
import { pathToFileURL } from 'node:url';
const [stdoutPath, stderrPath, workspace] = process.argv.slice(2);
const { runBoundedProcess } = await import(pathToFileURL(`${workspace}/tools/ocr-models/bounded-process-capture.mjs`));
const status = await runBoundedProcess({
  stdoutPath, stderrPath, maxBytes: 32 * 1024 * 1024,
  executable: 'flutter',
  args: ['build', 'ios', '--simulator', '--debug', '--no-codesign', '--no-pub', '--verbose'],
});
process.exitCode = status;
NODE
if test "$build_status" -ne 0; then
  python3 "$GITHUB_WORKSPACE/tools/ocr-models/diagnose-ios-link-trace.py" \
    "$build_trace" "$build_errors" "$network_deny" "$build_status"
  exit "$build_status"
fi
phase=verify_simulator_interposer_link
simulator_app="$GITHUB_WORKSPACE/apps/mobile/build/ios/iphonesimulator/Runner.app"
simulator_executable="$simulator_app/Runner"
simulator_interposer="$simulator_app/Frameworks/libSettleoraOcrNetworkDeny.dylib"
phase=verify_simulator_app
test -f "$simulator_executable"
phase=verify_simulator_interposer_copy
test -f "$simulator_interposer"
cmp -s "$network_deny" "$simulator_interposer"
phase=verify_debug_link_setting_after_build
test "$(tail -n 3 "$debug_config" | head -n 1)" = 'ENABLE_DEBUG_DYLIB = NO'
test "$(tail -n 2 "$debug_config" | head -n 1)" = "OTHER_LDFLAGS = \$(inherited) -Wl,-needed_library,$network_deny"
test "$(tail -n 1 "$debug_config")" = "LIBRARY_SEARCH_PATHS = \$(inherited) $RUNNER_TEMP"
phase=verify_resolved_debug_link_setting_after_build
resolved_built_settings=$(xcodebuild -workspace "$GITHUB_WORKSPACE/apps/mobile/ios/Runner.xcworkspace" \
  -scheme Runner -configuration Debug -sdk iphonesimulator -showBuildSettings 2>/dev/null)
resolved_built_runner_settings=$(awk '
  /^Build settings for action build and target Runner:$/ { found++; selected = 1; next }
  /^Build settings for action build and target / { selected = 0 }
  selected { print }
  END { if (found != 1) exit 98 }
' <<< "$resolved_built_settings")
resolved_built_link_flags=$(sed -n 's/^[[:space:]]*OTHER_LDFLAGS = //p' <<< "$resolved_built_runner_settings")
resolved_built_library_search_paths=$(sed -n 's/^[[:space:]]*LIBRARY_SEARCH_PATHS = //p' <<< "$resolved_built_runner_settings")
resolved_built_debug_dylib=$(sed -n 's/^[[:space:]]*ENABLE_DEBUG_DYLIB = //p' <<< "$resolved_built_runner_settings")
case "$resolved_built_link_flags" in
  *"-Wl,-needed_library,$network_deny"*) ;;
  *) printf 'ios_simulator_built_link_setting=missing\n' >&2; exit 98 ;;
esac
case "$resolved_built_library_search_paths" in
  *"$RUNNER_TEMP"*) ;;
  *) printf 'ios_simulator_built_library_search_path=missing\n' >&2; exit 98 ;;
esac
test "$resolved_built_debug_dylib" = NO || { printf 'ios_simulator_built_debug_dylib_setting=unexpected\n' >&2; exit 98; }
printf 'ios_simulator_built_link_setting=present ios_simulator_built_library_search_path=present ios_simulator_built_debug_dylib_setting=NO\n'
phase=verify_simulator_interposer_load_command
simulator_link_image="$simulator_executable"
if xcrun otool -L "$simulator_executable" | grep -F "$network_deny_in_app (" >/dev/null; then
  :
elif test -f "$simulator_app/Runner.debug.dylib" &&
    xcrun otool -L "$simulator_app/Runner.debug.dylib" | grep -F "$network_deny_in_app (" >/dev/null; then
  # Xcode 16 may put the app's Debug-linked code in this in-app dylib.
  simulator_link_image="$simulator_app/Runner.debug.dylib"
else
  if xcrun otool -L "$simulator_executable" | grep -F 'libSettleoraOcrNetworkDeny.dylib' >/dev/null; then
    printf 'ios_simulator_runner_interposer_alternate_install_name=present\n' >&2
  else
    printf 'ios_simulator_runner_interposer_dependency=absent\n' >&2
  fi
  if test -f "$simulator_app/Runner.debug.dylib"; then
    if xcrun otool -L "$simulator_app/Runner.debug.dylib" | grep -F 'libSettleoraOcrNetworkDeny.dylib' >/dev/null; then
      printf 'ios_simulator_debug_dylib_interposer_alternate_install_name=present\n' >&2
    else
      printf 'ios_simulator_debug_dylib_interposer_dependency=absent\n' >&2
    fi
  fi
  exit 98
fi
printf 'ios_simulator_link_image=%s\n' "${simulator_link_image##*/}"
phase=verify_simulator_interposer_install_name
test "$(xcrun otool -D "$simulator_interposer" | tail -n 1)" = "$network_deny_in_app"
phase=execute_flutter_test
status=0
node "$GITHUB_WORKSPACE/tools/ocr-models/bounded-process-capture.mjs" \
  --stdout="$RUNNER_TEMP/ios-acceptance.log" \
  --stderr="$RUNNER_TEMP/ios-acceptance.stderr.log" \
  --max-bytes=33554432 \
  --platform=ios \
  --device="$device" || status=$?
phase=verify_simulator_interposer_link_after_test
test -f "$simulator_executable"
test -f "$simulator_interposer"
test -f "$simulator_link_image"
xcrun otool -L "$simulator_link_image" | grep -F "$network_deny_in_app (" >/dev/null
echo "status=$status" >> "$GITHUB_OUTPUT"
echo "failure_phase=" >> "$GITHUB_OUTPUT"
phase=complete
exit 0
