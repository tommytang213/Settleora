# Auth Local Password Reset API Runtime Readiness Gate

## Purpose

This docs-only gate records the API/service runtime readiness posture for Day 1
local-account password reset after the schema/domain and OpenAPI/generated-client
foundation slices. It determines the safe next implementation posture from
current repo and GitHub evidence. It does not implement runtime code, route
registration, provider delivery, notification runtime, UI, OpenAPI, generated
clients, schema, migrations, configuration, deployment, or secrets.

## Current-State Readback

- Verified baseline for this gate: `origin/main` at
  `65961d7a60b7c1732e2d932ad1c69b7439861541`, the PR #737 merge commit.
- PR #734 `feat(api): add local password reset schema foundation` merged at
  `bf2f6cd1526b2c71283c97a5f8bdf6aba60d0df7` from reviewed head
  `d66a6328a84f70eb3a5f6d3145e5e182612b9df0`. It added only the
  schema/domain foundation for `auth_password_reset_requests`, bounded reset
  category constants, EF mapping/migration, and focused tests.
- PR #736 `feat(api): add local password reset OpenAPI contract` merged at
  `ce18aaaf9975ec26b1a02e55fd3310c42273cb3f` from reviewed head
  `03878c114bccd817fee1200c8cbf01bb1238d29d`. It added the transport contract
  and generated web/Dart clients for:
  - `POST /api/v1/auth/password-reset/request`
    (`requestLocalPasswordReset`);
  - `POST /api/v1/auth/password-reset/complete`
    (`completeLocalPasswordReset`).
- PR #737 `docs(auth): record password reset contract merge checkpoint` merged
  at `65961d7a60b7c1732e2d932ad1c69b7439861541` from reviewed head
  `0cc755e676d5a72e2c5b78e9710f83caf48545f0`. It recorded the PR #736
  OpenAPI/generated-client post-merge checkpoint in the ledger.
- Current repo state includes the schema/domain foundation and generated
  transport clients. Runtime password reset remains unimplemented: there are no
  password-reset API handlers, route registration, request/completion services,
  reset-material runtime generation/consumption, provider handoff for reset,
  reset-specific abuse runtime, reset-specific audit runtime, reset-triggered
  session/refresh-family revocation runtime, reset notification runtime, or UI.
- GitHub #336 remains `OPEN` with Project status `Inbox`.
- GitHub #339 remains `OPEN` with Project status `Needs Decision`.

## Policy Guardrails

Approved guardrails from the password reset/recovery, token policy, and
schema/OpenAPI/runtime design gates:

- local-account reset only;
- no Settleora reset for OIDC/provider-owned passwords;
- no raw reset tokens, links, codes, passwords, hashes, verifier strings, token
  hashes, submitted identifiers, request bodies, provider payloads, or sensitive
  auth/session material in persistence, logs, audit, reports, OpenAPI examples,
  generated clients, issue comments, screenshots, or UI copy;
- no runtime forgotten-password endpoint exposure unless an approved SMTP/email
  delivery policy or separately approved admin-delivered recovery policy exists;
- generated clients are transport only and never authority;
- API/domain owns account lookup, reset material issuance and consumption,
  credential replacement, session and refresh/session-family revocation, abuse
  policy, and audit;
- public request behavior must remain anti-enumeration-safe and must not reveal
  account existence, local-vs-OIDC state, credential state, provider state,
  delivery attempt state, throttling internals, token issuance, policy-blocked
  state, or runtime support;
- successful reset must revoke account-wide active sessions and refresh/session
  families by default unless a later auth/security gate narrows that policy.

## Runtime Exposure Decision

State: `READY_FOR_INTERNAL_SERVICE_ONLY`.

Evidence:

- The schema/domain model and OpenAPI/generated-client transport surfaces are
  merged, so an internal runtime foundation can now target concrete persistence
  and request/complete contract shapes.
- The approved token policy says SMTP/email reset links are allowed only when a
  deployment email provider is configured, verified, and approved for this
  security flow, and that admin-delivered recovery is a separate later gate.
- `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md` defines generic optional
  SMTP notification-channel policy and explicitly says it does not authorize
  runtime SMTP sending, provider setup, auth/session/security runtime changes,
  or secrets.
- Current API code has an optional `SmtpEmailNotificationSender` and provider
  readiness readout, but that foundation is generic notification plumbing. It
  is disabled by default, treats missing config as unconfigured, uses generic
  notification templates, and is not an approved password-reset delivery
  provider or reset email content gate.
