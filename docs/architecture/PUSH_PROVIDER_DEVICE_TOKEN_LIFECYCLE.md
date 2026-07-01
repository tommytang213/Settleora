# Push Provider Device Token Lifecycle

## Purpose

This document defines Settleora's Day 1 mobile push provider abstraction and
device-token lifecycle policy. It is a documentation/control plan for how mobile
push can become an optional notification channel without leaking device tokens,
pretending unavailable delivery succeeded, or tying product notification events
directly to one provider SDK.

It complements [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md),
[SMTP email provider policy](SMTP_EMAIL_PROVIDER_POLICY.md), and
[Push token protection design](PUSH_TOKEN_PROTECTION_DESIGN.md). The taxonomy
defines event families, safe payload shape, shared delivery states, in-app
baseline behavior, preference resolution, and validation. The SMTP policy covers
the email provider slice. This document covers the mobile push provider and
device-token lifecycle slice; the token-protection design narrows the
encryption/sealing, fingerprinting, redaction, read-path, backup/restore, and
future A2 implementation stop conditions.

This document does not authorize runtime push delivery, provider SDK/API
implementation, provider credential setup, database schema changes, migrations,
OpenAPI changes, generated-client changes, mobile release configuration,
entitlements, plist or Android manifest changes, background workers,
Docker/Compose/environment changes, deployment behavior, auth/session/security
runtime changes, storage/file-byte changes, money/settlement/payment/bill
calculation changes, OCR runtime changes, mobile or web/admin UI work, or
secrets.

## Channel Baseline

Day 1 notification channels remain:

- `in_app`: guaranteed baseline for supported events.
- `email`: optional SMTP attempt when deployment/provider readiness, admin
  policy, content safety, and user preference allow it.
- `mobile_push`: optional mobile push attempt when platform permission,
  provider configuration, admin policy, content safety, user preference, and a
  valid device token allow it.

Mobile push is not a replacement for in-app notifications. Missing, disabled,
unsupported, unconfigured, denied, stale, deferred, queued, or failed push state
must never hide the in-app notification for supported events. In-app remains the
reliable record the user can inspect after authorization recheck.

Product notification events are provider-neutral. Bill, settlement, recurring,
sync, security, OCR, group, friend, and comment event families must not embed
APNs, FCM, Expo, OneSignal, Firebase, or other provider-specific request shapes
in product event payloads. Provider-specific SDK/API details belong behind a
server/mobile integration boundary.

## Provider Abstraction Boundary

Future runtime work should keep these layers separate:

1. Product notification event creation and recipient derivation.
2. Channel and preference resolution.
3. Push delivery eligibility for a user/device/platform.
4. Provider-neutral push message construction.
5. Provider adapter request construction and response classification.
6. Device-token registration, revocation, and cleanup.

The product event layer owns event type, safe subject IDs, recipient profile IDs,
template keys, priority, and in-app visibility. The push channel layer decides
whether a generic push attempt may be queued. The provider adapter converts that
generic attempt into provider-specific calls only after policy, preference,
permission, token, and configuration checks pass.

Provider adapters must not own authorization, money, settlement state, OCR
acceptance, storage access, sync acceptance, or audit truth. They may report
provider acceptance, temporary failure, invalid token, rate limit, credential
failure, unavailable service, or equivalent redacted reason categories.

## Device Token Sensitivity

Device tokens are sensitive delivery material. Treat raw tokens like credentials
for storage, logging, issue handling, reports, diagnostics, and UI.

Forbidden locations for raw or realistic device tokens include:

- Repository files, fixtures, generated docs, generated clients, and snapshots.
- Issue comments, pull request bodies, review comments, and Codex reports.
- App UI copy, admin readouts, screenshots, and design references.
- Application logs, worker logs, request logs, traces, metrics, crash reports,
  and validation output.
- API responses other than a future write-only registration contract that
  accepts the token from the authenticated device.
- Audit metadata and notification delivery summaries.
- `.env` files, local Codex state, provider dashboard exports, and copied
  device diagnostics.

Bounded hashes or redacted fingerprints may be used where needed for duplicate
detection, support correlation, stale cleanup, or audit-safe summaries. Hashing
must be purpose-bound and must not become a public identifier that allows
tracking a device across users, deployments, or exports.

Examples should describe token shape without values or use obvious placeholders
such as `<mobile-push-device-token-placeholder>`. Do not invent realistic APNs,
FCM, Firebase, Expo, OneSignal, or vendor token examples.

## Registration Lifecycle

The mobile app should obtain an OS/provider push token only after the platform's
permission and capability flow allows it. Future implementation must not treat
app install, server sign-in, or generated-client availability as proof that push
permission or token registration exists.

When runtime registration exists, API-side registration must associate the
device token with authenticated context:

- Authenticated user/profile and accepted server session.
- Session or session-family context where policy needs session-linked
  revocation.
