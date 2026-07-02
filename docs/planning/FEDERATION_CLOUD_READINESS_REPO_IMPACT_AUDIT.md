# Federation And Cloud Readiness Repo Impact Audit

## Purpose

This audit records current repository assumptions that are safe for Day 1
self-hosted/server-mode work and assumptions that could become future-hostile
for federation, public/cloud scale, resilience, HA/DR, remote participants,
remote balance snapshots, directory, relay, or managed workspace support.

It is a planning and impact audit only. It does not authorize runtime
federation, relay/mailbox runtime, directory service runtime, direct HTTPS
federation endpoints, remote participant runtime, remote balance snapshot
runtime, schema migrations, EF model changes, OpenAPI changes, generated-client
changes, mobile/web/admin UI changes, cloud deployment, shared multi-tenant
SaaS runtime, billing/subscription runtime, or production HA/DR implementation.

## Status Legend

| Status | Meaning |
|---|---|
| `safe_now` | Compatible with Day 1 self-hosted/server-mode and not known to block later migration. |
| `watch` | Acceptable now, but future work should avoid deepening the assumption. |
| `docs_only_followup` | Needs more planning text before runtime design, but no code/schema change now. |
| `minimal_foundation_candidate` | Small pre-UAT/production foundation may reduce later rewrite risk, but still needs an explicit task/gate. |
| `future_runtime_gate` | Must wait for a future runtime, schema, OpenAPI, security, storage, money, deployment, or migration gate. |
| `do_not_change_now` | Changing now would overfit Day 1 or silently authorize out-of-scope runtime behavior. |

## Executive Summary

The repo is broadly future-compatible because the current architecture already
separates local-only, self-hosted server, future Cloud v1 workspace, and future
federation authority boundaries. `PROGRAM_ARCHITECTURE.md`,
`SETTLEORA_CLOUD_SAAS_READINESS.md`, and
`FEDERATED_INSTANCE_DISCOVERY_AND_COLLABORATION_READINESS.md` agree that one
workspace has exactly one authority boundary, one financial record has one home
authority, remote instances may submit signed intent or cache bounded summaries,
and no remote system co-owns money truth.

The main future-hostile risk is not current implementation behavior. It is
allowing Day 1 code and contracts to keep growing as if every profile, group,
file, sync operation, notification, bill, settlement, and balance always belongs
to one implicit local server forever. Today that assumption is acceptable for
self-hosted/server-mode. Before UAT/production, the safest minimal foundation is
documentation and migration posture, not a broad `tenant_id` or federation
schema refactor.

Recommended pre-UAT/production candidates:

- Add a short architecture decision record for the future
  `authority_boundary` / `workspace` / `instance` migration posture.
- Add validation fixtures or docs-only checks that future docs/contracts do not
  describe directory, relay, subscription entitlement, notification delivery,
  generated-client availability, or remote balance snapshots as money,
  identity, authorization, friend-graph, group, file, or settlement authority.
- Keep future sync/idempotency planning scoped so a future authority/workspace
  dimension can be added without changing the current narrow Day 1 sync surface
  prematurely.

No OpenAPI, generated-client, EF migration, schema, auth/security runtime,
storage runtime, money/settlement runtime, deployment, or UI change is
recommended in this task.

## Current Safe Day 1 Assumptions

