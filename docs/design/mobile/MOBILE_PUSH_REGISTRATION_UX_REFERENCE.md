# Mobile Push Registration UX Reference

## Status

This is the #634 mobile push registration UX/readiness reference gate. It is a
docs/control and design-reference handoff only.

It does not approve Flutter implementation, Figma output, APNs/FCM SDKs,
provider credentials, Firebase dependency, signing/provisioning changes,
OpenAPI or generated-client changes, schema changes, hosted activation, #371
deep links, #635 admin/global readout, or real provider sending.

Future UI should visually follow the approved mobile shell, More/Settings, and
Notifications references:

- [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md)
- [Mobile More and Settings reference V1](MOBILE_MORE_SETTINGS_REFERENCE_V1.md)
- [Mobile Notifications reference V1](MOBILE_NOTIFICATIONS_REFERENCE_V1.md)
- [Mobile Auth Security reference V1](MOBILE_AUTH_SECURITY_REFERENCE_V1.md)
- [Mobile implementation guardrails V1](MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md)

No approved exact push-registration screen exists yet. Any future screen must
use the references above and receive a separate Figma/reference review before
Flutter implementation.

## Permission Timing

The app must not request OS push permission on first launch just because the
platform can show a prompt.

Ask only after all of these are true:

- the app is in authenticated server mode;
- the current session is valid enough to call current-user APIs;
- the user has clear intent, such as enabling push in notification settings or
  entering a notification-related flow;
- the app has shown a product-facing explanation of what push can and cannot do;
- unsupported, disabled, and unconfigured states are understandable before the
  OS prompt appears.

Local-only mode must not imply server push. It may show that in-app/local
notification behavior is separate from server push and that server push requires
server mode, authenticated context, provider readiness, and OS permission.

If the server says push is disabled or the provider is unconfigured, the UI
should show that state and not ask for OS permission yet. If the platform is
unsupported, the UI should explain that push is unavailable on this device.

## Token Registration And Revocation UX

When future Flutter work exists, token registration must use only the
authenticated current-user push-device APIs already created by #634 A2:

- `PUT /api/v1/me/push-devices/current-token`
- `DELETE /api/v1/me/push-devices/current-token`
- `DELETE /api/v1/me/push-devices/current-session`

Mobile must not create new OpenAPI paths, hand-edit generated clients, or submit
user/account/profile/session IDs as authority. The server derives ownership from
the authenticated session.

Expected behavior:

| Situation | Expected mobile behavior |
| --- | --- |
| Sign in | Do not request OS permission automatically. If user preference/intention and readiness allow push, register the current provider token after permission/token retrieval succeeds. |
| Sign out | Revoke the current token while the authenticated session is still usable, then clear local registration intent. If the session is already invalid, clear local intent and let server stale cleanup handle any old token. |
| Account switch | Revoke the old current token where possible before binding any new token to the new authenticated account. Never silently reuse one token across unrelated users. |
| Session change or session revocation | Re-register only after the new authenticated server session is established and user intent still allows push. Revoke current-session tokens where possible on current-session logout. |
| Reinstall | Treat as a new app install identity. Re-register only after authenticated server mode, user intent, permission, and provider token retrieval. |
| Token rotation | Replace the current provider token idempotently through the current-user registration API. Do not expose old or new token values in UI, logs, or reports. |
| Permission denial | Record/display denied state locally and avoid registration. Offer a route to OS settings only where platform behavior supports it. |
| Permission revocation | Stop treating the device as push-ready and revoke the current token when authenticated context is available. |
| App uninstall | Do not assume the app can notify the server. Server stale cleanup and future provider feedback must handle uncertainty. |

Failure messaging must be product-facing and generic:

- Backend push is disabled: "Push notifications are off for this server."
- Provider unconfigured: "Push notifications need server setup before this
  device can be registered."
- Provider readiness unavailable: "Push notifications are not available right
  now. In-app notifications still work."
- Sign-in/session required: "Sign in to a server account to use push
  notifications."

## Settings And Readout States

Future settings/readout UI must cover these states without fake success:

| State | Product meaning | Primary action |
| --- | --- | --- |
| Unsupported device/platform | This device or platform cannot use Settleora push. | None, or explain supported platforms. |
| Local-only mode | Server push is unavailable because this profile is local-only. | Switch/connect to server mode where safe and supported. |
| Server mode, push disabled | The server/operator has disabled push. | No user enable action; show in-app baseline. |
| Provider unconfigured | Push is supported in principle, but APNs/FCM/provider setup is missing. | No OS prompt; show setup-required state. |
| Permission not requested | The app has not asked the OS yet. | Let the user enable push intentionally. |
| Permission denied | OS/user settings block push. | Open OS settings where supported. |
| Permission granted, token not registered | OS permission exists but server registration is missing, failed, or stale. | Retry registration after authenticated readiness checks. |
| Token registered | Current device token is active for this authenticated server context. | Allow turning off push/revoking current device. |
| Delivery unavailable or retrying | External push attempt cannot be confirmed or is retrying. | Keep in-app notification as source of truth; show retry/unavailable copy. |
| Sign-in/session required | The app lacks authenticated server context. | Sign in. |
| Admin/operator setup required | Setup belongs to the self-hosted operator/admin, not the current mobile user. | Explain setup is required without exposing dashboard values. |

