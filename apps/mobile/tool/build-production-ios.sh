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
while IFS= read -r candidate; do
  file_description=$(file -b "$candidate")
  if [[ "$file_description" != Mach-O* ]]; then
    [[ "$candidate" == "$app_path"/* ]] || fail "production application contains an unreviewed resource path"
    relative_resource=${candidate#"$app_path"/}
    case "$relative_resource" in
      Info.plist|PkgInfo|Assets.car|embedded.mobileprovision|en.lproj/InfoPlist.strings|_CodeSignature/CodeResources|Frameworks/Flutter.framework/icudtl.dat|Frameworks/App.framework/flutter_assets/AssetManifest.bin|Frameworks/App.framework/flutter_assets/AssetManifest.json|Frameworks/App.framework/flutter_assets/FontManifest.json|Frameworks/App.framework/flutter_assets/NOTICES.Z) ;;
      AppIcon*.png) [[ "$relative_resource" =~ ^AppIcon[^/]*\.png$ ]] || fail "production application contains an unreviewed resource path" ;;
      receipt_ocr_models/*) ;; # verify-mobile-package enforces the exact recursive model inventory.
      Base.lproj/*.nib) [[ "$relative_resource" =~ ^Base\.lproj/[^/]+\.nib$ ]] || fail "production application contains an unreviewed resource path" ;;
      Base.lproj/*.storyboardc/*) [[ "$relative_resource" =~ ^Base\.lproj/[^/]+\.storyboardc/[^/]+$ ]] || fail "production application contains an unreviewed resource path" ;;
      Frameworks/*/Info.plist|Frameworks/*/PrivacyInfo.xcprivacy|Frameworks/*/_CodeSignature/CodeResources)
        [[ "$relative_resource" =~ ^Frameworks/[^/]+\.framework/(Info\.plist|PrivacyInfo\.xcprivacy|_CodeSignature/CodeResources)$ ]] ||
          fail "production application contains an unreviewed resource path"
        framework_name=${relative_resource#Frameworks/}
        framework_name=${framework_name%%/*}
        framework_name=${framework_name%.framework}
        case "$framework_name" in
          App|Flutter|file_picker|flutter_secure_storage_darwin|google_mlkit_commons|google_mlkit_text_recognition|image_picker_ios|GoogleDataTransport|GoogleMLKit|GoogleToolboxForMac|GoogleUtilities|GTMSessionFetcher|MLImage|MLKitCommon|MLKitTextRecognition|MLKitTextRecognitionCommon|MLKitVision|nanopb|onnxruntime|onnxruntime-c|onnxruntime-objc|OpenCV|PromisesObjC|FBLPromises|Yams) ;;
          *) fail "production application contains an unreviewed framework resource" ;;
        esac ;;
      *.bundle/Info.plist|*.bundle/PrivacyInfo.xcprivacy|*.bundle/_CodeSignature/CodeResources)
        [[ "$relative_resource" =~ ^([^/]+\.bundle|Frameworks/[^/]+\.framework/[^/]+\.bundle)/(Info\.plist|PrivacyInfo\.xcprivacy|_CodeSignature/CodeResources)$ ]] ||
          fail "production application contains an unreviewed resource path"
        bundle_name=${relative_resource%%.bundle/*}
        bundle_name=${bundle_name##*/}
        case "$bundle_name" in
          file_picker_ios_privacy|image_picker_ios_privacy|flutter_secure_storage|GoogleUtilities_Privacy|GoogleDataTransport_Privacy|GoogleToolboxForMac_Privacy|GoogleToolboxForMac_Logger_Privacy|GTMSessionFetcher_Privacy|GTMSessionFetcher_Core_Privacy|MLKitCommon_Privacy|MLKitTextRecognition_Privacy|MLKitTextRecognitionCommon_Privacy|MLKitVision_Privacy|MLImage_Privacy|nanopb_Privacy|OpenCV_Privacy|onnxruntime_privacy|Yams_Privacy|PromisesObjC_Privacy|FBLPromises_Privacy|LatinOCRResources) ;;
          *) fail "production application contains an unreviewed privacy bundle" ;;
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
      *)
        resource_path_sha=$(printf '%s' "$relative_resource" | shasum -a 256 | cut -d ' ' -f 1)
        case "$relative_resource" in
          Frameworks/*) resource_class=framework ;;
          *.bundle/*) resource_class=bundle ;;
          *) resource_class=application ;;
        esac
        printf 'unreviewed_resource_path_sha256=%s resource_class=%s\n' \
          "$resource_path_sha" "$resource_class" >&2
        fail "production application contains an unreviewed resource path" ;;
    esac
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
    [[ "$candidate" == */Info.plist || "$candidate" == */InfoPlist.strings || "$candidate" == */PrivacyInfo.xcprivacy ]] ||
      fail "production application contains an unreviewed opaque resource"
  elif [[ "$file_description" == data ]]; then
    case "$candidate" in
      "$app_path"/receipt_ocr_models/*|"$app_path"/Assets.car|"$app_path"/embedded.mobileprovision|"$app_path"/Frameworks/Flutter.framework/icudtl.dat|"$app_path"/Frameworks/App.framework/flutter_assets/AssetManifest.bin|"$app_path"/Frameworks/App.framework/flutter_assets/NOTICES.Z|"$app_path"/Base.lproj/*.nib|"$app_path"/LatinOCRResources.bundle/*|"$app_path"/Frameworks/MLKitTextRecognition.framework/LatinOCRResources.bundle/*) ;;
      *) fail "production application contains an unreviewed opaque resource" ;;
    esac
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
