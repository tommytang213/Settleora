# Admin Global Notification Policy

## Purpose

This document is the docs/control readout for GitHub issue
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It defines the design-level admin/global notification policy model, policy
precedence, authorization and audit requirements, product-facing readout
behavior, and future implementation split plan.

This document does not implement runtime APIs, database schema, EF migrations,
OpenAPI contracts, generated clients, admin web UI, mobile UI, provider
sending, provider secrets, deployment configuration, auth/session/security
runtime, notification writers, money/settlement/bill calculation logic, OCR
runtime, storage/file-byte behavior, sync runtime, #371 notification-open
behavior, or issue closure.

## Current State

Settleora already has these notification foundations:

- In-app notifications are the reliable Day 1 baseline for supported events
  where the recipient is authorized and the event is eligible and safe.
- Email and mobile push are optional external attempts. They require an event
  that is eligible for the channel, product/admin policy that allows the
  channel, provider readiness, user preference, and privacy-safe content.
- SMS is not a Day 1 notification channel.
- Current user notification preferences exist only as a guarded preference
  persistence/readout foundation. They do not widen provider/admin policy.
- Provider-neutral delivery-state, worker/outbox, SMTP runtime foundation, push
  token lifecycle, and disabled/unconfigured push runtime foundations exist in
  separate slices, but they do not complete real provider activation,
  admin/global policy APIs, admin web readouts, hosted runtime activation, or
  Day 1 notification acceptance.
- #371 notification-open/deep-link scope is closed and must not be redone under
  #635 without a separate concrete regression or new route-family task.

Admin/global notification policy controls deployment or product-level channel
availability and event-family caps. User, group, thread, or device preferences
can narrow optional delivery only inside those caps. They cannot enable a
globally disabled channel, invent provider readiness, bypass content-safety
rules, authorize a recipient, or make external delivery successful.

No provider secret, SMTP credential, APNs key, FCM credential, raw device token,
provider payload, or realistic secret-like example belongs in this document,
issue comments, reports, logs, screenshots, API responses, OpenAPI examples,
generated clients, audit metadata, or UI copy.

## Policy Model

The future implementation should model policy as product/admin configuration,
not as provider secrets and not as user preferences. These fields are design
guidance only; they are not schema names, OpenAPI enum values, or generated
client contracts.

### Global Channel Enablement

Policy should define channel caps for:

- `in_app`: baseline channel for supported events; may be disabled only for
  unsupported event families or local-only/no-server contexts where server
  notifications do not exist.
- `email`: optional external channel. It can be globally disabled, event-family
  disabled, digest-only, immediate-capable, or sensitive-event blocked.
- `mobile_push`: optional external channel. It can be globally disabled,
  event-family disabled, immediate-capable, digest/deferred where sensible, or
  sensitive-event blocked.

Admin/global policy must not expose SMS as Day 1-capable. SMS readouts should
use `unsupported` or omit the channel entirely where the product surface is not
about unsupported future channels.

### Provider Readiness

Provider readiness is separate from policy enablement:

- `unsupported`: this deployment, platform, or event family cannot use the
  channel.
- `unconfigured`: the provider is supported in principle but required safe
  provider configuration is missing.
- `configured`: required non-secret readiness checks have a safe configured
  state.
- `invalid`: provider configuration exists but fails a future safe validation
  check.
- `disabled`: policy disables the provider or channel even if configuration
  exists.
- `limited`: provider is configured but only some event families, platforms,
  recipient classes, or timing modes are allowed.

Readouts may show bounded readiness categories such as `provider_unconfigured`
or `disabled_by_admin`. They must not show SMTP usernames/passwords, host values
that reveal private infrastructure, APNs/FCM credentials, raw device tokens,
provider request IDs where sensitive, provider payloads, raw failure bodies, or
provider dashboard internals.

### Per-Event-Family Caps

Policy should be able to cap event families or event classes:

- Bills, bill revisions, approvals, disputes, and item-claim/creator-review
  events.
- Settlements, payments, proof, residual review, disputes, and cancellation
  events.
- Recurring due-soon, generated-draft, and future recurring failure/skipped
  events.
- OCR needs-review and future OCR completed/failed events.
- Sync conflict, operation failed, retry-exhausted, and future resolution
  events.
