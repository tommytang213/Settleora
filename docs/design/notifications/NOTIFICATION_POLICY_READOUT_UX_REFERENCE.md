# Notification Policy Readout UX Reference

## Purpose

This document is the UX/reference gate for GitHub issue
[#685](https://github.com/tommytang213/Settleora/issues/685), `Admin and user
notification policy readout UX reference`, under parent
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It defines product-facing admin, user, mobile, and web readout states and copy
guidance for notification policy, provider readiness, user preference, group
preference, timing, device, queue, and delivery-attempt states.

This is a non-authorizing UX/reference packet only. It does not implement or
approve runtime API, database schema, EF migrations, OpenAPI contracts,
generated clients, admin web UI, user web UI, mobile UI, Figma output,
provider sending, provider secrets, device-token handling, auth/session or
security runtime, notification constants or writers, money, settlement, bill,
OCR, storage, sync, deployment, Docker, CI, or issue closure.

This packet is sufficient reference material for later Figma/UI tasks only
after Tommy/manual review accepts it. Runtime/UI implementation remains blocked
until the relevant manual, API/OpenAPI/schema, provider, audit/redaction, and
surface-specific implementation gates clear.

## Design Inputs

This reference inherits the boundaries in:

- [Admin global notification policy](../../architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md).
- [Admin notification policy schema and API design](../../architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md).
- [Notification provider readiness policy](../../architecture/NOTIFICATION_PROVIDER_READINESS_POLICY.md).
- [Notification event taxonomy](../../architecture/NOTIFICATION_EVENT_TAXONOMY.md).
- [Notification preference resolution model](../../architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md).
- [Mobile design reference V1](../mobile/MOBILE_DESIGN_REFERENCE_V1.md).
- [Mobile implementation guardrails V1](../mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md).
- [User web reference V1](../web/WEB_USER_REFERENCE_V1.md).
- [Admin web reference V1](../web/WEB_ADMIN_REFERENCE_V1.md).

In-app remains the Day 1 baseline where the event is supported, eligible,
authorized, and safe. Email and mobile push are optional external attempts only
when admin/global policy, provider readiness, content safety, user preference,
group preference, timing policy, device state, and worker/outbox state all
allow them. SMS remains unsupported for Day 1.

## Surfaces Covered

Admin/operator global notification policy readout:

- Shows global channel caps, event-family caps, provider readiness, timing
  rules, required/security/money posture, and non-secret diagnostics.
- May expose safe categories such as `provider_unconfigured` or
  `disabled_by_admin`, but not secrets, raw provider errors, payloads, private
  hostnames where sensitive, raw tokens, or hidden user content.
- Admin actions should be setup/review oriented, such as `Review provider
  setup`, `Review channel policy`, or `Open audit log`.

User settings notification-policy readout:

- Shows the current user's effective channel availability and preference
  limits without admin-only internals.
- Lets users narrow eligible optional delivery where policy allows.
- Explains when a channel is unavailable because of admin, provider, privacy,
  device, or group policy without blaming the user.

Mobile user notification settings/readout:

- Uses a single-column settings/readout flow with clear chips, short rows, and
  bottom-safe actions.
- Avoids cramped tables and long debug text.
- Keeps in-app availability visible where eligible, even when email or push is
  blocked, deferred, or failed.

Web user notification settings/readout:

- Uses settings cards, a channel availability summary, per-channel explanation
  rows, and optional detail drawers for notification detail.
- Supports filters for event categories and muted groups when future runtime
  provides those readouts.

Notification detail/error/explanation surfaces:

- Provide a concise delivery explanation near the notification or channel row.
- Avoid debug clutter and avoid implying external delivery succeeded unless a
  provider result confirms it.
- Re-fetch linked resources through authorized API paths in future runtime; a
  notification readout is not authorization.

Empty/degraded/disabled states:

- Empty states should say what is available now and what is not configured yet.
- Degraded states should describe user impact and safe fallback, not provider
  internals.
- Disabled states should say who can change the setting where appropriate
  without exposing admin-only details to normal users.

## Readout State Matrix

The state names below are reference vocabulary for design and future contract
review. They are not approved OpenAPI enum values, EF values, generated-client
contracts, or UI implementation.

| State | Admin/operator label | User-facing label | Short explanation | Severity/tone | Allowed action label | Unavailable action label | Must not show |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `unsupported` | Channel unsupported | Not available | This channel or event type is not supported for this deployment, platform, or Day 1 scope. | Neutral, final | Learn what is supported | Enable channel | Future promises, hidden roadmap, provider setup controls |
| `disabled` | Disabled by policy | Turned off | Policy currently prevents this channel. In-app may still be available for eligible events. | Neutral, policy-based | Review channel policy | Send test notification | Secrets, provider diagnostics, blame language |
| `unconfigured` | Provider unconfigured | Not set up yet | The channel is supported in principle, but required setup is missing. | Calm warning | Review provider setup | Send notification | SMTP/APNs/FCM values, private hostnames where sensitive |
| `configured` | Provider configured | Setup saved | Required non-secret setup appears present, but readiness alone has not confirmed a send path. | Informational | Check readiness | Mark as ready | Credential values, fake success |
| `ready` | Provider ready | Available | The channel may be used when policy, preference, content safety, and recipient/device gates also allow it. | Positive but bounded | Review policy | Assume delivered | Delivery success claims |
| `degraded` | Provider degraded | Delivery may be delayed | Provider or system capability is reduced; external attempts may be delayed or limited. | Warning, non-alarming | Review provider status | Retry now | Raw provider errors, outage internals |
| `failing` | Provider failing | Delivery is not working | Recent safe checks or attempts indicate the provider path is failing. | Warning to admin, plain to user | Review provider status | Send again | Raw errors, request bodies, blame |
| `rate_limited` | Rate limited | Delivery is delayed | A rate limit prevents immediate external delivery. | Temporary warning | Review rate limits | Send now | Provider quota IDs, raw limits if sensitive |
| `maintenance` | Maintenance pause | Temporarily paused | Operator or provider maintenance pauses attempts. | Calm, temporary | Review maintenance | Send now | Internal maintenance notes that expose systems |
| `unknown` | Readiness unknown | Status unavailable | The system cannot safely establish channel readiness. Fail closed for external delivery. | Cautious | Check readiness | Treat as available | Stack traces, timeout internals |
| `muted` | Muted by preference | Muted | Optional delivery is muted by user, group, or thread settings where policy allows. | Neutral | Open notification settings | Notify anyway | Hidden group/user details, admin-only overrides |
| `quiet_hours_deferred` | Deferred by quiet hours | Waiting until quiet hours end | Optional delivery is delayed by quiet-hours settings. | Calm, time-based | Open notification settings | Send during quiet hours | Exact private schedules for unrelated users |
| `digest_deferred` | Waiting for digest | Included in digest | Optional delivery is batched for a digest instead of immediate external delivery. | Neutral | Open notification settings | Send immediately | Digest internals or provider queue details |
| `device_unavailable` | Device unavailable | Device not available | Push cannot be attempted for this recipient/device path right now. | Practical | Open device settings | Send push | Raw device model, platform IDs, token data |
| `token_missing` | Push token missing | No device registered | Push requires an active registered device token; in-app may still be available. | Practical | Open notification settings | Register this device remotely | Raw tokens, protected token blobs, fingerprints |
| `queued` | Attempt queued | Sending is pending | An approved external attempt was accepted for later processing; success is unknown. | Pending | View notification details | Mark as sent | Queue internals, worker IDs where sensitive |
| `sent_or_attempted` | Sent or attempted | External attempt made | A future provider state reports acceptance or attempt according to the approved delivery vocabulary. This is not proof the user saw it. | Bounded success | View details | Mark as delivered | "Delivered" unless receipts exist, payloads |
| `failed_transient` | Temporary failure | Delivery will be retried if allowed | The external attempt failed in a way that may recover under retry/expiry policy. | Warning, temporary | Review delivery status | Retry without policy | Raw provider errors, network internals |
| `failed_permanent` | Permanent failure | Delivery cannot continue | The external attempt cannot continue for this channel/recipient without a change. | Clear warning | Review setup | Keep retrying | Invalid-address/token details beyond safe category |
| `blocked_by_admin_policy` | Blocked by admin policy | Not available on this server | Admin/global policy blocks this external channel or event class. | Neutral, not user fault | Review channel policy | Turn on as user | Admin-only config, blame |
| `blocked_by_security_policy` | Blocked by security policy | Kept in-app for security | External delivery is blocked to protect sensitive security or account information. | Protective | Open in-app notification | Send externally | Security details, session data, raw auth events |
| `blocked_by_privacy_policy` | Blocked by privacy policy | Kept private in Settleora | External delivery is blocked because the content is not safe for email or push. | Protective | Open in-app notification | Send externally | Payment details, OCR text, receipt text, private notes |
| `blocked_by_user_preference` | Disabled by user preference | Turned off in your settings | The user has turned off optional delivery for this channel or category. | Neutral | Open notification settings | Override settings | Admin controls, blame |
| `blocked_by_group_preference` | Blocked by group preference | Muted for this group | Group or thread preference blocks optional delivery where policy allows. | Neutral | Open group notification settings | Notify anyway | Hidden member data, unrelated group data |

## Copy Principles

Use product-facing copy. Primary UI labels must be meaningful words, not raw
enum strings. Raw state names may appear only in developer-facing docs, safe
test fixtures, or future admin diagnostics where explicitly approved.

Required copy rules:

- Do not use raw enum strings as primary UI copy.
- Do not say "provider failed with code X" in user-facing copy.
- Do not say "server", "client", or "backend" in normal user UI. Admin copy
  may say "this server" where that is the product concept for self-hosting.
- Do not use vague meaningful-action buttons like `OK`, `Yes`, or `Confirm`.
- Buttons must say what happens, such as `Open notification settings`,
  `Review provider setup`, `Keep in-app only`, `Open in-app notification`, or
  `Review channel policy`.
- Avoid blaming users when admin/provider policy blocks a channel.
- Explain that in-app is still available where the event is eligible,
  authorized, implemented, and safe.
- Avoid implying external delivery succeeded unless a provider result confirms
  the exact future state being claimed.
- Avoid `delivered` until a future provider-specific design distinguishes
  provider acceptance, mailbox/device delivery, app receipt, user visibility,
  and user action.

## Privacy And Redaction Rules

Readouts must not expose:

- SMTP secrets, SMTP passwords, app passwords, usernames where sensitive, or
  private SMTP hostnames where sensitive.
- APNs keys, certificates, team IDs where sensitive, FCM service-account JSON,
  sender IDs where sensitive, server keys, or provider credentials.
- Raw device tokens, protected token blobs, token fingerprints, or push
  provider payloads.
- Raw provider errors, provider response bodies, provider dashboard internals,
  queue internals where sensitive, or rendered external message bodies when
  unauthorized.
- Payment details, payment handles, QR/payment image content, proof contents,
  hidden bill data, private notes, unrelated recipient/user data, OCR text,
  receipt text, file bytes, storage paths, object keys, signed URLs, bucket
  names, auth/session data, reset/recovery/MFA/passkey material, or raw audit
  payloads.

Admin readouts may show bounded categories, timestamps, and safe reason labels.
Admin readouts must still redact secrets and raw diagnostics.

## Admin Versus User Distinction

Admin/operator readouts can show:

- Global channel caps and event-family caps.
- Provider readiness category, such as "Email provider is unconfigured" or
  "Push provider degraded".
- Safe last-check timestamps, policy version, and redacted result category.
- Setup, policy, maintenance, and audit actions where future runtime allows.

Normal user readouts can show:

- Effective availability for the current user only.
- Preference controls only where the user can narrow eligible optional
  delivery.
- Non-blaming explanations such as "Email is not available on this server yet"
  or "Push delivery may be delayed".
- In-app fallback where eligible.

Examples:

- Admin: "Email provider is unconfigured." User: "Email is not available on
  this server yet."
- Admin: "Push provider degraded." User: "Push delivery may be delayed."
- Admin action: `Review provider setup`. User action:
  `Open notification settings`.
- Admin may see non-secret diagnostics. Normal users should not see provider,
  deployment, queue, or policy internals.

## Layout Guidance

Mobile:

- Use a single-column settings/readout layout.
- Put key channel availability chips near the top.
- Use short explanation rows under each channel.
- Keep bottom actions safe from the home indicator and bottom navigation.
- Avoid cramped tables; use stacked rows and detail sheets.
- Keep disabled/unavailable controls visually distinct from tappable controls.

User web:

- Use settings cards for channel groups and event categories.
- Show a channel availability summary before detailed preference rows.
- Use explanation rows and optional drawers for notification detail.
- Keep action labels exact and avoid broad "save everything" flows when a
  future implementation needs action-specific confirmation.

Admin web:

- Use policy cards for global caps and provider readiness.
- Use a readiness table with filters for channel, event family, readiness
  state, severity, timing mode, and safe reason category.
- Use drawers/details for redacted diagnostics, last check, policy version, and
  related audit events.
- Keep provider setup, policy mutation, and maintenance actions separate and
  clearly labeled.

Notification detail:

- Use a concise delivery explanation, such as "Email was not sent because this
  update is kept in-app for privacy."
- Keep debug data out of ordinary detail views.
- Show external channel status separately from in-app unread/read/archive
  state.

Accessibility:

- Use clear labels and visible focus states.
- Do not rely on color alone for status.
- Keep contrast compliant with the current design system.
- Preserve large tap targets on mobile and predictable keyboard navigation on
  web/admin.
- Status chips need text labels, not only icons.

This guidance should remain compatible with Settleora's modern rounded fintech
visual direction, shared tokens, compact product surfaces, and the approved
mobile/user-web/admin-web references.

## Example Copy

Email disabled globally:

- Admin: "Email notifications are disabled by policy."
- User: "Email notifications are turned off for this server. In-app
  notifications are still available where eligible."
- Action: `Review channel policy` for admin; no user enable action.

Email unconfigured:

- Admin: "Email provider is not set up."
- User: "Email is not available on this server yet."
- Action: `Review provider setup` for admin.

Push provider ready but no device registered:

- Admin: "Push provider is ready. This user has no active device registered."
- User: "Push is available, but this device is not registered yet."
- Action: `Open notification settings`.

Push rate limited:

- Admin: "Push attempts are rate limited."
- User: "Push delivery is delayed. Open Settleora to review the update now."
- Action: `Open in-app notification`.

External delivery blocked by security policy:

- Admin: "External delivery is blocked by security policy for this event
  class."
- User: "This security update is kept in-app."
- Action: `Open in-app notification`.

Group muted notification:

- Admin: "Optional delivery is blocked by group preference."
- User: "Notifications from this group are muted."
- Action: `Open group notification settings`.

Quiet hours deferred notification:

- Admin: "Optional external delivery is deferred by quiet-hours policy."
- User: "This notification will wait until quiet hours end."
- Action: `Open notification settings`.

In-app-only fallback:

- Admin: "External channels are blocked; in-app remains eligible."
- User: "This update is available in Settleora only."
- Action: `Open in-app notification`.

Admin provider degraded state:

- Admin: "Push provider degraded. Attempts may be delayed or limited."
- Action: `Review provider status`.

User privacy-safe failed external attempt:

- User: "Email could not be sent. The in-app notification is still available."
- Action: `Open in-app notification`.

## Future Implementation Split Recommendation

Recommended sequence:

1. Manual review of this UX/reference packet.
2. Figma/admin/user/mobile/web reference if desired or if the later surface is
   visually novel.
3. API/readout contract design from #684 if a runtime contract is needed.
4. Provider readiness readout from #686.
5. UI implementation slices, separately gated by admin web, user web, mobile,
   and notification detail surfaces.
6. Accessibility and copy review.
7. Audit/redaction cross-check through #688.
8. Final acceptance through #689.

## Parent And Child Posture

- #685 remains open after this reference gate unless the close rule is clearly
  satisfied after PR merge and manual acceptance.
- #635 remains open.
- #684 and #686 remain open unless their own acceptance criteria are later
  satisfied.
- Runtime/API/schema/OpenAPI/generated-client/provider/UI implementation
  remains blocked.
- #371 remains closed and must not be reopened by this readout reference.
