# Auth TOTP MFA API Contract

This document defines the design-only API contract direction for TOTP authenticator-app enrollment, sign-in and step-up challenges, factor management, recovery-code generation/use/regeneration, audit hooks, error expectations, and future OpenAPI boundaries for GitHub issue #415.

It builds on [AUTH_MFA_PASSKEY_ARCHITECTURE.md](AUTH_MFA_PASSKEY_ARCHITECTURE.md), [AUTH_MFA_PASSKEY_POLICY_AUDIT.md](AUTH_MFA_PASSKEY_POLICY_AUDIT.md), and [AUTH_PASSKEY_WEBAUTHN_API_CONTRACT.md](AUTH_PASSKEY_WEBAUTHN_API_CONTRACT.md). Those documents remain the guardrails for factor state, challenge storage, policy hooks, audit redaction, sensitive data handling, and sequencing.

This is documentation and control architecture only. It does not implement runtime behavior, approve migrations, change canonical OpenAPI, regenerate clients, add UI, create secrets, change auth/session middleware, or change deployed security behavior.

## Current State

Settleora currently has auth account, local password credential, session, refresh/session-family, role, admin local-user foundation, and bounded auth audit foundations. The repository does not have TOTP factor tables, TOTP secret storage, recovery-code tables, MFA challenge storage, TOTP or recovery-code endpoints, OpenAPI TOTP/MFA paths or schemas, generated MFA clients, TOTP UI, recovery-code UI, or session step-up runtime.

Existing auth/session endpoints cover first-owner bootstrap, local sign-in, refresh, current-user, current-session sign-out, current-account sign-out-all, session list, and per-session revocation. This document does not authorize changing those endpoints. Future canonical API work must update `packages/contracts/openapi/settleora.v1.yaml` in a separately scoped OpenAPI task, regenerate clients, and pass generated-client validation.

## API Authority Model

TOTP MFA and recovery-code authority belongs to API/domain auth services.

- API/auth services own enrollment creation, secret/provisioning generation boundaries, challenge persistence, challenge verification, factor writes, recovery-code verifier writes, session issuance, step-up satisfaction decisions, revocation, and auth audit.
- TOTP factor records bind to `auth_accounts`, not `user_profiles`. Profile display state is not proof of authentication.
- Clients may render setup material once, collect submitted codes, and display safe factor/recovery status, but clients never decide whether MFA is required, whether a code is valid, whether a session is fresh enough, whether a recovery code is reusable, or whether an operation is authorized.
- Clients must not infer authorization or MFA requiredness from hidden UI, cached factor lists, local routes, local settings, or generated-client availability.
- Workers must not mutate auth, session, MFA factor, challenge, recovery-code, security-policy, or auth audit state.
- OpenAPI and generated clients are transport boundaries after future reviewed contract implementation; they do not grant permission.

## Endpoint Design Draft

Route names below are draft documentation vocabulary. They are not canonical OpenAPI paths until a future contract task explicitly updates the OpenAPI source of truth.