- Device installation identifier or safe device record where approved.
- Platform such as `ios`, `android`, or a future supported platform.
- Provider family such as `apns`, `fcm`, or another adapter key.
- App environment where needed, such as development versus production, without
  exposing provider credentials.
- Permission state and last confirmed token timestamp where safe.

Registration must be idempotent for token refresh and app reinstall cases. A
new token for the same authenticated device/platform should replace or
supersede the prior active token according to policy, without exposing either
raw value in responses, logs, or reports.

Registration must not create an account, extend a session, authorize a resource,
make a user online, prove possession of money/settlement state, or bypass the
normal API authorization checks required when a notification is opened.

## A1 API Contract Proposal

This section records the #634 A1 design proposal only. It is not an OpenAPI
change and does not authorize implementation. A future A2 server-side token
foundation must update `packages/contracts/openapi/settleora.v1.yaml`,
regenerate clients, and pass the OpenAPI/generated-client gate before any
runtime endpoint exists.

Proposed future endpoints should be current-user scoped under `/api/v1`, with
server-derived account/profile/session context:

| Operation | Proposed shape | Purpose |
| --- | --- | --- |
| Register or replace current device token | `PUT /api/v1/me/push-devices/current-token` | Write-only registration for the authenticated current app install/device. Creates or replaces the active token binding for the current user/profile/session/device/platform/provider tuple. |
| Revoke current device token | `DELETE /api/v1/me/push-devices/current-token` | Idempotently revokes the current app install/device token binding without exposing prior token value. |
| Revoke one current-account device binding | `DELETE /api/v1/me/push-devices/{pushDeviceId}` | Revokes one safe server-issued device binding owned by the authenticated account/profile where future device/session readout is approved. |
| Revoke current-session linked tokens | `DELETE /api/v1/me/push-devices/current-session` | Revokes active tokens linked to the current authenticated session where session-linked policy is enabled. |
| Revoke all current-account push tokens | `DELETE /api/v1/me/push-devices` | Account-scoped push opt-out/sign-out cleanup action that revokes all current user's active push tokens. This must not revoke auth sessions unless called by an auth/session policy flow that separately owns session revocation. |
| Optional safe status/readout | `GET /api/v1/me/push-devices` | Optional later readout of safe device metadata only, such as device ID, platform, provider, permission state, last seen, and revoked/stale state. It must never return token values, ciphertext, raw provider responses, provider credentials, payload internals, storage paths, payment details, OCR text, or private notification content. |

The registration request should be write-only for token material. A future
request shape may include:

- `platform`: `ios` or `android` for Day 1; `web` is not Day 1 unless a later
  task explicitly approves browser push.
- `provider`: provider key such as `apns` or `fcm`, or a provider-neutral
  adapter key if runtime remains disabled/unconfigured.
- `token`: raw provider token accepted only in the request body and handled
  behind the protected server boundary.
- `deviceInstallationId`: app-generated stable install identifier only if a
  later mobile/security review approves it; it must not be an advertising ID,
  hardware serial, IMEI, phone number, contact identifier, or cross-app tracker.
- `appInstanceId` or `clientInstanceId`: optional idempotency key for reinstall
  and token-refresh behavior where approved.
- `permissionState`: bounded OS permission state from this document.
- `appBuildEnvironment`: development, staging, or production where needed to
  avoid APNs/FCM environment mixups, without exposing provider credentials.
- `clientObservedAtUtc`: optional client timestamp for support/readout only;
  server receipt time remains authoritative for lifecycle state.

The registration response should return only safe metadata:

- Server-issued push device/token binding ID.
- Platform, provider, permission state, status, last seen, and whether the
  registration replaced a prior active binding.
- Redacted token fingerprint only if a future support/readout policy requires
  it; ordinary clients do not need it.

The registration response must not return the raw token, token ciphertext,
provider payload, provider request/response body, provider credentials, app
secret material, sender IDs where sensitive, private app identifiers, storage
internals, notification content, or hidden business data.

Contract behavior:

- Registration requires an authenticated `SettleoraSession` and binds to the
  current actor/profile/account and current session according to the auth model.
- Clients must not submit user IDs, profile IDs, account IDs, or session IDs as
  authority. Route/body identifiers are hints only where later contract shape
  explicitly allows them; the server derives ownership from the bearer session.
- Duplicate registration of the same token fingerprint for the same
  user/profile/device/platform/provider should be idempotent and update
  `lastSeenAtUtc`, permission state, app environment, and safe metadata.
- Registration of a new token for the same authenticated device/platform/provider
  should atomically supersede the prior active token for that device binding.
- Registration of the same token fingerprint under another user/profile/session
  must fail closed, revoke/supersede according to an explicit account-transfer
  policy, or require a new approved conflict flow. It must not silently link one
  token to multiple unrelated users.
- Revocation endpoints are idempotent: deleting an already revoked, missing, or
  stale current-device token returns safe success or a generic unavailable result
  without revealing whether a specific raw token ever existed.
