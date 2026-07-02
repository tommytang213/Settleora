# Mobile Notification Open States Reference

## Status And Authority

This is the #371 mobile Figma/reference handoff for notification-open and
deep-link states. It extends the #371 route policy in
[Notification deep-link route policy](../../architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md).

This reference does not approve Flutter implementation, Figma output,
screenshots, binary assets, generated design assets, notification writer
runtime, route metadata APIs, backend target APIs, OpenAPI contracts, generated
clients, EF schema/migrations, auth/session/security runtime, settlement,
payment, bill, OCR, sync, recurring, import/export/restore behavior, provider
sending, APNs/FCM/SMTP SDKs, Firebase dependency approval, secrets, deployment,
Docker, CI, #634 push implementation, #635 admin/global policy/readout,
#369 event-family runtime implementation, issue closure, or Project field
mutation.

Notification rows, push payloads, local notification metadata, route state,
local cache, object URLs, and generated-client availability are not
authorization. Opening a notification must re-fetch the notification detail or
current notification row through the authenticated current-user notification
API, then re-fetch the linked resource through its authorized API path before
rendering target detail or actions.

Read/archive state remains inbox state only. Notification-open behavior must
not mutate bills, settlements, payments, proof files, OCR reviews, recurring
templates, generated drafts, sync operations, auth/session state, storage
records, source audit, or money truth.

## Reference Inheritance

Future Figma/reference work and later Flutter implementation must visually and
behaviorally inherit these approved references:

- [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md)
- [Mobile More and Settings reference V1](MOBILE_MORE_SETTINGS_REFERENCE_V1.md)
- [Mobile Notifications reference V1](MOBILE_NOTIFICATIONS_REFERENCE_V1.md)
- [Mobile Push Registration UX reference](MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md)
- [Mobile Auth Security reference V1](MOBILE_AUTH_SECURITY_REFERENCE_V1.md)
- [Mobile implementation guardrails V1](MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md)

Use the product-grade Settleora mobile style: tokenized dark rounded fintech
direction, large tap targets, single-column mobile flow, restrained status
chips, readable typography, calm empty/error states, bottom sheets where they
fit the task, and stable `Home / Bills / Groups / Settle / More` shell
behavior. Notifications remain reachable from the top bell/global affordance,
not a new bottom-nav tab.

This document is not a pixel-perfect Figma approval. Do not claim exact Figma
approval until approved screenshots/frames are later added under
`docs/design/mobile/assets/` and linked from this reference.

[Mobile Notification Open Figma reference package](MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md)
is the focused #371 package for generating and reviewing exact
notification-open frames before Flutter implementation is scoped. It adds the
frame inventory, paste-ready designer prompt, UX/privacy guardrails, and review
checklists for Figma/reference approval.

## Supported Route Families

Future reference frames and Flutter work may cover only these current route
families unless a later policy expands them:

| Family | Current supported examples | Safe destination after re-fetch |
| --- | --- | --- |
| Bill workflow/revision | `bill.submitted`, participant accept/reject, `bill.confirmed`, bill revision proposal/resubmission/submission/withdrawal/approval/rejection/payer-confirmation/apply | Bill detail, bill review, or bill revision review context visible to the current actor. |
| Settlement request/payment/proof | request created, marked paid, partially paid, confirmed, disputed, cancelled, proof attached | Settlement request/payment detail or proof summary visible through authorized settlement/proof APIs. |
| Settlement residual review | `settlement.residual_review_needed` | Settlement payment residual review context from authorized settlement APIs. |
| Recurring due/draft | `recurring_bill.due_soon`, `recurring_bill.draft_generated` | Recurring template/forecast detail or generated bill detail when visible. |
| OCR needs review | `ocr.needs_review` | Receipt OCR review assignment/detail context from authorized bill attachment/OCR review APIs. |
| Sync conflict/failure | `sync.conflict_detected`, `sync.operation_failed` | Current-actor sync operation detail/readout. |

## Future Or Blocked Route Families

These remain future/blocked for #371 open-state references until source runtime,
target policy, authorization, and any required Figma/security gates exist:

- Security/auth/session events.
- Item claim/split/creator-review events.
- OCR completed/failed.
- Remaining sync queued/retry/retry-failed/resolved/reopened/resolution-applied
  flows.
- Broader settlement mismatch/review states.
- Provider, digest, admin/global policy/readout, push-token, device-token,
  delivery-attempt, delivery-receipt, and provider diagnostic routes.

Do not unblock these by parsing private data from `safeSummary`, overloading an
unrelated subject type, trusting provider payloads, or treating `actionUrl` as
authority.

## Notification-Open State Coverage

Future reference screens should cover these product states. The copy below is
directional and privacy-safe; final Figma copy may vary while preserving the
same authority and privacy behavior.

