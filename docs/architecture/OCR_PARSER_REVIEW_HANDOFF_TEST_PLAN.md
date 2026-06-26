# OCR Parser And Review Handoff Test Plan

## Purpose

This docs/control packet defines the required test coverage for future OCR
parser and review handoff work under #439. It covers mobile parser fixtures,
provider fake-result tests, review-preview handoff behavior, fallback states,
redaction expectations, and authority boundaries.

This packet does not authorize runtime implementation. It must not add native
OCR dependencies, OCR provider runtime, API behavior, OpenAPI contracts,
generated clients, schema/migrations, file-byte behavior, mobile/web/admin UI,
Figma/reference assets, or financial authority.

## Source Scope

- Parent issue: #359 `Implement on-device OCR extraction foundation`
- Child issue: #439 `OCR parser and review handoff tests`
- Candidate ID: `D1-CAND-021`
- Bundle ID: `ocr-1`
- Related gates:
  - #436 owns the provider integration slice.
  - #437 owns native iOS/Android build validation.
  - #438 remains the UI/Figma/reference gate for fallback, retry, offline,
    and manual-entry UX. This packet must not implement or replace #438.

## Test Principles

- OCR output is provisional. Parser output, provider output, preview success,
  saved review state, queue visibility, generated client availability, or OCR
  completion must not finalize a bill.
- The parser may suggest merchant, date, currency, totals, line items, and
  review hints, but it must not become the authority for money, tax, split,
  settlement, payer, attachment, storage, audit, or payment state.
- Mobile may parse, render, review, and queue provisional data. In server mode,
  API/domain services remain authoritative for business writes, money,
  rounding, authorization, status transitions, storage access, sync acceptance,
  and audit.
- Tests should prefer deterministic fake providers and fixture text. They must
  not require native OCR engines, ML Kit, camera, gallery, file picker, platform
  channels, CocoaPods, Gradle, device permissions, or real receipt images unless
  a later provider task explicitly scopes that validation.

## Parser Fixture Matrix

Future parser tests should keep fixture text small, named, and explicit. Each
fixture should assert both extracted candidates and review warnings/blockers.

| Category | Required coverage |
|---|---|
| Recognized text | Empty text, whitespace-only text, ordinary multiline receipt text, OCR line breaks, duplicated whitespace, punctuation noise, and non-receipt header/footer lines. |
| Line items | Single item, multiple items, quantity and unit-price patterns, item line total, item ordering, maximum line cap behavior, item names with digits, and item text that must not be mistaken for address/register/contact metadata. |
| Totals | Subtotal, grand total, line-sum match, subtotal mismatch, grand-total mismatch, missing subtotal, missing grand total, empty item set with total only, item set with no total, and explicit warnings for review before apply. |
| Tax, fee, discount, refund hints | Tax/VAT/GST labels, service charge, delivery or packaging fee, bill-level discount, coupon, points/store credit/gift-card style negatives, tender/change/card/cash rows that must not become item shares, void/free/zero-price rows, refund/return/tax-correction hints, and unknown negative rows that remain manual-review candidates. |
| Merchant/date/currency hints | Merchant detection near the top of the receipt, address lines skipped as merchant or item rows, ISO dates, slash dates, missing date, explicit currency code, explicit local currency markers, ambiguous dollar symbol, fallback currency use, unsupported or missing currency, and currency mismatch warning paths. |
| Unsupported receipts | Non-receipt text, receipt-like text with no item and no total, unsupported language/script where the phase does not support it, unsupported file/content type from intake safety, and manual-entry fallback expectations. |
| Low-confidence text | Garbled OCR, partial words, broken amounts, line descriptions without amounts, amount-like isolated digits, OCR confusion between labels and prices, and warnings that keep the review editable. |
| Malformed rows | Multiple amounts on one line, locale separators, currency symbols attached to numbers, invalid decimals, negative item totals, exponent-like values, `NaN`/`Infinity`-like text, and rows where text or amount must be rejected rather than normalized into authoritative money. |
| Duplicate lines | Duplicate item rows, duplicate total rows, repeated receipt headers, repeated OCR blocks, duplicate tender lines, and deterministic behavior that does not silently de-duplicate money-relevant data without review. |
| Missing totals | Item-only receipts, total-only receipts, missing line totals, missing currency with totals present, and warnings/blockers that route to edit or manual entry before any apply. |

## Provider Fake-Result Coverage

Provider-facing tests should use fake `ReceiptOcrProvider` implementations or
direct `ReceiptOcrResult` instances so parser and handoff behavior remains
deterministic.

Required fake result cases:

- `extracted` with high-quality recognized text parsed into editable preview
  data.
- `extracted` with warnings, mismatches, missing currency, missing total, or
  low-confidence text.
- `unsupported` for unsupported platform, content type, file type, or provider
  configuration.
- `failed` for OCR engine failure, missing prepared image path, empty recognized
  text, provider exception, cancelled image preparation, or transient native
  failure.
- Offline/server-unavailable flow where extracted data can be reviewed locally
  but remains queued/provisional in server mode.
- Manual-entry fallback from every unsupported, failed, cancelled, blocked, and
  low-confidence state.

Fake-result tests must assert that no raw OCR text, image bytes, local paths,
storage object keys, provider internals, native exception details, tokens,
credentials, or unrelated sensitive data are logged or surfaced as audit-like
payloads.

## Review Preview Handoff Coverage

Review handoff tests should prove that parser candidates become editable review
data, not authoritative bill data.

