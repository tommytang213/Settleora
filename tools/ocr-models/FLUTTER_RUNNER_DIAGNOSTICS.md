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

The rotation test's failure marker also preserves its comparison mismatch
count and at most 128 field names. The collector accepts only fixed comparison
fields or bounded item indexes and only for the existing rotation fixture at
the comparison stage. Counts above the retained prefix remain visible. This
contains no expected/actual values, receipt text, geometry or error strings.
Missing comparison data means the comparison did not finish or its marker
was unavailable; it never proves zero mismatches. Neither this marker nor an
empty comparison changes strict scoring, process-exit or stderr requirements.

Validation: `node --test tools/ocr-models/test/flutter-runner-diagnostics.test.mjs
tools/ocr-models/test/native-acceptance-evidence.test.mjs`, plus the complete
`npm run validate:ocr-models` suite before publication. This tooling change alters
the all-tracked-input Android source fingerprint; the prior canonical APK
binding does not cover the new head. A fresh reviewed canonical package binding
and exact-head hosted checks are required for the next publication cycle.

Failure recovery additionally emits `collectionRejection` with schema version1
and fixed phase/reason enums. A phase is recorded only when the original
exception passes an instrumented collection boundary: `arguments`,
`input_streams`, `runner_protocol`, `fixture_inventory`, `acceptance_marker`,
`ui_smoke_marker`, `diagnostic_markers`, or the outer `collection_metadata`
boundary. The first inner boundary within each collection call wins. If an exception
object is reused across calls, its newest observed call replaces the prior
association. Error-only recovery exposes that object's latest observation, not
a per-call history for delayed recovery. `boundary_rejected` means only that
this boundary threw; it does not identify a particular validator, native
producer, input line, or root cause. `non_allowlisted_stderr` retains the
existing stderr classification. Unregistered or primitive thrown values use
`unclassified` for both fields.

The association is module-private and uses the original exception identity;
error messages, names, properties and copies cannot supply a classification.
Recovery snapshots the association before best-effort marker extraction and
does not infer a phase from recovered logs. The original exception is rethrown.
No exception content, log excerpts, receipt data or private hashes are emitted.
The legacy failure/stderr fields are unchanged. Successful collection omits
this failure-only field, and its presence always prevents complete acceptance,
including null, empty or forged values. These diagnostics cannot retrospectively
classify old artifacts and do not change protocol, stdout/stderr, payload-size,
fixture, scoring, completion, package, signing or process-exit requirements.
