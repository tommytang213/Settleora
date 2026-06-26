# Direct Bill Sharing Authorization Model

## Purpose

This document is the docs/control architecture packet for direct bill sharing authorization.

It is for issue #432 under parent #400 / `D1-CAND-019` / `groups-2`. It builds on [Friends and direct sharing API policy](FRIENDS_DIRECT_SHARING_API_POLICY.md) and narrows the sharing decision to the server-side write-time authorization model for adding or sharing a bill with another user outside the already implemented group bill foundation.

This is planning only. It does not authorize runtime API endpoints, handlers, domain services, policies, middleware, repositories, tests, database schema, EF models, migrations, OpenAPI edits, generated-client edits, mobile/web/admin UI, Figma/reference work, auth/session/security runtime changes, storage/file-byte behavior, money/settlement/payment/bill calculation changes, Docker/CI/deployment/env changes, or secrets.

## Related Documents

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [Friends and direct sharing API policy](FRIENDS_DIRECT_SHARING_API_POLICY.md)
- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md)
- [Group membership and participation architecture](GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Payment details visibility architecture](PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)

## Current State

The repository currently has auth/session/current-actor foundations, self profile and payment-details foundations, group create/list/read/update and registered-user group member management, personal and group bill create/read foundations, bill workflow endpoints, bill attachments, settlement foundations, settlement-scoped payment-detail and QR reads, file metadata/lifecycle foundations, and bounded audit foundations.

The repository does not currently implement friends, friend requests, direct friend sharing authorization, standalone direct bill sharing between friends, friend-specific OpenAPI contracts, generated friend clients, temporary participant claim/link runtime, or friends/direct sharing UI.

## Authority Boundary

Direct bill sharing is server-authoritative in server mode.

- The API derives the actor from the authenticated session/current-actor boundary.
- API/domain services own direct-share eligibility, bill ownership and participation checks, group/shared-context checks, relationship state checks, block/unfriend enforcement, bill status constraints, money impact constraints, file/payment-detail visibility constraints, idempotency, problem responses, and audit.
- Clients may render suggested recipients, cache relationship readouts, hide or show controls, and queue user intent, but clients must not decide authorization.
- Generated client availability never implies permission.
- Offline queued direct-share mutations must be revalidated at sync acceptance time against current server state, not the client state captured when the operation was queued.

## Allowed Direct Bill Sharing

Direct bill sharing is allowed only when the server can prove at write time one of these eligibility paths:

```text
accepted_friend_relationship
approved_group_or_shared_context
```

### Accepted Friend Relationship Path

The accepted-friend path is eligible only when:

- the actor is authenticated and resolves to an active app-domain profile;
- the target is an active, reachable user profile that policy allows the actor to share with;
- the relationship between actor and target is currently `accepted`;
- no block, unfriend, disablement, deletion, archived-reference, historical-only, or stale relationship state prevents the share;
- the actor is allowed to create or modify the source bill;
- the bill state allows adding or sharing with a new participant;
- the operation does not bypass participant acknowledgement, payer confirmation, settlement safety, or money-impact review policy;
- any linked files remain subject to bill/file-purpose authorization and are not exposed from friend status alone.

An accepted friend relationship is an eligibility input, not the whole decision.

### Group Or Shared-Context Path

The group/shared-context path is eligible only when:

- the actor is authenticated and resolves to an active app-domain profile;
- the group or shared context exists, is active enough for the operation, and is visible to the actor;
- server-side membership, participation, role, or context policy authorizes both the actor action and the target inclusion;
- the target is an active profile, current authorized group/context participant, or permitted temporary participant according to that context's reviewed policy;
- removed, left, default-excluded, historical-only, archived-reference, blocked, disabled, deleted, or deactivated states are handled according to policy and do not silently grant future bill access;
- bill status, participant, payer, money, settlement, and file rules allow the share.

Group membership alone is not enough where bill-level participation, context participation, payment relationship, file-subject policy, or settlement policy is narrower.

## Denied Direct Bill Sharing

Direct bill sharing must be denied when the only basis is one of these states or signals:

```text
unrelated_users
pending_friend_request
declined_friend_request
cancelled_friend_request
blocked_relationship
unfriended_relationship
historical_only_relationship
archived_reference
deleted_or_deactivated_relationship
deleted_or_deactivated_user
stale_cached_friend_row
hidden_ui_control_state
route_or_deep_link_state
generated_client_method_availability
possession_of_user_profile_id
previous_bill_participation_alone
payment_detail_visibility_alone
group_membership_without_context_authority
```

Denial rules:

- Pending, declined, cancelled, blocked, unfriended, historical-only, archived-reference, deleted, and deactivated relationships are not accepted friendships.
- A stale client cache must be rejected if the server relationship changed before write acceptance.
- Hidden UI controls, disabled buttons, route availability, deep links, or generated clients do not authorize sharing.
- Payment-detail visibility, payment profile existence, QR file existence, or settlement proof existence never authorize direct bill sharing.
- Friend status alone must not expose payment details, QR files, settlement proof files, receipt files, supporting attachments, file metadata, provider object keys, signed URLs, or storage paths.
- Historical records may remain visible to authorized participants without granting future sharing rights.

