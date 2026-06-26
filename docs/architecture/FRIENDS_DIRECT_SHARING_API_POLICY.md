# Friends and Direct Sharing API Policy

## Purpose

This document is the docs/control architecture packet for friend discovery, friend request lifecycle, block/unfriend behavior, direct sharing, payment-detail exposure boundaries, temporary participant linkage, audit, admin posture, and future contract slicing.

It is for issue #431 under parent #400 / `D1-CAND-019` / `groups-2`.

This is planning only. It does not authorize runtime API endpoints, handlers, domain services, database schema, EF models, migrations, OpenAPI changes, generated-client changes, mobile/web/admin UI, Figma/reference files, auth/session/security runtime changes, storage/file-byte behavior, money/settlement/payment/bill calculation changes, Docker/CI/deployment/env changes, or secrets.

## Related Documents

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md)
- [Auth credentials, sessions, and audit design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md)
- [Auth sign-in abuse policy](AUTH_SIGN_IN_ABUSE_POLICY.md)
- [Group membership and participation architecture](GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md)
- [Payment details visibility architecture](PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)

## Current State

The repository currently has auth/session/current-actor foundations, self profile and payment-details foundations, group create/list/read/update and registered-user group member management, personal and group bill foundations, settlement payment-detail exposure through settlement-scoped counterparty endpoints, purpose-specific file flows for payment QR, bill attachments, and settlement proof, and bounded audit foundations.

The repository does not currently implement friends, friend requests, friend discovery, block/unfriend runtime, direct friend sharing authorization, temporary participant claim/link runtime, friend-specific OpenAPI contracts, or generated friend clients.

## Authority Boundary

Friend and direct-sharing policy is server-authoritative in server mode.

- The API derives the actor from the authenticated session/current-actor boundary.
- API/domain services own discovery eligibility, friend request state transitions, block/unfriend enforcement, direct-sharing authorization, temporary participant claim/link validation, payment-detail exposure decisions, problem responses, and audit.
- Clients may render friend state, cache readouts, and queue user intent, but clients must not decide authorization, direct-share permission, payment-detail visibility, file access, or audit truth.
- Generated client availability never implies permission.
- Offline queued friend or direct-share mutations must be revalidated at sync acceptance time against current server state, blocks, relationship state, domain policy, and idempotency guards.

## Discovery Policy

Day 1 safe default is exact-match discovery only.

Allowed discovery identifiers are only safe identifiers that existing identity/product policy enables, such as:

```text
email
phone
username
deployment-local invite or account handle
```

Identifier use is policy-controlled. If a deployment has not enabled an identifier type, the discovery API must reject or hide that path rather than improvise a lookup.

Discovery must not provide by default:

- browse-all-users directory
- fuzzy global directory search
- prefix search across all users
- public contact graph
- mutual-friend graph
- friend count lookup
- payment-detail lookup
- storage/file lookup
- user enumeration through response timing or response distinctions

Safe discovery response shape should be minimal:

```text
match_status
safe_profile_summary nullable
relationship_state
request_eligibility
problem_category nullable
correlation_id nullable
```

`safe_profile_summary` should include only bounded fields needed for user confirmation, such as display name, an avatar/file-safe reference only if a future reviewed avatar policy exists, and maybe a normalized user-controlled handle where policy allows it. It must not include payment handles, payment notes, QR file metadata, settlement proof metadata, receipt/storage metadata, auth account IDs, session state, credential state, group list, bill list, settlement state, contact graph, or admin/debug data.

Discovery must use an enumeration-resistant denial posture:

- Use privacy-safe problem categories such as `not_found_or_not_available`, `discovery_disabled`, `identifier_type_disabled`, `rate_limited`, `request_not_allowed`, `blocked_or_not_available`, and `policy_block`.
- Avoid revealing whether a non-matching or blocked identifier belongs to an existing account unless the user is already authorized to know that relationship.
- Apply rate limits, abuse controls, throttling, correlation IDs, and audit/telemetry categories as design requirements before runtime implementation.
- Normalize identifiers server-side where policy allows, but do not log raw identifiers by default.

## Relationship States

Future implementation should model current actor readout with stable planning states:

```text
none
pending_outbound
pending_inbound
accepted
declined
cancelled
blocked
unfriended
historical
archived_reference
```

