# Quantity Claim State Money Policy

## Purpose

This document is the docs/control architecture packet for #350, quantity-level item claiming and unresolved claim states.

It defines Day 1 planning vocabulary, quantity semantics, money allocation policy, review/authorization boundaries, revision/settlement interactions, and future validation expectations before runtime/API/OpenAPI/schema/UI work is split into smaller gated tasks.

This document does not implement runtime behavior, edit OpenAPI, refresh generated clients, add schema or migrations, change money calculation code, change auth/session/security behavior, change storage/OCR/file behavior, add tests, add UI, add Figma/reference artifacts, create a PR, close #350, or close #349.

## Related Documents

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Day 1 money rounding authority audit](DAY1_MONEY_ROUNDING_AUTHORITY_AUDIT.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Expense bill multi-tax-rate architecture](EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md)
- [Currency exchange architecture](CURRENCY_EXCHANGE_ARCHITECTURE.md)
- [Bill revision snapshot architecture](BILL_REVISION_SNAPSHOT_ARCHITECTURE.md)
- [Bill revision approval and payer reconfirmation policy](BILL_REVISION_APPROVAL_POLICY.md)
- [Bill revision settlement impact and audit matrix](BILL_REVISION_SETTLEMENT_IMPACT_AUDIT_MATRIX.md)
- [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md)
- [Bill revision OCR apply policy](BILL_REVISION_OCR_APPLY_POLICY.md)
- [Friends and direct sharing API policy](FRIENDS_DIRECT_SHARING_API_POLICY.md)
- [Direct bill sharing authorization model](DIRECT_BILL_SHARING_AUTHORIZATION_MODEL.md)
- [Temporary participant claim and link flow](TEMPORARY_PARTICIPANT_CLAIM_LINK_FLOW.md)
- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Lock, refund, and group governance architecture](LOCK_REFUND_GOVERNANCE_ARCHITECTURE.md)

## Authority Boundary

Quantity claims are money-adjacent bill facts. In server mode, API/domain services must own:

- eligibility to open an item for self-claim;
- eligibility to claim, reduce, cancel, revise, approve, or finalize a claim;
- item quantity validation and remaining-quantity calculation;
- authoritative participant shares, tax/fee/discount/refund propagation, rounding, and residual assignment;
- bill readiness, submission, approval, revision, settlement, export/report eligibility, sync acceptance, and audit;
- stale-state, conflict, overclaim, unresolved-quantity, and creator-review outcomes.

Clients may render server-provided claim state, collect user intent, run convenience validation, queue offline edits, and show non-authoritative previews. Clients must not become the source of claim authority, final share calculation, final tax allocation, residual assignment, settlement readiness, authorization, or audit truth.

OCR, import, offline queue, generated client, and UI-provided claim facts are provisional until API/domain validation accepts them. Generated client availability does not imply permission.

## Day 1 Claim State Vocabulary

The following names are planning names only. Do not add them to OpenAPI enums, database constraints, generated clients, or runtime code in this docs/control task.

| State | Planning meaning | Calculation posture |
|---|---|---|
| `unassigned` | The item has no participant claim or explicit split assignment. The creator has not opened it for self-claim or assigned it. | Draft/review only. It cannot participate in authoritative final share calculation except as a blocked unresolved item. |
| `open_to_claim` | An authorized creator/owner/editor has made the item claimable because the responsible eater/buyer is unknown. | Draft/review only. Claimable quantity remains unresolved until accepted claims cover policy-required quantity. |
| `partially_claimed` | At least one accepted or pending claim exists, but accepted claim quantity is less than item quantity. | Review state. It cannot support authoritative finalization unless a later explicit policy allows unresolved remainder handling. |
| `fully_claimed` | Accepted claim quantities exactly equal item quantity and no conflict/review condition remains. | Eligible input for authoritative share calculation after API/domain validation, rounding, and residual policy. |
| `overclaimed_conflict` | Claim quantities exceed item quantity, duplicate incompatible claims exist, or stale/offline claims conflict. | Blocking review state. It cannot participate in authoritative final share calculation. |
| `needs_creator_review` | Creator/owner review is required because claims conflict, leave unresolved quantity, affect residuals/tax/discount/refund/fee allocation, or were changed by a stale/offline/manual path. | Blocking review state until API/domain policy accepts a deterministic resolution. |
| `ready_for_share_calculation` | API/domain validation has accepted the claim basis, participant eligibility, quantity sum, money inputs, and review gates for calculation. | Authoritative calculation may proceed server-side. Clients may still only display the result. |
| `locked_historical_reference` | Claim facts are retained as historical basis for an accepted, finalized, settled, exported, locked, or revision-snapshotted bill. | Read-only historical reference. Future changes require revision, adjustment, reopen, or lock/refund policy instead of in-place mutation. |