Required assertions:

- Merchant, receipt date, currency, subtotal, tax, service, discount, total,
  line description, quantity, unit price, line total, line ordering, category,
  and review hints map into editable review fields where that surface exists.
- User edits override candidate display values before save or preview.
- Missing, unsupported, or low-confidence fields remain editable and visibly
  provisional.
- Preview generation is read-only and can show warnings, blocked reasons, and
  candidate lines without mutating bills.
- Apply remains explicit and draft-only where current API policy permits it.
- Stale saved review timestamps, missing reviews, deleted/removed attachments,
  unsupported currency, mismatched line/header currency, header-total mismatch,
  empty line sets, unsafe bill state, and downstream settlement/payment
  dependencies remain blocked or routed to a future policy path.
- Personal and group bill routes preserve their authorization boundaries; a
  group route must not be bypassed by a standalone OCR handoff path.

## Handoff State Matrix

| State | Expected test outcome |
|---|---|
| Unsupported | Shows safe unsupported state and manual-entry path; no provider dependency, bill mutation, storage mutation, or audit/raw text leak. |
| Retry | Retry re-runs through the provider seam or fixture fake only; previous provisional edits are preserved or explicitly discarded by reviewed UX policy. |
| Offline | Local-only may review local provisional data; server-mode queues or preserves pending work without pretending API acceptance occurred. |
| Failed | Failure message is bounded and user-actionable; native/provider exceptions and raw payloads are not exposed. |
| Cancelled | Cancellation returns to the prior edit/manual state without creating bill, split, settlement, attachment, payment, or audit side effects. |
| Manual entry | Manual entry remains reachable and does not require OCR success. OCR candidate data, if reused, stays user-reviewed and editable. |

## Authority And Non-Mutation Proof

Future tests that touch parser/review handoff must include negative assertions
or explicit fixture contracts proving parser/provider output does not:

- finalize bills or change bill status;
- create, update, delete, archive, restore, or apply authoritative bill rows;
- create or mutate item splits, tax groups, discounts, refunds, fees, payer
  contributions, participant acceptance, or bill calculation truth;
- create or mutate settlement requests, settlement payments, allocations,
  residuals, balances, proof records, payer state, or payment records;
- create or mutate receipt attachments, file bytes, file metadata, storage
  object keys, storage paths, thumbnails, OCR jobs, worker state, or audit rows;
- bypass API/domain authorization, group membership checks, storage access
  policy, sync acceptance, status transition policy, or settlement safety.

If a future implementation intentionally crosses any of these boundaries, #439
is no longer the right scope. Stop and create a separately gated runtime,
OpenAPI, schema, storage, money, or UI task.

## Safe Logging And Redaction

Tests and implementation tasks should treat OCR text and receipt data as
sensitive. Logs, audit-like diagnostics, failure messages, telemetry, and test
snapshots must not include:

- raw OCR full text dumps;
- receipt or file bytes;
- local filesystem paths, storage paths, storage object keys, signed URLs,
  provider internals, or vault internals;
- secrets, tokens, credentials, recovery codes, auth/session fields, raw
  request bodies, raw provider exceptions, or deployment config;
- payment details, unrelated user identifiers, unrelated profiles, or unrelated
  sensitive content.

Allowed diagnostics should be bounded categories such as status, fixture name,
line count, warning code/category, block reason code/category, and safe boolean
capabilities.

## Future Validation Commands By Changed Surface

Docs/control-only updates like this packet:

```bash
git status --short
git diff --name-only origin/main...HEAD
git diff --check origin/main...HEAD
npm run doctor:validation
npm run validate:docs
npm run validate:scaffold
```

Mobile parser, fake-provider, and review handoff tests:

```bash
npm run doctor:mobile
cd apps/mobile && /opt/flutter/bin/flutter pub get
cd apps/mobile && /opt/flutter/bin/flutter analyze
cd apps/mobile && /opt/flutter/bin/flutter test test/receipt_ocr_capture/receipt_ocr_parser_test.dart
cd apps/mobile && /opt/flutter/bin/flutter test
```

Mobile provider integration under #436 or native validation under #437:

```bash
npm run doctor:mobile
cd apps/mobile && /opt/flutter/bin/flutter pub get
cd apps/mobile && /opt/flutter/bin/flutter analyze
cd apps/mobile && /opt/flutter/bin/flutter test
```

If future work crosses API/domain authority, bill apply behavior, settlement,
storage/file access, OpenAPI, generated clients, schema/migrations, auth, sync,
or audit, stop and rescope before running broader validation. The appropriate
future gate may require some of:

```bash
npm run validate:openapi
npm run generate:clients
npm run validate:clients
npm run validate:api-local
```

Do not run or rely on these broader commands as evidence that #439 authorized
those changes; they belong to separately scoped tasks.

## Blocked Future E2E Coverage

Full end-to-end OCR parser/provider/review coverage remains blocked until later
provider and native validation work lands:

- #436 must provide the concrete provider integration boundary before provider
  E2E tests can exercise real recognized text from an OCR engine.
- #437 must validate iOS/Android native build behavior, model availability,
  platform constraints, and native failure paths before native OCR E2E is a
  reliable acceptance signal.
- #438 must provide the UI/Figma/reference direction before fallback, retry,
  offline, and manual-entry UX implementation is judged visually complete.

Until those land, #439 coverage should stay at parser fixtures, deterministic
fake-provider results, review handoff contracts, and non-mutation/redaction
proof.
