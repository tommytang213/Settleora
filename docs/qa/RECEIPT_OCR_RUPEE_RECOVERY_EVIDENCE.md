# Corroborated rupee recognition recovery

The existing common recognizer sometimes omits a printed rupee symbol while
the Devanagari recognizer reads it as a single letter. Appending that letter
to a separately recognized product description produces an incorrect draft.
The original monetary digits can nevertheless agree across both recognizers.

The additional PP-OCRv6 Tiny pack supplies actual alternative recognition for
this bounded case. Small remains the normal common recognizer. Every original
specialist probe runs, and the original document orientation is frozen before
recovery. Tiny does not participate in general routing or orientation selection.
Its separate catalog role is `recognition_recovery`, with the
`corroborated_rupee_money` policy.

Recovery requires all of the following original evidence:

- A selected Devanagari candidate containing only the evidenced single-letter
  prefix and a complete ASCII monetary spelling with two decimal places.
- An original common candidate with exactly the same sign, digits, grouping,
  and decimal spelling, without that prefix.
- One separate, nonnumeric text label to the left on the same row, established
  by valid finite convex geometry. Competing row cells prevent recovery.
- Two distinct original complete rupee-marked common candidates in the same
  right-aligned monetary column, on separate rows. They must have the same
  original common pack identity. Recovered output cannot corroborate itself.
- No missing original candidate, empty original text, malformed geometry, or
  competing currency symbol in the original selected document evidence.

The selected value, original common value, label, two corroborating cells, and
recovery each require finite confidence in the existing monetary-routing range
of 0.90 through 1. These scores are eligibility signals, not calibrated error
probabilities or a production accuracy target.

Only an actual rupee-marked Tiny output with identical monetary spelling is
admitted. Changed digits, signs, separators, grouping, currency, extra words,
or partial amounts are rejected. No arithmetic reconstruction, character
substitution, merchant vocabulary, fixture identity, or user locale is used.
The original complete recognition batches, crop pixels, and canvas widths are
preserved. Batches without eligible cells make no Tiny inference call.

## Pinned model evidence

- Upstream: `PaddlePaddle/PP-OCRv6_tiny_rec_onnx`.
- Revision: `2612ab37152ae0a677521bae4e1e3d4fb4cf7c30`.
- ONNX: 4,462,639 bytes, SHA-256
  `9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6`.
- Matching configuration: 55,571 bytes, SHA-256
  `66170210bad538e83fff3c4a3867e547d6bf20b50d64b20347c4b913f3034ea1`.
- ONNX checker 1.17.0 full validation passes: IR 6, opset 11, float BGR input
  with height 48, CTC output with 6,906 classes, and no external tensor data.
- Catalog version `2026.10.12.1` adds 4,518,210 bytes. All seven original
  detector/recognizer packs remain byte-for-byte unchanged.

The private desktop feasibility run completed 185 original upright batches,
666 cells, and 19 retained documents using CPU ONNX Runtime 1.21.1. An
unconditional Tiny substitution changes 111 strings and 28 digit sequences;
it is unsuitable as a general replacement. Tiny does not resolve the known
Vietnamese vocabulary gap or establish additional language coverage.

The isolated eligibility projection admits three cells. Replaying all 38
baseline/recovery payloads through the current production provider and parser
compares 41 preview fields: one description mismatch is removed, strict
complete documents increase from 6 to 7, and field mismatches decrease from
34 to 33. The other 18 documents are unchanged. Ordinary-warning fixtures
remain 10, ordinary warnings remain 13, and review-hint fixtures remain 8.
Monetary values are preserved; the recovered printed currency becomes explicit
for two header fields.

These are retained-candidate diagnostics, not fresh native results or a
full-corpus, iOS, device-performance, usable-draft, or calibrated-confidence
claim. The catalog remains `pending_native_provider_acceptance`. Exact-source
native validation, package binding, independent reviews, hosted checks, and
the task-specific human merge gate remain required. Fixture images/truth,
strict scoring, review/Apply semantics, and financial authority are unchanged.

Private captures and payloads are excluded from public evidence and reviewer
packets. Public evidence contains source identities, bounded counts, hashes,
and the general rule only.
