# Auth Local Password Reset Token Policy Gate

## Purpose

This packet records the Day 1 local-account password reset delivery and token
policy decision gate recommended by
[AUTH_PASSWORD_RESET_RECOVERY_POLICY_GATE.md](AUTH_PASSWORD_RESET_RECOVERY_POLICY_GATE.md).
It is docs-only. It does not implement runtime code, schema, OpenAPI,
generated clients, UI, notification delivery, provider configuration, auth
config, deployment behavior, or security enforcement.

## Current-State Readback

- Verified repo baseline: `origin/main` at
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`, the PR #731 merge commit.
- PR #729 completed only authenticated current-account local password change at
  merge commit `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`.
- PR #730 merged the docs-only password reset and recovery policy gate at
  `0004b153b833fd9793df6102cc1b3ce3d0385002`.
- PR #731 merged the docs-only local password reset delivery/token policy gate at
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`.
- Tommy manually approved the Day 1 local-account password reset delivery/token
  policy values recorded below, with a 60 minute default email-link expiry and
  an owner/admin configurable 15 to 120 minute email-link expiry range.
- `AUTH_PASSWORD_RESET_RECOVERY_POLICY_GATE.md` still keeps first-owner/
  break-glass recovery, owner/admin reset/change, invitation/public registration
  credential setup, UI, notifications, and broader auth/security acceptance
  separate from this local reset policy decision.
- GitHub #336 remains open as the broad auth/session/runtime security epic.
- GitHub #339 remains open for the broader password reset and credential-change
  workflow. Its Project status was changed to `Needs Decision` by the
  metadata hygiene task after PR #731.
- MFA/passkey recovery-code foundations are not password reset token authority.
  Recovery codes may satisfy only a separately approved MFA challenge or
  recovery flow and must not be reused as local password reset tokens,
  first-owner recovery, admin reset authority, or invitation credential setup
  material without a separate auth/security design.

## Approved Decision Summary

Tommy approved the Day 1 user-initiated local-account password reset delivery
and token policy values in this packet for subsequent technical design.

Approved Day 1 local-account reset posture:

- support only local-account password reset, not OIDC/provider password
  recovery;
- use a public reset-request endpoint with a uniform response;
- deliver reset material only through an approved SMTP/email provider or an
  approved admin-delivered out-of-band process;
- do not expose a runtime forgotten-password reset endpoint when no approved
  SMTP/email delivery policy and no separately approved admin-delivered recovery
  policy exists;
- store only hash/verifier-backed one-time reset material, never raw tokens;
- use 60 minute default email reset-link expiry;
- allow owner/admin configuration of email reset-link expiry from 15 to 120
  minutes;
- if a future typed short code or OTP-style reset flow is approved, expire that
  material in 10 to 15 minutes;
- issue newer reset material by revoking or replacing older outstanding reset
  material for the same account;
- use atomic one-time consumption, replay-safe responses, layered abuse
  controls, bounded audit, and account-wide session/refresh-family revocation
  after success;
- do not expose `Retry-After` initially unless a later auth/security decision
  explicitly approves it.

This approval resolves the local reset delivery/token policy decision gate only.
Runtime password reset is still not implemented. Schema, OpenAPI,
generated-client, API runtime, provider delivery, notification event/target/
redaction, UI/Figma/product copy, provider configuration, and final
auth/security acceptance remain separate gates.

## Delivery Channel Decision

### SMTP or email reset link

Allowed only if a deployment email provider is configured, verified, and
approved for this security flow.

Required constraints before runtime:

- the provider and from/reply behavior are configured outside this docs task;
- reset request success must not imply an email was sent or that the account
  exists;
- provider failure, disabled provider state, no matching local account, and
  policy-blocked delivery must not create public response differences;
- email content must use a single-use short-lived link or code and must not
  include account existence proof, password material, token hashes, provider
  diagnostics, or admin-only details;
- provider-send throttles must be distinct from request throttles so attackers
  cannot force unlimited email attempts.

### Admin-delivered out-of-band reset material

Acceptable only as an explicitly approved self-hosted/admin policy, not as a
silent fallback.

