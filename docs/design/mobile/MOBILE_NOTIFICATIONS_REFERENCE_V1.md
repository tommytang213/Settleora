# Mobile Notifications Reference V1

## 1. Reference Status

The Notification Center / Activity Inbox / Review Queue design slice is approved as the V1 design reference. It extends the approved mobile shell, app-wide shared components, and the `Settleora Midnight` visual direction from [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md).

Screenshots and exports live under `docs/design/mobile/assets/notifications-v1/`.

This document describes desired mobile composition, interaction, product copy direction, and implementation guardrails. It does not authorize Figma scraping, generated code import, OpenAPI changes, generated-client changes, runtime behavior changes, push delivery behavior, notification preference persistence, auth/session/security changes, money calculation changes, settlement state changes, schema changes, migrations, or storage behavior changes.

## 2. Entry Point

The Notification Center opens from the top bell icon or global notification affordance. It is not a new bottom-nav tab.

When opened from a tab screen, the originating bottom tab can remain highlighted so the user keeps context. Notifications should behave as a global overlay, pushed screen, or modal route depending on the implementation pattern, but the primary navigation model remains `Home / Bills / Groups / Settle / More`.

## 3. Notification Center

The Notification Center shows:

- Unread count badge.
- Filter chips: `All`, `Needs action`, `Bills`, `Groups`, `Settle`, `Sync`, and `Security`.
- Rows grouped by time.
- Unread and read states.
- Source icons.
- Title, context, and time.
- Clear tappable affordance.

Example notification types:

- Receipt review.
- Bill acceptance.
- Settlement awaiting confirmation.
- Payment request.
- Group invite.
- Sync conflict.
- Security alert.

Rows should scan quickly without exposing storage paths, proof contents, hidden payment details, provider payloads, raw config, API routes, object IDs, generated-client details, or debug wording.

## 4. Needs Action And Review Queue

Needs action / Review Queue includes actionable items only. Each card or row includes:

- Clear source area.
- Title.
- Context.
- Status chip.
- Action buttons.

Actions include:

- `Review receipt`
- `Review bill`
- `Accept invite`
- `Confirm receipt`
- `Resolve conflict`
- `Review correction`
- `Request correction`

Only show actions that the API/domain response says are allowed. Disabled or unavailable actions can be shown when useful, but the UI must not decide authorization, status transitions, payment state, settlement state, or sync acceptance from local assumptions.

## 5. Safe Action Wording

List/card notification actions for settlement payment should use `Review payment` or `Review settlement` before final confirmation.

Detail-screen final actions can use `Confirm receipt`, `Request correction`, and `Not received` after details and allowed proof summary are visible.

Avoid vague labels such as `OK`, `Yes`, `No`, `Submit`, or `Confirm` when the action has bill, settlement, security, sync, or payment meaning.

## 6. Notification Detail

Notification detail screens show:

- Person.
- Amount with ISO currency code.
- Group/context.
- Timestamp.
- Related bill or settlement link.
- Status.
- Proof summary if allowed.
- Activity timeline.
- Available actions.

Proof/file internals must not be exposed. Show product-facing proof summaries only when API/domain policy allows the current actor to see them.

## 7. Bulk And Triage

Bulk/triage actions can include:

- Mark read.
- Archive.
- Open related.
- Clear resolved.

Archiving notifications must not delete the underlying bill, settlement, group, proof, receipt, attachment, or record. Bulk actions should use exact wording and safe confirmation when the action might hide important security, sync, payment, or settlement context.

## 8. Empty, Loading, And Error States

Notification states include:

- No notifications yet.
- All caught up.
- Loading skeleton.
- Notification sync failed.
- Retry.

Empty states should remain concise and product-facing. Error states should explain the user action available now without exposing API routes, provider payloads, object IDs, raw config, or debug text.

## 9. Shared Components Captured By Notifications

Notifications captures or exercises these shared components:

- Notification row.
- Unread badge.
- Source icon.
- Notification status chip.
- Action-required card.
- Notification detail card.
- Bulk action bar.
- Empty states.
- Loading states.
- Error states.

Future implementation should compose these from app-wide shared components and semantic design tokens before adding one-off notification styling.

## 10. Privacy And Security Guardrails

Notifications may mention sensitive finance activity, but must not reveal:

- Storage paths.
- Proof contents.
- Hidden payment details.
- Provider payloads.
- Raw config.
- API routes.
- Object IDs.
- Debug or internal wording.

API/domain remains authoritative for allowed actions, authorization, status transitions, audit, sync, payment state, settlement state, and money truth. Notification visibility, read/archive state, and deep links do not authorize underlying business data by themselves.

This reference does not permit silent changes to runtime code, OpenAPI, generated clients, backend/API behavior, schema/migrations, auth/session/security, storage/file-byte behavior, settlement/payment/bill calculation authority, deployment, CI, or secrets.
