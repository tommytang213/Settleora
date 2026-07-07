# Auth Local Password Reset Notification Target Reference Schema/OpenAPI Gate

## Purpose

This docs/control gate records the target-reference schema, OpenAPI, and
generated-client decision for any future local-account password-reset security
notification. It closes the target-reference decision left open by the
password-reset notification event gate without implementing runtime,
notification writers, schema, OpenAPI, generated clients, route exposure,
provider delivery, UI, or auth/security behavior.

This document is a decision gate only. It does not approve event constants,
subject constants, database columns, EF models, migrations, OpenAPI response
changes, generated-client changes, notification runtime, SMTP/provider config,
public password-reset route mappings, UI, deployment, CI, secrets, or
auth/session/security runtime changes.

## Current-State Readback

- PR #755 is `MERGED` into `main` at
  `86c29bd2eab7008f6304f556383536e7bf072fc5`.
- PR #755 was the PR #754 ledger checkpoint and its own merge does not require
  a recursive ledger checkpoint.
- Current password-reset request/complete paths exist in the OpenAPI transport
  contract, but runtime route exposure remains blocked/unregistered.
- `AUTH_LOCAL_PASSWORD_RESET_NOTIFICATION_EVENT_TARGET_REDACTION_GATE.md`
  keeps password-reset notification runtime blocked and requires this separate
  target-reference schema/OpenAPI/generated-client gate if notifications are
  used.
- `AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md` blocks
  auth/session/security notification runtime until event semantics, target
  references, recipient policy, suppression behavior, redaction, and authorized
  re-fetch paths are approved.
- Current `InAppNotificationEventType` has no auth, security, credential,
  session, or password-reset event value.
- Current `InAppNotificationSubjectType` has only bill, settlement, recurring,
  sync, and OCR subject families.
- Current notification response shapes expose bill, settlement, recurring, OCR,
  sync, group, and file IDs only. They do not expose first-class
  `authAuditEventId`, `authAccountId`, `authSessionId`,
  `authSessionFamilyId`, credential/factor IDs, or an explicit targetless
  security-center reference.
- Current generated web and Dart clients therefore cannot represent an
  auth/password-reset notification target safely.

## Day 1 Route Exposure Decision

Password-reset notification runtime is not required for Day 1 public
password-reset route exposure if the final route-exposure and auth/security
gates keep password-reset notifications deferred/audit-only.

The safe Day 1 posture is:

- reset request, material issue, delivery attempted/skipped/unavailable/failed,
  throttled, denied, expired, consumed, malformed, unknown-material, and replay
  outcomes remain audit-only by default;
- successful reset completion may remain audit-only for Day 1 route exposure;
- no password-reset notification event should be written until a later
  implementation branch explicitly clears event, target/schema/OpenAPI,
  generated-client, recipient, copy, redaction, authorized re-fetch, and test
  gates;
- public route exposure remains blocked by the broader delivery, abuse,
  UI/product-copy, route-exposure, and final auth/security gates, not by a
  requirement to implement notifications first.

If a future Day 1 route-exposure task chooses to include a user-visible
password-reset security notification, then the schema/OpenAPI/generated-client
work described below becomes a prerequisite before that runtime notification
can be implemented.

## Target-Reference Decision

Recommended target model for a future password-reset notification:

1. Prefer a first-class `authAuditEventId` plus a current-account
   security-center target.
2. Include `authAccountId` only where the response is limited to the affected
   account owner or a separately approved admin/security recipient and the ID
   is needed for an authorized re-fetch path.
3. Allow an explicit targetless current-account security-center reference when
   the notification only needs to route the affected account owner to their own
   security-center view and the authorized API can derive the account from the
   bearer session.

Do not use `authSessionId`, `authSessionFamilyId`, credential, MFA, passkey,
or recovery-code targets for password-reset completion unless a later event
requires that exact resource and the recipient can re-fetch it through an
authorized current-account security route.

The first implementation slice should use the narrowest model that supports
authorized current-account review. A targetless security-center route is safer
than exposing account or audit identifiers when detail can be derived from the
authenticated actor. If detailed activity history is implemented later, use a
first-class `authAuditEventId` with explicit authorization and redaction tests.

## Prohibited Target Shortcuts

Do not overload existing notification subject types:

- bill, settlement, recurring, sync, OCR, group, file, or receipt targets do
  not represent auth/security state;
- overloading those subjects would blur authorization boundaries and could
  make unrelated users, bill participants, group members, settlement
  counterparties, or OCR reviewers appear eligible for security events.

Do not hide auth/security target IDs in `safeSummary`:

- `safeSummary` is bounded display copy, not a typed target contract;
- clients and generated clients cannot safely discover, type-check, redact, or
  authorize hidden IDs inside text;
- target fields need explicit schema, examples, generated-client types, and
  authorization tests.

Do not treat raw `actionUrl`, generated-client availability, local cache,
notification possession, push payload possession, account IDs, audit event IDs,
or notification read/archive state as authorization. Opening a notification
must reauthorize through an API-owned current-account security-center,
credential-activity, or auth-audit read path. Read/archive must not rotate
credentials, revoke sessions, mark incidents acknowledged, mutate audit, or
change source security state.

