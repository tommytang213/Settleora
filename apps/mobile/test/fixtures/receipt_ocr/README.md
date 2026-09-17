# Settleora Receipt OCR Acceptance Fixtures

This repository-ready corpus contains **101 image fixtures**.

- 14 user-provided English receipt/bill/invoice images
- 14 multilingual clean baseline receipts
- 27 currency ambiguity / symbol-resolution receipts
- 12 locale and numeric-format receipts
- 26 common semantic/layout receipts
- 8 deterministic degraded-image variants

The primary test boundary remains:

```text
image -> production preprocessing -> real native OCR -> production parser -> ReceiptOcrPreview
```

Do not replace a failing fixture with a cleaner generated substitute. Do not mark mandatory clean fixtures as expected failures merely because the current OCR implementation cannot pass them.

See `SCENARIO_MATRIX.md` for the coverage matrix and `manifest.json` for exact expected structured results.

## Currency resolution rule

Shared symbols are evidence, not truth. The expected priority is:

1. explicit ISO code or unambiguous prefixed marker (`HK$`, `US$`, etc.)
2. strong receipt country/context evidence
3. current bill/user default as a provisional fallback
4. unresolved currency requiring review

The manifest uses `expected_currency_resolution` where this distinction matters.
