# Mobile Settle Reference V1

## 1. Reference Status

The Settle design slice is approved as the V1 design reference. It extends the approved mobile shell, app-wide shared components, and the `Settleora Midnight` visual direction from [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md).

Screenshots and exports, when present, live under `docs/design/mobile/assets/settle-v1/`. If that directory is absent in a branch, this written reference remains authoritative for composition and interaction direction; do not create broken image links or placeholder assets.

This document does not authorize Figma scraping, generated code import, OpenAPI changes, generated-client changes, runtime behavior changes, money calculation changes, settlement state changes, payment-provider behavior changes, schema changes, migrations, or storage behavior changes.

## 2. Settle Dashboard

The Settle tab uses the active bottom-nav state from the locked `Home / Bills / Groups / Settle / More` shell. The dashboard should answer what needs paying, what needs confirmation, and what the next useful settlement action is.

Dashboard content includes:

- Net position.
- You are owed.
- You owe.
- Pending confirmations.
- Currencies.
- Needs attention.
- Suggested next action.
- Recent settlement activity.

Amounts must include ISO currency codes and should not imply that multiple currencies have been simplified unless the API/domain response explicitly provides that view.

## 3. Balances List

The balances list shows people and group balances with:

- Amount plus ISO currency.
- Direction labels: `owes you`, `you owe`, and `settled`.
- Related group context.
- Status chip.
- Clear action affordance.

Filters:

- `All`
- `Owes you`
- `You owe`
- `Settled`

Rows should remain readable on narrow phones and avoid bare amounts, debug identifiers, internal settlement IDs, API route names, or generated-client details.

## 4. Suggested Settlements

Suggested settlements are same-group suggestions only. Each suggestion should show:

- Who.
- Amount and ISO currency.
- Group context.
- Reason.
- Clear action.

Do not imply cross-group debt simplification, global balance netting, credit-ledger behavior, automatic currency conversion, or settlement authority that the backend/domain has not provided.

## 5. Request Payment Flow

The request payment flow includes:

- Request from person.
- Amount and currency.
- Group/context.
- Related bill references.
- Optional note.
- `Share my payment instructions` toggle.
- Primary action: `Send request`.

Payment details are shared only when the user explicitly chooses to share them and API/domain policy allows that visibility. The UI must not expose payment details to unauthorized viewers or infer visibility from cached local state.

## 6. Settle Up / Payment Method Behavior

Manual or off-app payment methods show recipient payment instructions and use `Mark as paid` after the payer has completed the off-app payment.

Manual payment instruction cards include:

- Method name.
- Payee or recipient.
- Account, handle, reference, or note where available.
- Copy actions such as `Copy account` and `Copy reference`.

Integrated or provider payment methods such as PayPal use provider-aware calls to action, for example:

- `Continue to PayPal`
- `Pay with PayPal`
- `Open payment app`
- `Review and pay`

Do not use `Mark as paid` for provider redirect or payment-app flows before payment completes. Provider flows need state-aware cards for:

- Payment started.
- Awaiting provider confirmation.
- Payment failed.
- Try again.
- Choose another method.
- Manual fallback only when allowed.

When recipient payment details are missing, use a clear missing-details state with `Ask for payment details`.

## 7. Confirm Receipt Flow

The confirm receipt flow shows:

- Payer.
- Amount and ISO currency.
- Group/context.
- Proof indicator.
- Related bills.

Actions:

- `Confirm receipt`
- `Request correction`
- `Not received`

Avoid vague labels such as `OK`, `Yes`, `No`, `Submit`, or `Confirm` when the action has settlement meaning.

## 8. Settlement States, Detail, And History

Settlement states include:

- `Requested`
- `Marked paid`
- `Awaiting confirmation`
- `Confirmed`
- `Correction requested`
- `Disputed`
- `Cancelled`
- `Sync conflict`

The settlement detail screen shows:

- Status.
- Amount and ISO currency.
- Payer.
- Recipient.
- Group/context.
- Related bills.
- Proof chip.
- Timeline/activity.
- State-appropriate actions.

The history screen supports search, filters, and clear status chips. History copy should be product-facing and should not expose raw provider payloads, object IDs, API routes, storage paths, or debug wording.

## 9. Payment Proof And Payment Details Privacy

Payment proof and payment details are sensitive application data.

Rules:

- Use product-facing copy only.
- Do not expose storage paths, file IDs as user-facing text, object IDs, API routes, provider raw payloads, debug wording, generated-client details, or implementation-only labels.
- UI renders only payment details and proof visibility allowed by API/domain policy.
- Provider evidence may help show payment progress, but API/domain services remain authoritative for payment and settlement state transitions.

## 10. Shared Components Captured By Settle

Settle captures or exercises these shared components:

- Settlement summary card.
- Balance row.
- Settlement request row.
- Settlement status chip.
- Payment proof chip.
- Payment method detail card.
- Payment instruction row.
- Copyable payment detail row.
- Missing payment details state.
- Provider payment status state cards.
- Settlement timeline row.
- Confirmation action card.
- Correction/dispute warning card.
- Settlement action bottom sheet.
- Empty states.
- Loading states.
- Error states.

Future implementation should compose these from app-wide shared components and semantic design tokens before adding one-off settlement styling.

## 11. Implementation Acceptance Notes

- API/domain remains authoritative for money, settlement state transitions, payment state, authorization, audit, and sync.
- UI implementation must use shared components and semantic design tokens.
- Always show ISO currency codes and never bare amounts.
- Do not assume all currencies have two decimals.
- Do not silently simplify debts across groups.
- Do not infer payment-provider success from a launched app or redirect; render provider/payment state supplied by the authoritative layer.
- Sticky bottom actions and bottom nav need safe scroll padding.
- Support small, medium, and large phones.

This reference does not permit silent changes to runtime code, OpenAPI, generated clients, backend/API behavior, schema/migrations, auth/session/security, storage/file-byte behavior, settlement/payment/bill calculation authority, deployment, CI, or secrets.
