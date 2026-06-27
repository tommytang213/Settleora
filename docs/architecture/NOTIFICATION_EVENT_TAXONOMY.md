# Notification Event Taxonomy

## Purpose

This document defines the Day 1 notification event taxonomy and control
boundaries for Settleora. It is a planning/control document for notification
event ownership, safe payload shape, privacy exclusions, in-app baseline
behavior, delivery-state vocabulary, audit expectations, and validation.

It does not authorize runtime implementation, database schema changes,
migrations, OpenAPI changes, generated-client changes, email provider setup,
mobile push provider setup, SMS, UI implementation, auth/session/security
runtime changes, storage/file-byte changes, money/settlement/payment logic
changes, OCR runtime changes, Docker/CI/deployment changes, or secrets.

## Day 1 Channel Baseline

Day 1 notification channels are:

- `in_app`: guaranteed baseline for supported events.
- `email`: optional SMTP attempt only when admin/deployment policy, provider
  configuration, content safety, and user preferences allow it.
- `mobile_push`: optional mobile push attempt only when admin/deployment policy,
  provider configuration, device registration, platform permission, content
  safety, and user preferences allow it.

SMS is not a Day 1 channel.

In-app notifications remain visible for supported security-critical and
money-critical events even when optional channels are disabled, muted,
unconfigured, deferred, or failed. Email and push are optional attempts behind
provider and policy gates; they must not be reported as successful when the
provider is unsupported, unconfigured, disabled, muted, deferred, queued, or
failed.

Notification visibility is not proof of authorization. Any linked bill,
settlement, file, OCR review, group, friend, account, sync, or security resource
must be fetched through the authorized API path when opened. Clients render
notifications, read/archive state, summaries, and delivery readouts; clients do
not become authorization, money, settlement, storage, sync, audit, or business
state authority.

## Safe Event Envelope

Every notification event family uses this control shape:

- Owning source domain/service boundary that decides whether an event exists.
- Stable recipient profile IDs derived server-side from current authorization
  and business state.
- Stable subject IDs only, such as `expenseBillId`, `expenseBillRevisionId`,
  `settlementRequestId`, `settlementPaymentId`,
  `recurringBillTemplateId`, `recurringBillOccurrenceId`, `groupId`,
  `friendRequestId`, `commentThreadId`, `ocrReviewId`, `syncOperationId`, or
  `authSessionId` where that ID is safe for the target recipient.
- Versioned event type, title/message template keys, priority, created time,
  and a short `safeSummary` when needed.
- Optional relative action target that routes through API-backed authorization
  or client routes that re-fetch through authorized APIs.

Notification payloads, delivery logs, audit metadata, and channel snippets must
not contain raw secrets, SMTP credentials, provider credentials, device tokens,
auth tokens, session tokens, refresh tokens, reset tokens, recovery codes,
password material, MFA secrets, passkey private material, full OCR text, raw file
contents, storage paths, storage object keys, bucket names, provider internals,
vault keys, raw payment details, full bank/payment proof text, private notes, or
unrelated sensitive content.

Email and push snippets must be privacy-safe. They should prefer generic action
copy such as "A bill needs review" or "A settlement update is available" over
merchant names, full amounts, participant lists, OCR text, comments, proof
details, payment handles, or security details. Any event family that cannot
produce a privacy-safe snippet is in-app only until a reviewed template policy
allows otherwise.

## Shared Delivery And State Vocabulary

Use this vocabulary for channel delivery and user state:

| State | Meaning |
|---|---|
| `unsupported` | Channel or event category is not supported for this deployment, platform, event, or Day 1 scope. |
| `unconfigured` | Channel is supported in principle but provider/configuration is missing. |
| `disabled` | Admin/deployment policy or user preference disables the channel. |
| `muted` | Group, thread, event category, or user preference suppresses optional delivery where policy allows. |
| `deferred` | Delivery is intentionally delayed for quiet hours or digest policy. |
| `queued` | Delivery attempt is accepted for later processing; success is not yet known. |
| `sent` | Provider accepted the outbound attempt. This is not proof the user saw it. |
| `failed` | Delivery attempt failed or provider rejected it. |
| `read` | The user marked or opened the in-app notification as read. |
| `archived` | The user removed the in-app notification from ordinary inbox views without deleting source truth. |