## Server-Side Eligibility Checks

Future runtime should evaluate a direct-share write through a fail-closed policy boundary. The exact implementation can differ, but the decision must cover these checks.

| Check | Required policy question |
|---|---|
| Actor identity/session | Is there a valid, non-revoked authenticated session that resolves to one active app-domain profile? |
| Source bill authority | Can the actor create the bill or mutate/share the existing bill under its current owner, participant, group, and status policy? |
| Target visibility | Is the target safe to reference for this operation without leaking unrelated account existence? |
| Target account/profile state | Is the target active, reachable, and not deleted, disabled, deactivated, or archived-only? |
| Friend eligibility | Is there an accepted friend relationship at write time, and is it not blocked, unfriended, stale, historical-only, or archived-reference? |
| Group/shared-context eligibility | Does a server-authorized group or shared context independently permit this actor, target, and bill operation? |
| Block/unfriend state | Does any current block/unfriend/disablement state require denial or privacy-safe non-disclosure? |
| Bill status/state | Is the bill `draft` or otherwise policy-eligible for adding/sharing participants, and are confirmed/finalized/archived/settled states protected? |
| Money/settlement impact | Does the change require participant acknowledgement, payer reconfirmation, revision flow, settlement blocking, reopen/adjustment policy, or denial? |
| File/attachment visibility | Are receipt/supporting attachments still limited to bill-authorized viewers and stable file IDs only? |
| Payment-detail visibility | Is payment detail access denied unless a separate concrete settlement/payment relationship authorizes it? |
| Sync/idempotency | Is the operation fresh, idempotent for retries, and rejected on stale relationship or resource-version assumptions? |
| Audit/redaction | Can success or denial be recorded with bounded metadata and without sensitive content? |

The policy should prefer one centralized direct-sharing authorization service or business authorization boundary so handlers, clients, workers, and generated code do not duplicate sensitive rules.

## Bill Status And Money Constraints

Direct sharing can change financial truth. Future runtime must not treat adding a friend as a harmless profile operation.

Required constraints:

- Adding a participant to a draft bill may be allowed if money, split, payer, attachment, and participant policy pass.
- Adding or changing participants on a pending, confirmed, finalized, archived, rejected, cancelled, partially settled, or settled bill must follow the bill lifecycle and revision policy for that state.
- Money-impacting changes require server-authoritative recalculation and affected-user review where applicable.
- Paid-by changes, payer contribution changes, or participant share changes require payer confirmation or affected-user reapproval according to the bill revision policy.
- Pending bill revisions and accepted/applied revisions must not silently mutate settlement balances or selected outstanding lines.
- Historical bills remain stable after unfriend/block unless a separate authorized bill/revision operation changes them.

## Payment Details And File Boundary

Direct bill sharing does not create a payment-detail or file directory.

Friendship or shared-context eligibility may allow a bill-sharing write, but it must not by itself allow:

- payment handle reads;
- payment note reads;
- payment QR metadata reads;
- payment QR content reads;
- settlement proof metadata or content reads;
- receipt image or supporting attachment content reads outside bill authorization;
- storage metadata reads beyond safe subject-specific file summaries;
- storage provider paths, object keys, buckets, local paths, provider URLs, signed URLs, thumbnails, previews, vault internals, or file bytes.

Payment details remain governed by concrete settlement/payment context. Bill receipt and supporting attachments remain governed by bill/group/bill-participant context. Settlement proof remains governed by settlement/payment context.

## Conceptual Future API Boundary

This document does not edit `packages/contracts/openapi/settleora.v1.yaml` and does not generate clients.

Future OpenAPI work must be separately scoped, manually gated, reviewed, and followed by client generation from the canonical contract. Planning-only operation groups:

```text
DirectShareEligibilityRead
DirectBillShareCreate
DirectBillParticipantAdd
DirectSharePolicyProblem
DirectShareAuditCorrelation
GroupSharedContextEligibility
```

Potential planning route concepts:

```text
GET /api/v1/direct-sharing/eligibility/{targetUserProfileId}
POST /api/v1/bills/{billId}/direct-shares
POST /api/v1/bills/direct-shares
POST /api/v1/groups/{groupId}/bills/{billId}/shares
```

These are not approved routes. They are names for future contract discussion only.

Future request models should carry:

- target user/profile reference or context participant reference;
- source bill reference or create-bill payload reference;
- explicit sharing intent;
- idempotency key for write operations;
- optional client-observed relationship/context version for stale-state detection;
- correlation ID where supported.

Future response/read models should carry:

- safe eligibility outcome;
- allowed eligibility path category, such as `accepted_friend` or `group_context`, only where safe to reveal;
- required next action category, such as `needs_friend_approval`, `needs_group_membership`, `needs_bill_revision`, or `not_available`;
- safe problem code;
- correlation ID;
- no payment details, file bytes, storage internals, unrelated bill lists, settlement state, or contact graph.

## Problem Categories

