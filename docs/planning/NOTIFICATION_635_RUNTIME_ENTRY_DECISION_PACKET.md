# Notification #635 Runtime Entry Decision Packet

Created: 2026-07-04 HKT

Base main SHA: `09f1f26efd9d46ad995d9baf048b3dab43b0f974`

## Purpose

This packet records the current post-design-gate decision state for
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It does not start runtime implementation. It does not implement or approve API
endpoints, EF schema or migrations, OpenAPI contracts, generated clients,
resolver code, provider sending, provider secrets, device-token behavior,
admin/user/mobile UI, deployment, CI, production audit plumbing, notification
writers, auth/session/security runtime, money/settlement/payment/bill logic,
OCR runtime, storage behavior, sync behavior, Figma output, or issue closure.

## Current State

- PR #691 merged the #684 schema/API design gate at
  `a857a6368b367f5914c49be7740e8057c81402e9`.
- PR #692 merged the #686 provider-readiness design gate at
  `d1c37256da4b416964c1b1afef58a9ee8806b96a`.
- PR #693 merged the #685 UX/readout reference at
  `2649f0cacefbb26d223f0fcf9e97834a97ffef1c`; #685 is closed.
- PR #694 merged the #688 audit/redaction coverage gate at
  `e29de98d7d9ff791f19f85c501de31571fd0bce6`.
- PR #695 merged the #687 resolver-wiring design gate at
  `09f1f26efd9d46ad995d9baf048b3dab43b0f974`.
- #689 final acceptance remains open and is not ready because implementation
  slices have not merged.
- #635 remains open.
- #684, #686, #687, and #688 remain open because design gates alone do not
  satisfy implementation close rules.

Related issue posture at this checkpoint:

- Keep open: #635, #684, #686, #687, #688, #689, #403, #369, #368, #634.
- Keep closed: #685, #371, #570, #575, #672, #679 unless a separate concrete
  regression or human-approved follow-up changes that posture.

## Gate Posture

Manual/admin/security gate:

- Required before any admin/global notification policy runtime read/write
  implementation, admin/operator exposure, security or money bypass behavior,
  or policy mutation audit work.
- Tommy/manual approval is needed before runtime starts.

Schema/migration gate:

- Required before adding policy persistence, EF entities, constraints,
  migrations, or audit storage changes.
- Design names in #684 are concepts only, not approved table/entity names.

OpenAPI/generated-client gate:

- Required before changing `packages/contracts/openapi/settleora.v1.yaml` or
  generated web/Dart clients.
- Generated clients must come only from normal generation after reviewed
  OpenAPI changes.

Provider/secrets/deployment gate:

- Required before SMTP/APNs/FCM activation, provider SDK behavior, provider
  credential handling, hosted activation, Docker/env/deployment changes, or
  provider diagnostics beyond bounded readout categories.
- Provider readiness remains a bounded input, not delivery success.

Device-token/provider gate under #634:

- Required before any runtime uses push token/device state, APNs/FCM provider
  paths, token fingerprints, token lifecycle changes, or mobile push
  permission/provider behavior.

Audit/redaction implementation gate under #688:

- Required before policy read/write audit plumbing, resolver audit hooks,
  redaction helpers, provider error normalization, token/device category
  handling, or audit fixture/test implementation.

UI/Figma/readout implementation gate:

- #685 reference is complete and closed.
- Runtime UI/Figma/admin/user/mobile implementation remains separate and
  blocked until API/readout contracts and surface-specific gates are approved.

Final acceptance gate #689:

- Not ready until approved implementation slices land and close rules are
  satisfied.

## Implementation-Entry Options

### Option A - #684 Schema/API Implementation Slice

This is the best first runtime path only after manual approval.

It is safe as a first slice only if manual admin/security plus schema/API and
OpenAPI gates are explicitly approved for the selected scope.

Likely scope:

- Domain model and persistence proposal or implementation, if schema is
  approved.
- Admin policy read/write service boundary.
- Audit-safe mutation hooks or placeholders.
- OpenAPI contract only if explicitly included.
- Generated clients only through normal generation.

