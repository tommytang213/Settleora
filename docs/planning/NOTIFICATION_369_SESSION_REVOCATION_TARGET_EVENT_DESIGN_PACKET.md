# #369 Session Revocation Notification Target/Event Design Packet

## Purpose

This packet defines the target-reference and event/subject shape for the narrow
future auth/session/security notification candidate under GitHub issue #369:
user-initiated current-account per-session revocation.

Decision: the recommended first runtime slice should use event key
`security.session_revoked`, subject type `auth_session`, event contract
`security.session_revoked.v1`, and a first-class `authSessionId` target that
points to the revoked session row only for the affected account owner. Opening
the notification must re-fetch through a current-account authorized
auth/session API path. Possessing the notification or target ID must never prove
authorization.

This is a docs/planning target and event design gate only. It does not
implement runtime notification writers, event constants, subject types, target
columns, database schema, migrations, OpenAPI changes, generated-client changes,
auth/session/security runtime behavior, provider delivery, device-token
lifecycle, mobile/web/admin UI, Figma output, #371 notification-open/deep-link
runtime, money, settlement, bill, OCR, storage, sync, deployment, CI,
Docker/env, secrets, issue closure, or Project mutation.

## Inputs Reviewed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Active `.ai/*` files
- `docs/planning/ISSUE_PROGRESS_LEDGER.md`
- `docs/architecture/AUTH_IDENTITY_FOUNDATION.md`
- `docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md`
- `docs/architecture/PASSWORD_HASHING_POLICY.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md`
- `docs/architecture/NOTIFICATION_TARGET_REFERENCE_GAP_REVIEW.md`
- `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
- `docs/architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md`
- `docs/planning/NOTIFICATION_369_AUTH_SECURITY_SOURCE_DECISION_PACKET.md`
- `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_SOURCE_DESIGN_PACKET.md`
- Existing notification planning/source/target packets under
  `docs/planning/`
- Recent `.codex/reports/` for PR #709 and PR #711:
  - `settleora-codex-report-20260705-1605-notification-369-auth-security-source-decision-pr-open.md`
  - `settleora-codex-report-20260705-1705-notification-369-auth-security-pr709-merge-gate.md`
  - `settleora-codex-report-20260705-1750-notification-369-session-revocation-source-design-pr-open.md`
  - `settleora-codex-report-20260705-1758-notification-369-session-revocation-pr711-merge-gate.md`

No required input file was missing.

## Inherited Source Decision From PR #711

This packet inherits the PR #711 source decision without expanding it:

- user-initiated current-account per-session revocation only;
- successful API-owned revocation transition only;
- one non-current session owned by the authenticated account;
- affected account owner's server-mode profile is the only recipient;
- actor self-notification is intentional for this narrow safety confirmation
  and must be explicitly enabled and tested by a future writer;
- no notification from denied attempts, not-found targets, already-revoked
  targets, expired sessions, session-list reads, current-user validation,
  preference reads, generated-client availability, local cache state, or
  provider delivery state;
- no runtime authorization, API behavior, schema, OpenAPI, generated-client,
  writer, route, or UI behavior is granted by this docs packet.

Admin revocation, current-session sign-out, sign-out-all, suspicious-session
revocation, refresh replay/session-family revocation, account/credential/MFA/
passkey/security-policy events, ordinary expiry, local-only mode, and generic
session-list/status reads remain outside the first slice.

## Existing Naming Pattern Review

Current notification taxonomy uses dotted event keys scoped by source family,
such as `bill.revision_proposed`, `settlement.residual_review_needed`,
`recurring_bill.due_soon`, `ocr.needs_review`, `sync.conflict_detected`, and
`sync.operation_failed`. Subject types are stable resource nouns, such as
`expense_bill`, `settlement_request`, `settlement_payment`,
`recurring_bill_occurrence`, and newer source-specific nouns where target
references are first-class.

For auth/session/security, existing docs already list `security.session_revoked`
as the design-level candidate. The name is specific to the security/session
event family and does not describe ordinary session-list reads, current-user
validation, or generic auth activity.

## Event And Subject Recommendation

Recommended future event key:

```text
security.session_revoked
```

Recommended future subject type:

```text
auth_session
```

Recommended future versioned contract name:

```text
security.session_revoked.v1
```

The event means exactly one server-authoritative current-account session was
successfully revoked by the same account owner through the approved per-session
revocation command path.

The future runtime constant, database check-constraint value, OpenAPI enum,
generated-client enum, provider template key, and UI string must be approved in
that runtime task. This packet recommends the names but does not add them.

Do not use:

- generic names such as `session.updated`, `auth.activity`, or
  `security.event`;
- read-like names such as `session.viewed` or `session.listed`;
- account-wide names for the first slice, such as `security.all_sessions_revoked`;
- suspicious/replay/admin names for the first slice;
- bill, settlement, OCR, sync, recurring, provider, digest, or admin-policy
  subject types for this auth/session event.

## Target Reference Recommendation

Recommended first-slice target shape:

```text
subjectType: auth_session
authSessionId: <revoked auth session row ID>
```

The `authSessionId` target is recommended over `authAuditEventId` or a generic
security-center target for the first runtime slice because the source event is
specifically a session revocation, the current product already has a
current-account session surface, and the account owner can safely be routed to a
current-account session detail or session list re-fetch that includes the
revoked session only if still authorized and retained.

The target remains a navigation/reference hint only. Future runtime must ensure:

- `authSessionId` is a stable internal row identifier, not a bearer token,
  refresh token, token hash, session credential, or provider/session secret;
- the notification recipient is derived server-side from the target session's
  auth account and linked profile;
- opening the notification re-fetches the notification row through the
  current-user notification API, then re-fetches the session/security resource
  through a current-account authorized auth/session API path;
- the re-fetch verifies the session belongs to the authenticated account at
  read time;
- the UI uses a generic unavailable state when the session row is stale,
  removed, expired beyond retention, unavailable, or not authorized;
- a client-supplied `authSessionId`, notification ID, route state, action URL,
  local cache row, push payload, copied ID, or generated-client method is never
  authorization proof.

Deferred target options:

| Option | Decision |
| --- | --- |
| `authAuditEventId` | Defer for this first slice. It remains useful for a future security-activity readout, but would require a separate current-account auth audit/activity re-fetch surface before runtime. |
| Security-center/account target without a specific session ID | Defer for this first slice. It is privacy-conservative, but less precise and still needs a reviewed security-center target and route. |

Do not hide auth targets in `safeSummary`, overload unrelated target columns,
encode target IDs only in `actionUrl`, or expose session identifiers in
external snippets.

## Recipient Rules

The only recipient for the first slice is the affected account owner's
server-mode `UserProfile`, derived server-side from the revoked target session's
auth account.

Allowed:

- the account owner whose non-current session was successfully revoked, when
  the profile/account remains active enough for current-user notification
  visibility under the future policy.

Forbidden:

- admin, owner, operator, support, or deployment recipients for another user's
  session event;
- group owners, group members, friends, bill participants, settlement
  counterparties, OCR/review participants, sync participants, or visible users;
- recipients supplied by the client, route parameter, local cache, push device
  token, notification preference row, generated-client call, or UI state;
- the revoked session holder as a separate recipient distinct from the account
  owner;
- local-only profile/session recipients.

Actor self-notification is allowed only because this event is a safety
confirmation for the same account owner. The future writer must opt in
explicitly and test that ordinary self-notifications remain suppressed for other
event families where policy requires suppression.

## Safe Content Boundary

Future in-app payload/readout content may include:

- short title such as `Session revoked` or an approved template key;
- short body such as `A session was removed from your account`;
- category such as `security` or a reviewed `session_security` category;
- severity/priority such as `attention` or `normal`, with `urgent` only if a
  later security policy approves that classification;
- event timestamp or revocation timestamp;
- `authSessionId` as the first-class target reference;
- bounded correlation/request identifier only if already safe and approved for
  user-facing support correlation;
- bounded/coarse device or session display label only when the same label is
  already authorized by the future current-account session list/detail policy,
  such as `iPhone`, `Web browser`, or `Unknown device`;
- normalized reason category such as `user_revoked_other_session`.

External email/push copy, if separately approved later, must stay generic:

- `A session update needs review.`
- `Open Settleora to review your account security.`

No provider sending or external snippet is approved by this packet.

Forbidden in notification rows, safe summaries, payloads, response models,
provider snippets, logs, tests, reports, screenshots, audit examples, and issue
comments:

- raw bearer/session tokens;
- raw refresh tokens;
- raw bearer-like session IDs;
- token hashes;
- refresh credential IDs/hashes or session-family secrets;
- password material, password hashes, salts, peppers, verifier strings, reset
  tokens, recovery codes, MFA secrets, passkey private material, reusable
  challenges, WebAuthn authenticator payloads, OIDC tokens, provider payloads,
  provider secrets, certificates, signing material, service-account JSON, or
  secret references;
- raw IP addresses, exact long-lived IP history, unbounded user-agent strings,
  full device fingerprints, raw abuse identifiers, rate-limit bucket keys, or
  network diagnostics;
- another user's email, local account identifier, profile identifiers,
  recipient lists, admin diagnostics, or unrelated account/session data;
- bill, settlement, payment, OCR, storage, sync, group, friend, recurring,
  reconciliation, or unrelated business data.

## Open Behavior And Authorization Boundary

The future open flow for this target must be:

1. Re-fetch the notification through the authenticated current-user
   notification API.
2. Confirm the event family/subject is `security.session_revoked` /
   `auth_session`.
3. Use the first-class `authSessionId` only as a hint.
4. Re-fetch session/security detail through a current-account authorized API
   path.
5. Render only the authorized response for the current account/session.
6. Fall back generically if the current actor is unauthenticated, account
   switched, offline, server-unavailable, stale, missing, or unauthorized.

Read/archive/open state remains notification inbox state only. It must not
revoke or restore a session, undo revocation, mutate auth audit, change account
or credential state, alter provider delivery state, or acknowledge/clear a
security incident.

## Audit Relationship

Auth audit remains the source of truth for the security action. The
notification is only a user-facing prompt derived from the reviewed session
revocation transition.

Future runtime must preserve:

- the auth/session service writes or links the authoritative auth audit event;
- notification creation does not replace audit and is not the only evidence of
  revocation;
- notification delivery failure does not roll back session revocation or auth
  audit;
- notification read/archive/open never mutates auth session, credential,
  account, policy, revocation, or audit state;
- audit metadata remains bounded and secret-free even when a notification
  references `authSessionId`;
- audit viewing, export, retention cleanup, and security-center activity
  history remain separate gates unless explicitly scoped.

## Forbidden Or Deferred Until Later Gates

Forbidden in the first runtime slice:

- runtime implementation from this docs packet alone;
- notification writers/constants/handlers without a separate runtime task;
- auth/session/security runtime changes beyond the selected writer call;
- login/current-user/session middleware/token issuance/revocation endpoint
  behavior changes unless explicitly scoped and manually approved;
- OpenAPI/generated-client/schema changes without explicit review;
- provider sending, SMTP/APNs/FCM activation, provider config/secrets,
  device-token lifecycle, outbox/delivery attempts, or delivery receipts;
- admin/operator notification recipients;
- account-wide, admin-caused, suspicious, replay/family, credential, MFA,
  passkey, recovery, policy, failed sign-in, lockout, abuse, or expiry events;
- #371 broad notification-open/deep-link runtime;
- mobile/web/admin UI or Figma output;
- money, settlement, bill, OCR, storage, sync, reconciliation, deployment, CI,
  Docker/env, secrets, issue closure/reopen, or Project mutation.

Deferred target/event questions:

- whether a future security activity center should additionally expose
  `authAuditEventId`;
- whether account-wide or replay-caused revocation should use
  `authSessionFamilyId`, `authAuditEventId`, or account/security-center target;
- whether external email/push snippets should ever be attempted for this event;
- whether urgent severity or security-bypass preference behavior is appropriate;
- whether admins/operators need separate safe operator notifications for a
  different event family.

## Future Runtime Gate Checklist

No runtime implementation is authorized until a separate task satisfies:

- auth/security manual approval for `security.session_revoked` and
  actor self-notification;
- source endpoint/session authority confirmation for the existing API-owned
  current-account per-session revocation transition;
- target reference approval for first-class `authSessionId` and
  `auth_session` subject shape;
- notification event constants, subject constants, writer placement, duplicate
  rule, and transaction behavior review;
- redaction/audit review covering notification payloads, safe summaries,
  response models, logs, tests, reports, and provider snippets;
- schema/OpenAPI/generated-client review if event enums, subject enums, target
  fields, routes, response shapes, or generated clients change;
- focused tests for:
  - successful source-transition-only creation;
  - no creation for denied/not-found/already-revoked/expired/read/list paths;
  - affected account owner as the only recipient;
  - explicit self-notification opt-in;
  - duplicate/idempotent replay behavior;
  - safe `authSessionId` target persistence/response shape;
  - current-account target re-fetch authorization;
  - stale/missing/unauthorized fallback without existence leaks;
  - read/archive/open isolation from auth state and audit;
  - forbidden content redaction;
  - provider-disabled/unconfigured behavior with no fake delivery success;
- PR/merge gate with exact local validation, GitHub checks, clean scope guard,
  and no runtime expansion beyond the approved slice.

## #369 Validation And Posture

This packet narrows the recommended event and target shape but does not close
#369.

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

Future #369 validation should treat this packet as a target/event design gate
only. It is not runtime completion, not schema/OpenAPI/generated-client
approval, not provider-channel approval, not route implementation, and not issue
closure evidence.

## Scope Guard

This packet changes documentation only. It confirms no runtime notification
writer, event constant, subject constant, target column, auth/session/security
behavior, API behavior, OpenAPI, generated client, schema, migration, provider
sending, device-token lifecycle, delivery attempt, admin policy mutation, UI,
#371 runtime, money, settlement, bill, OCR, storage, sync, deployment, CI,
Docker/env, secret, issue closure, or Project mutation is made or authorized
here.
