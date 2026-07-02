# Mobile Notification Open Figma Reference Package

## Status And Boundary

This is the focused #371 Figma/reference review package for exact
notification-open states. It packages the already-approved route policy and
mobile notification-open reference into a designer-ready frame inventory,
prompt, guardrails, and acceptance checklist.

This package does not approve Flutter implementation, Figma output,
screenshots, binary assets, generated design assets, route runtime,
notification writer runtime, backend/API behavior, OpenAPI contracts, generated
clients, EF schema/migrations, auth/session/security runtime,
settlement/payment/bill/OCR/sync/recurring behavior, provider sending, APNs,
FCM, SMTP, Firebase, secrets, deployment, Docker, CI, #634 push implementation,
#635 admin/global policy/readout, #369 event-family runtime, issue closure, or
Project field mutation.

Use this package with:

- [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md)
- [Mobile More and Settings reference V1](MOBILE_MORE_SETTINGS_REFERENCE_V1.md)
- [Mobile Notifications reference V1](MOBILE_NOTIFICATIONS_REFERENCE_V1.md)
- [Mobile Notification Open States reference](MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md)
- [Mobile Push Registration UX reference](MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md)
- [Mobile Auth Security reference V1](MOBILE_AUTH_SECURITY_REFERENCE_V1.md)
- [Mobile implementation guardrails V1](MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md)
- [Notification deep-link route policy](../../architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md)

Figma Make/token usage is not required for #371 review. The repo-native
[Notification Open TSX reference package](reference-tsx/notification-open/README.md)
is an equivalent Figma-token-free review path for the frame inventory below.
It uses static TSX and local CSS only; it is not Flutter implementation, Figma
output, generated design source, API behavior, route metadata, OpenAPI,
generated-client, schema, provider, or runtime authority.

## Exact Frame Inventory

Create one coherent Figma/reference set that covers these frames. Frames may
share components, but each state below must be visibly reviewable.

| Frame | Required content | Primary actions |
| --- | --- | --- |
| Notification inbox and selected row | Notification Center with the approved top bell entry behavior, grouped rows, unread/read state, and one selected row entering a detail/open state. | `Open notification`, `Back` |
| Notification detail loading and authorized re-fetch | Skeleton or progress state that shows the app is refreshing the notification and linked target through authorized paths before rendering details. | Safe back navigation only |
| Bill workflow/revision open | Authorized bill or bill revision notification context using current product copy and no hidden line details. | `Open bill`, `Review bill`, `Back to notifications` |
| Settlement request/payment/proof open | Authorized settlement request/payment/proof summary without proof contents, payment handles, QR contents, or payment-detail internals. | `Review settlement`, `Back to notifications` |
| `settlement.residual_review_needed` open | Authorized residual-review handoff that presents bounded current status without external money preview copy or private residual internals. | `Review settlement`, `Back to notifications` |
| Recurring due/draft generated open | Authorized recurring due or generated draft context with current status and no raw template payload. | `Open bill`, `Back to notifications` |
| `ocr.needs_review` open | Receipt review assignment context without raw OCR text, receipt contents, extracted lines, file paths, or file bytes. | `Review receipt`, `Back to notifications` |
| `sync.conflict_detected` / `sync.operation_failed` open | Current-actor sync issue readout that avoids raw queued payloads, request bodies, cache data, paths, or hidden server data. | `Review sync issue`, `Back to notifications` |
| Sign-in required | User must sign in to a server account before notification or target detail is shown. | `Sign in`, `Back to notifications` |
| Wrong account / account switched | Generic account-mismatch state that does not reveal target existence. | `Switch account`, `Back to notifications` |
| Local-only mode fallback | Server notification target cannot open in local-only mode; copy explains server account requirement without implying target existence. | `Connect server account`, `Back to notifications` |
| Offline / server unavailable fallback | Refresh failed because the server is unavailable; cached data is only a hint and not current authorization. | `Retry`, `Back to notifications` |
| Stale/missing target fallback | Notification or linked target is no longer available; avoid naming private resources. | `Back to notifications` |
| Archived/deleted/restored target fallback | Current authorized status for archived/restored targets where visible, and generic unavailable copy for deleted/unavailable targets. | `Open bill`, `Review settlement`, `Back to notifications` |
| Unauthorized / group membership changed fallback | Generic not-available-to-this-account state with no private existence leak. | `Back to notifications` |
| Already resolved/completed fallback | Current resolved/completed readout if authorized, with stale action buttons removed. | `Open bill`, `Review settlement`, `Back to notifications` |
| Push disabled / provider unconfigured readout | Settings/readout state surfaced from notification settings, clearly separated from notification-open authorization. | `Notification settings`, `Back to notifications` |
| Generic notification-detail fallback | Safe notification detail from the authorized notification response when the linked resource cannot be opened safely. | `Retry`, `Back to notifications` |