- Auth/session/security events.
- Group, friend, comment, reminder, digest, and future administrative events.

Per-event-family policy may allow only `in_app`, allow external channels with
privacy-safe templates, make a family digest-eligible, require immediate
in-app, block external channels for sensitive events, or mark a family
unsupported until its source/runtime/target policy exists.

Policy must not add event constants, notification writers, schema constraints,
or OpenAPI values by itself. Future runtime slices may add those only when the
source event, safe target, and validation plan are approved.

### Security And Money-Critical Policy

Security-impactful and money-impactful notification classes need explicit
policy:

- `force_in_app`: keep in-app visibility where the recipient is authorized and
  the event is supported.
- `bypass_optional_mute`: allow bypass of ordinary group/thread/user mute only
  for explicitly required events.
- `bypass_quiet_hours`: allow immediate in-app and possibly external attempts
  only when the security/money policy explicitly requires it.
- `external_generic_only`: external channels may use only generic copy.
- `external_blocked`: external email/push are not allowed even if the provider
  and user preference allow them.

Required or security-impactful notifications should not be fully hidden by
ordinary user preference, group mute, digest mode, or quiet hours unless a
reviewed security policy explicitly permits a bounded suppression. External
email/push remain optional and must not reveal sensitive details.

### Quiet Hours And Digest Boundaries

Quiet-hours and digest policy may defer optional low/normal event classes. It
must not:

- batch or defer urgent, required, security-impactful, or money-critical events
  unless that event class is explicitly classified as safe to defer;
- convert a deferred external attempt into `sent`;
- hide the in-app baseline for supported required events;
- imply a provider job has been queued when the channel is merely deferred by
  policy.

Digest readouts should distinguish `digest_pending`, `quiet_hours_deferred`,
`muted`, `disabled`, `unsupported`, `unconfigured`, `queued`, `sent`, and
`failed`.

### Group Mute Boundaries

Group mute, thread mute, and group defaults can narrow optional group-scoped
delivery where policy allows. They must not:

- authorize a recipient;
- enable globally disabled email or push;
- suppress required direct affected-user events beyond explicit policy;
- hide a supported required in-app notification where the event is eligible and
  the recipient is authorized;
- expose group membership, hidden bill details, private notes, payment details,
  OCR text, storage internals, or security details in readouts.

### State Vocabulary

Future policy/readout should reuse the shared notification vocabulary:

| State | Meaning |
| --- | --- |
| `unsupported` | Channel or event category is not supported for this deployment, platform, event, or Day 1 scope. |
| `unconfigured` | Channel is supported in principle but provider, deployment, recipient, or device setup is missing. |
| `disabled` | Admin/global policy or user preference disables the channel. |
| `muted` | Group, thread, category, or user preference suppresses optional delivery where policy allows. |
| `deferred` | Delivery is delayed for quiet hours, digest, scheduling, or an approved deferral rule. |
| `queued` | An attempt has been accepted for later processing; success is not known. |
| `sent` | A provider accepted the outbound attempt. This is not proof the user saw it. |
| `failed` | A provider attempt failed or was rejected. |

Avoid `delivered` unless a future provider-specific design distinguishes
provider acceptance, mailbox/device delivery, app receipt, user visibility, and
user action.

### Operator-Facing Readout Fields

Future admin/operator readout may expose bounded fields such as:

- policy version or updated-at timestamp;
- whether a channel is allowed globally;
- whether a provider is supported, configured, invalid, disabled, or limited;
- allowed event families and sensitivity classes;
- immediate, digest, and quiet-hours capabilities;
- whether required/security/money event classes force in-app or bypass ordinary
  mute/digest;
- safe reason categories, such as `disabled_by_admin`,
  `provider_unconfigured`, `provider_invalid`, `unsupported_by_deployment`,
  `disabled_by_user`, `group_muted`, `quiet_hours_deferred`,
  `digest_pending`, `permission_denied`, `token_missing`,
  `suppressed_by_policy`, `queued`, `sent`, or `failed`;
- last safe readiness check timestamp and redacted result category where a
  future implementation supports it.

Readout must not expose SMTP secrets, APNs/FCM credentials, raw tokens, raw
provider payloads, rendered external message bodies, provider dashboard data,
auth/session details, raw OCR or receipt text, storage internals, payment
details, private notes, hidden bill details, or unauthorized recipient data.

