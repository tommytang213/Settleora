# Notification Delivery-State Worker Foundation

## Purpose

This document defines the architecture/control boundary for GitHub issue
[#633](https://github.com/tommytang213/Settleora/issues/633),
`Implement notification delivery-state persistence and worker foundation`.

The purpose is to define how future Settleora work may persist external channel
delivery attempt state and process those attempts through a provider-neutral
worker/outbox foundation.

This document separates:

- In-app unread/read/archive inbox state.
- The #629 decision-envelope channel eligibility result.
- External channel delivery attempts.
- Future SMTP provider runtime.
- Future mobile push provider runtime.
- Future admin/global notification policy.
- Future device-token lifecycle.

This is a docs/control architecture review. It does not implement runtime
behavior, database schema, migrations, OpenAPI contracts, generated clients,
provider sending, device-token storage, admin UI, deployment configuration, or
secrets.

## Non-Goals

This review must not be read as approval for any implementation that would:

- Treat in-app notification rows, read state, or archive state as email or push
  delivery truth.
- Pretend provider success for unsupported, disabled, unconfigured, deferred,
  queued, failed, or suppressed channels.
- Mutate source business state, including bills, settlements, recurring bills,
  OCR reviews, sync operations, auth/session records, storage records, audit
  records, or money truth.
- Send SMTP email or mobile push notifications.
- Store SMTP credentials, provider credentials, raw device tokens, provider
  payloads, rendered message bodies, or raw sensitive content.
- Approve provider secrets, deployment/env changes, OpenAPI changes, generated
  clients, schema migrations, UI, admin exposure, or public/admin runtime.

## Authority Boundaries

API/domain services own notification delivery attempt acceptance. They must
decide recipient authorization, event eligibility, channel eligibility,
idempotency, redaction, audit-safe metadata, persistence design, and whether an
external attempt may be queued.

Workers may process delivery attempts only through API/domain-created
queue/outbox records or through a separately approved service boundary with the
same authority controls. Workers must not independently derive recipients,
re-open suppressed channels, bypass user/admin policy, or decide business truth.

Workers must not directly mutate core business tables. A worker may update only
delivery-state records through an approved service boundary that enforces
idempotency, status transitions, retry policy, redaction, and audit/logging
rules.

Providers and provider adapters must not decide whether a bill, settlement,
OCR review, sync operation, auth/session event, file, or policy event exists.
They must not decide recipient eligibility, privacy policy, authorization,
money truth, source status transitions, or audit truth. Provider adapters may
only classify provider outcomes into bounded redacted result categories after an
API/domain-authorized attempt exists.

## Relationship To #629

Issue #629 and PR #630 added the internal notification decision-envelope
foundation. That foundation decides channel eligibility and bounded reasons for
`in_app`, `email`, and `mobile_push` without SMTP sending, push sending,
delivery workers, queues, device tokens, provider success, schema changes,
OpenAPI changes, or generated-client changes.

#629 output is input to future #633 implementation work only as an eligibility
and reason signal. It is not a persisted delivery attempt, not a provider
request, and not delivery success.

Future #633 implementation may persist external delivery attempt records only
after API/domain checks decide that a specific recipient, event, and external
channel is eligible, queued, deferred, disabled, unconfigured, suppressed, or
otherwise explicitly classified.

The in-app baseline remains separate. Supported in-app notifications must remain
available to authorized users regardless of whether email or push is disabled,
unconfigured, deferred, queued, sent, or failed. In-app unread/read/archive
state must not depend on provider delivery success.

## Delivery-State Vocabulary

Future delivery-state persistence should use a conservative provider-neutral
vocabulary. These names are architecture guidance only in this task; do not add
constants, OpenAPI enum values, generated-client models, or database constraints
without a future implementation task.

| State | Meaning | Provider runtime required |
| --- | --- | --- |
| `not_applicable` | The event or recipient has no applicable external-channel attempt for this channel. | No |
| `disabled` | Admin policy, user preference, group mute, or event policy disables the channel. | No |
| `unconfigured` | The channel is supported in principle but required provider, deployment, or recipient/device setup is missing. | No |
| `deferred` | The attempt is delayed by quiet hours, digest policy, scheduling, or another approved deferral rule. | No |
| `queued` | API/domain accepted an external attempt for later worker processing; success is not known. | No |
| `attempting` | A worker has claimed or started an attempt under an approved lease/idempotency rule. | Yes |
| `sent` | A provider accepted the outbound attempt. This is not proof the user saw it. | Yes |
| `failed_transient` | A retryable provider, network, rate-limit, or temporary platform failure occurred. | Yes |
| `failed_permanent` | A non-retryable provider, recipient, token, policy, or content failure occurred. | Yes |
| `suppressed` | Delivery was intentionally blocked by policy, mute, content safety, recipient eligibility, or privacy rules. | No |
| `cancelled` | A previously queued or deferred attempt was cancelled before provider send because source eligibility, policy, or expiry changed. | No |
| `expired` | The attempt exceeded its useful delivery window and must not be sent. | No |

Before provider runtime exists, implementation may record only pre-provider
states such as `not_applicable`, `disabled`, `unconfigured`, `deferred`,
`queued`, `suppressed`, `cancelled`, and `expired` where a future schema slice
explicitly approves them. It must not record `attempting`, `sent`,
`failed_transient`, or `failed_permanent` unless a worker/provider slice
actually classifies those outcomes.

Avoid `delivered` unless a later provider-specific design distinguishes
provider acceptance, mailbox/device display, app receipt, user visibility, and
user action.

## Proposed Persistence Model

Future schema work should introduce delivery-attempt persistence separately
from `user_notifications` in-app inbox state. The exact entity/table names are
future implementation details, but the model should have boundaries equivalent
to:

- Delivery attempt ID.
- Safe reference to the in-app notification or notification candidate where
  such a reference is appropriate and authorized.
- Recipient user profile ID.
- Channel, such as `email` or `mobile_push`.
- Event type and subject type.
- Target safe IDs needed for authorization and correlation, such as bill,
  settlement, OCR review, sync operation, recurring occurrence, or auth/session
  policy target IDs only where already approved for that recipient.
- Decision snapshot reason from the #629-style decision envelope or later
  resolver.
- Status from the delivery-state vocabulary.
- Idempotency key and correlation key.
- Attempt count and max-attempt policy reference.
- Next-attempt timestamp and expiry timestamp.
- Redacted provider result category where provider runtime exists.
- Created, updated, first-attempted, last-attempted, completed, cancelled, or
  expired timestamps as applicable.

Delivery-state persistence must not store raw notification content, rendered
email bodies, raw push payloads, raw OCR/receipt text, raw payment details,
private notes, file bytes, storage paths, storage object keys, signed URLs,
local paths, hidden bill details, SMTP credentials, provider credentials,
auth/session tokens, recovery codes, MFA/passkey material, raw device tokens,
or provider secrets.

This model requires a future schema/migration task. This document does not
approve or create the migration.

## Worker And Outbox Policy

Future queue/outbox records must be created by API/domain code after
authorization, event, channel, preference, provider-readiness, content-safety,
and idempotency checks.

Workers process delivery attempts, not source business state. They should load
or claim a delivery attempt, render only the approved provider-neutral safe
payload, call the approved provider adapter where runtime exists, and update
delivery-state records through an allowed service boundary.

Worker rules:

- Use idempotency keys so duplicate source actions, retries, worker restarts,
  and provider retry paths cannot create duplicate provider sends.
- Use leases or equivalent claim records so concurrent workers do not process
  the same attempt unsafely.
- Retry only `failed_transient` categories within bounded retry and expiry
  policy.
- Never retry `disabled`, `unconfigured`, `suppressed`, `cancelled`,
  `expired`, or `failed_permanent` without a new API/domain decision.
- Recheck cancellation, expiry, policy version, recipient eligibility, and
  provider readiness before sending if the attempt was deferred or queued for a
  meaningful time.
- Classify provider results into redacted categories only.
- Avoid provider tokens, SMTP credentials, raw device tokens, provider payloads,
  raw provider responses, rendered bodies, and sensitive template variables in
  logs, audit, metrics, traces, tests, and reports.
- Do not log or persist raw OCR/receipt text, payment details, private notes,
  storage paths, signed URLs, object keys, local paths, hidden bill details, or
  unrelated private data.

Provider adapters should return bounded result categories such as
`accepted`, `rate_limited`, `provider_unavailable`, `recipient_rejected`,
`invalid_token`, `authentication_failed_redacted`, `configuration_invalid`, or
`content_rejected`, without carrying secret-bearing provider diagnostics into
ordinary persistence or audit.

## OpenAPI And Generated-Client Posture

Internal persistence-only delivery-state work may not require OpenAPI or
generated-client changes if no user, admin, or mobile contract exposes delivery
attempt records.

Any user-facing delivery-state readout, admin diagnostic readout, delivery-state
API, provider health API, device-token API, or policy API requires explicit
OpenAPI and generated-client gates. OpenAPI remains the source of truth, and
generated clients must be regenerated from the contract rather than edited by
hand.

Provider runtime must not expose provider internals through public contracts.
Allowed contract shape should use bounded channel, status, and redacted reason
categories. It must not expose SMTP host/user/passwords, provider credentials,
raw device tokens, raw push payloads, rendered email bodies, provider request
IDs where sensitive, storage internals, raw OCR/receipt text, payment details,
or private diagnostics.

## Testing Matrix For Future Implementation

Future implementation must include tests appropriate to the changed surface:

| Area | Required proof |
| --- | --- |
| Decision envelope to attempt creation | External delivery attempts are created only for API/domain-authorized eligible external channels. |
| Disabled/unconfigured/deferred states | Disabled, unconfigured, deferred, suppressed, and not-applicable outcomes do not create fake `sent` states. |
| In-app state isolation | In-app unread/read/archive behavior is unaffected by external delivery attempts and provider outcomes. |
| Worker idempotency | Duplicate jobs, replayed source actions, worker restart, and retry paths do not duplicate sends or corrupt attempt state. |
| Retry classification | Transient failures retry within policy; permanent failures, cancelled, expired, suppressed, disabled, and unconfigured states do not retry silently. |
| Source business isolation | Workers and provider adapters do not mutate bills, settlements, payments, OCR reviews, recurring templates, sync operations, auth/session records, storage records, source audit, or money truth. |
| Sensitive data exclusion | Attempts, logs, audit, metrics, tests, and provider payload builders exclude raw OCR/receipt, payment details, private notes, storage paths/object keys/signed URLs/local paths, hidden bill details, tokens, secrets, and raw provider payloads. |
| Provider failure redaction | Provider failures are persisted and exposed only through bounded redacted reason categories. |
| OpenAPI/client drift | If no contract changes are intended, OpenAPI and generated clients remain unchanged; if contracts change, generated clients are regenerated and reviewed. |
| Schema safety | Any later migration is additive/non-destructive unless a separate manual migration gate explicitly approves otherwise. |

## Recommended Implementation Split

#633 should not be implemented as one broad branch. The safer split is:

1. Schema/persistence model for provider-neutral delivery attempts, with
   additive migration and no provider sending.
2. Provider-neutral attempt API/domain service that consumes decision envelopes
   and creates queued/deferred/suppressed attempt records without OpenAPI
   exposure unless explicitly needed.
3. Worker/outbox processing foundation that claims attempts, enforces
   idempotency/retry/expiry, and updates attempt state through the approved
   service boundary without SMTP or push provider calls unless a provider slice
   is explicitly in scope.
4. SMTP provider adapter/runtime under #632 after provider/secrets/deployment
   gates are cleared.
5. Mobile push/device-token/provider runtime under #634 after provider,
   mobile-release, schema, OpenAPI, and Figma/UI gates are cleared.
6. Admin/user readout or diagnostics API only if required by #635 or a later
   explicit readout task with OpenAPI/generated-client gates.

Recommended next #633 posture: keep #633 open and gated. The first
implementation slice can be prepared only after the schema/persistence model
scope is approved as additive and provider-neutral. Do not move #633 to
`Ready for Codex` unless that first slice is explicitly narrowed to
persistence/service foundation with no provider runtime, no secrets, no UI, and
no admin exposure.

## Remaining Gates

- Schema/migration gate for any delivery-attempt table/entity.
- OpenAPI/generated-client gate for any external contract or readout.
- Provider/secrets/deployment/env gate for SMTP runtime.
- Provider/secrets/mobile release/device-token/Figma gate for push runtime.
- Admin/security/UI gate for admin/global policy or diagnostics.
- Auth/session/security manual policy gate before security-impactful external
  notification behavior or bypass logic.
- Source-state gates for remaining OCR completed/failed, item claim/split,
  settlement mismatch/residual/review, and broader sync notification families.

## Non-Pass Statement

This document is not implementation approval for #633 and does not close #633.
It defines the architecture boundary and recommended split so future work can
start with a narrow provider-neutral persistence/service slice after the
remaining gates are cleared.