- Stale cleanup is server-owned. A future internal cleanup job or provider
  feedback handler may mark tokens stale/revoked by last-seen age, app
  environment mismatch, account/session revocation, uninstall feedback, or
  invalid-token feedback. Clients may report permission denial or token refresh,
  but clients do not decide final cleanup authority.
- Rate limiting should apply per authenticated account/session/device and per
  source IP/request fingerprint. Registration should tolerate normal OS token
  refresh bursts but reject abuse, high-churn loops, and enumeration attempts.
- Error responses should use safe problem categories such as
  `authentication_required`, `push_unsupported`, `provider_unconfigured`,
  `platform_unsupported`, `permission_denied`, `token_invalid`,
  `token_conflict`, `rate_limited`, `session_not_eligible`, and
  `validation_failed`. Client-facing messages must not reveal raw token
  presence, account ownership, provider credentials, provider internals, or
  sensitive deployment values.

## A1 Token Data Model Proposal

This is a later schema proposal only. It does not create EF entities,
migrations, OpenAPI schemas, or generated clients.

Future token persistence should use a dedicated push device/token table or
equivalent protected store with fields equivalent to:

- `id`: server-generated push device/token binding ID.
- `userAccountId` and `userProfileId`: authenticated owner context derived from
  the current session.
- `authSessionId` or `sessionFamilyId`: nullable link to the session context
  used at registration, where session-linked revocation is approved.
- `deviceInstallationIdHash`: optional keyed hash of an approved app install
  identifier, not a raw device hardware identifier.
- `platform`: `ios` or `android` for Day 1; `web` reserved for future work.
- `provider`: `apns`, `fcm`, or a provider-neutral adapter key. A1 recommends
  provider-neutral-first data shape so A2 can store lifecycle state before any
  real APNs/FCM provider is enabled.
- `appBuildEnvironment`: development/staging/production where needed.
- `tokenFingerprint`: keyed HMAC or equivalent purpose-bound fingerprint for
  dedupe and audit-safe correlation.
- `tokenCiphertext` or protected token secret reference: encrypted/sealed token
  material available only to the approved server-side provider-send boundary.
- `tokenSecretVersion` and `tokenProtectionKeyId`: safe metadata for rotation
  of sealing keys, if used.
- `permissionState`: bounded OS permission state.
- `status`: active, revoked, superseded, stale, provider_invalid, or disabled.
- `lastSeenAtUtc`, `registeredAtUtc`, `updatedAtUtc`, `revokedAtUtc`,
  `supersededAtUtc`, and `staleMarkedAtUtc`.
- `failureCount`, `lastFailureAtUtc`, `lastProviderFeedbackCategory`, and
  `nextEligibleAttemptAtUtc`.
- `revokedReason` and `staleReason`: bounded reason categories only.
- `createdBySessionId` and `updatedBySessionId`: safe server-side correlation
  where audit policy approves it.

Recommended constraints:

- At most one active token per
  `(userProfileId, platform, provider, deviceInstallationIdHash,
  appBuildEnvironment)` where device installation identity is approved.
- Unique active `tokenFingerprint` within one deployment/provider environment.
- Idempotency key or request correlation uniqueness for accepted registration
  attempts where clients retry.
- Indexes for current user/profile active token lookup, session-linked
  revocation, stale cleanup, and provider feedback cleanup.

Retention and cleanup:

- Raw token material must not be stored in plaintext normal read paths.
- Revoked, superseded, invalid, or stale token records may be retained for a
  bounded support/audit window using only ciphertext/protected secret reference
  plus safe metadata; expired retention should delete or irreversibly destroy
  token secret material while preserving only audit-safe lifecycle summaries if
  policy requires them.
- Stale cleanup should be driven by last-seen age, provider invalid/not
  registered feedback, account/session revocation, app environment mismatch,
  repeated permanent failure, user opt-out, and admin/deployment disablement.
- No API, audit event, admin readout, log, metric, trace, issue comment, PR body,
  screenshot, report, or docs example should expose raw token values,
  ciphertext, provider payload internals, or provider diagnostic bodies.

## Token Protection And Redaction Policy

Future implementation must define the token protection mechanism before storing
any token material.

Minimum policy:

- Do not store push tokens in plaintext normal read paths.
- Use a keyed, purpose-bound fingerprint for dedupe, idempotency, cleanup, and
  audit-safe support correlation. Do not use a plain unsalted hash that can be
  compared across deployments or exports.
- If raw token material is needed to call APNs/FCM, keep it encrypted, sealed,
  or referenced through an approved secret/protected-storage boundary accessible
  only to the server-side provider-send path.
- Treat token ciphertext and secret references as sensitive. They must not be
  returned through API readouts, logs, audit metadata, reports, generated docs,
  or generated clients.
- Token registration must require an authenticated session and bind to the
  authenticated user/profile/session according to the repo auth model.