## Precedence And Resolution Order

Future #635 implementation must preserve the approved notification defaults.
For each event, recipient, and channel, resolve in this order:

1. Event eligibility, source-domain ownership, recipient authorization, and
   content safety. The event must exist through an API/domain-owned source
   transition, the recipient must be authorized, and the payload/template must
   be privacy-safe for the channel.
2. Admin/global provider cap. Deployment/admin policy decides whether the
   channel, event family, timing mode, and sensitivity class are allowed at all.
3. Explicit security, required, or money-critical policy. Apply force-in-app,
   external-blocked, generic-external-only, mute bypass, quiet-hours bypass, or
   digest prohibition where explicitly approved.
4. User preference. User preference may narrow allowed channels, event
   categories, and timing only within admin/global caps and required-event
   policy.
5. Group mute or group/thread preference. Group-scoped settings may narrow
   optional group/thread delivery where policy allows; they cannot widen
   admin/global or user caps.
6. Quiet-hours and digest rules. Defer or batch only eligible optional events;
   preserve required/security/money behavior according to explicit policy.
7. Device, platform, and provider availability. Check verified email state,
   SMTP readiness, push permission, active token state, platform/provider
   support, stale/revoked token state, provider readiness, worker/outbox
   availability, and safe provider constraints.

The most restrictive privacy rule wins. The most protective security rule wins
for security-impactful events. In-app remains the Day 1 baseline where the
event is supported, eligible, authorized, and safe.

## Authorization And Audit

Admin/global policy read and update must be API-authoritative in future
implementation. Clients, admin UI, local config displays, generated-client
availability, provider dashboards, environment variables, and mobile state must
not become final authority for policy resolution.

Future policy reads should require an authenticated caller with the approved
admin/owner/operator role. Future policy mutations should require explicit
admin/owner authorization and should be manual/security-gated before
implementation.

Policy changes affecting any of these behaviors require audit:

- enabling or disabling email or push;
- changing event-family or sensitivity caps;
- changing required/security/money-critical force-in-app, bypass, or external
  eligibility behavior;
- changing quiet-hours/digest defaults that affect required classes;
- changing group-mute interaction rules;
- changing provider readiness interpretation;
- changing operator/admin readout visibility.

Audit metadata should include bounded safe fields:

- actor account/profile ID where approved;
- action and outcome;
- policy version before/after or safe diff category;
- affected channel and event family;
- bounded reason category;
- correlation/request ID;
- timestamp.

Audit must avoid SMTP secrets, provider credentials, raw device tokens,
provider payloads, rendered external message bodies, auth/session tokens,
session identifiers that act as credentials, MFA/passkey/recovery material,
raw OCR or receipt text, storage paths/object keys/bucket names/signed URLs,
payment details, proof contents, private notes, hidden bill details, and
unrelated user data.

Policy audit is not a substitute for source-domain audit. Money, settlement,
bill, OCR, sync, storage, auth/session, and security source actions continue to
emit their own bounded audit records where required.

## Readout Behavior

Admin, user, mobile, and web readouts must be product-facing. They should
explain what a person can rely on without exposing backend/provider internals.

Allowed posture:

- "In-app notifications are available for this event."
- "Email is unavailable because email is not configured for this deployment."
- "Push is unavailable because push is disabled by admin policy."
- "Push is unavailable on this device."
- "This event is shown in-app only because it may contain sensitive activity."
- "This notification is queued for an external attempt."
- "The provider accepted the outbound attempt." Use `sent`; do not say the user
  saw it.

Avoid backend/provider-debug phrasing in product readouts:

- no raw enum dumps as the only message;
- no SMTP command errors, provider stack traces, APNs/FCM payload bodies, raw
  device-token status, auth/session internals, API route names as product copy,
  storage paths, object keys, OCR text, payment/proof details, private notes, or
  hidden bill details.

Missing provider configuration must show an explicit unsupported or
unconfigured state. It must not be hidden as success, "delivered", or a generic
preference issue.

User preference readout may explain why a channel is unavailable, but it must
not expose secrets/provider internals. For example, "Email is off for this
deployment" is acceptable. "SMTP auth failed for user X with password Y" is
not.

