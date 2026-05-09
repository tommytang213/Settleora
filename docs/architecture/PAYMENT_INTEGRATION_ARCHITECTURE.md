# Payment Integration Architecture

## Purpose

This document defines Day 2 architecture for payment instructions, payment handoff, payment-provider connections, provider payment evidence, incoming payment reflection, and settlement confirmation boundaries.

Payment integration must improve settlement convenience without turning Settleora into the financial authority for external payment systems.

## Scope

Day 2 payment integration starts after the Day 1 manual settlement flow exists.

Supported directions:

- Manual payment details and instructions.
- Custom QR/payment image display.
- Generated country/provider-aware payment instructions.
- Optional provider-connected payment attempts.
- Optional incoming provider transaction reflection where provider access allows.
- Matching provider evidence to settlements, payment requests, refunds, and reimbursements.

Initial provider candidates:

```text
manual_copy
custom_qr_image
fps_hk_qr
sepa_epc_qr
paypal_manual_link
paypal_api
```

Future provider candidates:

```text
pix_br_qr
upi_in_qr
paynow_sg_qr
open_banking_provider
wallet_provider
custom_provider
```

## Authority principles

- The API/domain settlement service remains authoritative for settlement status transitions.
- Provider events are evidence, not final settlement truth by themselves.
- Provider webhooks must not directly mutate final settlement state.
- Provider evidence and receiver confirmation are separate concepts.
- Receiver auto-confirm is allowed only when explicit user/group policy permits it.
- Manual mark-paid and receiver confirmation remain available for all payment methods.
- Payment provider data must not bypass authorization, audit, or privacy rules.

Important rule:

```text
Provider evidence proves money movement evidence.
Receiver confirmation proves settlement acceptance.
```

## Payment method profile vs provider connection

Payment display data and provider connection data are separate layers.

### Payment method profile

A payment method profile is user-facing display/configuration data.

Suggested fields:

```text
id
owner_profile_id
type
country_code nullable
currency_code nullable
display_label
payee_name nullable
identifier_type nullable
identifier_value nullable
instructions nullable
static_qr_file_id nullable
visibility
linked_provider_connection_id nullable
created_at
updated_at
```

Examples:

```text
fps_hk
sepa_epc
paypal_manual_link
paypal_api
bank_transfer
custom_qr
custom_note
```

Payment method visibility defaults should remain least-privilege. Settlement-counterparty-only visibility is the recommended default.

### Provider connection

A provider connection is private/security-sensitive integration state.

Suggested fields:

```text
id
owner_profile_id
provider
provider_account_id nullable
provider_merchant_id nullable
onboarding_status
capabilities_json
supported_currencies_json
secret_reference nullable
incoming_reflection_enabled
auto_confirm_policy nullable
connected_at
last_verified_at nullable
revoked_at nullable
```

Provider secrets, tokens, webhook secrets, and refresh material must be stored through an approved secret boundary, not in profile display data, migrations, logs, generated clients, or API responses.

## Payment attempts

A payment attempt represents one external payment flow for one settlement, payment request, refund, or reimbursement.

Suggested fields:

```text
id
subject_type
subject_id
payer_profile_id
payee_profile_id
payment_method_profile_id nullable
provider_connection_id nullable
provider
amount
currency
reference
status
created_at
updated_at
expires_at nullable
```

Recommended statuses:

```text
created
payer_action_required
payer_approved
captured
provider_verified
failed
cancelled
reversed
disputed
refunded
```

Payment attempts should be idempotent where possible. Duplicate provider callbacks, repeated browser redirects, retries, and webhook replays must not create duplicate settlement transitions.

## Provider payment events

Provider events store external payment evidence before domain policy applies it to settlement state.

Suggested fields:

```text
id
provider
provider_event_id nullable
provider_payment_id nullable
payment_attempt_id nullable
owner_profile_id nullable
subject_type nullable
subject_id nullable
amount
currency
direction
status
occurred_at
received_at
raw_payload_ref nullable
normalized_payload_json
signature_verified
processing_status
```

Raw provider payloads may contain sensitive data. Store raw payloads only when needed for audit/debug, protect them as sensitive data, and avoid exposing them through ordinary user/group APIs.

## Settlement evidence and confirmation

Provider-aware settlements should not rely on a single `paid` flag.

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

Recommended behavior:

- Manual payment: payer marks paid, optional proof is attached, receiver confirms manually.
- Provider payment attempt: provider event creates provider evidence after validation, receiver confirms manually unless policy allows auto-confirm.
- Linked provider account: high-confidence provider verification may auto-confirm only when the payee or group policy allows it.
- Incoming transaction reflection: matched incoming provider transaction creates provider evidence, then follows receiver-confirmation policy.
- Disputes, reversals, refunds, and chargebacks must reopen or flag affected settlement records through domain policy.

## Payment instruction providers

Payment instruction providers generate payment details, QR payloads, links, or handoff instructions.

Suggested interface concept:

```csharp
public interface IPaymentInstructionProvider
{
    Task<PaymentInstructionResult> CreateInstructionAsync(
        PaymentInstructionRequest request,
        CancellationToken cancellationToken);
}
```

Instruction providers are not payment authorities. A QR code, payment link, or copied reference is a payment instruction only.

Examples:

- `ManualCopyPaymentInstructionProvider`
- `CustomQrPaymentInstructionProvider`
- `FpsHkQrPaymentInstructionProvider`
- `SepaEpcQrPaymentInstructionProvider`
- `PayPalManualLinkInstructionProvider`

## Direct provider integrations

Direct provider integrations can create payment attempts and receive provider evidence.

Suggested interface concept:

```csharp
public interface IPaymentProvider
{
    Task<ProviderPaymentAttemptResult> CreatePaymentAttemptAsync(
        ProviderPaymentAttemptRequest request,
        CancellationToken cancellationToken);

    Task<ProviderPaymentEventResult> HandleProviderEventAsync(
        ProviderPaymentEventRequest request,
        CancellationToken cancellationToken);
}
```

Initial direct API candidate:

```text
paypal_api
```

Provider integrations must:

- Keep provider secrets server-side.
- Verify webhook signatures where supported.
- Validate amount, currency, subject, payee, payer, and provider status before creating settlement evidence.
- Handle duplicate callbacks and replay safely.
- Record audit events for provider connection, payment attempt, provider event, evidence match, auto-confirm, refund, reversal, and dispute actions.

## Incoming provider transaction reflection

Linked provider accounts may support incoming transaction reflection when provider access, user consent, and policy allow it.

Capabilities:

- User can enable or disable incoming transaction reflection per provider connection.
- Imported provider transactions are private to the linked account owner by default.
- Incoming transactions can be matched to settlements, payment requests, refunds, or reimbursements.
- High-confidence matches may create provider evidence.
- Low/medium-confidence matches require user review.
- Users can manually link/unlink provider transactions.
- Auto-confirm is allowed only when payee/user/group policy explicitly allows it.

Provider transaction matching signals:

- Amount.
- Currency.
- Timestamp/date.
- Payee/payer identity where safely available.
- External reference.
- Settleora settlement/payment request reference.
- Provider transaction status.
- Existing match state.

Privacy rule:

```text
Provider transaction data is private account data.
Group members may see only linked settlement/payment evidence they are authorized to access, not raw provider account history.
```

## PayPal direction

PayPal should support multiple modes.

### Manual PayPal

Manual PayPal uses display-only payment details such as a PayPal link, email, handle, or note.

Flow:

```text
Payer opens PayPal outside Settleora.
Payer pays manually.
Payer marks paid in Settleora.
Receiver checks PayPal and confirms manually.
```

Settleora does not receive trusted provider evidence in this mode.

### PayPal API payment attempt

PayPal API payment attempts use a server-side provider integration.

Flow:

```text
Payer clicks Pay with PayPal.
Settleora API creates a payment attempt.
Payer approves in PayPal.
Settleora receives/captures/verifies provider result.
Settleora records provider evidence.
Receiver confirms manually or auto-confirms by policy.
```

If the payee has a linked PayPal provider connection, the payment destination and capabilities are stronger and auto-confirm may be allowed by policy.

If a provider supports API payment to a payee identifier that is not fully linked, Settleora may record provider evidence but should require manual receiver confirmation and explicit review of provider limitations.

### PayPal incoming reflection

For linked PayPal accounts, incoming PayPal payments may be reflected into Settleora only where provider API access and account permissions allow.

Reflected PayPal transactions should be private to the account owner by default and may create settlement evidence only after matching and API/domain validation.

## Storage and privacy

Payment QR images, payment proof files, provider payloads, and provider transaction imports are sensitive application data.

Rules:

- File bytes go through the storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses must not expose storage provider internals.
- File access requires API authorization.
- Raw provider account history must not be exposed to group members by default.
- Provider secrets and tokens must never be returned to clients.

## Audit

Audit events should cover:

- Payment method created/updated/deleted.
- Provider connection linked/revoked/reauthorized.
- Incoming reflection enabled/disabled.
- Payment instruction generated.
- Payment attempt created/cancelled/failed.
- Provider event received/verified/rejected.
- Provider evidence linked/unlinked.
- Receiver auto-confirm applied.
- Receiver manual confirmation.
- Provider refund/reversal/dispute detected.
- Provider transaction import/match/unmatch.

Audit records must avoid raw secrets, raw provider tokens, unnecessary raw payloads, and sensitive account history.

## Non-goals

- Direct bank API sync as the initial provider integration.
- Treating provider webhooks as final settlement truth without domain validation.
- Silent settlement confirmation from weak or unmatched provider events.
- Exposing raw provider transaction history to group members.
- Automatic dispute filing with banks or payment providers.
- Bypassing settlement authorization, audit, or policy.
- Making AI or imported provider data the financial authority.