- Revocation must require authentication and must be scoped to current device,
  current session, current account/profile, or an explicitly reviewed
  auth/session policy action.
- Clients cannot decide authorization, source business state, or security state
  from token/device status. Opening a notification must always re-fetch through
  authorized API paths.
- Audit records may include safe lifecycle action, actor/profile/session
  correlation, platform/provider, status, reason category, and redacted
  fingerprint where strictly needed. Audit must not include raw tokens,
  ciphertext, provider payload internals, provider credentials, or raw provider
  diagnostic bodies.

## Revocation Lifecycle

Future runtime work must support explicit and inferred token revocation without
turning one device's state into an account-wide revocation unless account or
session policy says so.

Revocation triggers include:

- Current-device sign-out.
- Account-wide sign-out or session-family revocation where policy links tokens
  to the affected sessions.
- Per-session revocation when the token was registered under that session.
- Account disablement, user deletion/deactivation, or admin policy disablement.
- User notification preference opt-out for push.
- Group/thread mute or event-category policy suppressing optional delivery.
- OS permission denial or withdrawal.
- App uninstall or stale provider feedback such as invalid/not-registered token.
- Device replacement, app reinstall, token rotation, or provider token refresh.
- Provider environment change, app build environment change, or invalid
  configuration.

Revocation should mark or expire the affected token record and prevent future
push attempts to that token. It should not delete source in-app notifications,
business records, settlement state, audit records, file metadata, auth sessions,
or other devices' tokens unless the source policy explicitly requires broader
revocation.

## OS Permission States

Mobile permission and capability state must remain explicit. Use these policy
states unless a future platform-specific design maps them more narrowly:

| State | Meaning |
| --- | --- |
| `unknown` | The server or app has no reliable current permission state. |
| `not_requested` | The app has not asked the user or OS for push permission. |
| `denied` | The user or OS has denied push notifications. |
| `provisional` | The platform allows provisional, quiet, or limited notification delivery. |
| `limited` | The platform reports a constrained permission mode distinct from full grant. |
| `granted` | The platform reports push permission is granted. |
| `unavailable` | Push is unavailable on this device, OS, build, or install mode. |
| `unsupported` | Settleora does not support push for this platform or deployment mode. |

`provisional` and `limited` are distinct because platform semantics may differ.
A future implementation can collapse them for platforms that do not distinguish
the concepts, but it must not claim full `granted` behavior when the OS only
allows constrained delivery.

Permission state is not delivery success. A device can have permission granted
while provider configuration is missing, the token is stale, user preference
disables push, quiet hours defer delivery, or provider delivery fails.

## Provider Configuration States

Push provider configuration and readiness should remain explicit enough for
users, admins, audit, and validation to understand why a push was or was not
attempted.

| State | Meaning |
| --- | --- |
| `unsupported` | Push is not supported for this deployment, platform, event, provider, or Day 1 scope. |
| `unconfigured` | Push is supported in principle, but provider credentials, app IDs, bundle/package linkage, or required environment values are missing. |
| `disabled_by_admin` | Product/admin policy disables push for the deployment, event category, sensitivity level, or recipient class. |
| `invalid_config` | Configuration exists but fails safe validation, provider authentication, app environment, or capability checks. |
| `configured` | Required provider configuration is present and passes readiness checks. |
| `degraded` | Provider configuration is usable but experiencing partial outage, rate limiting, restricted platform support, or temporary capability limits. |
| `failed` | Provider configuration or provider calls failed and require operator review or retry policy handling. |

Public summaries may map these into the notification taxonomy's shared
`unsupported`, `unconfigured`, `disabled`, `queued`, `sent`, and `failed`
vocabulary. Admin-visible readouts may include the more specific categories
above only when they do not expose secrets, provider internals, raw device
tokens, private app identifiers, or sensitive deployment values.

## A1/A3 Provider And Runtime Posture

A1 recommends a provider-neutral-first contract and data model with no real
provider enabled by default. The current repository also includes the #634 A3
Option A provider-neutral push runtime foundation: an internal push sender
boundary, a disabled/unconfigured default provider, privacy-safe payload
builder, and integration with the existing notification delivery-attempt/outbox
processor. This A3 foundation is disabled by default and does not implement
APNs or FCM sending.

Rationale:

- Settleora has both iOS and Android mobile scope, so an eventual complete
  runtime likely needs APNs and FCM or an approved provider abstraction that can
  reach both platforms.
- Choosing FCM-only now would not cover native iOS/APNs requirements without a
  later contract correction.
- Enabling APNs + FCM now would require secrets, app identifiers, entitlements,
  provider accounts, mobile release/build configuration, hosted runtime
  activation, and validation gates that A1 does not approve.
- A provider-neutral-first shape lets A2 implement safe token lifecycle APIs
  while A3 separately decides whether provider adapters start with FCM, APNs,
  or both.

Provider/runtime policy:

- Runtime push sending remains disabled/unconfigured by default.
- `Notifications:MobilePush:Enabled` defaults to false. Missing push provider
  configuration does not block unrelated API startup or readiness.
