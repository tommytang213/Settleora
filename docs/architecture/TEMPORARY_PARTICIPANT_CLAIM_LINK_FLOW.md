# Temporary Participant Claim And Link Flow

## Purpose

This document is the docs/control architecture packet for temporary participant claim/link behavior for direct/shared bills.

It is for issue #433 under parent #400 / `D1-CAND-019` / `groups-2`. It builds on [Friends and direct sharing API policy](FRIENDS_DIRECT_SHARING_API_POLICY.md) and [Direct bill sharing authorization model](DIRECT_BILL_SHARING_AUTHORIZATION_MODEL.md) by defining how a bill participant placeholder may later be claimed or linked to a real account without rewriting historical participation or broadening authorization.

This is planning only. It does not authorize runtime API endpoints, handlers, domain services, policies, middleware, repositories, tests, database schema, EF models, migrations, OpenAPI edits, generated-client edits, mobile/web/admin UI, Figma/reference work, auth/session/security runtime changes, storage/file-byte behavior, money/settlement/payment/bill calculation changes, Docker/CI/deployment/env changes, or secrets.

## Related Documents

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [Friends and direct sharing API policy](FRIENDS_DIRECT_SHARING_API_POLICY.md)
- [Direct bill sharing authorization model](DIRECT_BILL_SHARING_AUTHORIZATION_MODEL.md)
- [Group membership and participation architecture](GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Payment details visibility architecture](PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)

## Current State

The repository currently has auth/session/current-actor foundations, self profile and payment-details foundations, registered-user group membership foundations, personal and group bill foundations, bill attachments, receipt OCR review intake and draft-only apply, settlement foundations, settlement-scoped payment-detail and QR reads, settlement proof flows, file metadata/lifecycle foundations, and bounded audit foundations.

The repository does not currently implement friend runtime, direct friend sharing runtime, temporary participant claim/link runtime, guest governance runtime, claim invitation tokens, claim OpenAPI contracts, generated claim clients, or claim UI/reference screens.

## Authority Boundary

Temporary participants are narrower than Day 2 guest governance.

- A temporary participant is a placeholder for bill participation, not an account identity and not an authorization principal.
- A temporary participant can represent a real person in a bill, split, payer, or historical participation record before that person has a registered account or approved sharing relationship.
- A temporary participant does not bypass bill authorization, money rules, settlement rules, file access policy, storage policy, group membership policy, friend policy, sync acceptance, or audit.
- Claim/link is server-authoritative in server mode. API/domain services decide whether a claim can start, whether proof is sufficient, whether an approver can approve, whether a link can be established, and what the linked account may see afterward.
- Clients may render claim state, invitation prompts, and review intent, but clients must not decide authorization, historical identity, money impact, payment-detail exposure, file access, or audit truth.
- Generated client availability, routes, cached claim state, possession of a claim token, or visibility of a placeholder in UI never implies permission.

Temporary participant claim/link is a provenance-preserving association. It is not a silent identity merge, not a friend request, not a group membership grant, and not a payment-detail or file-access grant.

## Placeholder Identity Model

Temporary participant records should preserve a bounded original participant snapshot.

Placeholder metadata may include only limited fields needed for bill comprehension and later claim review:

```text
placeholder_display_name
placeholder_contact_hint_type
placeholder_contact_hint_redacted
created_by_actor_id
source_bill_id or source_context_id
created_at
original_participant_snapshot
provenance_category
```

Contact hints are metadata, not credentials. They must not become login identifiers, account identifiers, or authorization principals by themselves. Raw email addresses, phone numbers, invite tokens, recovery codes, secret links, private notes, OCR raw text, file paths, object keys, signed URLs, payment handles, QR contents, settlement proof contents, and unrelated sensitive data should not be copied into ordinary placeholder readouts or audit records.

Historical bill participant rows remain historically accurate after claim/link:

- The original placeholder identity remains traceable.
- The original participant snapshot is not overwritten with the linked account's profile.
- Existing bill participant, payer, split, settlement, revision, approval, and audit facts are not rewritten as if the linked account had always existed.
- Claim/link may add a forward-looking association from the placeholder to an account/profile after server validation.
- Read models may show "later linked to account" provenance only to authorized viewers and only with bounded safe account/profile summary fields.

No implementation should silently coalesce two placeholders, two accounts, a placeholder and an account, or historical bill rows merely because a contact hint or display name appears similar.

## Claim And Link Lifecycle

Future implementation may expose stable planning states such as:

```text
unclaimed
claim_pending
claimed
linked
claim_rejected
claim_expired
claim_cancelled
claim_conflict
archived_reference
```

These are planning names, not canonical OpenAPI enum values. A future contract task must define canonical fields and enum names if API work is scoped.

State meaning:

| State | Meaning |
|---|---|
| `unclaimed` | Placeholder exists only as a bill/group/context participation reference. No active claim is pending. |
| `claim_pending` | A bounded claim review is active, but the claimant has no account-owned access from the placeholder. |
| `claimed` | The claim proof was accepted for the placeholder, but account access/link policy has not granted any broader read/write rights by itself. |
| `linked` | The placeholder has a validated association to a registered profile/account for future eligible operations and authorized provenance readout. |
| `claim_rejected` | A claim attempt was denied and must not reveal unrelated bill details or sensitive placeholder data to the denied actor. |
| `claim_expired` | The invitation or claim window expired without creating a link. Historical placeholder facts remain. |
| `claim_cancelled` | An authorized initiator or approver cancelled the pending claim. Historical placeholder facts remain. |
| `claim_conflict` | Multiple plausible claims, duplicate placeholders, or mismatched proof require explicit resolution without deleting pending data. |
| `archived_reference` | Retention-only state used for audit/accounting/history without ordinary claim activity. |

Suggested actor rules:

- A bill creator, bill owner/editor, group/context manager, or future reviewed role may initiate a claim invitation only when they are authorized for the bill/context and policy allows temporary participants.
- A registered active user may initiate a self-claim only through a bounded proof/review flow and only when policy permits that claim path.
- The placeholder creator alone is not enough authority if the current bill/group/context state, block state, or money/settlement policy no longer permits the action.
- Approval may require the bill owner/editor, group/context manager, original inviter, affected participants, or a server policy decision depending on the claim path. Future implementation must choose this explicitly before runtime work.
- A pending claimant may withdraw their own claim.
- An authorized inviter/approver may cancel a pending invitation or claim before link.
- Admin/owner role must not imply broad private placeholder linking or claim approval by default without a future audited support/moderation design.

Claim tokens or invitations:

- Claim tokens must be high-entropy, short-lived where practical, single-purpose, revocable, and stored only as non-reversible verifiers if persistence is needed.
- Raw invitation tokens must never appear in audit logs, ordinary application logs, analytics, API responses after creation, screenshots, support exports, or reports.
- A claim token should identify only the claim flow after server validation; it must not grant bill access, file access, payment-detail access, settlement access, group access, or friend status.
- Reuse after expiry, revocation, cancellation, or successful link must fail closed with a privacy-safe problem category.
- Claim actions should carry idempotency and correlation identifiers so retries do not create duplicate active claims or duplicate links.

Outcome categories future APIs may need:

```text
claim_started
claim_approved
claim_rejected
claim_cancelled
claim_expired
claim_conflict
duplicate_claim
already_linked
token_expired
token_revoked
token_already_used
mismatched_contact
blocked_or_not_available
unauthorized
not_found_or_not_available
policy_block
idempotent_replay
```

These are planning categories only. OpenAPI remains the source of truth when a future contract task explicitly scopes it.

## Denied And Conflict Outcomes

Denied and conflict cases must preserve privacy and pending data:

- Duplicate claim: return or record a safe conflict/idempotent outcome without creating multiple active claim rows for the same placeholder/account path.
- Expired claim: keep the placeholder historical row and deny link creation.
- Revoked or cancelled claim: deny link creation and avoid revealing whether the placeholder maps to unrelated bills.
- Already-linked placeholder: return a safe already-linked or conflict outcome to authorized actors; deny unsafe actors without exposing the linked account.
- Mismatched contact: deny or require manual review without disclosing raw placeholder contact hints or claimant account identifiers to unrelated parties.
- Blocked relationship: fail closed where block policy prevents future sharing/request/claim activity, while preserving old financial facts.
- Unauthorized actor: deny with enumeration-resistant categories and correlation ID.
- Conflicting placeholders: preserve all candidate placeholder/proof rows until an authorized resolution path chooses an outcome.
- Deactivated, deleted, archived, disabled, or unavailable account: fail closed without exposing account state beyond safe policy categories.

## Permissions Before, During, And After Claim

Before claim:

- The placeholder has no account-owned access.
- The placeholder is not an authorization principal.
- No authenticated user gets bill access merely because their profile resembles placeholder metadata.
- No payment details, QR files, settlement proofs, receipt files, supporting attachments, storage metadata, vault metadata, OCR raw text, or file bytes are exposed through the placeholder.
- The placeholder cannot approve bills, confirm payer facts, submit revisions, settle debts, claim payments, accept settlements, manage files, manage group membership, or change financial truth.