| State | Product behavior | Primary actions |
| --- | --- | --- |
| Open from in-app notification row | Tap row, refresh notification detail, then refresh the linked resource. Show the authorized target if available. | `Open bill`, `Review settlement`, `Review receipt`, `View sync issue`, `Back to notifications` |
| Open from OS push/local notification | Treat payload as a hint only. Bring the app into a safe auth/server context, then re-fetch notification and target. | `Open Settleora`, then target-specific action after refresh |
| Sign-in required | Route to sign-in/server account before showing details. After sign-in, re-fetch notification and target again. | `Sign in`, `Back to notifications` |
| Wrong account/account switched | Do not reveal target details. Re-fetch under the current account and show generic unavailable copy if not authorized. | `Switch account`, `Back to notifications` |
| Local-only mode | Server notification targets are unavailable in local-only mode. Explain that server notifications need a server account without implying target existence. | `Connect server account`, `Back to notifications` |
| Offline/server unavailable | Show an offline refresh state and keep the notification hint for retry. Do not render cached private target detail as current authorization. | `Retry`, `Back to notifications` |
| Stale/missing target | Show a generic no-longer-available state without naming private resources. | `Back to notifications` |
| Deleted/archived/restored target | Re-fetch current authorized state. Deleted/unavailable targets show generic unavailable copy; archived/restored targets show current status if visible. | `Open bill`, `Review settlement`, `Back to notifications` |
| Unauthorized/group membership changed | Show generic not-available-to-this-account copy. Do not reveal whether a group, bill, OCR review, proof, or sync record exists. | `Back to notifications` |
| Already resolved/completed notification | Show current resolved/completed readout if visible and suppress stale action buttons. | `Open bill`, `Review settlement`, `Back to notifications` |
| Retargeted notification | Re-fetch notification and current target. If the target moved to another authorized recipient or no longer applies, show resolved/unavailable state. | `Back to notifications` |
| Resource still loading | Use a skeleton/progress state inside the notification-open route while notification and target refresh complete. | None until loaded; allow safe back navigation |
| Server push disabled/provider unconfigured | Show this only as a push readiness/readout state. Do not confuse push provider state with deep-link authorization. In-app notification open may still work after authorized re-fetch. | `Back to notifications`, optional `Notification settings` |
| Notification detail fallback | If linked resource cannot be opened safely, show notification detail only with safe generic metadata from the authorized notification response. | `Retry`, `Back to notifications` |

Fallback copy should stay calm and user-facing:

- "This notification is no longer available."
- "Sign in to view this notification."
- "Connect to the server to refresh this notification."
- "This item no longer needs action."
- "This item is not available to this account."
- "Push notifications are off for this server. In-app notifications still work."

Do not show API route names, generated-client names, exception names, object IDs,
file IDs that are not user-facing safe IDs, storage paths, provider diagnostics,
raw problem details, or developer-note copy in normal UI.

## Privacy-Safe Copy And Screenshot Rules

Use generic copy only in push/local notifications, external snippets,
screenshots, docs examples, issue comments, reports, and Figma/reference
frames.

Do not expose:

- money amounts;
- receipt/OCR text, item lines, raw OCR fields, or proof/payment details;
- hidden bill details, hidden participant shares, private notes, comments, or
  rejection reasons;
- private profile IDs, raw provider tokens, protected blobs, token
  fingerprints, provider payloads, provider request/response bodies,
  credentials, dashboard values, certificates, service-account JSON, signing
  files, or `.env` values;
- storage paths, object keys, bucket names, signed URLs, local paths, file
  bytes, raw file IDs that are not user-facing safe IDs, or storage provider
  internals;
- route payload secrets, raw deep-link payloads, logs, debug text, stack traces,
  admin-only diagnostics, or generated-client implementation details.

Buttons must name the action. Prefer labels such as:

- `Open bill`
- `Review bill`
- `Review settlement`
- `Review receipt`
- `View sync issue`
- `Retry`
- `Sign in`
- `Back to notifications`

Avoid vague labels such as `OK`, `Yes`, `No`, `Submit`, or bare `Confirm` for
notification-open states.

## Mobile UX Posture

Notification-open states should feel like part of the existing mobile product,
not a separate technical error surface:

- Keep content single-column, phone-width, and safe-area aware.
- Use bottom sheets for account/server choices or explanatory secondary
  actions where suitable.
- Keep primary action rows large enough for touch and pinned only when they do
  not cover content.
- Use status chips for resolved, unavailable, offline, sign-in required, and
  needs-action states.
- Preserve the originating tab context where practical, but do not let visual
  tab selection imply authorization.
- Do not couple deep-link navigation to first-launch OS push permission prompts.
- Keep push permission/registration readiness separate from notification-open
  authorization.