Implementation may store fewer or more internal rows, but API readouts should keep the actor-facing state explicit and privacy-safe.

State meaning:

| State | Meaning |
|---|---|
| `none` | No active relationship or actionable request is visible to the actor. |
| `pending_outbound` | Actor sent a request awaiting target action. |
| `pending_inbound` | Actor received a request they may accept, decline, or block. |
| `accepted` | Both users approved the relationship and future direct sharing may be eligible subject to policy. |
| `declined` | Recipient declined a request. It is not an accepted relationship. |
| `cancelled` | Sender cancelled a pending request before acceptance. |
| `blocked` | A block policy prevents new requests and future direct sharing; readout must avoid leaking block details to the blocked party beyond safe denial. |
| `unfriended` | A formerly accepted relationship has ended for future direct sharing. |
| `historical` | Historical bills, settlements, files, or audit references still exist even though no future friend sharing is allowed. |
| `archived_reference` | Retention-only reference used for audit, legal/accounting, idempotency, or history without ordinary friend UI activity. |

## Friend Request Lifecycle

Future lifecycle operations:

```text
discover exact match
request friendship
accept request
decline request
cancel outbound request
unfriend accepted relationship
block user or relationship
unblock user or relationship
read relationship state
```

Actor rules:

- Only an authenticated active user profile can initiate, accept, decline, cancel, unfriend, block, or unblock.
- The sender may cancel their own pending outbound request.
- The recipient may accept or decline their own pending inbound request.
- Either party may unfriend an accepted relationship.
- Either party may block the other party where policy allows.
- Only the blocker, or a future audited admin/moderation workflow, may unblock a block.
- System owner/admin role must not imply ordinary broad friend graph mutation or private relationship browsing by default.

Duplicate and idempotency posture:

- Duplicate requests between the same two profiles should not create multiple active pending rows.
- Repeating the same request with the same idempotency key should return the prior safe outcome.
- A request in the reverse direction should resolve deterministically, such as accepting an inbound request or returning a conflict that tells the actor to respond to the inbound request.
- Requests involving blocked relationships must fail closed with a privacy-safe denial.
- Requests involving disabled, deleted, archived, or unavailable accounts must fail closed without exposing unrelated account state.
- Expiry, cooldown, repeated-decline behavior, and abuse thresholds are future policy details, but runtime must not ship without explicit choices.

Server-mode authority boundary:

- Relationship state is evaluated at write time for each direct-sharing operation.
- Cached friend state from a client is only a hint.
- Offline queued direct-share operations must be rejected or conflicted if the friend relationship was cancelled, blocked, unfriended, disabled, or no longer sufficient before sync acceptance.

## Block And Unfriend Semantics

Blocking is stronger than unfriending.

Block must stop future:

- friend requests in either direction according to policy
- acceptance of pending requests between the parties
- direct bill sharing
- direct settlement/payment-detail sharing created only from friend status
- messages, comments, mentions, or notifications between the parties where those product surfaces exist
- contact graph or relationship readouts that would reveal private data

Block must not:

- rewrite existing bills
- remove historical bill participants
- remove settlement request/payment/proof records
- delete file metadata or file bytes
- delete audit facts
- silently mutate balances, residuals, or payment state
- grant admin/support broad private-data access

Unfriend must stop future direct sharing that relies on accepted friendship. Unfriend may leave group-shared or separately authorized contexts usable only if those contexts independently authorize the actor and target at write/read time.

Unfriend must preserve:

- historical financial records
- bill participants, payers, split rows, adjustments, and revision history
- settlement requests, payments, allocations, residuals, proof attachment references, and balance projection sources
- file metadata and subject associations
- audit events
- legal/accounting history

Historical data visibility follows domain authorization and privacy rules, not UI convenience. For example, a user may still see a past bill they participated in after an unfriend action, but they must not see unrelated future records merely because they used to be friends.

## Direct Sharing Boundary

Direct bill sharing requires either:

```text
accepted friendship at write time
approved group/shared context at write time
```

An accepted friend relationship is only an eligibility input. The API must still validate:

- current authenticated actor
- target active profile/account state
- block/unfriend state
- bill participant rules
- payer/settlement implications
- storage/file subject rules
- privacy policy
- sync/idempotency/version guards where applicable
- money and calculation policy for any bill mutation

Direct sharing must not be authorized by:

- client-side friend cache
- hidden UI controls
- generated client method availability
- possession of a user profile ID
- previous historical participation alone
- payment-detail visibility alone

## Payment Detail And File Exposure Boundary

Accepted friendship alone is not enough to expose payment details, payment handles, payment notes, QR/payment images, settlement proof files, receipt files, supporting attachments, file bytes, storage-backed attachments, storage metadata, or signed/provider URLs.

Payment-detail and QR/payment image access remains governed by [Payment details visibility architecture](PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md):

- Self access is for the authenticated owner.
- Counterparty access requires a concrete authorized settlement, payment request, bill payment, or future reviewed equivalent relationship.
- Friend status and group membership alone are insufficient.
- QR/payment image bytes remain behind dedicated authorized content endpoints.
- Responses expose stable file IDs and safe metadata only where authorized.

Settlement proof files remain governed by settlement/payment context. Receipt and supporting files remain governed by bill/group/bill-participant context. Direct friend status does not create a generic file read path.

## Temporary Participants And Future Linkage

Temporary participants exist to represent real people in historical bills before they have a registered account or accepted friend relationship.

Claim/link policy:

- Claim/link preserves the placeholder identity and historical provenance.
- Claim/link must not rewrite old bill participant, payer, split, settlement, or audit actor identity as if the registered account had always been present.
- Claim/link creates a forward-looking association from the temporary participant to a real profile only after server/API validation.
- Claim/link must be auditable.
- Claim/link must not silently grant friend-equivalent access.
- Claim/link must not expose payment details, file bytes, unrelated bills, unrelated settlements, or group membership without separate authorization.
- Conflicting claim attempts must fail closed with safe problem categories.

Historical records should be able to show that an old placeholder was later linked, where the viewer is authorized to see that provenance, without corrupting the original participation facts.

## Admin And Abuse Policy

Day 1 friend/direct-sharing policy should be least privilege.

Admin tooling may later support investigation, disablement, moderation, abuse review, or break-glass workflows, but this document does not authorize public/admin exposure changes. Future admin access must be separately reviewed, authorized, redacted by default, and audited.

Admin/support defaults:

- No broad private friend graph browsing by default.
- No broad payment-detail or QR viewing by default.
- No settlement proof, receipt, or supporting-file byte access from friend/admin status alone.
- Disablement/moderation can block future friend/direct-sharing actions without rewriting history.
- Admin actions that affect discovery, relationship state, block policy, visibility, or moderation must be auditable with bounded metadata.

Abuse posture requirements before runtime:

- Per-actor and per-identifier discovery/request rate limits.
- Cooldowns for repeated requests or declines.
- Abuse categories that do not reveal account existence.
- Safe handling of disabled/deleted/unavailable accounts.
- Audit or security telemetry for suspicious high-volume discovery/request behavior.
- No raw identifier, payment, file, token, credential, recovery-code, or private-note logging.

## Problem Categories

Future API work should use bounded problem categories rather than leaking domain internals. Planning categories:

```text
discovery_disabled
identifier_type_disabled
not_found_or_not_available
request_not_allowed
duplicate_request
reverse_request_pending
relationship_already_accepted
relationship_not_accepted
blocked_or_not_available
unfriend_required_state_missing
direct_share_not_allowed
payment_context_required
file_context_required
temporary_participant_claim_conflict
temporary_participant_claim_not_allowed
stale_relationship_state
idempotency_body_mismatch
rate_limited
policy_block
```

Problem responses should include safe machine-readable codes, user-display-safe titles, correlation IDs where available, and no unrelated user/profile/payment/file/storage/audit details.

## Future OpenAPI And Generated-Client Boundary

This document does not edit `packages/contracts/openapi/settleora.v1.yaml` and does not generate clients.

Future canonical contract work should be separately scoped and manual-gated. Conceptual future slices:

```text
FriendDiscovery
FriendRequestLifecycle
FriendRelationshipReadout
FriendBlockLifecycle
DirectSharingEligibility
TemporaryParticipantClaimLink
FriendProblemResponses
```

Potential route concepts are planning names only:

```text
POST /api/v1/friends/discovery/exact-match
GET /api/v1/friends/relationships
GET /api/v1/friends/relationships/{userProfileId}
POST /api/v1/friends/requests
POST /api/v1/friends/requests/{requestId}/accept
POST /api/v1/friends/requests/{requestId}/decline
POST /api/v1/friends/requests/{requestId}/cancel
POST /api/v1/friends/relationships/{userProfileId}/unfriend
POST /api/v1/friends/blocks
DELETE /api/v1/friends/blocks/{userProfileId}
GET /api/v1/direct-sharing/eligibility/{userProfileId}
POST /api/v1/temporary-participants/{temporaryParticipantId}/claim
```

Future contract rules:

- OpenAPI remains the source of truth.
- Generated clients are regenerated only from reviewed OpenAPI.
- Generated clients must not be hand-edited.
- Contract examples must not contain real identifiers, payment details, file IDs from real users, tokens, credentials, raw OCR text, storage paths, object keys, signed URLs, or private data.
- Client-visible enums should tolerate additive values.
- API/domain authorization remains authoritative even when generated clients expose typed methods.

## Audit, Logs, And Privacy Requirements

Bounded future audit events:

```text
friend.discovery_attempted
friend.request_created
friend.request_accepted
friend.request_declined
friend.request_cancelled
friend.relationship_unfriended
friend.block_created
friend.block_removed
friend.direct_share_authorized
friend.direct_share_denied
temporary_participant.claim_started
temporary_participant.claim_linked
temporary_participant.claim_denied
friend.policy_changed
friend.admin_moderation_action
```

Safe metadata categories:

- actor profile/account ID where safe
- target profile ID only where the actor is authorized or where audit retention requires it
- relationship/request/block ID
- operation category
- outcome category
- policy name/version
- idempotency/correlation/request ID
- safe reason category
- timestamp
- bounded rate-limit bucket category

Audit and logs must not include:

- raw secrets, tokens, credentials, passwords, password hashes, reset tokens, MFA secrets, passkey private material, recovery codes, provider tokens, or SSH material
- raw discovery identifiers by default, including full email or phone
- payment handles, payment notes, payment instructions, QR file bytes, or QR payloads
- settlement proof bytes, receipt bytes, supporting attachment bytes, thumbnails, previews, or file contents
- storage paths, object keys, buckets, provider URLs, signed URLs, local paths, or vault internals
- raw OCR text
- unbounded notes, comments, messages, request bodies, response bodies, or private profile fields
- unrelated user financial data, group lists, bill lists, settlement details, contact graphs, or admin/debug data

Privacy-safe denial behavior is required for discovery misses, blocked relationships, unavailable accounts, unauthorized direct sharing, and payment/file contexts. Runtime validation must prove denial responses do not reveal unrelated account existence, payment-detail configuration, file existence, group membership, bill participation, or settlement state.

## Validation Expectations For Future Work

Docs/control tasks should run docs/scaffold/OpenAPI validation appropriate to their changed files.

Future runtime/API/OpenAPI/generated-client work must add validation proving:

- exact-match discovery only
- no browse-all-users directory or fuzzy global search
- rate-limit and abuse denial categories
- duplicate request and idempotency behavior
- accepted-friend requirement for direct sharing at write time
- block/unfriend denial of future requests/direct sharing
- preservation of historical bills, settlements, file associations, and audit facts
- payment details and QR files are not exposed by friend status alone
- settlement proof and bill attachments remain context-authorized
- temporary participant claim/link preserves historical provenance
- safe problem responses and audit redaction
- no client-side authorization authority

## Non-goals

This document does not authorize:

- Runtime API implementation.
- Domain service implementation.
- Database schema, EF model, migration, or model snapshot changes.
- OpenAPI contract edits.
- Generated-client generation or manual generated-client edits.
- Mobile, web, or admin UI.
- Figma/reference file edits.
- Auth/session/security runtime behavior changes.
- Storage/file-byte behavior changes.
- Money, settlement, payment, or bill calculation runtime changes.
- Docker, CI, deployment, environment, or release changes.
- Secrets, credentials, tokens, `.env`, SSH, or local Codex state changes.
- Closing #431, #400, or sibling issues.
