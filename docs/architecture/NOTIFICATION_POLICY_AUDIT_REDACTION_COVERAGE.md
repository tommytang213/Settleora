# Notification Policy Audit And Redaction Coverage

## Purpose

This document is the docs/security/control coverage gate for GitHub issue
[#688](https://github.com/tommytang213/Settleora/issues/688), `Notification
policy audit and redaction coverage`, under parent
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It defines audit, redaction, authorization, rollout, and future test coverage
requirements for later admin/global notification policy reads and mutations,
current-user effective policy readouts, provider-readiness readouts, resolver
decisions, delivery-attempt categories, and diagnostics.

This is an audit/redaction coverage gate only. It does not implement or approve
runtime APIs, database schema, EF migrations, OpenAPI contracts, generated
clients, provider sending, provider secrets, device-token handling, admin UI,
mobile UI, user web UI, deployment, CI, production audit plumbing,
notification constants or writers, auth/session/security runtime, money,
settlement, bill, payment, OCR, storage, sync behavior, Figma output, or
[#371](https://github.com/tommytang213/Settleora/issues/371)
notification-open/deep-link behavior.

This packet prepares future implementation and test work for #684, #686, #685,
#687, and #689. Runtime implementation remains blocked until the separate
manual/security, schema/migration, OpenAPI/generated-client, provider/secrets,
audit, and UI gates clear.

## Design Inputs

This coverage packet inherits the boundaries in:

- [Admin global notification policy](ADMIN_GLOBAL_NOTIFICATION_POLICY.md).
- [Admin notification policy schema and API design](ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md).
- [Notification provider readiness policy](NOTIFICATION_PROVIDER_READINESS_POLICY.md).
- [Notification policy readout UX reference](../design/notifications/NOTIFICATION_POLICY_READOUT_UX_REFERENCE.md).
- [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md).
- [Day 1 notification event coverage review](DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md).
- [Notification target reference gap review](NOTIFICATION_TARGET_REFERENCE_GAP_REVIEW.md).
- [Auth/session/security notification source policy](AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md).
- [Sync notification source policy](SYNC_NOTIFICATION_SOURCE_POLICY.md).
- [OCR needs-review notification source policy](OCR_NEEDS_REVIEW_NOTIFICATION_SOURCE_POLICY.md).
- [Push provider device-token lifecycle](PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md).
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md).

In-app remains the Day 1 baseline where an event is supported, eligible,
authorized, and privacy-safe. Email and mobile push are optional external
attempts only when admin/global policy, provider readiness, content safety,
recipient/device state, user/group preference, timing policy, and worker/outbox
state allow them. Provider readiness is not delivery success.

## Surfaces Covered

Future audit and redaction coverage must apply to these surfaces:

- Admin/global notification policy read.
- Admin/global notification policy create, update, delete, restore, or
  versioned mutation if later approved.
- Current-user effective notification-policy readout.
- Provider-readiness readout.
- Provider readiness failure, degraded, maintenance, and rate-limited
  readouts.
- Policy resolver decisions.
- External delivery-attempt result categories where later delivery attempts
  exist.
- Notification detail/readout explanations.
- Admin/operator diagnostics.
- Logs, metrics, reports, CI artifacts, issue comments, screenshots, and test
  fixtures.

Coverage applies even when a surface is admin-only. Admin/operator readouts may
show bounded categories, timestamps, correlation IDs, and policy versions where
approved, but they still must not expose secrets, raw tokens, raw provider
payloads, private diagnostics, hidden business data, or unrelated user data.

## Allowed Audit And Readout Categories

The following values are design-level candidates for future audit/readout
categories. They are not approved enum names, EF values, OpenAPI schema values,
generated-client contracts, or UI strings.

| Candidate category | Intended use |
| --- | --- |
| `policy_read` | Admin/operator or current-user policy/readout access where audit is approved. |
| `policy_updated` | Approved policy mutation completed. |
| `policy_denied` | Policy read or mutation denied by authorization or policy. |
| `provider_unconfigured` | Provider path is supported in principle but missing required safe setup. |
| `provider_disabled` | Admin/deployment/operator policy disables the provider or channel. |
| `provider_ready` | Provider path may be attempted after all other gates also pass. |
| `provider_degraded` | Provider capability is reduced or partially unavailable. |
| `provider_failing` | Safe checks or recent feedback indicate likely failure. |
| `provider_rate_limited` | Rate or quota policy prevents immediate external attempts. |
| `provider_maintenance` | Operator or provider maintenance pauses attempts. |
| `delivery_deferred` | Approved future attempt is delayed by policy, digest, quiet hours, rate limit, maintenance, or retry posture. |
| `delivery_queued` | Approved future external attempt is queued; success is unknown. |
| `delivery_attempted` | Future provider attempt happened or provider accepted the outbound request according to approved vocabulary. |
| `delivery_failed_transient` | External attempt failed in a recoverable or retryable class. |
| `delivery_failed_permanent` | External attempt failed in a non-retryable class. |
| `blocked_by_admin_policy` | Admin/global policy blocks channel, provider, event family, timing, or sensitivity class. |
| `blocked_by_security_policy` | Security policy keeps the event in-app only or blocks optional delivery. |
| `blocked_by_privacy_policy` | Content or privacy policy blocks external delivery/readout detail. |
| `blocked_by_user_preference` | Current user preference narrows optional delivery. |
| `blocked_by_group_preference` | Group/thread preference narrows optional delivery where allowed. |
| `token_missing` | Recipient/device path lacks an active registered push token. |
| `device_unavailable` | Recipient/device/platform state prevents the push path. |

Future implementation may add or rename categories through the OpenAPI/schema
review path, but it must preserve the safety properties above. Raw provider
error strings, SMTP/APNs/FCM status bodies, internal exception names, stack
traces, and token/provider identifiers must be normalized into safe categories
before storage, logging, readout, screenshots, or issue/report use.

## Forbidden Data Matrix

The data classes below are forbidden in API responses, audit rows, logs,
metrics, traces, test fixtures, reports, GitHub issues/comments, screenshots,
admin/operator readouts, normal user readouts, generated examples, and CI
artifacts unless a later security-approved exception explicitly allows a
specific bounded field for a specific surface.

| Data class | Forbidden examples | Safe posture |
| --- | --- | --- |
| SMTP and service secrets | SMTP passwords, API keys, app passwords, server secrets, service-account secrets. | Use `provider_unconfigured`, `provider_disabled`, `provider_failing`, or `credential_invalid`-style safe categories only. |
| APNs/FCM credentials | APNs/FCM credentials, private keys, certificates, service-account JSON, sender IDs or team IDs where sensitive. | Do not expose values. Readouts may state APNs/FCM path is unconfigured, disabled, ready, degraded, failing, or maintenance. |
| Device tokens | Raw device tokens, protected token blobs, reversible token forms, token ciphertext, full token hashes. | Use no token in ordinary readouts. If approved, use short non-reversible fingerprints only for internal support/audit correlation. |
| Provider internals | Provider payloads, request/response bodies, provider dashboard exports, raw provider errors, provider request IDs where sensitive. | Map to safe readiness or delivery result categories. |
| External message content | Rendered external email/push message bodies where unauthorized or privacy-sensitive. | Store template keys, safe content class, and category only. |
| Auth/session material | Bearer tokens, refresh tokens, cookies, CSRF secrets, reset tokens, recovery codes, MFA secrets, passkey private material, password hashes, raw session identifiers or token hashes. | Use opaque actor/target IDs only where approved and current viewer is authorized. |
| OCR/receipt content | Raw OCR text, receipt text, OCR line dumps, receipt images, receipt file bytes, receipt storage keys. | Use receipt/OCR review IDs only through authorized paths and safe categories such as `ocr_sensitive`. |
| Storage internals | File paths, object keys, bucket/container names, signed URLs, storage provider internals, local cache paths. | Use stable file IDs only where authorized; never expose provider internals. |
| Money/payment/private bill data | Payment details, QR contents, account handles where unauthorized, private notes, hidden bill data, hidden settlement details, proof contents, itemized hidden shares. | Use source IDs and bounded categories only; money/security/OCR/storage fields require explicit allow-listing. |
| Recipient data | Full recipient lists where unauthorized, unrelated user/profile/account IDs, hidden group membership. | Current-user readouts show only current actor effective state; admin readouts need approved exposure. |
| Network/deployment internals | Private hostnames, ports, internal IPs, rate bucket keys, queue/worker IDs where sensitive. | Classify URL/host/deployment data before display; redact or omit sensitive internals. |
| Unrelated user data | Any data not needed for the audited action/readout. | Data minimization: do not store or display it. |

Forbidden data must not be introduced through examples. Documentation,
fixtures, tests, screenshots, and reports must use obvious placeholders such as
`<redacted-provider-secret>` or safe categories, never realistic-looking
tokens, keys, passwords, hostnames, provider payloads, receipt text, payment
details, or session identifiers.

## Redaction And Normalization Requirements

Future implementation must reduce audit/readout data before storage or display.

- Use non-reversible identifiers or stable opaque IDs where an ID is needed for
  correlation.
- Token fingerprints, if approved, must be short, purpose-bound,
  non-reversible, and never sufficient for authentication, provider use, or
  cross-deployment tracking.
- Provider errors must be mapped to safe categories before logs, audits,
  responses, reports, screenshots, issue comments, or fixtures.
- URLs, hostnames, ports, queue IDs, worker IDs, and deployment data must be
  classified before display. Sensitive values are omitted or replaced with
  category/readiness state.
- Event payloads must be reduced to category, state, action, timing,
  channel, event-family, safe target, and result references.
- Money, security, OCR, storage, auth/session, payment, and hidden bill fields
  require explicit allow-listing before any readout, audit metadata, fixture, or
  report can include them.
- Admin readouts still do not reveal secrets, raw diagnostics, raw provider
  errors, raw provider payloads, raw tokens, protected token blobs, private
  hostnames where sensitive, raw OCR/storage/payment/auth data, or hidden
  business details.
- Debug mode must use the same default redaction. A future local-only
  diagnostic gate may allow additional data only after a separate explicit
  security review and must not affect ordinary Docker/TrueNAS logs or reports.

Redaction should happen before data is persisted into audit records, external
delivery rows, log events, metrics, traces, test snapshots, and CI artifacts.
Downstream UI hiding is not enough.

## Authorization Expectations

Future implementation must preserve API/domain authority for notification
policy reads, policy mutation, provider-readiness interpretation, resolver
decisions, and audit emission.

- Admin/global policy mutation audit requires authenticated owner/admin
  authorization, manual/security approval, and exact mutation action categories.
- Admin/global policy read audit, where approved, requires owner/admin/operator
  authorization and must not reveal secrets or raw diagnostics.
- Current-user readout is limited to the authenticated actor's effective
  channel/event-family state and allowed preference-narrowing posture.
- Users cannot infer other recipients, hidden recipient lists, hidden groups,
  provider configuration, admin-only policy internals, private hostnames,
  hidden bill data, payment details, OCR data, storage internals, or unrelated
  user existence from readouts or denial responses.
- Admin/operator diagnostics require an approved admin exposure gate. Local
  generated-client availability, hidden UI controls, provider dashboards, or
  environment-variable displays do not grant diagnostic access.
- Failed authorization should be audited safely where appropriate, but denial
  categories must avoid leaking target existence or configuration state where
  that would be inappropriate.
- Policy audit does not replace source-domain audit. Money, settlement, bill,
  OCR, sync, storage, auth/session, and security source actions continue to
  emit their own bounded audit records where required.

## Audit Event Shape Candidates

Future audit event shape is conceptual only. It does not approve a table,
schema, EF entity, OpenAPI contract, or generated-client model.

Candidate fields:

- actor/user/admin opaque ID, where approved for the audit surface;
- action category, such as `policy_read`, `policy_updated`, or
  `policy_denied`;
- target policy ID or version if a later schema approves it;
- channel and event-family category;
- safe provider-readiness category;
- resolver decision category;
- timestamp;
- request correlation ID;
- redaction policy version;
- result category.

Raw payload storage is forbidden. Audit metadata must not store provider
payloads, request/response bodies, rendered external bodies, raw tokens,
protected token blobs, credentials, auth/session material, raw OCR/receipt text,
storage internals, payment details, proof contents, private notes, hidden bill
details, full recipient lists, or unrelated user data.

If a future mutation needs a diff, store either a bounded safe diff category or
redacted before/after policy version references. Do not store arbitrary JSON
submissions as audit metadata unless every field is validated and redacted
against this matrix before persistence.

## Future Test Coverage Plan

This packet defines future test coverage only. It does not add runtime tests in
this docs/security task.

Future implementation should add focused tests for:

- Unit tests for redaction helpers, including provider error mapping,
  host/URL classification, token fingerprint display, and category
  normalization.
- API tests for admin/global policy read audit events where read audit is
  approved.
- API tests for policy create/update/delete/restore or versioned mutation audit
  events after mutation runtime is approved.
- API tests proving forbidden fields are absent from admin readouts and
  current-user readouts.
- Provider-readiness tests proving secrets, tokens, protected token blobs,
  private hostnames where sensitive, raw provider errors, provider payloads,
  provider response bodies, and dashboard internals are absent.
- Resolver tests proving safe decision categories for admin policy blocks,
  security/privacy blocks, provider unconfigured/disabled/degraded/failing,
  rate limits, maintenance, user/group preference narrowing, token missing, and
  device unavailable states.
- Snapshot/golden tests for user-facing copy if mobile, user web, admin web, or
  notification detail UI implementation happens.
- Negative tests for raw OCR text, receipt text, receipt images, storage
  paths/object keys/bucket names/signed URLs, payment details, private notes,
  hidden bill/settlement details, auth/session tokens, cookies, CSRF secrets,
  password hashes, MFA/passkey/recovery material, and unrelated user data.
- Log/audit fixture tests proving stored audit metadata, application logs,
  metrics, traces, report snippets, issue-comment templates, and CI artifacts
  use only safe categories and redacted/opaque IDs.
- OpenAPI/generated-client contract tests when the public policy/readout
  contract exists, proving schema examples and generated clients do not expose
  forbidden fields or suggest editable secret/readout paths.
- Regression tests proving #371 notification-open/deep-link behavior remains
  unchanged by policy/readout/audit work.

Tests should fail closed. Adding a new field to policy, readiness, resolver,
diagnostic, or delivery-attempt responses should require an explicit assertion
that the field is allowed for that surface.

## Rollout And Self-Hosted Posture

Settleora remains self-hosted focused. Future audit/readout behavior must work
for local Docker and TrueNAS-style deployments where email and push providers
are absent.

- Self-hosted logs must be safe by default.
- Docker and TrueNAS logs must not include provider secrets, raw provider
  payloads, token material, private hostnames where sensitive, OCR/receipt
  content, storage internals, payment details, auth/session secrets, hidden bill
  data, or unrelated user data.
- Debug mode cannot dump secrets, raw provider payloads, raw tokens, protected
  token blobs, raw OCR/storage/payment/auth data, or hidden business details
  unless a future explicit local-only diagnostic gate approves a separate path.
- Provider unconfigured, disabled, degraded, failing, maintenance, and
  rate-limited states must use concise safe categories and must not create
  noisy secret-bearing logs.
- Missing external provider configuration is a readout category, not a fatal
  startup condition by itself when the product can still serve the supported
  in-app baseline.
- Provider-readiness warnings must not expose private deployment topology,
  admin-only diagnostics, provider dashboard exports, or real credential
  values.
- Hosted activation, provider secrets, public/admin exposure, and production
  audit plumbing remain separate manual/deployment/security gates.

## Future Implementation Split Recommendation

Recommended sequence:

1. Manual/security review of this coverage packet.
2. Redaction helper and normalization design/implementation if approved.
3. Audit event schema/API implementation after #684 schema/API gate and any
   required schema/OpenAPI/manual gates.
4. Provider readiness redaction tests after #686 readiness implementation.
5. UX/readout copy snapshots after #685-referenced UI surfaces exist.
6. Resolver audit hooks after #687 resolver wiring.
7. Final acceptance through #689.

Each future slice must state whether it changes runtime API, schema/migrations,
OpenAPI/generated clients, provider runtime, secrets/config, device-token
handling, admin UI, mobile UI, user web UI, deployment/env/CI, audit plumbing,
auth/session/security runtime, money/settlement/bill/OCR/storage/sync behavior,
or #371 behavior. Any such scope needs its own explicit gate and validation.

## Parent And Child Posture

#688 remains open after this coverage gate unless the close rule is clearly
satisfied after PR merge or a separate explicit deferral/acceptance decision is
made. This packet is implementation-readiness coverage, not runtime
implementation.

#635 remains open for future admin/global notification policy implementation.
#684 and #686 remain open unless their own close rules are separately
satisfied. #685 is closed after PR #693 and should not be reopened unless a
concrete reference regression is found. #687 and #689 remain future gates.

#403, #369, #368, and #634 remain open for broader notification/provider/event
coverage work. #371, #570, #575, #672, and #679 remain closed and must not be
reopened or redone by this coverage gate.

Runtime implementation remains blocked. This document should not be read as
Day 1 notification acceptance, production readiness, provider activation,
schema/API/OpenAPI approval, generated-client approval, admin exposure
approval, UI implementation approval, or secret/device-token handling approval.
