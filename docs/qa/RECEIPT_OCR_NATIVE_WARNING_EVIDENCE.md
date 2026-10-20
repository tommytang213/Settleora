# Native receipt OCR warning evidence

Native `recognitionCoverage` records ordinary `ReceiptOcrPreview.warnings`
separately from `reviewDecision` and `reviewHintCategory`. The latter describe
reconciliation review hints; their absence does not establish that a preview
has no ordinary warnings.

Each current coverage row contains `previewPresent`, `previewWarningCount`,
and `previewWarningCategoryCounts`. The category map has a fixed vocabulary:
`noReadableText`, `dccAmountMissing`, `itemChargedCurrencyConflict`,
`itemReceiptCurrencyConflict`, `noItems`, `ratedTaxAmbiguity`,
`untraceableItemAmount`, `noTotal`, `currencyFallback`,
`symbolCurrencyUnresolved`, `conflictingDate`, `stayOnlyDate`, and
`unknownWarning`. All categories are present, including zero counts. Repeated
warnings retain their multiplicity. Unrecognized wording increments
`unknownWarning`; no warning text, receipt content or monetary values are
emitted by this diagnostic.

The collector requires all three fields together across all coverage rows,
checks nonnegative integer counts, a maximum total of 100, and equality
between the category sum and warning count. An absent preview must have zero
warnings and is distinguishable from a present preview without warnings.
The limit bounds the evidence protocol; it is not a product quality target.

Legacy artifacts without this entire field group remain readable. Their
ordinary-warning burden is **unavailable**, not zero. Report ordinary-warning
fixtures, reconciliation-review-hint fixtures, and their union separately,
including document-family breakdowns when available.

These observations do not define calibrated field confidence, an unsafe-value
rate or a usable-draft rate. Existing fixture field comparisons and bounded
recognition/item-retention diagnostics remain separate measurements. A
mismatch can involve missing evidence, a harmless description difference or
a wrong value; source adjudication is still required to distinguish them.
The helper adds evidence only: the strict scorer, expected truth, runtime
preview, save/Apply behavior and native exit policy are unchanged.
