# Authority, Workspace, And Instance Migration Posture

## Purpose And Non-Authorization

This ADR records the migration posture for future `authority boundary`,
`workspace`, and `instance` concepts. It is a guardrail for later cloud,
federation, import/export, backup/restore, sync, and multi-tenant planning.

It does not authorize runtime federation, relay/mailbox runtime, directory
service runtime, direct HTTPS federation endpoints, remote participant runtime,
remote balance snapshot runtime, shared multi-tenant SaaS runtime, Settleora
Cloud runtime, subscription/billing runtime, schema migrations, EF model
changes, OpenAPI changes, generated-client changes, UI/Figma work, deployment,
provider configuration, auth/security behavior changes, storage/file behavior
changes, sync runtime changes, or money/settlement/bill calculation changes.

## Vocabulary

- `authority boundary`: the API/domain policy, data store, storage boundary,
  auth/session state, sync acceptance rules, audit scope, and operational policy
  that own authoritative records for one local/self-hosted/cloud boundary.
- `instance`: one Settleora server deployment with stable technical identity,
  API authority, persistence, storage, auth/session state, policy, and audit.
- `workspace`: the collaboration and data boundary users work inside. One
  workspace has exactly one authority boundary.
- `tenant`: a future isolation or billing/operational grouping if shared
  SaaS is ever approved. A tenant is not current Day 1 runtime vocabulary and
  does not imply authorization, membership, money, file, or audit truth.
- `local/self-hosted authority`: a local-only device data store or
  operator-managed self-hosted server whose own local/API boundary is
  authoritative for its accepted records.
- `managed cloud workspace`: a future Settleora-managed workspace/deployment
  authority boundary. Current Cloud v1 direction is managed single-tenant or
  workspace hosting, not shared multi-tenant SaaS.
- `directory`, `relay`, and `federation`: future discovery, routing, transport,
  or cross-instance protocol surfaces. They are not authorities for identity
  truth, authorization, groups, bills, money, settlements, files, sync
  acceptance, or audit.

## Current Day 1 Posture

Day 1 through Day 3 remain local-only, self-hosted, and server-mode focused.
Existing runtime may continue using an implicit single-server authority
boundary. Current local GUIDs are local identifiers inside that implicit
boundary.

No broad `tenant_id`, `workspace_id`, or `authority_boundary_id` schema refactor
is authorized now. Avoiding future-hostile assumptions is not permission to add
nullable scoping columns, cross-server sync behavior, cloud provisioning,
subscription entitlement, or federation contracts without a reviewed migration
and runtime gate.

## Decision

If authority/workspace/instance concepts are introduced later, existing records
must be migrated by stamping them into one default local/self-hosted authority
boundary, workspace, and instance unless a future reviewed migration explicitly
proves a narrower mapping.

Existing local GUIDs remain local IDs inside that boundary. They must not be
reinterpreted as globally meaningful federation IDs, cloud tenant IDs, remote
profile IDs, or cross-instance resource IDs.

Existing data must not be discarded, silently merged with cloud data, silently
recalculated, silently uploaded, or reinterpreted as remote/federated data. The
migration must preserve provenance and audit-safe evidence, including source
mode, source boundary category, migration version, affected data categories,
validation outcomes, blocked/conflicted records, and operator/user approval
where policy requires it.

## Affected Data Categories

Future migration planning must account for at least:

- auth accounts, identities, credentials, sessions, session families,
  refresh credentials, MFA/passkeys, recovery material, profiles, groups,
  memberships, and roles;
- payment details and payment QR files;
- bills, items, splits, participants, payers, adjustments, bill revisions,
  OCR review records, recurring bill templates, and generated occurrences;
- settlements, settlement requests, payments, payment allocations, residuals,
  proof attachments, and balance projections;
- file metadata, file purpose associations, receipt/supporting/proof/QR files,
  storage lifecycle state, privacy/vault metadata, OCR review artifacts, and
  statement/import/export files where present;
- notifications, delivery attempts, preference state, target references, and
  read/archive state;
- sync operations, idempotency records, conflict records, offline/import/export
  candidates, audit records, imports, exports, backups, and restores.

## Future Remote References

Remote participants, remote groups, remote balance snapshots, directory entries,
relay envelopes, and federated user references must be separate future
models/contracts with provenance, source authority, freshness, visibility, and
security review.

Do not pretend a remote participant is just a local `UserProfile`. Do not make
remote users masquerade as local users without explicit linking, provenance,
authorization, privacy, and audit design. Do not reinterpret local IDs as
globally meaningful federation IDs.

Remote balance snapshots, if ever approved, are signed bounded read models from
their home authority. They are not local money truth, settlement authority, or
opaque mutable balance ledgers.

## Authority Rules

API/domain services own authorization, current actor/profile resolution, money,
bill and settlement state, status transitions, file access, storage lifecycle,
sync acceptance, idempotency outcomes, policy, and audit.

Directory, relay, notifications, subscription/billing, generated clients, UI
caches, AI summaries, support readouts, and remote balance snapshots must not
become authority for identity, authorization, groups, files, money, bills,
settlements, sync acceptance, policy, or audit.

Public/cloud provider outages, directory outages, relay outages, notification
delivery failures, subscription-service failures, or remote snapshot staleness
must not permanently prevent a self-hosted instance from serving its own
authoritative local records. Outage handling must show stale/offline/degraded
state rather than silently transferring authority.

## Future Gate Requirements

Any future task that introduces authority/workspace/instance runtime concepts
must include the relevant gates before implementation:

- schema and EF migration review, including backfill strategy and destructive
  migration analysis;
- OpenAPI and generated-client review if public contracts or client models
  change;
- migration/backfill tests with default-boundary stamping and conflict cases;
- import/export/backup/restore compatibility review;
- auth, security, privacy, account-linking, session, MFA/passkey, and audit
  review;
- storage/file privacy and provider-internal metadata review;
- sync/idempotency scoping review across authority/workspace/instance
  dimensions;
- money, bill, settlement, residual, projection, and recalculation review;
- public/cloud HA/DR, provider-outage, observability, support-tooling, and
  operational review where cloud/public runtime is involved.

## Forbidden Shortcuts

- adding broad nullable tenant/workspace/authority columns without a migration
  plan, backfill tests, ownership rules, and runtime semantics;
- silent authority transfer during outage, restore, import, subscription
  failure, relay failure, directory failure, or provider migration;
- remote users masquerading as local users;
- directory, relay, notification delivery, generated clients, UI caches, AI
  summaries, or support tools owning identity, money, group, file, settlement,
  sync, or audit truth;
- cloud subscription entitlement becoming authorization truth;
- opaque mutable balance tables replacing rebuildable projections;
- client/UI/cache state deciding authority, membership, file access, money,
  settlement status, sync acceptance, or audit outcomes.
