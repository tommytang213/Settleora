# Payment Integration Technical Spec

## Purpose

Define implementation boundaries for payment method profiles, provider connections, payment attempts, provider events, incoming transaction reflection, authorization, audit, and privacy.

## Architecture boundaries

- API/domain settlement services own settlement state transitions.
- Provider events are evidence, not final settlement truth.
- Webhooks must be verified, idempotent, audited, and safe to replay.
- Provider secrets/tokens must be stored through a secret boundary.
- Payment display data and provider connection data are separate.
- Raw provider account history is private by default.

## Domain concepts

Suggested domain areas:

```text
PaymentMethodProfiles
PaymentProviderConnections
PaymentAttempts
ProviderPaymentEvents
ProviderTransactionImports
PaymentEvidenceLinks
```

Suggested service boundaries:

```text
IPaymentMethodProfileService
IPaymentInstructionProvider
IPaymentProvider
IProviderEventIngestionService
IPaymentEvidenceMatcher
IPaymentAuthorizationService
IPaymentAuditWriter
```

## Payment method profile

Display/configuration data may include:

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

This data must not contain raw provider secrets or tokens.

## Provider connection

Private provider connection data may include:

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

## Payment attempts

Payment attempts may include:

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

## Provider events

Provider events may include:

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

Raw payloads must be treated as sensitive and should not be exposed to ordinary user/group APIs.

## API direction

Future endpoints may include:

```text
GET  /api/v1/payment-methods
POST /api/v1/payment-methods
PATCH /api/v1/payment-methods/{id}
DELETE /api/v1/payment-methods/{id}
POST /api/v1/payment-provider-connections/{provider}/start
POST /api/v1/payment-provider-connections/{id}/disconnect
POST /api/v1/payment-attempts
POST /api/v1/payment-providers/{provider}/webhook
GET  /api/v1/provider-transactions
POST /api/v1/payment-evidence-links
DELETE /api/v1/payment-evidence-links/{id}
```

OpenAPI must be updated before generated clients.

## Authorization rules

API must verify:

- actor owns payment method profile being edited
- actor can view payee details for a settlement/payment request
- actor can initiate payment attempt for subject record
- actor owns provider connection or is authorized by policy
- actor can link/unlink provider evidence to target settlement/payment request/refund
- raw provider transaction views remain private to account owner

## Audit requirements

Audit events should cover:

- payment method created/updated/deleted
- provider connected/revoked/reauthorized
- incoming reflection enabled/disabled
- payment instruction generated where policy requires
- payment attempt created/cancelled/failed
- provider event received/verified/rejected
- provider evidence linked/unlinked
- receiver auto-confirm applied
- refund/reversal/dispute detected

Audit must avoid raw provider secrets, tokens, and unnecessary raw payloads.

## Validation and tests

Required test categories:

- user cannot view unrelated payment methods
- payment details visibility policy enforced
- provider secret never returned by API
- webhook signature verification required where supported
- duplicate webhook does not duplicate settlement transition
- amount/currency/payee mismatch rejected
- provider evidence does not auto-confirm unless policy allows
- provider transaction feed private by default
- manual fallback still works

Validation commands:

```powershell
dotnet tool restore
dotnet restore
dotnet build
dotnet test
npm run validate:openapi
npm run validate:api
```

## Failure modes

Handle:

- provider unavailable
- webhook delayed or duplicated
- payer abandons approval
- payment captured but settlement cancelled
- provider reversal/refund/dispute
- payee connection revoked
- unsupported currency
- secret store unavailable
- self-hosted instance not publicly reachable for webhooks

## Non-goals

- Holding user funds.
- Becoming a bank.
- Direct bank API sync as initial provider integration.
- Provider webhooks as final settlement authority.
- Exposing raw provider history to group members.
- Client-side provider secret handling.