Provider `accepted` means only that a provider accepted an outbound attempt. It
is not user-visible `delivered`, and the UI must not call it delivered.

## Privacy-Safe Copy And Payload Posture

Push notification copy must stay generic. Acceptable examples:

- "A bill needs review."
- "A settlement update is available."
- "Open Settleora to view this notification."

Push copy, payloads, UI readouts, tests, screenshots, reports, and issue
comments must not include:

- money values;
- receipt/OCR text;
- payment or proof details;
- hidden bill details;
- notes or comments;
- private profile identifiers;
- raw provider tokens;
- protected token blobs;
- token fingerprints;
- provider payloads or provider request/response bodies;
- credentials, dashboard values, certificates, service-account JSON, or `.env`
  values;
- storage internals, file paths, object keys, signed URLs, or file bytes;
- route/deep-link payloads that authorize or reveal private content.

Opening a push must re-fetch notification details and linked bill, settlement,
OCR, sync, recurring, group, or security resources through normal authorized API
paths. Token possession, push permission, and provider send state are not
authorization.

## Provider And Dependency Posture

Firebase is not approved as a required Settleora product dependency by this
reference. Tommy must explicitly approve Firebase later before any task assumes
Firebase/FCM as a required product dependency.

This reference does not decide APNs or FCM implementation. Future options are:

- direct APNs plus direct FCM adapters behind the existing provider-neutral
  boundary;
- FCM for Android and iOS where compatible, with APNs linkage for iOS, only if
  Firebase is explicitly approved;
- continued deferral of real provider support until mobile signing,
  registration, and operator setup are ready.

Real provider adapters, provider credentials, provider accounts, dashboard
values, hosted activation, Docker/env/deployment changes, and production sender
behavior remain outside this task.

## Mobile Identity And Signing Readiness Checklist

Record only non-secret decisions before Flutter real-token work:

- iOS bundle ID. Current Codemagic/TestFlight docs use
  `com.tommytang213.settleora`; confirm whether that is final or only current
  internal-TestFlight posture.
- Android package name.
- Dev/staging/prod app identity and provider environment split.
- Apple Developer and App Store Connect readiness.
- Push capability and provisioning expectations.
- Codemagic/TestFlight path and Android signing path.
- Firebase project/app ownership only if Firebase is later approved.
- Real-device/manual validation expectations, including OS version, app build,
  server mode, permission state, token registration, revocation, and fallback
  behavior.

Do not record dashboard values, sensitive key IDs, sensitive team IDs,
certificates, signing files, service-account JSON, `.env` values, APNs keys,
Firebase config secrets, realistic provider tokens, or raw provider responses.

## Figma/Reference Handoff Prompt

Use this prompt for a future Figma/reference task if Tommy wants an exact screen
before Flutter implementation:

```text
Create a Settleora mobile push notification registration/settings reference
that follows the approved Home / Bills / Groups / Settle / More shell, More and
Settings V1, Notifications V1, and Auth Security V1 dark mobile direction.

Design a notification settings/readiness flow for authenticated server mode.
Do not prompt on first launch. Show push as optional and explain that in-app
notifications remain available. Include states for unsupported platform,
local-only mode, server push disabled, provider unconfigured, permission not
requested, permission denied, permission granted but not registered, token
registered, delivery unavailable/retrying, sign-in required, and admin/operator
setup required.

Keep copy privacy-safe and generic. Do not show money values, receipt/OCR text,
payment/proof details, notes/comments, hidden bill details, private IDs, raw
tokens, fingerprints, provider payloads, credentials, dashboard values, storage
internals, or route/deep-link payloads. Show that notification opens re-fetch
details through the app after authorization.
```

Do not claim pixel-perfect or approved Figma output until actual approved
screenshots/frames are added to this folder.

## Next Implementation Gates

Possible next tasks remain separate:

- Mobile UX/Figma prompt/review for exact push-registration screens.
- Flutter token registration implementation only after identity, signing,
  provider direction, and readiness are approved.
- Backend provider adapter work only after provider direction is approved.
- #635 admin/global policy/readout first if operator governance must precede
  external send.
- #369 event-family acceptance first if notification completeness should
  precede external push transport.

#634 stays open/Blocked after this reference. This document is a gate, not a
completion claim for real mobile push delivery.
