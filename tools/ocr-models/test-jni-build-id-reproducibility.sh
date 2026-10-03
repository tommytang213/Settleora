#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: $0 <locked-jni-package-root> <android-ndk-root> <gradle-executable> <app-android-project>" >&2
  exit 2
fi

jni_root=$(realpath -e "$1")
ndk_root=$(realpath -e "$2")
gradle_executable=$(realpath -e "$3")
android_project=$(realpath -e "$4")
test -f "$jni_root/src/CMakeLists.txt"
test -f "$ndk_root/build/cmake/android.toolchain.cmake"
test -x "$gradle_executable"
test -f "$android_project/build.gradle.kts"
for command in cmake ninja cmp sha256sum; do
  command -v "$command" >/dev/null
done

trial_root=$(mktemp -d "${TMPDIR:-/tmp}/settleora-jni-build-id.XXXXXXXX")
trap 'rm -rf "$trial_root"' EXIT
ndk_alias="$trial_root/ndk-alias"
ln -s "$ndk_root" "$ndk_alias"
test "$(realpath -e "$ndk_alias")" = "$ndk_root"

for root_name in root-a root-b; do
  mkdir -p "$trial_root/$root_name"
  cp -a "$jni_root/src" "$trial_root/$root_name/src"
done

ndk_bin="$ndk_root/toolchains/llvm/prebuilt/linux-x86_64/bin"
for abi in arm64-v8a armeabi-v7a x86_64; do
  for root_name in root-a root-b; do
    package_root="$trial_root/$root_name"
    build_root="$package_root/build-$abi"
    cmake -S "$package_root/src" -B "$build_root" -G Ninja \
      -DCMAKE_TOOLCHAIN_FILE="$ndk_root/build/cmake/android.toolchain.cmake" \
      -DANDROID_ABI="$abi" -DANDROID_PLATFORM=android-21 \
      -DCMAKE_BUILD_TYPE=RelWithDebInfo \
      -DCMAKE_C_FLAGS="-fdebug-prefix-map=$package_root=/usr/src/settleora-jni -fdebug-compilation-dir=/usr/src/settleora-jni/build -fdebug-prefix-map=$ndk_root=/usr/src/settleora-ndk" \
      >/dev/null
    cmake --build "$build_root" --target jni >/dev/null
  done

  alias_build="$trial_root/root-a/build-$abi-ndk-alias"
  cmake -S "$trial_root/root-a/src" -B "$alias_build" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$ndk_alias/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI="$abi" -DANDROID_PLATFORM=android-21 \
    -DCMAKE_BUILD_TYPE=RelWithDebInfo \
    -DCMAKE_C_FLAGS="-fdebug-prefix-map=$trial_root/root-a=/usr/src/settleora-jni -fdebug-compilation-dir=/usr/src/settleora-jni/build -fdebug-prefix-map=$ndk_alias=/usr/src/settleora-ndk" \
    >/dev/null
  cmake --build "$alias_build" --target jni >/dev/null

  first="$trial_root/root-a/build-$abi"
  second="$trial_root/root-b/build-$abi"
  for object in dartjni.c.o third_party/global_jni_env.c.o include/dart_api_dl.c.o; do
    cmp "$first/CMakeFiles/jni.dir/$object" "$second/CMakeFiles/jni.dir/$object"
    cmp "$first/CMakeFiles/jni.dir/$object" "$alias_build/CMakeFiles/jni.dir/$object"
  done
  cmp "$first/libdartjni.so" "$second/libdartjni.so"
  cmp "$first/libdartjni.so" "$alias_build/libdartjni.so"
  if grep -aF -e "$ndk_root" -e "$ndk_alias" "$first/libdartjni.so" "$alias_build/libdartjni.so" >/dev/null; then
    echo "JNI debug output contains an installation-specific NDK path" >&2
    exit 1
  fi
  "$ndk_bin/llvm-readelf" -n "$first/libdartjni.so" | grep 'Build ID:' >/dev/null
  "$ndk_bin/llvm-dwarfdump" --debug-info "$first/libdartjni.so" >"$first/dwarf-info.txt"
  grep -F '/usr/src/settleora-jni/src/dartjni.c' "$first/dwarf-info.txt" >/dev/null
  grep -F '/usr/src/settleora-jni/build' "$first/dwarf-info.txt" >/dev/null
  "$ndk_bin/llvm-nm" -D "$first/libdartjni.so" | grep 'DartException__ctor' >/dev/null
  "$ndk_bin/llvm-strip" --strip-unneeded -o "$first/stripped.so" "$first/libdartjni.so"
  "$ndk_bin/llvm-strip" --strip-unneeded -o "$second/stripped.so" "$second/libdartjni.so"
  "$ndk_bin/llvm-strip" --strip-unneeded -o "$alias_build/stripped.so" "$alias_build/libdartjni.so"
  cmp "$first/stripped.so" "$second/stripped.so"
  cmp "$first/stripped.so" "$alias_build/stripped.so"
  digest=$(sha256sum "$first/libdartjni.so")
  printf '%s reproducible unstripped and stripped JNI, object files, DWARF, symbols: %s\n' "$abi" "${digest%% *}"
done

sdk_root=$(dirname "$(dirname "$ndk_root")")
ANDROID_HOME="$sdk_root" "$gradle_executable" -p "$android_project" \
  ':jni:buildCMakeRelWithDebInfo[arm64-v8a]' \
  ':jni:buildCMakeRelWithDebInfo[armeabi-v7a]' \
  ':jni:buildCMakeRelWithDebInfo[x86_64]' \
  --offline --no-daemon --rerun-tasks --console plain \
  >"$trial_root/gradle-build.log" 2>&1 || {
    tail -n 30 "$trial_root/gradle-build.log" >&2
    exit 1
  }

gradle_native_root="$android_project/../build/jni/intermediates/cxx/RelWithDebInfo"
for abi in arm64-v8a armeabi-v7a x86_64; do
  first="$trial_root/root-a/build-$abi/libdartjni.so"
  mapfile -d '' candidates < <(find "$gradle_native_root" -path "*/obj/$abi/libdartjni.so" -print0)
  test "${#candidates[@]}" -gt 0
  newest="${candidates[0]}"
  for candidate in "${candidates[@]:1}"; do
    if [[ "$candidate" -nt "$newest" ]]; then newest="$candidate"; fi
  done
  build_token=$(basename "$(dirname "$(dirname "$(dirname "$newest")")")")
  generated_ninja="$jni_root/android/.cxx/RelWithDebInfo/$build_token/$abi/build.ninja"
  test -f "$generated_ninja"
  grep -F -- "-fdebug-prefix-map=$jni_root=/usr/src/settleora-jni" "$generated_ninja" >/dev/null
  grep -F -- '-fdebug-compilation-dir=/usr/src/settleora-jni/build' "$generated_ninja" >/dev/null
  grep -F -- "-fdebug-prefix-map=$ndk_root=/usr/src/settleora-ndk" "$generated_ninja" >/dev/null
  cmp "$first" "$newest"
  printf '%s Gradle JNI target matches independent reproducible build\n' "$abi"
done
