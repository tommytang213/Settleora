# Bounded Flutter runner diagnostics

The iOS acceptance JSON includes `flutterRunnerDiagnostics` on both ordinary
collection and failure recovery. The existing workflow uploads that JSON; raw
Flutter stdout/stderr stays in runner temporary files and is not uploaded.

This follows the bounded metadata policy in
[`OCR_NATIVE_BUILD_VALIDATION_PLAN.md`](../../docs/architecture/OCR_NATIVE_BUILD_VALIDATION_PLAN.md).
Only fixed enums, capped counts, booleans and bounded byte counts are retained.
No test names, error excerpts, paths, URLs, stack traces, arbitrary JSON fields,
OCR/receipt content, credentials, or hashes of private log contents are emitted.
Application `print` messages are counted without inspecting their contents.

Each stream is sampled independently up to 1 MiB, with a 64 KiB line limit and
counts capped at 10,000. Oversized lines and a truncated final line are skipped.
`prefix_only`, omitted-line flags and `countsCapped` explicitly identify partial
observations. Missing, unreadable, symbolic-link and nonregular inputs are
`unavailable`; changing files are `changed_during_read`. Neither is empty output.

The stdout counts distinguish runner start, suite/test events, a VM-service
announcement, test failures and terminal success/failure events. Signature
categories distinguish recognized load, app start, VM connection, simulator,
build/compiler, device and exception families. These are **unvalidated diagnostic
hints**, not proof of successful launch, genuine protocol ordering, the root
cause, or corpus completion. Unrecognized content produces no text fallback.
Counts of zero in incomplete/missing evidence do not prove no tests ran.

The strict protocol parser, scorer, corpus/UI requirements and stderr rejection
remain authoritative. Nonempty stderr still fails, including known compiler
notes. A diagnostic success event cannot make a failed recovery envelope pass.
Historical results never transfer to the current source head.

Validation: `node --test tools/ocr-models/test/flutter-runner-diagnostics.test.mjs
tools/ocr-models/test/native-acceptance-evidence.test.mjs`, plus the complete
`npm run validate:ocr-models` suite before publication. This tooling change alters
the all-tracked-input Android source fingerprint; the prior canonical APK
binding does not cover the new head. A fresh reviewed canonical package binding
and exact-head hosted checks are required for the next publication cycle.
