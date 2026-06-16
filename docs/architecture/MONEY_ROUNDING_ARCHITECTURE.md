# Money And Rounding Architecture

## Purpose

This document defines Settleora's Day 1 architecture direction for money, currency, rounding, allocation, decimal safety, and future financial persistence.

It is a design gate before implementing expenses, bills, settlements, balances, reimbursements, reconciliation, forecasting, or exchange-rate runtime behavior. Money rules need to be centralized before those domains exist so future feature branches do not invent slightly different financial truth in each endpoint, client, worker, or database table.

## Current State

The current repository state is:

- Internal `CurrencyCode` exists in the API project.
- Internal `MoneyAmount` exists in the API project.
- Internal `SupportedCurrencyPolicy` exists in the API project. It is intentionally small today and is not a complete ISO-4217 registry.
- Internal `MoneyRoundingService` exists in the API project.
- Internal `MoneyAllocationService` exists in the API project.
- Focused `MoneyFoundationTests` cover currency validation, decimal parsing, bounds, rounding, supported minor units, and allocation behavior.
- An internal bill calculation/split service exists for draft/pending-style bill totals, item split resolution, participant share aggregation, adjustment allocation, and payer contribution validation.
- EF Core migrations now define schema-only expense/bill root, item, item split, participant, payer, adjustment, and attachment foundations. Money-bearing bill tables use decimal-safe amount plus currency columns as persistence backstops; item split `basis_value` is calculation basis only, while `resolved_amount` plus `resolved_currency` is the authoritative stored item split money value. Guarded personal/group bill create/read and bill workflow endpoints use the internal bill calculation/split service and money foundation for same-currency totals, split resolution, participant shares, adjustment effects, and payer contribution validation.
- EF Core migrations also define settlement request, payment, proof attachment, request-line, payment-allocation, and residual schema foundations. Current settlement candidate preview, request creation/read, payment read/claim/confirmation/dispute/cancellation, request dispute/cancellation, proof endpoints, basket preview/create, residual proposal/confirmation/finalization, and read-only balance projection use same-currency decimal-safe amount/currency values. Reimbursement, broad money ledger, refund, settlement simplification, and balance projection write/cache workflows do not exist yet.
- `user_profiles.default_currency` exists as an optional user preference with uppercase three-letter validation. It is not a complete money model and must not be treated as authoritative amount data.
- Payment details and payment QR file linkage exist, but they are payment instructions and sensitive profile data. They are not authoritative monetary values, balances, settlement amounts, or payment records.
- The OpenAPI contract includes shared `CurrencyCode`, `Money`, and `RoundingMode` schemas plus current bill, bill attachment, settlement, settlement basket, settlement residual confirmation, and settlement balance projection feature paths. Generated clients include those current backend slices. Reimbursement, recurring, forecasting, broad credit-ledger/refund/simplification runtime, and reconciliation feature paths are not implemented yet.
- `CURRENCY_EXCHANGE_ARCHITECTURE.md` defines broader Day 2 exchange-rate direction. It does not replace the Day 1 need for decimal-safe money values, rounding, allocation, validation, and persistence rules before expense/bill/settlement implementation.
- `STATEMENT_RECONCILIATION_ARCHITECTURE.md` defines Day 2 statement import and matching direction. It depends on stable money and currency semantics but does not authorize expense or settlement mutation.

## Authority Principles

Settleora money behavior follows these hard rules:

- API/domain services are authoritative for money calculations, rounding, allocation, settlement balances, and money-impacting status transitions.
- Clients may format, display, preview, and validate forms for usability, but clients must not authoritatively calculate owed amounts, settlement totals, balances, allocation residuals, or status transitions.
- Workers must not directly mutate core money, expense, bill, settlement, balance, reimbursement, or reconciliation tables.
- Worker output that influences money must be treated as provisional until the API validates and accepts it through reviewed domain services.
- Money calculations and persisted money values must be decimal-safe.
- Every persisted amount must carry an attached currency.
- Rounding must be centralized, policy-driven, deterministic, and test-covered.
- Floats and doubles are forbidden for money calculations, API/domain money models, and persisted money values.
- Display formatting is separate from persisted truth.
- Privacy vault behavior must not move shared financial truth, settlement states, balances, authorization, or audit decisions into client authority.

