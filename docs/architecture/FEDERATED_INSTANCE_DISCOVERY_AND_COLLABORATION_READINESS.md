# Federated Instance Discovery And Collaboration Readiness

## Purpose And Non-Authorization

This document records future-compatible architecture direction for Settleora
federation, discovery, and cross-instance collaboration. It is a readiness and
design packet only.

It covers future direction for:

- self-hosted/private instances;
- public/cloud instance discovery;
- private-private discovery;
- federated group collaboration;
- remote member participation;
- federated balance summary aggregation;
- future scale and resilience considerations;
- future public/cloud instance HA/DR and provider-outage posture;
- future multi-workspace and multi-tenant readiness boundaries without
  authorizing shared SaaS runtime.

This packet does not authorize runtime federation, relay runtime, directory
service runtime, OpenAPI changes, generated-client changes, migrations, UI,
Figma work, deployment, billing, production cloud exposure, or public shared
multi-tenant Settleora Cloud behavior.

Day 1 through Day 3 implementation remains local-only, self-hosted, and
server-mode focused unless a later reviewed task explicitly approves
federation runtime. Current Settleora Cloud v1 planning remains managed
single-tenant/workspace hosting unless a separate gate approves broader cloud
runtime.

## Vocabulary

- `authority boundary`: The API, data store, storage boundary, auth/session
  state, sync acceptance policy, audit scope, and domain policy that own a
  workspace or instance's authoritative records.
- `instance`: One Settleora server deployment with a stable technical identity,
  API authority, persistence, storage, auth/session state, policy, and audit.
- `public/cloud instance`: A Settleora-managed or publicly reachable instance
  that may host users, groups, discovery entries, relay behavior, or managed
  workspace features in future approved cloud work.
- `private/self-hosted instance`: An operator-managed Settleora deployment for
  a household, group, organization, or individual. It may be LAN-only,
  internet-reachable, VPN-reachable, or reachable only through future relay
  check-in modes.
- `directory`: A discovery index that helps users find instances or route
  federation. It is not an authority for identity truth, balances, groups,
  bills, authorization, settlement state, payment details, or financial records.
- `directory provider`: A concrete directory service implementation or
  configured directory endpoint. Future instances may use zero, one, or many
  providers.
- `group home authority`: The instance authority boundary that owns a group and
  the group's financial records, member policy, audit records, balance
  projection, and accepted mutations.
- `user home authority`: The instance where a user account/profile is
  authoritative for sign-in, sessions, user-scoped local records, and
  user-dashboard read models.
- `remote participant`: A person whose user home authority differs from the
  group home authority for a federated group.
- `federated user reference`: A stable, bounded reference to a remote user,
  scoped by source instance ID, user identifier, display-safe label, key
  material or fingerprint where applicable, and visibility policy.
- `remote group reference`: A local read-model reference to a group whose home
  authority is another instance.
- `signed intent`: A user or instance action request signed by the source
  authority or actor key according to a future protocol. It is input for the
  home authority to validate, not accepted financial truth.
- `balance summary snapshot`: A signed, bounded projection emitted by a group
  home authority to an authorized remote user home. It is a cache/read model,
  not ownership transfer of money truth.
- `freshness state`: The state that tells a user whether a local or remote
  balance summary is current, stale, offline, pending, conflicted, or revoked.
- `direct HTTPS federation transport`: Future server-to-server federation over
  reachable HTTPS endpoints with TLS, stable instance identity, public keys, and
  reviewed federation routes.
- `relay/mailbox transport`: Future optional federation transport where an
  instance uses outbound check-in, polling, or websocket-like sessions to send
  and receive signed/encrypted envelopes through a relay.
- `outbox/inbox envelope`: A signed message wrapper with source/target
  instance IDs, type, idempotency key, expiry, correlation ID, basis/version
  metadata where relevant, replay protection, and encrypted sensitive payloads.

## Core Authority Rules

These rules are hard requirements for any future federation design:

```text
A financial record has exactly one authority boundary.
A group has exactly one home authority.
A bill, split, settlement, payment, residual, proof, and audit record belongs to exactly one home authority.
Remote instances may cache, mirror safe summaries, and submit signed intent.
Remote instances must not co-own money truth.
User home instances may aggregate signed balance summaries, but they do not become the group financial authority.
No cross-instance split-brain accounting.
```

The home authority validates auth, authorization, money, rounding, settlement
state, file access, status transitions, conflict handling, idempotency, and
audit before any financial record changes. A remote instance can preserve
pending user intent and display authorized summaries, but it cannot accept or
finalize another instance's financial records.

