# Day 1 Manual FX Snapshot Money Policy

## Purpose

This document is the docs/control architecture packet for #352, manual FX
snapshot support for Day 1 travel bills.

It defines the Day 1 manual bill-level FX snapshot model, money authority,
rounding posture, affected-user review policy, audit/privacy boundaries,
future contract/schema planning slices, and validation expectations before any
runtime/API/OpenAPI/schema/UI work starts.

This document does not implement runtime behavior, edit OpenAPI, refresh
generated clients, add schema or migrations, change money calculation code,
change auth/session/security behavior, change storage/OCR/file behavior, add
tests, add UI, add Figma/reference artifacts, create a PR, close #352, or
close #349.

## Related Documents

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Day 1 money rounding authority audit](DAY1_MONEY_ROUNDING_AUTHORITY_AUDIT.md)
- [Currency exchange architecture](CURRENCY_EXCHANGE_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Expense bill multi-tax-rate architecture](EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md)
- [Quantity claim state money policy](QUANTITY_CLAIM_STATE_MONEY_POLICY.md)
- [Bill revision snapshot architecture](BILL_REVISION_SNAPSHOT_ARCHITECTURE.md)
- [Bill revision approval and payer reconfirmation policy](BILL_REVISION_APPROVAL_POLICY.md)
- [Bill revision settlement impact and audit matrix](BILL_REVISION_SETTLEMENT_IMPACT_AUDIT_MATRIX.md)
- [Day 1 receipt and bill edge-case architecture](DAY1_RECEIPT_BILL_EDGE_CASE_ARCHITECTURE.md)
- [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md)
- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Statement reconciliation architecture](STATEMENT_RECONCILIATION_ARCHITECTURE.md)

## Day 1 Scope

Day 1 supports manual bill-level FX snapshots only when a bill's original
currency differs from the target/share currency used to calculate participant
obligations or display converted bill truth.

The manual bill-level FX snapshot is financial truth for that bill once the
bill or revision that carries it is accepted. Provider FX, Frankfurter,
automatic daily rates, global rate tables, group/context FX policy, automatic
refresh, and silent historical recalculation are not Day 1 runtime scope.

Day 1 manual FX exists so travel bills can be recorded accurately without
waiting for provider automation. It is not a general cross-currency settlement
engine. Cross-currency settlement, provider matching, statement FX matching,
travel analytics, context FX profiles, recurring FX rules, and common-currency
materialization remain later scope unless a future task explicitly promotes and
gates a focused slice.

## Snapshot Model

Future implementation should preserve a bill-scoped snapshot with enough
detail to reproduce and explain the accepted conversion.

Conceptual snapshot fields:

```text
original_amount
original_currency
target_amount
target_currency
exchange_rate
exchange_rate_direction
effective_at_or_rate_date
source_type = manual
source_note_or_reason
created_by_actor
created_at
accepted_by_or_review_basis
money_policy_version
rounding_policy_version
calculation_hash_or_version
audit_correlation_id
```

`original_currency` and `target_currency` are uppercase three-letter currency
code snapshots. Future registry UUIDs may exist, but historical financial
records must keep readable currency-code snapshots.

The canonical storage posture is directional and non-ambiguous:

```text
exchange_rate_direction = original_to_target
exchange_rate = target currency units for 1 original currency unit
target_amount = round(original_amount * exchange_rate, target currency policy)
```

Example:

```text
original_amount: 1200.00
original_currency: JPY
target_currency: HKD
exchange_rate_direction: original_to_target
exchange_rate: 0.052500
target_amount: 63.00
```

Display may show the inverse for readability, but the accepted snapshot stores
one canonical direction. If future UI accepts an inverse entry, the API/domain
layer must normalize it into the canonical direction and preserve that the
actor entered an inverse only as bounded provenance if policy needs it. The
system must not store reversible, ambiguous, or pair-unlabeled rates as
financial truth.

`effective_at_or_rate_date` is the user-entered date or timestamp that explains
the chosen manual rate, such as the receipt date, travel-date reference, card
statement date, or agreed group date. Day 1 does not fetch provider source
dates. If a future provider fallback uses a nearby source date, that belongs to
later provider FX work and must store requested and source dates separately.