## Implementation-Facing Concepts

The internal money foundation has introduced small, boring domain concepts before adding expenses or settlements:

```text
MoneyAmount
CurrencyCode
SupportedCurrencyPolicy
MoneyRoundingService
MoneyAllocationService
```

Current responsibilities:

- `CurrencyCode` validates uppercase ISO-style three-letter currency identifiers.
- `MoneyAmount` carries a decimal-safe amount plus a required `CurrencyCode` and validates decimal strings, bounds, sign policy, scale, and supported-currency requirements.
- `SupportedCurrencyPolicy` defines the currently supported currency/minor-unit set. It is deliberately small and should evolve through reviewed policy changes rather than pretending to be a full ISO-4217 registry.
- `MoneyRoundingService` centralizes rounding to storage scale and currency minor units.
- `MoneyAllocationService` resolves equal, weighted, and custom splits with deterministic residual handling.

Day 1 should use decimal amount plus ISO-style currency code as the public and persisted model:

```text
amount: decimal-safe value
currency: uppercase three-letter code
```

Internally, allocation and final settlement can also project amounts into currency minor units after the rounding policy is applied. Minor units are useful for deterministic cent allocation, but they should not be the only Day 1 representation because Settleora also needs OCR review, tax/service-charge allocation, exchange-rate snapshots, statement matching tolerances, and currencies with zero or three fractional digits.

Recommended practical Day 1 direction for .NET and PostgreSQL:

- API/domain math uses .NET `decimal`.
- JSON contracts represent decimal amounts as strings.
- PostgreSQL stores authoritative amounts as `numeric(19,4)` plus a required currency column unless a later reviewed schema proves a narrower or wider precision is required.
- Allocation services convert rounded final payable amounts to currency minor units for residual distribution, then convert back to decimal-safe money values for persistence/API output.
- Exchange rates use a separate rate model and precision policy. Do not store exchange rates in ordinary money amount columns.

## Currency And Amount Rules

Currency code rules:

- Currency codes must be uppercase three-letter strings matching `^[A-Z]{3}$`.
- Regex validation is only a syntactic gate. A future supported-currency registry should decide whether a syntactically valid code is supported for money entry, settlement, exchange, statement import, or display.
- The system must not infer currency from locale, symbol, display text, payment method, or user default currency once an authoritative money value is persisted.
- User default currency may prefill forms or resolve ambiguous OCR suggestions, but persisted expense/bill/settlement amounts must carry their own currency.

Amount precision and bounds:

- Day 1 persisted business amounts should default to `numeric(19,4)` in PostgreSQL.
- API/domain validation should reject values that exceed the chosen storage range before hitting the database.
- A practical initial bound for `numeric(19,4)` is absolute value less than or equal to `999999999999999.9999`.
- API/domain validation should reject more fractional digits than the operation permits. Do not rely on the database to silently coerce request precision.
- Intermediate calculations may use more precision inside .NET `decimal`, but final persisted financial results must pass the operation's rounding policy before storage.

Negative amount policy:

- Ordinary expense totals, bill totals, settlement payment amounts, and participant owed shares should be non-negative.
- Refunds, credits, reversals, waivers, and corrections should be explicit business records or adjustment lines with clear direction/type fields.
- If a future table stores signed adjustment amounts, the sign policy must be documented in that table's design and tested with status transitions and audit.
- Negative values must not be smuggled into ordinary bill or settlement paths as an unreviewed shortcut.

Zero amount policy:

- Zero balances can be valid calculated results.
- Zero-value bill lines, settlement payments, or custom split shares should be rejected unless a reviewed workflow explicitly allows zero for drafts, waived participants, metadata-only rows, or correction records.
- Zero residuals should be represented by absence of residual movement, not by hidden adjustment rows.

Nullability:

- Authoritative persisted amounts should be required when a financial record becomes active, submitted, confirmed, settled, exported, or reconciled.
- Nullable amounts are acceptable only for drafts, provisional OCR candidates, incomplete imports, or optional filters where the state machine makes incompleteness explicit.
- Nullable currency without nullable amount, or nullable amount without nullable currency, should be avoided. Money is a pair.

Display:

- Persisted truth is decimal value plus currency code.
- Formatting, symbols, grouping separators, localized decimal separators, and accounting-style display are presentation concerns.
- API responses should not use locale-formatted strings such as `HK$1,234.50` as authoritative money values.