| Area | Current assumption | Status | Notes |
|---|---|---|---|
| Authority boundary | Server-mode API and PostgreSQL are the authoritative boundary for business writes. | `safe_now` | Matches `PROGRAM_ARCHITECTURE.md` and Day 1 self-hosted scope. |
| Cloud v1 | Future Cloud v1 is managed single-tenant/workspace hosting, not shared multi-tenant SaaS. | `safe_now` | Avoids forcing a premature `tenant_id` refactor. |
| Federation | Federation, directory, relay, signed intents, and remote snapshots are future-only. | `safe_now` | Current docs explicitly block runtime implementation. |
| Users and groups | Group membership references local `UserProfile` rows. | `safe_now` | Correct for Day 1 local/self-hosted collaboration between registered local users. |
| Bills and settlements | Bills, settlement requests, payments, allocations, residuals, and balances are local-authority records. | `safe_now` | Preserves one-home-authority and rebuildable projection rules. |
| Balance projection | `GET /api/v1/settlement-balances` is a read-only local projection from server records. | `safe_now` | It is not an opaque mutable balance ledger. |
| Sync | Current sync OpenAPI accepts narrow bill archive/restore operations with actor-derived authority. | `safe_now` | Narrowness is safer than overgeneralizing before federation exists. |
| Storage | File APIs use stable file IDs and metadata; responses must not expose paths or object keys. | `safe_now` | Compatible with future instance/workspace scoping and object storage. |
| Notifications | In-app notifications and delivery attempts target local `UserProfile` recipients and local subject IDs. | `safe_now` | Appropriate for local-instance Day 1 events. |
| OpenAPI | Public contracts expose local server-mode routes and profile/group IDs, not federation endpoints. | `safe_now` | No current contract blocks future additive federation contracts. |

## Future-Hostile Assumptions To Watch

| Area | Concern | Status | Impact | Recommended posture |
|---|---|---|---|---|
| Authority/workspace/instance | Most runtime tables rely on implicit installation authority and local GUIDs only. | `watch` | Later managed workspace/federation migrations must stamp existing records with a default local/self-hosted boundary instead of discarding data. | Document migration posture before UAT; do not add a broad runtime refactor now. |
| Users/groups | `GroupMembership` is keyed by `GroupId` + `UserProfileId`; no remote participant or federated user reference exists. | `watch` | Federated groups will need a participant reference layer that can distinguish local profiles, temporary participants, and remote users. | Keep Day 1 unchanged; future runtime gate should introduce a separate participant/reference model, not mutate every local membership rule ad hoc. |
| Bills/settlements | Settlement parties are local `UserProfile` references. | `watch` | Future remote settlement intent must address remote actor references and home authority without making remote users local accounts by accident. | Preserve one-home-authority; future signed-intent runtime must map remote references at the boundary. |
| Balances | Current balance read models are local-only and counterparty-profile based. | `watch` | A future user home dashboard needs remote balance summary snapshots with freshness and source instance metadata. | Treat remote snapshots as read models only; do not change local projection now. |
| Sync/idempotency | Current sync operation persistence scopes idempotency by actor profile/key/operation/resource, but not persisted authority/workspace/instance columns. | `minimal_foundation_candidate` | Future cloud/federation sync may need boundary dimensions to avoid replay/collision across workspaces or instances. | Consider a docs-only or future schema-gated idempotency scope decision before broad sync expansion. |
| Storage | `FileObject` owner/creator are local profiles and provider metadata is installation-local. | `watch` | Future file summaries/proofs need source authority, workspace, and remote visibility rules without exposing paths. | Keep stable file IDs/path redaction; future remote proof sharing remains a storage/privacy gate. |
| Notifications | Notification recipients, actors, and target references are local profile/subject IDs. | `watch` | Federation relay/directory notifications will need remote envelope/source metadata and local privacy-safe summaries. | Keep local-instance notifications local; directory/relay outbox/inbox remains docs-only. |
| Directory/relay | No directory provider, relay mailbox, outbox/inbox envelope, or instance identity runtime exists. | `do_not_change_now` | Premature runtime would create security, privacy, and authority risk. | Leave as future runtime gates; directory must remain discovery/routing only. |
| Scale/resilience | Current self-hosted API depends on local PostgreSQL/RabbitMQ/storage, not public Settleora Cloud. | `safe_now` | Good: self-hosted authority does not depend on future provider availability. | Preserve this rule; future public/cloud scale gets separate HA/DR gates. |
| Projection caches | Current balances and reports are direct/read-only projections, not public-scale caches. | `watch` | Future public/cloud scale will need caches, invalidation, quotas, rate limits, and observability. | Do not implement caches now; require future runtime gate before public/cloud scale. |
| OpenAPI/generated clients | Current OpenAPI lacks federation vocabulary and uses local IDs. | `watch` | Future federation contracts should be additive or versioned, not silent reinterpretations of local IDs. | Do not change OpenAPI now. Future contract tasks need manual gate. |

