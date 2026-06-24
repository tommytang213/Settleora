# SMTP Email Provider Policy

## Purpose

This document defines Settleora's Day 1 SMTP email provider configuration and
policy boundaries. It is a documentation/control plan for how email can become
an optional notification channel without leaking credentials, pretending
unconfigured delivery succeeded, or moving notification policy into deployment
secrets.

It complements [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md).
The taxonomy defines event families, safe payload shape, shared delivery states,
and the in-app baseline. This document narrows the SMTP-specific provider,
secret, disabled-state, template, failure, audit, and follow-up boundaries.

This document does not authorize runtime SMTP sending, provider setup, database
schema changes, migrations, OpenAPI changes, generated-client changes,
background workers, Docker/Compose/environment changes, deployment behavior,
auth/session/security runtime changes, storage/file-byte changes,
money/settlement/payment/bill calculation changes, OCR runtime changes, mobile
or web/admin UI work, or secrets.

## Channel Baseline

Day 1 notification channels remain:

- `in_app`: guaranteed baseline for supported events.
- `email`: optional SMTP attempt only when deployment/provider readiness,
  admin policy, content safety, and user preference allow it.
- `mobile_push`: separate optional channel covered by future push and
  device-token lifecycle work.

SMTP is not a replacement for in-app notifications. Missing, disabled,
unsupported, unconfigured, deferred, queued, or failed SMTP state must never
hide the in-app notification for supported events. In-app remains the reliable
record the user can inspect after authorization recheck.

## Configuration Boundaries

SMTP has two separate configuration layers:

1. Deployment/provider configuration.
2. Product/admin notification policy.

Deployment/provider configuration owns deployment-specific connection and sender
values, including:

- SMTP host.
- SMTP port.
- TLS or STARTTLS mode.
- SMTP username.
- SMTP password or app password.
- From address.
- Reply-to address.
- Provider-specific timeout, rate, or connection limits where future runtime
  allows them.

Those values belong in deployment configuration or a secret facility approved by
the deployment model. They do not belong in product records, issue comments,
audit payloads, logs, API responses, generated docs with real values, test
snapshots, OpenAPI examples, generated clients, mobile/web UI copy, or Codex
reports.

Product/admin notification policy controls whether the email channel is allowed,
disabled, capped, digest-only, immediate-capable, event-category-limited, or
restricted for sensitive events. Admin policy is a product behavior cap; it
should store safe policy choices, not SMTP credentials.

Provider readiness is separate from user notification preference. A user may
prefer email, but that preference cannot make SMTP supported, configured,
valid, or enabled when deployment/provider readiness or admin policy says
otherwise.

## Secret Boundaries

SMTP credentials are secret delivery material. They must not be committed,
copied, displayed, or echoed through ordinary Settleora records or reports.

Forbidden locations for real or realistic SMTP secrets include:

- Repository files.
- Issue comments, pull request bodies, and review comments.
- App UI copy, admin readouts, screenshots, and design references.
- Audit metadata.
- Application logs, worker logs, request logs, traces, metrics, and validation
  output.
- API responses.
- OpenAPI examples and generated clients.
- Test snapshots, fixtures, and golden files.
- Codex task reports.
- Sample config files with real-looking hostnames, users, passwords, tokens, or
  app passwords.

Examples may use only obvious placeholders, such as:

```text
SMTP_HOST=<smtp-host-placeholder>
SMTP_PORT=<smtp-port-placeholder>
SMTP_USERNAME=<smtp-username-placeholder>
SMTP_PASSWORD=<smtp-password-placeholder>
SMTP_FROM_ADDRESS=<from-address-placeholder>
SMTP_REPLY_TO_ADDRESS=<reply-to-address-placeholder>
```

Do not use private hostnames, real provider accounts, real domains controlled by
operators, realistic app-password formats, copied provider dashboard values, or
values that look usable.

## Provider And Preference States

SMTP channel state should remain explicit enough for users, admins, audit, and
validation to understand why an email was or was not attempted. The state model
must not collapse disabled, missing, deferred, and failed into one generic
success or hidden no-op.

Required policy-level states:

| State | Meaning |
| --- | --- |
| `disabled_by_admin` | Product/admin policy disables email for the deployment, event category, sensitivity level, or recipient class. |
| `unsupported_by_deployment` | The deployment does not support SMTP/email delivery for this install or mode. |
| `provider_unconfigured` | SMTP is supported in principle, but required deployment/provider values are missing. |
| `provider_invalid` | SMTP configuration exists but fails validation, readiness, or a future safe test-send check. |
| `disabled_by_user` | The recipient's notification preference disables email where user choice is allowed. |
| `group_muted` | Group or thread mute suppresses optional email where policy allows. |
| `quiet_hours_deferred` | Email is delayed by quiet-hours policy. |
| `digest_pending` | Email is queued for a digest rather than immediate send. |
| `queued` | An email attempt is accepted for later processing; success is not known. |
| `sent` | A future provider accepted the outbound SMTP attempt; this is not proof the user saw it. |
| `failed` | SMTP attempt failed or the provider rejected it. |

The notification taxonomy's shared states `unsupported`, `unconfigured`,
`disabled`, `muted`, `deferred`, `queued`, `sent`, and `failed` may be used for
public summaries. Internal/admin readouts may use the more specific reason
categories above when they can do so without exposing secrets or sensitive
payload.

Avoid `delivered` unless a future implementation has explicit provider delivery
receipt semantics and separate documentation proves how provider acceptance,
mailbox delivery, bounces, and user visibility are distinguished.

## No-Fake-Success Rule

Missing, unsupported, disabled, unconfigured, invalid, deferred, digest-pending,
queued, or failed SMTP state must never be represented as a delivered email.

Policy requirements:

- If provider readiness is missing, the email channel result is
  `provider_unconfigured` or `unsupported_by_deployment`, not `sent`.
- If admin policy disables email, the result is `disabled_by_admin`, not
  skipped-with-success.
- If user preference disables email, the result is `disabled_by_user`, not
  delivered.
- If quiet hours or digest policy delays email, the result is explicit deferred
  state, not immediate success.
- If a future provider attempt fails, the result is `failed` with a redacted
  reason category, not success.
- In-app notification creation and read/archive state must not depend on SMTP
  success.

Email attempt state should be auditable and supportable without revealing SMTP
credentials, message bodies, raw template variables, sensitive file/payment/OCR
material, or provider internals.

## Privacy-Safe Template Rules

Email templates must be safe for inboxes, notification previews, forwarding,
shared devices, logs, and provider-side processing. Email is an external
channel; it should carry only the minimum action context needed to bring the
recipient back to Settleora.

Default template rules:

- Prefer stable IDs, neutral labels, and generic action copy over sensitive
  business details.
- Use bounded subject and snippet text, such as "A bill needs review" or "A
  settlement update is available".
- Link targets must require re-auth where needed and must re-fetch through
  authorized API paths. The email link itself is not authorization.
- Avoid sensitive money details when unsafe, including full amounts, itemized
  lines, hidden participant shares, bank/payment handles, proof details, full
  financial records, and settlement internals.
- Avoid raw OCR text, receipt text, file bytes, attachment contents, filenames
  where sensitive, storage paths, object keys, bucket names, signed URLs, and
  provider internals.
- Avoid tokens, reset/recovery codes, MFA secrets, passkey material, session
  identifiers that act as credentials, and raw auth provider payloads.
- Avoid full comment bodies, private notes, rejection reasons, abuse details,
  full IP addresses, unbounded user-agent strings, and unrelated user data
  unless a later reviewed template explicitly classifies a bounded value as
  safe.
- Security-sensitive templates should be generic externally and route the user
  to authenticated security/session detail screens.

If an event family cannot produce a privacy-safe email subject/snippet/body, the
event remains in-app only until a separate template review approves a safe
external template.

## Delivery Failure Handling

This document defines policy-level failure handling only. It does not implement
queues, retry workers, SMTP libraries, bounce handling, or UI.

Future runtime slices should preserve these boundaries:

- Retry may be allowed only for errors classified as retryable without exposing
  provider credentials or message content.
- Non-retryable provider or policy failures should become explicit failed or
  blocked states.
- Deferred and digest-pending states should remain distinguishable from provider
  failures.
- User-visible wording should avoid provider internals and secrets. Use
  language such as "Email was not sent because email is not configured for this
  deployment" or "Email could not be sent; the in-app notification is still
  available."