## Database Schema Direction

Future money-bearing tables should use a consistent column pair:

```text
amount numeric(19,4) not null
currency character varying(3) not null
```

`character varying(3)` matches the existing `user_profiles.default_currency` style. A future schema branch may choose `character(3)` only if it also proves padding and EF behavior stay clean.

Database rules:

- Avoid `float`, `double precision`, approximate numeric types, and locale-formatted strings for money.
- Add currency check constraints such as `currency ~ '^[A-Z]{3}$'`.
- Add amount range constraints where practical.
- Use database scale/precision as a backstop, not as the only rounding or validation layer.
- Add operation-specific constraints when a table's semantics require non-negative values.
- Keep amount and currency columns adjacent and consistently named for every money-bearing value.
- Name snapshot columns explicitly when the same row carries more than one money value, such as `original_amount`, `original_currency`, `settlement_amount`, and `settlement_currency`.

Example future table patterns:

```text
expense_total_amount numeric(19,4) not null
expense_total_currency character varying(3) not null

participant_share_amount numeric(19,4) not null
participant_share_currency character varying(3) not null

settlement_requested_amount numeric(19,4) not null
settlement_requested_currency character varying(3) not null
```

Refunds, credits, and negative adjustments:

- Prefer explicit record types such as `refund`, `credit`, `waiver`, `reversal`, or `manual_adjustment` over negative ordinary expenses.
- If signed amounts are allowed for adjustment tables, use a constrained `direction` or `adjustment_type` column so reporting and audit can distinguish a credit from a normal charge.
- Settlement payment rows should avoid negative payments; reversals should be separate records or state transitions.

Split shares and residuals:

- Store resolved participant shares as explicit amount/currency pairs so historical calculations remain stable.
- Store enough metadata to explain allocation, such as split method, participant set, basis percentage/ratio/custom amount, allocation order, and residual assignment reason.
- Rounding residuals must be visible to audit and reproducible from persisted inputs.
- Residuals should not be hidden in client-side totals, unpersisted display-only math, or anonymous adjustment rows.

## Rounding Policy

Rounding must happen in a central API/domain policy, not in clients, generated models, database defaults, or worker scripts.

Day 1 rounding direction:

- Parse and validate request amounts before business calculations.
- Keep intermediate arithmetic in .NET `decimal`.
- Avoid rounding after every intermediate operation unless the operation's policy explicitly requires it.
- Round at persistence, allocation, final payable, settlement, and display-contract boundaries.
- Use currency minor units for final payable and settlement amounts.
- Preserve enough precision for calculation inputs where the domain requires it, especially tax, service charge, percentage splits, OCR review, statement tolerance, and exchange-rate snapshots.
- Make every midpoint decision explicit. Do not call .NET rounding APIs in a way that relies on default midpoint behavior.

Default rounding mode:

- Day 1 should start with explicit `MidpointRounding.ToEven` for neutral nearest rounding unless a specific operation or currency policy requires another reviewed mode.
- User-facing policy labels such as `nearest`, `round_up`, or `round_down` should map to explicit .NET behavior.
- If a later product policy chooses half-away-from-zero for a particular workflow, it must use `MidpointRounding.AwayFromZero` explicitly and add tests that prove the tie behavior.

Currency minor units:

- Currency policy must know the final settlement scale for each supported currency, such as 2 for HKD/USD, 0 for JPY, and 3 for currencies that require three minor digits.
- Do not assume every currency has two decimal places.
- Unsupported currency should fail validation rather than falling back to two decimals for authoritative records.
- Incoming request precision may be stricter than stored precision for a given operation. For example, a final settlement in JPY should not accept fractional yen.

Intermediate and final precision:

- Intermediate calculations can retain up to the safe useful precision of .NET `decimal`, guarded by bounds and scale checks.
- Persisted operation results should use the table's declared precision and scale.
- Final settlement/payment display should use the currency minor unit, not always four stored decimals.
- Display rounding and settlement rounding may differ, but settlement rounding is authoritative.

## Allocation And Splitting Policy

All split allocation must be server-authoritative and deterministic.

Equal splits:

- Convert the rounded total to currency minor units for the final allocation step.
- Divide integer minor units by eligible participants.
- Assign the residual minor units in a deterministic order, such as explicit split-line order and then stable participant ID.
- Persist resolved participant shares and residual assignment metadata.

Percentage or ratio splits:

- Validate percentage or ratio inputs through the API.
- Percentages should sum exactly to the accepted basis, such as 100 percent or 10000 basis points.
- Calculate raw shares with decimal arithmetic.
- Round final participant shares through the centralized allocation policy.
- Assign residuals using largest-remainder ordering with deterministic tie-breaking.

Custom amount splits:

- Validate that custom participant amounts use the same currency as the bill/settlement operation unless a reviewed cross-currency flow exists.
- Require the custom amounts to match the rounded total after policy. If they do not match, return a validation error or require an explicit manual adjustment line.
- Do not silently spread custom split mismatches across other participants.

Participant state:

- Day 1 bill allocation should be able to exclude participants from a specific bill or item.
- Future `default_excluded`, guest, left, removed, or inactive states must feed into the server-side eligibility set.
- Clients can show default participant selections, but the API must resolve the final participant set.

Residual auditability:

- Residual assignment must be reproducible from persisted inputs and policy version.
- Residual assignment should record the participant or split line that received the extra minor unit when the residual is non-zero.
- API responses may show resolved shares, but the server remains the source of truth.

Conceptual example:

```text
HKD 10.00 split equally across 3 participants
rounded minor units: 1000 cents
base share: 333 cents
residual: 1 cent
resolved shares: 3.34, 3.33, 3.33 according to deterministic allocation order
```

## Currency And Exchange Boundaries

This document complements `CURRENCY_EXCHANGE_ARCHITECTURE.md`.

Day 1 can support currency-attached amounts without implementing exchange-rate conversion. That means a bill, settlement, or participant share can have an explicit currency even if cross-currency conversion is deferred.

Rules:

- Do not silently convert currencies without a reviewed rate source and audit trail.
- Do not combine mismatched currencies inside one authoritative bill, split, balance, or settlement operation unless the workflow explicitly stores exchange-rate snapshots and converted values.
- Cross-currency settlement is future or explicit scope unless a later reviewed implementation branch defines it.
- Three-letter currency codes should be snapshotted onto financial records even when a future currency registry uses UUID internal primary keys.
- Bill-level FX snapshots are financial truth for converted bills; provider/global/resolved exchange rates remain reference/cache inputs and must not silently recalculate historical bills.
- Back-dated bills that require FX should use bill/receipt date for historical rate lookup and store both requested and source rate dates when a provider fallback uses a nearby or previous available date.
- If a user enters a bill in one currency and settles in another, future schema must store original amount/currency, settlement amount/currency, exchange rate, rate direction, rate date, provider/source, precision, and whether the rate was overridden.
- Existing bills must not be retroactively recalculated when newer exchange rates are fetched.
- Statement settled amounts should remain separate from bill exchange snapshots.

Exchange rates are not money amounts. They need source, timestamp, pair, precision, auditability, and reproducibility.

## API And OpenAPI Direction

This branch does not change OpenAPI.

Future contracts should introduce or refine an explicit money DTO shape:

```text
MoneyAmountDto
amount: string
currency: string
```

The recommended API representation for decimal amounts is a JSON string, not a JSON number.

Reasons:

- JavaScript and JSON tooling often parse numbers as binary floating point.
- Generated clients should not encourage client-side floating point math for authoritative amounts.
- String amounts preserve the exact submitted decimal representation for validation.
- The server can parse using invariant-culture decimal rules and return stable validation errors.

Validation direction for string amounts:

- Accept plain base-10 decimal strings only.
- Reject exponent notation, locale separators, currency symbols, whitespace-wrapped values, `NaN`, `Infinity`, and empty strings.
- Normalize accepted values through server-side policy before persistence.
- Return generated-client types as strings for amount fields, with helper APIs layered outside generated code if needed.

Future OpenAPI schemas should keep currency as an uppercase three-letter string with a stable schema name and validation pattern. Endpoint-specific request/response schemas should decide whether zero, negative, optional, or draft-only amounts are allowed.

## Validation And Errors

Future money validation must use stable error codes and bounded messages.

Validation cases:

- Unsupported currency.
- Invalid currency format.
- Invalid decimal format.
- Too many fractional digits for the operation or currency.
- Amount too large or too small.
- Negative amount where not allowed.
- Zero amount where not allowed.
- Missing amount or currency when required.
- Amount provided without currency, or currency provided without amount.
- Mismatched currencies inside one bill, split, settlement, reimbursement, balance, import, or reconciliation operation.
- Custom split amounts that do not match the expected total.
- Percentages or ratios that do not sum to the accepted basis.

Error privacy rules:

- Do not echo large untrusted raw request bodies.
- Do not include unrelated user financial data in denied or invalid responses.
- Do not reveal whether unrelated expenses, bills, settlements, payment profiles, statements, or users exist.
- Keep validation details field-scoped and bounded, such as `amount`, `currency`, `split.participants[2].amount`, or stable problem codes.

## Audit And Privacy

Money-impacting changes must be auditable without turning audit logs into another data leak.

Future audit records should cover:

- Expense/bill creation, update, archive, restore, and money-impacting edits.
- Split method changes and participant share recalculation.
- Rounding policy version changes affecting a record.
- Residual assignment where the residual is non-zero.
- Settlement request, mark-paid, partial payment, confirmation, dispute, cancellation, and reversal transitions.
- Refund, credit, waiver, reimbursement, and manual adjustment lifecycle.
- Exchange-rate override, source change, target currency change, and converted amount change.
- Statement reconciliation match/unmatch and amount/currency mismatch decisions.

Audit metadata boundaries:

- Include action/category, actor ID where available, subject stable IDs, correlation ID, policy/version identifiers, and bounded old/new money values where policy allows.
- Avoid raw request bodies, unbounded free text, full statement rows, OCR raw text, storage paths, provider internals, file bytes, tokens, credentials, and vault internals.
- Denied responses and failure audits must not leak unrelated user financial data.
- Admin/support access to money records needs separate reviewed policy and audit coverage.

## Testing Requirements

The current internal money foundation includes focused `MoneyFoundationTests`. Future expense, bill, split, settlement, persistence, and API slices should keep extending these tests before broader financial runtime depends on new behavior:

- Decimal parsing and precision tests.
- Invalid decimal format tests.
- Currency format and unsupported currency tests.
- Amount bounds tests.
- Negative and zero policy tests.
- Rounding mode tests, including explicit midpoint behavior.
- Currency minor-unit tests for 0, 2, and 3 fractional-digit currencies.
- Intermediate precision tests for tax, service charge, percentage, and ratio calculations.
- Equal split allocation residual tests.
- Percentage/ratio split residual tests.
- Custom amount split mismatch tests.
- Multi-participant and participant-exclusion tests.
- Currency mismatch tests.
- Persistence precision and scale tests.
- API serialization tests proving decimal amounts stay strings.
- Generated-client shape tests or validation checks after OpenAPI changes.
- Audit metadata bounds tests.
- Denial/error privacy tests.

## Non-Goals

This architecture document does not authorize additional work outside a reviewed implementation slice:

- New migrations.
- New OpenAPI changes.
- New generated client changes.
- Balance projection write/cache runtime beyond the current read-only settlement balance endpoint.
- Basket/residual runtime beyond the current same-currency pay-all basket preview/create and bounded receiver-confirmed residual finalization slices.
- Reimbursement runtime.
- Exchange-rate runtime implementation.
- Statement reconciliation implementation.
- Recurring or forecasting runtime.
- UI behavior.
- Worker behavior.
- OCR behavior changes.
- AI insights implementation.
- Silent cross-currency conversion.
- Database schema changes for balances or reconciliations.

## Next Implementation Candidate

Recommended next candidates should extend the existing bill and settlement slices without moving money authority into clients:

1. Additional basket/residual behavior beyond the current same-currency pay-all basket preview/create and bounded receiver-confirmed residual finalization slices.
2. Balance projection write/cache or broader balance behavior beyond the current read-only settlement balance endpoint.
3. Reimbursement or reconciliation design gates after the scoped settlement balance projection rules are proven.

This architecture document still does not authorize broader balance, reimbursement, reconciliation, exchange-rate, worker, or UI implementation by itself. Existing bill and settlement slices must continue to treat the API/domain layer as the money authority and generated clients as transport helpers, not financial authority.
