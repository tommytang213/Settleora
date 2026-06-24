# Push Provider Device Token Lifecycle

## Purpose

This document defines Settleora's Day 1 mobile push provider abstraction and
device-token lifecycle policy. It is a documentation/control plan for how mobile
push can become an optional notification channel without leaking device tokens,
pretending unavailable delivery succeeded, or tying product notification events
directly to one provider SDK.

It complements [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md)
and [SMTP email provider policy](SMTP_EMAIL_PROVIDER_POLICY.md). The taxonomy
defines event families, safe payload shape, shared delivery states, in-app
baseline behavior, preference resolution, and validation. The SMTP policy covers
the email provider slice. This document covers the mobile push provider and
device-token lifecycle slice.

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

This document prepares #450 only.

- #403 remains the broad notification parent.
- #449 is already closed for the SMTP email provider policy slice; this push
  slice complements it without mutating #449.
- #451 notification preference resolution remains separate.
- #452 notification UI/reference work remains Stream A/UI gated and requires
  Figma/reference review.

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