Required constraints before runtime:

- admin/operator identity and permission model must be reviewed separately;
- the admin must not receive or store the user's long-term password;
- any one-time reset material must follow the same no-raw-storage,
  short-expiry, scoped, one-time consume, audit, and redaction policy as email
  delivery;
- operator evidence and audit should record safe reason/delivery categories,
  not submitted identifiers, reset tokens, token hashes, or full request
  bodies.

### In-app-only reset

Rejected for forgotten-password unauthenticated recovery.

In-app-only reset is useful only when the user already has a valid session or a
separately approved pending auth flow. It cannot prove control of an
out-of-band recovery channel for a user who has forgotten their password and
has no active session. Authenticated current-account password change already
exists and is a separate lane.

### Blocked until provider and admin policy are approved

Current runtime posture: blocked until delivery and implementation gates exist.

If no SMTP/email provider policy is approved and no admin-delivered
out-of-band reset policy is approved, Settleora should not expose a runtime
forgotten-password reset endpoint. The product may show safe unsupported-state
copy in future UI only after Figma/product review; this task adds no UI.

## Public Response And Anti-Enumeration Policy

Public reset request behavior must be uniform.

The public reset request response must not reveal whether:

- an account exists;
- the submitted identifier is valid or normalized;
- the account is local, OIDC-only, disabled, deleted, invited, or policy
  blocked;
- a reset token was issued;
- a provider is configured;
- delivery was attempted, skipped, throttled, or failed;
- an admin-delivered process exists for that identifier.

Approved request response direction for future runtime: a generic successful
acceptance such as `202 Accepted` or equivalent product-approved body. The
exact status and copy require future OpenAPI and product review.

Public verification and completion failures must also be uniform. Expired,
consumed, revoked, replayed, unknown, wrong-account, malformed, replaced,
provider-skipped, and policy-denied reset material should map to one generic
failure shape without revealing account, token, identifier, invite, provider,
or policy state.

Request-shape validation may reject clearly malformed transport input before
identifier lookup, but any value close enough to be a candidate local-account
identifier should prefer the uniform reset response.

## Reset-Token Storage Class

Raw reset tokens are forbidden in:

- PostgreSQL;
- logs, traces, metrics, and audit metadata;
- API responses except the one approved outbound delivery boundary;
- OpenAPI examples and generated clients;
- Codex reports and validation output;
- issue comments, screenshots, design examples, and operator docs examples.

Future runtime must store only hash/verifier-backed reset material.

Required persisted properties if a reset-token table or equivalent persistence
is approved later:

- purpose and scope, such as `local_password_reset`;
- subject binding to the resolved auth account only after safe internal
  resolution;
- optional unresolved normalized identifier hash or request bucket where
  needed for anti-abuse without exposing identifiers;
- delivery category, such as email provider, admin-delivered, provider skipped,
  or provider unavailable, using safe internal categories;
- expiry timestamp and issued timestamp;
- consumed timestamp and consumed-by workflow category;
- revoked timestamp and safe revocation reason;
- replay or suspicious-use marker where linked safely;
- replacement relationship when a newer reset supersedes older material;
- request or audit correlation ID where needed for investigation;
- bounded source and identifier bucket references where approved.

Reset tokens must be scoped and one-time. Possessing a token, token ID, token
hash, generated client method, email link, copied URL, or local cache row must
not authorize password reset unless the API validates the token, scope, subject,
expiry, one-time state, policy, and new password through the auth service
boundary.

## Expiry And Replay Policy

Approved email reset-link expiry: 60 minutes by default, with owner/admin
configuration allowed from 15 to 120 minutes.

Approved short-code/OTP-style expiry: if a future typed short code or OTP-style
reset flow is approved, the reset material should expire in 10 to 15 minutes.

Rationale:

- shorter windows reduce replay and mailbox-compromise exposure;
- self-hosted deployments may have slower email delivery, so a 60 minute
  default is the approved Day 1 email-link compromise between usability and
  replay exposure;