Avoid `delivered` unless a future implementation has provider-specific delivery
receipts and docs clearly distinguish provider acceptance from actual user
visibility. The current in-app baseline uses unread/read/archived state; read
and archive state must not mutate source bills, settlements, OCR reviews, sync
operations, security events, comments, groups, or audit records.

## Event Families

### Bills And Bill Review

Representative event types:

- `bill.assigned`
- `bill.updated`
- `bill.financially_impactful_edit`
- `bill.acknowledgement_required`
- `bill.approval_required`
- `bill.approved`
- `bill.rejected`
- `bill.dispute_opened`
- `bill.correction_requested`
- Existing revision variants such as `bill.revision_proposed`,
  `bill.revision_resubmitted`, `bill.revision_submitted`,
  `bill.revision_withdrawn`, `bill.revision_approved`,
  `bill.revision_rejected`, `bill.revision_payer_confirmed`, and
  `bill.revision_applied`.

Owning domain: expense/bill workflow and bill revision domain services.

Purpose: alert affected users that a bill was assigned, changed, needs
acknowledgement, needs approval, was rejected, is disputed, or has correction
activity. Notifications are prompts to review API-authoritative bill state, not
financial truth.

Safe IDs: recipient profile ID, actor profile ID when safe, group ID, expense
bill ID, bill revision ID, participant ID, and payer confirmation ID where those
IDs are safe for the recipient.

Sensitive exclusions: no itemized line details, full merchant/receipt text,
private notes, raw OCR text, storage paths, attachment contents, payment details,
full participant lists, calculated hidden shares, or rejected reason text unless
a future reviewed template classifies it as safe for that recipient.

In-app baseline: required for assigned bills, bill updates, acknowledgement,
approval/rejection, dispute/correction, and financially impactful edits.

Read/archive/summary/digest impact: unread bill review events count toward
attention summaries. Read/archive affects only notification inbox state.
Financially impactful edits and required approvals should remain eligible for
immediate in-app visibility; optional email/push/digest behavior depends on
policy.

Audit: money-impacting bill status changes, payer confirmation, revision apply,
and dispute/correction transitions require domain audit where existing policy
requires it. Notification write/read/archive by itself is not the source audit
record for the bill action.

Channel eligibility: in-app baseline; email optional only with privacy-safe
templates; push optional only with generic snippets.

Validation expectation: tests prove affected recipient selection, actor
self-notification suppression where required, safe payload IDs only, no sensitive
fields in payload/logs, read/archive isolation, summary counts, and linked
resource authorization recheck.

### Item Claims

Representative event types:

- `bill.item_claim_requested`
- `bill.item_claimed`
- `bill.item_claim_conflicted`
- `bill.item_claim_unresolved`
- `bill.item_claim_ready_for_owner_review`

Owning domain: expense/bill split and claim workflow services.

Purpose: prompt bill participants or the owner to review item assignment or claim
state.

Safe IDs: expense bill ID, group ID, recipient profile ID, actor profile ID when
safe, and item/claim stable IDs only when the recipient can access the bill.

Sensitive exclusions: no raw item text from OCR, hidden item amounts, full
participant assignment matrix, private notes, receipt image content, or inferred
financial share changes outside safe summaries.

In-app baseline: required for claim conflicts, unresolved claims, and owner
review needs.

Read/archive/summary/digest impact: conflicts and owner-review events count as
attention. Read/archive does not resolve the claim.

Audit: money-affecting accepted claim results and conflict-resolution writes
should use bill/money audit where required.

Channel eligibility: in-app baseline; email/push optional only with generic
claim-review snippets.

Validation expectation: tests prove clients cannot resolve claims by marking a
notification read, conflict resources re-fetch through authorized APIs, and
payloads exclude OCR/raw item detail.

### Settlements