- The built-in provider performs no network calls, carries no provider
  credentials, and returns a non-success `provider_unconfigured` outcome when
  reached.
- The outbox processor maps disabled, unconfigured, and no-active-token push
  results to existing non-success delivery-attempt states; it never marks a
  disabled/unconfigured push attempt as `sent` or `delivered`.
- No APNs, FCM, Firebase, Expo, OneSignal, provider dashboard value, signing
  key, certificate, team ID, sender ID, app secret, `.env` value, or credential
  belongs in repo files, issue comments, PR bodies, logs, reports, docs
  examples, screenshots, generated clients, or API responses.
- The payload boundary is provider-neutral first. Product notification events
  produce a safe generic push envelope; provider adapters translate only after
  policy, preference, provider readiness, token, permission, and content-safety
  checks pass.
- Provider feedback must be classified into safe categories only, such as
  `accepted`, `invalid_token`, `not_registered`, `expired_token`,
  `permission_denied`, `credential_invalid`, `rate_limited`,
  `provider_unavailable`, `payload_invalid`, `retryable_failure`, or
  `non_retryable_failure`.
- Missing configuration, disabled admin policy, denied OS permission, missing
  token, stale token, queued attempt, deferred quiet-hours/digest state,
  retryable provider failure, invalid credential, or unsupported platform must
  never be represented as successful push delivery.
- Hosted runtime activation remains a separate gate. A provider adapter in code
  is not approval to run a hosted worker, scheduler, queue consumer, production
  sender, or public/admin diagnostic endpoint.

## No-Fake-Success Rule

Missing, unsupported, disabled, unconfigured, invalid, permission-denied,
token-missing, stale, muted, quiet-hours-deferred, digest-pending, queued, or
failed push state must never be represented as successful delivery.

Policy requirements:

- If provider readiness is missing, the push channel result is `unconfigured`
  or `unsupported`, not `sent`.
- If admin policy disables push, the result is `disabled_by_admin`, not
  skipped-with-success.
- If the user disables push, the result is user-preference-disabled, not sent.
- If OS permission is denied or unavailable, the result reflects the permission
  state, not provider success.
- If no active token exists for a device, the result is token-missing or
  unregistered, not sent.
- If quiet hours or digest policy delays push, the result is explicit deferred
  state, not immediate success.
- If a future provider accepts the outbound attempt, the channel state may be
  `sent`; this means provider acceptance, not proof the user saw it.
- If a future provider rejects a token as invalid or not registered, classify
  the token for cleanup and report a redacted failed/stale state, not success.
- In-app notification creation and read/archive state must not depend on push
  success.

Avoid `delivered` unless a future implementation has provider-specific delivery
receipt semantics and separate documentation distinguishes provider acceptance,
OS display, app receipt, user visibility, and user action.

## Privacy-Safe Push Payload Rules

Push notifications are external previews on lock screens, shared devices,
provider infrastructure, OS notification centers, and sometimes wearable
devices. They should carry the minimum action context needed to return the user
to Settleora.

Push payloads must not include:

- Hidden/private bill data, hidden participant shares, full source business
  records, or values the recipient is not authorized to re-fetch.
- Raw receipt text, full OCR text, itemized OCR lines, or OCR debug output.
- Receipt images, file bytes, filenames where sensitive, storage paths, object
  keys, bucket names, signed URLs, provider internals, or vault internals.
- Raw payment handles, bank details, QR contents, payment proof contents, full
  settlement proof text, or sensitive financial records.
- Full amounts, hidden participant shares, full bill item details, private
  comments, private notes, rejection reasons, or full participant lists unless a
  future reviewed template classifies a bounded value as safe for that event.
- Auth/session tokens, refresh credentials, reset tokens, recovery codes, MFA
  secrets, passkey material, provider credentials, device tokens, or secret
  configuration values.
- Full IP addresses, unbounded user-agent strings, abuse details, or unrelated
  user data.

Default push payload shape should use:

- Minimal title/body text, such as "A bill needs review" or "A settlement update
  is available".
- Stable notification ID or correlation ID that is safe for the recipient.
- Event type/template key and priority where needed.
- Relative app route or action key that requires authenticated re-fetch.

The app must fetch notification detail and linked business resources through
authorized API paths after the user opens the notification. Push payloads are
not authorization and are not source data.

## A3 Option A Implementation Checkpoint

The current repository includes the #634 A3 Option A provider-neutral push
delivery runtime foundation. It adds only internal API/domain code:

- provider-neutral `IPushNotificationSender` and `IPushNotificationProvider`
  boundaries;
- bounded push send request/result and provider feedback categories;
- disabled/unconfigured default provider with no network calls and no
  credentials;
- privacy-safe payload builder with generic Settleora copy and only opaque safe
  reference IDs;