During claim:

- The claimant may access only the bounded proof/review flow needed to complete the claim.
- The flow should avoid exposing unrelated bill details. Any preview should be minimal, purpose-specific, and privacy-safe, such as a redacted inviter name, redacted placeholder label, high-level context category, and expiry state where policy allows.
- Possession of an invitation link is not proof of account identity, friendship, group membership, payment relationship, or settlement eligibility.
- Claim review must not expose payment handles, payment notes, QR file metadata or bytes, settlement proof metadata or bytes, receipt/supporting attachment metadata or bytes, storage paths/object keys/signed URLs/provider internals, vault metadata, unrelated participants, unrelated comments, or unrelated bill line details.

After claim/link:

- The linked account may get access only through server-side policy and the bill/group/direct-sharing eligibility that applies at read/write time.
- Link alone must not expose payment details, QR files, settlement proofs, receipt/supporting attachments, storage internals, vault metadata, raw OCR text, unrelated bills, unrelated settlements, unrelated group records, unrelated comments, or admin/debug data.
- Friend status alone remains insufficient for payment-detail or file exposure.
- Approved friendship or approved shared/group context may become a future eligibility input, but it must still be evaluated with bill participation, block/unfriend, file-purpose, storage, settlement, privacy, sync, and money policies.
- Unlink or cancellation after link, if future policy allows it, must preserve historical facts and audit. It must not erase the fact that a link existed where retention policy requires it.

## Money, Settlement, And Bill History

Claim/link cannot change financial truth by itself.

It must not mutate:

- bill amounts, currencies, tax/fee/discount components, item lines, shares, payer contributions, balances, residuals, rounding, or calculation hashes;
- bill participant acceptance, acknowledgement, paid-by confirmation, revision approval, bill status, settlement request status, payment status, proof status, or reconciliation status;
- settlement request lines, payment allocations, residuals, balance projection sources, proof attachments, or audit history;
- revision baselines, approvals, rejections, withdrawals, applied revisions, or affected-user states.

Money-impacting changes after a claim must go through the proper bill revision, payer confirmation, participant acknowledgement, settlement, residual, dispute, or reconciliation policy path. A linked account may participate in those workflows only if server authorization says the account is eligible at that time.

Historical participant identity remains traceable for fairness and accounting. Reports, settlement views, exports, and audit readouts should be able to distinguish:

```text
original placeholder participant
claim/link event
linked account/profile as of link time
current authorized viewer permissions
```

## Group And Direct-Sharing Interaction

Direct/shared bill claim behavior must align with [Friends and direct sharing API policy](FRIENDS_DIRECT_SHARING_API_POLICY.md) and [Direct bill sharing authorization model](DIRECT_BILL_SHARING_AUTHORIZATION_MODEL.md).

- Direct bill sharing requires accepted friendship at write time or approved group/shared context at write time.
- A claimed/linked temporary participant does not retroactively make old direct sharing authorized between accounts.
- A linked account may be eligible for future direct sharing only if accepted friendship or approved group/shared context exists and all server-side checks pass.
- A group or context may permit temporary participants only under reviewed group/context policy. That permission does not create Day 2 guest governance, voting, broad member management, or group-wide account access.
- Block/unfriend must stop future sharing, request, and claim flows where applicable without deleting historical bill, settlement, file-reference, or audit facts.
- Clients cannot infer authority from cached friend state, cached claim state, route visibility, generated client availability, hidden controls, previous bill participation, or possession of a profile ID.

## Future API And OpenAPI Boundaries

This task intentionally does not edit OpenAPI.

Future contract surfaces may need planning shapes for:

```text
create temporary participant placeholder
read placeholder summary in bill/context scope
create claim invitation
start claim from token or bounded context
review pending claim
approve claim
reject claim
cancel claim
expire/revoke claim
link placeholder to account/profile
read placeholder provenance
unlink or archive reference where policy permits
```

Expected future contract concepts may include:

```text
placeholder_id
claim_id
claim_state
claim_outcome_category
target_bill_id
target_group_id
target_context_id
claimant_profile_id
approver_profile_id
idempotency_key
resource_version
correlation_id
expires_at
created_at
decided_at
```

These names are conceptual planning vocabulary only. They are not canonical request/response fields, schemas, route names, or enum values. When a future contract task explicitly scopes OpenAPI, `packages/contracts/openapi/settleora.v1.yaml` remains the source of truth and generated clients must be produced through the repo generation command.