| Draft endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/totp/enrollment` | Authenticated current session, freshness as policy requires | Begin TOTP enrollment for the current account and return one-time setup display material. |
| `POST /api/v1/auth/totp/enrollment/{totpEnrollmentId}/verify` | Authenticated current session, same account as enrollment | Verify the submitted TOTP code for the pending factor and activate the factor only after server verification. |
| `DELETE /api/v1/auth/totp/enrollment/{totpEnrollmentId}` | Authenticated current session, same account as enrollment | Cancel a pending enrollment and revoke/discard pending setup material according to retention policy. |
| `GET /api/v1/auth/mfa/factors` | Authenticated current session | List safe display metadata for the current user's TOTP and future MFA factors according to retention policy. |
| `PATCH /api/v1/auth/mfa/factors/{mfaFactorId}` | Authenticated current session, fresh step-up where policy requires | Update bounded display metadata, such as a user-visible label. |
| `DELETE /api/v1/auth/mfa/factors/{mfaFactorId}` | Authenticated current session, fresh step-up where policy requires | Disable or revoke a current user's factor without exposing factor secret material. |
| `POST /api/v1/auth/mfa/challenges` | Anonymous pending sign-in flow or authenticated current session | Create or continue a TOTP/recovery challenge for sign-in or step-up where policy requires MFA. |
| `POST /api/v1/auth/mfa/challenges/{mfaChallengeId}/totp/verify` | Same pending auth flow or authenticated session bound to the challenge | Verify one submitted TOTP code and mark only server-side sign-in or step-up state as satisfied on success. |
| `POST /api/v1/auth/mfa/challenges/{mfaChallengeId}/recovery-code/verify` | Same pending auth flow or authenticated session bound to the challenge | Verify and consume exactly one recovery code as a fallback for the bound challenge. |
| `POST /api/v1/auth/recovery-codes` | Authenticated current session, fresh step-up where policy requires | Generate or regenerate a recovery-code batch, revoke/replace prior unused codes according to policy, and return raw codes exactly once. |
| `GET /api/v1/auth/recovery-codes` | Authenticated current session | Return safe recovery-code batch metadata such as remaining count and generated timestamp; never return raw or stored code material. |
| `DELETE /api/v1/auth/recovery-codes/{recoveryCodeBatchId}` | Authenticated current session, fresh step-up where policy requires | Revoke one recovery-code batch without exposing code material. |

Endpoint implementation should keep enrollment, sign-in challenge, step-up challenge, factor management, and recovery-code lifecycle operations distinct even if they share internal services. Each operation needs a purpose, account/session binding, expiry, replay protection, rate limiting, and audit category.

## Request And Response Shape Guidance

Future OpenAPI schemas should use explicit Settleora wrapper schemas instead of exposing unbounded request bodies.

Candidate schema names:

- `TotpEnrollmentStartRequest`
- `TotpEnrollmentStartResponse`
- `TotpEnrollmentVerifyRequest`
- `TotpEnrollmentResponse`
- `MfaFactorSummary`
- `MfaFactorListResponse`
- `MfaFactorUpdateRequest`
- `MfaFactorResponse`
- `MfaChallengeCreateRequest`
- `MfaChallengeResponse`
- `MfaTotpVerifyRequest`
- `MfaChallengeVerifyResponse`
- `MfaRecoveryCodeVerifyRequest`
- `RecoveryCodeBatchGenerateRequest`
- `RecoveryCodeBatchGenerateResponse`
- `RecoveryCodeBatchSummary`
- `RecoveryCodeBatchResponse`

Request bodies should accept only the fields needed for the specific operation. They must reject client-submitted account IDs, actor IDs, session IDs, factor ownership, policy decisions, raw secret material, stored recovery-code material, audit metadata, or unsupported provider payloads.

Responses may include:

- Stable server-side `totpEnrollmentId`, `mfaChallengeId`, `mfaFactorId`, and `recoveryCodeBatchId` values that are not raw secrets.
- One-time TOTP setup display material during enrollment start, such as issuer, account label, algorithm, digits, period, and a provisioning URI or QR payload derived by the API.
- A safe display label, factor type, factor status, created, verified, last-used, updated, disabled, and revoked timestamps where safe.
- Challenge purpose values such as `sign_in`, `step_up`, `enrollment_verification`, or `recovery`.
- Challenge status values such as `pending`, `verified`, `expired`, `consumed`, `blocked`, or `cancelled` where useful.
- Recovery-code batch metadata such as total generated, remaining unused count, used count, generated timestamp, displayed-once state, replaced/revoked timestamps, and policy version.
- Raw recovery codes only in the immediate generate/regenerate response, never on metadata reads.
- Session result or step-up freshness fields only after server-side verification succeeds and only in future reviewed auth/session response shapes.

Responses must not include:

- TOTP shared secrets, otpauth URIs, provisioning URI contents, QR payloads, or secret setup material after the one allowed enrollment-start display response.
- Submitted TOTP codes.
- Raw recovery codes except the one allowed generate/regenerate display response.
- Stored recovery-code hashes, salts, verifiers, comparison metadata, or code prefixes that aid guessing.
- Raw session, refresh, reset, challenge, or provider tokens except in existing or future reviewed token issuance responses.
- Full request bodies, full response bodies, full user-agent or IP history, sensitive provider payloads, storage paths, or unrelated business data.

Examples in docs, OpenAPI, tests, logs, and reports must use placeholders such as `otpauth://example-redacted`, `RECOVERY-CODE-REDACTED`, or opaque IDs. They must not contain plausible live TOTP seeds, OTPs, recovery codes, session secrets, or provider payloads.

