# Notification Policy Resolver Wiring Design

## Purpose

This document is the docs/design control gate for GitHub issue
[#687](https://github.com/tommytang213/Settleora/issues/687),
`Notification policy resolution runtime wiring`, under parent
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It defines the future notification-policy resolver wiring model, design-level
inputs, precedence, output categories, channel semantics, audit/redaction
integration, dependency gates, future test plan, rollout posture, and
recommended implementation split.

This is a resolver wiring design gate only. It does not implement or approve
runtime resolver code, API endpoints, database schema, EF migrations, OpenAPI
contracts, generated clients, provider sending, provider secrets, device-token
handling, admin UI, user web UI, mobile UI, deployment, CI, production audit
plumbing, notification constants or writers, auth/session/security runtime,
money, settlement, bill, payment, OCR, storage, sync behavior, Figma output, or
[#371](https://github.com/tommytang213/Settleora/issues/371)
notification-open/deep-link behavior.

This packet prepares a later implementation task after these design packets are
accepted:

- [Admin notification policy schema and API design](ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md).
- [Notification provider readiness policy](NOTIFICATION_PROVIDER_READINESS_POLICY.md).
- [Notification policy readout UX reference](../design/notifications/NOTIFICATION_POLICY_READOUT_UX_REFERENCE.md).
- [Notification policy audit and redaction coverage](NOTIFICATION_POLICY_AUDIT_REDACTION_COVERAGE.md).

Runtime implementation remains blocked until the dependency gates in this
document are explicitly cleared.

## Design Inputs

This design inherits the boundaries in:

- [Admin global notification policy](ADMIN_GLOBAL_NOTIFICATION_POLICY.md).
- [Admin notification policy schema and API design](ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md).
- [Notification provider readiness policy](NOTIFICATION_PROVIDER_READINESS_POLICY.md).
- [Notification policy audit and redaction coverage](NOTIFICATION_POLICY_AUDIT_REDACTION_COVERAGE.md).
- [Notification policy readout UX reference](../design/notifications/NOTIFICATION_POLICY_READOUT_UX_REFERENCE.md).
- [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md).
- [Day 1 notification event coverage review](DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md).
- [Notification target reference gap review](NOTIFICATION_TARGET_REFERENCE_GAP_REVIEW.md).
- [Auth/session/security notification source policy](AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md).
- [Sync notification source policy](SYNC_NOTIFICATION_SOURCE_POLICY.md).
- [OCR needs-review notification source policy](OCR_NEEDS_REVIEW_NOTIFICATION_SOURCE_POLICY.md).
- [Push provider device-token lifecycle](PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md).
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md).

In-app remains the Day 1 baseline where an event is supported, eligible,
authorized, and privacy-safe. Email and mobile push remain optional external
attempts only when all resolver gates allow them. SMS is unsupported for Day 1.

## Resolver Responsibility Boundary

Future effective notification-policy resolution belongs in the API/domain
boundary. The resolver should compose source-domain event facts, policy,
preferences, provider readiness, timing rules, device/platform availability,
and audit/redaction categories into one effective decision for each event,
recipient, and channel.

The resolver must preserve these authority boundaries:

- API/domain owns effective notification-policy resolution.
- Source API/domain services own event existence, recipient eligibility,
  authorization, source business truth, money truth, storage access, sync
  acceptance, OCR acceptance, auth/session state, and source audit.
- Clients may display server-provided readouts and let users narrow optional
  preferences where policy allows. Clients must not decide authorization,
  event existence, recipient eligibility, delivery eligibility, provider
  readiness, money truth, or audit truth.
- Workers, outbox processors, and provider adapters may process approved
  delivery attempts later. They must not mutate core business tables directly
  or invent notification-policy decisions.
- Provider readiness is an input only. It cannot create events, authorize
  recipients, widen admin/global policy, widen user/group preferences, override
  content safety, or claim delivery success.
- User, group, and thread preferences can narrow optional delivery only. They
  cannot enable a disabled channel, invent provider readiness, bypass
  security/money/privacy policy, authorize a recipient, or suppress required
  in-app behavior unless a reviewed policy explicitly allows that suppression.
- Admin/global policy caps and security, money, and privacy rules remain
  authoritative.

Notification visibility is not authorization. Any opened notification must
continue to re-fetch current notification detail and linked resources through
authorized API paths.

## Resolver Input Model

The following input groups are design-level only. They are not approved schema
fields, DTOs, EF entities, OpenAPI schemas, generated-client contracts, or final
enum names.

### Event And Source Inputs

- Event type and event family.
- Source-domain state and source transition category.
- Event support status for Day 1 and for the current deployment.
- Source ownership and whether the source domain authoritatively created the
  event.
- Priority or requiredness category, such as normal, attention, required,
  money-critical, security-critical, privacy-sensitive, OCR-sensitive, or
  storage-sensitive.
- Safe subject references approved for the event family.

### Actor And Request Context

- Current actor, system, worker, or internal source category.
- Request/correlation context.
- Workspace/deployment authority boundary.
- Local-only versus server-mode posture where relevant.
- Idempotency context for retryable source actions or delivery decisions.

### Recipient And Access Inputs

- Recipient authorization for the source resource.
- Recipient profile/account status where approved.
- Group membership or direct-sharing context where relevant.
- Recipient role or responsibility, such as affected user, owner, editor,
  counterparty, responsible OCR reviewer, or operation owner.
- Self-notification policy for the event.

### Content Safety Inputs

- Content safety/privacy class for in-app, email, and push.
- External content class, such as in-app-only, generic-external-only, or safe
  summary allowed.
- Redaction requirement for the source event family.
- Whether the channel can render a privacy-safe title, body, action, and
  target without exposing forbidden data.

### Policy Inputs

- Admin/global channel caps.
- Admin/global event-family and event-type caps.
- Timing caps for immediate, digest, deferred, or expiry behavior.
- Sensitivity caps for security, money, privacy, OCR, storage, auth/session, or
  provider-sensitive events.
- Event-family overrides under the global policy.
- Required in-app, mute bypass, quiet-hours bypass, external-blocked, or
  generic-external-only policy.

### Provider And Device Inputs

- Provider readiness state for each external channel.
- Deployment/operator/provider maintenance, degraded, failing, rate-limited, or
  unknown posture.
- Verified email or recipient email availability where future email runtime
  approves it.
- Device/platform availability for push.
- Push permission state and active token/device binding category where #634
  approves the interaction.
- Worker/outbox availability where external attempt persistence exists.

### Preference And Timing Inputs

- Current user notification preference.
- Group, default, or thread preference.
- Group or thread mute state.
- Quiet-hours settings.
- Digest policy and current digest eligibility.
- Deferral, retry, queue, and expiry policy.

### Audit And Correlation Inputs

- Audit/redaction policy version.
- Policy version or effective policy reference.
- Provider-readiness category reference.
- Request correlation ID.
- Source event correlation ID.
- Idempotency key reference or equivalent safe correlation handle, not the raw
  idempotency key if that key is sensitive.

## Resolver Precedence And Short-Circuit Rules

Future resolver implementation should evaluate each event, recipient, and
channel in this order:

1. Event support, eligibility, source ownership, recipient authorization, and
   content safety.
2. Admin/global channel, event-family, timing, and sensitivity caps.
3. Provider readiness state.
4. Security/money required in-app or external redaction rules.
5. User preference.
6. Group/default/thread preference or mute.
7. Quiet-hours, digest, deferral, and expiry rules.
8. Device/platform availability and worker/outbox availability.
9. Audit/redaction category generation.

This order reconciles the earlier #635/#684 order with the #686 provider
readiness decision. Provider readiness is an early external-delivery gate after
admin/global caps, because unready providers should fail closed before user or
group preferences can be interpreted as delivery availability. Security/money
and privacy policy still remains authoritative after readiness and can keep
events in-app-only or force generic external content even when a provider is
ready.

Earlier blocks short-circuit later external delivery. Examples:

- Unsupported event type, unsafe source state, unauthorized recipient, or unsafe
  content blocks both in-app and external delivery for that recipient/channel
  unless another safe in-app representation is explicitly approved.
- Admin/global disabled, unsupported, event-family-blocked, timing-blocked, or
  sensitivity-blocked states block external delivery before preferences are
  evaluated.
- Provider `unsupported`, `disabled`, `unconfigured`, `failing`, or `unknown`
  blocks normal external attempts. `rate_limited`, `maintenance`, or
  `degraded` may defer or block according to a later approved retry/expiry
  policy.
- Security, money, or privacy rules may keep in-app eligible while blocking
  external email or push, or may allow only generic external copy.
- User, group, and thread preferences can narrow optional delivery, but cannot
  widen an earlier block.
- Quiet-hours and digest rules may defer optional external delivery while
  preserving in-app where safe and eligible.
- Missing push device/token state narrows push only. It must not block in-app
  or email by itself.
- Worker/outbox unavailable blocks or defers external attempts only. It must not
  claim success.

The most restrictive privacy rule wins. The most protective security rule wins
for security-impactful events. The resolver must not produce fake `sent`,
`delivered`, or provider-success states from policy, readiness, preference,
device, or queue data alone.

## Resolver Output Model

The following future outputs are conceptual candidates only. They are not
OpenAPI schema, EF model, generated-client contract, database enum, or UI
implementation approvals.

For each event, recipient, and channel, a future resolver may output:

- Effective channel decision per channel.
- Decision category.
- Readout category.
- Audit category.
- External attempt eligibility.
- Defer, queue, retry, expiry, or drop category.
- Provider readiness category used by the decision.
- Safe user-facing explanation key.
- Safe admin/operator explanation key.
- Safe content class or external redaction class.
- Redaction policy version.
- Policy version or policy reference.
- Idempotency/correlation key reference.
- In-app baseline eligibility category.
- External attempt not-before or expiry category where later scheduling exists.

Candidate decision categories:

- `eligible_in_app`
- `eligible_external_attempt`
- `blocked_by_event_support`
- `blocked_by_source_state`
- `blocked_by_authorization`
- `blocked_by_content_safety`
- `blocked_by_admin_policy`
- `blocked_by_provider_readiness`
- `blocked_by_security_policy`
- `blocked_by_money_policy`
- `blocked_by_privacy_policy`
- `blocked_by_user_preference`
- `blocked_by_group_preference`
- `deferred_by_quiet_hours`
- `deferred_to_digest`
- `deferred_by_provider_state`
- `blocked_by_device_unavailable`
- `blocked_by_token_missing`
- `blocked_by_worker_unavailable`
- `queued_for_external_attempt`
- `external_attempted`
- `external_failed_transient`
- `external_failed_permanent`

Candidate readout categories should align with the #685 reference vocabulary,
such as `unsupported`, `disabled`, `unconfigured`, `ready`, `degraded`,
`failing`, `rate_limited`, `maintenance`, `unknown`, `muted`,
`quiet_hours_deferred`, `digest_deferred`, `device_unavailable`,
`token_missing`, `queued`, `sent_or_attempted`, `failed_transient`,
`failed_permanent`, `blocked_by_admin_policy`, `blocked_by_security_policy`,
`blocked_by_privacy_policy`, `blocked_by_user_preference`, and
`blocked_by_group_preference`.

Candidate audit categories should align with #688 safe categories, including
provider readiness categories, delivery deferred/queued/attempted/failure
categories, admin/security/privacy/user/group block categories, `token_missing`,
and `device_unavailable`.

## Channel Semantics

### In-App Baseline

In-app is the reliable Day 1 baseline for supported events where the recipient
is authorized and the event content can be represented safely. In-app
eligibility depends on event support, source ownership, recipient
authorization, source-domain rules, and content safety. It does not depend on
SMTP, APNs, FCM, external provider readiness, mobile push tokens, or external
worker availability.

Required, money-critical, and security-impactful events should preserve in-app
visibility where safe and eligible unless a reviewed policy explicitly allows a
bounded suppression.

### Email

Email is an optional external attempt. It requires:

- event/channel eligibility;
- admin/global and event-family caps;
- privacy-safe email content;
- provider readiness for the email path;
- user/group preference allowance;
- timing allowance;
- recipient email availability where later runtime approves that input;
- worker/outbox availability where external attempts are persisted.

Email must use generic or safe-summary copy according to the content class. It
must not include raw payment details, proof contents, OCR text, receipt text,
storage internals, auth/session details, hidden bill data, private notes,
provider diagnostics, or secrets.

### Mobile Push

Mobile push is an optional external attempt. It requires:

- event/channel eligibility;
- admin/global and event-family caps;
- privacy-safe push content, usually generic;
- APNs/FCM or provider-neutral readiness according to #686;
- user/group preference allowance;
- timing allowance;
- device/platform availability and active token category where #634 approves
  device-token interaction;
- worker/outbox availability where external attempts are persisted.

Missing token, revoked/stale token, denied permission, wrong platform, app
environment mismatch, or device unavailable narrows push only. It must not hide
in-app and must not become a provider success state.

### SMS

SMS is unsupported for Day 1. The resolver should return `unsupported` or omit
SMS from ordinary readouts. It must not expose SMS as a configurable Day 1
channel or fake a future provider path.

### Future Digest And Deferred Delivery

Digest and deferred delivery are timing categories, not delivery success.
Deferral may preserve in-app visibility while delaying optional external
attempts. Future digest/deferred runtime must distinguish:

- deferred by quiet hours;
- included in digest;
- deferred by provider maintenance/rate limit/degraded state;
- queued for later processing;
- expired before attempt;
- blocked before queueing.

### Unsupported, Unconfigured, Disabled, And Failing Providers

Provider categories are external-delivery inputs and readout categories:

- `unsupported`: block external attempt.
- `unconfigured`: block external attempt without failing normal user flows.
- `disabled`: block external attempt by policy/operator posture.
- `configured`: setup appears present but is not enough by itself to permit an
  attempt.
- `ready`: may allow an external attempt after all other gates pass.
- `degraded`, `rate_limited`, or `maintenance`: defer or block according to
  approved retry/expiry policy.
- `failing` or `unknown`: fail closed for external delivery.

Normal users should see product-facing fallback explanations, not provider
internals. Admin/operators may see bounded non-secret categories.

### Attempted Versus Confirmed

`queued` means an approved attempt was accepted for later processing. Success
is unknown.

`attempted` or `sent_or_attempted` means a future provider attempt happened or
was accepted according to an approved delivery vocabulary. It is not proof that
the user saw the notification.

Avoid `delivered` unless a future provider-specific design distinguishes
provider acceptance, mailbox/device delivery, app receipt, user visibility, and
user action.

## Audit And Redaction Integration

Resolver decisions must map to safe categories from
[Notification policy audit and redaction coverage](NOTIFICATION_POLICY_AUDIT_REDACTION_COVERAGE.md).

Required posture:

- Store no raw event payloads in resolver audit metadata.
- Redact before logs, audit, readouts, reports, comments, screenshots, tests,
  fixtures, metrics, and traces.
- Normalize provider errors, provider states, token/device states, and resolver
  denials into safe categories before persistence or display.
- Use safe categories for blocked, deferred, queued, attempted, failed,
  provider-unconfigured, provider-disabled, provider-degraded, provider-failing,
  rate-limited, maintenance, token-missing, and device-unavailable states.
- Record redaction policy version or equivalent safe policy reference where
  future audit schema approves it.
- Keep source-domain audit separate from notification policy audit. A resolver
  decision is not a substitute for money, settlement, bill, OCR, sync, storage,
  auth/session, or security source audit.

Forbidden in resolver outputs, audit metadata, logs, readouts, reports, issue
comments, screenshots, tests, and fixtures:

- SMTP secrets, API keys, app passwords, provider credentials, APNs keys,
  certificates, FCM service-account JSON, private keys, or service secrets.
- Raw device tokens, protected token blobs, reversible token forms, token
  ciphertext, or full token hashes.
- Provider payloads, request/response bodies, raw provider errors, dashboard
  exports, or provider request IDs where sensitive.
- Raw OCR text, receipt text, receipt images, file bytes, storage paths,
  object keys, bucket/container names, signed URLs, or storage internals.
- Payment details, payment handles, QR contents, proof contents, private notes,
  hidden bill data, hidden settlement details, itemized hidden shares, or
  unauthorized money details.
- Bearer tokens, refresh tokens, session cookies, reset tokens, recovery codes,
  MFA secrets, passkey private material, password hashes, raw session IDs, or
  auth/session secret material.
- Full unauthorized recipient lists, hidden group membership, unrelated user
  data, private hostnames where sensitive, queue internals where sensitive, or
  worker IDs where sensitive.

## Implementation Dependency Gates

Future runtime implementation is blocked until all applicable gates are cleared:

- #684 schema/API implementation gate is approved for persistence and API
  contracts.
- OpenAPI/generated-client gate is approved if public contracts change.
- #686 provider-readiness implementation exists or a safe input contract is
  explicitly approved.
- #688 audit/redaction implementation strategy is approved.
- Manual admin/security review approves resolver behavior, required-event
  handling, security/money bypass posture, and admin/operator exposure.
- #634 approves any device-token, device state, push provider, or provider
  interaction used by the resolver.
- #685 readout reference is accepted. #685 is already closed unless reopened by
  a concrete reference regression.
- Figma/UI gates clear before admin, user web, mobile, or notification-detail
  surfaces use resolver outputs.
- Source-domain gates clear before new event families or event types depend on
  resolver behavior.

This document does not approve schema, OpenAPI, generated-client, runtime,
provider, device-token, UI, deployment, CI, or production audit changes.

## Future Test Plan

Future implementation should include focused coverage for:

- Precedence/order unit tests for all resolver stages.
- Admin/global caps cannot be widened by user, group, thread, device, provider,
  or cache state.
- Security and money required in-app behavior, including external blocked or
  generic-only behavior.
- Provider readiness cannot create events, authorize recipients, widen policy,
  or invent delivery success.
- Unsupported, unconfigured, disabled, failing, unknown, rate-limited,
  maintenance, and degraded provider states block or defer external attempts as
  approved.
- Quiet-hours and digest defer optional external delivery without losing in-app
  where safe and eligible.
- Device unavailable, permission denied, stale/revoked token, or token missing
  narrows push only.
- Block categories for privacy, security, admin policy, user preference, group
  preference, source state, authorization, and content safety.
- Idempotency and correlation behavior for repeated resolver calls, retryable
  source actions, and external attempt queueing.
- Audit/redaction category tests proving forbidden data is absent.
- API authorization tests if resolver readout or admin endpoints exist.
- OpenAPI/generated-client validation if public contracts exist.
- Provider readiness adapter tests once #686 implementation exists.
- Device-token state tests only after #634 approves the relevant contract.
- UI copy/snapshot tests only after #685/Figma/UI implementation gates clear.
- #371 notification-open/deep-link regression tests remain unchanged.

Tests must also prove notification read/archive does not mutate source money,
settlement, payment, bill, OCR, sync, storage, auth/session, security, provider,
or audit state.

## Failure And Rollout Posture

Future resolver implementation should use conservative rollout behavior:

- Fail closed for external delivery when policy, readiness, authorization,
  source state, content safety, device state, or worker/outbox state is
  unknown.
- Preserve the in-app baseline where the event is supported, eligible,
  authorized, and safe.
- Do not fail app startup solely because optional external providers are
  missing, disabled, unconfigured, degraded, or in maintenance.
- Do not turn provider unconfigured state into normal-user runtime exceptions.
- Self-hosted deployments stay safe by default with external channels disabled
  or unconfigured until intentionally configured.
- No fake success states. Provider readiness, queue acceptance, preference
  allowance, or policy allowance is not delivery success.
- If resolver configuration is invalid, block external attempts and return safe
  admin/operator categories. Do not leak raw configuration or secrets.
- If audit/redaction policy is unavailable, do not emit raw diagnostic payloads
  as a fallback. External attempts should fail closed or be held until safe
  categorization is available.

## Future Implementation Split Recommendation

Recommended sequence:

1. Manual review of this #687 resolver design packet.
2. If approved, implement a small API/domain resolver skeleton behind
   feature-neutral tests, with no public API, schema, provider sending,
   device-token handling, UI, or OpenAPI change unless separately approved.
3. Add schema/API/OpenAPI tasks only after the #684 implementation gate clears.
4. Add provider-readiness adapter input only after the #686 implementation gate
   or a safe input contract clears.
5. Add audit/redaction helper tests and audit hooks only after the #688
   implementation gate clears.
6. Surface readouts only after #685 reference, API/readout, Figma, and
   surface-specific UI gates clear.
7. Run final acceptance through #689 after all prerequisite implementation,
   validation, manual/security, provider, audit, and UI gates are satisfied.

Keep implementation slices small. Do not combine resolver runtime, schema,
OpenAPI, generated clients, provider sending, device-token behavior, admin UI,
mobile UI, and audit plumbing in one branch.

## Parent And Child Posture

- #687 remains open after this design gate unless the close rule is clearly
  satisfied after a future PR merge.
- #635 remains open.
- #684, #686, and #688 remain open unless their own close rules are separately
  satisfied.
- #685 remains closed unless a concrete reference regression exists.
- #689 remains open for final acceptance after prerequisite work.
- #403, #369, #368, and #634 remain open for their respective notification,
  provider, event-family, and push/device-token scopes.
- #371 remains closed and must not be redone without a concrete regression or
  separately approved route-family task.
- Runtime implementation remains blocked.

## Non-Pass Statement

This document is not a pass for #687 runtime implementation, #635 parent
completion, #689 final acceptance, Day 1 notification acceptance, provider
activation, production readiness, release readiness, admin exposure, UI
readiness, schema approval, OpenAPI approval, generated-client approval, or
audit-plumbing approval.