Representative event types:

- `settlement.request_created`
- `settlement.payment_marked_paid`
- `settlement.payment_partially_paid`
- `settlement.payment_confirmed`
- `settlement.request_disputed`
- `settlement.payment_disputed`
- `settlement.proof_attached`

Owning domain: settlement request/payment/proof services.

Purpose: notify debtors and creditors about settlement requests, marked-paid
claims, confirmations, disputes, and proof attachment activity.

Safe IDs: settlement request ID, settlement payment ID, group ID, related bill ID
only where already visible, recipient profile ID, actor profile ID when safe,
and stable proof file ID only through an authorized proof-list/read API response.

Sensitive exclusions: no raw payment handles, account numbers, QR contents,
proof image/text contents, bank screenshots, storage internals, full payment
notes, unbounded amount detail in push/email snippets, or hidden bill lines.

In-app baseline: required for settlement requested, marked paid, confirmed,
disputed, cancelled where scoped, and proof attached.

Read/archive/summary/digest impact: disputes and confirmation-needed events
count toward attention summaries. Read/archive does not confirm, dispute, cancel,
or mark a settlement paid.

Audit: settlement request/payment/proof source actions require bounded
settlement/storage audit where existing policy requires it. Notification
delivery logs must not replace settlement audit records.

Channel eligibility: in-app baseline; email optional with high-level settlement
copy; push optional with generic settlement update copy. Proof snippets must not
describe proof contents.

Validation expectation: tests prove payment/proof resources reauthorize on open,
proof file IDs never expose storage internals, read/archive does not mutate
settlement state, and optional channel snippets exclude payment details.

### Recurring Bills

Representative event types:

- `recurring_bill.due_soon`
- `recurring_bill.draft_generated`
- `recurring_bill.generation_skipped`
- `recurring_bill.generation_failed`

Owning domain: recurring bill template, forecast, and future generation services.

Purpose: surface due-soon reminders, explicit draft generation, and future
generation skip/failure states without turning templates into financial truth.

Safe IDs: recurring bill template ID, occurrence ID/date, generated draft bill ID
where visible, group ID, recipient profile ID, and actor profile ID where safe.

Sensitive exclusions: no raw template payload JSON, full notes, hidden
participants, future private bill details, payment details, or worker internals.

In-app baseline: required for generated drafts, due-soon reminders where enabled,
and generation failures that need user action. The current Day 1 recurring
due-soon implementation uses the authorized recurring forecast read window as
the due-soon window and writes in-app-only `recurring_bill.due_soon`
notifications for visible active forecasted occurrences. It does not create
bills, confirmed occurrences, settlements, payments, external provider delivery,
or financial truth.

Read/archive/summary/digest impact: due-soon events may digest/defer where policy
allows. Generated/failed events count according to priority. Read/archive does
not generate, skip, pause, resume, archive, or mutate templates.

Audit: recurring template lifecycle and draft generation source actions require
bounded recurring audit where existing policy requires it; notifications are not
the audit source.

Channel eligibility: in-app baseline; email/push optional for reminders and
generic generation notices.

Validation expectation: tests prove forecast reads do not create notifications
unless explicitly scoped, draft generation remains API-authoritative, and
payloads exclude raw template payloads.

### Sync And Offline

Representative event types:

- `sync.operation_queued`
- `sync.conflict_detected`
- `sync.operation_failed`
- `sync.conflict_resolved`

Owning domain: sync acceptance/offline queue services.

Purpose: inform the current actor that a server-mode queued operation is pending,
conflicted, failed, or resolved. Sync notifications describe local/server sync
state only; they are not server acceptance proof unless the authorized sync API
returns accepted state.

Safe IDs: sync operation ID, client operation key hash or bounded correlation
ID, target resource type, safe target resource ID where already visible, and
recipient profile ID.

Sensitive exclusions: no request body, raw offline mutation payload, raw local
file path, raw local cache content, hidden server current data, storage internals,
or unrelated user details.

In-app baseline: required for conflict and failure states. Queued/resolved
readouts may be summary-only where UI policy allows.