## TOTP Enrollment Lifecycle

TOTP enrollment starts from an authenticated current session. The API must check account status, session freshness, policy availability, existing factor state, rate limits, and enrollment eligibility before creating setup material.

Enrollment start requirements:

- Create a pending TOTP factor or pending enrollment record bound to the current `auth_account` and current session where applicable.
- Generate the shared secret only through the approved future auth-secret, envelope-encryption, or vault boundary.
- Store protected secret material or a protected secret reference only; never store shared secrets as plaintext ordinary columns.
- Return only the minimum display material needed to enroll an authenticator app.
- Treat the shared secret, otpauth URI, QR payload, and manual entry key as display-time sensitive material.
- Emit safe audit such as `totp.enrollment_started` or `totp.enrollment_denied` without secret material.

QR/provisioning URI rules:

- The API owns issuer, account label, algorithm, digits, period, and policy-version values used to construct provisioning material.
- If the API returns an otpauth URI or QR payload, it is allowed only in the enrollment-start response and only for the pending enrollment.
- Clients may render QR images from API-provided setup material, but must not log, persist, sync, or re-display it outside the setup flow.
- Future runtime may choose server-generated QR image bytes or client-rendered QR from a provisioning URI, but either path must preserve the same redaction and one-time-display rules.

Enrollment verification/activation requirements:

- Verify the submitted code against protected secret material, algorithm/digits/period metadata, allowed drift policy, replay-prevention state, pending enrollment status, challenge/session binding, and rate limits.
- Activate or enroll the factor only after successful verification.
- Mark the pending enrollment consumed or verified so replayed verification attempts fail closed.
- On success, return safe factor metadata and emit `totp.enrollment_verified`.
- On failure, leave the factor pending, expired, or blocked according to policy and emit `totp.enrollment_failed` where safe.

Cancel/restart behavior:

- A user may cancel a pending enrollment before verification.
- Starting a new enrollment may cancel, replace, or coexist with a prior pending enrollment only under explicit policy; future runtime should prefer at most one active pending TOTP enrollment per account unless there is a reviewed reason.
- Cancelled, expired, or superseded pending enrollments must not authenticate.
- Restart must generate new setup material and must not reuse old provisioning secrets.

Expiry and replay protection:

- Pending enrollment material must be short-lived, with expiry policy-controlled and conservative.
- Expired, consumed, cancelled, superseded, blocked, or account-mismatched enrollment IDs must fail closed.
- Replayed successful verification codes within the same time window should be rejected where the selected TOTP implementation and replay tracker support it.
- Cleanup/retention should preserve only safe metadata needed for audit and abuse investigation.

## TOTP Sign-In And Step-Up Challenge Lifecycle

TOTP challenges may be used during sign-in after primary authentication or as step-up for sensitive authenticated operations.

Challenge creation requirements:

- The API decides whether TOTP, passkey, recovery code, or another approved factor can satisfy the challenge.
- A challenge must have a purpose such as `sign_in` or `step_up`, an account binding where known, a session binding for step-up, a short expiry, one-time-use status, and a request/correlation ID.
- Challenge creation must not reveal whether an arbitrary identifier has an enrolled factor. Unknown, disabled, locked, or policy-denied accounts should receive anti-enumeration-safe responses at public sign-in boundaries.
- Challenge options may include safe factor choices, masked display labels, and allowed fallback categories only after the account is already safely bound to the pending auth flow or current session.

Challenge verification requirements:

- Verify the submitted TOTP code against active factor state, protected secret material, allowed drift, replay-prevention state, challenge status, purpose, account/session binding, rate limits, lockout state, account status, and policy.
- A consumed, expired, unknown, mismatched, blocked, or replayed challenge must fail closed.
- Successful verification marks only the bound sign-in flow, step-up challenge, or server-side session freshness state as satisfied.
- Failed verification increments safe attempt counters and may trigger rate limiting, temporary lockout, challenge blocking, or broader sign-in abuse controls.

Retry/rate-limit expectations:

- Challenge creation and verification must be rate-limited by safe account/session/challenge/network/device dimensions according to the reviewed sign-in abuse policy.
- Retry counts must be bounded and persisted only as safe metadata.
- Error responses should avoid distinguishing "no factor enrolled", "wrong code", "wrong account", and "unknown challenge" in public or enumeration-sensitive contexts.
- Lockout, cooldown, and retry-exhausted states must be auditable without storing submitted codes.