## Audit, Privacy, And Redaction

Future implementation should emit bounded audit events for:

```text
temporary_participant.invitation_created
temporary_participant.invitation_revoked
temporary_participant.claim_started
temporary_participant.claim_approved
temporary_participant.claim_rejected
temporary_participant.claim_cancelled
temporary_participant.claim_expired
temporary_participant.claim_conflict
temporary_participant.linked
temporary_participant.unlinked
temporary_participant.denied
```

Audit metadata may include bounded identifiers and categories:

```text
actor_id
placeholder_id
claim_id
target_bill_id
target_group_id
target_context_id
claimant_profile_id when authorized and necessary
approver_profile_id when authorized and necessary
outcome_category
state_transition_category
correlation_id
idempotency_key hash or reference
timestamp
```

Audit records, logs, reports, and analytics must avoid:

- raw invitation tokens, token hashes where not needed, recovery codes, passwords, session tokens, provider tokens, MFA secrets, passkey material, or credential payloads;
- raw contact hints unless a future reviewed policy explicitly permits a redacted/hashed form;
- raw OCR text, receipt file bytes, settlement proof bytes, QR/payment image bytes, supporting attachment bytes, or private note contents;
- storage paths, object keys, signed URLs, provider internals, vault internals, encryption keys, or envelope secrets;
- payment-detail contents, payment handles, payment notes, QR contents, or bank details;
- unrelated bill details, unrelated participants, unrelated group memberships, unrelated settlements, unrelated comments, or admin/debug data.

Denial audit should be privacy-safe. It should support abuse/security review without creating a side channel that tells unauthorized actors whether a placeholder, bill, account, group, or block exists.

## Validation Expectations For Future Implementation

Future runtime, contract, schema, or UI work must include tests proving:

- placeholder identities do not become auth principals;
- denied claims preserve privacy and do not leak unrelated bill, account, block, payment, settlement, file, storage, or group existence;
- claim/link preserves original bill participant snapshots and audit provenance;
- duplicate, already-linked, expired, revoked, cancelled, and conflicting claims preserve pending data and fail closed;
- block/unfriend stops future claim/share flows where applicable while historical facts remain;
- link alone does not grant payment-detail, QR, settlement proof, receipt/supporting attachment, storage, vault, OCR raw text, group, friend, or unrelated bill access;
- money, settlement, payer, approval, balance, revision, status, and calculation facts do not change merely because a claim/link succeeded;
- clients render server state and do not decide authorization from cache, UI state, routes, generated-client methods, or tokens.

Validation commands should follow the changed surface:

| Changed surface | Expected validation direction |
|---|---|
| Docs/control only | `npm run doctor:validation`, `npm run validate:docs`, `npm run validate:scaffold`, `npm run validate:openapi` |
| OpenAPI or generated clients | `npm run doctor:validation`, `npm run validate:openapi`, `npm run generate:clients`, `npm run validate:clients` |
| API/domain runtime | `npm run doctor:validation`, focused API tests, `npm run validate:api-local`, plus broader validation if shared policy changes |
| Schema/migrations | migration review gate, migration tests, API validation, and explicit manual migration gate |
| Mobile UI | `npm run doctor:mobile`, Flutter analyze/test commands from `apps/mobile` |
| Web/admin UI | relevant web lint/test/build commands once web surfaces exist |
| Storage/file-byte behavior | storage/privacy manual gate plus focused API/storage tests and file-content authorization coverage |
| Money/settlement/bill authority | money manual gate plus focused calculation, revision, settlement, and audit tests |

#434 remains the UI/Figma/reference gate for discovery, friend request, block/unfriend, direct-share selection, temporary participant claim, and denied-state UX. This document does not satisfy that UI/reference gate and does not authorize UI implementation.

## Non-Goals

- No runtime API, endpoint, domain service, worker, mobile, web, admin, or Figma implementation.
- No OpenAPI contract edits or generated-client edits.
- No schema, EF model, DbContext, migration, or model snapshot changes.
- No storage/file-byte behavior changes.
- No payment-detail, QR file, settlement proof, receipt, or attachment exposure changes.
- No Day 2 guest governance, guest voting, broad guest membership, or accountless user governance.
- No silent identity merge.
- No account-level permissions before claim.
- No money, settlement, payment, bill calculation, payer, balance, revision, approval, or status mutation.
- No Docker, CI, deployment, env, release, secret, auth config, local Codex, SSH, or infrastructure changes.