## Authority / Workspace / Instance Assumptions

Current repo state assumes one active server authority per deployment. That is
safe for Day 1 self-hosted/server-mode because the API owns auth,
authorization, money, file access, sync acceptance, status transitions, and
audit. Cloud readiness and federation readiness align on this point:

- Local-only, self-hosted server, and future managed cloud workspaces are
  separate authority boundaries.
- One workspace has exactly one authority boundary.
- A group and every financial record have exactly one home authority.
- Remote instances may submit intent or cache safe summaries, but they do not
  co-own money truth.

Future migration posture should be explicit: if `authority_boundary`,
`workspace`, or `instance` concepts are introduced later, existing self-hosted
records should be stamped into one default local/self-hosted authority boundary
with provenance and audit-safe migration evidence. Existing data should not be
discarded, silently merged with cloud data, or reinterpreted as remote data.

Classification:

- Current implicit single-server authority: `safe_now`.
- Continuing to add broad runtime surfaces without migration posture:
  `watch`.
- Pre-UAT ADR for default authority/workspace/instance migration:
  `minimal_foundation_candidate`.
- Actual schema/runtime migration: `future_runtime_gate`.

## Users / Groups / Remote Participants

Current group membership uses local `UserProfile` references, and the API
validates active local membership for group work. The domain model confirms this
through `UserGroup`, `GroupMembership`, bill participant, settlement party, and
notification recipient references.

That is safe for Day 1. It becomes future-hostile only if future work tries to
pretend a remote participant is a normal local `UserProfile` without a reviewed
linking and provenance model. Future federation will need a participant
reference model that can represent at least:

- local registered profile;
- temporary/unclaimed participant;
- linked local account claim;
- remote federated user reference scoped by source instance;
- display-safe label and visibility policy;
- key/fingerprint/proof material where a future protocol requires it;
- historical participation preservation after claim/link/migration.

Day 1 should not change group membership runtime now. The right near-term
constraint is documentation: local `UserProfileId` remains local authority, and
remote/federated user references require future auth/security, privacy,
OpenAPI, schema, migration, and UX gates.

Classification:

- Local registered-user group membership: `safe_now`.
- Remote/federated participant support: `future_runtime_gate`.
- Documentation of migration constraints: `docs_only_followup`.

## Bills / Settlements / Balances

The current bill and settlement architecture preserves one-home-authority rules.
Bill totals, item splits, participant shares, settlement requests, payments,
allocations, residuals, proof associations, and balance projections are
server-authoritative within the local/self-hosted boundary. Balances are
derived projections, not hidden mutable truth.

Current settlement and bill schemas are not federated, but they are not
future-hostile by themselves because:

- money values use decimal-safe amount/currency pairs;
- resolved shares are persisted for historical stability;
- settlement request lines and allocations preserve selected source basis;
- residuals are explicit rows instead of invisible client math;
- proof files use stable file IDs and purpose-specific access;
- bill revision policy blocks silent mutation of progressed settlement state.

Future remote balance support should add signed, bounded balance summary
snapshots emitted by the group home authority. A user home authority may
aggregate those snapshots for a dashboard, but the snapshot is a cache/read
model with source instance, group reference, timestamp, version/basis,
freshness, stale/offline/revoked/conflict state, and display-safe scope.

Projection caches are not needed for Day 1. They become necessary only for
future public/cloud scale or high-volume managed workspaces, and they require
invalidation, rebuild, freshness, quota/rate-limit, observability, and HA/DR
design.

Classification:

- Local bill/settlement runtime and read-only balances: `safe_now`.
- Remote balance snapshots: `future_runtime_gate`.
- Public/cloud projection caches: `future_runtime_gate`.
- Pre-UAT warning against opaque mutable balance tables: `docs_only_followup`
  only if future planning starts to drift.

## Sync / Idempotency / Conflicts

Current sync support is intentionally narrow. The OpenAPI contract currently
accepts Day 1 bill archive/restore operation types and states that actor,
profile, group, totals, settlement state, storage, file, OCR, auth, and audit
authority are derived server-side.

This narrowness should be preserved. The risk is expanding sync into a generic
cross-workspace merge protocol before authority/workspace/instance scoping is
defined. Future federation can build on the existing acceptance vocabulary:
`accepted`, `rejected`, `conflict`, replay/idempotency behavior, stale basis
guards, safe problem categories, and pending-data preservation. It should add
authority/workspace/instance dimensions only when the runtime gate needs them.

Classification:

- Current narrow sync surface: `safe_now`.
- Future idempotency scoping by authority/workspace/instance:
  `minimal_foundation_candidate` for a design decision, `future_runtime_gate`
  for schema/OpenAPI/runtime.
- Generic bidirectional cross-server merge: `do_not_change_now`.

## Storage / File Privacy

Storage foundations are compatible with future authority scoping because API
responses expose stable file IDs and safe metadata rather than filesystem
paths, storage object keys, bucket names, provider URLs, signed URLs, or local
device paths. `FileObject` is currently local-profile owned, which is safe for
Day 1.

Future federation or cloud support must not turn file IDs into portable remote
read authority. Remote proof/receipt sharing should remain future-gated and
must use purpose-specific policy, source authority, subject association,
redacted summary metadata, signed/encrypted envelope policy where applicable,
and explicit viewer authorization. Directory or relay systems must never expose
receipt/proof/payment QR bytes or storage internals by default.

Classification:

- Current file metadata and path-redaction posture: `safe_now`.
- Future workspace/instance file authority metadata: `watch`.
- Remote proof/receipt summary sharing: `future_runtime_gate`.
- Exposing provider object keys, paths, signed URLs, or raw bytes through
  directory/relay: `do_not_change_now`.

## Notifications / Directory / Relay / Discovery

Current notification foundations are local-instance only: recipients and actors
are local user profiles; subject references are local group, bill, settlement,
recurring, OCR, file, or sync operation IDs; delivery attempts are provider
neutral and local. This is safe now.

Future directory, relay, outbox, inbox, and discovery work should stay docs-only
until explicit runtime gates exist. The directory must remain discovery/routing
infrastructure only. It must not own identity truth, group membership, money,
balances, bills, settlements, payment details, friend graph, authorization, file
access, or audit. Relay/mailbox infrastructure must route signed/encrypted
envelopes without becoming money authority or broad data visibility.

Classification:

- Local notification foundation: `safe_now`.
- Future envelope/source instance metadata: `watch`.
- Directory/relay runtime: `future_runtime_gate`.
- Directory as money/identity/friend-graph authority: `do_not_change_now`.

## Scale / Resilience / Provider Outage

The current repo does not make self-hosted authority depend on Settleora Cloud
or public provider availability. Self-hosted server-mode uses the configured
API, PostgreSQL, RabbitMQ, and storage boundary. Future directory, relay,
subscription, AI, push/email, or managed cloud provider outages must not
permanently prevent a self-hosted instance from serving its own authoritative
local records.

Future public/cloud scale needs separate gates for:

- projection caches and invalidation;
- outbox/inbox workers and retry leases;
- quotas and rate limits;
- observability, diagnostics, metrics, and tracing;
- backup/restore and PITR;
- explicit RTO/RPO targets;
- restore drills;
- incident response and abuse controls;
- HA/DR architecture;
- provider outage degraded modes.

Multi-provider active-active is future-only. It should not be implied by Day 1,
Cloud v1, or federation readiness docs.

Classification:

- Self-hosted independence from public/cloud provider availability:
  `safe_now`.