- existing delivery-attempt/outbox integration for the `mobile_push` channel;
- active-token lookup and unprotect/decrypt of provider-usable token material
  only inside the internal push send boundary.

This checkpoint does not add public/admin readout, OpenAPI changes, generated
clients, schema migrations, mobile code, mobile OS permission UI, #371 deep
links, hosted scheduler/worker activation, APNs/FCM SDKs, provider credentials,
provider account setup, deployment/env changes, or real provider sending.

When disabled by default, push attempts complete as a truthful non-success
`disabled` result. If explicitly enabled without active push tokens, the runtime
returns a non-success no-active-token category mapped to `unconfigured` /
`device_availability_unconfigured`. If the disabled built-in provider is
reached, it returns `provider_unconfigured`. Future APNs/FCM adapters may report
provider acceptance, but provider acceptance remains distinct from user
delivery/read state.

## Mobile, Figma, And Deep-Link Posture

A1 separates server/API token lifecycle design from mobile UI and platform
integration.

- Mobile OS permission prompts, notification settings screens, background
  delivery behavior, entitlement/capability changes, Android manifest changes,
  iOS plist changes, signing/release configuration, and store/TestFlight
  behavior are not implemented or approved by this task.
- Mobile OS permission/settings UI requires Figma, screenshot, or design
  reference review before UI implementation.
- Token registration can be designed as an API contract before UI screens exist,
  but actual mobile app integration requires a separate mobile validation and
  release/build configuration gate.
- Mobile code must not register tokens solely because generated clients exist.
  The app must respect OS permission/capability state, user preference, admin
  policy, provider readiness, and authenticated session state.
- #371 notification deep links remain separate and Figma/reference-gated.
  Push payloads may carry only a safe relative action key or notification ID
  that later deep-link work can interpret after authentication and
  authorization re-fetch. A1 does not implement or approve deep links.

## Security And Money-Critical Rules

Security-critical and money-critical notifications may use push only as an
optional prompt. In-app visibility remains the baseline.

Push may be suppressed, degraded, delayed, or failed without changing:

- Authorization to view or mutate a linked resource.
- Financial truth, bill shares, settlement state, payment state, residual state,
  recurring generation state, or OCR apply state.
- Audit truth for the source business or security action.
- Session validity, session revocation, account status, or MFA/passkey state.
- Storage/file access or privacy-vault access.

Security/money-critical events may bypass ordinary mute, digest, or quiet-hours
rules only when a future explicit security policy says so and audit/docs explain
the behavior. This document records the boundary; it does not implement bypass
policy.

## Stale Token Cleanup And Provider Feedback

Future provider adapters should classify provider responses into policy-safe
categories before recording state or triggering cleanup.

Useful categories include:

- `accepted`: provider accepted the outbound attempt.
- `invalid_token`: token format or provider binding is invalid.
- `not_registered`: provider says the token is no longer registered.
- `expired_token`: token is expired or superseded.
- `permission_denied`: provider or OS state blocks delivery.
- `credential_invalid`: provider credential or app environment is invalid.
- `rate_limited`: provider rate or quota limit applies.
- `provider_unavailable`: provider outage or temporary unavailability.
- `payload_invalid`: payload exceeds provider or policy constraints.
- `retryable_failure`: bounded temporary failure eligible for backoff.
- `non_retryable_failure`: permanent failure not eligible for retry.

Invalid, not-registered, expired, or otherwise stale token feedback should mark
the token inactive for future attempts after policy confirms the feedback is
trustworthy. Retryable failures should use bounded retry/backoff and must not
loop indefinitely. Failure summaries should include redacted reason categories,
timestamps, provider family, event family, and safe correlation IDs only.

Provider feedback must not store raw tokens, raw provider responses containing
secrets, raw payloads, receipt/OCR text, file bytes, payment details, storage
internals, private comments, full financial records, or unrelated user data.

## Multi-Device Behavior

Device tokens are scoped to user/device/platform/provider context. A user may
have multiple active devices, and one device may refresh its token without
affecting another device.

Required policy behavior:

- Revocation of one device token does not revoke all devices unless the source
  account/session policy explicitly requires broader revocation.
- Account-wide sign-out, account disablement, or session-family revocation may
  revoke all linked tokens when that is the reviewed policy.
- User-level push opt-out suppresses push attempts for all of that user's
  devices where preference applies.
- Device-level permission denial or token invalidation suppresses only that
  device unless platform feedback proves a broader install/account condition.
- Provider/environment changes can invalidate only matching provider/platform
  tokens unless admin policy disables push globally.

Device display names, platform labels, and last-seen metadata are support
context only. They are not authorization, account identity, or financial truth.

## Preference And Policy Interaction

Push eligibility follows the notification taxonomy preference order:

1. Event eligibility and content safety.
2. Admin/deployment provider/channel cap.
3. Explicit security or money-critical bypass policy, if reviewed and enabled.
4. User channel/category preference.
5. Group or thread mute where policy allows.
6. Quiet-hours or digest scheduling.
7. Device/platform permission, token, and provider availability.

