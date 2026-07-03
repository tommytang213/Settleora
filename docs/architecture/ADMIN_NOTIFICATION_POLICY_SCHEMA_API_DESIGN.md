# Admin Notification Policy Schema And API Design

## Purpose

This document is the docs/design gate for GitHub issue
[#684](https://github.com/tommytang213/Settleora/issues/684), `Admin
notification policy schema and API design`, under parent
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It turns the #635 admin/global notification policy readout into an
implementation-ready schema/API boundary proposal for later review.

This document is non-authorizing. It does not implement or approve runtime API
code, database schema, EF migrations, OpenAPI contract changes, generated
clients, admin web UI, mobile UI, provider sending, provider secrets,
deployment configuration, auth/session/security runtime, notification writers,
money/settlement/bill calculation logic, OCR runtime, storage/file-byte
behavior, sync runtime, #371 notification-open/deep-link behavior, or issue
closure.

Any future implementation still needs the explicit manual admin/security,
schema/migration, OpenAPI/generated-client, provider/secrets/deployment,
audit/redaction, and UI/Figma gates named in #635 and #684.

## Design Inputs

This design inherits the boundaries in:

- [Admin global notification policy](ADMIN_GLOBAL_NOTIFICATION_POLICY.md).
- [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md).
- [Day 1 notification event coverage review](DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md).
- [Notification target reference gap review](NOTIFICATION_TARGET_REFERENCE_GAP_REVIEW.md).
- [Auth/session/security notification source policy](AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md).
- [Notification preference resolution model](NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md).
- [SMTP email provider policy](SMTP_EMAIL_PROVIDER_POLICY.md).
- [Push provider device-token lifecycle](PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md).

The design must preserve the Day 1 rule that in-app is the baseline for
supported, eligible, authorized, privacy-safe events, while email and mobile
push are optional external attempts only when policy, provider readiness,
content safety, recipient/device state, and user preference all allow them.
SMS remains unsupported for Day 1.

## Policy Persistence Model

Future persistence should model admin/product policy separately from user
preferences, provider secrets, delivery attempts, and source-domain events. The
names below are design-level concepts only. They are not approved EF entity
names, table names, migration names, OpenAPI schema names, or generated-client
contracts.

### `notification_global_policy`

Concept: singleton or versioned policy root for a deployment/workspace authority
boundary.

Suggested responsibilities:

- Track a policy version, status, created/updated metadata, and optional
  effective timestamp.
- Store global channel caps for `in_app`, `email`, and `mobile_push`.
- Represent `in_app` as the Day 1 baseline where the source event is supported,
  eligible, authorized, and privacy-safe.
- Keep `email` and `mobile_push` disabled or unconfigured by default until a
  future provider/deployment gate configures them.
- Store event-family default caps, such as bill/revision, settlement/payment,
  recurring, OCR, sync, auth/session/security, item-claim, group/friend,
  reminders, comments, digest, and administrative events.
- Store required/security/money-critical policy defaults, including
  force-in-app, ordinary-mute bypass eligibility, quiet-hours bypass
  eligibility, external generic-only posture, and external blocked posture.
- Store quiet-hours and digest defaults only if global defaults are approved in
  the later implementation slice.
- Link to provider readiness readout state by bounded category and timestamp,
  without storing or exposing provider secrets.
- Preserve compatibility with self-hosted deployments where provider readiness
  may remain `unsupported`, `unconfigured`, `disabled`, or `invalid`.

This policy root should not contain SMTP passwords, APNs keys, FCM credentials,
raw device tokens, provider payloads, delivery-attempt payloads, raw OCR text,
receipt contents, storage internals, payment details, private notes, hidden
bill data, or auth/session secret material.

### `notification_event_policy_overrides`

Concept: optional per-event-family or per-event-type policy override layer under
the global root.

Suggested responsibilities:

- Override global channel caps for one event family or exact event type.
- Allow, deny, or defer external channels by channel and timing mode.
- Force in-app for security-impactful or money-critical events where supported
  and authorized.
- Block external delivery for events that cannot produce a safe email/push
  content class.
- Mark external content as `generic_only`, `safe_summary_allowed`,
  `in_app_only`, or an equivalent reviewed safe-content class.
- Declare digest eligibility and quiet-hours deferral eligibility.
- Declare ordinary group/thread/user mute interaction for optional events.
- Preserve source-domain ownership by referencing event-family/type categories
  only; overrides must not create source events or notification writers.

Overrides must not be an escape hatch for incomplete source-policy work.
Auth/session/security, item-claim, OCR completed/failed, remaining sync events,
and broader settlement mismatch/review events stay blocked until their source
transition, target-reference, redaction, and manual gates are satisfied.

### Audit Metadata Concept

Future implementation may use a dedicated policy-audit metadata table or the
existing bounded audit event shape if it can safely express policy changes. The
design requirement is auditability, not a specific table.

Audit metadata should capture:

- actor account/profile ID where approved;
- action, outcome, correlation/request ID, and timestamp;
- policy version before and after, or a bounded safe diff category;
- affected channel, event family, event type, sensitivity class, and timing mode
  where relevant;
- safe reason categories such as `disabled_by_admin`,
  `provider_unconfigured`, `provider_invalid`, `external_blocked`,
  `quiet_hours_default_changed`, or `required_in_app_changed`.

Audit metadata must not contain provider secrets, raw provider responses, raw
device tokens, auth/session tokens or token hashes, MFA/passkey/recovery
material, raw OCR or receipt text, storage paths/object keys/signed URLs,
payment details, proof contents, private notes, hidden bill details, or
unrelated user data.

## API And Domain Service Boundary

Future implementation should keep the API/domain service as the only authority
for policy reads, writes, validation, and resolution. Clients, generated
clients, admin UI, mobile UI, local config displays, user preferences, provider
dashboards, and environment variables must not become final policy authority.

Future service responsibilities:

- Read the current effective policy and bounded provider readiness state.
- Validate proposed policy changes before persistence.
- Enforce owner/admin authorization for mutation.
- Restrict read access to approved owner/admin/operator roles for admin
  policy, and to authenticated current-user scope for personal readout.
- Reject user/group preferences that attempt to widen admin policy.
- Reject preference or device state that attempts to invent provider readiness.
- Return product-facing readout states without secrets or provider internals.
- Emit bounded audit records for policy reads/writes where approved.

The policy resolver should compose, in order:

1. Event eligibility, source-domain ownership, recipient authorization, and
   privacy/content safety.
2. Admin/global channel and event-family caps.
3. Required in-app, security-impactful, and money-critical behavior.
4. User preference.
5. Group mute, group default, or thread preference.
6. Quiet-hours and digest rules.
7. Device, platform, provider readiness, token state, and worker/outbox
   availability.

The resolver output should use product-facing state categories such as
`available`, `unsupported`, `unconfigured`, `disabled`, `muted`, `deferred`,
`digest_pending`, `queued`, `sent`, and `failed`. It should avoid `delivered`
unless a future provider-specific design distinguishes provider acceptance,
device/mailbox delivery, app receipt, user visibility, and user action.

User and group preferences can narrow policy only. They cannot:

- enable globally disabled email or push;
- override provider unconfigured/invalid/unsupported states;
- suppress required in-app behavior unless an explicit reviewed security/money
  policy allows it;
- authorize a recipient or linked resource;
- expose hidden group, bill, settlement, OCR, storage, payment, auth/session, or
  provider data;
- turn queued, deferred, disabled, unsupported, unconfigured, or failed external
  attempts into success.

## OpenAPI Contract Design

OpenAPI remains the source of truth in any future implementation. This document
does not edit `packages/contracts/openapi/settleora.v1.yaml` and does not
approve generated-client changes. Generated web and Dart clients must be
regenerated only from a reviewed OpenAPI contract and must not be hand-edited.

Future endpoint families may include:

- `GET /api/v1/admin/notification-policy`
  - Owner/admin/operator policy readout for the effective admin/global policy.
  - Response concept: policy version, channel caps, event-family defaults,
    overrides, required/security/money rules, quiet-hours/digest defaults where
    approved, provider readiness categories, updated metadata, and safe reason
    categories.
- `PUT /api/v1/admin/notification-policy`
  - Full replacement with optimistic concurrency or policy-version check.
  - Owner/admin mutation only.
  - Response concept: updated policy readout plus bounded audit correlation.
- `PATCH /api/v1/admin/notification-policy`
  - Partial mutation only if the future contract can validate it safely.
  - Same authorization, validation, concurrency, and audit posture as `PUT`.
- `GET /api/v1/notification-policy/readout`
  - Current-user product-facing readout of effective channel availability for
    the current actor, deployment, and optionally event families.
  - Must not expose admin-only internals, provider secrets, raw provider
    diagnostics, or unrelated recipient state.
- Optional future provider readiness readout endpoint
  - May expose bounded categories such as `unsupported`, `unconfigured`,
    `configured`, `invalid`, `disabled`, or `limited`.
  - Must not expose secret configuration, private hostnames where sensitive,
    credentials, APNs/FCM details, SMTP secrets, raw tokens, provider payloads,
    or dashboard internals.

Candidate enum concepts, subject to future OpenAPI review:

- Channel: `in_app`, `email`, `mobile_push`.
- Channel cap: `enabled`, `disabled`, `unsupported`, `digest_only`,
  `immediate_allowed`, `generic_external_only`, `in_app_only`.
- Readiness: `unsupported`, `unconfigured`, `configured`, `invalid`,
  `disabled`, `limited`.
- Resolution state: `available`, `unsupported`, `unconfigured`, `disabled`,
  `muted`, `deferred`, `digest_pending`, `queued`, `sent`, `failed`.
- Safe content class: `in_app_only`, `generic_external_only`,
  `safe_summary_allowed`.
- Sensitivity: `normal`, `money_critical`, `security_critical`,
  `storage_sensitive`, `ocr_sensitive`, `auth_sensitive`.

Problem responses should use stable problem types and bounded reason categories,
for example:

- unauthorized or forbidden caller;
- stale policy version;
- invalid channel/event-family combination;
- unsupported channel for Day 1/deployment;
- external content class not safe for the requested channel;
- provider readiness cannot be widened by policy mutation;
- required in-app behavior cannot be disabled for the selected event class;
- quiet-hours/digest rule conflicts with required/security/money policy.

Problem details must not include raw provider errors, credentials, tokens,
private hostnames where sensitive, raw OCR or receipt text, storage internals,
payment details, private notes, hidden bill data, or auth/session secret
material.

## Authorization And Audit

Future mutation of admin/global notification policy requires an authenticated
owner/admin role and an approved admin/security manual gate. Generated-client
availability, hidden UI controls, local config, or provider readiness screens do
not imply mutation permission.

Future admin policy reads should require an approved owner/admin/operator role.
Current-user readout endpoints may be available to authenticated users only for
their own effective channel/readout state and must not reveal unrelated users,
admin-only details, provider internals, or deployment secrets.

Audit should cover:

- policy reads where the read exposes admin/operator policy state;
- policy creation/update/disable/restore;
- channel cap changes;
- event-family/type override changes;
- required/security/money force-in-app or bypass changes;
- quiet-hours/digest default changes;
- provider readiness interpretation changes;
- readout visibility changes.

Redaction rules apply to API responses, audit metadata, logs, traces, metrics,
tests, reports, issue comments, screenshots, and design artifacts:

- no SMTP secrets;
- no APNs/FCM tokens, keys, certificates, service-account JSON, or raw device
  tokens;
- no provider payload internals, raw provider request/response bodies, or
  provider dashboard internals;
- no raw OCR text, receipt text, receipt images, file bytes, file paths, object
  keys, bucket names, signed URLs, or storage internals;
- no payment details, QR contents, proof contents, private notes, hidden bill
  data, or unauthorized participant data;
- no auth/session secret material, bearer/refresh/reset tokens, token hashes,
  MFA secrets, recovery codes, passkey private material, reusable challenge
  material, password material, or raw abuse identifiers.

Policy audit does not replace source-domain audit. Money, settlement, bill,
OCR, sync, storage, auth/session, and security actions continue to emit their
own bounded audit records where required.

## Migration And Rollout Safety

Future persistence work must use explicit EF migrations. It must not rely on
production startup auto-migration.

Safe defaults:

- in-app enabled as the baseline for supported, eligible, authorized,
  privacy-safe events;
- external channels disabled, unsupported, or unconfigured until explicitly
  configured through approved provider/deployment gates;
- no silent widening of user or group delivery;
- no fake provider delivery success;
- no SMS exposure as Day 1-capable;
- no provider readiness invented from user preferences, device registration, or
  generated-client availability.

Rollout requirements:

- preserve self-hosted deployments and TrueNAS/Docker-compatible environments;
- support deployments with no SMTP/APNs/FCM configuration;
- degrade to in-app-only behavior where provider configuration is absent,
  invalid, disabled, unsupported, or temporarily unavailable;
- separate provider readiness readout from provider secret configuration;
- keep rollback behavior conservative by falling back to disabled/unconfigured
  external channels rather than attempting delivery with unknown policy;
- require manual review for any destructive migration, public/admin exposure,
  provider activation, schema change, OpenAPI change, or security/money bypass
  behavior.

## Future Test Plan

Focused implementation tests should cover:

- policy read authorization for owner/admin/operator versus ordinary user;
- policy write authorization and forbidden ordinary-user mutation;
- stale policy version or concurrency rejection;
- admin cap cannot be widened by user preference;
- admin cap cannot be widened by group mute/defaults;
- user/group preference can narrow optional delivery only;
- security/money-critical events force in-app where supported and authorized;
- ordinary mute/quiet-hours/digest cannot suppress required in-app behavior
  unless an explicit reviewed policy allows it;
- disabled, unsupported, unconfigured, invalid, and limited provider readouts;
- quiet-hours and digest interaction for optional event classes;
- external generic-only and external-blocked content classes;
- audit write coverage for policy mutations;
- audit/readout/log/test redaction for secrets, provider payloads, raw tokens,
  raw OCR/receipt text, storage internals, payment details, private notes,
  hidden bill data, and auth/session secret material;
- OpenAPI contract validation and generated web/Dart client regeneration;
- generated clients are not hand-edited;
- no provider secrets in responses, logs, tests, fixtures, reports, or examples;
- no #371 route/deep-link behavior changes;
- read/archive notification operations remain source-state neutral.

## Implementation Split Recommendation

Recommended future order:

1. Schema/API implementation behind admin/security/manual gate.
   - Depends on #684 acceptance.
   - Requires schema/migration and OpenAPI/generated-client gates before merge.
2. OpenAPI/generated-client update.
   - Contract is source of truth.
   - Generated web/Dart clients must be regenerated from OpenAPI and reviewed.
3. Policy resolver/runtime wiring.
   - Depends on #684 and provider/readiness policy from #686 where external
     channels are involved.
   - Should preserve #687 as the runtime wiring child.
4. Readout UI reference/implementation gate.
   - Use #685 for admin/user readout UX and Figma/reference approval before UI.
5. Provider readiness integration.
   - Use #686 for SMTP/APNs/FCM readiness categories without secrets or fake
     success.
6. Audit/redaction coverage.
   - Use #688 for mutation audit, readout redaction, and secret/privacy tests.
7. Final acceptance.
   - Use #689 after prior slices pass validation, CI, manual gates, and issue
     readback.

Runtime remains blocked until the relevant child gates clear. #684 should not
by itself implement #687 runtime wiring, #686 provider readiness integration,
#685 UI/readout implementation, #688 audit coverage, or #689 final acceptance.

## Parent And Child Posture

#684 remains open after this design gate unless the design is accepted and the
issue body/comment explicitly says the implementation design is complete.

#635 remains open. #684 does not close #635 alone.

Related issues #403, #369, #368, and #634 remain open. Closed issues #371,
#570, #575, #672, and #679 remain closed and must not be reopened or redone by
this design gate.

Runtime remains blocked.

## Non-Goals

This design does not change:

- backend/API runtime;
- OpenAPI contracts;
- generated clients;
- EF schema or migrations;
- auth/session/security runtime;
- money, settlement, payment, or bill calculation authority;
- OCR extraction/runtime/apply behavior;
- storage/file-byte behavior;
- sync runtime behavior;
- notification constants, writers, provider delivery, SMTP/APNs/FCM activation,
  or provider dashboards;
- mobile Flutter UI/tests;
- web/admin UI implementation or public/admin exposure;
- #371 notification-open/deep-link behavior;
- #672/#679 closed states;
- Docker, deployment, environment, CI, signing, TestFlight, or App Store
  metadata;
- runtime theme default, theme picker, or theme persistence;
- Figma API output, binary design assets, or screenshots;
- secrets.

## Readiness Conclusion

#684 is implementation-ready as a design packet after review, but this packet is
not implementation and not approval to merge runtime/API/schema/OpenAPI/provider
work. The next safe action is human review of this design, then a separate
PR/merge gate for the docs branch if accepted.
