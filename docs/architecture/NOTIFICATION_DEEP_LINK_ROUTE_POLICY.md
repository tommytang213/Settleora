# Notification Deep-Link Route Policy

## Purpose

This docs/control policy defines the notification deep-link and mobile
navigation boundary for GitHub issue
[#371](https://github.com/tommytang213/Settleora/issues/371). It is the
route/target/source-policy gate before future Figma reference work or Flutter
implementation.

This document does not implement Flutter routes, mobile navigation runtime,
Figma output, screenshots, notification writers, event enums, OpenAPI
contracts, generated clients, EF migrations, auth/session/security runtime,
settlement/payment/bill/money logic, OCR runtime, sync runtime, provider
sending, device-token behavior, admin/global notification policy, deployment,
CI, Docker, environment configuration, or secrets.

## Deep-Link Authority Boundary

Notification rows, push payloads, local notification metadata, route state, and
mobile caches may contain only safe target references and event metadata. They
are navigation hints, not authorization grants.

Opening a notification must always:

1. Re-fetch the notification detail or current notification row through the
   authenticated current-user notification API.
2. Derive the supported target family from the re-fetched notification response,
   not from an untrusted push payload or stale local cache.
3. Re-fetch the linked bill, settlement, recurring bill, OCR review, sync
   operation, or future approved target through that resource's authorized API
   path.
4. Render only the authorized response shape for the current account/session.
5. Fall back to product-facing unavailable, resolved, sign-in, or offline states
   when any re-fetch fails or no longer authorizes the current actor.

These are never authorization:

- possession of a notification row;
- possession of a push notification;
- OS push permission or a registered device token;
- local notification cache;
- route state;
- relative `actionUrl`;
- raw object URL or browser URL;
- generated-client method availability;
- copied IDs from logs, screenshots, issue comments, or reports.

Read/archive state remains notification inbox state only. Opening, reading, or
archiving a notification must not mutate bills, settlements, payments,
residuals, proof files, OCR reviews, recurring templates, generated drafts, sync
operations, auth/session state, storage records, source audit, or money truth.

## Supported Route Matrix

Future mobile implementation may route only currently implemented event
families listed below, and only after the authorization re-fetch sequence above.
The target screen names are product destinations, not approved Flutter route
names or Figma frames.

| Event family | Current event coverage | Safe route target after re-fetch | Required target re-fetch |
| --- | --- | --- | --- |
| Bill workflow | `bill.submitted`, `bill.participant_accepted`, `bill.participant_rejected`, `bill.confirmed` | Bill detail or bill review context. | Fetch the personal/group bill through the authorized bill route indicated by the safe bill/group target. |
| Bill revisions | `bill.revision_proposed`, `bill.revision_resubmitted`, `bill.revision_submitted`, `bill.revision_withdrawn`, `bill.revision_approved`, `bill.revision_rejected`, `bill.revision_payer_confirmed`, `bill.revision_applied` | Bill revision review/detail context for the current actor. | Fetch bill and revision/review context through authorized bill revision APIs. |
| Settlements | `settlement.request_created`, `settlement.payment_marked_paid`, `settlement.payment_partially_paid`, `settlement.payment_confirmed`, `settlement.request_disputed`, `settlement.payment_disputed`, `settlement.request_cancelled`, `settlement.payment_cancelled`, `settlement.proof_attached` | Settlement request/payment detail, proof summary, or settlement action context. | Fetch settlement request/payment/proof metadata through authorized settlement APIs. Proof content still requires its own authorized file route. |
| Settlement residual review | `settlement.residual_review_needed` | Settlement payment residual review context. | Fetch settlement payment/request and bounded residual summaries through authorized settlement APIs before showing residual actions. |
| Recurring bills | `recurring_bill.due_soon`, `recurring_bill.draft_generated` | Recurring template/forecast detail or generated draft bill context. | Fetch recurring template/forecast or generated bill through authorized recurring/bill APIs. |
| OCR needs review | `ocr.needs_review` | Receipt OCR review assignment/detail context. | Fetch the OCR assignment/review and receipt attachment metadata through authorized bill attachment/OCR review APIs. |
| Sync | `sync.conflict_detected`, `sync.operation_failed` | Sync operation detail/readout for the current actor. | Fetch `/api/v1/sync/operations/{syncOperationId}` or future approved sync target through the current-actor API path. |

Blocked or future route families:

- Security/auth/session events remain future and manual auth-security gated
  until event policy, safe target references, external snippet rules, and
  detail surfaces are approved.
- Item claim/split/creator-review events remain future until source runtime,
  stable claim/item targets, money-policy gates, and Figma/reference behavior
  exist.
- Broader settlement mismatch/review states remain future until source states
  exist beyond the implemented residual-review handoff.
- OCR completed/failed remain future until server OCR worker/job source states
  exist.
- Remaining sync queued/retry/resolved/reopened/resolution-applied routes remain
  future until exact persisted source transitions and target/read APIs exist.
- Provider delivery, digest, admin/global policy, push token, device, and
  delivery-attempt records are not #371 deep-link targets unless a later
  target/reference policy explicitly approves them.

Do not add a route by overloading an unrelated subject type, parsing private
data from `safeSummary`, trusting a provider payload, or using a raw
`actionUrl` as authority.

## Stale, Missing, Or Unauthorized Behavior

Opening a notification must use non-enumerating product-facing fallbacks. The
UI must not reveal whether a private target exists when the current actor is no
longer authorized to know it exists.

Required behaviors:

| Scenario | Required behavior |
| --- | --- |
| Notification row missing | Show a generic unavailable notification state. Do not infer target existence from cached IDs. |
| Notification archived | Do not treat archive as source deletion. The user may view archived notification context only through an authorized notification re-fetch where supported, then re-fetch the target. |
| Source record archived or restored | Re-fetch the target and show the current authorized archive/restored state; do not rely on old notification copy. |
| Source record deleted or unavailable | Show a generic unavailable or no-longer-available state without exposing private details. |
| User no longer authorized | Show a generic unavailable state. Do not say that a specific bill, settlement, OCR review, sync operation, group, file, or session exists. |
| Group membership changed | Re-fetch group-scoped targets through current authorization. Removed members get the same generic unavailable behavior. |
| Settlement or bill already resolved | Route to current detail/readout if authorized and show current resolved state; do not offer stale actions. |
| Sync operation no longer actionable | Route to current sync readout if authorized and show resolved/unavailable/current status; do not retry, resolve, or discard from notification state. |
| OCR review retargeted or resolved | Re-fetch assignment/review state. If no longer assigned or actionable, show current resolved/unavailable state without exposing raw OCR. |
| Current account/session changed | Treat the notification as untrusted until notification and target are re-fetched under the new authenticated session. If unavailable, show generic unavailable state. |
| Authentication required | Route to sign-in or server connection first. After authentication, re-fetch notification and target again before rendering details. |
| App offline or server unavailable | Show an offline/unavailable state and preserve the notification hint for retry. Do not render private target detail from stale cache as if current authorization passed. |

Fallback copy must be product-facing. Use wording such as:

- "This notification is no longer available."
- "Sign in to view this notification."
- "Connect to the server to refresh this notification."
- "This item no longer needs action."
- "This item is not available to this account."

Do not use developer-note copy, API route names, object IDs, generated-client
names, exception names, storage paths, provider diagnostics, or raw problem
details in fallback UI.

## Privacy And Copy Posture

External snippets, push payloads, lock-screen notifications, email previews,
screenshots, design references, test snapshots, logs, reports, and issue/PR
comments must not reveal private business data.

Forbidden in push/external snippets and screenshots:

- money values;
- OCR text, receipt text, item lines, or raw parsed receipt data;
- private notes, comments, or rejection reasons;
- payment handles, QR contents, account numbers, bank details, payment notes,
  proof details, proof image/text contents, bank screenshots, thumbnails, or
  file bytes;
- hidden bill lines, hidden participant shares, assignment matrices, or
  unauthorized participant data;
- provider tokens, protected token blobs, token fingerprints, provider payloads,
  provider request/response data, SMTP/APNs/FCM credentials, dashboard values,
  certificates, service-account JSON, `.env` values, or secrets;
- route payloads that reveal private target existence or private content;
- raw IDs where not needed for product display;
- storage paths, object keys, bucket names, signed URLs, local paths, file
  paths, provider internals, or admin-only diagnostics.

In-app notification detail may display sensitive detail only after authorized
API re-fetch and only within the current viewer's permissions. Payment proof,
payment details, OCR review data, bill revision financial impact, settlement
residuals, sync conflict details, and security/session details must come from
their authorized resource APIs, not from notification payloads.

External copy should stay generic:

- "A bill needs review."
- "A settlement update is available."
- "A receipt review needs attention."
- "Sync needs attention."
- "Open Settleora to view this notification."

## Mobile Navigation UX Posture

Future mobile behavior must follow the approved mobile references:

- [Mobile design reference V1](../design/mobile/MOBILE_DESIGN_REFERENCE_V1.md)
- [Mobile Notifications reference V1](../design/mobile/MOBILE_NOTIFICATIONS_REFERENCE_V1.md)
- [Mobile Notification Open States reference](../design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md)
- [Mobile More and Settings reference V1](../design/mobile/MOBILE_MORE_SETTINGS_REFERENCE_V1.md)
- [Mobile Push Registration UX reference](../design/mobile/MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md)

Deep-link opens must not couple to first-launch push permission prompts. First
launch, server/local setup, notification permission, token registration, and
deep-link routing are separate flows.

Mobile routing rules:

- A notification tap should land in Notification Center, a notification detail
  context, or the authorized domain detail context after re-fetch. It must not
  bypass auth/session, server-mode setup, or resource authorization.
- If the app is unauthenticated, in local-only mode, or disconnected from the
  required server, route to sign-in/server connection first. After session
  establishment, re-check the notification and target authorization.
- If the authenticated account differs from the account that received the push
  or cached notification, do not reveal target details. Re-fetch under the
  current account and fall back generically if not authorized.
- Supported actions must come from authorized API responses. Local route
  metadata cannot decide whether the user may approve, confirm, dispute,
  resolve, retry, apply, archive source records, or view files.
- Preserve user trust by avoiding existence leaks. "Not available to this
  account" is safer than naming a private bill, settlement, OCR review, sync
  operation, group, file, or session.

The first approved Flutter implementation should be small: current-user
notification re-fetch, target-family mapping for already-supported event
families, authorized target re-fetch, and fallback states. Mobile navigation
tests are required only when Flutter code changes exist.

## Mobile Reference Handoff

[Mobile Notification Open States reference](../design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md)
is the #371 mobile reference handoff for notification-open and deep-link
states. It records the required product states for in-app row taps, OS
push/local notification opens, sign-in required, account switched, local-only
mode, offline/server unavailable, stale/missing/deleted/archived/restored
targets, unauthorized or membership-changed targets, resolved/completed
notifications, retargeted notifications, loading, provider disabled or
unconfigured readouts, and notification-detail fallback.

That reference is still not Flutter implementation, backend route behavior,
OpenAPI/generated-client change, or pixel-perfect Figma approval. Exact
screenshots/frames remain a later approval gate before mobile code.

[Mobile Notification Open Figma reference package](../design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md)
is the focused #371 package for Tommy/designer review of exact notification-open
frames. It defines the required frame inventory, paste-ready Figma/designer
prompt, UX/privacy guardrails, acceptance checklists, export evidence
expectations, and future Flutter implementation boundary.

## Future Figma/Reference Prompt

Use this prompt for a future Figma/reference task. It is a prompt only, not an
approved Figma output or pixel-perfect screen claim:

```text
Create a Settleora mobile notification deep-link state reference that follows
the approved Home / Bills / Groups / Settle / More shell, Notifications V1,
More and Settings V1, Push Registration UX, and Auth Security direction.

Design notification-open states for authenticated server mode, sign-in
required, server connection required, account switched, offline/server
unavailable, missing notification, source unavailable, unauthorized target,
archived/restored/deleted source, resolved bill/settlement, no-longer-actionable
sync operation, and OCR review retargeted/resolved.

Show that notification taps first refresh the notification and then re-fetch the
linked bill, settlement, recurring bill, OCR review, or sync operation through
authorized API paths. Do not bypass auth/session. Do not prompt for OS push
permission on first launch as part of deep-link routing.

Keep lock-screen/external copy generic. Do not show money values, OCR/receipt
text, payment or proof details, private notes/comments, hidden bill lines,
provider tokens, protected blobs, fingerprints, route payloads, raw IDs where
not needed, storage paths, object keys, signed URLs, local paths, admin-only
details, API route names, generated-client wording, or developer diagnostics.
```

Do not implement Flutter from this prompt until an approved reference exists
and a future implementation task explicitly scopes mobile code.

## Validation Expectations For Future Implementation

Docs/control changes to this policy require docs/scaffold validation only unless
they also touch contracts, code, tests, mobile, CI, Docker, or runtime config.

Future backend or API route-target changes must include tests proving:

- current-user notification list/read/archive authorization;
- notification read/archive source-state isolation;
- target-family mapping uses safe first-class IDs only;
- linked target re-fetch uses authorized API paths;
- missing, archived, deleted, stale, resolved, and unauthorized targets do not
  leak private existence or details;
- notification possession, push possession, local cache, action URL, object URL,
  and generated-client availability do not authorize access;
- response payloads, logs, audit, tests, external snippets, and reports exclude
  forbidden private data.

Future Flutter/mobile implementation must include mobile navigation tests only
when Flutter files change. Those tests should cover sign-in-required routing,
account switch handling, offline/server-unavailable fallback, supported target
open behavior after re-fetch, stale/resolved state handling, and no local route
metadata authority.

No OpenAPI or generated-client changes are required by this policy. Do not add
route metadata contracts, generated-client fields, event enum values, or public
response shapes unless a future route metadata contract is explicitly approved.

#371 is now closed after the accepted notification-open/deep-link scope. Future
event families must keep this policy's authorization and fallback rules, but
they must not redo #371 work unless a new issue explicitly scopes a new route
family.