## Money Authority And Rounding

API/domain services own all authoritative conversion, money calculation,
validation, residual assignment, affected-user state, status transitions, and
audit.

Clients may render original and converted values, collect explicit
user-entered manual rates, show provisional previews, and queue intent where
offline/sync policy permits. Clients do not decide financial truth, accepted
participant shares, settlement candidates, calculation hashes, affected-user
sets, payer reconfirmation truth, authorization, or audit.

Money rules:

- Original-currency amounts are preserved as entered or reviewed source facts.
- Converted target/share-currency amounts are derived by API/domain policy from
  the manual snapshot, then rounded through centralized money policy.
- Every money value carries its currency. No authoritative amount may infer
  currency from locale, symbol, receipt text, payment method, user default, or
  UI display.
- Exchange rates are decimal-safe rate values, not money amounts. They require
  their own precision and bounds policy.
- Authoritative money math uses decimal-safe server types. Floating-point math
  is forbidden for accepted conversions, shares, settlement candidates,
  reports, imports, exports, sync acceptance, or audit-derived calculations.
- Final participant shares and settlement candidates use target/share currency
  minor-unit policy where applicable.

Residual handling:

- Conversion and split allocation may create minor-unit residuals after
  rounding.
- Residuals must be assigned deterministically by normalized allocation order,
  stable split/claim row order, and stable participant or placeholder
  identifier as the tie-breaker.
- Largest-remainder ordering should be used for proportional allocation unless
  a later reviewed money policy chooses a different deterministic rule.
- Residual assignment metadata should be reproducible from persisted inputs,
  snapshot rate, currencies, policy versions, calculation hash, and allocation
  order.
- Custom converted shares must match the API/domain rounded target total after
  policy. Mismatches require validation error or explicit reviewed adjustment;
  they must not be silently spread across participants.

Validation tolerance posture:

- Day 1 should prefer deterministic exactness after server rounding over broad
  fuzzy tolerance.
- If UI submits both a rate and a converted amount for usability, the
  API/domain layer must recompute the converted amount and either accept an
  exact rounded match or return a bounded validation problem.
- Any future tolerance must be operation-specific, currency-aware, bounded in
  minor units, and audited where it affects accepted financial truth.

## Review And Affected-User Policy

Manual FX creation or editing is money-impacting when it can change any owed
share, payer contribution, settlement candidate, request line, balance
projection, report total, calculation hash, or accepted currency basis.

Conceptual workflow states may include:

```text
draft_snapshot
proposed_snapshot
pending_affected_user_review
accepted_snapshot
locked_historical_reference
rejected_or_superseded_snapshot
```

These names are planning vocabulary only. Do not add them to OpenAPI enums,
database constraints, generated clients, or runtime code in this docs/control
task.

Review rules:

- Draft-only snapshots may be mutable while no participant approval,
  settlement, export, lock, or accepted revision depends on them.
- Submitted, confirmed, rejected, disputed, non-draft OCR-derived, or shared
  bill FX changes route through bill revision policy where required.
- Affected participants are those whose target/share-currency obligation,
  residual recipient status, calculation hash, settlement basis, or review
  baseline changes.
- The paid-by person reconfirms when payer role, paid amount, payer
  contribution, payer currency basis, payer-side residual/net position, or the
  payer's own share changes.
- If the system cannot safely prove a narrow affected-user set, it must require
  full-bill review rather than silently applying the FX change.
- Settled, finalized, exported, locked, requested, marked-paid, confirmed,
  disputed, residual-bearing, proof-linked, or balance-impacting records must
  not be silently mutated in place.

Accepted snapshots become historical financial/audit records. Later edits
create a new reviewed bill/revision truth or remain blocked until a separate
settlement invalidation, adjustment, reopen, refund, waiver, credit, lock, or
governance policy exists.

## Authorization, Audit, And Privacy

Only authorized bill actors may create, propose, edit, review, accept, reject,
or inspect manual FX snapshots.

Authorization rules:

- The actor comes from the authenticated session/current-actor boundary.
- Personal, group, and direct-shared bill policies must prove bill visibility,
  participant eligibility, edit/review authority, group access where relevant,
  temporary participant policy where relevant, and downstream settlement/lock
  constraints.