The frames should be phone-width, scroll-safe, safe-area aware, and designed
for content overflow. Long detail states must scroll without hiding bottom
navigation, pinned actions, or final copy.

## Paste-Ready Figma Make / Designer Prompt

```text
Create an exact Settleora mobile Figma/reference package for #371
notification-open states. Use the approved Settleora mobile shell and
references: Mobile design reference V1, More and Settings V1, Notifications V1,
Mobile Notification Open States reference, Push Registration UX reference, Auth
Security V1, and Mobile implementation guardrails V1.

Do not invent a new visual language. Match the existing modern rounded fintech
Settleora styling, spacing, type scale, visual rhythm, status chips, bottom
sheets where useful, top bell notification entry, and stable Home / Bills /
Groups / Settle / More bottom nav behavior. Use the dark mobile direction
unless the approved reference explicitly says otherwise. Design scrollable
states where content can overflow; do not let sticky actions or nav chrome
cover content.

Build reviewable frames for:
- notification inbox / notification row selected state;
- notification detail loading / authorized re-fetch;
- bill workflow/revision notification open;
- settlement request/payment/proof notification open;
- settlement.residual_review_needed notification open;
- recurring due / draft generated notification open;
- ocr.needs_review notification open;
- sync.conflict_detected and sync.operation_failed notification open;
- sign-in required;
- wrong account / account switched;
- local-only mode fallback;
- offline / server unavailable fallback;
- stale/missing target fallback;
- archived/deleted/restored target fallback;
- unauthorized / group membership changed fallback;
- already resolved/completed fallback;
- push disabled / provider unconfigured readout from notification settings;
- generic notification-detail fallback.

Show product-facing UI only. In-app notification details are the source of
truth after authorized refresh; push and local notifications are only entry
points. Notification rows, push payloads, route state, local cache,
generated-client availability, and object URLs are not authorization.
Notification opens must refresh the current-user notification detail and then
re-fetch the linked bill, settlement, recurring bill, OCR review, or sync
operation through authorized API paths before showing target details or actions.

Use meaningful action labels such as Open bill, Review bill, Review
settlement, Review receipt, Review sync issue, Retry, Sign in, Switch account,
Notification settings, and Back to notifications. Do not use vague OK, Yes, or
Confirm labels when the action has a specific effect.

Keep all external and preview copy privacy-safe. Do not show money values,
raw OCR text, receipt contents, hidden bill details, private notes/comments,
proof/payment details, QR or payment handle contents, tokens, provider
payloads, fingerprints, storage paths/object keys, signed URLs, auth/session
material, private profile identifiers, raw IDs, generated-client wording, API
route names, stack traces, or developer diagnostics. Fallback states must avoid
confirming whether a private resource exists when the user is unauthorized.

Mark security/auth/session routes, item claim/split routes, OCR completed/failed,
remaining sync queued/retry/resolved routes, broader settlement mismatch/review,
provider/digest/admin/global policy, push-token, device-token, delivery-attempt,
and delivery-receipt routes as future/blocked. Do not design them as approved
current notification-open routes.
```

## UX And Copy Guardrails

- Use product-facing copy only. Do not show API route names,
  generated-client names, exception names, object IDs, debug identifiers,
  provider diagnostics, or developer-note text.
- Use specific button labels. Prefer `Open bill`, `Review bill`,
  `Review settlement`, `Review receipt`, `Review sync issue`, `Retry`,
  `Sign in`, `Switch account`, `Notification settings`, and
  `Back to notifications`.
- Avoid vague labels such as `OK`, `Yes`, `No`, `Submit`, or bare `Confirm`
  when the action has bill, settlement, receipt, sync, account, or settings
  meaning.
- In-app notification details remain the source of truth after authorized
  refresh. Push and local notifications are only entry points.
- Route state, notification row state, push payloads, local cache,
  generated-client availability, and object URLs are not authorization.
