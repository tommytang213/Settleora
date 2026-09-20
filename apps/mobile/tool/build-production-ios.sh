#!/usr/bin/env bash

set -euo pipefail

expected_flutter_version=3.44.8
expected_xcode_version=16.4
expected_cocoapods_version=1.17.0
expected_codemagic_cli_tools_version=0.69.0
expected_bundle_identifier=com.tommytang213.settleora
default_pubspec_lock_sha=065007a0c8b90d527aff6306936a02cd527d30f03800cc8e4229e8273d3afcc7
default_podfile_lock_sha=a5b6068c71fe9b0a77743d5c639b5538dd2be10db7ddd4ecd9317fee03541903

mode=
artifact_class=release-candidate
source_sha=
source_tree=
source_git_root=
mobile_root=
repo_root=
tool_root=
provenance_out=
build_name=
build_number=
export_options_plist=
podfile_lock_sha="$default_podfile_lock_sha"
require_integration_test=true
source_snapshot=
dependency_cache_root=
inspection_root=
cleanup_inspection_root=false
inventory_file=
symbols_file=

cleanup() {
  [[ -z "$inventory_file" ]] || rm -f -- "$inventory_file"
  [[ -z "$symbols_file" ]] || rm -f -- "$symbols_file"
  if [[ "$cleanup_inspection_root" == true && -n "$inspection_root" ]]; then
    rm -rf -- "$inspection_root"
  fi
  [[ -z "$dependency_cache_root" ]] || rm -rf -- "$dependency_cache_root"
  [[ -z "$source_snapshot" ]] || rm -rf -- "$source_snapshot"
}
trap cleanup EXIT

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
    --source-git-root=*) source_git_root=${argument#*=} ;;
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
  [[ "$mobile_root" == "$repo_root/apps/mobile" ]] || fail "release candidate must use the canonical mobile source tree"
  [[ -n "$provenance_out" ]] || fail "release candidate provenance output is required"
fi

if [[ "$mode" == signed ]]; then
  [[ "$artifact_class" == release-candidate ]] || fail "signed builds must be release candidates"
  [[ -n "$build_name" && -n "$build_number" && -n "$export_options_plist" ]] || fail "signed build identity/export options are required"
  [[ "$build_name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "signed build name must be a three-part numeric version"
  [[ "$build_number" =~ ^[0-9]+$ ]] || fail "signed build number must be numeric"
else
  [[ -z "$build_name$build_number$export_options_plist" ]] || fail "signing arguments are invalid for an unsigned build"
fi

if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  [[ "$(git -C "$repo_root" rev-parse --show-toplevel)" == "$(cd "$repo_root" && pwd -P)" ]] || fail "source root is not the Git worktree root"
  [[ -z "$source_git_root" ]] || fail "source Git root is valid only for an exported source tree"
  [[ "$(git -C "$repo_root" rev-parse HEAD)" == "$source_sha" ]] || fail "source SHA does not match checkout"
  [[ "$(git -C "$repo_root" rev-parse 'HEAD^{tree}')" == "$source_tree" ]] || fail "source tree does not match checkout"
  [[ -z "$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all)" ]] || fail "source checkout differs from the committed tree"
elif [[ "$artifact_class" == release-candidate ]]; then
  [[ "$mode" == unsigned ]] || fail "signed release candidate requires a clean Git worktree"
  [[ -n "$source_git_root" ]] || fail "exported release candidate requires a source Git root"
  git -C "$source_git_root" cat-file -e "$source_sha^{commit}" 2>/dev/null || fail "source commit is unavailable"
  [[ "$(git -C "$source_git_root" rev-parse "$source_sha^{tree}")" == "$source_tree" ]] || fail "source tree does not match source commit"
  source_snapshot=$(mktemp -d)
  git -C "$source_git_root" archive "$source_sha" | tar -x -C "$source_snapshot"
  diff -q -r "$source_snapshot" "$repo_root" >/dev/null || fail "exported source differs from the committed tree"
  rm -rf -- "$source_snapshot"
  source_snapshot=
fi

if [[ "$mode" == signed ]]; then
  [[ "${CODEMAGIC_CLI_TOOLS_VERSION:-}" == "$expected_codemagic_cli_tools_version" ]] || fail "Codemagic CLI tools contract is missing or changed"
fi

command -v flutter >/dev/null || fail "flutter is unavailable"
command -v node >/dev/null || fail "node is unavailable"
command -v pod >/dev/null || fail "CocoaPods is unavailable"
command -v xcodebuild >/dev/null || fail "Xcode is unavailable"
command -v plutil >/dev/null || fail "plutil is unavailable"
if [[ "$mode" == signed ]]; then
  command -v xcode-project >/dev/null || fail "Codemagic signing utility is unavailable"
  command -v codemagic-cli-tools >/dev/null || fail "Codemagic CLI tools version inspector is unavailable"
fi

flutter_version=$(flutter --version --machine | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk).on("end", () => process.stdout.write(JSON.parse(input).frameworkVersion));')
[[ "$flutter_version" == "$expected_flutter_version" ]] || fail "Flutter must be $expected_flutter_version"
xcode_version=$(xcodebuild -version | sed -n '1s/^Xcode //p')
[[ "$xcode_version" == "$expected_xcode_version" ]] || fail "Xcode must be $expected_xcode_version"
cocoapods_version=$(pod --version)
[[ "$cocoapods_version" == "$expected_cocoapods_version" ]] || fail "CocoaPods must be $expected_cocoapods_version"
codemagic_cli_tools_version=not-applicable
if [[ "$mode" == signed ]]; then
  codemagic_cli_tools_output=$(codemagic-cli-tools --version 2>/dev/null)
  codemagic_cli_tools_version=${codemagic_cli_tools_output##* }
  [[ "$codemagic_cli_tools_version" == "$expected_codemagic_cli_tools_version" ]] || fail "Codemagic CLI tools must be $expected_codemagic_cli_tools_version"
fi

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

pubspec_lock_sha=$(sha256_file "$mobile_root/pubspec.lock")
if [[ "$artifact_class" == release-candidate ]]; then
  [[ "$pubspec_lock_sha" == "$default_pubspec_lock_sha" ]] || fail "pubspec.lock differs from the committed canonical source"
fi
[[ "$(sha256_file "$mobile_root/ios/Podfile.lock")" == "$podfile_lock_sha" ]] || fail "Podfile.lock does not match the approved identity"
catalog_sha=
fixture_manifest_sha=
if [[ "$artifact_class" == release-candidate ]]; then
  catalog_sha=$(sha256_file "$mobile_root/assets/receipt_ocr_models/catalog.json")
  fixture_manifest_sha=$(sha256_file "$mobile_root/test/fixtures/receipt_ocr/manifest.json")
fi

cd "$mobile_root"
# Resolve every canonical build through fresh task-owned caches. pubspec.lock
# and Podfile.lock bind versions/checksums; isolation prevents restored or
# manually modified global cache bytes from satisfying those resolutions.
dependency_cache_root=$(mktemp -d)
export PUB_CACHE="$dependency_cache_root/pub-cache"
export CP_HOME_DIR="$dependency_cache_root/cocoapods-home"
export CP_CACHE_DIR="$dependency_cache_root/cocoapods-cache"
mkdir -p "$PUB_CACHE" "$CP_HOME_DIR" "$CP_CACHE_DIR"
# Git cleanliness deliberately ignores generated Flutter state. Clear it with
# the pinned Flutter tool before dependency resolution so neither incremental
# intermediates nor stale IPA/archive outputs can influence this build.
flutter clean
rm -rf -- build .dart_tool .flutter-plugins-dependencies ios/Pods ios/.symlinks
flutter pub get
[[ "$(sha256_file pubspec.lock)" == "$pubspec_lock_sha" ]] || fail "pubspec.lock drifted during dependency resolution"

node "$tool_root/tools/ocr-models/prepare-production-flutter-plugins.mjs" \
  --file=.flutter-plugins-dependencies \
  --package-config=.dart_tool/package_config.json \
  --package-graph=.dart_tool/package_graph.json \
  --require-integration-test="$require_integration_test"

# Pods and plugin symlinks are ignored generated state, so Git cleanliness does
# not prove their identity. Recreate the sandbox from the pinned Podfile.lock on
# every canonical build rather than allowing a prior build to supply pod bytes.
rm -rf -- ios/Pods ios/.symlinks
(
  cd ios
  pod install --deployment
)
[[ "$(sha256_file pubspec.lock)" == "$pubspec_lock_sha" ]] || fail "pubspec.lock drifted during CocoaPods resolution"
[[ "$(sha256_file ios/Podfile.lock)" == "$podfile_lock_sha" ]] || fail "Podfile.lock drifted during CocoaPods resolution"

if [[ "$mode" == signed ]]; then
  # This is the only reviewed, wrapper-owned transformation after the clean
  # exact-tree proof. It selects the existing Codemagic-managed profile and
  # produces export options; it performs no artifact distribution.
  xcode-project use-profiles --custom-export-options='{"testFlightInternalTestingOnly": true}'
  [[ -f "$export_options_plist" ]] || fail "export options plist was not produced"
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
  preflight_ipa_sha=$(node "$tool_root/tools/ocr-models/verify-ipa-archive.mjs")
  unzip -tqq "$artifact_path" || fail "IPA integrity test failed"
  inspection_root=$(mktemp -d)
  cleanup_inspection_root=true
  unzip -q "$artifact_path" -d "$inspection_root"
  [[ "$(sha256_file "$artifact_path")" == "$preflight_ipa_sha" ]] || fail "IPA changed after namespace preflight"
  top_level_entries=()
  while IFS= read -r candidate; do
    top_level_entries+=("$(basename "$candidate")")
  done < <(find "$inspection_root" -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort)
  for entry in "${top_level_entries[@]}"; do
    case "$entry" in
      Payload|SwiftSupport) ;;
      *) fail "IPA contains a non-allowlisted top-level entry" ;;
    esac
  done
  [[ -d "$inspection_root/Payload" ]] || fail "IPA Payload directory is missing"
  packaged_apps=()
  while IFS= read -r candidate; do
    packaged_apps+=("$candidate")
  done < <(find "$inspection_root/Payload" -maxdepth 1 -type d -name '*.app' -print | LC_ALL=C sort)
  [[ ${#packaged_apps[@]} -eq 1 ]] || fail "IPA must contain exactly one application bundle"
  app_path=${packaged_apps[0]}
  payload_entries=()
  while IFS= read -r candidate; do
    payload_entries+=("$candidate")
  done < <(find "$inspection_root/Payload" -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort)
  [[ ${#payload_entries[@]} -eq 1 && "${payload_entries[0]}" == "$app_path" ]] || fail "IPA Payload contains content outside the application bundle"
  if [[ -d "$inspection_root/SwiftSupport" ]]; then
    unexpected_swift_support=$(find "$inspection_root/SwiftSupport" -mindepth 1 ! -type d ! \( -type f -name '*.dylib' \) -print -quit)
    [[ -z "$unexpected_swift_support" ]] || fail "IPA SwiftSupport contains a non-allowlisted entry"
  fi
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
inventory_root=$app_path
if [[ "$mode" == signed ]]; then
  inventory_root=$inspection_root
fi
find "$inventory_root" -mindepth 1 -print | LC_ALL=C sort >"$inventory_file"
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
done < <(find "$inventory_root" -type f -perm -111 -print)
[[ "$binary_count" -gt 0 ]] || fail "production application contains no inspectable Mach-O binary"
grep -Fq 'GeneratedPluginRegistrant' "$symbols_file" || fail "GeneratedPluginRegistrant is absent from production binaries"
grep -Fq 'FilePickerPlugin' "$symbols_file" || fail "FilePickerPlugin is absent from production binaries"
grep -Fq 'FlutterSecureStorageDarwinPlugin' "$symbols_file" || fail "Flutter secure storage is absent from production binaries"
if grep -Eiq 'IntegrationTestPlugin|dev\.flutter\.plugins\.integration_test' "$symbols_file"; then
  fail "integration_test is linked into the production application"
fi
if grep -Fq -e 'com.settleora.mobile/receipt_ocr_acceptance' -e 'loadModelCatalog' -e 'loadFixture' "$symbols_file"; then
  fail "native OCR acceptance handlers are linked into the production application"
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
    --codemagic-cli-tools-version="$codemagic_cli_tools_version" \
    --pubspec-lock-sha256="$pubspec_lock_sha" \
    --podfile-lock-sha256="$podfile_lock_sha" \
    --catalog-sha256="$catalog_sha" \
    --fixture-manifest-sha256="$fixture_manifest_sha"
  printf 'SETTLEORA_IOS_RELEASE_ARTIFACT=%s\n' "$(basename "$artifact_path")"
  printf 'SETTLEORA_IOS_RELEASE_SHA256=%s\n' "$artifact_sha"
  printf 'SETTLEORA_IOS_RELEASE_PROVENANCE=%s\n' "$(basename "$provenance_out")"
fi