Session/step-up linkage boundaries:

- Clients may request a step-up challenge for a planned sensitive operation, but the API decides whether the operation requires step-up and whether the completed challenge satisfies it.
- Step-up freshness must be server-side state and scoped by operation category, factor type, policy version, session, and expiry where future session design approves it.
- MFA success must not silently extend refresh credential lifetime or bypass session revocation policy.
- If account policy changes, a factor is revoked, or suspicious activity is detected, future runtime may require fresh step-up or revoke sessions according to reviewed policy.

## TOTP Factor Management

Factor listing, label updates, and revocation are account-owned management operations.

Listing:

- `GET /api/v1/auth/mfa/factors` returns only the current user's safe factor metadata unless a future admin/support policy explicitly authorizes a tightly audited alternate actor.
- Safe metadata may include factor ID, factor type, display label, status, created, verified, last-used, disabled, revoked, and policy-compliance categories.
- Listing must not include TOTP secrets, provisioning URIs, QR payloads, recovery codes, challenge material, stored verifiers, audit internals, or unrelated account data.

Label updates:

- Display label updates are bounded metadata changes only.
- The API should trim and validate labels, preserve audit history, and avoid making labels authoritative for device identity or authorization.
- Label changes must not alter TOTP secret material, account ownership, factor status, policy state, or challenge state.

Disable/revoke:

- Disabling or revoking a factor requires an authenticated current session and fresh step-up where policy requires it.
- The API must deny or route through recovery/admin policy if removing a factor would violate required-factor, owner/admin, recovery-code, or anti-lockout policy.
- Revocation should preserve safe security history by default, prevent future authentication, emit audit, and may trigger session review or revocation.
- Admin-initiated factor resets are outside this current-user contract and must follow [AUTH_MFA_PASSKEY_POLICY_AUDIT.md](AUTH_MFA_PASSKEY_POLICY_AUDIT.md).

Recovery flow boundary:

- Recovery codes may satisfy a bound MFA challenge when policy allows and only by consuming one valid unused code.
- Recovery use should not silently create, re-enable, or rotate TOTP factors.
- After recovery-code use, future runtime should warn or require regeneration when remaining codes fall below policy thresholds.

Policy interaction:

- If TOTP is disabled by policy, enrollment start and TOTP challenge creation should fail with a policy-denied problem response. Existing factors should not be silently deleted.
- If TOTP is optional, eligible accounts may enroll and use it, but policy decides whether it satisfies sign-in or step-up.
- If TOTP or MFA is required for owners/admins or all users, the API must expose safe compliance/readiness state in future contract work without letting clients enforce requirements themselves.
- Role changes, policy changes, factor revocation, and recovery-code depletion may require enrollment guidance, step-up, session review, or session revocation in later runtime design.

## Recovery-Code Lifecycle

Recovery codes are fallback one-time verifiers for accounts already enrolled in approved MFA where policy allows them.

Generation/regeneration requirements:

- Generation and regeneration require an authenticated current session and fresh authentication or step-up where policy requires it.
- The API generates random codes with cryptographically secure randomness inside the auth boundary.
- Raw codes are returned only in the immediate generation/regeneration response.
- The response must clearly indicate that raw codes are display-once and cannot be retrieved later.
- Regeneration replaces or revokes prior unused codes according to explicit policy and emits safe audit.
- A generation response should include safe batch metadata plus raw codes; metadata-only reads must never include raw codes.

Storage boundary:

- Persist only salted hashes, verifiers, or equivalent one-time verifier material after display.
- Store batch metadata separately from individual verifier rows where useful.
- Store status, generated, displayed, used, revoked, replaced, and updated timestamps as safe metadata.
- Do not store raw codes, reversible encrypted raw codes, code prefixes useful for guessing, or submitted recovery-code values.

One-time use:

- Recovery-code verification must compare the submitted value inside the auth boundary, consume exactly one matching unused verifier, and make reuse impossible.
- A used, revoked, replaced, expired, unknown, or mismatched code must fail closed.
- Successful use may satisfy only the bound MFA challenge or recovery flow; it must not bypass account-disabled, session-revoked, policy-denied, or abuse-lockout states.
- Recovery-code use should update remaining count metadata and emit safe audit such as `recovery_codes.used`.

