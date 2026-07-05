# #369 Session Revocation Notification Source Design Packet

## Purpose

This packet defines the narrow source-state design for a future
auth/session/security in-app notification candidate under GitHub issue #369:
current-account per-session revocation.

Decision: the safest first future runtime slice is a user-initiated
current-account per-session revocation notification only, sourced from the
successful API-owned revocation transition for one non-current session owned by
the authenticated account. This packet does not make that runtime
implementation ready by itself. It records the source authority, exact included
and excluded transitions, recipient and target-reference rules, privacy and
audit boundaries, and the gates that must pass before any writer, event
constant, schema, OpenAPI, generated-client, route, provider, or UI work starts.

This is a docs/planning source-state design gate only. It does not implement
runtime notification writers, event constants, subject types, database schema,
migrations, OpenAPI changes, generated-client changes, auth/session/security
runtime behavior, provider delivery, device-token lifecycle, mobile/web/admin
UI, #371 notification-open/deep-link behavior, money, settlement, bill, OCR,
storage, sync, deployment, CI, Docker/env, secrets, issue closure, or Project
mutation.

## Inputs Reviewed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Active `.ai/*` files
- `docs/planning/ISSUE_PROGRESS_LEDGER.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/architecture/AUTH_IDENTITY_FOUNDATION.md`
- `docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md`
- `docs/architecture/PASSWORD_HASHING_POLICY.md`
- `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md`
- `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
- `docs/planning/NOTIFICATION_369_REMAINING_EVENT_COVERAGE_GATE_REVIEW.md`
- `docs/planning/NOTIFICATION_369_AUTH_SECURITY_SOURCE_DECISION_PACKET.md`
- Recent `.codex/reports/` for PR #707, #708, #709, and #710
- Live GitHub issue/PR state for #369, #368, #403, #634, #635, #371, #570,
  #575, #707, #708, #709, and #710

No required input file was missing.

## Current Source Facts

Current auth/session runtime already includes an API-owned current-account
session surface:

- `SettleoraSession` validates opaque bearer sessions through the API session
  runtime boundary.
- Protected endpoints derive the current actor from server-side session
  validation, not from client-submitted actor identity.
- Current-account session list, current-session sign-out, sign-out-all, and
  per-session revocation endpoints exist.
- `auth_sessions` stores server-authoritative session metadata, token hashes,
  status, expiry, revocation metadata, bounded optional device labels, bounded
  optional user-agent summaries, and optional network-address hashes. It does
  not store raw bearer tokens or raw refresh tokens.
- Auth audit rows are the source of security truth for security-impactful
  actions and must remain secret-free.

Current notification runtime does not yet support auth/session/security
notifications:

- no approved auth/session/security event constant exists;
- no approved auth/session/security subject type exists;
- no first-class auth/session/security notification target reference exists;
- no authorized current-account notification-open route or security re-fetch
  policy exists for auth/session targets;
- self-notification behavior for security events is not configured for this
  candidate;
- no source-transition tests, duplicate/idempotency tests, recipient isolation
  tests, or redaction tests exist for this event family.

## Candidate Event

Design-level event label:

```text
security.session_revoked
```

This label is not an approved runtime constant, database value, OpenAPI enum,
generated-client value, route name, provider template key, or UI string. A
future implementation task must explicitly approve the final constant and
subject type.

Future domain action that may produce the event:

- successful current-account per-session revocation of a non-current session
  through the API-owned auth/session runtime;
- the target session must belong to the same auth account as the authenticated
  actor;
- the revocation must transition the target session from active or otherwise
  revocable state into a revoked terminal state;
- the source transition must be written by the API/domain auth/session service,
  not by a client, worker, notification preference readout, session-list read,
  local cache, generated client, or polling process.

## Source Authority Boundary

The auth/session domain is the only authority for deciding whether this event
exists. A future notification writer may be called only from the reviewed
session revocation command path after all of these are true:

- the authenticated actor has been resolved server-side;
- the target session has been loaded and verified as belonging to the actor's
  current auth account;
- authorization and revocability checks have passed;
- the session revocation transition has been persisted or is part of the same
  successful transaction boundary;
- the source service has a stable idempotency/duplicate rule for the exact
  target session and transition;
- the source service emits or links to a bounded auth audit event for the
  security action.

Notifications must not be inferred from generic `auth_sessions.status` polling,
session-list display, mobile route state, current-user validation, preference
reads, generated-client availability, audit-log browsing, provider delivery
state, or local-only mode state.

## Included Transition Candidates

The only candidate approved by this packet for first-slice design is:

| Transition | First-slice posture | Rationale |
| --- | --- | --- |
| User revokes one non-current session from their own current-account session list/detail API | Safest first future runtime candidate after remaining gates pass | The source authority is API-owned, the affected account and actor are the same account, the event can be current-account scoped, and recipient isolation is simpler than admin, suspicious-session, replay, or account-wide revocation classes. |

The first slice should be restricted to successful transitions only. It should
not notify on denied attempts, not-found target sessions, already-revoked
targets, expired sessions, session-list reads, or validation failures. Those
outcomes remain audit/error behavior where appropriate, not notification
sources.

## Non-Candidate Transitions

The following revocation-related actions are not part of the first future slice:

| Transition | Posture |
| --- | --- |
| Current-session sign-out | Excluded. The user is voluntarily ending the active session, the session may no longer be able to receive or use the notification, and the value is low unless a separate policy approves it as security confirmation. |
| Current-account sign-out-all | Excluded. This is account-wide and may require an account/security-center target, duplicate behavior across multiple sessions, and separate copy. |
| Admin revokes another user's session | Excluded. This needs admin/operator authority design, account-existence privacy review, audit redaction review, and explicit recipient/operator policy. |
| Account disabled, credential rotated, password reset/change, MFA/passkey/recovery action, or policy-caused revocation | Excluded. These are broader account/credential/security-policy events requiring separate source semantics and targets. |
| Suspicious-session, abuse, lockout, failed sign-in, replay, or refresh session-family revocation | Excluded. These require anti-enumeration, threshold, risk-classification, target, and copy review. |
| Background expiry or ordinary idle/absolute expiry | Excluded. Expiry is expected lifecycle churn and not a user-actionable revocation notification unless future policy says otherwise. |
| Local-only profile/session state | Excluded. Local-only mode is outside server-auth notification authority. |

## First Slice Recommendation

Use the narrowest combination:

- event category: user-initiated current-account per-session revocation;
- actor: authenticated account owner revoking one of their own non-current
  sessions;
- recipient: the same affected account owner's profile only;
- source target: one safe auth/session target reference selected by a future
  target-reference design;
- channel: in-app only for the first runtime slice unless a later provider
  policy separately approves email/push generic snippets;
- no admin recipient, no account-wide revocation, no suspicious-session
  revocation, no replay/family revocation, and no current-session sign-out.

Admin, account-wide, suspicious, replay, policy, and credential-caused
revocation events should remain separate manual-gated source designs.

## Recipient Rules

The only default recipient is the affected account owner's server-mode
`UserProfile`, derived server-side from the target session's auth account.

Must receive:

- the account owner whose non-current session was successfully revoked, when
  their account/profile is active and the future policy says this required
  security notification is visible.

Must never receive in the first slice:

- unrelated users;
- group owners, group members, friends, bill participants, settlement
  counterparties, or OCR/review participants;
- ordinary admins, system owners, support viewers, or deployment operators for
  another user's revocation event;
- the holder of the revoked session as a separate recipient if that session is
  no longer valid and cannot be current-account-authorized;
- anyone inferred from a client-supplied profile ID, route parameter, cached
  row, notification preference row, push device token, or generated-client call.

Actor self-notification is intentionally allowed for this narrow event because
the actor and affected account owner are the same account. A future writer must
opt in explicitly to self-notification behavior and test it, because the
current notification writer suppresses self-notifications by default.

## Target Reference Rules

A future implementation must not expose raw session tokens, token hashes,
refresh credentials, refresh-session-family internals, or provider/session
secrets as notification targets.

Safe target options to decide before runtime:

| Option | Posture |
| --- | --- |
| `authSessionId` | Plausible for this first slice if the ID is an internal stable row ID, is safe for the account owner, and opens only through an authorized current-account session list/detail re-fetch. |
| `authAuditEventId` | Plausible if the notification points to immutable security activity instead of a session detail. Requires current-account security activity re-fetch policy. |
| security-center/account target without a specific session ID | Safest from a privacy perspective, but less precise. Requires a reviewed current-account security-center target and route. |

The first runtime task must choose exactly one target pattern. Do not hide the
target in `safeSummary`, overload bill/settlement/OCR/sync target columns, use
a raw `actionUrl` as authorization, expose database internals without review,
or include session identifiers in provider snippets.

Opening the notification must re-fetch through an authorized current-account
auth/session/security API path. Notification visibility, possession of the
target ID, mobile cache state, push payload state, or generated-client method
availability must not grant access.

## Safe Content

In-app notification content may include only bounded, recipient-safe content
approved for this event:

- generic category such as `session_revoked` or equivalent approved value;
- safe display label for the revoked session if already bounded by the auth
  session display policy, such as "iPhone" or "Web browser";
- coarse client/platform category only if normalized and bounded;
- bounded timestamp such as the revocation time or coarse "revoked just now";
- normalized revocation category such as `user_revoked_other_session`;
- generic action copy such as "Review your sessions" if an authorized re-fetch
  path exists.

External email/push copy, if ever separately approved, must stay generic:

- "A session update needs review."
- "Open Settleora to review your account security."

No provider delivery is approved by this packet.

## Forbidden Content

Notification payloads, safe summaries, provider snippets, logs, tests, reports,
screenshots, audit metadata examples, delivery attempts, and issue comments
must not contain:

- raw bearer tokens;
- raw refresh tokens;
- raw session IDs when they are bearer-like or externally reusable;
- token hashes;
- refresh credential IDs/hashes or session-family secrets;
- password material, password hashes, salts, peppers, verifier strings, reset
  tokens, recovery codes, MFA secrets, passkey private material, reusable
  challenges, or WebAuthn authenticator payloads;
- OIDC access tokens, refresh tokens, ID tokens, provider payloads, provider
  secrets, service-account JSON, certificates, signing material, or secret
  references;
- raw IP addresses or exact long-lived IP history unless a later approved
  policy defines coarse metadata;
- unbounded user-agent strings, full device fingerprints, raw abuse
  identifiers, rate-limit bucket keys, or network diagnostics;
- another user's email, local account identifier, profile identifiers,
  recipient lists, admin diagnostics, or unrelated account data;
- bill, settlement, payment, OCR, storage, sync, group, friend, or unrelated
  business data.

## Audit Interaction

Auth audit remains the source of security truth. The notification is only a
user-facing prompt derived from a reviewed source transition.

A future implementation must preserve this separation:

- the auth/session service writes or links to the authoritative audit event for
  the revocation action;
- notification creation does not replace audit, weaken audit, or become the
  only evidence of revocation;
- marking the notification read or archived never mutates auth session state,
  audit records, credential state, account state, security policy, provider
  delivery state, or revocation status;
- audit metadata remains bounded and secret-free even if a notification target
  references the audit event;
- notification delivery failures do not roll back the auth/session revocation
  or audit record.

## Runtime Gates Before Implementation

No runtime implementation is authorized until a separate task passes all
remaining gates:

- manual auth-security review approves this exact first event and
  self-notification behavior;
- auth runtime source endpoint/session authority is confirmed for the selected
  transition and duplicate/idempotency behavior;
- target-reference design selects exactly one safe target shape and authorizes
  current-account re-fetch behavior;
- notification event constant and subject type design is approved;
- notification writer placement and transaction behavior are reviewed;
- audit redaction and notification redaction are reviewed together;
- OpenAPI/schema/generated-client changes are reviewed if any API response,
  enum, target column, route, or generated client surface changes;
- #371 route/deep-link policy is extended only if needed and only for this
  target, without reopening broad notification-open behavior;
- focused tests cover source-transition-only creation, recipient isolation,
  self-notification opt-in, duplicate suppression, redaction, target
  authorization, stale/unauthorized fallback, read/archive isolation, and
  provider-disabled behavior;
- manual auth-security PR/merge gate confirms no forbidden runtime expansion.

## #369 Validation And Posture

This packet narrows one plausible future source event but does not close #369.

Recommendations:

- keep #369 open for remaining Day 1 event-family coverage and future
  auth/session/security runtime gates;
- keep #368 open as the E9 Notifications parent;
- keep #403 open for broader email, push/provider, device-token, preference,
  delivery-state, policy, and QA work;
- keep #634 open for real push provider/device-token/mobile/provider gates;
- keep #635 open for broader admin notification policy/provider/readout gates;
- keep #371 closed unless a concrete notification-open/deep-link regression or
  separately approved target extension is found;
- keep #570 and #575 closed unless a concrete OCR needs-review regression is
  found.

Future #369 validation should treat this packet as a source-state/design gate
only. It is not runtime completion, not target-reference approval, not
OpenAPI/schema/generated-client approval, not provider-channel approval, and not
issue closure evidence.

## Scope Guard

This packet changes documentation only. It confirms no runtime notification
writer, event constant, auth/session/security behavior, API behavior, OpenAPI,
generated client, schema, migration, provider sending, device-token lifecycle,
delivery attempt, admin policy mutation, UI, #371 runtime, money, settlement,
bill, OCR, storage, sync, deployment, CI, Docker/env, secret, issue closure, or
Project mutation is made or authorized here.