Read/archive/summary/digest impact: conflicts and failures count toward
attention summaries. Read/archive does not resolve conflicts, retry operations,
or accept pending changes.

Audit: accepted, rejected, denied, conflict, failed, and migration operations
should use sync/domain audit where required. Notification state is not sync
truth.

Channel eligibility: in-app baseline; email/push optional only for conflict or
failure classes with generic text. Ordinary queue churn should generally avoid
external channels unless policy explicitly enables it.

Validation expectation: tests prove no raw queued payload appears in
notifications/logs, linked resources reauthorize on open, and read/archive is
separate from sync retry/resolution.

### Security, Session, And Account

Representative event types:

- `security.session_new_device`
- `security.session_revoked`
- `security.password_changed`
- `security.recovery_used`
- `security.mfa_changed`
- `security.passkey_changed`
- `security.policy_changed`
- `security.account_disabled`

Owning domain: auth/session/security policy services.

Purpose: alert users or admins to security-impacting account, credential,
session, recovery, MFA/passkey, or policy events.

Safe IDs: auth audit event ID, auth session ID where safe for the account owner,
recipient profile ID, actor profile ID where safe, and bounded policy identifier.

Sensitive exclusions: no raw session tokens, refresh tokens, reset tokens,
recovery codes, passwords, MFA secrets, passkey private material, provider
tokens, exact abuse identifiers, full IP history, unbounded user-agent strings,
or sensitive provider payloads.

In-app baseline: required for security-impacting events where the recipient has
an account/session surface. Security events remain visible in-app even when
ordinary mute/digest preferences would hide lower-risk notifications.

Read/archive/summary/digest impact: urgent security events count in urgent or
attention summaries. Read/archive does not revoke sessions, change credentials,
or acknowledge a security incident.

Audit: source security action must emit auth/security audit where policy
requires it. Notification delivery and read/archive may be audited only when a
future security policy explicitly requires that evidence.

Channel eligibility: in-app baseline; email/push optional where configured and
privacy-safe. Security/money-critical events may bypass mute/quiet-hours only
according to explicit reviewed policy; this document does not implement that
policy.

Validation expectation: tests prove secret redaction, safe generic external
snippets, audit/source separation, and authorization recheck for session/account
detail screens.

### OCR Review

Representative event types:

- `ocr.completed`
- `ocr.failed`
- `ocr.needs_review`

Owning domain: receipt OCR review intake, future OCR job, and API validation
services.

Purpose: tell the relevant actor that OCR extraction or review state is ready,
failed, or needs manual review. OCR completion never applies, finalizes, or
authorizes bill data by itself.

Safe IDs: expense bill ID, attachment file ID only through authorized attachment
metadata, OCR review ID, group ID, recipient profile ID, job/correlation ID when
safe, and actor profile ID where safe.

Sensitive exclusions: no full OCR text, raw receipt text, raw receipt image/file
content, storage internals, itemized extracted lines, hidden amounts, or worker
debug output.

In-app baseline: required for failed or needs-review OCR states and for completed
server OCR where user action is expected.

Read/archive/summary/digest impact: needs-review and failed OCR events count
toward attention summaries. Read/archive does not apply OCR, accept extracted
fields, or mutate bill items.

Audit: OCR-to-bill apply, storage writes, and money-affecting application
actions require their own domain/storage audit where policy requires it.

Channel eligibility: in-app baseline; email/push optional only with generic OCR
review snippets and no extracted content.

Validation expectation: tests prove OCR text/content exclusion, no automatic
bill mutation, authorized re-fetch on open, and worker/job failure metadata
redaction.

### Friends, Groups, And Membership

Representative event types:

- `friend.request_created`
- `friend.request_accepted`
- `friend.request_rejected`
- `group.invite_created`
- `group.invite_accepted`
- `group.membership_added`
- `group.membership_removed`
- `group.membership_role_changed`

Owning domain: future friend/direct sharing, invitation, group membership, and
authorization services.

Purpose: alert users to friend requests, group invitations, and membership
changes that affect collaboration context.