User preferences can narrow allowed channels and categories. They cannot enable
push when admin/deployment policy disables it, provider readiness is missing,
OS permission is denied, or no valid token exists. Group mute and quiet
hours/digest can suppress or defer optional push where policy allows.

#451 owns notification preference resolution, group mute, quiet hours/digest,
admin channel caps, and explicit security bypass behavior. Future push runtime
work must align with that policy instead of defining a separate preference
system.

## Release And Provider Setup Gates

Push provider setup and mobile release configuration remain manual-gated.

Manual gates include:

- APNs, FCM, Firebase, Expo, OneSignal, or other provider account setup.
- Provider credentials, signing keys, server keys, certificates, team IDs,
  bundle/package identifiers, app IDs, sender IDs, and project values.
- Mobile store signing, provisioning profiles, entitlements, capabilities,
  plist changes, Android manifest changes, package names, and release tracks.
- Codemagic, TestFlight, App Store, Play Store, production, public exposure,
  deployment, environment, and secret configuration changes.
- Any runtime issue that touches auth/session/security-critical behavior,
  OpenAPI/generated clients, schema/migrations, storage/file privacy, money,
  settlement, OCR, CI/deployment, or provider credentials.

No real or realistic provider credential, dashboard value, private hostname,
app password, device token, key ID, team ID, sender ID, or `.env` value belongs
in repository files, issue comments, PR bodies, screenshots, docs examples, or
Codex reports.

## A1 Implementation Split Recommendation

Do not implement #634 as one cross-domain branch. Keep #634 open and split
future work after this A1 design checkpoint.

Recommended future slices:

| Slice | Scope | Required gates |
| --- | --- | --- |
| A2 server-side token persistence/API foundation | Add the authenticated token register/revoke/rotate/stale-cleanup contract, additive schema, protected token storage or fingerprint-only metadata, safe lifecycle service, and generated clients. No provider sending. No mobile UI unless separately approved. | Schema/migration review, OpenAPI contract review, generated-client regeneration, auth/session/security review, [token protection design](PUSH_TOKEN_PROTECTION_DESIGN.md), docs/tests proving no raw token exposure. |
| A3 provider-neutral push delivery runtime | Completed as Option A disabled/unconfigured-by-default internal provider-neutral push sender over #629/#638/#641 foundations, safe payload rendering, provider feedback classification, no fake success, and no source business mutation. | Real APNs/FCM providers, secrets, hosted activation, mobile UI, admin/readout, and #371 deep links remain separate gates. |
| A4 mobile app registration/permission UX | Add mobile OS permission flow, token registration/revocation calls, safe local app install identifier if approved, user-facing settings/readout, and mobile validation. | Figma/reference, mobile platform permission review, iOS/Android build/release config gate, generated-client availability from A2, mobile validation, #371 separate approval if deep links enter scope. |

Do not create child issues from this document unless a future issue workflow
explicitly asks for them. The recommended split is architecture guidance for
planning #634 follow-up work.

## Completed And Remaining Gates

| Area | Status after A1 design PR | Notes |
| --- | --- | --- |
| #629 decision-envelope foundation | Completed before A1 | Provides provider-free channel decision input; does not implement push tokens or provider sending. |
| #638 delivery-attempt persistence/service foundation | Completed before A1 | Provides provider-neutral attempt persistence foundation; does not store device tokens. |
| #641 worker/outbox foundation | Completed before A1 | Provides provider-neutral outbox/lease foundation; no push provider adapter or hosted activation. |
| #633 delivery-state parent | Closed/Merged before A1 | Closed for persistence/worker foundation only, not provider runtime or push lifecycle. |
| #632 disabled-by-default SMTP runtime foundation | Completed before A1 | Email provider foundation only; does not complete push. |
| #634 A1 push token lifecycle architecture/contract design | This PR completes design only after merge | Answers API shape, data model, token protection, provider posture, payload privacy, mobile/Figma posture, deep-link separation, and future split. It does not implement runtime. |
| #634 A2 Option C push token protection design | Completed only after the protection design PR merges | Defines token classification, protected storage posture, key-management expectations, fingerprinting, read-path rules, redaction, backup/restore implications, provider boundary, future A2 stop conditions, and Option A/B implementation choices. It does not implement runtime. |
| Schema/OpenAPI/generated clients | Remaining gate | Required for A2; no OpenAPI, generated-client, EF schema, or migration changes are approved by A1. |
| Mobile/Figma | Remaining gate | Required for mobile permission/settings UI and actual app registration integration. |
| APNs/FCM secrets/provider accounts | Remaining gate | No secrets or real provider setup are approved. |
| Provider runtime/hosted activation | Partially complete / remaining gate | A3 Option A internal disabled/unconfigured runtime foundation is complete. Real provider adapters and hosted runtime activation remain separate and disabled/unconfigured by default until approved. |
| Admin/global readout and policy | Remaining gate | #635 remains separate for admin/global notification policy API/readout. |
| #371 notification deep links | Remaining gate | Remains separate and Figma/reference-gated. |
| Auth/security-sensitive behavior | Remaining gate | Token registration must use authenticated sessions, but auth/session/security runtime changes require their own review. |