- Current auth/session/security notification policy blocks security
  notifications until exact event semantics, target references, recipient
  policy, and redaction are approved.

Decision:

- API/service runtime implementation is not approved for public route
  registration or exposure.
- Public route registration/exposure for
  `/api/v1/auth/password-reset/request` and
  `/api/v1/auth/password-reset/complete` remains blocked until SMTP/email reset
  delivery is configured, verified, and approved for this security flow or a
  separately approved admin-delivered recovery policy exists.
- A next internal service/repository foundation slice is acceptable only if the
  public routes stay disabled/unregistered and no outbound reset delivery is
  attempted.

## Allowed Next Implementation Slice Recommendation

Recommended next bounded slice:
`internal API/service runtime foundation next with route exposure disabled/unregistered`.

Why:

- The merged schema/domain and contract surfaces give the next slice enough
  shape to implement internal orchestration, material hashing/verifier handling,
  repository state transitions, credential replacement integration,
  session/refresh-family revocation integration, audit categories, and focused
  tests without creating a public forgotten-password flow.
- Public runtime is still blocked because there is no current repo approval for
  password-reset SMTP/email provider configuration/verification or for an
  admin-delivered recovery policy.
- A separate SMTP/email provider configuration/verification gate remains
  required before any public route exposure or reset email sending.

The internal slice must not register Minimal API routes, map the OpenAPI paths
to live handlers, send email, expose reset status publicly, add UI, mutate
provider config, or treat generated clients as runtime authority.

## Runtime Service Boundaries

Future internal runtime should preserve thin endpoint handlers and place
credential/security behavior inside API/domain auth services.

Request orchestration:

- validate only transport shape at the boundary;
- normalize the submitted reset identifier inside an auth service;
- derive safe source, identifier, combined, global, and provider-send bucket
  references without logging raw input;
- apply cheap reset-specific abuse checks before account lookup and before any
  provider-send attempt;
- resolve local identity/account/active local password credential internally
  without public enumeration;
- if no eligible local account exists, the account is OIDC-only, disabled,
  deleted, policy-blocked, provider delivery is unavailable, or throttling
  applies, record only safe internal categories and return the uniform public
  response when public routes are later approved;
- when provider policy is approved later, issue high-entropy material, store
  only hash/verifier-backed lookup material, replace older outstanding material
  atomically, and hand off only to the approved delivery provider.

Completion orchestration:

- validate submitted reset material and new password shape without logging raw
  values;
- derive a purpose-bound lookup hash/verifier for submitted reset material;
- resolve the candidate reset row inside the auth service boundary;
- reject unknown, expired, consumed, revoked, replaced, wrong-scope,
  wrong-account, malformed, replayed, disabled-account, OIDC-only, and
  policy-denied states through a generic public failure shape when public
  routes are later approved;
- re-check local-account eligibility, account status, active credential state,
  password policy, and reset policy at consume time;
- in one transaction or equivalent consistency boundary, atomically mark reset
  material consumed, replace the local password credential through the existing
  credential workflow/password hashing boundary, revoke outstanding reset
  material for the account, revoke active sessions and refresh/session
  families, and write bounded audit;
- ensure concurrent consume races allow only one successful completion.

Reset material generation/hash/verifier handling:

- generate high-entropy material only inside a reset-material service boundary;
- store only a purpose-bound keyed digest or verifier-backed lookup value;
- never persist, log, audit, report, document, or expose raw reset material,
  reset links, reset codes, verifier strings, token hashes, or provider
  payloads;
- keep scope values bounded, such as `email_link` or a later approved
  `typed_code`.

Credential replacement:

- replace local credentials only through the existing password hashing and
  credential workflow boundaries;
- never write plaintext passwords or verifier internals from endpoint handlers;
- map hashing or credential replacement failures to generic reset failure
  categories without leaking password policy or account state.

Session and refresh/session-family revocation:

- successful reset should revoke all active sessions and refresh/session
  families for the affected account by default;
- preserve the current session/refresh runtime boundaries and safe revocation
  reason categories;
- do not issue access or refresh credentials as a reset-completion side effect
  unless a later auth/security gate approves sign-in-after-reset behavior.

Audit:

- candidate categories include request accepted/skipped, material issued,
  provider skipped/unavailable/failed-safe, completion consumed, replay or
  suspicious reuse, credential replaced, reset denied, and sessions revoked;
- audit metadata may include bounded workflow/status/reason categories,
  correlation IDs, account subject only after safe internal resolution, reset
  request ID, and safe bucket references where policy allows;