Only `ready_for_share_calculation` and validated `fully_claimed` facts may feed authoritative participant-share calculation. `locked_historical_reference` may explain prior calculations but must not be recalculated in place.

## Quantity Model

Day 1 quantity claiming should model these concepts:

```text
item_quantity
claim_quantity
remaining_quantity
claimant_profile_or_placeholder
claim_state
claim_basis_version
```

`item_quantity` is the reviewed quantity for the item. `claim_quantity` is the quantity one eligible participant claims. `remaining_quantity` is derived by the API/domain layer as `item_quantity - accepted_claim_quantity_sum`. A claimant can be a registered participant or an eligible temporary participant placeholder only where participant policy allows it.

Example:

```text
Item: 3 udon, HKD 90.00 total
Participant A claims 1
Participant B claims 2
Accepted quantity sum: 3
State: fully_claimed -> ready_for_share_calculation
Allocation basis: A gets 1/3 of item money effects, B gets 2/3
```

If OCR or manual entry does not provide a quantity, Day 1 should default the item quantity to `1` only after review accepts that default. The missing source should remain distinguishable as `unknown_from_source` or equivalent planning provenance so users can correct it before finalization. OCR text, receipt bytes, and raw parser details must not become audit payloads.

Day 1 should use positive integer quantities for claimable item units. Fractional quantities are not allowed for authoritative Day 1 quantity claims. A future fractional extension would need an explicit unit model, precision policy, denominator or decimal-scale rules, UI review behavior, OpenAPI/schema changes, generated-client refresh, rounding/residual tests, and migration/backfill policy.

Deterministic behavior:

- accepted claim quantities exactly equal item quantity: eligible for final calculation;
- accepted claim quantities are less than item quantity: `partially_claimed` and block finalization/settlement unless a future policy explicitly assigns the remainder;
- accepted claim quantities exceed item quantity: `overclaimed_conflict` and block finalization/settlement;
- claim quantity is zero, negative, non-integer, exceeds item quantity alone, or uses unsupported precision: reject or mark as conflict according to future API policy;
- stale/offline claims must revalidate at sync acceptance time and become conflict rather than silently overwriting newer claim truth.

## Money Allocation Policy

Quantity claims allocate the item's complete money effect, not only its base price. The API/domain layer must calculate:

- item subtotal and item total;
- item tax and tax group effects;
- service fee, delivery fee, packaging fee, surcharge, seat charge, and similar fee components;
- discounts, coupons, credits, points/gift-card/store-credit contribution effects where reviewed policy treats them as shared-cost components;
- refunds, returns, tax corrections, and manual adjustments that are linked to the item or tax group;
- rounding residuals at item, component, participant, payer, settlement, and final payable boundaries where applicable.

Default Day 1 allocation for a fully claimed item is proportional by accepted claim quantity. If one participant claims `1` of `3` and another claims `2` of `3`, the raw basis is one-third and two-thirds for every item-linked money component, subject to tax-group and component-specific policy.

Tax follows the item by default. A participant who claims only reduced-rate items must not receive standard-rate tax merely because the bill contains standard-rate items. Receipt-level grouped tax totals allocate only across matching items in the same reviewed tax group. Fee, discount, refund, and return propagation must preserve the component classification, tax linkage, contribution treatment, and review state defined in the multi-tax and receipt edge-case architecture.

All money remains decimal-safe and currency-attached. No floating-point money is allowed in authoritative domain logic, persisted records, API contracts, generated clients as authority, reports, sync acceptance, or audit-derived calculations.

Rounding and residual policy:

- API/domain services round through the centralized money policy.
- Final allocation uses currency minor units where appropriate.
- Residual cents are assigned deterministically by normalized allocation order, then stable claim/split row order, then stable participant/placeholder identifier as the tie-breaker.
- Largest-remainder ordering should be used for proportional quantity allocation unless a later reviewed money policy chooses a different deterministic rule.
- Residual assignment metadata should be auditable and reproducible from persisted inputs, policy version, calculation hash, and allocation order.
- Clients may show previews, but server/API/domain output is the only authoritative final share.

## Open, Self-Claim, And Unresolved Behavior

Who may open an item:

- Bill creator, bill owner/responsible editor, or an authorized group/context role may open an item to self-claim only when bill state and policy allow it.
- Opening an item is not final share calculation. It creates a claimable review state.
- Group membership, friend status, route possession, generated client availability, or cached UI state is not enough authority.

Who may claim:

- A registered participant may claim their own eligible quantity where the API proves bill visibility, participant eligibility, block/unfriend/group status, bill state, item state, and policy.
- A temporary participant placeholder may be represented in claim facts only through the temporary participant policy. The placeholder is not an auth principal.
- A later linked account does not retroactively become historical claim authority unless a reviewed claim/link policy grants forward-looking eligibility.

Who may reduce, cancel, or revise:

- A claimant may reduce or cancel their own pending claim while bill state and claim state allow it.
- Creator/owner review may adjust or reject claims only through a server-authoritative review action with audit, affected-user handling, and deterministic conflict resolution.
- Once bill truth is accepted, settled, exported, locked, or revision-snapshotted, claim changes must go through bill revision, settlement-impact, lock/refund, or historical correction policy instead of in-place mutation.

Readiness effects:

- `unassigned`, `open_to_claim`, `partially_claimed`, `overclaimed_conflict`, and `needs_creator_review` block bill submission, authoritative finalization, settlement request generation, settlement basket inclusion, payment generation, export as accepted financial truth, and report truth that depends on final participant shares.
- Draft previews may show provisional totals with clear non-authoritative status.
- Pending/open/partial states must not mutate active settlement requests, request lines, payment claims, allocations, residuals, proof records, balance projections, accepted reports, or reconciliation truth.
- Sync/offline claims remain queued intent until API acceptance. Stale claim basis must become `conflict` with pending local data preserved.

## Creator Or Owner Review

Creator/owner review is required before authoritative finalization when:

- claim quantities conflict, duplicate, exceed, or leave unresolved item quantity;
- a claim changes item tax, discount, refund, service fee, or fee residual allocation;
- a claim affects rounding residual recipients;
- a temporary participant placeholder, direct-shared participant, blocked/unfriended actor, removed group member, or stale offline claimant is involved;
- OCR/manual defaults left quantity unknown before review;
- the current snapshot lacks enough detail to prove a narrow affected participant set.

Conflict resolution must be deterministic. Future runtime policy should define a bounded resolution action such as accept selected claims, reduce a claim, reject a claim, assign remainder, reopen item to claim, or convert to another split method. The API/domain layer computes the resulting state, calculation hash, affected users, payer reconfirmation requirements, and audit event. Review UI only presents and submits intent.

## Authorization And Participants

Quantity claims may exist in personal, group, or direct-shared bill contexts, but eligibility is always API/domain-authoritative.

Rules:

- Direct bill sharing requires accepted friendship at write time or an approved group/shared context at write time, plus bill-specific authorization.
- Friend status alone does not create money authority, bill visibility, payment-detail access, file access, or claim authority.
- Group membership alone is not enough when bill participation, item eligibility, block/unfriend state, payment relationship, temporary participant policy, file-subject policy, or settlement state narrows access.
- Temporary participants preserve historical placeholder identity. Claim/link must not rewrite old bill participants, payers, split rows, settlement rows, approval history, or audit as if a registered account had always existed.
- API/domain authorization must decide who can view, claim, revise, approve, finalize, settle, export, report, or inspect audit for quantity-claim data.
- Denied/missing/unrelated/archived/blocked cases should fail closed without leaking unrelated bill, participant, claim, placeholder, file, payment, settlement, or group existence.

## Revision, Lock, Settlement, And Audit Interactions

Quantity claim changes are financially impactful when they can change participant shares, payer contribution, tax/fee/discount/refund allocation, residual assignment, settlement candidates, report totals, calculation hash, or accepted review basis.

Bill revision rules:

- Draft-only claim changes may stay mutable if no participant approval or downstream state depends on them.
- Submitted, confirmed, rejected, disputed, non-draft OCR-derived, or shared-bill claim changes must route through formal bill revision policy where required.
- Affected participants include previous claimants, new claimants, unresolved-quantity participants where policy assigned them, and anyone whose tax/fee/discount/refund/residual allocation or calculation hash changes.
- Payer reconfirmation is required when payer role, payer amount, payer contribution allocation, payer's own share, or payer-side residual/net position changes.

Settlement rules:

- Unresolved claim states block settlement/payment generation.
- Pending claim revisions are not settlement truth.
- Existing requested, partially paid, marked paid, confirmed, disputed, cancelled-with-history, allocation, residual, proof, balance-impact, finalized, locked, or equivalent progressed state blocks claim-affecting apply until a reviewed settlement invalidation, adjustment, reopen, refund, waiver, credit, or lock governance policy exists.

Historical rules:

- Accepted claim facts should become `locked_historical_reference` when needed for settlement, export, report, revision snapshot, audit, or lock governance.
- Historical calculations must not change because a participant later links an account, a group membership changes, a friend relationship changes, tax policy changes, FX policy changes, or a UI preview changes.

