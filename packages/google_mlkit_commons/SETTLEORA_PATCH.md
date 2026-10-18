# Pinned MLKit commons source correction

This directory retains all 22 files from the published `google_mlkit_commons` 0.11.1 archive. `UPSTREAM.json` records the archive checksum already pinned by Settleora and every original file checksum. The original MIT license is preserved.

The only upstream source change is in `InputImageConverter.java`: both read-only metadata maps use `Map<?, ?>` instead of unchecked `Map<String, Object>` casts. The existing local unchecked-warning suppression is removed. The erased runtime Map checks, lookup keys, value conversions, error handling, public API, Dart sources, iOS sources and podspec are unchanged.

The mobile app resolves this copy through an explicit path override. MLKit remains the current default OCR provider; this is a production dependency source correction, not a test-only replacement or a provider switch. The original package version and other dependency versions remain pinned. All vendored files and this provenance record are bound by the OCR catalog.

The correction removes the unchecked operation at its source. It does not filter compiler output, suppress warnings, change runtime stderr acceptance, change receipt scoring, patch a shared package cache, or authorize native acceptance or deployment. Fresh Android/iOS dependency integration and native/package qualification remain required for each candidate.