- Supported actions must be visually tied to authorized target state, not to
  cached notification metadata.
- Read/archive/open state remains inbox state. It must not imply source bill,
  settlement, payment, residual, proof, OCR, recurring, sync, storage, audit,
  auth/session, or money mutation.

## Privacy And Safety Restrictions

Do not include money values in push, local, lock-screen, or external preview
copy. In-app target details may show only the current viewer's authorized API
response in a future implementation; Figma examples should still use bounded,
generic placeholders unless exact approved screenshots later say otherwise.

Do not include:

- raw OCR text, receipt contents, extracted item lines, or parser output;
- hidden bill details, hidden shares, private notes, comments, or rejection
  reasons;
- proof/payment details, proof image/text contents, bank screenshots, QR
  contents, payment handles, account numbers, or payment notes;
- provider tokens, protected blobs, fingerprints, provider payloads, provider
  request/response bodies, credentials, certificates, service-account JSON,
  signing files, `.env` values, or auth/session material;
- storage paths, object keys, bucket names, signed URLs, local paths, file
  bytes, or storage provider internals;
- private profile identifiers, raw target IDs, raw route payloads, logs,
  stack traces, generated-client wording, or admin-only diagnostics.

Any opened notification must re-fetch the notification and linked resource
through authorized API paths before target details or actions are shown.
Fallback states must avoid confirming whether a private resource exists if the
current user is unauthorized or has switched accounts.

## Acceptance Checklist

Tommy first-review checklist:

- All frame inventory rows above are represented or intentionally combined
  without losing state-specific reviewability.
- The frames visibly inherit the approved Settleora mobile shell, More/Settings,
  Notifications, Push Registration, Auth Security, and implementation
  guardrails.
- The visual language is Settleora's modern rounded fintech mobile direction,
  not a new brand, new nav model, or unrelated app pattern.
- Bottom nav behavior remains `Home / Bills / Groups / Settle / More`, and
  notifications remain reachable from the top bell/global affordance.
- The design is acceptable for future Flutter implementation planning, or
  comments identify exact frame/copy changes required before implementation.

Assistant second-review checklist:

- UX/UI: loading, success, fallback, account, offline, settings, and scroll
  states are complete and usable on small, medium, and large phones.
- Accessibility: tap targets, contrast, status meaning, scroll reachability,
  focus order, and non-color status cues are reviewable.
- Consistency: typography, spacing, chips, buttons, sheets, empty/error states,
  and notification rows match approved mobile references.
- Privacy: no money values in external previews and no forbidden OCR, payment,
  proof, storage, token, provider, auth/session, or private-ID data appears.
- Product guardrails: copy is product-facing, actions are specific, and fallback
  states avoid private existence leaks.
- Authority: the frames show notification and target re-fetch before details
  or actions, and do not imply route/payload/cache authorization.

Figma/export evidence expectations:

- Provide a Figma link or exported screenshots for the full frame set.
- Export screenshots should be saved under
  `docs/design/mobile/assets/notification-open-figma-reference-package/` only
  in a later asset task after human approval; this package does not add assets.
- Evidence should identify the reviewed frame names, review date, reviewer, and
  whether approval is exact or has follow-ups.
- Do not use generated code, scraped Figma output, or binary assets as
  implementation source.

Conditions before Flutter implementation can be scoped:

- Tommy approves these exact frames/screenshots or explicitly approves the
  equivalent repo-native TSX reference package.
- #371 remains open but has a clear approved Figma/reference gate for the next
  implementation slice.
- A future Flutter task scopes only notification-open/deep-link UI/navigation
  and mobile tests unless it separately receives backend/API/OpenAPI authority.
- The future implementation task states that notification and target re-fetch
  through authorized API paths is required.
- The future implementation task confirms no backend/API/OpenAPI/generated
  client/schema changes are included unless a separate task explicitly approves
  them.

## Future Implementation Boundary

A future Flutter branch may start only after approved reference
frames/screenshots or an explicitly approved equivalent reference exists.

Future Flutter implementation must not add backend/API behavior, OpenAPI
contracts, generated clients, EF schema/migrations, notification writer
runtime, provider runtime, auth/session/security runtime, storage/file-byte
behavior, or money/bill/settlement/payment calculation changes unless a
separate task explicitly approves that scope.

#371 remains open after this package. This package is the Figma/reference gate,
not notification deep-link runtime acceptance.
