# Payment Integration Functional Spec

## Purpose

Define user-facing behavior for payment method profiles, QR/payment instructions, payment provider attempts, provider evidence, incoming transaction reflection, and receiver confirmation.

## User goals

Users should be able to:

- configure payment methods in their profile
- show payment details only to authorized counterparties
- generate/copy/share payment instructions where supported
- pay through external apps/providers where available
- mark payments as paid manually
- confirm received payments
- optionally use provider evidence to reduce manual confirmation work
- keep raw provider account data private

## Payment method profile behavior

Users can add payment methods such as:

```text
manual_bank_note
custom_qr
fps_hk
sepa_epc
paypal_manual_link
paypal_api
```

A payment method can be:

- display-only/manual
- QR/payment instruction capable
- linked provider capable

Visibility defaults should be least-privilege, preferably settlement-counterparty-only.

## Primary flows

### Manual payment

1. Payee configures manual payment details.
2. Payer views payment details where authorized.
3. Payer pays externally.
4. Payer marks paid.
5. Payee confirms receipt manually.

### QR/payment instruction

1. Payer opens settlement/payment request.
2. App generates payment instruction or QR where supported.
3. Payer uses external app/bank/wallet to pay.
4. Payer marks paid unless provider evidence is available.
5. Payee confirms receipt manually or by policy.

### Provider payment attempt

1. Payee has supported provider method or valid provider destination.
2. Payer clicks provider payment action.
3. Payer approves with provider.
4. Settleora records provider evidence after validation.
5. Settlement becomes provider-verified.
6. Receiver confirms manually or auto-confirms if policy allows.

### Incoming transaction reflection

1. User links provider account.
2. User enables incoming reflection.
3. App imports/receives provider transaction evidence where provider allows.
4. App suggests matches to settlements/payment requests/refunds.
5. User reviews or policy auto-confirms high-confidence matches where allowed.

## Status concepts

Settlement and payment status should keep evidence and confirmation separate.

Recommended settlement states:

```text
requested
payer_claimed_paid
provider_verified
receiver_confirmed
disputed
cancelled
reopened
```

Recommended evidence types:

```text
payer_claim
proof_attachment
provider_capture
provider_incoming_transaction
statement_match
```

## Privacy and visibility

- Payment profile details are visible only where configured and authorized.
- Provider account history is private to the linked account owner by default.
- Group members may see only authorized linked settlement/payment evidence.
- Provider secrets/tokens are never visible to users after setup.

## Acceptance criteria

- Users can configure manual payment details.
- Authorized counterparties can view allowed payment details.
- Payment instruction/QR flows remain external handoff unless provider evidence exists.
- Provider evidence does not silently receiver-confirm unless policy allows.
- Users can manually confirm/reject/dispute payment evidence.
- Raw provider transaction feeds are private by default.

## Non-goals

- Holding user funds.
- Becoming a bank/payment processor.
- Direct bank API sync as first provider integration.
- Provider webhooks acting as final settlement authority.
- Exposing raw provider history to group members.