Safe API responses:

- Metadata reads may return remaining unused count, total generated count, used count, batch status, generated timestamp, last used timestamp where safe, and policy reminders.
- API responses must never leak stored verifier material, salts, hashes, raw codes, or enough metadata to reconstruct code format beyond user-facing display guidance.
- Failed verification responses must not reveal whether a submitted code was valid for another account, already used, or close to a valid code.

## Audit Requirements

Future implementation must emit bounded auth audit events from API/domain auth services. Event names are examples; equivalent names are acceptable if category, outcome, and redaction rules are preserved.

| Category | Example actions | Safe metadata |
| --- | --- | --- |
| TOTP enrollment begin | `totp.enrollment_started`, `totp.enrollment_denied` | actor account ID, subject account ID, pending enrollment ID, policy version, outcome, reason category, request/correlation ID |
| TOTP enrollment complete | `totp.enrollment_verified`, `totp.enrollment_failed` | actor account ID, subject account ID, factor ID where safely resolved, outcome, failure category, request/correlation ID |
| MFA challenge | `mfa.challenge_created`, `mfa.challenge_succeeded`, `mfa.challenge_failed`, `mfa.challenge_denied` | subject account ID where safe, challenge ID, factor type, purpose, outcome, failure category, policy version, request/correlation ID |
| TOTP factor metadata | `totp.renamed` | actor account ID, subject account ID, factor ID, request/correlation ID |
| TOTP revocation | `totp.revoked`, `totp.revocation_denied` | actor account ID, subject account ID, factor ID, reason category, policy version, request/correlation ID |
| Recovery-code generation | `recovery_codes.generated`, `recovery_codes.regenerated`, `recovery_codes.revoked` | actor account ID, subject account ID, batch ID, count category, policy version, outcome, reason category, request/correlation ID |
| Recovery-code use | `recovery_codes.used`, `recovery_codes.use_failed`, `recovery_codes.reuse_rejected` | subject account ID where safe, challenge ID, batch ID where safely resolved, remaining-count category, outcome, failure category, request/correlation ID |
| Step-up | `step_up.required`, `step_up.satisfied`, `step_up.failed` | actor account ID, operation category, challenge ID, freshness category, policy version, outcome, request/correlation ID |
| Policy denied | `totp.policy_denied`, `recovery_codes.policy_denied`, `mfa.challenge_denied` | subject account ID where safe, policy mode category, factor type, operation category, outcome, request/correlation ID |

Audit metadata must not contain raw TOTP seeds, otpauth URIs, QR payloads, submitted OTPs, raw recovery codes, recovery-code hashes/verifiers/salts, raw challenges, session or refresh tokens, reset tokens, passwords, password hashes, passkey private material, provider payloads, full request/response bodies, full IP/user-agent history, storage paths, or unrelated business data.

## Authorization Requirements

- Current-user TOTP enrollment and factor management endpoints require an authenticated current session.
- Enrollment start and verification must bind the pending enrollment to the same account and, where policy requires, the same session.
- Factor list, rename, disable, and revoke operations are limited to the current account unless a future admin/support policy explicitly allows tightly audited support actions.
- Sign-in MFA challenge verification may operate on a pending auth flow after primary authentication but before final session issuance.
- Step-up challenge creation and verification require an authenticated current session and must bind the challenge to that session/account.
- Recovery-code generation, regeneration, and revocation require an authenticated current session and fresh authentication or step-up where policy requires it.
- Admin policy endpoints and admin reset operations are not part of this document. Policy and audit coverage is defined in [AUTH_MFA_PASSKEY_POLICY_AUDIT.md](AUTH_MFA_PASSKEY_POLICY_AUDIT.md).
- Possessing a factor ID, challenge ID, enrollment ID, recovery-code batch ID, or generated client method is not authorization.

## Problem Response Expectations

Future OpenAPI implementation should use `application/problem+json` with stable categories and no secret-bearing details.

Expected categories include:

- Invalid or unsupported request shape.
- Authentication required.
- Session expired, revoked, disabled, or not fresh enough.
- Policy denied or factor disabled.
- Enrollment unavailable, already in progress, expired, cancelled, superseded, blocked, or not owned by the actor.
- Enrollment verification failed.
- Challenge expired, consumed, unknown, mismatched, blocked, or replayed.
- TOTP code verification failed.
- Factor not found, not owned by the actor, disabled, revoked, or not eligible.
- Recovery-code batch missing, revoked, replaced, depleted, disabled, or not eligible.
- Recovery-code verification failed.
- Account disabled, locked, or not eligible.
- Rate limited, temporarily locked, or retry limit exceeded.
- Operation would violate required-factor, recovery-code, owner/admin, or anti-lockout policy.

Problem details should include safe machine-readable codes, correlation IDs where available, and user-display-safe titles. They must not include raw TOTP seeds, otpauth URIs, QR payloads, submitted codes, recovery codes, verifier material, session tokens, full identifiers, IP/user-agent history, or policy internals that would aid account enumeration.

## Retention And Privacy

- Pending TOTP enrollment records and MFA challenges must be short-lived and cleaned up or compacted according to retention policy.
- Expired, cancelled, consumed, blocked, and replay-suspected challenge metadata should retain only safe fields needed for audit, rate limiting, and security investigation.
- Recovery-code batch and code metadata should retain generated, used, revoked, and replaced state long enough for account security review and audit, without retaining raw code material.
- Session/device metadata linked to MFA events should be minimized, normalized, and bounded.
- IP/network and user-agent metadata should be coarse or truncated where practical and retained only according to reviewed auth audit policy.
- User-visible factor labels are user-supplied metadata and must be bounded, sanitized, and treated as display labels only.

## OpenAPI Implementation Boundary

This task may define route drafts and schema names in documentation only. It does not edit `packages/contracts/openapi/settleora.v1.yaml`.

Future canonical OpenAPI work must:

- Explicitly scope OpenAPI paths and schemas.
- Preserve API/domain authority for enrollment, challenge verification, factor writes, recovery-code writes, sessions, step-up decisions, authorization, and audit.
- Keep setup and recovery-code examples sanitized and secret-free.
- Use stable status/value names where approved by the future contract task.
- Avoid response examples containing plausible TOTP seeds, OTPs, recovery codes, session tokens, or provider payloads.
- Run OpenAPI validation, client generation, and generated-client validation.
- Review generated web and Dart diffs instead of hand-editing generated clients.

If canonical OpenAPI changes are required before this design can be accepted, the task should stop and report a blocker instead of mixing contract implementation into this docs/control branch.

## Generated-Client Boundary

Generated clients are out of scope for this task.

- Do not run client generation for this branch.
- Do not edit `packages/client-web/src/generated/`.
- Do not edit `packages/client-dart/lib/generated/`.
- Future generated clients expose typed transport calls only. They must not embed TOTP verification authority, recovery-code verification authority, authorization decisions, policy enforcement, or audit truth.

## Non-goals

This document does not implement or authorize:

- Runtime TOTP enrollment, verification, challenge, recovery-code, or factor-management flows.
- Login, current-user, token issuance, refresh, session middleware, auth middleware, or step-up runtime changes.
- TOTP library/provider integration.
- QR generation runtime.
- Recovery-code generation runtime.
- Database migrations, EF models, schema files, or approved table names.
- Canonical OpenAPI paths or schemas.
- Generated clients.
- Mobile, user web, admin web, Figma UI, or reference design work.
- Admin MFA/passkey policy endpoints or admin reset operations.
- Secrets, config, environment, Docker, CI, deployment, or appsettings changes.
- Public/admin exposure changes.
- Storage, money, settlement, payment, bill calculation, OCR, sync, notification, or worker runtime behavior.
- SMS MFA or email OTP as a Day 1 default.

## Future Implementation Candidates

Good next slices are:

- Canonical OpenAPI TOTP/recovery-code contract implementation after manual auth/security and OpenAPI/generated-client gates are explicit.
- TOTP factor, protected-secret, MFA challenge, recovery-code batch/code schema and migration implementation after separate schema and secret-storage review.
- Runtime TOTP library selection and service implementation behind API/domain auth boundaries.
- Recovery-code generation and verifier service implementation with display-once semantics.
- Session step-up freshness model and sensitive operation integration.
- Mobile/user web TOTP enrollment, challenge, recovery-code, and factor-management UI after #417 reference gates.
- Admin policy endpoint and audit viewer work only after policy/admin exposure gates.
