# Mobile Groups Reference V1

## 1. Reference Status

The Groups design slice is approved as the V1 design reference. It extends the approved mobile shell, app-wide shared components, and the `Settleora Midnight` visual direction from [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md).

Screenshots and exports, when present, live under `docs/design/mobile/assets/groups-v1/`. If that directory is absent in a branch, this written reference remains authoritative for composition and interaction direction; do not create broken image links or placeholder assets.

This document does not authorize Figma scraping, generated code import, OpenAPI changes, generated-client changes, runtime behavior changes, membership authorization changes, money calculation changes, settlement logic changes, schema changes, migrations, or storage behavior changes.

## 2. Groups Navigation/List Direction

The Groups tab uses the active bottom-nav state from the locked `Home / Bills / Groups / Settle / More` shell. The list screen should support:

- Search groups.
- Filter chips: `All`, `Needs attention`, `Pinned`, and `Archived`.
- Group cards with group name, member count, current balance summary, outstanding/pending indicators, recent activity, status chips, and a clear tappable affordance.

Group cards should scan quickly without exposing internal IDs, API route names, generated-client details, storage paths, or debug copy. Amounts must include ISO currency codes where displayed.

## 3. Group Dashboard

The group dashboard should make the group identity and current financial context clear before deeper actions. It includes:

- Group identity, member count, and group/member status.
- A summary hero card for the group.
- Month spend.
- You owe.
- Owed to you.
- Pending bills.
- Recent bills.
- Upcoming recurring group bills.
- Visible primary actions: `Add bill`, `Scan`, `Settle`, and `More`.

The `More` bottom sheet contains explicit action rows:

- `Manage members`
- `Invite member`
- `View balances`
- `Group settings`
- `Reports`
- `Archive group`

The dashboard may show disabled or unavailable actions when the API/domain response indicates they are not available, but the UI must not decide authorization from local assumptions.

## 4. Needs-Attention State

Groups should surface actionable attention states with product-facing wording:

- Bill needs review.
- Receipt/OCR mismatch.
- Settlement awaiting confirmation.
- Sync conflict.
- Pending invite.

Action labels should name the actual user action. Examples:

- `Review bill`
- `Fix receipt`
- `Confirm receipt`
- `Resolve conflict`
- `Resend invite`
- `Cancel invite`
- `View invite`

Invite actions depend on viewer role, invite state, and API/domain authorization. Avoid vague labels such as `OK`, `Submit`, or icon-only destructive controls for meaningful state transitions.

## 5. Members And Manage Members

Member rows show:

- Avatar or initials.
- Name.
- Role.
- Participation/status.
- Balance summary.
- Clear action affordance.

Current-user copy should use `You` or equivalent where helpful and avoid confusing self-directed debt language. For example, prefer a readable personal balance summary over copy that implies the user owes themselves.

Role and status chips may include:

- `Owner`
- `Member`
- `Pending`

Manage members uses explicit menu or action rows instead of vague red `X` controls. Member actions can include:

- `Change role`
- `Remove member`
- `Cancel invite`
- `Resend invite`

Destructive or member-changing actions require exact wording and must be backed by API/domain authorization, audit, and membership policy. The UI may present confirmation states, but it must not make membership, role, participation, or historical-access decisions independently.

## 6. Group Bill Context

Group bill creation and editing should reuse the Bills/OCR shared components from [Mobile Bills and OCR reference V1](MOBILE_BILLS_OCR_REFERENCE_V1.md). The group context includes:

- Add group bill with the group preselected.
- Participants default to `Everyone in group`.
- `Customize participants`.
- `Paid by` selector.
- Split method.
- Split preview.

Participants, payer choices, and split previews are presentation and form state until accepted by the API/domain layer. For receipt-based entry, OCR-derived data remains provisional until reviewed and accepted by the appropriate authority boundary.

## 7. Group Balances/Settlement Preview

The group balances view should clearly separate:

- Who owes you.
- Who you owe.
- Settled or de-emphasized rows where applicable.
- Suggested same-group settlement action.

Suggested settlement actions must remain same-group only. Do not imply cross-group debt simplification, broad netting, credit-ledger behavior, or settlement authority that the backend/domain has not explicitly provided.

## 8. Shared Components Captured By Groups

Groups captures or exercises these shared components:

- Group card.
- Group dashboard summary card.
- Member row.
- Member role/status chips.
- Group balance row.
- Group bill context section.
- Manage member selector.
- Invite/member action row.
- Empty states.
- Loading states.
- Error states.
- Invite failed states.
- Group dashboard `More` action sheet.

Future implementation should compose these from app-wide shared components and semantic design tokens before adding one-off group styling.

## 9. Implementation Acceptance Notes

- UI displays allowed, unavailable, and disabled actions, but it does not decide authorization.
- API/domain remains authoritative for membership, participation, money, settlement state, role changes, audit, and sync.
- Avoid exposing internal IDs, debug copy, API routes, storage paths, generated-client details, provider payloads, or implementation-only wording.
- Use shared components and semantic design tokens.
- Money display must include amount and ISO currency code.
- Member-changing and destructive actions need exact, user-facing wording.
- Bottom nav, sticky actions, sheets, and long member/balance lists need safe scroll padding.
- Support small, medium, and large phones.

This reference does not permit silent changes to runtime code, OpenAPI, generated clients, backend/API behavior, schema/migrations, auth/session/security, storage/file-byte behavior, settlement/payment/bill calculation authority, deployment, CI, or secrets.