## Recipient And Read Policy

- The affected account owner is the only default recipient for password-reset
  security notifications.
- Admins, owners, operators, deployment maintainers, and support viewers are
  not notified by default.
- Admin/operator notification is allowed only after a later explicit
  admin/security policy says the event class is operator-actionable and safe to
  expose.
- Unrelated users, groups, friends, group owners, group members, bill
  participants, settlement counterparties, OCR assignees, visible users, and
  local cache holders must never receive password-reset security notifications
  merely because they can see other app data.
- Current-user notification list/detail, read, and archive APIs must remain
  current-recipient only and must fail closed for missing, cross-user,
  archived, deleted-profile, or otherwise unavailable notification IDs.

## Redaction Requirements

Password-reset notification target fields, API responses, delivery payloads,
logs, audit metadata, provider attempts, test fixtures, reports, issue/PR
comments, screenshots, and design references must not expose:

- raw reset material, reset links, tokens, codes, verifier strings, token
  hashes, reset hashes, or reset URL query/fragment content;
- plaintext passwords, password hashes, salts, peppers, derived key material,
  recovery codes, MFA secrets, passkey private material, or OIDC provider
  tokens;
- account IDs, auth account IDs, profile IDs, audit IDs, session IDs,
  refresh-family IDs, credential IDs, factor IDs, challenge IDs, or
  security-policy IDs to unauthorized recipients;
- account emails, usernames, display names, submitted identifiers, recipient
  emails, normalized identifiers, local/OIDC state, account existence, or
  password-policy internals;
- raw IP addresses, raw user agents, device fingerprints, abuse bucket keys,
  provider-send bucket keys, source bucket keys, cookies, bearer tokens,
  refresh tokens, CSRF secrets, protected token blobs, or token fingerprints
  unless a later policy explicitly allows a bounded non-reversible display;
- SMTP hostnames, ports, usernames, passwords, app passwords, sender-domain
  diagnostics, configured public origins where sensitive, provider payloads,
  request/response bodies, provider dashboard exports, provider request IDs,
  raw provider errors, exception names, stack traces, or raw diagnostics.

Allowed pre-fetch display stays generic, such as "A security update is
available" or "Open Settleora to review your account security." Richer detail
requires authorized API re-fetch and still must use bounded categories rather
than raw identifiers or provider/security internals.

## Future Implementation Prerequisites

Before any password-reset notification runtime is implemented, a future
implementation issue/PR must explicitly cover:

- the exact event constant and source transition, or an explicit targetless
  security-center event model;
- EF/schema target shape if the chosen model needs new columns or constraints;
- OpenAPI contract updates for first-class auth/security targets or targetless
  security-center references;
- generated web and Dart clients from `npm run generate:clients`;
- an API-authorized current-account security-center, credential-activity, or
  auth-audit re-fetch route;
- recipient authorization tests for affected-account owner only and negative
  tests for unrelated users, groups, friends, bill participants, settlement
  counterparties, OCR assignees, admins/operators without explicit policy, and
  local cache holders;
- redaction tests for target IDs, account IDs, audit IDs, reset material,
  reset links, token hashes, session IDs, refresh-family IDs, provider state,
  SMTP diagnostics, raw IP/user-agent, and account identifiers;
- read/archive tests proving notification state changes do not mutate
  credential, session, audit, password-reset, provider, or security source
  state;
- no public reset route exposure until final delivery, abuse, UI/product-copy,
  route-exposure, and auth/security gates pass.

Any OpenAPI/generated-client change remains manual-gated under the project
OpenAPI change-control policy. Generated clients must not be hand-edited.

## Next Recommended Implementation Slice

The next non-doc implementation slice, if notifications are later approved, is
not a notification writer. It should first add the smallest authorized
current-account security-center or credential-activity read path and its
OpenAPI/generated-client contract, including targetless navigation or
`authAuditEventId` read authorization and redaction tests.

Only after that re-fetch path exists should a separate runtime slice add one
password-reset notification event for successful reset completion, limited to
the affected account owner, with no external provider delivery unless a
separate security-copy/provider policy approves it.

## Remaining Gates

- SMTP/email delivery, base URL, reset-template, and provider-send readiness
  gates.
- Reset-specific abuse/provider-send throttle gate.
- UI/Figma/mobile/web/admin/product-copy gate.
- Password-reset notification runtime gate if notifications are used.
- OpenAPI/generated-client manual gate for any target or security-center
  contract change.
- Final public route exposure gate.
- Final auth/security acceptance.

## Issue Posture

Keep #336 open. This gate does not complete the broader auth/session/runtime
security epic or final auth/security acceptance.

Keep #339 open. This gate does not expose public password-reset routes,
implement password-reset notification runtime, complete user-visible
password-reset UX/product copy, or complete the Day 1 password reset and
credential-change workflow.

No issue closure, label, milestone, assignee, or Project field update is
approved by this document.
