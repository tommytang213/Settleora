# Notification Preference Resolution Model

## Purpose

This document defines Settleora's Day 1 notification preference resolution
model. It controls how final notification delivery decisions are made when
event defaults, admin policy, user preferences, group preferences, channel
permissions, quiet hours, digest behavior, mute/snooze state, and
required/security-event rules conflict.

This is a documentation/control architecture model. It is not runtime
implementation.

## Current State

Current notification architecture after the event taxonomy, SMTP policy, and
push lifecycle slices includes:

- [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md), which defines
  event families, safe event envelopes, baseline in-app behavior, shared
  delivery vocabulary, privacy exclusions, audit expectations, and validation
  boundaries.
- [SMTP email provider policy](SMTP_EMAIL_PROVIDER_POLICY.md), which defines
  email provider configuration boundaries, secret handling, disabled and
  unconfigured states, privacy-safe templates, no-fake-success behavior, and
  audit/logging expectations.
- [Push provider device-token lifecycle](PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md),
  which defines mobile push provider abstraction, device-token sensitivity,
  permission/readiness states, stale-token cleanup, provider gates, and
  no-fake-success behavior.
- Current API runtime includes guarded current-user in-app notification
  list/summary/read/archive endpoints and guarded current-user notification
  preference get/update endpoints. The persisted Day 1 preference slice stores
  only the current user's in-app preference readout, optional bills,
  settlements, and recurring category preferences, required sync/security
  visibility, quiet-hours readout hours, and `immediate` versus
  `digest_readout` timing preference. Email sending, push sending, provider
  policy, group preferences/mute, server-side notification suppression or
  filtering, digest scheduling, reminder scheduling, provider workers,
  notification deep links/background delivery, and broader web/admin UI remain
  future work.

The current persisted preference runtime does not implement email sending, push
sending, digest workers, quiet-hours deferral workers, provider adapters,
device-token handling, group mute, admin/global notification policy APIs, or
worker delivery behavior.

## Authority Boundaries

API/domain services own authoritative notification recipient eligibility and
the final delivery decision. They decide whether a candidate recipient is
allowed to know that a notification exists and which channels may be attempted.

Clients may later display or edit preferences, cache local display state,
request mobile OS permissions, and render read/archive state. Clients must not
decide final authorization, final recipient eligibility, or final delivery.

Workers and provider adapters may deliver jobs approved by API/domain
boundaries. They must not independently decide who can receive a notification,
which business data a recipient may see, or whether a policy-suppressed
recipient should be restored.

Notification resolution must not bypass normal data authorization. A recipient
cannot receive details about a bill, settlement, group, receipt, OCR result,
security event, or payment record they are not authorized to see. Notification
visibility is not proof of resource authorization; opening a notification must
re-fetch linked resources through authorized API paths.

Admin policy must not expose private user data to other users. Admin-visible
policy and diagnostic summaries should use bounded identifiers and reason
categories, not private notification content or provider payloads.

Audit must avoid secrets, raw tokens, sensitive receipt contents, unnecessary
payment details, provider credentials, full provider payloads, and unrelated
private data.

## Concepts

- Notification event type: a versioned event from the notification taxonomy,
  such as bill review, settlement, recurring bill, sync, OCR, group/comment, or
  security/session/account activity.
- Channel: one of `in_app`, `email`, or `mobile_push`.
- Delivery timing: `immediate`, `digest`, `muted`, or `blocked`.
- Event severity or class: the event's policy class, such as low, normal,
  urgent, required, money-impactful, or security-impactful.
- Admin/global policy: deployment or product policy that caps allowed channels,
  required event classes, provider availability, digest eligibility, external
  channel eligibility, sensitive-event handling, and recipient classes.
- User notification preference: a recipient's channel, event-category,
  severity, digest, quiet-hours, mute, or snooze choice where user choice is
  allowed.
- Group-scoped notification preference: a group-level default, mute, digest, or
  category preference for group-scoped events where policy allows group
  preference to narrow optional delivery.
