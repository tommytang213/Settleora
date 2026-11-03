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
icon_compare_root=

cleanup() {
  [[ -z "$inventory_file" ]] || rm -f -- "$inventory_file"
  [[ -z "$symbols_file" ]] || rm -f -- "$symbols_file"
  [[ -z "$icon_compare_root" ]] || rm -rf -- "$icon_compare_root"
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
  inspection_root=$PWD/build/ios/.settleora-ipa-inspection
  [[ ! -e "$inspection_root" && ! -L "$inspection_root" ]] || fail "descriptor-backed IPA inspection root already exists"
  preflight_ipa_sha=$(node "$tool_root/tools/ocr-models/verify-ipa-archive.mjs")
  [[ -d "$inspection_root" && ! -L "$inspection_root" ]] || fail "descriptor-backed IPA inspection is missing"
  cleanup_inspection_root=true
  [[ "$(sha256_file "$artifact_path")" == "$preflight_ipa_sha" ]] || fail "retained IPA differs from descriptor-backed preflight"
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
  app_swift_libraries=()
  if [[ -d "$app_path/Frameworks" ]]; then
    while IFS= read -r candidate; do
      app_swift_libraries+=("$candidate")
    done < <(find "$app_path/Frameworks" -mindepth 1 -maxdepth 1 -type f -name 'libswift*.dylib' -print | LC_ALL=C sort)
  fi
  if [[ -d "$inspection_root/SwiftSupport" ]]; then
    swift_support_roots=()
    while IFS= read -r candidate; do
      swift_support_roots+=("$candidate")
    done < <(find "$inspection_root/SwiftSupport" -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort)
    [[ ${#swift_support_roots[@]} -eq 1 && "${swift_support_roots[0]}" == "$inspection_root/SwiftSupport/iphoneos" && -d "${swift_support_roots[0]}" ]] || fail "IPA SwiftSupport layout is not canonical"
    swift_support_libraries=()
    while IFS= read -r candidate; do
      swift_support_libraries+=("$candidate")
    done < <(find "$inspection_root/SwiftSupport/iphoneos" -mindepth 1 -maxdepth 1 -type f -name 'libswift*.dylib' -print | LC_ALL=C sort)
    [[ ${#swift_support_libraries[@]} -eq ${#app_swift_libraries[@]} ]] || fail "IPA SwiftSupport inventory differs from the application"
    [[ "$(find "$inspection_root/SwiftSupport/iphoneos" -mindepth 1 -maxdepth 1 -print | wc -l | tr -d ' ')" == "${#swift_support_libraries[@]}" ]] || fail "IPA SwiftSupport contains a non-library entry"
    for candidate in "${swift_support_libraries[@]}"; do
      file -b -- "$candidate" | grep -Eq '^Mach-O( |$)' || fail "IPA SwiftSupport contains a non-Mach-O library"
      app_library="$app_path/Frameworks/$(basename "$candidate")"
      [[ -f "$app_library" ]] || fail "IPA SwiftSupport library has no application counterpart"
      cmp -s "$candidate" "$app_library" || fail "IPA SwiftSupport library differs from its application counterpart"
    done
    for candidate in "${app_swift_libraries[@]}"; do
      [[ -f "$inspection_root/SwiftSupport/iphoneos/$(basename "$candidate")" ]] || fail "application Swift library is absent from SwiftSupport"
    done
  else
    [[ ${#app_swift_libraries[@]} -eq 0 ]] || fail "IPA SwiftSupport is missing application Swift libraries"
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
icon_representation_unreviewed=false
source_asset_names=()
while IFS= read -r source_asset; do
  source_asset_names+=("$(basename "$source_asset")")
done < <(find "$mobile_root/ios/Runner/Assets.xcassets" -mindepth 1 -maxdepth 1 -type d -print | LC_ALL=C sort)
[[ "${source_asset_names[*]}" == 'AppIcon.appiconset LaunchImage.imageset' ]] ||
  fail "production asset catalog source inventory changed"
[[ -f "$app_path/Assets.car" ]] || fail "compiled asset catalog is absent"
asset_car_before_sha256=$(sha256_file "$app_path/Assets.car")
asset_observation=$(xcrun --sdk iphoneos assetutil --info "$app_path/Assets.car" 2>/dev/null |
  node "$tool_root/tools/ocr-models/verify-ios-asset-catalog.mjs") ||
  fail "compiled asset catalog metadata cannot be observed"
printf '%s\n' "$asset_observation"
compiled_asset_car_sha256=$(sha256_file "$app_path/Assets.car")
[[ "$compiled_asset_car_sha256" == "$asset_car_before_sha256" ]] ||
  fail "compiled asset catalog changed during metadata observation"
printf 'compiled_asset_car_sha256=%s\n' "$compiled_asset_car_sha256"
# These are observed identities only. #1320 owns the signed Xcode baseline.
fail_unreviewed_resource_path() {
  local resource_path_sha resource_class framework_component framework_tail resource_kind resource_depth
  local bundle_component bundle_tail bundle_kind bundle_depth
  resource_path_sha=$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)
  case "$relative_resource" in
    Frameworks/*) resource_class=framework ;;
    *.bundle/*) resource_class=bundle ;;
    *) resource_class=application ;;
  esac
  printf 'unreviewed_resource_path_sha256=%s resource_class=%s\n' \
    "$resource_path_sha" "$resource_class" >&2
  if [[ "$resource_class" == bundle ]]; then
    bundle_component=${relative_resource%%.bundle/*}.bundle
    bundle_tail=${relative_resource#"$bundle_component"/}
    case "$bundle_tail" in
      *.plist) bundle_kind=plist ;;
      *.xcprivacy) bundle_kind=privacy ;;
      *.json) bundle_kind=json ;;
      *.strings) bundle_kind=strings ;;
      *) bundle_kind=other ;;
    esac
    bundle_depth=$(printf '%s' "$bundle_tail" | tr -cd '/' | wc -c | tr -d ' ')
    printf 'bundle_component_sha256=%s bundle_tail_sha256=%s resource_kind=%s resource_depth=%s bundle_resource_sha256=%s\n' \
      "$(printf '%s' "$bundle_component" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$(printf '%s' "$bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$bundle_kind" "$bundle_depth" "$(sha256_file "$candidate")" >&2
  fi
  if [[ "$relative_resource" == Frameworks/image_picker_ios.framework/image_picker_ios_privacy.bundle/Info.plist ]]; then
    printf 'unreviewed_privacy_bundle_info_sha256=%s\n' "$(sha256_file "$candidate")" >&2
  fi
  if [[ "$resource_class" == framework ]]; then
    framework_component=${relative_resource#Frameworks/}
    framework_component=${framework_component%%/*}
    framework_tail=${relative_resource#"Frameworks/$framework_component/"}
    case "$framework_tail" in
      *.plist) resource_kind=plist ;;
      *.xcprivacy) resource_kind=privacy ;;
      *.json) resource_kind=json ;;
      *.strings) resource_kind=strings ;;
      *.dat|*.bin) resource_kind=data ;;
      *) resource_kind=other ;;
    esac
    resource_depth=$(printf '%s' "$framework_tail" | tr -cd '/' | wc -c | tr -d ' ')
    printf 'framework_component_sha256=%s framework_tail_sha256=%s resource_kind=%s resource_depth=%s\n' \
      "$(printf '%s' "$framework_component" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$(printf '%s' "$framework_tail" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$resource_kind" "$resource_depth" >&2
    if [[ "$resource_depth" == 1 && ( "$resource_kind" == privacy || "$resource_kind" == plist ) ]]; then
      printf 'unreviewed_framework_resource_sha256=%s\n' "$(sha256_file "$candidate")" >&2
    fi
  fi
  fail "production application contains an unreviewed resource path"
}
is_reviewed_pre_native_baseline_resource() {
  local bundle_component bundle_tail component_sha path_sha tail_sha byte_sha
  [[ "$mode" == unsigned && "$artifact_class" == size-measurement &&
    "$source_sha" == e4d4edd0d6854845cc67b00924f6d22af6a70688 &&
    "$relative_resource" == *.bundle/* ]] || return 1
  bundle_component=${relative_resource%%.bundle/*}.bundle
  bundle_tail=${relative_resource#"$bundle_component"/}
  component_sha=$(printf '%s' "$bundle_component" | shasum -a 256 | cut -d ' ' -f 1)
  path_sha=$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)
  tail_sha=$(printf '%s' "$bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)
  # One additional privacy manifest was observed after all five pinned files
  # in the fixed unsigned size baseline. Bind its component, direct tail,
  # relative path, and bytes; no other file in that bundle is reviewed.
  if [[ "$component_sha" == be715e85d5f4f57413f61b531918c4ecd57ce571ac5638c957f1c30880f640ac &&
    "$bundle_tail" == PrivacyInfo.xcprivacy &&
    "$path_sha" == 9a9f78244f66debf784883ab0e7dcb515bafc45066b14054e8a0b5bc7207ee12 &&
    "$tail_sha" == 6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226 ]]; then
    byte_sha=$(sha256_file "$candidate" 2>/dev/null) || return 1
    [[ "$byte_sha" == 47226a29608df206ad0a110e6afeb5a77ff575ac1df9c76bfdb2d6dfb3fafed1 ]]
    return
  fi
  # One localized strings file was observed after all 29 privacy metadata
  # identities in hosted unsigned-size job 108754478930. Admit only its
  # exact historical path, component, direct localized tail, and bytes.
  if [[ "$component_sha" == ce1c3886deab82acd18ba2aa80def98e34cf86e714639dd744f82482d49cfc2c &&
    "$bundle_tail" =~ ^[^/]+/[^/]+\.strings$ &&
    "$path_sha" == ae21ad45c956d823328afa166d6a6ba27caf7183985a07ddeb79369a6df2b785 &&
    "$tail_sha" == 6cd869293d722a973916e2242f1c5d8fcbf55898ec280a23f962a90909a7a8a5 ]]; then
    byte_sha=$(sha256_file "$candidate" 2>/dev/null) || return 1
    [[ "$byte_sha" == 6c8d836a96d43c6618bdbd7cd2dc13a3ed4ddca443d2168e40488209e393980b ]]
    return
  fi
  [[ "$component_sha" == e1c52c24d9324d76c00df7774c64f4d3256f28ed458bdd51abb27bce67640925 ]] || return 1
  byte_sha=$(sha256_file "$candidate" 2>/dev/null) || return 1
  case "$path_sha:$tail_sha:$byte_sha" in
    # Five files observed together in the fixed pre-native baseline bundle in
    # hosted job 108593887895: three strings, one opaque resource, one plist.
    2acd809e558c9d1a7c08069eb361c296a3125e94820b015f99082288d66fc285:7bd67f215974b512446d5ff4725574d4bd7f64417b5120c4a4f55d854b95b671:288d39f3e5c57b1a268e746a96759c839077b2e7a0f42d5f025ba0060986373b|\
    d2736eac556c5bae12db2e4b6c2a2b02cd36a490e26388b65527feecb84cd5ed:639261fd474c06142a4e2036b16fdb8a3ee1526da0dc2eaedd69246bb830fa80:efd39647cbb35228a962f5d397757839f13c1c6360417a7822ce428d1a44ae61|\
    b3d731c55e13078a1d0e953e07d37c614133f4c1c3df65f1db1dcffbf3437226:e8bf176ab46545c803ef0db2bdefe57bf6ea302149d36257aaecca3e5118d172:48323c9991f72b12d5df9852aa33f50daa13fd4afb447ddb995f8c9e3327c79e|\
    bd2a59d6d3ebe4da870b642e5bff0b3e6a7cb3e0374795bcbeb88eb2a8dcc379:d05a82bd3911e6fb696a4236f1948edcd980cf709fbd6870eeb4ac6e4d5dad9f:4ce5093174371d9711f34278532b4d5c9a7c2783739f361ab96c9ccd919ea432|\
    c3ffe9ac14280d7ed96202c11fec46984b14e8204ec3e504176906ecbdcc4c69:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:edceaa1270b4ce30b8af310bae530f8338239e98c675139b9646d5a6150a2ab1) return 0 ;;
    *) return 1 ;;
  esac
}
# The fixed pre-native source produced these 29 exact Info.plist and
# PrivacyInfo.xcprivacy tuples in hosted job 108727015113. This admits only
# unsigned size measurement of that historical source, never signed release.
is_reviewed_pre_native_baseline_privacy_metadata() {
  local bundle_component bundle_tail component_sha path_sha tail_sha byte_sha
  [[ "$mode" == unsigned && "$artifact_class" == size-measurement &&
    "$source_sha" == e4d4edd0d6854845cc67b00924f6d22af6a70688 &&
    "$relative_resource" == *.bundle/* ]] || return 1
  bundle_component=${relative_resource%%.bundle/*}.bundle
  bundle_tail=${relative_resource#"$bundle_component"/}
  case "$bundle_tail" in Info.plist|PrivacyInfo.xcprivacy) ;; *) return 1 ;; esac
  component_sha=$(printf '%s' "$bundle_component" | shasum -a 256 | cut -d ' ' -f 1)
  path_sha=$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)
  tail_sha=$(printf '%s' "$bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)
  byte_sha=$(sha256_file "$candidate" 2>/dev/null) || return 1
  case "$path_sha:$component_sha:$tail_sha:$byte_sha" in
    b6dd3f03fffbd7c4922f613d283b8a6b560a736823ebba3fa8bc4e605139e487:92ec8eb237c2c98d1cb240fea6b7b0a52b123fae48a746c070f61ad38f83ca08:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:29e3f390765da5188f59c9ee880f373dacddd2b5cc9fb5e963df9383b01c2eaf|\
    c3ffe9ac14280d7ed96202c11fec46984b14e8204ec3e504176906ecbdcc4c69:e1c52c24d9324d76c00df7774c64f4d3256f28ed458bdd51abb27bce67640925:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:edceaa1270b4ce30b8af310bae530f8338239e98c675139b9646d5a6150a2ab1|\
    19e04cd1cf27ba7af1e2f1e19aac8e9f703ecb0afa715e4828df62f4e89f207f:cc3e4894b1d9b0a77f904b9ebb8908e4236fec7ab80fbb2905d2158f17404ff2:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:67dad963fdc74520890bf33e00938ecf3da53e70f6e75fb8b085d406df4abe03|\
    e682169078380698769fe628ddbb284fced5df17d595a164ad8456eb5dc7a416:cc3e4894b1d9b0a77f904b9ebb8908e4236fec7ab80fbb2905d2158f17404ff2:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:74b0cd72fc23c1ef302f22ee2753f61817cdc5af0ff7a7f2d0632b524fb8acea|\
    d1080576213b90f002681fd57026cc038d808ccf65ab67c5d693a34186712dd3:cd6a56c5b0692f7b79880373d7a80ada72343d480143c938c5481d09db6575cd:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:a4869d3ec2a050d4feeba05b742b57e352e492cd44af219d1bef08f21da39ae6|\
    08d3cf2e854573a782b48fac7e3b3c08236886efc7924de9552289dff6c2142c:cd6a56c5b0692f7b79880373d7a80ada72343d480143c938c5481d09db6575cd:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:3e4a93cbe86acef7dd7e063a28c849992f556e7f52cadc5f37c1e8b0e1b54686|\
    c610191e97a42c5ccb70557a3502c98a8731d11b5d3adccf75ff6517dba5dc18:9fc7aa6df586c7bc00246742b2f6375143e778d4077f1540da3447695773c3bc:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:f7ea4676217172a9b130a6a97174b7e860f25ede0fdc8caa5b59e734ee12af7b|\
    132338dbe63733711cd6be4d58ed6a12f63dbd54da6050c985b682e4ccd39461:9fc7aa6df586c7bc00246742b2f6375143e778d4077f1540da3447695773c3bc:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:cfbb3c4f76a66d53698bae91f7110c00f2148e6e6f13ad7d32592909bc010e51|\
    c984191c007fc77c5ddfcab494c3c9401e6a10f9154c99939515950212c5c1d8:7b23d53002741faf1c7c7f4c287ab08ea172e05511db32cf62065dd38349ac57:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:154f1499ca7e455aa387509666d9bd8ed86fbdbbba15f1ea6dc74bc74fb89c45|\
    72b0927fc266e7631bade6a77be283097dde2e17789102b880a548f55047538d:7b23d53002741faf1c7c7f4c287ab08ea172e05511db32cf62065dd38349ac57:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:3e4a93cbe86acef7dd7e063a28c849992f556e7f52cadc5f37c1e8b0e1b54686|\
    de83719ca26fd32621f5f7d82428dee8156570b86891c6222e8b4314fcc69ed5:4726ca2bee54dd602ce28c96fb2ec19473e07e1cfa6dcab003c1e857cf4eb0b1:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:1a93db69e5f73983aa5a92283f3cd7b830a894ac5a3917efa52910b2da1894b8|\
    58e8c85b1bf2e3194beda7e2a506b905347508c981ef4d1218cf54e954dc812b:4726ca2bee54dd602ce28c96fb2ec19473e07e1cfa6dcab003c1e857cf4eb0b1:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:74b0cd72fc23c1ef302f22ee2753f61817cdc5af0ff7a7f2d0632b524fb8acea|\
    53020f71c7e47127d7937591d0ae6acee13b93538989c6ad66517517bb26a7de:6405cb112e7a117dbafd7b130aa0aa1e54d55486a06ba672cf56a053889fcdf9:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:4610ae8cb2f2a511b8c0a829d77f39d807608b324f749ae428947e25b107fb5f|\
    2dc7008d90a5a2630c9ea38eeec46d6da756079c75572a3824985b59368b10de:6405cb112e7a117dbafd7b130aa0aa1e54d55486a06ba672cf56a053889fcdf9:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:f81b5cf8f043662712eca9e9785767264cf190025fe7bdb49777296c068de53c|\
    0594b62230f7523e0d128237dfca7f3236ebc1b89580841088095fccabf201b1:13e74f34ae4c9b35b25b715347835a5ec61ae88fabde566591121c1e205ea4c3:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:8acd771356d9ae297dcb72876b232580832c516b82755e575fc3cb0de3f1a6f8|\
    2a405099cda58f85ca8ee09be252ac7363f5df8db1fb473c53381f1e8f13d70f:13e74f34ae4c9b35b25b715347835a5ec61ae88fabde566591121c1e205ea4c3:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:729ba3cbd0f458c78cd61edf17350edafe0e34ca86e314ec64c8cb22ccd21b54|\
    564afb38edaab7c37e54c2a7292285e50713e173482ef34385e5ae6ff172ac77:1a7f63edbc56c3379d6705387d13b2c607b872e6230a186959cca4959a88ee1c:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:222e4a716f5dc5074c5a2eddfeec2cdba50057909e53f5f52bfded1863a7933c|\
    6684e36c4cb066efc6c981e6a85258a73d5ea0a45f315b8f7fb9ef597e4b21ea:eab2332510081b8a1649b855c70963126cafc236307f8a0397c11fe6c4a4b811:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:659ea9509f4638fd62b82ce5cb91b3b6f302db8d3ea9c0ff921b712c05a3d5eb|\
    47f4b20de8a10914c5c3525329fb2bf2e2411c7a6bc236315227743c0d12feb3:eab2332510081b8a1649b855c70963126cafc236307f8a0397c11fe6c4a4b811:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:03b2c70833a331a2b1efd11ff168ed02a8eadfd5e7d1fbf30eecc7509a4aea47|\
    fe0c9fb20cc8fb6a13ad8e82fa0d4aee4224714e88d33c8b66ce8afc170bbbbb:8ce7a2d18052f2f10f3065fc88825f3c419e42c26fa9977f03b10b7e23f184c4:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:d90b7724c91e9d074235e8022c7690ef76b9b8841264d094eb091988a59c6e0d|\
    b6c282af8c2e84f89c941d63db2dd386d4ee705f7fe89282d1c7462c85b6ea0b:8ce7a2d18052f2f10f3065fc88825f3c419e42c26fa9977f03b10b7e23f184c4:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:8d65d0b43a1262cfe29e83396c00b3db94fb120d44d1188d927341f14a6c223c|\
    40e2477cd3464cc75419d024148b9d74189b525600b42fa54b2262cde65023bc:ce1c3886deab82acd18ba2aa80def98e34cf86e714639dd744f82482d49cfc2c:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:002cf79e50a387da98a1b149d5c51b67dc5db3917a65f48a31af76b6dba4c49a|\
    f442563f888388dae52c1beda94d82df17c1b41bc5d3a694464e006ab95ddf66:ce1c3886deab82acd18ba2aa80def98e34cf86e714639dd744f82482d49cfc2c:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:521eb6ef8430773e5c010e1838fe9dd8fa5d62b7b76d1cea8d7d8daadcb144e2|\
    5c5854ad022cd67fd6091734600edcb1ce22668f7a1fcc240691e933fb6e0c26:636e77fd55b26f7d015c8601dc213d166ff14e4fa1a83c335028ebd0b43af481:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:57717088f6e17a4db89553f8989d7b27051d80bc563066352720873582bc756a|\
    9dc2292fcaaa46a28313b3d7e53299d2bbc193d1841bf7327e31d49dd291b935:636e77fd55b26f7d015c8601dc213d166ff14e4fa1a83c335028ebd0b43af481:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:47226a29608df206ad0a110e6afeb5a77ff575ac1df9c76bfdb2d6dfb3fafed1|\
    76c6977604d74ae01792f7d00b8150a71f2c1974dd295f813694f85d61201251:be715e85d5f4f57413f61b531918c4ecd57ce571ac5638c957f1c30880f640ac:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:f546fbcf3cb94c4ad9084bc5a470421693bf96166057048818f85b062c417b4c|\
    9a9f78244f66debf784883ab0e7dcb515bafc45066b14054e8a0b5bc7207ee12:be715e85d5f4f57413f61b531918c4ecd57ce571ac5638c957f1c30880f640ac:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:47226a29608df206ad0a110e6afeb5a77ff575ac1df9c76bfdb2d6dfb3fafed1|\
    62990b17534ed29cbab775c53250508e7fa883ffca7b45f695f95b54d53bddfa:26dcc8ac8ea8d62d5f2582fc7cf122e57bf8cf8c5bf6ed0259b75be791a6e9d0:9ac3b5ad93cbc0305c62f78f50b32774a939d7c44fcc380bc5f4d65c9b39efdf:e882865ef709cf3a6386336ee40ae3718c8fbbcf3f8a499d1910026c3f2de230|\
    5c51ac17fea811abf4f787e4c7f1559dd59656ad195132d01e6202ac3fdba49d:26dcc8ac8ea8d62d5f2582fc7cf122e57bf8cf8c5bf6ed0259b75be791a6e9d0:6d123ae8ab04eee632cc6c18a31d71271ad217595dcd4401c63875b4b5c0e226:6d2da0d8d930227d428c1d9363b0ad6e3a12e2c9b68c5ce297158a7412fc8c31) return 0 ;;
    *) return 1 ;;
  esac
}
observe_pre_native_baseline_bundle() {
  [[ "$mode" == unsigned && "$artifact_class" == size-measurement &&
    "$source_sha" == e4d4edd0d6854845cc67b00924f6d22af6a70688 ]] || return 0
  local observed_count=0 candidate relative_resource bundle_component bundle_tail resource_kind resource_depth observed_byte_sha
  while IFS= read -r -d '' candidate; do
    relative_resource=${candidate#"$app_path"/}
    [[ "$relative_resource" == *.bundle/* ]] || continue
    bundle_component=${relative_resource%%.bundle/*}.bundle
    [[ "$(printf '%s' "$bundle_component" | shasum -a 256 | cut -d ' ' -f 1)" == e1c52c24d9324d76c00df7774c64f4d3256f28ed458bdd51abb27bce67640925 ]] || continue
    observed_count=$((observed_count + 1))
    [[ "$observed_count" -le 64 ]] || fail "pre-native baseline bundle resource count exceeds reviewed diagnostic bound"
    bundle_tail=${relative_resource#"$bundle_component"/}
    case "$bundle_tail" in
      *.plist) resource_kind=plist ;;
      *.xcprivacy) resource_kind=privacy ;;
      *.strings) resource_kind=strings ;;
      *) resource_kind=other ;;
    esac
    resource_depth=$(printf '%s' "$bundle_tail" | tr -cd '/' | wc -c | tr -d ' ')
    observed_byte_sha=$(sha256_file "$candidate" 2>/dev/null) ||
      fail "pre-native baseline bundle resource is unreadable"
    printf 'baseline_bundle_path_sha256=%s baseline_bundle_tail_sha256=%s resource_kind=%s resource_depth=%s baseline_bundle_byte_sha256=%s\n' \
      "$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$(printf '%s' "$bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$resource_kind" "$resource_depth" "$observed_byte_sha"
  done < <(find "$app_path" -type f -print0)
  [[ "$observed_count" -eq 5 ]] || fail "pre-native baseline bundle resource count differs from reviewed inventory"
  printf 'baseline_bundle_resource_count=%s\n' "$observed_count"
}
observe_pre_native_privacy_bundle_inventory() {
  [[ "$mode" == unsigned && "$artifact_class" == size-measurement &&
    "$source_sha" == e4d4edd0d6854845cc67b00924f6d22af6a70688 ]] || return 0
  local observed_count=0 candidate relative_resource bundle_component bundle_tail observed_byte_sha
  while IFS= read -r candidate; do
    relative_resource=${candidate#"$app_path"/}
    case "$relative_resource" in
      *.bundle/Info.plist|*.bundle/PrivacyInfo.xcprivacy|*.bundle/_CodeSignature/CodeResources) ;;
      *) continue ;;
    esac
    observed_count=$((observed_count + 1))
    [[ "$observed_count" -le 128 ]] || fail "pre-native privacy bundle inventory exceeds reviewed diagnostic bound"
    [[ -f "$candidate" && ! -L "$candidate" ]] || fail "pre-native privacy bundle resource is not a regular file"
    bundle_component=${relative_resource%%.bundle/*}.bundle
    bundle_tail=${relative_resource#"$bundle_component"/}
    observed_byte_sha=$(sha256_file "$candidate" 2>/dev/null) ||
      fail "pre-native privacy bundle resource is unreadable"
    printf 'baseline_privacy_path_sha256=%s baseline_privacy_component_sha256=%s baseline_privacy_tail_sha256=%s baseline_privacy_byte_sha256=%s\n' \
      "$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$(printf '%s' "$bundle_component" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$(printf '%s' "$bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$observed_byte_sha"
  done < "$inventory_file"
  printf 'baseline_privacy_bundle_inventory_count=%s\n' "$observed_count"
}
reviewed_other_bundle_inventory=''
observe_pre_native_other_bundle_inventory() {
  [[ "$mode" == unsigned && "$artifact_class" == size-measurement &&
    "$source_sha" == e4d4edd0d6854845cc67b00924f6d22af6a70688 ]] || return 0
  reviewed_other_bundle_inventory=''
  local observed_count=0 candidate relative_resource bundle_component bundle_tail resource_kind resource_depth observed_byte_sha observed_line observed_inventory_sha
  local -a observed_lines=()
  while IFS= read -r candidate; do
    relative_resource=${candidate#"$app_path"/}
    case "$relative_resource" in
      *.bundle/Info.plist|*.bundle/PrivacyInfo.xcprivacy|*.bundle/_CodeSignature/CodeResources) continue ;;
      *.bundle/*) ;;
      *) continue ;;
    esac
    [[ -d "$candidate" && ! -L "$candidate" ]] && continue
    observed_count=$((observed_count + 1))
    [[ "$observed_count" -le 256 ]] || fail "pre-native other bundle inventory exceeds reviewed diagnostic bound"
    [[ -f "$candidate" && ! -L "$candidate" ]] || fail "pre-native other bundle resource is not a regular file"
    bundle_component=${relative_resource%%.bundle/*}.bundle
    bundle_tail=${relative_resource#"$bundle_component"/}
    case "$bundle_tail" in
      *.strings) resource_kind=strings ;;
      *.plist) resource_kind=plist ;;
      *.xcprivacy) resource_kind=privacy ;;
      *.json) resource_kind=json ;;
      *) resource_kind=other ;;
    esac
    resource_depth=$(printf '%s' "$bundle_tail" | tr -cd '/' | wc -c | tr -d ' ')
    observed_byte_sha=$(sha256_file "$candidate" 2>/dev/null) ||
      fail "pre-native other bundle resource is unreadable"
    observed_line=$(printf 'baseline_other_bundle_path_sha256=%s baseline_other_bundle_component_sha256=%s baseline_other_bundle_tail_sha256=%s resource_kind=%s resource_depth=%s baseline_other_bundle_byte_sha256=%s' \
      "$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$(printf '%s' "$bundle_component" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$(printf '%s' "$bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)" \
      "$resource_kind" "$resource_depth" "$observed_byte_sha")
    printf '%s\n' "$observed_line"
    observed_lines+=("$observed_line")
  done < "$inventory_file"
  printf 'baseline_other_bundle_inventory_count=%s\n' "$observed_count"
  # Hosted job 108785332951 observed all 63 resource identities together in
  # the fixed historical unsigned size baseline. Commit to the sorted complete
  # path/component/tail/kind/depth/byte inventory. An extra or changed file
  # invalidates the whole inventory; this never authorizes signed release.
  if [[ "$observed_count" -eq 63 ]]; then
    reviewed_other_bundle_inventory=$(printf '%s\n' "${observed_lines[@]}" | LC_ALL=C sort)
    observed_inventory_sha=$(printf '%s\n' "$reviewed_other_bundle_inventory" | shasum -a 256 | cut -d ' ' -f 1)
    if [[ "$observed_inventory_sha" != cf2042eb75c1d738afcad7c9f0ef7b3202a1f68059d270e6015881c9a1365990 ]]; then
      reviewed_other_bundle_inventory=''
    fi
  fi
}
is_reviewed_pre_native_other_bundle_resource() {
  local bundle_component bundle_tail resource_kind resource_depth observed_line reviewed_byte_sha
  [[ "$mode" == unsigned && "$artifact_class" == size-measurement &&
    "$source_sha" == e4d4edd0d6854845cc67b00924f6d22af6a70688 &&
    "$relative_resource" == *.bundle/* && -n "$reviewed_other_bundle_inventory" &&
    -f "$candidate" && ! -L "$candidate" ]] || return 1
  bundle_component=${relative_resource%%.bundle/*}.bundle
  bundle_tail=${relative_resource#"$bundle_component"/}
  case "$bundle_tail" in
    *.strings) resource_kind=strings ;;
    *.plist) resource_kind=plist ;;
    *.xcprivacy) resource_kind=privacy ;;
    *.json) resource_kind=json ;;
    *) resource_kind=other ;;
  esac
  resource_depth=$(printf '%s' "$bundle_tail" | tr -cd '/' | wc -c | tr -d ' ')
  reviewed_byte_sha=$(sha256_file "$candidate" 2>/dev/null) || return 1
  observed_line=$(printf 'baseline_other_bundle_path_sha256=%s baseline_other_bundle_component_sha256=%s baseline_other_bundle_tail_sha256=%s resource_kind=%s resource_depth=%s baseline_other_bundle_byte_sha256=%s' \
    "$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)" \
    "$(printf '%s' "$bundle_component" | shasum -a 256 | cut -d ' ' -f 1)" \
    "$(printf '%s' "$bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)" \
    "$resource_kind" "$resource_depth" "$reviewed_byte_sha")
  grep -Fxq -- "$observed_line" <<< "$reviewed_other_bundle_inventory"
}
fail_unreviewed_opaque_resource() {
  local relative_resource=${candidate#"$app_path"/}
  printf 'unreviewed_opaque_path_sha256=%s unreviewed_opaque_sha256=%s\n' \
    "$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)" \
    "$(sha256_file "$candidate")" >&2
  fail "production application contains an unreviewed opaque resource"
}
compiled_storyboard_nib_count=0
is_reviewed_compiled_storyboard_nib() {
  # Four Xcode 16.4 iphoneos Release nibs observed from exact source 6f7c8d7b
  # in job 108246696371. The tracked storyboard sources and toolchain remain
  # bound by the canonical production wrapper; this is not a signed baseline.
  case "$1:$2" in
    79b50384bcd97f98ef991ad5d6328a0e68a467d97e1856c3b5da16c766f16aa0:6f2e96b21c175a06c4622032d9bbe1d14b634956b7130c9290d15cd456b319d6|\
    3b45d86bcc78a2634049ebd2c637bde2be37e96d4edb91e14a0ee8164ea3ef3a:54f3637f671feba5f19e82ec4f4a7fb448bb3cfc0fb180f089aa571fc8f053e2|\
    6e2ddab6bc4276bf991e29c08aa937c8d023ed25e0cd9e2efca010dd3187292e:058fe138c3b415c0a5f2608c42a8d56c579bf10f7b7351bd947b1c7eca4714d9|\
    77485951f0a486f3a744e8fb3ddd5ade66e1af8f64cf365dd1370f7e5acb60a0:cbdd28d89423b2c9beef2b27ce2c9608d30d6c6a9d2e7679f79a53814444e53f) return 0 ;;
    *) return 1 ;;
  esac
}
for compiled_nib in "$app_path"/Base.lproj/*.storyboardc/*.nib; do
  [[ -f "$compiled_nib" ]] || continue
  compiled_storyboard_nib_count=$((compiled_storyboard_nib_count + 1))
  [[ "$compiled_storyboard_nib_count" -le 16 ]] ||
    fail "production storyboard nib inventory is unbounded"
  compiled_nib_relative=${compiled_nib#"$app_path"/}
  [[ "$compiled_nib_relative" =~ ^Base\.lproj/[^/]+\.storyboardc/[^/]+\.nib$ ]] ||
    fail "production storyboard nib path is unreviewed"
  compiled_nib_path_sha=$(printf '%s' "$compiled_nib_relative" | shasum -a 256 | cut -d ' ' -f 1)
  compiled_nib_sha=$(sha256_file "$compiled_nib")
  printf 'compiled_storyboard_nib_path_sha256=%s compiled_storyboard_nib_sha256=%s\n' \
    "$compiled_nib_path_sha" "$compiled_nib_sha"
  is_reviewed_compiled_storyboard_nib "$compiled_nib_path_sha" "$compiled_nib_sha" ||
    fail "production storyboard nib differs from reviewed Xcode bytes"
done
[[ "$compiled_storyboard_nib_count" -eq 4 ]] ||
  fail "production storyboard nib inventory differs from reviewed Xcode output"
observe_pre_native_baseline_bundle
observe_pre_native_privacy_bundle_inventory
observe_pre_native_other_bundle_inventory
while IFS= read -r candidate; do
  # Bind opaque generated resources before file(1) classifies their bytes.
  case "$candidate" in
    "$app_path"/Frameworks/App.framework/flutter_assets/AssetManifest.bin)
      observed_asset_manifest_sha=$(sha256_file "$candidate")
      if [[ "$observed_asset_manifest_sha" != 00af55ad3d6f21898fe77e0ff092d1a1cda52c941b6860e9928d45c8af8c095d ]]; then
        printf 'asset_manifest_sha256=%s\n' "$observed_asset_manifest_sha" >&2
        fail "production Flutter asset manifest differs from reviewed Release bytes"
      fi ;;
    "$app_path"/Base.lproj/*.storyboardc/*.nib)
      relative_nib=${candidate#"$app_path"/}
      if [[ "$relative_nib" =~ ^Base\.lproj/[^/]+\.storyboardc/[^/]+\.nib$ ]]; then
        candidate_nib_path_sha=$(printf '%s' "$relative_nib" | shasum -a 256 | cut -d ' ' -f 1)
        candidate_nib_sha=$(sha256_file "$candidate")
        is_reviewed_compiled_storyboard_nib "$candidate_nib_path_sha" "$candidate_nib_sha" ||
          fail "production storyboard nib changed after inventory verification"
        continue
      fi ;;
    "$app_path"/Base.lproj/*.nib)
      relative_nib=${candidate#"$app_path"/}
      if [[ "$relative_nib" =~ ^Base\.lproj/[^/]+\.nib$ ]]; then
        printf 'unreviewed_compiled_nib_sha256=%s\n' "$(sha256_file "$candidate")" >&2
        fail "production compiled nib has no reviewed byte identity"
      fi ;;
  esac
  file_description=$(file -b "$candidate")
  if [[ "$file_description" == Mach-O* && "$candidate" == "$app_path"/* ]]; then
    relative_resource=${candidate#"$app_path"/}
    case "$relative_resource" in
      Runner) ;;
      Frameworks/*.framework/*)
        [[ "$relative_resource" =~ ^Frameworks/([^/]+)\.framework/([^/]+)$ ]] || fail_unreviewed_resource_path
        framework_name=${BASH_REMATCH[1]}
        [[ "$framework_name" == "${BASH_REMATCH[2]}" ]] || fail_unreviewed_resource_path
        case "$framework_name" in
          App|Flutter|file_picker|flutter_secure_storage_darwin|google_mlkit_commons|google_mlkit_text_recognition|image_picker_ios|GoogleDataTransport|GoogleMLKit|GoogleToolboxForMac|GoogleUtilities|GTMSessionFetcher|MLImage|MLKitCommon|MLKitTextRecognition|MLKitTextRecognitionCommon|MLKitVision|nanopb|objective_c|onnxruntime|onnxruntime-c|onnxruntime-objc|OpenCV|PromisesObjC|FBLPromises|Yams) ;;
          *) fail_unreviewed_resource_path ;;
        esac ;;
      Frameworks/libswift*.dylib)
        [[ "$relative_resource" =~ ^Frameworks/libswift[A-Za-z0-9_]+\.dylib$ ]] || fail_unreviewed_resource_path ;;
      *) fail_unreviewed_resource_path ;;
    esac
  fi
  if [[ "$file_description" != Mach-O* ]]; then
    [[ "$candidate" == "$app_path"/* ]] || fail "production application contains an unreviewed resource path"
    relative_resource=${candidate#"$app_path"/}
    case "$relative_resource" in
      Info.plist|PkgInfo|Assets.car|embedded.mobileprovision|en.lproj/InfoPlist.strings|_CodeSignature/CodeResources|Frameworks/App.framework/flutter_assets/AssetManifest.bin|Frameworks/App.framework/flutter_assets/AssetManifest.json|Frameworks/App.framework/flutter_assets/FontManifest.json) ;;
      Frameworks/Flutter.framework/icudtl.dat)
        # Exact Flutter 3.44.8 ios-release engine resource, content hash
        # 13ffd72b2f9a5ca4db2a74ea52d5353ec2e8f939.
        [[ "$(sha256_file "$candidate")" == 998367809a821d595928089c197b3f7959f0420f81f79d4d0daee53378492ed5 ]] ||
          fail "packaged Flutter ICU differs from the reviewed toolchain resource" ;;
      AppFrameworkInfo.plist)
        [[ "$(sha256_file "$mobile_root/ios/Flutter/AppFrameworkInfo.plist")" == da12038f9b2688a8a26160fea2609fa8fcb11421448c109f09c0f573efe7698d ]] ||
          fail "reviewed AppFrameworkInfo source differs from pinned identity"
        observed_app_framework_sha=$(sha256_file "$candidate")
        # Exact Xcode 16.4 simulator output observed in run 36108851718;
        # this is no claim about a signed release package.
        if [[ "$observed_app_framework_sha" != 275c1f7273e185d2d65f8b447af25841e2be7fbdb3df89feb6324634f33ce317 ]]; then
          printf 'app_framework_info_sha256=%s\n' "$observed_app_framework_sha" >&2
          fail "production AppFrameworkInfo resource differs from reviewed Xcode output"
        fi ;;
      # Exact Flutter-generated assets from the reviewed Flutter 3.44.8
      # package. The iOS compressed notices identity was observed in exact-head
      # unsigned package job 108382318967 after prior package gates passed.
      # The iOS native-assets index was observed in exact-head job 108386436381
      # after the same preceding package gates.
      Frameworks/App.framework/flutter_assets/NativeAssetsManifest.json) expected_flutter_asset_sha=625b2ddedce42e3d218ceb8869bc9119e8dea8650a6cb24ab779d5008055b141 ;;
      Frameworks/App.framework/flutter_assets/NOTICES.Z) expected_flutter_asset_sha=73f6eae191a87b9e96ff32d4c255978e3769125b777b8288ee501a066f2bcd22 ;;
      Frameworks/App.framework/flutter_assets/fonts/MaterialIcons-Regular.otf) expected_flutter_asset_sha=e4aae88917aea920dfba979f19616d87669655d003444d3b1a110b685b88a0ed ;;
      Frameworks/App.framework/flutter_assets/packages/cupertino_icons/assets/CupertinoIcons.ttf) expected_flutter_asset_sha=67c44fe9183b002e79dde7f6977e2988661c9a3e4a3c5fce968787efdbed823c ;;
      Frameworks/App.framework/flutter_assets/shaders/ink_sparkle.frag) expected_flutter_asset_sha=62ce4ba6e34254371ffdfb8e0670afcc5314f4452edf5ee70afcf079f2ed7ea2 ;;
      Frameworks/App.framework/flutter_assets/shaders/stretch_effect.frag) expected_flutter_asset_sha=21cdf2ecc9b113671fb228620d952ebae0f102a78a39a9df89b6ebdf6aec315a ;;
      Frameworks/Flutter.framework/Headers/*.h|Frameworks/Flutter.framework/Modules/module.modulemap)
        # Exact Flutter 3.44.8 ios-release engine archive 0cd610717bde;
        # retain only its reviewed framework headers and module map.
        case "$relative_resource" in
          Frameworks/Flutter.framework/Headers/FlutterSceneDelegate.h) expected_flutter_engine_resource_sha=1bdbab65e137d7695d6b391e3ffeecbadd2dda103795f72ec47452b8b9a3fa06 ;;
          Frameworks/Flutter.framework/Headers/FlutterEngine.h) expected_flutter_engine_resource_sha=29528cda49a2619ac88f2a31be72b314af4e543918315dfaf11e5622c200742a ;;
          Frameworks/Flutter.framework/Headers/FlutterChannels.h) expected_flutter_engine_resource_sha=920d7de42def64b88e9fc29e150532ec3a15b80f55643a6aa012d59fae2e19a2 ;;
          Frameworks/Flutter.framework/Headers/FlutterPlugin.h) expected_flutter_engine_resource_sha=c8ade438c856f678d4fe247e0b70749553195714bda4d258dd1431af88439b03 ;;
          Frameworks/Flutter.framework/Headers/FlutterAppDelegate.h) expected_flutter_engine_resource_sha=7a1ba667654203dc4e5c123fee042e9cf980827f5c2698992834bda7c5d6aa46 ;;
          Frameworks/Flutter.framework/Headers/FlutterTexture.h) expected_flutter_engine_resource_sha=25ca4de1af6cbfac729e50f7462eb5d4de72f87a2ea545a9da1cab21707f23c6 ;;
          Frameworks/Flutter.framework/Headers/FlutterEngineGroup.h) expected_flutter_engine_resource_sha=4aacef231a815c427753d2c9df6842117b2b1f63f5ea0ba643e810c7a3dd95fe ;;
          Frameworks/Flutter.framework/Headers/FlutterPlatformViews.h) expected_flutter_engine_resource_sha=d1a53db8ce90729ce6669b8560e6e3f5d1a51849132a8c0f304449410745d8fe ;;
          Frameworks/Flutter.framework/Headers/FlutterHeadlessDartRunner.h) expected_flutter_engine_resource_sha=9e6663669bc5097af281fe14f5a3e4362f15708edc2f902d03e098e6e51620bd ;;
          Frameworks/Flutter.framework/Headers/FlutterCodecs.h) expected_flutter_engine_resource_sha=672aa51d8b996e915ebd57a7cbd59d974ad51604bbb33232b2c4a20b269a7853 ;;
          Frameworks/Flutter.framework/Headers/Flutter.h) expected_flutter_engine_resource_sha=c1f5b26a03d82c2451dbec13b8645bb56df3df3d80592f98171ba204e15d4a36 ;;
          Frameworks/Flutter.framework/Headers/FlutterViewController.h) expected_flutter_engine_resource_sha=e2336e4d76c2899c2aa71d253a64dd292183b3ebaba237681a95ce2bac09a9a5 ;;
          Frameworks/Flutter.framework/Headers/FlutterMacros.h) expected_flutter_engine_resource_sha=79b0551d265c52701b378851718ab7b6db7afbecf561b73c2954988554e80f99 ;;
          Frameworks/Flutter.framework/Headers/FlutterDartProject.h) expected_flutter_engine_resource_sha=53cabfd086edf6ae0ed8732c09d530213b49753c7c2e3865c7ed1a63cddf1fab ;;
          Frameworks/Flutter.framework/Headers/FlutterHourFormat.h) expected_flutter_engine_resource_sha=43848b1528212ffe441493f22e0ecf362f49ff1a645557f3ae8d15422407b6b6 ;;
          Frameworks/Flutter.framework/Headers/FlutterPluginAppLifeCycleDelegate.h) expected_flutter_engine_resource_sha=f8f327fb94838f655de9153c09022dfc9625dd3fbc0e1a7b1c89aa033a1ca0d9 ;;
          Frameworks/Flutter.framework/Headers/FlutterBinaryMessenger.h) expected_flutter_engine_resource_sha=1170e4e2dfbba82a724246abfaaf561ea63d6dc2bc7b2a210b0195b41261332f ;;
          Frameworks/Flutter.framework/Headers/FlutterCallbackCache.h) expected_flutter_engine_resource_sha=d21f7ebcae4afabf26a13b221817ecebe4ccf50a20d3cf5a7c7032de06dcc035 ;;
          Frameworks/Flutter.framework/Headers/FlutterSceneLifeCycle.h) expected_flutter_engine_resource_sha=b4d90b84efbe3ce2f8db38397e312fe7f0c97d0ad7bbca8763a24b6ebf2d2217 ;;
          Frameworks/Flutter.framework/Modules/module.modulemap) expected_flutter_engine_resource_sha=d158eb891a59ec065968fff498c00f3093e18ba2e8301e0c857ccbe63db8b46b ;;
          *) fail_unreviewed_resource_path ;;
        esac
        [[ "$(sha256_file "$candidate")" == "$expected_flutter_engine_resource_sha" ]] ||
          fail "packaged Flutter engine resource differs from reviewed toolchain bytes" ;;
      AppIcon*.png) [[ "$relative_resource" =~ ^AppIcon[^/]*\.png$ ]] || fail_unreviewed_resource_path ;;
      receipt_ocr_models/*) ;; # verify-mobile-package enforces the exact recursive model inventory.
      Base.lproj/*.storyboardc/*) [[ "$relative_resource" =~ ^Base\.lproj/[^/]+\.storyboardc/[^/]+$ ]] || fail_unreviewed_resource_path ;;
      Base.lproj/*.nib) [[ "$relative_resource" =~ ^Base\.lproj/[^/]+\.nib$ ]] || fail_unreviewed_resource_path ;;
      *.bundle/Info.plist|*.bundle/PrivacyInfo.xcprivacy|*.bundle/_CodeSignature/CodeResources)
        [[ "$relative_resource" =~ ^([^/]+\.bundle|Frameworks/[^/]+\.framework/[^/]+\.bundle)/(Info\.plist|PrivacyInfo\.xcprivacy|_CodeSignature/CodeResources)$ ]] ||
          fail_unreviewed_resource_path
        bundle_name=${relative_resource%%.bundle/*}
        bundle_name=${bundle_name##*/}
        case "$bundle_name" in
          file_picker_ios_privacy|image_picker_ios_privacy|flutter_secure_storage|GoogleUtilities_Privacy|GoogleDataTransport_Privacy|GoogleToolboxForMac_Privacy|GoogleToolboxForMac_Logger_Privacy|GTMSessionFetcher_Privacy|GTMSessionFetcher_Core_Privacy|MLKitCommon_Privacy|MLKitTextRecognition_Privacy|MLKitTextRecognitionCommon_Privacy|MLKitVision_Privacy|MLImage_Privacy|nanopb_Privacy|OpenCV_Privacy|onnxruntime_privacy|Yams_Privacy|PromisesObjC_Privacy|FBLPromises_Privacy|LatinOCRResources) ;;
          # The fixed pre-native size baseline has one byte-pinned Info.plist
          # in a bundle outside the current production dependency inventory.
          *) if ! is_reviewed_pre_native_baseline_resource &&
               ! is_reviewed_pre_native_baseline_privacy_metadata; then
               diagnostic_byte_sha=$(sha256_file "$candidate" 2>/dev/null) || diagnostic_byte_sha=unavailable
               printf 'unreviewed_privacy_bundle_path_sha256=%s unreviewed_privacy_bundle_byte_sha256=%s\n' \
                 "$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)" \
                 "$diagnostic_byte_sha" >&2
               diagnostic_bundle_component=${relative_resource%%.bundle/*}.bundle
               diagnostic_bundle_tail=${relative_resource#"$diagnostic_bundle_component"/}
               printf 'unreviewed_privacy_bundle_component_sha256=%s unreviewed_privacy_bundle_tail_sha256=%s\n' \
                 "$(printf '%s' "$diagnostic_bundle_component" | shasum -a 256 | cut -d ' ' -f 1)" \
                 "$(printf '%s' "$diagnostic_bundle_tail" | shasum -a 256 | cut -d ' ' -f 1)" >&2
               fail "production application contains an unreviewed privacy bundle"
             fi ;;
        esac
        if [[ "$relative_resource" == Frameworks/* ]]; then
          case "$relative_resource" in
            Frameworks/image_picker_ios.framework/image_picker_ios_privacy.bundle/Info.plist)
              [[ "$(sha256_file "$candidate")" == 92fa33c74cf8ae0f8e628a2718c45a8fb16d7e6b1bd33c899ccd1ce9ec437f13 ]] ||
                fail_unreviewed_resource_path ;;
            Frameworks/GoogleToolboxForMac.framework/GoogleToolboxForMac_Privacy.bundle/Info.plist)
              [[ "$(sha256_file "$candidate")" == 1a93db69e5f73983aa5a92283f3cd7b830a894ac5a3917efa52910b2da1894b8 ]] ||
                fail_unreviewed_resource_path ;;
            Frameworks/nanopb.framework/nanopb_Privacy.bundle/PrivacyInfo.xcprivacy)
              [[ "$(sha256_file "$candidate")" == 729ba3cbd0f458c78cd61edf17350edafe0e34ca86e314ec64c8cb22ccd21b54 ]] ||
                fail_unreviewed_resource_path ;;
            Frameworks/nanopb.framework/nanopb_Privacy.bundle/Info.plist)
              [[ "$(sha256_file "$candidate")" == 8acd771356d9ae297dcb72876b232580832c516b82755e575fc3cb0de3f1a6f8 ]] ||
                fail_unreviewed_resource_path ;;
            Frameworks/file_picker.framework/file_picker_ios_privacy.bundle/PrivacyInfo.xcprivacy)
              [[ "$(sha256_file "$candidate")" == 47226a29608df206ad0a110e6afeb5a77ff575ac1df9c76bfdb2d6dfb3fafed1 ]] ||
                fail_unreviewed_resource_path ;;
            Frameworks/file_picker.framework/file_picker_ios_privacy.bundle/Info.plist)
              [[ "$(sha256_file "$candidate")" == 3d3b30c0bc5677bd40fc3dff681a369be2af6b956ec0f15dc59f91650e0740e9 ]] ||
                fail_unreviewed_resource_path ;;
            Frameworks/GoogleDataTransport.framework/GoogleDataTransport_Privacy.bundle/*|Frameworks/GoogleToolboxForMac.framework/GoogleToolboxForMac_Logger_Privacy.bundle/Info.plist|Frameworks/GoogleToolboxForMac.framework/GoogleToolboxForMac_Logger_Privacy.bundle/PrivacyInfo.xcprivacy|Frameworks/GoogleToolboxForMac.framework/GoogleToolboxForMac_Privacy.bundle/PrivacyInfo.xcprivacy|Frameworks/GoogleUtilities.framework/GoogleUtilities_Privacy.bundle/Info.plist|Frameworks/GoogleUtilities.framework/GoogleUtilities_Privacy.bundle/PrivacyInfo.xcprivacy|Frameworks/GTMSessionFetcher.framework/GTMSessionFetcher_Core_Privacy.bundle/Info.plist|Frameworks/GTMSessionFetcher.framework/GTMSessionFetcher_Core_Privacy.bundle/PrivacyInfo.xcprivacy|Frameworks/FBLPromises.framework/FBLPromises_Privacy.bundle/Info.plist|Frameworks/FBLPromises.framework/FBLPromises_Privacy.bundle/PrivacyInfo.xcprivacy|Frameworks/flutter_secure_storage_darwin.framework/flutter_secure_storage.bundle/Info.plist|Frameworks/flutter_secure_storage_darwin.framework/flutter_secure_storage.bundle/PrivacyInfo.xcprivacy|Frameworks/MLKitTextRecognition.framework/LatinOCRResources.bundle/*|Frameworks/image_picker_ios.framework/image_picker_ios_privacy.bundle/PrivacyInfo.xcprivacy) ;;
            *) is_reviewed_pre_native_baseline_resource || fail_unreviewed_resource_path ;;
          esac
        fi ;;
      Frameworks/*/Info.plist|Frameworks/*/PrivacyInfo.xcprivacy|Frameworks/*/_CodeSignature/CodeResources)
        [[ "$relative_resource" =~ ^Frameworks/[^/]+\.framework/(Info\.plist|PrivacyInfo\.xcprivacy|_CodeSignature/CodeResources)$ ]] ||
          fail_unreviewed_resource_path
        framework_name=${relative_resource#Frameworks/}
        framework_name=${framework_name%%/*}
        framework_name=${framework_name%.framework}
        case "$framework_name" in
          App|Flutter|file_picker|flutter_secure_storage_darwin|google_mlkit_commons|google_mlkit_text_recognition|image_picker_ios|GoogleDataTransport|GoogleMLKit|GoogleToolboxForMac|GoogleUtilities|GTMSessionFetcher|MLImage|MLKitCommon|MLKitTextRecognition|MLKitTextRecognitionCommon|MLKitVision|nanopb|objective_c|onnxruntime|onnxruntime-c|onnxruntime-objc|OpenCV|PromisesObjC|FBLPromises|Yams) ;;
          *)
            printf 'unreviewed_framework_name_sha256=%s\n' \
              "$(printf '%s' "$framework_name" | shasum -a 256 | cut -d ' ' -f 1)" >&2
            fail "production application contains an unreviewed framework resource" ;;
        esac ;;
      LatinOCRResources.bundle/*|Frameworks/MLKitTextRecognition.framework/LatinOCRResources.bundle/*)
        [[ "$relative_resource" =~ ^(LatinOCRResources\.bundle|Frameworks/MLKitTextRecognition\.framework/LatinOCRResources\.bundle)/[^/]+$ ]] ||
          fail "production application contains an unreviewed model resource path"
        case "${relative_resource##*/}" in
          region_proposal_text_detector_tflite_gray_quantized.bincfg) expected_vendor_sha=1a38b646d109c14dd8ae30d5f12a9036f60f9e923c9301337aa2507759f2b098 ;;
          rpn_lstm_engine_tflite_latin.bincfg) expected_vendor_sha=10f0cd4292d367b27782053dfc1860c0629b13098058b3ac1d6eca6288bbfb04 ;;
          rpn_text_detector_mobile_space_to_depth_quantized_v2.tflite) expected_vendor_sha=2906a3b00953351813c4917341e197107ed2aaac2d17650890758dc190271dee ;;
          tflite_langid.tflite) expected_vendor_sha=7f931f6f7c1dd0ec591ace7780df91645a450fafc83505f3ff45ce5ef7c8441b ;;
          tflite_lstm_recognizer_latin_0.3.bincfg) expected_vendor_sha=a050ebbb730708c8556a887793b87fce12ee9ffa517afc5205c71d4624bd7bc7 ;;
          tflite_lstm_recognizer_latin_0.3.class_lst) expected_vendor_sha=55150f2779d07936c9fbf8becbb8567fe3ea5ad6b6d944245829695a8ae968fa ;;
          tflite_lstm_recognizer_latin_0.3.conv_model) expected_vendor_sha=64aba719b4ed1ee5b3d4886c5aaf0b1ac051bf5879e9b08e861e0e29e20a08a7 ;;
          tflite_lstm_recognizer_latin_0.3.lstm_model) expected_vendor_sha=0ed62e4fbe0fc5c4090aec473b136e188f828590765c028382358daddb3ccb6e ;;
          *) fail "production application contains an unreviewed model resource" ;;
        esac
        [[ "$(sha256_file "$candidate")" == "$expected_vendor_sha" ]] ||
          fail "production application model resource differs from the pinned pod archive" ;;
      *.bundle/*)
        # Only exact files from the fixed pre-native size baseline bundle,
        # observed in hosted job 108593887895; never release resources.
        is_reviewed_pre_native_baseline_resource ||
          is_reviewed_pre_native_other_bundle_resource || fail_unreviewed_resource_path ;;
      *)
        fail_unreviewed_resource_path ;;
    esac
    if [[ -n "${expected_flutter_asset_sha:-}" ]]; then
      observed_flutter_asset_sha=$(sha256_file "$candidate")
      # Exact unsigned Flutter 3.44.8 notices output observed in native job
      # 108820453708 after the reviewed bundle inventory passed. Signed
      # release identity remains governed by the original pinned digest.
      if [[ "$relative_resource" == Frameworks/App.framework/flutter_assets/NOTICES.Z &&
        "$mode" == unsigned &&
        "$observed_flutter_asset_sha" == f1180de3d3150e74be53219fc4b526c64dbf85e806315d22c5abb6d26b8b9af6 ]]; then
        expected_flutter_asset_sha=$observed_flutter_asset_sha
      fi
      if [[ "$observed_flutter_asset_sha" != "$expected_flutter_asset_sha" ]]; then
        printf 'flutter_generated_content_path_sha256=%s\n' \
          "$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)" >&2
        printf 'flutter_generated_content_sha256=%s\n' "$observed_flutter_asset_sha" >&2
        fail "production Flutter asset bytes differ from the reviewed identity"
      fi
      unset expected_flutter_asset_sha
    fi
  fi
  if [[ "$file_description" == Mach-O* ]]; then
    binary_count=$((binary_count + 1))
    nm -a "$candidate" >>"$symbols_file"
  elif [[ "$file_description" == *'PNG image data'* ]]; then
    [[ "$candidate" == "$app_path"/AppIcon*.png ]] ||
      fail "production application contains an unreviewed image or document resource"
    if [[ -z "$icon_compare_root" ]]; then
      icon_compare_root=$(mktemp -d)
    fi
    sips -s format bmp "$candidate" --out "$icon_compare_root/packaged.bmp" >/dev/null 2>&1 ||
      fail "production application icon cannot be decoded"
    [[ -s "$icon_compare_root/packaged.bmp" ]] || fail "production application icon cannot be decoded"
    reviewed_icon=false
    for source_icon in "$mobile_root"/ios/Runner/Assets.xcassets/AppIcon.appiconset/*.png; do
      sips -s format bmp "$source_icon" --out "$icon_compare_root/source.bmp" >/dev/null 2>&1 ||
        fail "reviewed application icon cannot be decoded"
      [[ -s "$icon_compare_root/source.bmp" ]] || fail "reviewed application icon cannot be decoded"
      if cmp -s "$icon_compare_root/packaged.bmp" "$icon_compare_root/source.bmp"; then
        {
          printf '%s\n' "$(wc -c < "$candidate" | tr -d ' ')"
          cat -- "$candidate"
          printf '%s\n' "$(wc -c < "$source_icon" | tr -d ' ')"
          cat -- "$source_icon"
        } | node "$tool_root/tools/ocr-models/verify-ios-icon-png.mjs" ||
          icon_representation_unreviewed=true
        reviewed_icon=true
        break
      fi
    done
    [[ "$reviewed_icon" == true ]] ||
      fail "production application icon differs from reviewed source assets"
  elif [[ "$candidate" == "$app_path/Assets.car" ]]; then
    : # Opaque compiled content is excluded from package-wide privacy approval.
  elif [[ "$file_description" == *'Apple binary property list'* ]]; then
    [[ "$candidate" == */Info.plist || "$candidate" == */InfoPlist.strings || "$candidate" == */PrivacyInfo.xcprivacy || "$candidate" == "$app_path/AppFrameworkInfo.plist" ]] ||
      is_reviewed_pre_native_baseline_resource ||
      is_reviewed_pre_native_other_bundle_resource ||
      fail_unreviewed_opaque_resource
  elif [[ "$file_description" == data ]]; then
    case "$candidate" in
      "$app_path"/receipt_ocr_models/*|"$app_path"/Assets.car|"$app_path"/embedded.mobileprovision|"$app_path"/AppFrameworkInfo.plist|"$app_path"/Frameworks/Flutter.framework/icudtl.dat|"$app_path"/Frameworks/App.framework/flutter_assets/AssetManifest.bin|"$app_path"/Frameworks/App.framework/flutter_assets/NOTICES.Z|"$app_path"/LatinOCRResources.bundle/*|"$app_path"/Frameworks/MLKitTextRecognition.framework/LatinOCRResources.bundle/*) ;;
      "$app_path"/Frameworks/App.framework/flutter_assets/NativeAssetsManifest.json|"$app_path"/Frameworks/App.framework/flutter_assets/fonts/MaterialIcons-Regular.otf|"$app_path"/Frameworks/App.framework/flutter_assets/packages/cupertino_icons/assets/CupertinoIcons.ttf|"$app_path"/Frameworks/App.framework/flutter_assets/shaders/ink_sparkle.frag|"$app_path"/Frameworks/App.framework/flutter_assets/shaders/stretch_effect.frag) ;;
      "$app_path"/*.bundle/*) is_reviewed_pre_native_baseline_resource ||
        is_reviewed_pre_native_other_bundle_resource || fail_unreviewed_opaque_resource ;;
      *) is_reviewed_pre_native_other_bundle_resource || fail_unreviewed_opaque_resource ;;
    esac
  elif [[ "$relative_resource" == Frameworks/App.framework/flutter_assets/NOTICES.Z && "$file_description" == *'compressed data'* ]]; then
    : # Exact content was checked against the reviewed Release APK above.
  elif [[ "$file_description" =~ image|bitmap|PDF\ document|SVG|HEIF|HEIC|AVIF|Web/P|archive|compressed\ data|gzip|bzip2|XZ\ compressed|Zstandard|RAR|7-zip ]]; then
    fail "production application contains an unreviewed image or document resource"
  fi
  if [[ "$candidate" == *.plist || "$candidate" == *.xcprivacy || "$candidate" == *.strings ]]; then
    plist_xml=$(plutil -convert xml1 -o - "$candidate") ||
      fail "production application property list cannot be inspected"
    [[ "$plist_xml" != *'<data>'* ]] ||
      fail "production application property list contains opaque data"
    printf '%s\n' "$plist_xml" >>"$symbols_file"
  fi
  strings "$candidate" >>"$symbols_file"
done < <(find "$inventory_root" -type f -print)
[[ "$icon_representation_unreviewed" == false ]] ||
  fail "production application icon contains unreviewed bytes"
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
  if [[ "$mode" == signed ]]; then
    [[ "$(sha256_file "$artifact_path")" == "$preflight_ipa_sha" ]] || fail "IPA changed after package inspection"
    artifact_sha=$preflight_ipa_sha
    # Inspect every retained archive file before claiming package privacy.
    [[ "$app_path" == "$inspection_root/Payload/Runner.app" ]] ||
      fail "signed IPA application path is not canonical"
    archive_review=$(node "$tool_root/tools/ocr-models/verify-ios-xcarchive.mjs") ||
      fail "signed xcarchive privacy verification failed"
    [[ -n "$archive_review" ]] || fail "signed xcarchive privacy verification produced no evidence"
    [[ "$(sha256_file "$artifact_path")" == "$artifact_sha" ]] || fail "IPA changed after archive inspection"
  else
    artifact_sha=$(node "$tool_root/tools/ocr-models/hash-directory.mjs" app)
  fi
  archive_sha=$(if [[ "$mode" == signed ]]; then node "$tool_root/tools/ocr-models/hash-directory.mjs" archive; else printf ''; fi)
  if [[ "$mode" == signed ]]; then
    inspected_archive_sha=$(printf '%s' "$archive_review" | node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(0,"utf8")); if(!/^[0-9a-f]{64}$/.test(v.archiveSha256)) process.exit(1); process.stdout.write(v.archiveSha256)' ) ||
      fail "signed xcarchive inspection identity is invalid"
    [[ "$archive_sha" == "$inspected_archive_sha" ]] || fail "xcarchive changed after privacy inspection"
  fi
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
  if [[ "$mode" == signed ]]; then
    [[ "$(sha256_file "$artifact_path")" == "$artifact_sha" ]] || fail "IPA changed while provenance was generated"
  fi
  printf 'SETTLEORA_IOS_RELEASE_ARTIFACT=%s\n' "$(basename "$artifact_path")"
  printf 'SETTLEORA_IOS_RELEASE_SHA256=%s\n' "$artifact_sha"
  printf 'SETTLEORA_IOS_RELEASE_PROVENANCE=%s\n' "$(basename "$provenance_out")"
fi
