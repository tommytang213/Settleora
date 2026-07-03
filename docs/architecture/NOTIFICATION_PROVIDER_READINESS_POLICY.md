# Notification Provider Readiness Policy

## Purpose

This document is the docs/design policy gate for GitHub issue
[#686](https://github.com/tommytang213/Settleora/issues/686),
`Notification provider readiness integration policy`, under parent
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It defines how bounded provider-readiness signals should feed future
admin/global notification policy without exposing secrets, widening delivery
policy, or inventing delivery success.

This document is non-authorizing. It does not implement or approve SMTP, APNs,
or FCM runtime sending; provider SDKs; provider credentials; secrets;
device-token handling; CI, deployment, Docker, hosted activation, mobile
release, signing, TestFlight, or App Store changes; API runtime behavior;
database schema; EF migrations; OpenAPI contracts; generated clients; admin
web UI; mobile UI; notification constants or writers; auth/session/security
runtime; money, settlement, payment, bill, OCR, storage, or sync behavior; or
[#371](https://github.com/tommytang213/Settleora/issues/371) notification-open
behavior.

Provider readiness is a bounded input into policy resolution. It is not proof
that a message was sent, delivered, displayed, read, or acted on.

## Design Inputs

This policy builds on:

- [Admin global notification policy](ADMIN_GLOBAL_NOTIFICATION_POLICY.md).
- [Admin notification policy schema and API design](ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md).
- [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md).
- [Notification preference resolution model](NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md).
- [Notification delivery-state worker foundation](NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md).
- [SMTP email provider policy](SMTP_EMAIL_PROVIDER_POLICY.md).
- [Push provider device-token lifecycle](PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md).
- [Push token protection design](PUSH_TOKEN_PROTECTION_DESIGN.md).
- [Auth/session/security notification source policy](AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md).
- [Sync notification source policy](SYNC_NOTIFICATION_SOURCE_POLICY.md).

In-app remains the Day 1 baseline where the event is supported, eligible,
authorized, and safe. Email and mobile push are optional external attempts only
when policy, provider readiness, content safety, recipient/device state, and
user preference all allow them. SMS remains unsupported for Day 1.

## Provider Readiness State Model

The names below are design-level policy vocabulary only. They are not approved
EF enum values, OpenAPI schema values, generated-client contracts, provider
adapter return types, or database constraints.

| State | Meaning | External attempt posture |
| --- | --- | --- |
| `unsupported` | The channel, provider, deployment mode, platform, event family, or Day 1 scope does not support this provider path. | Block. Readout only. |
| `disabled` | Admin/global policy, deployment policy, or operator posture disables the provider or channel even if configuration exists. | Block. Readout only. |
| `unconfigured` | The provider is supported in principle, but required safe provider/deployment configuration is missing. | Block. Readout only. |
| `configured` | Required non-secret configuration appears present, but readiness has not established that attempts should proceed now. | Block or readout-only until promoted by the resolver to `ready` or a separately approved implementation maps it safely. |
| `degraded` | Provider is configured but has reduced capability, partial outage, elevated failures, limited platforms, or reduced event/timing support. | Allow only if policy explicitly permits degraded attempts for that channel/event; otherwise defer or readout-only. |
| `failing` | Recent readiness checks or provider feedback indicate attempts are failing or likely to fail. | Block or defer. Do not create new external attempts without a new approved retry/recovery decision. |
| `rate_limited` | Provider or deployment rate policy currently prevents immediate attempts. | Defer or block according to retry/expiry policy. Do not report as sent. |
| `maintenance` | Operator, deployment, or provider maintenance intentionally pauses attempts. | Defer or readout-only. Do not report as sent. |
| `unknown` | The provider state cannot be safely established. | Fail closed: block or readout-only. |
| `ready` | Required safe readiness checks pass and policy allows this provider path for the channel/event/timing class. | May allow an external attempt after all other resolver gates pass. This is still not delivery success. |

Only `ready` permits a normal external attempt by default. `degraded` and
`rate_limited` may permit bounded future attempts only when a later
implementation defines retry, expiry, and user/admin readout behavior safely.
`configured` is not enough by itself to claim an attempt is allowed; it means
configuration exists, not that the provider is available or policy-authorized.

### Channel Examples

SMTP/email:

- `unsupported`: the install has no supported email provider path.
- `disabled`: admin/global policy disables email.
- `unconfigured`: SMTP-required values are missing.
- `configured`: required non-secret SMTP configuration appears present.
- `degraded`, `failing`, `rate_limited`, or `maintenance`: safe readiness or
  future feedback categories indicate reduced or unavailable email attempts.
- `ready`: SMTP is configured and approved by policy for a bounded attempt.

APNs for iOS push:

- `unsupported`: iOS push is not supported for the deployment, app build, or
  current platform.
- `disabled`: admin/global policy disables mobile push or iOS push.
- `unconfigured`: APNs provider setup is absent.
- `configured`: APNs configuration appears present without exposing keys,
  certificates, team IDs where sensitive, or dashboard values.
- `ready`: APNs path may be attempted only after provider readiness, policy,
  token/device, and content gates pass.

FCM for Android push:

- `unsupported`: Android push is not supported for this deployment or app
  build.
- `disabled`: admin/global policy disables mobile push or Android push.
- `unconfigured`: FCM provider setup is absent.
- `configured`: FCM configuration appears present without exposing service
  account JSON, sender IDs where sensitive, server keys, project secrets, or
  dashboard values.
- `ready`: FCM path may be attempted only after provider readiness, policy,
  token/device, and content gates pass.

In-app baseline:

- In-app is not an external provider-readiness state.
- In-app availability still depends on event support, source eligibility,
  recipient authorization, privacy-safe payloads, and implemented in-app
  runtime.
- SMTP/APNs/FCM readiness must never hide, weaken, or replace the supported
  in-app baseline.

## Source-Of-Truth Boundaries

The API/domain layer owns effective notification policy resolution. Clients,
generated clients, browser/mobile caches, provider dashboards, deployment
files, environment-variable displays, and user preferences are inputs or
readouts only. They are not final authority.

Provider readiness must obey these boundaries:

- Provider config and secrets are never exposed through policy readout.
- Deployment/operator configuration may determine whether a provider is
  `configured`, `unconfigured`, `disabled`, or in `maintenance`, but readouts
  must not leak values.
- User preferences cannot invent provider readiness or turn an external
  channel from blocked into ready.
- Group mute, group defaults, and quiet-hours settings can narrow or defer
  optional delivery, but cannot make a provider ready.
- Device state can narrow push delivery for a recipient path, such as missing
  token, denied permission, stale token, revoked token, wrong platform, or app
  environment mismatch. It cannot make APNs or FCM globally ready.
- Generated-client availability, browser cache availability, mobile local
  cache, local-only mode state, or a visible UI toggle does not authorize
  readiness or delivery.
- Provider readiness does not decide event existence, recipient authorization,
  money truth, storage access, OCR acceptance, sync acceptance, auth/session
  state, or audit truth.

Provider readiness readout may expose bounded categories and timestamps. It
must not expose SMTP hostnames where sensitive, SMTP usernames/passwords, app
passwords, APNs keys/certificates, FCM service-account JSON, provider
credentials, raw device tokens, protected token blobs, provider payloads, raw
provider errors, provider dashboard internals, rendered external message
bodies, payment details, OCR text, storage internals, auth/session data, or
hidden bill data.

## Interaction With Admin/Global Policy

Future #635 and #684 resolver work should insert provider readiness as an
early hard gate after admin/global channel caps and before preferences or
device narrowing.

For each event, recipient, and channel, resolve in this order:

1. Event support, eligibility, source-domain ownership, recipient
   authorization, and content safety.
2. Admin/global channel cap, event-family cap, timing cap, and sensitivity cap.
3. Provider readiness state.
4. Security/money required in-app or external redaction rule, including
   force-in-app, external blocked, or generic-external-only policy.
5. User preference.
6. Group mute, group default, or thread preference.
7. Quiet-hours, digest, deferral, and expiry rules.
8. Device and platform availability, including verified email state, OS push
   permission, active token state, stale/revoked token state, app environment,
   platform support, and worker/outbox availability.

The most restrictive privacy rule wins. The most protective security rule wins
for security-impactful events. In-app remains the Day 1 baseline where the
event is supported, eligible, authorized, and safe.

Provider readiness can only narrow or defer external attempts. It cannot:

- create notification events;
- authorize recipients;
- bypass admin/global caps;
- widen user or group preferences;
- override content safety;
- convert queued/deferred/blocked attempts into sent status;
- claim delivery success without a future provider result.

## Product-Facing Readout Behavior

Readout behavior is design guidance only; it is not UI implementation.

Readouts must distinguish:

- `unsupported`: channel or provider path is unavailable for Day 1,
  deployment, platform, or event family.
- `disabled`: admin/global or deployment policy turned the provider/channel
  off.
- `unconfigured`: required provider setup is missing.
- `degraded`: provider is available only in a reduced or risky state.
- `failing`: attempts are failing or likely to fail.
- `deferred`: policy, quiet hours, digest, rate limit, maintenance, or retry
  posture delays the attempt.
- `queued`: an approved attempt was accepted for later processing; success is
  unknown.
- `sent` or `attempted`: a future provider accepted or attempted the outbound
  request, depending on the exact future delivery-state vocabulary. This is
  not proof the user saw it.
- `failed`: a future provider attempt failed or was rejected.

Readouts must never imply successful delivery unless a future provider result
confirms the exact state being claimed. Avoid `delivered` unless a separate
provider-specific design distinguishes provider acceptance, mailbox/device
delivery, app receipt, user visibility, and user action.

Operator-facing readouts should be useful but non-secret. Examples of safe
readout categories include:

- `disabled_by_admin`;
- `unsupported_by_deployment`;
- `provider_unconfigured`;
- `provider_configured`;
- `provider_degraded`;
- `provider_failing`;
- `provider_rate_limited`;
- `provider_maintenance`;
- `provider_unknown`;
- `provider_ready`;
- `permission_denied`;
- `token_missing`;
- `token_stale`;
- `queued`;
- `sent`;
- `failed_transient`;
- `failed_permanent`.

User-facing readouts should explain unavailable external delivery without
blaming the user. Examples of safe posture:

- "Email is not available for this deployment."
- "Push notifications are not configured for this server."
- "Push is unavailable on this device; the in-app notification is still
  available."
- "External delivery is delayed; open Settleora to review the update."

Readouts must not show secrets, raw tokens, private hostnames where sensitive,
provider payloads, credentials, raw provider errors, payment details, OCR text,
storage internals, auth/session data, hidden bill data, full rendered external
message bodies, or provider dashboard diagnostics.

## Provider Failure And Retry Posture

This document defines future policy posture only. It does not define retry
implementation, workers, queues, schedulers, leases, provider SDK behavior, or
exact backoff formulas.

Future implementation should classify failures into audit-safe categories:

- transient provider failure, such as temporary network or provider
  unavailability;
- permanent provider failure, such as invalid recipient address, invalid
  device token, content rejected, or provider configuration invalid;
- rate limit or quota limit;
- invalid recipient or invalid device token;
- provider unavailable;
- provider maintenance;
- queued or deferred attempt not yet sent;
- expired attempt;
- cancelled attempt because eligibility, policy, readiness, or content safety
  changed.

Retry posture:

- Retry only transient or rate-limit categories within an approved retry,
  expiry, and idempotency policy.
- Do not retry `unsupported`, `disabled`, `unconfigured`, `maintenance`,
  `unknown`, `suppressed`, `cancelled`, `expired`, or permanent failures
  without a new API/domain decision.
- Recheck provider readiness, admin/global policy, recipient authorization,
  content safety, user preference, quiet-hours/digest status, and device state
  before sending a deferred or queued attempt whose context may have changed.
- Preserve idempotency so source retries, worker restarts, and provider retry
  paths cannot create duplicate sends.
- Readout should show queued/deferred/failed categories accurately without
  exposing raw provider diagnostics.

Audit/log categories must be bounded and redacted. They may include safe
reason categories and timestamps, but not credentials, tokens, payload bodies,
raw provider request/response bodies, storage data, OCR text, payment details,
auth/session material, private notes, hidden bill facts, or unrelated user data.

## Self-Hosted Deployment Posture

Settleora remains self-hosted focused. Provider readiness must support
TrueNAS/Docker-friendly operation without requiring external providers on
first startup.

Self-hosted defaults:

- External providers start as `disabled` or `unconfigured` until an operator
  intentionally configures them through a future approved deployment/secret
  gate.
- Missing SMTP, APNs, or FCM configuration must not cause startup failure by
  itself when the product can still serve in-app notifications.
- Provider services, databases, RabbitMQ, storage, dashboards, or admin
  surfaces must not be publicly exposed by provider-readiness design.
- Warnings/readouts should be product-facing and non-secret.
- Hosted activation, real provider secrets, SMTP credentials, APNs keys, FCM
  credentials, scheduler/worker activation, and public/admin exposure remain
  manual/deployment gates.

If a future provider-send implementation requires protection material,
provider credentials, queues, or workers, absence of those dependencies should
make the external channel unavailable or unconfigured without weakening the
in-app baseline. It should not silently mark email/push as sent.

## Future Implementation Split Recommendation

Recommended future ordering:

1. Provider readiness config/readout design acceptance.
2. Secret storage/config loading design if needed, separately gated.
3. SMTP readiness/readout adapter, no sending unless a separate gate approves
   SMTP runtime.
4. APNs/FCM readiness/readout adapter tied to #634, with no token handling
   unless the #634 token/provider gate approves it.
5. Policy resolver integration through #687.
6. Audit/redaction coverage through #688.
7. Final acceptance through #689.

Each implementation slice should state whether it changes schema, OpenAPI,
generated clients, API runtime, provider runtime, deployment/env, secrets,
workers, mobile UI, admin UI, or tests. Any such scope needs its own explicit
gate and validation.

## Future Test Plan

Future implementation should include focused tests for the changed surface:

- provider state mapping for `unsupported`, `disabled`, `unconfigured`,
  `configured`, `degraded`, `failing`, `rate_limited`, `maintenance`,
  `unknown`, and `ready`;
- unconfigured providers block external attempts;
- disabled admin/global cap wins even if provider configuration exists;
- user preference cannot widen provider readiness or admin/global policy;
- group mute and quiet-hours can narrow or defer but cannot make a provider
  ready;
- push device absence, denied permission, stale token, revoked token, and wrong
  platform narrow only the recipient/device path;
- generated-client, browser-cache, and mobile-cache availability are not
  readiness authority;
- secrets, credentials, raw tokens, protected token blobs, fingerprints where
  not explicitly approved, provider payloads, raw provider errors, OCR text,
  payment details, auth/session material, storage internals, and hidden bill
  data never appear in API responses, logs, audit payloads, test fixtures,
  snapshots, reports, or issue comments;
- provider failures are classified into safe categories;
- queued/deferred/failed/readout states do not claim sent or delivered status;
- in-app baseline remains available for eligible, supported, authorized, safe
  events when external providers are unavailable;
- #371 deep-link/open behavior remains unchanged.

## Parent And Child Posture

#686 should remain open after this design gate unless the close rule is clearly
satisfied after PR merge or a separate explicit deferral/acceptance decision is
made.

#635 remains open for future admin/global notification policy implementation.
#634 remains open for push/provider/device-token work. #403, #369, and #368
remain open for broader notification/provider/event-family work. Runtime
provider sending remains blocked. #371 remains closed and must not be reopened
or reworked by provider-readiness policy unless a separate concrete regression
or approved new route-family task exists.

This document should not be read as Day 1 notification acceptance, provider
activation, production readiness, hosted activation, admin UI readiness,
schema/API approval, OpenAPI approval, generated-client approval, secret
handling approval, or mobile release readiness.