Safe IDs: friend request ID, group invite ID, group ID, membership target profile
ID where visible, recipient profile ID, and actor profile ID where safe.

Sensitive exclusions: no email/local account identifiers, contact imports,
provider identity payloads, hidden directory search results, payment details,
private profile data, group membership lists beyond the recipient's authorized
view, or block/unfriend reasons unless reviewed as safe.

In-app baseline: required for friend request, group invite, membership add/remove
or role-change events that affect the recipient.

Read/archive/summary/digest impact: pending requests/invites count toward
attention summaries. Read/archive does not accept, reject, block, unfriend,
remove, or change group membership.

Audit: group membership and sharing authorization changes require auth/business
audit where policy requires it. Notifications do not replace audit.

Channel eligibility: in-app baseline; email/push optional with generic social
collaboration copy. Group mute may reduce non-critical group notifications only
where policy allows.

Validation expectation: tests prove exact recipient scoping, no directory or
contact leakage, blocked/unfriended users do not receive non-essential social
notifications, and linked resources reauthorize on open.

### Comments, Notes, And Threads

Representative event types:

- `comment.created`
- `comment.mentioned`
- `thread.reply_created`
- `thread.resolved`

Owning domain: future comments/notes/thread services attached to bills, items,
settlements, OCR reviews, groups, or support contexts.

Purpose: notify authorized participants about comment/thread activity where
preferences and mute policy allow it.

Safe IDs: comment/thread ID, parent subject type, parent subject ID when visible,
group ID, recipient profile ID, and actor profile ID where safe.

Sensitive exclusions: no full comment body in push/email, no private notes, no
raw OCR text pasted into comments, no attachment contents, no storage internals,
and no comments from resources the recipient cannot currently access.

In-app baseline: required for mentions and direct replies where the recipient is
authorized. Ordinary thread activity may be muted/digested where policy allows.

Read/archive/summary/digest impact: mentions count toward attention summaries.
Thread mutes may suppress optional delivery. Read/archive does not resolve a
thread or mark source comments as handled unless a future comments model
explicitly distinguishes those states.

Audit: ordinary comments may not require audit, but moderation, deletion,
security-sensitive, or money-dispute comments may require audit under future
policy.

Channel eligibility: in-app baseline; email/push optional only with generic
thread snippets and no raw body unless a future reviewed template policy allows
a bounded excerpt.

Validation expectation: tests prove private note exclusion, mute behavior,
authorized parent re-fetch, and no raw comment body in external snippets by
default.

## Preference And Policy Boundary

Preference resolution order is:

1. Event eligibility and content safety.
2. Admin/deployment provider/channel cap.
3. Explicit security or money-critical bypass policy, if reviewed and enabled.
4. User channel/category preference.
5. Group or thread mute where policy allows.
6. Quiet-hours or digest scheduling.
7. Device/platform availability for push.

User preferences can narrow allowed channels and categories. They cannot enable
a channel disabled by admin/deployment policy, cannot make an unconfigured
provider appear configured, and cannot hide required in-app security or
money-critical events unless a future explicit policy says otherwise.

## Validation Baseline

Future implementation slices should include focused validation for:

- Each event family recipient derivation and self-notification behavior.
- Safe stable IDs only; no prohibited fields in payloads, logs, delivery status,
  audit metadata, template variables, or snippets.
- In-app creation for baseline events.
- Read/archive state isolation from source business state.
- Summary counts for unread, attention, and urgent events where implemented.
- Delivery states for unsupported, unconfigured, disabled, muted, deferred,
  queued, sent, and failed optional channels.
- Provider acceptance not being reported as user delivery.
- Authorization recheck when a linked resource is opened.
- Preference resolution order and group/thread mute behavior where implemented.
- Security/money-critical bypass behavior only where explicit reviewed policy
  allows it.

Docs-only changes to this taxonomy should run documentation validation. Runtime
notification changes require their own issue scope, manual gates where
applicable, and API/OpenAPI/generated-client/schema/UI validation when touched.
