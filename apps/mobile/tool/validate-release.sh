#!/usr/bin/env bash

set -euo pipefail

if [[ $# -gt 1 || ($# -eq 1 && "$1" != "--selection-only") ]]; then
  echo "Usage: $0 [--selection-only]" >&2
  exit 2
fi

if [[ ! -d test ]]; then
  echo "Run this command from apps/mobile; the test directory was not found." >&2
  exit 1
fi

selection_only=false
if [[ ${1:-} == "--selection-only" ]]; then
  selection_only=true
fi

if [[ "$selection_only" == false ]]; then
  flutter pub get
  flutter analyze
fi

normal_test_files=()
visual_filename_test_files=()
visual_tagged_test_files=()

while IFS= read -r -d '' test_file; do
  case "$test_file" in
    *visual*capture_test.dart|*visual*evidence*_test.dart)
      visual_filename_test_files+=("$test_file")
      ;;
    *)
      if grep -Eq 'tags:[^#]*visual' "$test_file"; then
        visual_tagged_test_files+=("$test_file")
      else
        normal_test_files+=("$test_file")
      fi
      ;;
  esac
done < <(find test -type f -name '*test.dart' -print0 | sort -z)

echo "Selected non-visual Flutter test files: ${#normal_test_files[@]}"
printf 'NON_VISUAL_TEST_FILE=%s\n' "${normal_test_files[@]}"
echo "Visual filename-selected Flutter test files excluded: ${#visual_filename_test_files[@]}"
printf 'VISUAL_FILENAME_TEST_FILE=%s\n' "${visual_filename_test_files[@]}"
echo "Visual-tagged Flutter test files excluded: ${#visual_tagged_test_files[@]}"
printf 'VISUAL_TAGGED_TEST_FILE=%s\n' "${visual_tagged_test_files[@]}"

if [[ ${#normal_test_files[@]} -eq 0 ]]; then
  echo "No non-visual Flutter tests were selected" >&2
  exit 1
fi

if [[ "$selection_only" == true ]]; then
  exit 0
fi

flutter test -r expanded --exclude-tags visual "${normal_test_files[@]}"