## Audit And Logging Expectations

Push-related logs and audit should explain policy decisions without leaking
delivery material.

Allowed bounded fields include:

- Notification event family and event type.
- Stable notification ID, recipient profile ID, source subject ID, and safe
  correlation/request/job IDs.
- Channel state such as `unsupported`, `unconfigured`, `disabled_by_admin`,
  `permission_denied`, `token_missing`, `queued`, `sent`, or `failed`.
- Provider readiness category such as `configured`, `unconfigured`,
  `invalid_config`, `degraded`, or `failed`.
- Platform and provider family labels.
- Redacted token fingerprint where strictly needed for support or cleanup.
- Redacted provider reason category.
- Template key/version, not full rendered payload by default.
- Created, queued, attempted, classified, and stale-cleanup timestamps.
- Admin policy version or safe policy identifier where useful.

Forbidden fields include:

- Raw device tokens, provider credentials, app secrets, certificates, private
  keys, signing material, sender IDs where sensitive, and dashboard values.
- Raw provider requests or responses with secrets or raw payloads.
- Rendered push payloads where they include user data.
- Raw template variables, OCR text, file bytes, payment details, proof contents,
  bank/payment screenshots, storage internals, private notes/comments,
  reset/recovery codes, MFA/passkey material, session tokens, or unrelated user
  data.

Audit records for source business/security actions remain separate from
notification attempt logs. A push `sent` state is not proof that a bill,
settlement, OCR review, sync conflict, or security event was accepted,
resolved, paid, confirmed, reviewed, or acknowledged.

## Relationship To Follow-Ups

This document now records the #634 A1 push token lifecycle architecture and
contract design checkpoint plus the later A2 Option A server-side token
lifecycle API foundation. Earlier text prepared the original push provider
policy slice; the A2 foundation adds only authenticated token lifecycle
registration/revocation, protected token storage, internal fingerprints, and
safe lifecycle metadata. It still does not add provider sending/runtime,
APNs/FCM secrets, hosted activation, mobile permission UI, #371 deep links, or
admin/global notification policy readouts.

- #403 remains the broad notification parent.
- #629, #632, #633, #638, and #641 are completed foundations only.
- #635 admin/global notification policy API/readout remains separate.
- #369 and #368 remain open for remaining Day 1 notification event-family
  runtime/source-state work.
- #634 A2 Option A server-side token persistence/API foundation is implemented
  as a protected-storage lifecycle foundation only; provider sending remains
  separate.
- #371 notification deep links/mobile UI remains separate and
  Figma/reference-gated.

Future push runtime work must be a separate manually gated implementation slice
if it touches provider configuration, secrets, deployment/env files, mobile
release configuration, schema, OpenAPI/generated clients, workers,
auth/security behavior, admin/public exposure, UI, production operations, or
mobile app capabilities.

## Validation Expectations For Future Runtime

Future implementation slices should add focused validation proving:

- No raw device tokens, provider credentials, signing material, or realistic
  examples appear in repository files, responses, logs, audit metadata,
  snapshots, generated docs, generated clients, issue comments, or reports.
- Missing, disabled, unsupported, unconfigured, invalid, permission-denied,
  token-missing, deferred, queued, stale, and failed push states never appear as
  delivered push.
- User preference cannot enable push when admin/deployment policy disables it,
  provider readiness is missing, OS permission is denied, or no active token
  exists.
- Token registration requires authenticated context and records safe
  user/session/device/platform/provider association only where runtime scope
  intentionally adds such contracts.
- Sign-out, session revocation, account disablement, app uninstall/stale
  feedback, user opt-out, device replacement, and admin disablement revoke or
  suppress the correct token scope.
- Multi-device behavior preserves unaffected devices unless account/session
  policy requires broader revocation.
- Provider feedback classification handles invalid/not-registered tokens,
  retry/backoff, rate limits, invalid credentials, provider outages, and
  non-retryable failures with redacted summaries.
- Push payloads exclude raw OCR text, receipt contents, file bytes, storage
  internals, payment details, proof contents, private comments, full financial
  records, token material, and unrelated sensitive data.
- In-app notifications remain available for supported baseline events even when
  push is unavailable, denied, unconfigured, disabled, deferred, stale, or
  failed.
- Linked resources reauthorize on open.
- OpenAPI/generated-client validation runs only if a future issue intentionally
  introduces or changes contracts.
- Mobile validation runs only if a future issue changes mobile code,
  permissions, platform configuration, or mobile behavior.

Docs-only changes to this policy should run documentation validation. Runtime
push/provider changes require their own issue scope, manual gates, and the
validation class implied by the touched files.