- Public/cloud scale and HA/DR: `future_runtime_gate`.
- Multi-provider active-active: `do_not_change_now`.

## OpenAPI / Generated Clients

The current OpenAPI contract exposes local server-mode resources. It does not
include federation endpoints, remote participant models, remote balance
snapshots, directory registration, relay inbox/outbox, direct HTTPS federation,
or managed-cloud provisioning.

That does not block future federation if future contracts are additive,
versioned where breaking, and explicit about local IDs versus remote references.
The contract should not silently reinterpret local `UserProfileId`, `GroupId`,
`FileObjectId`, `SettlementRequestId`, `SyncOperationId`, or notification target
IDs as globally meaningful federation IDs.

Classification:

- Current local OpenAPI: `safe_now`.
- Future remote reference contracts: `future_runtime_gate`.
- Current task OpenAPI/generated-client changes: `do_not_change_now`.

## Existing-Data Migration Posture

If a future migration introduces authority/workspace/instance concepts, the
default posture should be:

1. Create one default self-hosted/local server authority boundary for existing
   server records.
2. Stamp existing groups, profiles, auth accounts, bills, settlements, files,
   notifications, sync operations, and audit-relevant rows into that boundary
   through an explicit reviewed migration.
3. Preserve original local GUIDs as local IDs inside that boundary.
4. Add separate remote reference records for federated users/groups/snapshots
   instead of overwriting local profile/group IDs.
5. Mark existing local balance projections as rebuildable local projections,
   not remote snapshots.
6. Preserve file storage metadata as provider-internal local authority metadata;
   do not export storage object keys as federation references.
7. Require explicit import/export/migration review before moving authority for
   any group or financial record.

This posture should allow existing self-hosted data to survive future cloud or
federation concepts without a dangerous discard/recreate rewrite.

## Validation And Test Gaps For Later Tasks

Future tasks should add validation only when they touch the relevant surface:

- Architecture/docs validation that directory/relay/cloud/subscription text
  never grants money, identity, authorization, friend-graph, group, file, or
  settlement authority.
- Migration tests for stamping existing rows into a default authority/workspace
  if a future schema introduces that concept.
- Sync/idempotency tests for authority/workspace scoped replay, collision, and
  stale-basis behavior if broad sync expands.
- Remote participant tests for local profile, temporary participant, linked
  participant, and remote federated reference separation.
- Remote balance snapshot tests for signature/provenance, freshness,
  revocation, stale/offline/conflict display, and no mutation of home-authority
  money truth.
- Storage privacy tests that remote summary/proof flows never expose provider
  paths, object keys, signed URLs, local paths, file bytes, or unrelated file
  existence.
- Notification/delivery tests for local versus remote envelope source metadata,
  retry leases, redaction, and provider outage degraded states.
- Public/cloud scale tests for quotas, rate limits, projection cache rebuilds,
  observability, backup/restore, and HA/DR only after those gates are approved.

## Issue / Ledger Posture

`docs/planning/ISSUE_PROGRESS_LEDGER.md` exists and was read. No
federation/cloud repo-impact issue or ledger row currently maps to this audit.
This audit does not invent a new issue mapping and does not update the ledger.

Recommended future issue candidate: create a planning issue for
`authority/workspace/instance migration posture before UAT/production` if the
project starts adding broad sync, public/cloud, managed workspace, or federation
runtime slices.

## Explicit Non-Goals

Do not implement now:

- runtime federation;
- relay/mailbox runtime;
- directory service runtime;
- direct HTTPS federation endpoints;
- remote participant runtime;
- remote balance snapshot runtime;
- authority/workspace/instance schema migrations;
- EF model changes;
- OpenAPI contract changes;
- generated-client changes;
- mobile/web/admin UI;
- Figma/reference artifacts;
- public/cloud HA/DR implementation;
- shared multi-tenant SaaS runtime;
- billing/subscription runtime;
- production deployment;
- secrets, credentials, auth config, or provider config;
- branch cleanup/deletion.