## A/B/C Example

```text
A and B are on the public instance.
C is on a private/self-hosted instance.

Group 1: A + B, hosted by public.
Group 2: B + C, hosted by C private.
B's public home aggregates:
- authoritative public balance for Group 1
- signed remote balance snapshot from C private for Group 2
```

In this example, the public instance is authoritative for Group 1. C's private
instance is authoritative for Group 2. B's public dashboard may aggregate the
public Group 1 balance with a signed remote Group 2 balance summary, but the
public instance does not become the authority for Group 2.

A must not see C, Group 2, B/C relationship details, C private data, B's remote
memberships, remote balance details, remote group names, or C's instance
metadata unless a future reviewed sharing policy explicitly authorizes that
visibility.

## Authority Selection

Default authority selection:

- The default group home is the server where the group is created.
- Direct 1:1 bills also have a home authority, defaulting to the creator's
  current instance.
- When remote members are involved, future UI may offer an explicit hosting
  choice such as `Host on public` or `Host on C private`.
- Once bills, settlements, proof, audit, or other financial records exist,
  authority cannot casually change.
- Authority migration requires a separate reviewed migration workflow, member
  approval where policy requires it, audit, source and target validation, old
  group read-only or migrated state, and conflict handling.
- Server downtime must not automatically transfer authority to another server.

Authority migration is not ordinary sync. It is closer to a controlled
boundary-crossing migration with explicit consent, validation, durable audit,
rollback or read-only posture, and no silent merge between local, self-hosted,
or cloud data.

## Discovery Modes

Settleora Cloud or a public instance may know about a self-hosted instance only
through intentional disclosure:

- invite link, invite package, or QR code;
- exact handle or domain lookup, such as `C@c-private.example.com`;
- explicit directory registration;
- optional future relay/check-in registration.

Cloud must not crawl the internet for private Settleora servers.

Future discovery modes:

- `federation_off`: The instance does not participate in federation discovery
  or transport.
- `invite_only`: The instance can be reached only through explicit invite
  packages or equivalent out-of-band disclosure.
- `exact_handle_only`: Lookup requires an exact handle, domain, or equivalent
  identifier.
- `directory_registered_hidden`: The instance registers for routing or proof
  but is not listed in public browse/search results.
- `listed_instance`: The instance is listed as an instance, but users are not
  broadly listed.
- `listed_users`: The instance allows configured users or handles to appear in
  discovery according to strict policy.
- `relay_registered`: The instance has registered a relay/mailbox route for
  transport without necessarily being public-listed.

Privacy-preserving defaults for self-hosted instances should be
`federation_off`, `invite_only`, or `exact_handle_only`. Public listing must be
opt-in.

## Directory Registration

Explicit directory registration supports:

- many self-hosted instances;
- the public/cloud instance as an instance entry;
- zero, one, or many directories per instance in the future;
- a directory-provider abstraction rather than one hardcoded directory.

Hard rule:

```text
Directory helps users find instances or route federation.
Directory does not own identity truth, balances, groups, bills, payment details, friend graph, authorization, settlement state, or financial records.
```

Directory entries should use stable technical identity:

- instance ID;
- verified base URL;
- public key or fingerprint;
- supported federation version;
- discovery mode;
- capabilities;
- last verified time;
- optional admin or abuse contact.

Registration must require proof, such as HTTPS
`.well-known/settleora`, DNS TXT challenge, admin-signed instance key proof, or
an equivalent reviewed proof flow.

Directory responses must be minimal and privacy-safe. They must not expose
payment details, group lists, bills, balances, receipt contents, OCR text,
proof files, private notes, friend graph, authorization state, or audit.

## Public-Private And Private-Private Transport

Future federation should support two transport families.

### Direct HTTPS Federation Transport

Direct HTTPS federation transport requires:

- a publicly or mutually reachable URL;
- TLS;
- stable instance ID;
- public key or key fingerprint;
- reviewed federation endpoints;
- version negotiation and capability signaling;
- idempotency, replay protection, rate limits, and safe problem categories.

Direct transport can work between public and private instances, or between two
private instances, if both are reachable and policy allows the connection.

### Relay/Mailbox Federation Transport

Relay/mailbox federation transport is an optional future mode for instances
behind NAT, operator-managed home servers, intermittent connectivity, or easier
self-hosted operation.

In this mode, the private instance may use outbound check-in, polling, or
websocket-style sessions. The relay routes signed/encrypted envelopes. The
relay must not own money truth and must not read sensitive payloads by default.

