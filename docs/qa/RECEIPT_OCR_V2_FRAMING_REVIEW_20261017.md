# Receipt OCR APK v2 outer framing review — 2026-10-17

This change enforces the existing strict package-verification requirement at the outer APK v2 signers envelope. Atlas authorized this bounded repair and pure in-memory tests. No deployment, access configuration or production signing policy changes.

## Contract

The v2 pair value must consist entirely of one length-prefixed signers envelope. That envelope must contain exactly one nonempty, completely bounded length-prefixed signer record. Reject incomplete prefixes, lengths beyond their parent, unconsumed outer bytes, empty records and multiple signers. Buffer offsets are relative to the supplied value.

The helper treats the signer payload as opaque. It does not establish nested signed-data, certificate, attribute, digest, public-key or signature canonicalization. Genuine cryptographic verification remains the responsibility of the unchanged pinned apksigner invocation.

Existing outer signing-block bounds, unique allowed pair IDs, reviewed zero padding, immutable APK snapshot, source fingerprint, ZIP entry representation digest and reviewed inventory gates remain in force. No digest or inventory expectation is changed.

## Evidence and limits

The original verifier did not inspect the internal framing of the v2 pair value. Read-only disassembly of the already pinned apksigner JAR showed that its signers-envelope parser consumes a bounded inner slice without checking exhaustion of the original v2 value. This supports the outer framing finding; it is not an end-to-end malformed APK reproduction.

The focused test command is:

`node --test tools/ocr-models/test/apk-v2-framing.test.mjs`

Tests use only small in-memory framing buffers. They do not create APK/ZIP files, invoke the package verifier, substitute signature results, execute external tools or access the network.

The existing `verify-mobile-package.test.mjs` suite constructs synthetic APKs using an unframed placeholder v2 value and stubbed signature verification. Its positive fixture is incompatible with the stricter framing contract. That suite and its APK fixtures are intentionally unchanged and excluded under the current restriction. The aggregate `validate:ocr-models` command includes that suite and is not claimed to pass.

A normal source build, focused parser checks and independent bounds/compatibility review do not replace canonical package qualification or the unresolved nested-representation review. The new source identity must satisfy those gates separately. No inventory digest may be copied merely to produce a pass.

## Scope

Only the package verifier's outer v2 framing guard, its dependency-free helper, the pure framing unit tests and this QA record change. Application runtime, models, fixture images/truth, Gradle verification metadata, repository/settings files, API, Apply/money authority, schema and live security/access behavior remain unchanged.
