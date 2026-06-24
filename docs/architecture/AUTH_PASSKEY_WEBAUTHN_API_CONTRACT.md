# Auth Passkey WebAuthn API Contract

This document defines the design-only API contract direction for passkey/WebAuthn enrollment, authentication challenge and verification, step-up compatibility, credential listing, display metadata updates, revocation, audit hooks, error expectations, and future OpenAPI boundaries for GitHub issue #414.

It builds on [AUTH_MFA_PASSKEY_ARCHITECTURE.md](AUTH_MFA_PASSKEY_ARCHITECTURE.md) and [AUTH_MFA_PASSKEY_POLICY_AUDIT.md](AUTH_MFA_PASSKEY_POLICY_AUDIT.md). Those documents remain the guardrails for factor state, challenge storage, policy hooks, audit redaction, sensitive data handling, and sequencing.

This is documentation and control architecture only. It does not implement runtime behavior, approve migrations, change canonical OpenAPI, regenerate clients, add UI, create secrets, change auth/session middleware, or change deployed security behavior.

## Current State

Settleora currently has auth account, local password credential, session, refresh/session-family, role, admin local-user foundation, and bounded auth audit foundations. The repository does not have passkey credential tables, WebAuthn challenge storage, passkey policy runtime, passkey endpoints, OpenAPI passkey paths or schemas, generated passkey clients, passkey UI, or session step-up runtime.

Existing auth/session endpoints cover first-owner bootstrap, local sign-in, refresh, current-user, current-session sign-out, current-account sign-out-all, session list, and per-session revocation. This document does not authorize changing those endpoints. Future canonical API work must update `packages/contracts/openapi/settleora.v1.yaml` in a separately scoped OpenAPI task, regenerate clients, and pass generated-client validation.

## API Authority Model

Passkey/WebAuthn authority belongs to API/domain auth services.

- API/auth services own challenge creation, challenge persistence, challenge verification, credential writes, credential status transitions, session issuance, step-up satisfaction decisions, revocation, and auth audit.
- Clients may call WebAuthn browser or platform APIs, render user prompts, and return authenticator responses, but clients never decide whether a credential is valid, whether MFA is satisfied, whether a session is fresh enough, or whether an operation is authorized.
- Clients must not infer authorization from hidden UI, cached credential lists, local factor flags, route availability, or generated-client availability.
- Workers must not mutate passkey, challenge, session, security-policy, or auth audit state.
- OpenAPI and generated clients are transport boundaries after future reviewed contract implementation; they do not grant permission.

## Endpoint Design Draft

Route names below are draft documentation vocabulary. They are not canonical OpenAPI paths until a future contract task explicitly updates the OpenAPI source of truth.