Even when a private instance is internet-reachable, direct HTTPS must not be
the only possible future path. Transport choice should be policy-controlled and
designed so relay availability does not silently transfer financial authority.

## Federated Intent And Snapshots

Future message categories may include:

- invite request, accept, and reject;
- remote membership update;
- bill acknowledgement intent;
- settlement mark-paid, confirm, dispute, and cancel intent;
- proof attach intent;
- balance snapshot publish;
- stale, offline, and conflict notification;
- revocation and block events.

Every future message should have:

- source instance ID;
- target instance ID;
- signed envelope;
- message type;
- idempotency key;
- source version or basis where relevant;
- expiry;
- correlation ID;
- encrypted payload where sensitive;
- replay protection.

Signed intent is never final financial truth by itself. The group home
authority validates the actor, member visibility, status basis, policy version,
money calculation basis, idempotency key, and current group state before
accepting, rejecting, or conflicting the intent.

## Federated Balance Summary Aggregation

Core user problem:

B may have balances across public and private group authorities and needs one
dashboard without moving all money truth to one server.

Design direction:

- The group home computes authoritative balance projection for its group, bill,
  settlement, residual, proof, and audit scope.
- The group home emits signed balance summary snapshots to authorized remote
  user homes.
- The user home stores remote snapshots as cache/read model only.
- The dashboard aggregates local authoritative balances, remote current
  snapshots, stale last-known snapshots, pending intents, and conflicts.
- The dashboard shows source, group, instance, timestamp, source version,
  freshness, and attribution.

Freshness states:

- `current`
- `last_known`
- `stale`
- `offline`
- `pending_intent`
- `conflict`
- `revoked_or_unavailable`

Stale remote data must not be shown as fully current. Balance changes must be
explainable and attributed. A user home cannot silently reinterpret a remote
snapshot as local money truth.

## Change Attribution

If B sees a balance change, the UI/read model must be able to explain:

- old amount;
- new amount;
- source instance;
- group or source record;
- actor or safe actor label where authorized;
- old and new source version;
- sync time;
- reason category;
- whether B must act.

If no authorized event, version, or reason exists for a balance change, treat
that as a bug or security problem. The system must not present unexplained
remote balance drift as normal behavior.

## Failure Behavior

Failure behavior must preserve authority boundaries:

- If a private group home is down, B's user home shows the last-known or stale
  snapshot and queues intent as pending only.
- No action becomes financial truth until the group home accepts it.
- If the public/user home is down, clients may show cached data with stale
  warnings according to future cache policy.
- No server automatically becomes authority because another server is
  unavailable.
- Remote snapshots have expiry and staleness policy.
- Conflicts preserve pending user intent for review, correction, retry, or
  discard according to policy.

Provider, network, relay, directory, worker, queue, or projection failure must
surface as degraded freshness, pending, failed, or conflict state. It must not
silently transfer group ownership, mutate bills, hide unsettled debt, clear
pending settlements, or discard pending user intent.

## Scale, Resilience, HA/DR, And Provider-Outage Posture

The current PRD typical deployment remains small, commonly 5 to 50 users, but
the architecture should remain extensible. Future public/cloud/federated scale
needs separate gates for:

- projection cache/read models;
- outbox/inbox workers;
- relay/mailbox infrastructure;
- rate limits and abuse prevention;
- directory abuse controls;
- observability and diagnostics;
- load tests;
- backup/restore and disaster recovery;
- per-instance, per-workspace, and per-user quotas;
- idempotency and retry retention;
- AI using deterministic summaries/projections instead of raw cross-instance
  scans.

Public/cloud resilience design boundaries:

- Public/cloud service availability must not depend on a single application
  process, single API replica, single worker, single queue consumer, or single
  projection builder.
- Future Cloud/public instance work must define explicit RTO/RPO targets before
  production exposure.
- Future Cloud/public instance work must define backup, restore,
  point-in-time recovery, disaster recovery, and restore-drill expectations.
- Future Cloud/public instance work must define degraded modes for directory,
  relay/mailbox, AI insights, notification delivery, and balance-snapshot
  freshness.
- Federation must tolerate remote instance downtime by showing stale,
  last-known, pending, or conflict states instead of silently changing
  authority.
- Server downtime must not automatically transfer group authority to another
  instance.
- Public/cloud instance HA is a separate future operational gate from this
  docs-only packet.

Provider-outage posture:

- Do not design Settleora Cloud/public federation so that one cloud provider
  outage, such as Azure/Microsoft, AWS, GCP, Cloudflare, or one managed
  database provider, permanently prevents users from accessing their own
  self-hosted authority boundaries.