- audit metadata must not include raw identifiers, reset material, reset links,
  password values, password hashes, verifier strings, token hashes, provider
  payloads, request bodies, full IP addresses, or unbounded user-agent strings.

Abuse buckets and provider-send throttles:

- reset runtime needs reset-specific source, identifier, combined, global, and
  provider-send buckets;
- sign-in limiter concepts may be reused, but sign-in thresholds are not
  automatically correct for reset;
- provider-send throttles must be separate from request throttles so attackers
  cannot force unlimited email attempts;
- do not expose `Retry-After` until a later auth/security decision approves it.

Replay and concurrent consume handling:

- expired, consumed, revoked, replaced, malformed, wrong-scope, wrong-account,
  and unknown material must not rotate credentials;
- reuse of known consumed/revoked material may be classified internally as
  suspicious replay where linkable safely;
- concurrent completion attempts must not both succeed.

Uniform public response mapping:

- request success should use the reviewed generic accepted shape, regardless of
  account/provider/policy/delivery outcome;
- completion failures should use one generic failure shape where distinctions
  could reveal token or account state;
- public problems must not expose account existence, token validity, expiry,
  provider state, delivery state, password-policy internals, audit IDs, session
  counts, or internal policy names.

## Provider And Notification Separation

The following remain separate gates and must not be hidden inside the next
runtime foundation slice:

- SMTP/email provider configuration, verification, and approval for password
  reset;
- reset email content/template, link construction, base URL policy, target
  redaction, and delivery failure copy;
- admin-delivered recovery policy and any operator evidence model;
- user-facing security notification event semantics, targets, recipients,
  suppression/bypass behavior, and redaction;
- UI/Figma/mobile/web/admin screens and product copy;
- notification provider delivery runtime and background worker behavior.

The current SMTP email sender and notification provider readiness readout can
inform a later provider gate, but they do not by themselves satisfy the
approved password reset delivery policy.

## Future Validation/Test Matrix

Future internal/runtime slices should include focused tests for:

- request anti-enumeration across existing local account, missing account,
  OIDC-only account, disabled/deleted account, missing local credential,
  provider disabled/unconfigured/skipped/failed, and throttled states;
- no raw reset identifiers, reset material, reset links, reset codes,
  passwords, hashes, verifier strings, token hashes, provider payloads, request
  bodies, or unsafe diagnostics in logs, audit rows, problem responses, reports,
  or examples;
- material issuance stores only hash/verifier-backed lookup material and revokes
  older outstanding material for the same account/purpose;
- expiry behavior for email-link material and future typed-code material if
  approved;
- completion success replaces the local password credential through the
  credential workflow and returns no session or refresh credentials;
- completion rejects expired, consumed, revoked, replaced, malformed,
  wrong-scope, unknown, OIDC-only, disabled-account, missing-local-credential,
  and policy-denied states safely;
- weak-password response safety, ensuring password policy feedback cannot
  become a token-validity or account-existence oracle;
- session and refresh/session-family revocation after successful reset;
- replay and suspicious reuse classification without public leakage;
- concurrent consume race where only one completion succeeds;
- reset-specific source, identifier, combined, global, and provider-send abuse
  bucket behavior;
- provider disabled, provider unconfigured, provider skipped, provider
  throttled, and provider failure behavior with uniform public responses;
- route exposure guard tests if internal services are implemented before route
  registration.

## Issue Posture

- Keep #336 open. Current Project status readback: `Inbox`.
- Keep #339 open. Current Project status readback: `Needs Decision`.
- No issue closure, issue comment, label mutation, or Project field mutation is
  required by this gate.

## Remaining Gates

- SMTP/email provider configuration and verification gate.
- Optional admin-delivered recovery gate.
- Public API/service route exposure gate after provider/admin delivery approval.
- Notification event/target/redaction gate.
- UI/Figma/mobile/web/admin/product copy gate.
- Reset abuse threshold tuning gate.
- Audit retention/final audit acceptance gate.
- Final auth/security acceptance.

## Scope Confirmation

This gate is docs-only. It does not modify runtime password reset code,
Minimal API route registration, auth services, password reset material
generation, SMTP/email provider code or config, notification runtime, UI,
OpenAPI, generated clients, EF schema, migrations, domain models, secrets,
environment files, appsettings, Docker, deployment, CI, Codemagic, TestFlight,
money, settlement, payment, bill calculation, OCR, storage, sync, import/export,
backup/restore, reconciliation, issue state, or Project fields.