- Channel permission/capability: channel readiness for the recipient and
  deployment, such as verified email, SMTP provider enabled, push OS
  permission, active device token, provider readiness, and in-app availability.
- Quiet hours: a user or policy time window where optional immediate delivery is
  deferred or digested.
- Digest window: a configured batching window for eligible low/normal events.
- Mute/snooze: user, group, thread, category, or per-event temporary
  suppression where policy allows.
- Delivery fallback: safe replacement behavior when a selected channel is not
  available, such as retaining in-app visibility when external channels are
  disabled.
- Delivery state/read state boundary: preference resolution decides intended
  delivery or suppression; delivery state tracks execution outcome; read/archive
  state tracks user inbox interaction only.

## Resolution Order And Precedence

Notification resolution must be deterministic. For each event and each
candidate recipient, resolve in this order:

1. Validate the event contract and taxonomy defaults, including event type,
   owning source domain, safe subject IDs, default channels, default timing,
   severity/class, privacy-safe payload rules, and required/digest eligibility.
2. Resolve actor and candidate recipients through API/domain authorization and
   source business state. Remove recipients who are not authorized to know about
   the event.
3. Apply admin/global policy allowed channels and minimum-required event
   classes. Admin policy is the hard cap for provider availability, external
   channel eligibility, sensitive-event policy, and required event handling.
4. Apply event default channels, severity, timing, required flag, and digest
   eligibility from the taxonomy and source-domain policy.
5. Apply group preference only for group-scoped events. Group preference may
   narrow optional delivery where policy allows, but it must not authorize
   recipients or enable globally disabled channels.
6. Apply user preference. User preference may narrow or choose among allowed
   channels, categories, timing, and digest behavior where policy allows, but it
   must not enable a disabled provider/channel or suppress required events
   beyond policy.
7. Apply quiet hours, mute, snooze, digest mode, and per-thread controls where
   applicable. Optional events may be deferred, batched, muted, or blocked.
   Required/security-impactful events follow their explicit policy.
8. Check channel capability and permission: verified email, provider enabled,
   push provider configured, push OS permission, active device token, in-app
   availability, and any future channel-specific readiness state.
9. Apply fallback rules when a chosen channel is unavailable.
10. Produce a final decision envelope for each recipient/channel without
    leaking storage internals, token details, provider secrets, private payload
    data, or authorization-denied details.

Guiding rule:

```text
The most restrictive privacy rule wins. The most protective security rule wins for security-impactful events.
```

If two policies conflict, choose the result that reveals less private data and
provides stronger protection for security-impactful events. This may mean
keeping a generic in-app security notification while suppressing optional
external content.

## Required And Security-Impactful Event Behavior

Required or security-impactful events are events users or admins should not be
allowed to fully suppress when policy says the notification is necessary for
account safety, data safety, or required user action. They may still allow safe
channel choices where admin policy permits those choices.

Examples include:

- New device/session event.
- Password, MFA, passkey, recovery, or security setting change.
- Role, owner/admin, or notification admin-policy change.
- Settlement/payment security-impactful warning.
- Sync conflict or failure where user action is required.

Policy direction:

- Required/security-impactful events should retain in-app visibility where the
  recipient has an account/session surface and is authorized to receive the
  event.
- User mute, group mute, quiet hours, and digest mode should not fully hide
  required/security-impactful events unless an explicit security policy allows a
  bounded suppression.
- External channels for security events remain optional and privacy-safe. If
  email or push is unavailable or unsafe, do not attempt that channel.
- Security events may bypass ordinary mute/digest/quiet-hours only where policy
  explicitly says so and audit/docs explain the behavior.
- Notification behavior does not implement auth runtime, revoke sessions, change
  credentials, or prove security acknowledgement.

## Group Versus User Preference Behavior

Group-scoped preferences apply only to group-scoped events and only after
recipient authorization. They can narrow optional delivery for group-related
activity, but they do not decide group membership visibility or linked-resource
authorization.

User preferences apply after group preferences and may further narrow allowed
channels or timing. User preference cannot widen a group/admin cap, enable a
disabled provider, or authorize a recipient.