- Public/cloud service may provide directory, relay, hosted users, hosted
  groups, and optional managed workspace features, but self-hosted instances
  must remain able to operate their own local authority boundary when the
  public/cloud service is unavailable.
- If a central directory or relay is unavailable, direct invite,
  exact-handle, and direct HTTPS paths should remain future-compatible where
  the involved instances are reachable and policy allows.
- Future production cloud work must evaluate multi-region, backup-region,
  cross-provider portability, infrastructure-as-code portability, data export,
  and provider-independent recovery, without requiring Day 1 through Day 3
  implementation.
- Multi-provider active-active is not authorized here and should not be
  promised. It is a future operational architecture decision with cost and
  complexity tradeoffs.

Public cloud and multi-tenant readiness boundaries:

- The current docs should continue to avoid forcing Day 1 into a shared
  multi-tenant SaaS refactor.
- If a future public/cloud instance grows beyond managed single-tenant or
  workspace hosting, shared multi-tenant runtime needs its own schema, authz,
  isolation, rate-limit, billing/entitlement, support-tooling, backup/restore,
  deletion, incident-response, and migration design gate.
- Any future multi-tenant/public cloud design must keep group home authority,
  workspace/authority boundary, file access, audit, and balance projections
  scoped so one tenant, workspace, or user cannot leak into another.
- Existing self-hosted data should be migratable into a default
  authority/workspace boundary if a future migration introduces workspace or
  tenant concepts. No existing records should be discarded or silently merged.

AI remains an insight layer. AI must not decide balances, become a federation
authority, bypass authorization, or scan raw cross-instance data outside the
authorized deterministic summaries/projections approved by future policy.

## Migration Posture

Existing self-hosted data can later map into a default authority boundary or
workspace if a future migration adds instance/workspace concepts.

Existing records should not be discarded. Future migration should:

- create a default local authority/workspace;
- backfill scoped records;
- add and validate constraints;
- introduce remote references only for future federated groups/users;
- preserve audit;
- avoid silent merge between local, self-hosted, and cloud data.

Migration must preserve provenance and must not silently recalculate money,
clear settlement state, expose files, merge identities, or turn local cache into
another instance's financial truth.

## Security And Privacy Defaults

Security and privacy defaults:

- Self-hosted federation is off or invite-only by default.
- Exact-handle lookup is optional.
- Directory listing is opt-in.
- Public discovery never exposes payment details, group list, bills, balances,
  receipts, OCR text, proof files, friend graph, private notes, or audit.
- Future runtime should support blocklists for users, instances, and
  directories.
- Future runtime should include anti-spam invite controls.
- Stable instance keys and rotation policy need future design.
- Denied and not-visible responses must avoid existence leaks.

Discovery, directory, relay, and federation logs must avoid secrets,
credentials, raw tokens, private keys, raw payloads, payment details, raw OCR
text, file bytes, storage paths, object keys, signed URLs, unbounded private
notes, and unrelated financial data.

## Non-Goals

This packet does not authorize:

- implementing federation runtime;
- implementing relay/mailbox runtime;
- implementing directory service;
- shared multi-tenant SaaS runtime;
- public/cloud HA/DR implementation;
- multi-region or multi-provider deployment implementation;
- cross-server live collaboration now;
- cross-instance debt simplification or netting;
- automatic authority failover;
- automatic group migration;
- public crawling of private instances;
- global friend graph;
- global identity authority;
- raw receipt/OCR/proof sharing through directory or relay by default;
- OpenAPI/generated-client changes;
- EF migrations/schema changes;
- UI/Figma implementation;
- production deployment or cloud billing.

## Future Implementation Gates

Before runtime federation or discovery work starts, separate future gates must
cover:

- exact protocol and OpenAPI contract;
- instance identity/key management;
- signed/encrypted envelope format;
- directory provider model;
- direct transport endpoints;
- relay/mailbox transport;
- admin policy UI;
- mobile/web UX and Figma;
- storage/file sharing rules;
- audit and redaction policy;
- abuse and rate limiting;
- observability;
- data retention and deletion;
- migration/import/export behavior;
- performance and load testing;
- public/cloud HA/DR and provider-outage architecture;
- multi-tenant/shared-SaaS isolation architecture if ever needed;
- security review and threat model.

Each future gate must preserve the one-home-authority rule for financial
records and prove that remote summaries, signed intents, generated clients, UI
routes, directory entries, relay envelopes, or AI summaries do not become
financial authority.