Risks:

- Schema/migration risk.
- OpenAPI/generated-client review risk.
- Admin authorization and exposure risk.
- Audit/redaction risk.

Recommendation:

- Best first runtime path after Tommy/manual approval because it establishes the
  durable contract and persistence boundary that later resolver and readout work
  will depend on.

### Option B - #687 Resolver Skeleton Without Persistence

This is possible only if manual/security review allows it and the task is
explicitly scoped as in-memory/domain-only tests with no public API and no
provider sending.

Likely scope:

- Pure policy resolver module.
- Unit tests for precedence.
- No database, OpenAPI, generated clients, providers, or public endpoints.

Risks:

- It may couple tests and abstractions to a future #684 schema/API shape that
  later changes.
- It may be less durable if #684 contracts are expected soon.

Recommendation:

- Possible but less durable than Option A unless Tommy deliberately defers
  schema/API and wants a pure precedence model first.

### Option C - #686 Provider Readiness Adapter/Readout Runtime

This is blocked unless the provider/secrets/deployment gate is approved and
the #634 token/provider boundaries are explicitly respected.

Likely scope if approved later:

- Bounded provider readiness categories.
- Non-secret readout adapter behavior.
- No provider sending unless a separate provider activation gate approves it.

Recommendation:

- Not first unless provider activation or readiness readout is the immediate
  priority.

### Option D - #688 Redaction Helper/Test Foundation

This can be useful before runtime if implemented as standalone redaction and
category helpers with no schema, OpenAPI, provider behavior, or public API.

Risks:

- It may be premature without concrete API/result shapes.
- Helpers can drift if #684/#687 output categories change.

Recommendation:

- Good companion after Option A, or before it only if security wants the helper
  foundation first.

### Option E - Defer Runtime And Proceed Elsewhere

If manual/schema/OpenAPI/security gates are not approved now, keep #635 open
and move to another Day 1 lane.

Recommendation:

- Safe if Tommy is not ready to approve policy runtime gates.

## Recommended Next Action

Prepare a small #684 schema/API implementation task only after Tommy/manual
approval. The first task should explicitly answer whether it includes EF
schema/migration, OpenAPI/generated clients, admin write API, read-only readout,
or only a service/persistence proposal.

If Tommy is not ready to approve the manual/admin/security, schema, and
OpenAPI posture, pause #635 runtime and switch lanes. Do not start provider
readiness runtime, resolver runtime, admin UI, user/mobile UI, or final
acceptance from the design gates alone.

## Manual Decisions Needed

Tommy must decide:

- Approve starting #684 runtime implementation? yes/no.
- Should the first runtime slice include EF schema/migration? yes/no.
- Should the first runtime slice include OpenAPI/generated clients? yes/no.
- Should an admin write API exist Day 1, or should the first slice be
  read-only/readout only?
- Should provider readiness be a read-only category input first, with no
  provider config/secrets?
- Should the #687 resolver skeleton wait for #684 persistence/contracts?
- Should the #688 redaction helper foundation happen before any public readout
  API?
- Should the #635 admin UI remain docs/Figma-only until the API is stable?

## Ledger Issue Posture

Ledger posture to carry forward:

- #635 remains open for admin/global notification policy runtime and final
  readout work.
- #684 remains open for schema/API implementation acceptance.
- #685 remains closed as the accepted UX/reference packet.
- #686 remains open for provider-readiness implementation acceptance.
- #687 remains open for resolver runtime implementation acceptance.
- #688 remains open for audit/redaction implementation acceptance.
- #689 remains open and not ready for final acceptance.
- #403, #369, #368, and #634 remain open.
- #371, #570, #575, #672, and #679 remain closed unless a separate concrete
  regression or approved follow-up requires reopening.

## Non-Goals Confirmed

This decision packet makes no runtime, API, OpenAPI/generated-client,
schema/migration, auth/session/security, money, settlement, payment, bill,
OCR, storage, sync, provider, secrets, device-token, UI, Figma, deployment,
CI, production audit plumbing, #371, #672, or #679 changes.