Examples:

- If a user mutes a group, optional group bill/comment/reminder events may be
  muted, digested, or reduced to in-app summary according to policy. Required
  approval, dispute, security, or directly affected-user events may still appear
  where policy requires them.
- If a group owner/admin configures group notification defaults, those defaults
  can shape group-scoped optional events for members where product policy allows
  group defaults. They cannot force a member to use email if the user disabled
  email or the deployment disabled email.
- If an event mentions or directly affects a specific user despite group mute,
  such as required bill approval, payer confirmation, dispute, or settlement
  action, the direct affected-user rule may keep in-app delivery and may bypass
  the group mute only as explicitly allowed by policy.
- If a user disables email but push is unavailable, do not attempt email and do
  not pretend push succeeded. Retain an in-app notification where the event is
  supported and the recipient is authorized.
- If admin policy disables the email provider globally, no user or group
  preference can enable email. Email decisions should record a disabled/admin or
  unavailable channel reason.
- Quiet hours defer normal optional events, but required/security-impactful
  events may remain immediate in-app or use allowed immediate external channels
  according to explicit security policy.
- Digest mode batches eligible low/normal events. It must not batch urgent,
  required, or security-impactful events unless policy explicitly classifies
  that event as safely digestible.

## Fallback Behavior

Fallback must preserve safety and explicit state. It must not turn unsupported
or blocked external delivery into silent success.

Safe fallback rules:

- `in_app` can be the baseline channel for server-mode notifications when the
  recipient is authorized and the event is supported.
- If email is disabled, unverified, unconfigured, unsupported, or unavailable,
  do not attempt email.
- If mobile push permission is denied, the provider is disabled/unconfigured, or
  a push token is revoked, expired, stale, missing, or unavailable, do not
  attempt push.
- If an event is required and preferred external channels are unavailable,
  retain in-app notification where appropriate.
- If all external channels are unavailable for an optional event, the decision
  may be in-app only, digest-only, muted, or blocked according to policy and
  preferences.
- Do not expose provider internals, raw failure details, raw device-token state,
  SMTP credentials, or private provider diagnostics through API responses.
- Use bounded reason categories such as `disabled_by_admin`,
  `disabled_by_user`, `provider_unconfigured`, `permission_denied`,
  `token_missing`, `quiet_hours_deferred`, `digest_pending`, or
  `suppressed_by_policy` where future runtime needs explainability.

## Delivery State Boundary

Preference resolution decides intended delivery for a recipient/channel. It
answers whether delivery is allowed, suppressed, deferred, batched, or
unavailable. Delivery state tracks execution outcome after a future queue,
worker, provider adapter, or in-app write attempts the intended delivery.

Possible future delivery-state categories include:

```text
queued
sent
delivered
failed
suppressed_by_policy
suppressed_by_preference
deferred_quiet_hours
batched_digest
channel_unavailable
```

These names are future direction only unless a later implementation slice
adopts them in schema/API contracts. Current taxonomy guidance still warns that
`delivered` should be avoided unless provider-specific delivery receipts are
defined and distinguished from provider acceptance and user visibility.

Read/archive state is separate. Marking an in-app notification read or archived
must not mutate source bills, settlements, OCR reviews, recurring templates,
sync operations, auth/session state, payment state, or audit truth.

## Decision Envelope

A final decision envelope should be safe to persist, audit, or hand to a worker
without exposing private internals. It should describe:

- Event type/family, safe template key/version, severity/class, and timing.
- Recipient profile ID and safe source subject IDs.
- Channel decision for `in_app`, `email`, and `mobile_push`.
- Reason category for allowed, suppressed, deferred, batched, or unavailable
  channel decisions.
- Policy/version identifiers where useful and safe.
- Correlation/job/request IDs where useful and safe.
- Safe payload reference or template variables that exclude raw sensitive
  content.