- Admin-visible wording may include redacted reason categories, such as
  `provider_unconfigured`, `authentication_failed_redacted`,
  `tls_required`, `rate_limited`, `recipient_rejected`, or
  `provider_unavailable`, but must not include credentials, raw SMTP commands,
  message bodies, full recipient lists beyond authorized admin views, or
  private provider diagnostics.
- Future test-send behavior must use safe placeholder or operator-entered
  addresses under explicit admin action and must not persist message content or
  credentials in logs/audit.

## Audit And Logging Expectations

SMTP-related audit and logs should answer what policy decision occurred without
leaking why in a secret-bearing way.

Allowed bounded fields include:

- Notification event family and event type.
- Stable notification ID, recipient profile ID, source subject ID, and
  correlation/request/job IDs where already safe for the relevant audit/log
  boundary.
- Channel state, such as `provider_unconfigured`, `disabled_by_admin`,
  `quiet_hours_deferred`, `queued`, `sent`, or `failed`.
- Provider readiness category, such as configured, unconfigured, unsupported, or
  invalid.
- Redacted reason category.
- Template key/version, not full rendered body by default.
- Created, queued, attempted, and classified timestamps.
- Admin policy version or safe policy identifier where useful.

Forbidden fields include:

- SMTP hostnames from private environments when those hostnames are sensitive.
- SMTP usernames, passwords, app passwords, tokens, and provider credentials.
- Raw SMTP commands, raw provider responses with credentials, and connection
  strings.
- Rendered email bodies where they include user data.
- Raw template variables, full OCR text, file bytes, payment details,
  settlement proof contents, bank/payment screenshots, storage internals,
  private notes, reset/recovery codes, MFA/passkey material, session tokens, or
  unrelated user data.

Audit records for source business/security actions remain separate from
notification attempt logs. A notification `sent` state is not proof that a bill,
settlement, OCR review, sync conflict, or security event was accepted,
resolved, paid, confirmed, reviewed, or acknowledged.

## Relationship To Notification Taxonomy

The notification taxonomy remains the parent control for event families,
recipient derivation, safe payload envelope, delivery-state vocabulary,
preference resolution, and validation.

SMTP email is an optional channel attempt under that taxonomy. It is eligible
only after these checks pass:

1. Event family is eligible for external email.
2. A privacy-safe email template exists.
3. Deployment/provider readiness supports SMTP.
4. Admin policy allows email for the event and recipient class.
5. User preference allows email where user choice is allowed.
6. Group/thread mute does not suppress the optional attempt.
7. Quiet-hours or digest policy either allows immediate send or records explicit
   deferred/digest state.

In-app notification remains the guaranteed baseline for supported events and
must continue to use authorized API re-fetch when opened.

## Relationship To Follow-Ups

This document prepares #449 only.

- #403 remains the broad notification parent.
- #450 push/provider and device-token lifecycle remains separate.
- #451 notification preference resolution remains separate.
- #452 notification UI/reference work remains Stream A/UI gated and requires
  Figma/reference review.

Future SMTP runtime work must be a separate manually gated implementation slice
if it touches provider configuration, secrets, deployment/env files, schema,
OpenAPI/generated clients, workers, auth/security behavior, admin/public
exposure, UI, or production operations.

## Validation Expectations For Future Runtime

Future implementation slices should add focused validation proving:

- No SMTP secrets appear in repository files, responses, logs, audit metadata,
  snapshots, generated docs, generated clients, or reports.
- Missing, disabled, unsupported, unconfigured, invalid, deferred, queued, and
  failed provider states never appear as delivered email.
- User preference cannot enable email when admin/deployment policy disables it
  or provider readiness is missing.
- Group mute, quiet hours, digest policy, and privacy-safe templates are applied
  before any optional email attempt.
- In-app notifications remain available for supported baseline events even when
  SMTP is unavailable or fails.
- Linked resources reauthorize on open.
- Email templates exclude raw OCR text, file bytes, payment details, storage
  internals, tokens, codes, and full financial records.

Docs-only changes to this policy should run documentation validation. Runtime
SMTP/provider changes require their own issue scope, manual gates, and the
validation class implied by the touched files.