- Keep errors and empty states product-facing, with no developer diagnostics.

## Paste-Ready Figma/Reference Prompt

Use this prompt for a future Figma/reference task. It is a prompt only, not an
approved Figma output:

```text
Create a Settleora mobile notification-open and deep-link state reference for
#371. Use the approved Settleora mobile references: Mobile design reference V1,
More and Settings V1, Notifications V1, Push Registration UX reference, Auth
Security V1, and Mobile implementation guardrails V1. Keep the visual direction
consistent with the existing product-grade dark rounded fintech mobile style,
large tap targets, bottom sheets where suitable, single-column flow, stable
Home / Bills / Groups / Settle / More shell, and notification access from the
top bell/global affordance.

Do not claim pixel-perfect approval unless final approved frames are later
exported. Do not generate fake private data, fake tokens, real secrets,
provider payloads, route payload secrets, storage paths, object keys, signed
URLs, raw IDs, credentials, dashboard values, service-account JSON, or realistic
payment/proof/OCR contents.

Design notification-open states for:
- open from in-app notification row;
- open from OS push/local notification;
- sign-in required;
- wrong account/account switched;
- local-only mode;
- offline/server unavailable;
- stale/missing target;
- deleted target;
- archived target;
- restored target;
- unauthorized/group membership changed;
- already resolved/completed notification;
- retargeted notification;
- resource still loading;
- server push disabled/provider unconfigured, clearly separated from deep-link
  authorization;
- notification detail fallback if the linked resource cannot be opened safely.

Supported current route families:
- bill workflow/revision notifications;
- settlement request/payment/proof notifications;
- settlement.residual_review_needed;
- recurring due/draft notifications;
- OCR ocr.needs_review;
- sync sync.conflict_detected and sync.operation_failed.

Show that notification opens first refresh the current-user notification detail
and then re-fetch the linked bill, settlement, recurring bill, OCR review, or
sync operation through authorized API paths. Notification rows, push payloads,
route state, local cache, object URLs, and generated-client availability are
not authorization.

Keep copy privacy-safe and generic. Do not show money amounts, receipt/OCR
text, proof/payment details, hidden bill details, private profile IDs, raw
provider tokens, protected blobs, fingerprints, provider payloads, credentials,
storage paths, file IDs that are not user-facing safe IDs, notes/comments, or
route payload secrets. Use action-specific buttons such as Open bill, Review
settlement, Review receipt, View sync issue, Retry, Sign in, and Back to
notifications.

Keep these route families visually marked future/blocked, not designed as
approved current routes: security/auth/session events, item claim/split/creator
review events, OCR completed/failed, remaining sync queued/retry/resolved/
reopened/resolution-applied flows, broader settlement mismatch/review states,
and provider/digest/admin/global policy/readout/push-token/delivery-attempt
routes.
```

Do not implement Flutter from this prompt until actual approved reference
frames exist and a later implementation task explicitly scopes mobile code.

## Future Implementation Readiness Checklist

Later Flutter implementation may:

- route notification taps through current-user notification re-fetch;
- map only the supported route families listed in this document;
- re-fetch linked resources through authorized generated-client/API paths;
- render safe loading, sign-in, account-switched, local-only, offline,
  unavailable, unauthorized, resolved, retargeted, and fallback states;
- use local cache only as a retry hint or skeleton seed, not as authorization;
- keep push disabled/unconfigured readouts separate from resource access;
- add mobile navigation/widget tests only when Flutter files change.

The server/API/domain layer must remain authoritative for:

- notification recipient eligibility and notification detail visibility;
- linked-resource authorization;
- bill, settlement, payment, residual, proof, recurring, OCR, sync, storage,
  auth/session, audit, and money truth;
- allowed actions, status transitions, file/proof access, and source-state
  mutation;
- provider delivery, preference resolution, and admin/global policy where later
  implementation exists.

Later tests will be needed for:

- sign-in-required and account-switched notification opens;
- offline/server-unavailable fallbacks;
- authorized notification detail re-fetch before target routing;
- authorized target re-fetch for each supported route family;
- stale, missing, archived, restored, deleted, unauthorized, resolved, and
  retargeted targets;
- notification detail fallback without private existence leaks;
- no source mutation from notification read/archive/open;
- no private data in screenshots, test snapshots, logs, or copied examples;
- no OS push permission prompt during first-launch/deep-link routing.

Remaining blockers:

- #371 Figma/reference approval for exact notification-open frames.
- Auth/session/security policy before security-event routes.
- Source event availability for future route families.
- #634 for real push provider/mobile registration behavior.
- #635 for admin/global notification policy/readout.
- #369 for remaining Day 1 notification event-family acceptance.

Keep #371 open after this reference. This document is a handoff gate, not
Flutter implementation or final Day 1 notification deep-link acceptance.