Audit rules:

- Audit claim open, claim create, claim reduce, claim cancel, claim conflict, creator review, conflict resolution, readiness calculation, final calculation, stale/offline rejection, settlement block, and denied authorization where policy requires it.
- Safe audit metadata may include actor ID, bill ID, item ID, claim ID, participant/placeholder ID where authorized, bounded state transition category, quantity counts, amount/currency where policy permits, residual category, policy version, calculation hash category, request/correlation ID, and safe problem category.
- Audit/logs/reports/problem details must not include raw OCR text, receipt bytes, QR/payment proof files, file bytes, thumbnails, storage paths, object keys, provider URLs, signed URLs, vault internals, secrets, tokens, credentials, session values, raw request/response bodies, unbounded notes, unrelated personal data, unrelated financial data, or local Codex/auth state.

## Future OpenAPI, Schema, And Client Planning Boundaries

This task intentionally does not edit `packages/contracts/openapi/settleora.v1.yaml` and does not regenerate clients.

Conceptual future slices may include:

- quantity claim domain model and calculation policy;
- bill item quantity review model;
- claim state read model;
- claim command model for open, claim, reduce, cancel, and creator review;
- claim conflict/problem category model;
- claim readiness and calculation-basis read model;
- claim audit event categories;
- claim sync acceptance and stale-basis problem categories;
- revision snapshot detail for quantity claims.

These are conceptual model slices only. They are not approved schema names, route names, OpenAPI schemas, enums, generated client classes, database tables, EF models, or migration names. Future contract work must use OpenAPI as the source of truth, regenerate clients through the repo command, and keep generated clients non-hand-edited.

## UI And Figma Gate Posture

#350 remains Figma/reference-gated for claim, review, conflict, unresolved, and creator-resolution UX. This packet does not add UI implementation, screenshots, assets, design tokens, Figma links, or design-complete claims.

Future UI must render server-provided state and viewer actions. It must not hide required review states in Basic mode, claim financial truth from local previews, or mark UI/reference work complete without the separate Figma/manual gate.

## Future Validation And Test Plan

Docs/control validation for this branch is limited to markdown/scaffold/OpenAPI-awareness checks requested by the task. Runtime/API/OpenAPI/schema/UI tests remain future work.

Future implementation branches should add focused tests for:

- unassigned item blocks final calculation;
- open-to-claim item remains non-authoritative until accepted claims resolve it;
- exact full quantity claims, including `3 udon` with `1` and `2` claimed;
- partial claims and unresolved remainder blocking;
- over-claims and duplicate conflicting claims;
- claim cancellation and reduction;
- creator adjustment and deterministic conflict resolution;
- tax, discount, refund, service-fee, and residual propagation by claimed quantity;
- bill revision from claimed state with affected-user reset and payer reconfirmation where needed;
- settlement/payment generation blocked by unresolved or conflicted claim states;
- temporary participant placeholder claim/link boundaries and historical preservation;
- sync/offline stale claim rejection with pending data preservation;
- authorization denial for unrelated, removed, blocked, archived, missing, or not-visible actors;
- audit redaction and no raw OCR/file/payment/storage/secret leakage.

Future validation command selection must follow the changed surface:

- runtime/API/domain: focused API tests plus `npm run validate:api-local`;
- OpenAPI/generated clients: `npm run validate:openapi`, `npm run generate:clients`, and client validation through the reviewed workflow;
- schema/migration: migration validation plus API validation;
- mobile/web/admin UI: relevant UI validation and Figma/reference gate;
- sync/offline: sync acceptance and mobile/local queue validation;
- docs/control only: docs/scaffold/OpenAPI-awareness validation as scoped by the task.

## Stop Conditions

Stop future work if a branch attempts to:

- make clients authoritative for final claims, shares, residuals, settlement readiness, authorization, or audit;
- calculate authoritative money without currency or with floating-point types;
- silently assign unresolved remainder quantities;
- silently resolve overclaims or stale offline claims;
- settle or generate payment from unresolved/open/partial/conflict states;
- mutate settled, finalized, locked, exported, or historical claim truth in place;
- expose payment details, file bytes, OCR text, storage internals, secrets, or unrelated data through claim flows;
- mix runtime/API/OpenAPI/generated-client/schema/auth/storage/OCR/UI/Figma/Docker/CI/deploy changes into a docs/control branch.

## Issue Linkage And Closure Posture

#350 remains open after this packet. #349 remains open while #350, #352, and any other money/split/rounding gates remain unresolved. This document prepares a reviewable architecture/control basis only; future runtime/API/OpenAPI/schema/UI/Figma/test work must be separately scoped and gated.