Future API work should use bounded problem categories, such as:

```text
direct_share_not_allowed
relationship_not_accepted
relationship_pending
relationship_declined
relationship_cancelled
blocked_or_not_available
unfriended_or_not_available
historical_relationship_not_eligible
archived_reference_not_eligible
stale_relationship_state
target_not_available
source_bill_not_authorized
source_bill_state_not_shareable
group_context_not_authorized
group_membership_not_active
context_participation_required
money_impact_requires_revision
payer_reconfirmation_required
settlement_state_blocks_share
payment_context_required
file_context_required
idempotency_body_mismatch
policy_block
```

Problem responses should include safe machine-readable codes, user-display-safe titles, correlation IDs where available, and no unrelated user/profile/payment/file/storage/audit details.

## Idempotency And Stale State

Direct-share writes should be idempotent where practical and fail closed on stale authorization assumptions.

- Repeating the same request with the same idempotency key should return the prior safe result or safe replay response.
- Reusing an idempotency key with a different target, bill, participant set, amount, split basis, file set, or relationship assumption must be rejected.
- Client-observed friend or group/context versions are hints only.
- If the server relationship changed from `accepted` to blocked, unfriended, deleted, disabled, or historical-only before acceptance, the write must be denied or conflicted.
- Offline queued direct-share operations must be revalidated during sync acceptance and rejected if the relationship/context is no longer sufficient.

## Audit Expectations

Future runtime should emit bounded audit or security-policy records for success and denial where policy requires it.

Recommended event categories:

```text
direct_share.authorized
direct_share.denied
direct_share.denied_blocked
direct_share.denied_unfriended
direct_share.group_context_authorized
direct_share.stale_authorization_rejected
direct_share.policy_changed
```

Safe metadata categories:

- actor profile/account ID where safe;
- target profile ID only where policy and audit retention allow it;
- source bill ID or safe bill subject category;
- group/shared-context ID where applicable;
- eligibility path category;
- relationship/context version category;
- bill state category;
- money-impact category;
- outcome/problem category;
- idempotency key hash or bounded idempotency reference;
- correlation/request ID;
- timestamp;
- policy name/version.

Audit and logs must not include:

- raw secrets, tokens, credentials, passwords, password hashes, reset tokens, MFA secrets, passkey private material, recovery codes, provider tokens, or SSH material;
- raw request bodies or response bodies;
- payment handles, payment notes, payment instructions, QR file bytes, or QR payloads;
- settlement proof bytes, receipt bytes, supporting attachment bytes, thumbnails, previews, or file contents;
- storage paths, object keys, buckets, provider URLs, signed URLs, local paths, or vault internals;
- raw OCR text;
- unbounded notes, comments, messages, private profile fields, contact graphs, unrelated group lists, unrelated bill lists, or unrelated settlement details.

Denied-share audit must be redacted enough that ordinary logs and support views do not become an account-existence, relationship, payment-detail, or file-existence oracle.

## Validation Expectations For Future Work

Docs/control tasks should run docs/scaffold/OpenAPI validation appropriate to their changed files.

Future runtime/API/OpenAPI/generated-client work must add tests proving:

- unrelated users are denied;
- pending, declined, cancelled, historical-only, archived-reference, deleted, deactivated, and otherwise non-accepted friend states are denied;
- block and unfriend deny new direct sharing;
- group/shared context allows sharing only when server-side membership/participation authority allows it;
- group membership alone does not bypass context, bill, participant, payment, or file policy;
- stale cached friend rows or stale queued operations are rejected at write/sync acceptance time;
- historical bills remain preserved without granting future access;
- payment details, QR/payment files, settlement proof, receipt files, supporting attachments, storage metadata, provider object keys, and signed URLs are not exposed from friend status alone;
- clients never decide authorization from local cache, hidden controls, route state, deep links, or generated client availability;
- generated-client method availability is not treated as permission;
- safe denial/problem categories avoid leaking unrelated user, relationship, payment-detail, file, bill, settlement, or group state;
- success, denial, blocked/unfriended denial, group-context authorization, stale authorization rejection, and policy-relevant events are audited with redaction.

Future OpenAPI/generated-client work must also prove generated client diffs come only from the reviewed contract generation flow and do not hand-edit generated output.

## Non-goals

This document does not authorize:

- Runtime API endpoints, handlers, services, policies, middleware, repositories, or tests.
- Direct-sharing runtime implementation.
- OpenAPI contract edits.
- Generated-client edits or generation.
- Database schema, EF model, DbContext, migration, or model snapshot changes.
- Mobile, web, admin, Figma, or reference work.
- Broad user search, browse-all-users directory, fuzzy global search, or contact graph.
- Payment-detail, QR/payment file, settlement proof, receipt, attachment, storage metadata, storage path, provider object key, signed URL, or file-byte exposure from friend status alone.
- Client-derived authorization from cache, route state, hidden controls, generated client availability, or UI state.
- Parent #400 closure or sibling #433, #434, or #435 closure.
- Docker, CI, deployment, environment, release, secret, `.env`, SSH, or local Codex state changes.