| Draft endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/passkeys/enrollment/options` | Authenticated current session, freshness as policy requires | Begin passkey enrollment for the current account and return bounded public-key credential creation options. |
| `POST /api/v1/auth/passkeys/enrollment/complete` | Authenticated current session, same account as challenge | Complete passkey enrollment by validating the authenticator attestation/client response and creating or enabling one credential only after server verification. |
| `GET /api/v1/auth/passkeys` | Authenticated current session | List safe display metadata for the current user's active and possibly recently revoked credentials according to retention policy. |
| `PATCH /api/v1/auth/passkeys/{passkeyCredentialId}` | Authenticated current session, fresh step-up where policy requires | Update allowed display metadata, such as a user-visible label. |
| `DELETE /api/v1/auth/passkeys/{passkeyCredentialId}` | Authenticated current session, fresh step-up where policy requires | Revoke a current user's credential without exposing credential material. |
| `POST /api/v1/auth/passkeys/sign-in/options` | Anonymous or partially identified auth flow | Begin passkey sign-in/authentication challenge. The response may support discoverable credentials or account-scoped credentials only when future policy allows it. |
| `POST /api/v1/auth/passkeys/sign-in/complete` | Anonymous or pending auth flow | Complete passkey sign-in by validating the assertion, account binding, credential status, origin/RP ID, replay metadata, and policy before issuing or continuing server-authoritative session state. |
| `POST /api/v1/auth/step-up/passkeys/options` | Authenticated current session | Begin a passkey step-up challenge for a sensitive operation category where future policy requires fresh assurance. |
| `POST /api/v1/auth/step-up/passkeys/complete` | Authenticated current session, same account/session/challenge | Complete step-up by validating the assertion and marking only server-side session or challenge state as fresh enough for the scoped operation. |

Endpoint implementation should keep enrollment, sign-in, and step-up ceremonies distinct even if they share internal challenge services. Each operation needs a purpose, account/session binding, expiry, replay protection, and audit category.

## Request And Response Shape Guidance

Future OpenAPI schemas should use explicit Settleora wrapper schemas around WebAuthn payloads rather than exposing unbounded request bodies.

Candidate schema names:

- `PasskeyEnrollmentOptionsRequest`
- `PasskeyEnrollmentOptionsResponse`
- `PasskeyEnrollmentCompleteRequest`
- `PasskeyCredentialSummary`
- `PasskeyCredentialListResponse`
- `PasskeyCredentialUpdateRequest`
- `PasskeyCredentialResponse`
- `PasskeySignInOptionsRequest`
- `PasskeySignInOptionsResponse`
- `PasskeySignInCompleteRequest`
- `PasskeySignInCompleteResponse`
- `PasskeyStepUpOptionsRequest`
- `PasskeyStepUpOptionsResponse`
- `PasskeyStepUpCompleteRequest`
- `PasskeyStepUpCompleteResponse`

WebAuthn public-key credential creation and request options may be represented as opaque bounded JSON payloads where the selected server WebAuthn library owns the exact protocol structure. Opaque does not mean unvalidated: the API must bound size, expected object shape, allowed top-level fields, challenge linkage, RP ID, origin policy, timeout, and extensions policy before returning or accepting payloads.

Responses may include:

- Stable server-side `passkeyCredentialId` values that are not raw WebAuthn private material.
- User-visible display label and optional safe authenticator display hints.
- Credential status category such as `pending`, `enrolled`, `disabled`, or `revoked` where returned by policy.
- Created, enrolled, last-used, updated, and revoked timestamps where safe.
- Safe transport or backup eligibility/state categories only when retained and reviewed.
- Challenge ID or ceremony ID only as an opaque server identifier with strict expiry and account/session binding.
- Session result fields only after server-side verification succeeds.

Responses must not include:

- Passkey private keys or private-key-derived material.
- Raw session or refresh tokens except in existing or future reviewed token issuance responses.
- Raw challenge secrets beyond the WebAuthn client protocol payload required to complete a ceremony.
- Reusable challenge material.
- Full attestation objects or authenticator payloads unless a future retention policy explicitly requires bounded storage or echoing.
- Raw device fingerprints.
- Full user-agent or IP history.
- Provider payloads, request bodies, logs, or audit metadata containing secrets.

## Challenge Lifecycle

Passkey challenge records are security state, not client convenience state.

Required properties:

- Short-lived expiry, with the exact duration policy-controlled and conservative.
- One-time use. A consumed challenge must not be accepted again.
- Replay rejection for already consumed, expired, blocked, mismatched, or unknown challenges.
- Account binding for enrollment, account-scoped assertion, and step-up challenges.
- Session binding for authenticated enrollment and step-up where a current session exists.
- Purpose binding, such as `passkey_enrollment`, `passkey_sign_in`, or `passkey_step_up`.
- Origin and RP ID policy binding, validated by the API/WebAuthn library on completion.
- Correlation/request ID linkage for audit without storing raw request or response bodies.
- Attempt count and safe failure category where rate limiting, lockout, or suspicious activity policy needs it.
- Cleanup or retention policy for expired, consumed, failed, and replay-suspected challenges.

Challenge persistence should store only the verifier or data required by the selected WebAuthn implementation. If challenge material must be persisted, prefer a hash/verifier form where practical. Raw reusable challenge secrets must not appear in logs, metrics, traces, audit metadata, generated examples, reports, or long-lived rows.

## Credential Lifecycle

Passkey credentials should be auth-owned records linked to `auth_accounts`, not `user_profiles`.

Lifecycle expectations:

- `pending`: enrollment has started, but the authenticator response has not been validated. Pending credentials are not authentication authority.
- `enrolled`: credential was validated, is active, and may authenticate according to policy.
- `disabled`: credential is preserved but must not authenticate. Re-enable behavior requires separate policy review.
- `revoked`: credential must not authenticate and retains safe revocation metadata according to retention policy.

Enrollment completion must validate challenge, origin/RP ID, account binding, credential uniqueness, attestation policy, public key material, and replay metadata before writing an active credential.

Credential listing returns only the current user's own safe metadata unless a future tightly audited admin/support policy explicitly authorizes a different actor. Listing should include stable server-side credential IDs, labels, created/enrolled timestamps, last-used timestamps where safe, and status categories where useful. It should not expose raw credential IDs unnecessarily if a stable server ID is available.

Display label updates must be bounded metadata changes only. The API should trim and validate labels, preserve audit history, and avoid making labels authoritative for device identity or authorization. Label changes must not alter WebAuthn credential material, account ownership, status, or policy state.

Revocation should mark the credential revoked instead of hard-deleting security history by default. Revocation must prevent future authentication, emit audit, and may trigger session review or revocation where policy requires. Deleting the last compliant factor must be denied or routed through recovery/admin policy when passkey or MFA policy would otherwise lock out the account.

Successful authentication should update safe `last_used` and replay metadata. Suspicious counter regression, cloned credential indicators, or mismatched factor/account state should be blocked or escalated according to policy and audited without raw assertion payloads.

Disabled accounts must not begin or complete enrollment, sign-in, or step-up. If an account is disabled between begin and complete, completion must fail closed and audit the policy/account-state denial where safe.

## Policy Interaction

Passkey contract behavior must read from server-side policy.

- If passkeys are disabled, enrollment begin, sign-in begin, and step-up begin should fail with a policy-denied problem response. Existing credentials should not be silently deleted.
- If passkeys are optional, eligible accounts may enroll and use them, but policy decides whether a passkey satisfies sign-in or step-up.
- If owners/admins are required or strongly guided to enroll, the API must expose policy-compliance readouts in future contract work without letting clients enforce the requirement themselves.
- If all users are required to enroll, the API must provide a safe pending-enrollment path and avoid accidental lockout without reviewed recovery behavior.
- Step-up requirements are server-authoritative. Clients may request a step-up challenge, but only the API decides whether a sensitive operation requires fresh passkey assurance and whether the challenge satisfies that requirement.
- Recovery fallback must not silently bypass passkey or MFA policy. Recovery-code, admin reset, or alternative-factor flows belong to adjacent #415/#416 policies and must emit bounded audit.
- Role changes that make an account subject to stricter passkey/MFA requirements may require enrollment guidance, step-up, session review, or session revocation in later runtime design.

## Audit Requirements

Future implementation must emit bounded auth audit events from API/domain auth services. Event names are examples; equivalent names are acceptable if category, outcome, and redaction rules are preserved.

| Category | Example actions | Safe metadata |
| --- | --- | --- |
| Enrollment begin | `passkey.enrollment_started`, `passkey.enrollment_denied` | actor account ID, subject account ID, challenge ID, policy version, outcome, reason category, request/correlation ID |
| Enrollment complete | `passkey.enrollment_completed`, `passkey.enrollment_failed` | subject account ID, passkey credential ID, challenge purpose, attestation policy result category, outcome, failure category, request/correlation ID |
| Authentication | `passkey.challenge_succeeded`, `passkey.challenge_failed`, `passkey.replay_suspected` | subject account ID where known, credential ID where safely resolved, challenge purpose, failure/replay category, policy version, request/correlation ID |
| Step-up | `step_up.required`, `step_up.satisfied`, `step_up.failed` | actor account ID, operation category, challenge ID, freshness category, policy version, outcome, request/correlation ID |
| Credential metadata | `passkey.renamed` | actor account ID, subject account ID, credential ID, reason/category if supplied, request/correlation ID |
| Revocation | `passkey.revoked`, `passkey.revocation_denied` | actor account ID, subject account ID, credential ID, reason category, policy version, request/correlation ID |
| Policy denied | `passkey.policy_denied`, `mfa.challenge_denied` | subject account ID where safe, policy mode category, factor type, operation category, outcome, request/correlation ID |

Audit metadata must not contain raw challenges, raw authenticator responses, attestation objects, passkey private material, raw session or refresh tokens, passwords, TOTP secrets, recovery codes, provider payloads, full request/response bodies, full IP/user-agent history, storage paths, or unrelated business data.

## Authorization Requirements

- Current-user passkey management endpoints require an authenticated session.
- Enrollment begin and complete require an authenticated current session and must bind the ceremony to the same account.
- Credential list, rename, and revoke operations are limited to the current account unless a future admin/support policy explicitly allows tightly audited support actions.
- Sign-in begin and complete are the only passkey endpoints in this design that may be reachable without an existing authenticated session.
- Step-up begin and complete require an authenticated current session and must bind the challenge to that session/account.
- Admin policy endpoints are not part of this document. Policy and audit coverage is defined in [AUTH_MFA_PASSKEY_POLICY_AUDIT.md](AUTH_MFA_PASSKEY_POLICY_AUDIT.md).
- Possessing a passkey credential ID, challenge ID, or generated client method is not authorization.

## Problem Response Expectations

Future OpenAPI implementation should use `application/problem+json` with stable categories and no secret-bearing details.

Expected categories include:

- Invalid or unsupported request shape.
- Authentication required.
- Session expired, revoked, disabled, or not fresh enough.
- Policy denied or factor disabled.
- Enrollment unavailable or already in progress.
- Challenge expired, consumed, unknown, mismatched, or replayed.
- Origin/RP ID validation failed.
- Credential already enrolled, not found, not owned by the actor, disabled, or revoked.
- Credential verification failed.
- Account disabled or not eligible.
- Rate limited or temporarily locked.
- Operation would violate required-factor or recovery policy.

Problem details should include safe machine-readable codes, correlation IDs where available, and user-display-safe titles. They must not include raw challenge values, authenticator responses, credential public key payloads, session tokens, full identifiers, IP/user-agent history, or policy internals that would aid account enumeration.

## OpenAPI Implementation Boundary

This task may define route drafts and schema names in documentation only. It does not edit `packages/contracts/openapi/settleora.v1.yaml`.

Future canonical OpenAPI work must:

- Explicitly scope OpenAPI paths and schemas.
- Preserve API/domain authority for challenge verification, credential writes, sessions, step-up decisions, authorization, and audit.
- Use bounded schemas for opaque WebAuthn JSON payloads.
- Keep examples secret-free and avoid raw challenge/session/token material.
- Run OpenAPI validation, client generation, and generated-client validation.
- Review generated web and Dart diffs instead of hand-editing generated clients.

If canonical OpenAPI changes are required before this design can be accepted, the task should stop and report a blocker instead of mixing contract implementation into this docs/control branch.

## Generated-Client Boundary

Generated clients are out of scope for this task.

- Do not run client generation for this branch.
- Do not edit `packages/client-web/src/generated/`.
- Do not edit `packages/client-dart/generated/` or Dart generated-client output.
- Future generated clients expose typed transport calls only. They must not embed passkey validation authority, authorization decisions, policy enforcement, or audit truth.

## Non-goals

This document does not implement or authorize:

- Runtime passkey/WebAuthn flows.
- Login, current-user, token issuance, refresh, session middleware, or auth middleware changes.
- Database migrations, EF models, schema files, or approved table names.
- Canonical OpenAPI paths or schemas.
- Generated clients.
- Mobile, user web, admin web, or Figma UI.
- Admin MFA/passkey policy endpoints.
- TOTP MFA or recovery-code contracts, which belong to #415.
- Secrets, config, environment, Docker, CI, deployment, or appsettings changes.
- Public/admin exposure changes.
- Storage, money, settlement, payment, bill calculation, OCR, sync, or notification runtime behavior.

## Future Implementation Candidates

Good next slices are:

- Canonical OpenAPI passkey contract implementation after manual auth/security and OpenAPI/generated-client gates are explicit.
- Passkey/challenge schema and migration implementation after separate schema review.
- Runtime WebAuthn library selection and service implementation behind API/domain auth boundaries.
- Session step-up freshness model and sensitive operation integration.
- Mobile/user web passkey enrollment and challenge UI after #417 reference gates.
- Admin policy endpoint and audit viewer work only after policy/admin exposure gates.
