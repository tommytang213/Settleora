# Settleora Cloud SaaS Readiness

## Purpose And Scope

This document records future-compatible architecture boundaries for optional Settleora Cloud support. It does not authorize cloud runtime code, billing code, app store entitlement code, provisioning automation, tenant tables, autoscaling configuration, federation, UI behavior, OpenAPI changes, migrations, or generated-client changes.

Day 1 through Day 3 remain focused on local-only and self-hosted foundations. Day 4 may add optional Settleora Cloud v1 as a managed workspace/deployment option. Day 99 or later may consider federation or cross-server collaboration only after a separate architecture review.

## Definitions

### Local-Only Authority Boundary

A local-only authority boundary is one device or local app data store where the local profile and local records are authoritative without a Settleora server. Local-only data can be edited and accepted locally, but it is not automatically server or cloud data.

### Self-Hosted Server Authority Boundary

A self-hosted server authority boundary is one operator-managed Settleora server deployment, including its API, PostgreSQL database, configured storage provider, auth/session state, sync acceptance rules, audit records, and approved worker boundaries. Server-mode clients may cache and queue work, but the self-hosted API remains authoritative for accepted server records.

### Settleora Cloud v1 Managed Workspace/Deployment Authority Boundary

A Settleora Cloud v1 authority boundary is one Settleora-managed workspace or deployment with its own API authority, data store, storage boundary, auth/session state, audit records, and operational controls. It is managed hosting for one workspace authority boundary, not a shared multi-tenant SaaS data plane.

## Cloud v1 Hosting Model

Settleora Cloud v1 should be managed single-tenant or workspace-based hosting. One workspace has exactly one authority boundary:

- one local-only device boundary
- one self-hosted Settleora server boundary
- one Settleora Cloud managed workspace/deployment boundary

Settleora Cloud v1 is not shared multi-tenant SaaS. A future shared multi-tenant SaaS data plane would require a separate architecture review, threat model, schema review, operational review, and migration plan.

Live collaboration is supported only inside the same authority boundary. Day 4 Cloud v1 does not support cross-server live collaboration between local-only devices, self-hosted servers, cloud workspaces, or separate cloud deployments.

Federation and cross-server collaboration are Day 99+ possibilities only. They are explicitly out of scope for Day 4 Cloud v1 and must not be designed by accident through sync, storage, auth, or generated-client shortcuts.

## Data Movement And Sync

Local-only, self-hosted, and Settleora Cloud data must not silently merge. Moving data between modes requires an explicit user-approved export, import, migration, or account/workspace linking flow with clear preview, validation, conflict handling, and audit expectations.

Sync applies only within the configured authority boundary. A client configured for a self-hosted server syncs with that server. A client configured for a Settleora Cloud workspace syncs with that workspace. A local-only profile remains local until the user explicitly chooses a reviewed migration/export/import path.

No client should silently upload local-only receipts, OCR text, bills, settlement records, payment details, profile data, files, or audit-sensitive state to a self-hosted server or cloud workspace because a route, generated client, subscription state, or cached profile exists.

## API And Authorization Authority

The API remains authoritative for server/cloud-mode:

- authentication and session validation
- current actor and profile resolution
- authorization and membership checks
- money, currency, rounding, and allocation decisions
- status transitions and settlement state
- file access and storage lifecycle
- sync acceptance, rejection, conflict, and idempotency handling
- audit event creation and retention policy enforcement

Clients must not decide authorization from routes, cached profile state, generated client availability, subscription state, UI visibility, stored group rows, locally known file IDs, or locally known profile IDs.

## Subscription Entitlement Boundary

Subscription entitlement may gate access to the managed Settleora Cloud service only. It may answer questions such as whether a user, account, workspace, or organization is allowed to provision or continue using a managed cloud workspace.

Subscription entitlement must not become financial truth and must not override auth, authorization, money, status, files, sync, or audit decisions. It must not decide settlement validity, bill ownership, group membership, current actor identity, file visibility, audit retention, OCR review authority, or migration acceptance.

App Store, Play Store, payment-provider, and subscription runtime integration remain separate future design gates. This document does not authorize cloud billing implementation.

## Storage And File Metadata

Storage abstraction must remain cloud-compatible without exposing provider internals. API responses must not expose provider object keys, bucket internals, direct object URLs, signed object URLs, filesystem paths, mounted volume paths, temporary local paths, or provider diagnostics.

File metadata remains API-owned in PostgreSQL or another approved server-mode metadata store. Stable file IDs, purpose, lifecycle state, ownership, subject association, authorization policy, audit, and retention remain API/domain-owned even if future managed object storage is used under the hood.

Clients, workers, support tools, and generated clients must not treat provider paths, object-store URLs, bucket names, storage object keys, or local file paths as authority.

## Cloud Admin And Support Tooling

Cloud admin and support tooling must be separate from normal user authority. It must be least-privilege, purpose-specific, audited, and designed so support access cannot silently become ordinary app authorization.

Cloud support tools must avoid exposing or collecting raw secrets, raw tokens, password material, raw payment details, raw OCR text, full receipt contents, statement contents, settlement proof contents, sensitive file bytes, provider object keys, storage paths, vault keys, or full request bodies unless a future break-glass policy explicitly approves a bounded, audited access path.

Break-glass access, if ever approved, requires its own policy review covering authorization, approval workflow, user notification where appropriate, audit, retention, redaction, expiry, and incident-response handling.

## Cloud Operational Requirements

Settleora Cloud v1 requires separate future design gates for operational behavior, including:

- backup and restore
- disaster recovery
- observability and diagnostics
- rate limiting and abuse prevention
- incident response
- support diagnostics
- audit retention and export policy
- security monitoring
- data deletion, retention, and workspace closure
- managed provisioning and deprovisioning

These requirements are future cloud-operational work. They do not authorize runtime implementation, infrastructure-as-code, autoscaling, provider selection, or production deployment changes in the current Day 1 foundation.

## Day 1 Compatibility Rules

Current Day 1 implementation must not be forced into a shared multi-tenant `tenant_id` refactor. Day 1 schema and runtime work should stay focused on local-only and self-hosted foundations unless a later task explicitly approves cloud runtime work.

Future work should avoid tenant-hostile assumptions, such as global singleton deployment state that can never be scoped per managed workspace, hardcoded production cloud URLs, unscoped support authority, provider-specific storage leakage, or sync protocols that assume all servers can merge with each other.

Avoiding tenant-hostile assumptions is not permission to implement shared multi-tenant SaaS now. Cloud v1 readiness means preserving clean authority boundaries and migration paths while keeping the current implementation narrow.

## Required Future Design Gates

Separate future architecture and implementation gates are required for:

- Cloud runtime/deployment
- app store subscription entitlement
- managed cloud provisioning
- backup/restore automation
- support tooling
- multi-tenant SaaS
- federation/cross-server collaboration

Each future gate must define non-goals, authority boundaries, validation, operational risks, privacy risks, audit requirements, migration behavior, and any OpenAPI, schema, generated-client, mobile, web, admin, worker, or infrastructure impact before implementation starts.