- links longer than 120 minutes remain outside the approved Day 1 range and
  require a later explicit auth/security decision.

Completion must atomically consume the reset material and replace the local
password credential in one server-owned transaction or equivalent consistency
boundary. Two concurrent completion attempts must not both succeed.

Required safe handling:

| State | Public behavior | Internal behavior |
| --- | --- | --- |
| Valid and unused | Complete only after account, local credential, password policy, expiry, and reset policy checks pass. | Consume atomically, rotate credential, audit success, revoke sessions and refresh families. |
| Expired | Generic failure. | Mark or audit expired category where safe; do not rotate credential. |
| Consumed | Generic failure. | Treat as replay/suspicious-use candidate where linked safely. |
| Revoked | Generic failure. | Preserve revocation reason internally; do not reveal reason. |
| Replayed | Generic failure. | Mark replay/suspicious category and consider account/session risk policy. |
| Unknown | Generic failure. | Avoid creating account-existence hints; audit only safe aggregate or unknown-token category where approved. |
| Wrong account or replaced | Generic failure. | Do not disclose ownership or replacement state. |
| Malformed | Generic failure or transport validation failure, depending on shape. | Do not log raw token; audit bounded malformed category only if safe. |

Successful reset must invalidate any still-unused older reset material for the
same account. Issuing newer reset material should revoke or replace older
outstanding reset material for the same account.

## Abuse And Rate-Limit Policy

Password reset needs its own abuse policy. It may reuse the sign-in limiter
concepts, but sign-in thresholds are not automatically correct for reset flows.

Required buckets:

- source bucket: coarse client/network source after proxy policy is reviewed;
- normalized identifier hash bucket: a non-reversible bucket derived from the
  normalized submitted identifier;
- combined source plus normalized identifier bucket;
- global deployment backstop;
- provider-send throttles per delivery category/provider.

Recommended behavior:

- apply cheap pre-issue throttles before token generation and provider send;
- count attempts even when no account or no local credential exists, without
  exposing that distinction;
- distinguish request throttles from provider-send throttles internally;
- avoid per-identifier lockout that lets attackers block a known user's reset
  indefinitely;
- use temporary throttling, cooldowns, and global emergency protection rather
  than permanent public lockout;
- surface only generic public responses for throttled, skipped, blocked, and
  accepted states;
- do not expose `Retry-After` initially unless a later auth/security decision
  explicitly approves it.

Audit and operator visibility may include aggregate counts, safe outcome
categories, source bucket category, normalized identifier hash category where
approved, provider-send category, and correlation IDs. They must not include
raw identifiers, full IP addresses, unbounded user-agent strings, raw bucket
keys, reset tokens, token hashes, passwords, or full request bodies.

## Session And Refresh-Family Revocation

After a successful local password reset, Settleora should revoke all active
access sessions and all active refresh/session families for the affected auth
account by default.

Any narrower behavior, such as preserving the current session, preserving a
device, or revoking only one family, requires explicit manual auth/security
approval before implementation.

Recommended internal revocation reason category: `password_reset` or an
equivalent bounded value approved during runtime design. The reset completion
response must not return revoked counts, session IDs, refresh family IDs, token
hashes, or device metadata.

## Audit Categories And Redaction

Future runtime should write bounded auth audit events for these categories:

- reset requested;
- reset material issued;
- delivery skipped where safe to record internally;
- delivery failed where safe to record internally;
- reset consumed successfully;
- reset denied or blocked by policy;
- reset expired;
- reset replayed or suspiciously reused;
- reset material revoked or replaced;
- sessions and refresh families revoked after successful reset.

Audit records should identify actor, subject, action, outcome, timestamp,
request/correlation ID, and safe reason/status categories where applicable.
Unauthenticated request events may not have a resolved subject and must not
force one into metadata.

Audit metadata, logs, reports, validation output, docs examples, and issue
comments must not contain:

- raw identifiers, email addresses, or submitted local identifiers;
- raw reset tokens, reset codes, reset links, token hashes, or verifier
  strings;
- plaintext passwords, password hashes, password verifier strings, salts,
  peppers, or password policy internals that aid attacks;