- Group membership, friend status, generated client availability, route
  possession, hidden UI controls, local cache state, or offline queue presence
  is not enough authority.
- Denied, missing, archived, blocked, unrelated, and not-visible cases should
  fail closed without leaking unrelated bill, participant, settlement, file, or
  group existence.

Audit must cover successful and denied money-impacting snapshot actions where
policy requires it, including creation, proposal, rate change, target currency
change, source/reason change, acceptance, rejection, supersession, affected-user
review reset, payer reconfirmation requirement, settlement block, stale-basis
denial, and authorization denial.

Safe audit metadata may include actor ID, bill ID, revision ID, snapshot ID,
bounded old/new amount/currency pairs where policy permits, rate direction,
bounded rate category or normalized rate value where policy permits, source
type `manual`, reason category or bounded note summary, affected counts, policy
versions, calculation hash category, request/correlation ID, and safe problem
category.

Audit, logs, reports, problem details, examples, validation output, snapshots,
exports, and reconciliation readouts must not contain secrets, tokens, raw
credentials, session values, private keys, raw request/response bodies, raw OCR
text, receipt bytes, thumbnails, storage paths, object keys, bucket names,
provider internals, signed URLs, local device paths, file bytes, vault keys,
unbounded notes, unrelated personal data, unrelated payment details, unrelated
financial data, or local Codex/auth state.

Exports, reports, reconciliation readouts, and monthly summaries must respect
the accepted bill FX snapshot as financial truth. They must not recompute an
accepted bill from provider rates, fresh daily rates, user defaults, statement
rates, locale, or future group/context policy.

## Future Contract, Schema, And Client Boundaries

This task intentionally does not edit
`packages/contracts/openapi/settleora.v1.yaml` and does not regenerate clients.

Conceptual future slices may include:

- bill manual FX snapshot domain model;
- manual FX snapshot create/update/review command model;
- normalized FX snapshot read model for original and target amounts;
- FX validation/problem category model;
- affected-user and payer-reconfirmation review read model;
- bill revision snapshot detail for FX;
- settlement-impact readout for FX changes;
- audit event categories for manual FX;
- sync acceptance and stale-basis problem categories for queued FX edits;
- report/export readout fields that use accepted FX truth.

These are conceptual slices only. They are not approved schema names, route
names, OpenAPI schemas, enums, generated client classes, database tables, EF
models, migrations, or UI component names.

Future implementation must be split and gated. Contract work must use OpenAPI
as the source of truth, regenerate clients through the repo command, keep
generated clients non-hand-edited, and preserve API/domain authority for
authorization, money, storage access, status transitions, sync acceptance, and
audit.

## UI And Figma Gate Posture

#352 remains Figma/reference-gated for manual FX entry, original/converted
amount display, rate direction clarity, reason/source note, affected-user
review, payer reconfirmation, stale/offline conflict, and locked historical
readout UX.

Future UI must render server-provided financial truth and review state. It may
show provisional previews while editing, but it must clearly distinguish
unaccepted previews from accepted bill truth and must not hide required review
states in Basic mode.

## Day 1 Versus Later Scope

Day 1:

- manual bill-level FX snapshots;
- original amount/currency preservation;
- target/share amount/currency preservation;
- canonical manual rate direction;
- API/domain-owned conversion, rounding, residuals, validation, review,
  authorization, and audit once implemented;
- no silent mutation of accepted, settled, locked, exported, or historical
  financial truth.

Later scope:

- provider FX, including Frankfurter;
- provider raw rate storage and daily materialized ordered-pair rates;
- automatic daily/historical rate lookup;
- automatic refresh or provider cache refresh;
- group, trip, context, or recurring FX profiles;
- cross-currency settlement;
- statement reconciliation FX matching;
- travel analytics and common-currency dashboards;
- currency registry runtime beyond current supported-currency policy;
- automatic recalculation from provider/global/rule changes.

Later-scope work must not be moved into Day 1 without an explicit scoped task,
manual money/OpenAPI/schema/security/privacy gates where applicable, and
separate validation.