Admin web exposure remains separately gated. This document defines what a
future readout should contain; it does not approve admin web runtime, public
admin exposure, reverse proxy exposure, deployment changes, or Figma output.

## Implementation Split Plan

Recommended future child tasks:

1. Policy model, schema, and API design.
   - Define persisted policy shape, authorization model, policy versioning,
     safe problem categories, read/update semantics, and audit plan.
   - Gates: manual admin/security gate, schema/migration gate, OpenAPI gate,
     audit gate.
2. Policy model/schema/API implementation.
   - Add only the approved runtime/API surface, tests, migrations, and service
     boundaries.
   - Gates: manual admin/security gate, schema/migration gate, OpenAPI and
     generated-client gate, API validation.
3. OpenAPI and generated-client update.
   - Add public contracts only after the API shape is approved.
   - Gates: explicit OpenAPI review, generated web/Dart regeneration,
     generated-client validation.
4. Admin/user readout UI reference.
   - Produce product-facing readout copy and screen/reference guidance for
     admin, user, mobile, or web surfaces before UI implementation.
   - Gates: Figma/reference gate, manual UX approval, no runtime exposure until
     approved.
5. Provider readiness integration.
   - Connect SMTP and push readiness categories to policy resolution without
     exposing secrets or claiming fake success.
   - Gates: provider/secrets/deployment gate, security gate, no real APNs/FCM
     or SMTP activation unless separately approved.
6. Runtime policy resolution wiring.
   - Apply admin/global caps before user preference, group mute, quiet-hours,
     digest, and provider capability.
   - Gates: security/money-critical bypass gate, #369 source-event gates where
     event families are incomplete, API tests, delivery-state tests.
7. Audit tests and redaction tests.
   - Prove policy read/update authorization, mutation audit, safe redaction, no
     provider secrets/tokens/payloads, no raw OCR/storage/payment/private-note
     leakage, and readout reason safety.
   - Gates: security/audit manual review.
8. Final #635 acceptance packet.
   - Verify exact source SHAs, changed files, local validation, GitHub CI, issue
     state, remaining gates, and close/keep-open posture.
   - Gates: PR/merge gate, manual review if admin/security/OpenAPI/UI exposure
     changed.

Manual-gated tasks include policy mutation, security/money-critical behavior,
provider readiness/secret-adjacent behavior, admin exposure, schema migrations,
OpenAPI/generated-client changes, and any hosted/deployment activation.

Figma-gated tasks include admin web readout, mobile/user readout, mobile push
permission/settings screens, and any new product UI.

Security-gated tasks include auth/session/security notification behavior,
required-event bypass rules, provider-token/provider-secret handling, audit
redaction, and admin/owner authorization.

OpenAPI-gated tasks include any API contract, generated client, readout API, or
admin policy API change.

## Non-Goals

This document does not authorize:

- runtime implementation;
- database schema, EF migrations, or policy persistence;
- OpenAPI contracts or generated clients;
- notification writer changes;
- provider sending, APNs, FCM, SMTP activation, provider dashboards, hosted
  runtime activation, or deployment/env changes;
- SMTP secrets, APNs keys, FCM credentials, service-account JSON, raw device
  tokens, signing files, certificates, `.env` files, or secret examples;
- mobile push permission UX or token-registration UI;
- admin web implementation, admin web exposure, public/admin exposure, reverse
  proxy/TLS exposure, or deployment changes;
- auth/session/security runtime changes;
- money, settlement, payment, bill calculation, storage/file-byte, OCR,
  import/export/restore, or sync behavior changes;
- #371 notification-open/deep-link changes;
- closing or reopening #368, #369, #403, #634, #371, #570, #575, #672, or
  #679;
- Figma API output, binary design assets, screenshots, Docker, CI, signing,
  TestFlight, App Store metadata, runtime theme defaults, theme picker, or theme
  persistence.

## Readiness Conclusion

#635 is more implementation-ready after this control readout because the policy
model, precedence rules, authorization/audit requirements, readout behavior,
and split plan are explicit.

#635 should remain open. Implementation remains blocked until the relevant
manual admin/security, schema/migration, OpenAPI/generated-client, provider,
audit, and UI/Figma gates are cleared in future child tasks.

#368, #369, #403, and #634 remain open. #371, #570, #575, #672, and #679 remain
closed and should not be redone under #635.