- raw session tokens, refresh credentials, token hashes, or session-family
  secrets;
- MFA recovery codes, challenge material, TOTP seeds, passkey private material,
  or provider payloads;
- full request bodies, full IP addresses, unbounded user-agent strings, or
  unnecessary PII.

## Notification Dependency

User-facing password reset security notification remains a separate
notification event, target, recipient, redaction, and delivery gate.

Successful password reset should eventually produce an account-owner security
notification only after a separate notification event/target/redaction gate.
This packet does not approve notification event constants, subject types, target
columns, OpenAPI fields, generated-client changes, provider snippets,
push/email sending, in-app notification writes, or UI routes.

Auth audit remains the security source of truth until a later notification
policy explicitly maps reset events to user-visible notifications.

## UI And Figma Dependency

No UI implementation is approved by this task.

Future mobile/user-web/admin UI requires product copy and Figma or an approved
reference before implementation. The UI must not:

- confirm account existence;
- distinguish provider unavailable from account missing;
- display raw reset tokens, token hashes, verifier strings, or internal audit
  data;
- treat local route state, copied URLs, hidden controls, generated-client
  methods, or notification visibility as password reset authority.

## Schema, OpenAPI, And Generated-Client Gate

No schema, migration, OpenAPI, or generated-client changes are approved by this
task.

Future runtime requires explicit review of:

- reset-token persistence schema or equivalent storage;
- indexes, uniqueness, expiry cleanup, consumed/revoked/replayed states, and
  retention;
- public request/verify/complete endpoint paths and response shapes;
- problem response redaction and anti-enumeration behavior;
- generated web and Dart client diffs from `npm run generate:clients`;
- tests proving generated clients remain transport-only and do not decide
  account existence, token validity, credential state, or authorization.

Generated clients must not be hand-edited.

## Recommended Smallest Runtime Slice

With the local reset delivery/token policy approved, the smallest future runtime
slice should still wait for the remaining schema/OpenAPI/generated-client/API/
provider/notification/UI/final auth-security gates and should be:

- local-account-only password reset;
- one approved delivery posture, either configured SMTP/email or explicitly
  approved admin-delivered out-of-band reset material;
- public request plus completion flow with uniform anti-enumeration responses;
- hash/verifier-backed one-time reset material with 60 minute default email-link
  expiry and a 15 to 120 minute owner/admin configurable range;
- atomic consume and credential replacement through API auth services;
- account-wide active session and refresh-family revocation after success;
- bounded audit and redaction tests;
- focused abuse buckets and provider-send throttles;
- no invitation, admin reset, break-glass, OIDC provider password recovery,
  MFA/passkey expansion, notification runtime, or UI in the same slice unless
  separately approved.

Required validation for an approved runtime slice will be broader than this
docs task and should include focused API tests, OpenAPI/client validation if
contracts change, migration validation if schema changes, and redaction/scope
tests for logs/audit/problem responses.

## Close And Keep-Open Posture

- Keep #336 open.
- Keep #339 open.
- Do not claim runtime password reset is implemented.
- Do not mark #339 runtime-ready until schema/OpenAPI boundary, generated-client
  impact, API runtime design, provider configuration, notification event/target/
  redaction behavior, UI/Figma/product copy, and final auth/security acceptance
  are explicitly approved or split into blocked child tasks.

## Remaining Separate Gates

- Schema, migration, retention, and cleanup design for reset material.
- OpenAPI paths, response shapes, problem redaction, and generated-client diffs.
- API runtime implementation and focused auth/security tests.
- SMTP/email provider configuration, verification, and approval for this
  security flow.
- Separately approved admin-delivered recovery policy if that delivery path is
  ever used.
- Approve reset abuse thresholds, provider-send throttles, and whether any
  future `Retry-After` response is safe.
- Approve auth audit action names, safe metadata keys, and retention posture.
- Approve password reset user-facing security notification event, target,
  recipient, redaction, and delivery behavior.
- Approve product copy and Figma/reference before UI.
- Final auth/security acceptance before runtime password reset work ships.
