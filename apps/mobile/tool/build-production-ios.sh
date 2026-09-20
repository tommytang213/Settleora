#!/usr/bin/env bash

set -euo pipefail

expected_flutter_version=3.44.8
expected_xcode_version=16.4
expected_cocoapods_version=1.17.0
expected_bundle_identifier=com.tommytang213.settleora
default_podfile_lock_sha=08afc1413159dcd818b669869736fc56e38a99618a1f951e605b1eea02dc5189

mode=
artifact_class=release-candidate
source_sha=
source_tree=
mobile_root=
repo_root=
tool_root=
provenance_out=
build_name=
build_number=
export_options_plist=
podfile_lock_sha="$default_podfile_lock_sha"
require_integration_test=true

fail() {
  printf 'Canonical iOS production build failed: %s\n' "$1" >&2
  exit 1
}

for argument in "$@"; do
  case "$argument" in
    --mode=*) mode=${argument#*=} ;;
    --artifact-class=*) artifact_class=${argument#*=} ;;
    --source-sha=*) source_sha=${argument#*=} ;;
    --source-tree=*) source_tree=${argument#*=} ;;
    --mobile-root=*) mobile_root=${argument#*=} ;;
    --repo-root=*) repo_root=${argument#*=} ;;
    --tool-root=*) tool_root=${argument#*=} ;;
    --provenance-out=*) provenance_out=${argument#*=} ;;
    --build-name=*) build_name=${argument#*=} ;;
    --build-number=*) build_number=${argument#*=} ;;
    --export-options-plist=*) export_options_plist=${argument#*=} ;;
    --podfile-lock-sha=*) podfile_lock_sha=${argument#*=} ;;
    --require-integration-test=*) require_integration_test=${argument#*=} ;;
    *) fail "unknown argument" ;;
  esac
done

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
default_mobile_root=$(cd "$script_dir/.." && pwd -P)
mobile_root=${mobile_root:-$default_mobile_root}
repo_root=${repo_root:-$(cd "$mobile_root/../.." && pwd -P)}
tool_root=${tool_root:-$repo_root}

[[ "$mode" == unsigned || "$mode" == signed ]] || fail "--mode must be unsigned or signed"
[[ "$artifact_class" == release-candidate || "$artifact_class" == size-measurement ]] || fail "invalid artifact class"
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || fail "--source-sha must be a full lowercase commit SHA"
[[ "$source_tree" =~ ^[0-9a-f]{40}$ ]] || fail "--source-tree must be a full lowercase tree SHA"
[[ "$podfile_lock_sha" =~ ^[0-9a-f]{64}$ ]] || fail "Podfile.lock SHA-256 is invalid"
[[ "$require_integration_test" == true || "$require_integration_test" == false ]] || fail "invalid integration_test requirement"
[[ -d "$mobile_root/ios/Runner" && -f "$mobile_root/pubspec.lock" && -f "$mobile_root/ios/Podfile.lock" ]] || fail "repository/mobile layout is incomplete"
[[ -f "$tool_root/tools/ocr-models/prepare-production-flutter-plugins.mjs" ]] || fail "production plugin projector is missing"
[[ -f "$tool_root/tools/ocr-models/verify-mobile-package.mjs" ]] || fail "production package verifier is missing"

if [[ "$artifact_class" == release-candidate ]]; then
  [[ "$podfile_lock_sha" == "$default_podfile_lock_sha" ]] || fail "release candidate must use the canonical Podfile.lock"
  [[ "$require_integration_test" == true ]] || fail "release candidate must prove integration_test projection"
  [[ "$tool_root" == "$repo_root" ]] || fail "release candidate must use tooling from its exact source tree"
  [[ -n "$provenance_out" ]] || fail "release candidate provenance output is required"
fi