## Future Validation Matrix

Docs/control validation for this branch is limited to Markdown, scaffold, and
OpenAPI-awareness checks requested by the task. Runtime/API/OpenAPI/schema/UI
tests remain future work.

Future implementation branches should add focused validation for:

| Surface | Future validation expectations |
|---|---|
| API/domain money | Decimal-safe rate parsing, original/target currency validation, canonical direction normalization, converted amount calculation, rounding, residual assignment, custom-share mismatch rejection, stale calculation hash rejection, and no float/double financial truth. |
| Bill/revision workflow | Draft snapshot creation, proposed snapshot review, affected-user reset, payer reconfirmation, no narrow affected-user inference when snapshot detail is insufficient, and historical snapshot preservation. |
| Settlement/payment | Settlement candidate generation from accepted FX truth only, pending FX revisions not settlement truth, progressed settlement blocking, no request/payment/residual/proof mutation from pending FX edits, and no cross-currency settlement unless separately scoped. |
| Reports/export/reconciliation | Accepted bill snapshot used as financial truth, no provider/global rate recomputation, currency-bucketed original and target readouts where relevant, and privacy-safe output. |
| OpenAPI/generated clients | `npm run validate:openapi`, `npm run generate:clients`, and generated-client validation after a reviewed contract change; no hand-edited generated clients. |
| Schema/migrations | Additive snapshot persistence, decimal precision/range constraints, currency format constraints, no destructive migration of accepted bills, and migration validation. |
| Authz/audit/privacy | Authorized actor checks, denied-case privacy, audit event coverage, safe metadata bounds, and no raw OCR/file/storage/provider/secret leakage. |
| Sync/offline | Queued FX edits remain pending until API acceptance, stale basis becomes conflict, pending local intent is preserved, and local previews are not accepted truth. |
| Mobile/web/admin UI | Figma/reference gate, direction clarity, original and converted amount display, accepted versus preview state, affected-user review, payer reconfirmation, conflict and locked-history readouts. |
| Manual Figma gate | Manual review before UI implementation or acceptance claims for manual FX entry/review flows. |

Future validation command selection must follow the changed surface:

- runtime/API/domain: focused API tests plus `npm run validate:api-local`;
- OpenAPI/generated clients: `npm run validate:openapi`,
  `npm run generate:clients`, and client validation through the reviewed
  workflow;
- schema/migration: migration validation plus API validation;
- mobile/web/admin UI: relevant UI validation and Figma/reference gate;
- sync/offline: sync acceptance and mobile/local queue validation;
- docs/control only: docs/scaffold/OpenAPI-awareness validation as scoped by
  the task.

## Stop Conditions

Stop future work if a branch attempts to:

- make clients authoritative for conversions, final shares, settlement
  candidates, residual recipients, affected-user state, authorization, or
  audit;
- calculate authoritative money or accepted FX values with floating-point
  types;
- accept a money value without an attached currency;
- store an ambiguous or reversible FX rate without canonical direction;
- silently recalculate accepted bills, shares, settlements, reports, exports,
  or audit history from provider, global, daily, statement, group, context, or
  user-default rates;
- mutate settled, finalized, locked, exported, requested, marked-paid,
  confirmed, disputed, residual-bearing, proof-linked, or historical FX truth
  in place;
- add provider FX, Frankfurter, global daily rates, automatic refresh, or
  cross-currency settlement to a Day 1 manual snapshot branch;
- expose payment details, file bytes, raw OCR text, storage internals, provider
  internals, secrets, or unrelated data through FX flows;
- mix runtime/API/OpenAPI/generated-client/schema/auth/storage/OCR/sync/UI/
  Figma/Docker/CI/deploy/secret changes into a docs/control branch without
  explicit scoped task approval.

## Issue Linkage And Closure Posture

#352 remains open after this packet. #349 remains open while #350, #352, and
any other money/split/rounding gates remain unresolved. #396 is a completed
money authority audit at current issue readback time, but that audit does not
complete manual FX runtime support.

This document prepares a reviewable architecture/control basis only. Future
runtime/API/OpenAPI/schema/UI/Figma/test work must be separately scoped and
gated.