It must not include raw SMTP credentials, raw device tokens, provider secret
material, raw provider payloads, storage paths, object keys, signed URLs, file
bytes, raw OCR text, sensitive receipt contents, raw payment handles, sensitive
proof details, full financial records, auth/session tokens, recovery codes,
MFA/passkey secrets, private notes/comments, or unrelated user data.

## Audit Requirements

Audit should cover security-impactful and policy-impacting changes and
resolution outcomes where future runtime adds these features.

Audit-worthy events include:

- Admin/global notification policy changed.
- User notification preference changed.
- Group notification preference changed.
- Required/security notification suppressed by policy.
- Provider/channel disabled.
- Device token revoked or invalidated by server policy.
- Notification preference resolution denied due to authorization.

Allowed audit fields include bounded actor/subject IDs, notification event
family/type, policy identifier/version, channel, decision reason category,
recipient profile ID, safe source subject ID, correlation ID, and timestamps.

Audit must not include raw tokens, email secrets, SMTP credentials, provider
credentials, raw device tokens, raw receipt/OCR text, file bytes, storage
internals, sensitive payment details, settlement proof contents, full rendered
external payloads, raw template variables, private comments/notes, auth/session
tokens, recovery codes, MFA/passkey material, or full provider responses.

Source business/security audit remains separate from notification delivery
audit. A notification sent/read/deferred/suppressed state is not proof that a
bill was approved, settlement was paid, OCR was accepted, sync conflict was
resolved, or security event was acknowledged.

## Open Questions And Future Implementation Candidates

Future implementation candidates:

- Preference schema and API design.
- OpenAPI preference endpoints.
- Generated client refresh after reviewed contract changes.
- Admin/user preference UI, likely aligned with #452 or Stream A reference work.
- Delivery-state persistence.
- Notification worker/provider implementation.
- Digest scheduler and digest content policy.
- Quiet-hours timezone handling.
- Per-thread mute model.
- Provider-specific delivery receipt semantics, if needed.

These candidates require separate issue scope, validation, and manual gates
where they touch API behavior, OpenAPI/generated clients, schema/migrations,
auth/session/security runtime, storage/privacy, money/settlement/payment, UI,
deployment, environment, providers, workers, or secrets.

## Relationship To Follow-Ups

This document prepares #451 only.

- #403 remains the broad notification parent.
- #448 notification event taxonomy is the parent event and safe-envelope
  control.
- #449 SMTP email provider policy remains the email-provider slice.
- #450 push provider and device-token lifecycle remains the push/provider slice.
- #452 notification UI/reference work remains separate and must not be
  broadened by this model.

Future runtime preference resolution work must align with this model instead of
creating independent client, worker, email, or push-specific preference systems.

## Non-Goals

- No runtime API implementation.
- No schema or migration work.
- No OpenAPI or generated-client changes.
- No mobile, web, or admin UI.
- No provider implementation.
- No email or push sending.
- No worker behavior.
- No auth/session runtime work.
- No storage or file-byte changes.
- No money, settlement, payment, bill calculation, OCR, or reconciliation logic
  changes.
- No Docker, CI, deployment, environment, or secret changes.
- No edits to `docs/design/mobile/*`.

## Validation Expectations For Future Runtime

Future implementation slices should add focused validation proving:

- API/domain authorization derives candidate recipients before preferences.
- Admin/global policy caps all user and group preferences.
- User/group preferences cannot enable disabled channels or providers.
- Required/security-impactful events follow explicit suppression and bypass
  policy.
- Quiet-hours and digest behavior defer or batch only eligible events.
- Email and push capability checks prevent attempts when provider readiness,
  verified email, OS permission, or device-token state is missing.
- Fallback preserves in-app visibility where appropriate and never reports
  unavailable external delivery as success.
- Decision envelopes, audit rows, logs, provider attempts, and API responses
  exclude tokens, secrets, raw OCR/receipt/file/payment contents, provider
  internals, and unauthorized private data.
- Linked resources reauthorize on open.

Docs-only changes to this model should run documentation validation. Runtime
preference-resolution changes require their own issue scope, manual gates, and
the validation class implied by the touched files.