if [[ "$mode" == signed ]]; then
  [[ "$artifact_class" == release-candidate ]] || fail "signed builds must be release candidates"
  [[ -n "$build_name" && -n "$build_number" && -n "$export_options_plist" ]] || fail "signed build identity/export options are required"
  [[ "$build_name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "signed build name must be a three-part numeric version"
  [[ "$build_number" =~ ^[0-9]+$ ]] || fail "signed build number must be numeric"
  [[ -f "$export_options_plist" ]] || fail "export options plist is missing"
else
  [[ -z "$build_name$build_number$export_options_plist" ]] || fail "signing arguments are invalid for an unsigned build"
fi

command -v flutter >/dev/null || fail "flutter is unavailable"
command -v node >/dev/null || fail "node is unavailable"
command -v pod >/dev/null || fail "CocoaPods is unavailable"
command -v xcodebuild >/dev/null || fail "Xcode is unavailable"
command -v plutil >/dev/null || fail "plutil is unavailable"

flutter_version=$(flutter --version --machine | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk).on("end", () => process.stdout.write(JSON.parse(input).frameworkVersion));')
[[ "$flutter_version" == "$expected_flutter_version" ]] || fail "Flutter must be $expected_flutter_version"
xcode_version=$(xcodebuild -version | sed -n '1s/^Xcode //p')
[[ "$xcode_version" == "$expected_xcode_version" ]] || fail "Xcode must be $expected_xcode_version"
cocoapods_version=$(pod --version)
[[ "$cocoapods_version" == "$expected_cocoapods_version" ]] || fail "CocoaPods must be $expected_cocoapods_version"

if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  [[ "$(git -C "$repo_root" rev-parse HEAD)" == "$source_sha" ]] || fail "source SHA does not match checkout"
  [[ "$(git -C "$repo_root" rev-parse 'HEAD^{tree}')" == "$source_tree" ]] || fail "source tree does not match checkout"
fi

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

pubspec_lock_sha=$(sha256_file "$mobile_root/pubspec.lock")
[[ "$(sha256_file "$mobile_root/ios/Podfile.lock")" == "$podfile_lock_sha" ]] || fail "Podfile.lock does not match the approved identity"
catalog_sha=$(sha256_file "$mobile_root/assets/receipt_ocr_models/catalog.json")
fixture_manifest_sha=$(sha256_file "$mobile_root/test/fixtures/receipt_ocr/manifest.json")

cd "$mobile_root"
flutter pub get
[[ "$(sha256_file pubspec.lock)" == "$pubspec_lock_sha" ]] || fail "pubspec.lock drifted during dependency resolution"

node "$tool_root/tools/ocr-models/prepare-production-flutter-plugins.mjs" \
  --file=.flutter-plugins-dependencies \
  --require-integration-test="$require_integration_test"

(
  cd ios
  pod install --deployment
)
[[ "$(sha256_file pubspec.lock)" == "$pubspec_lock_sha" ]] || fail "pubspec.lock drifted during CocoaPods resolution"
[[ "$(sha256_file ios/Podfile.lock)" == "$podfile_lock_sha" ]] || fail "Podfile.lock drifted during CocoaPods resolution"

if [[ "$mode" == signed ]]; then
  flutter build ipa --release --no-pub \
    --build-name="$build_name" \
    --build-number="$build_number" \
    --export-options-plist="$export_options_plist"
else
  flutter build ios --release --no-codesign --no-pub
fi

[[ "$(sha256_file pubspec.lock)" == "$pubspec_lock_sha" ]] || fail "pubspec.lock drifted during build"
[[ "$(sha256_file ios/Podfile.lock)" == "$podfile_lock_sha" ]] || fail "Podfile.lock drifted during build"

registrant=ios/Runner/GeneratedPluginRegistrant.m
file_picker_call='  [FilePickerPlugin registerWithRegistrar:[registry registrarForPlugin:@"FilePickerPlugin"]];'
secure_storage_call='  [FlutterSecureStorageDarwinPlugin registerWithRegistrar:[registry registrarForPlugin:@"FlutterSecureStorageDarwinPlugin"]];'
[[ "$(grep -Fxc "$file_picker_call" "$registrant")" == 1 ]] || fail "FilePicker registrant call is missing or duplicated"
[[ "$(grep -Fxc "$secure_storage_call" "$registrant")" == 1 ]] || fail "Flutter secure storage registrant call is missing or duplicated"
if grep -Eq 'integration_test|IntegrationTestPlugin' "$registrant"; then
  fail "integration_test remains in the production registrant"
fi

inspection_root=
cleanup_inspection_root=false
artifact_path=
archive_path=
if [[ "$mode" == signed ]]; then
  ipa_files=()
  while IFS= read -r candidate; do
    ipa_files+=("$candidate")
  done < <(find build/ios/ipa -maxdepth 1 -type f -name '*.ipa' -print | LC_ALL=C sort)
  [[ ${#ipa_files[@]} -eq 1 ]] || fail "signed build must produce exactly one IPA"
  artifact_path=$(cd "$(dirname "${ipa_files[0]}")" && pwd -P)/$(basename "${ipa_files[0]}")
  archive_paths=()
  while IFS= read -r candidate; do
    archive_paths+=("$candidate")
  done < <(find build/ios/archive -maxdepth 1 -type d -name '*.xcarchive' -print | LC_ALL=C sort)
  [[ ${#archive_paths[@]} -eq 1 ]] || fail "signed build must produce exactly one xcarchive"
  archive_path=$(cd "$(dirname "${archive_paths[0]}")" && pwd -P)/$(basename "${archive_paths[0]}")
  inspection_root=$(mktemp -d)
  cleanup_inspection_root=true
  trap 'if [[ "$cleanup_inspection_root" == true ]]; then rm -rf -- "$inspection_root"; fi' EXIT
  unzip -q "$artifact_path" -d "$inspection_root"
  packaged_apps=()
  while IFS= read -r candidate; do
    packaged_apps+=("$candidate")
  done < <(find "$inspection_root/Payload" -maxdepth 1 -type d -name '*.app' -print | LC_ALL=C sort)
  [[ ${#packaged_apps[@]} -eq 1 ]] || fail "IPA must contain exactly one application bundle"
  app_path=${packaged_apps[0]}
  codesign --verify --deep --strict "$app_path"
else
  app_path="$mobile_root/build/ios/iphoneos/Runner.app"
  artifact_path=$app_path
fi

[[ -d "$app_path" ]] || fail "production application bundle is missing"
bundle_identifier=$(plutil -extract CFBundleIdentifier raw "$app_path/Info.plist")
[[ "$bundle_identifier" == "$expected_bundle_identifier" ]] || fail "production bundle identifier changed"
packaged_build_name=$(plutil -extract CFBundleShortVersionString raw "$app_path/Info.plist")
packaged_build_number=$(plutil -extract CFBundleVersion raw "$app_path/Info.plist")
[[ "$packaged_build_name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "packaged build name is invalid"
[[ "$packaged_build_number" =~ ^[0-9]+$ ]] || fail "packaged build number is invalid"
if [[ "$mode" == signed ]]; then
  [[ "$packaged_build_name" == "$build_name" ]] || fail "packaged build name differs from the requested signed build"
  [[ "$packaged_build_number" == "$build_number" ]] || fail "packaged build number differs from the requested signed build"
fi

if [[ "$artifact_class" == release-candidate ]]; then
  node "$tool_root/tools/ocr-models/verify-mobile-package.mjs" \
    --platform=ios \
    --package="$app_path" \
    --repo-root="$repo_root"
fi

inventory_file=$(mktemp)
symbols_file=$(mktemp)
trap 'rm -f -- "$inventory_file" "$symbols_file"; if [[ "$cleanup_inspection_root" == true ]]; then rm -rf -- "$inspection_root"; fi' EXIT
find "$app_path" -mindepth 1 -print | LC_ALL=C sort >"$inventory_file"
if grep -Eiq 'integration[_-]?test|receipt_ocr_real_provider_test|receipt_ocr_acceptance|(^|/)test(/|$)|\.log$|ocr.*evidence' "$inventory_file"; then
  fail "production application contains test, fixture, log, or OCR evidence paths"
fi

: >"$symbols_file"
binary_count=0
while IFS= read -r candidate; do
  if file "$candidate" | grep -q 'Mach-O'; then
    binary_count=$((binary_count + 1))
    nm -a "$candidate" >>"$symbols_file"
    strings "$candidate" >>"$symbols_file"
  fi
done < <(find "$app_path" -type f -perm -111 -print)
[[ "$binary_count" -gt 0 ]] || fail "production application contains no inspectable Mach-O binary"
grep -Fq 'GeneratedPluginRegistrant' "$symbols_file" || fail "GeneratedPluginRegistrant is absent from production binaries"
grep -Fq 'FilePickerPlugin' "$symbols_file" || fail "FilePickerPlugin is absent from production binaries"
grep -Fq 'FlutterSecureStorageDarwinPlugin' "$symbols_file" || fail "Flutter secure storage is absent from production binaries"
if grep -Eiq 'IntegrationTestPlugin|dev\.flutter\.plugins\.integration_test' "$symbols_file"; then
  fail "integration_test is linked into the production application"
fi

if [[ "$artifact_class" == release-candidate ]]; then
  mkdir -p "$(dirname "$provenance_out")"
  artifact_sha=$(if [[ "$mode" == signed ]]; then sha256_file "$artifact_path"; else node "$tool_root/tools/ocr-models/hash-directory.mjs" app; fi)
  archive_sha=$(if [[ "$mode" == signed ]]; then node "$tool_root/tools/ocr-models/hash-directory.mjs" archive; else printf ''; fi)
  node "$tool_root/tools/ocr-models/write-ios-release-provenance.mjs" \
    --out="$provenance_out" \
    --mode="$mode" \
    --source-sha="$source_sha" \
    --source-tree="$source_tree" \
    --artifact="$artifact_path" \
    --artifact-sha256="$artifact_sha" \
    --archive="$archive_path" \
    --archive-sha256="$archive_sha" \
    --bundle-identifier="$bundle_identifier" \
    --build-name="$packaged_build_name" \
    --build-number="$packaged_build_number" \
    --flutter-version="$flutter_version" \
    --xcode-version="$xcode_version" \
    --cocoapods-version="$cocoapods_version" \
    --pubspec-lock-sha256="$pubspec_lock_sha" \
    --podfile-lock-sha256="$podfile_lock_sha" \
    --catalog-sha256="$catalog_sha" \
    --fixture-manifest-sha256="$fixture_manifest_sha"
  printf 'SETTLEORA_IOS_RELEASE_ARTIFACT=%s\n' "$(basename "$artifact_path")"
  printf 'SETTLEORA_IOS_RELEASE_SHA256=%s\n' "$artifact_sha"
  printf 'SETTLEORA_IOS_RELEASE_PROVENANCE=%s\n' "$(basename "$provenance_out")"
fi
