# #369 Session Revocation Notification Runtime Readiness Decision Packet

## Purpose

This packet decides whether the narrow #369 session revocation notification
candidate is ready for a focused future runtime PR.

Decision: `BLOCKED_PENDING_MANUAL_DECISIONS`.

The source-state and target/event design gates now define a safe first slice,
but runtime is not approved yet. A future runtime PR must wait for explicit
manual auth/security approval and a reviewed schema/OpenAPI/generated-client
boundary for the first-class `authSessionId` target, `auth_session` subject,
and `security.session_revoked` event shape.

This is a docs/planning decision packet only. It does not implement runtime
notification writers, event constants, subject constants, target columns,
database schema, migrations, API behavior, OpenAPI changes, generated-client
changes, auth/session/security runtime behavior, provider sending, device-token
lifecycle, mobile/web/admin UI, Figma output, #371 notification-open/deep-link
runtime, money, settlement, bill, OCR, storage, sync, reconciliation,
deployment, CI, Docker/env, CodeMagic/TestFlight behavior, secrets, issue
closure/reopen, or Project mutation.

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
- `docs/architecture/DATABASE_FOUNDATION.md`
- `docs/planning/NOTIFICATION_369_AUTH_SECURITY_SOURCE_DECISION_PACKET.md`
- `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_SOURCE_DESIGN_PACKET.md`
- `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_TARGET_EVENT_DESIGN_PACKET.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- Recent `.codex/reports/` for PRs #709, #711, and #712.

No required input file was missing.

## Decision Summary

Status: `BLOCKED_PENDING_MANUAL_DECISIONS`.

The runtime implementation is not ready to start automatically. Repo evidence
supports a smallest future implementation slice, but the first slice remains
blocked until these manual decisions are made:

- Approve `security.session_revoked` as a user-facing in-app security
  notification for user-initiated current-account per-session revocation.
- Approve actor self-notification for this exact safety-confirmation event.
- Approve the first-class target shape:
  `subjectType: auth_session` plus `authSessionId`.
- Approve the minimal schema/OpenAPI/generated-client changes needed to expose
  this event, subject, and target safely.
- Confirm future writer placement, duplicate/idempotency behavior, transaction
  behavior, and auth audit correlation after successful revocation.
- Confirm redaction rules for notification rows, API responses, logs, tests,
  reports, safe summaries, and any future provider snippets.

Until those approvals exist, runtime remains blocked.

## Current Evidence

PR #709 merged the auth/session/security source decision packet. That packet
found that auth/session/security notification runtime was not ready from #369
alone because event constants, subject types, first-class auth/security
targets, authorized open/refetch behavior, recipient rules, and redaction
approvals were still missing.

PR #711 merged the source-state gate for the narrow session revocation
candidate. It selected only user-initiated current-account per-session
revocation as the safest first future source candidate. The source must be the
successful API-owned revocation transition for one non-current session owned by
the authenticated account, with the affected account owner's server-mode
profile as the only recipient.

PR #712 merged the target/event gate. It recommended:

- event key: `security.session_revoked`;
- subject type: `auth_session`;
- versioned contract: `security.session_revoked.v1`;
- first-slice target: first-class `authSessionId`;
- open behavior: re-fetch the notification through current-user notification
  APIs, then re-fetch session/security state through current-account authorized
  auth/session APIs.

The current OpenAPI contract already has current-account session list and
revocation endpoints plus current-user notification list/read/archive APIs.
However, current notification response shape and enums do not include
`security.session_revoked`, `auth_session`, or `authSessionId`. That is why the
future runtime slice needs explicit schema/OpenAPI/generated-client review
instead of treating the existing notification shape as sufficient.

## Proposed First Runtime Slice If Approved

If manual runtime approval is granted, the smallest safe future runtime PR is:

- source event: user-initiated current-account per-session revocation only;
- source action: one successful API-owned revocation of one non-current session;
- actor: the authenticated account owner;
- recipient: the same affected account owner's server-mode profile only;
- channel: safe in-app notification only;
- event key: `security.session_revoked`;
- subject type: `auth_session`;
- event contract: `security.session_revoked.v1`;
- target: first-class `authSessionId` for the revoked session row;
- open path: current-user notification re-fetch, then current-account
  authorized auth/session re-fetch;
- audit relationship: auth audit remains the security source of truth, and the
  notification is only a user-facing prompt derived from the reviewed source
  transition.

The future PR may include the minimal database/API/OpenAPI/generated-client
diff needed for this single event if the manual gate approves that scope. It
must not broaden to other auth/security events or notification families.

## Forbidden Runtime Expansion

The first runtime slice must not bundle:

- admin revocation;
- account-wide revocation;
- suspicious session, replay, or session-family revocation;
- current-session sign-out;
- ordinary expiry;
- denied revocation attempts, not-found targets, already-revoked targets, or
  revocation validation failures;
- credential, MFA, passkey, provider, reset, recovery, or security-policy
  changes;
- provider sending;
- SMTP, APNs, or FCM activation;
- provider config or secrets;
- device-token lifecycle work;
- mobile, web, or admin UI;
- Figma output;
- #371 notification-open/deep-link behavior unless separately approved for this
  exact target;
- unrelated notification families;
- unrelated auth/session runtime;
- login, current-user, session middleware, token issuance, or revocation
  endpoint behavior changes beyond the approved writer call;
- money, bill, settlement, payment, recurring, OCR, storage, sync, or
  reconciliation behavior;
- Docker, environment, deployment, CI, CodeMagic, or TestFlight behavior.

## Source Authority

The future source event must come only from an API/domain auth/session boundary
after successful revocation and auth audit creation or correlation.

Clients, workers, generated clients, push payloads, local cache, notification
preference rows, session-list display, current-user validation, polling, and
provider delivery state are not authority for this event.

The future writer may run only after:

- the authenticated actor is derived server-side;
- the target session is loaded and verified as owned by the current auth
  account;
- authorization and revocability checks pass;
- the revocation transition succeeds or is included in the same successful
  transaction boundary;
- duplicate/idempotency behavior for the same transition is explicit;
- the revocation has an auth audit event or approved audit correlation.

## Recipient Rules

Only the affected account owner's server-mode `UserProfile` may receive the
first-slice notification.

Recipients must be derived server-side from the target session's auth account
and linked profile. The first slice must never notify unrelated users, admins,
owners, operators, support viewers, friends, group members, bill participants,
settlement counterparties, OCR/review participants, sync participants, local
profiles, client-supplied profile IDs, route parameters, cache rows,
notification preference rows, device-token owners, or generated-client callers.

Actor self-notification is allowed only for this exact event because the actor
and affected account owner are the same account. That behavior still requires
manual approval and focused tests.

## Target And Open Rules

The future target is a navigation/reference hint only.

Future open/read behavior must:

1. Re-fetch the notification through the authenticated current-user
   notification API.
2. Confirm the event family and subject are `security.session_revoked` and
   `auth_session`.
3. Treat `authSessionId` only as a hint.
4. Re-fetch session/security state through current-account authorized
   auth/session APIs.
5. Verify the session belongs to the current authenticated account at read
   time.
6. Render a generic unavailable state when unauthenticated, account-switched,
   offline, server-unavailable, stale, missing, expired beyond retention, or
   unauthorized.

Client-supplied IDs, route params, action URLs, local cache, push payloads,
copied IDs, notification visibility, or generated-client availability are not
authorization proof.

## Audit And Redaction

Auth audit remains the source of security truth. The notification is only a
user-facing prompt and must not replace audit evidence.

Notification content must avoid:

- raw bearer/session tokens;
- raw refresh tokens;
- raw bearer-like session IDs;
- token hashes;
- refresh credential IDs/hashes and session-family secrets;
- raw or unbounded IP/user-agent data;
- full device fingerprints, raw abuse identifiers, or rate-limit bucket keys;
- passwords, password hashes, salts, peppers, verifier strings, reset tokens,
  recovery codes, MFA secrets, passkey private material, reusable challenges,
  WebAuthn authenticator payloads, OIDC tokens, provider payloads, provider
  secrets, certificates, signing material, service-account JSON, and secret
  references;
- another user's local account identifier, email, profile identifiers,
  recipient lists, admin diagnostics, or unrelated account data;
- bill, settlement, payment, OCR, storage, sync, group, friend, recurring,
  reconciliation, or unrelated business data.

Read, archive, and open actions must not mutate auth session state, auth audit,
credential state, account state, revocation state, security policy, provider
delivery state, device-token state, or delivery-attempt/outbox state.

## Schema, OpenAPI, And Generated-Client Decision

The future first runtime slice cannot safely avoid schema/OpenAPI/generated-
client review in the current repo state.

Reason: the approved target/event design requires `security.session_revoked`,
`auth_session`, and first-class `authSessionId`. Current OpenAPI notification
enums and response fields do not expose those values, and the current
notification target model does not include an auth-session target. Hiding the
target in `safeSummary`, overloading unrelated target columns, or relying only
on `actionUrl` would violate the merged target/event packet.

Therefore, if runtime is later approved, the future PR likely requires the
minimal reviewed set of:

- notification event/subject constants;
- database target persistence for `authSessionId` if the existing schema cannot
  already store it safely;
- OpenAPI enum/response updates;
- generated web/Dart client refresh from the OpenAPI contract;
- focused tests proving authorization, redaction, and read/archive isolation.

The first runtime slice does not require mobile/web/admin UI, provider sending,
SMTP/APNs/FCM activation, device-token lifecycle work, #371 broad notification
open/deep-link behavior, CodeMagic/TestFlight work, Docker/deployment changes,
or unrelated runtime domains.

## Validation Plan For Future Runtime PR

A future approved runtime PR should run validation matching its actual diff. If
it touches API/schema/OpenAPI/generated clients as expected, minimum validation
should include:

```bash
git fetch origin --prune
git status --short
git diff --name-only origin/main...HEAD
git diff --check origin/main...HEAD
npm run validate:docs
npm run validate:scaffold
npm run validate:openapi
npm run generate:clients
npm run validate:clients
npm run validate:api-local
```

Focused API/domain tests should cover:

- notification creation only after successful current-account per-session
  revocation;
- no notification for denied, not-found, already-revoked, expired, current-
  session sign-out, sign-out-all, session-list reads, current-user validation,
  preference reads, local cache, generated-client availability, or provider
  state;
- affected account owner as the only recipient;
- explicit actor self-notification opt-in for this event only;
- duplicate/idempotent replay behavior for the same transition;
- safe `authSessionId` target persistence and response shape;
- current-account target re-fetch authorization;
- stale, missing, retained-revoked, expired, and unauthorized fallback without
  existence leaks;
- notification read/archive/open isolation from auth state and audit state;
- forbidden-content redaction across rows, API responses, logs, tests, reports,
  safe summaries, and future provider snippets;
- provider-disabled/unconfigured behavior with no provider attempts and no fake
  delivery success.

Do not run mobile, Docker, CodeMagic, TestFlight, or provider validation unless
the future diff touches those areas. If it unexpectedly does, stop and report a
scope violation rather than expanding the slice silently.

## Issue And Project Hygiene

Keep #369 open unless a future implementation PR completes the scoped runtime
slice and the issue close rule is explicitly satisfied.

Keep #368, #403, #634, and #635 open unless separately resolved.

Keep #371, #570, and #575 closed unless a concrete regression or separately
approved follow-up is found.

After a future runtime PR merges, update the issue progress ledger with:

- PR number, merge SHA, and reviewed head SHA;
- exact completed runtime slice;
- validation commands and exact results;
- schema/OpenAPI/generated-client impact;
- issue close/keep-open recommendation;
- confirmation that no provider sending, UI, #371 broad route behavior,
  device-token lifecycle, unrelated auth/session runtime, money, bill,
  settlement, OCR, storage, sync, reconciliation, deployment, CI, CodeMagic,
  TestFlight, secrets, or Project mutation occurred.

Do not close or reopen issues and do not mutate Project fields from this docs
packet.

## Scope Guard

This packet changes documentation only. It confirms no runtime code, API
behavior, OpenAPI, generated clients, schema/migrations, notification writers,
constants, event handlers, auth/session/security runtime, login/current-user/
session middleware, token issuance/revocation endpoints, provider sending,
SMTP/APNs/FCM activation, provider config/secrets, device-token lifecycle,
delivery attempts/outbox/provider behavior, mobile/web/admin UI, Figma output,
#371 runtime, money, settlement, bill, OCR, storage, sync, reconciliation,
Docker/env/deployment/CI/CodeMagic/TestFlight behavior, secrets, issue closure/
reopen, or Project fields are changed or authorized here.
