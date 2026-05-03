# Auth Refresh Token Rotation Policy

This document defines Settleora's policy for refresh-like credentials and session continuity. It exists so internal refresh-token generation, rotation, replay detection, session-family revocation, and future public refresh endpoint work stay aligned with reviewed security behavior.

The current repository now includes the reviewed persistence foundation for session families and refresh credential history described here, plus an internal refresh session runtime service foundation. This document still does not authorize public refresh endpoint implementation, OpenAPI changes, generated clients, middleware, authorization handlers, package changes, Docker behavior changes, or UI behavior.

## Purpose

Refresh-like credentials extend a user's signed-in session without making ordinary request credentials long-lived. They are security credentials, not client convenience state.

This policy covers:

- The terminology for access-session credentials, refresh-like credentials, and session families.
- The recommended Day 1 model for server-mode Settleora auth.
- Storage rules for raw credentials, hashes, identifiers, and metadata.
- Rotation, replay detection, expiry, revocation, audit, API response, authorization handoff, privacy, retention, and operational boundaries.
- Future implementation candidates after design approval.

## Current State

The repository currently includes:

- Local sign-in.
- Current-user lookup.
- Current-session sign-out.
- Current-account sign-out-all.
- Current-account session list.
- Current-account per-session revocation.
- Internal password hashing, credential workflow, local sign-in, sign-in abuse policy, and session runtime boundaries.
- Internal refresh session runtime boundary for creating refresh-capable session families and rotating refresh-like credentials.
- Schema foundations for `auth_accounts`, `auth_identities`, `local_password_credentials`, `auth_sessions`, `auth_session_families`, `auth_refresh_credentials`, and `auth_audit_events`.

The current session runtime creates opaque server-side session tokens with cryptographic randomness, stores token hashes only in `auth_sessions`, returns raw session token material only once on creation, validates submitted bearer credentials through hash lookup, updates safe session metadata, and writes bounded session audit events.

The current `auth_sessions` schema supports:

- `session_token_hash`, required and unique.
- `refresh_token_hash`, nullable and unique when present.
- `status`, currently `active`, `revoked`, or `expired`.
- `issued_at_utc`, `expires_at_utc`, `last_seen_at_utc`, `revoked_at_utc`, and `revocation_reason`.
- Bounded optional metadata fields such as `device_label`, `user_agent_summary`, and `network_address_hash`.

The current refresh/session-family schema foundation supports:

- `auth_session_families` linked to `auth_accounts`, with bounded family status, absolute expiry, rotation timestamp, revocation timestamp, and safe revocation reason state.
- `auth_refresh_credentials` linked to a session family, optionally linked to an `auth_sessions` row, with a required unique `refresh_token_hash`, bounded status, issued/idle-expiry/absolute-expiry timestamps, consumed and revoked timestamps, optional replacement self-reference, and safe revocation reason state.
- Restrictive foreign keys, useful lookup/expiry/status indexes, bounded status check constraints, non-blank hash/reason constraints, and no raw refresh-token storage.

The internal refresh session runtime can create a refresh-capable access session, session family, and initial refresh-like credential for an existing active auth account. It can rotate a submitted raw refresh-like credential, consume the old credential, create a replacement access session and refresh-like credential in the same family, classify expired/revoked/rotated/replayed/inactive/account-unavailable/persistence failures through internal statuses, and conservatively mark or revoke linked families and active family credentials/sessions when replay, expiry, or account-unavailable conditions require it. The service stores only deterministic credential hashes and writes bounded safe audit metadata.

No public refresh endpoint, OpenAPI refresh path/schema, generated auth client support, middleware, authorization handler, or UI flow exists yet.

## Terminology

Use precise terms in future code, docs, and API review:

- Access-session credential: the short-lived raw opaque bearer credential used for ordinary API request authentication. The current implementation returns an opaque session token and stores only `auth_sessions.session_token_hash`.
- Access session: the server-side `auth_sessions` row and associated account/session metadata used to validate an access-session credential.
- Refresh-like credential: a longer-lived, one-time-use raw credential used only to continue a session by minting or rotating access-session state. It must not authorize business API calls directly.
- Refresh credential hash or identifier: the deterministic server-side lookup value derived from a raw refresh-like credential. Raw refresh-like credentials must never be stored.
- Session family: the logical continuity lineage that starts at sign-in and includes the current access session plus every refresh-like credential issued from that sign-in. Revoking a family makes every active access-session and refresh-like credential in that lineage unusable.
- Rotation: replacing a valid refresh-like credential with a new one after successful use, making the old credential unusable.
- Replay: reuse of a refresh-like credential that has already been rotated, revoked, expired, or otherwise made invalid.

## Day 1 Direction

Day 1 should use opaque access-session credentials plus refresh-like credentials, not long-lived access sessions and not self-contained JWT-style access tokens by default.

Reasons:

- The existing runtime already uses opaque server-side session credentials and token hashes.
- Opaque credentials keep revocation, expiry, account disablement, session visibility, and audit decisions server-authoritative.
- Self-hosted deployments avoid early signing-key, JWT invalidation, and key-rotation complexity.
- Per-session revocation, sign-out-all, and future replay response can be enforced with PostgreSQL state rather than client-only claims.
- A short access-session credential limits exposure if an ordinary bearer credential leaks.
- A refresh-like credential provides continuity without requiring the access-session credential itself to be long-lived.

The future refresh endpoint should therefore authenticate the submitted refresh-like credential through the auth runtime boundary, rotate it on success, and return a new raw access-session credential and new raw refresh-like credential only once.

If a future review chooses cookies, JWTs, proof-of-possession tokens, device-bound credentials, or external identity-provider refresh tokens, that choice must be reviewed separately and must still preserve the storage, revocation, replay, audit, and privacy rules in this document.

## Storage Rules

Raw access-session credentials and raw refresh-like credentials must never be stored in PostgreSQL, logs, metrics, traces, validation output, audit metadata, OpenAPI examples, generated clients, appsettings files, or frontend state beyond the client-side credential holder.

Persist only values needed for lookup, revocation, expiry, rotation, replay detection, user security review, and audit:

- Store deterministic, purpose-bound hashes or identifiers for server-side lookup.
- Prefer a keyed digest or equivalent secret-bound construction when future secret-provider boundaries are approved.
- Separate access-session credential lookup values from refresh-like credential lookup values by purpose and context.
- Store token hashes or identifiers only where lookup, revocation, rotation, or replay detection requires them.
- Never expose token hashes through API responses, generated clients, session-list responses, audit metadata, logs, metrics, traces, or validation output.
- Keep device, client, user-agent, and network metadata bounded and normalized.
- Do not store provider payloads, raw OIDC tokens, raw bearer tokens, signing keys, password material, verifier strings, reset tokens, recovery codes, MFA secrets, passkey private material, or unnecessary PII.

The legacy `auth_sessions` schema can store one current `refresh_token_hash` per session row and is intentionally left in place as transitional state. The reviewed `auth_session_families` and `auth_refresh_credentials` schema foundation now explicitly represents session-family lineage, consumed credential history, parent-child replacement links, refresh idle expiry, refresh absolute expiry, and replay-capable status markers. Future runtime work must use or deliberately migrate this foundation before claiming robust replay detection.

## Session Family Concepts

The persistence foundation now models these responsibilities so future runtime work does not have to overload the existing `auth_sessions` row:

- Auth account: owns sessions and remains the account status authority.
- Access session: stores the active access-session credential hash, status, expiry, revocation state, and user-visible metadata.
- Refresh-like credential: stores only a hash or identifier, status, issued time, expiry boundaries, rotation or use state, and safe revocation reason.
- Session family: groups refresh continuity state from one sign-in lineage so suspected replay can revoke the affected lineage.
- Audit event: records security-impactful outcomes with safe bounded metadata.

The legacy `auth_sessions.refresh_token_hash` field can remain unused or transitional until runtime work migrates behavior. Do not treat that single nullable field as the replay-detection model.

## Rotation Flow

Successful refresh must rotate refresh-like credentials.

Required behavior:

1. Accept only the raw refresh-like credential and minimal client/session metadata needed by policy.
2. Derive the server lookup hash or identifier without logging the raw credential.
3. Resolve the active refresh/session state inside the auth runtime boundary.
4. Reject missing, revoked, rotated, expired, inactive, disabled-account, deleted-account, disabled-credential, policy-invalid, or persistence-failed states through safe internal statuses.
5. Enforce idle timeout, absolute timeout, account status, credential status, session status, and family status before issuing replacement credentials.
6. Generate a new access-session credential and a new refresh-like credential with cryptographic randomness.
7. Store only the replacement hashes or identifiers.
8. Make the old refresh-like credential unusable before the success response is returned.
9. Update safe session/account metadata such as last refreshed, last seen, expiry, device label, user-agent summary, network hash, and updated timestamp only after policy allows it.
10. Emit a safe audit event for successful refresh and rotation.
11. Return the new raw credentials only once in the success response.

Rotation should be atomic from the server's point of view. If storage supports transactions or concurrency guards, the lookup, old-credential invalidation, new-credential persistence, metadata update, and audit write should be coordinated so two simultaneous refresh attempts cannot both succeed.

The old refresh-like credential must not remain usable after success, even if the client retries the request. Clients should treat refresh success as destructive rotation and store the returned replacement credential immediately.

## Replay Detection Flow

Reuse of an already rotated, revoked, expired, or otherwise invalid refresh-like credential is suspicious. Future implementation must decide whether the credential can be linked to a session family safely before choosing the public response.

Required behavior when a replay can be linked to a family:

1. Classify the attempt as suspected replay or suspected compromise through internal status only.
2. Revoke the affected session family when policy requires it.
3. Make every active access-session and refresh-like credential in that family unusable.
4. Emit a safe audit event for replay detection and family revocation.
5. Return the same public failure shape used for ordinary invalid refresh attempts.

Required behavior when the submitted credential cannot be linked:

- Return the same public failure shape used for ordinary invalid refresh attempts.
- Emit only safe operational or audit metadata if policy allows unknown-credential events.
- Do not reveal whether the credential was unknown, expired, revoked, rotated, malformed, belonged to another account, or matched a known family.

Replay detection must not leak token hashes, raw credentials, account existence, session existence, family IDs, credential age, expiry state, revocation state, or ownership hints to the caller.

## Expiry Policy

Access-session credentials should be short-lived. A secure baseline for the future refresh model is:

- Access-session lifetime: about 15 minutes by default, with a hard self-hosted configurable cap such as 30 minutes unless a separate policy approves longer.
- Refresh idle timeout: about 7 days by default. If the refresh-like credential is not used within the idle window, it expires even if the absolute lifetime has not elapsed.
- Refresh absolute lifetime: about 30 days by default. No rotation may extend the family beyond the absolute limit.
- Clock skew allowance: small and explicit, only where needed for distributed deployments.

Self-hosted deployments may make these values configurable, but the committed defaults should stay conservative. Longer "remember this device" behavior should be a separate policy choice with explicit UI, audit, and revocation semantics.

The API now exposes these lifetime values through typed configuration at `Settleora:Auth:Sessions`:

```text
Settleora:Auth:Sessions:CurrentAccessSessionDefaultLifetime=08:00:00
Settleora:Auth:Sessions:CurrentAccessSessionMaxLifetime=30.00:00:00
Settleora:Auth:Sessions:RefreshAccessSessionDefaultLifetime=00:15:00
Settleora:Auth:Sessions:RefreshAccessSessionMaxLifetime=00:30:00
Settleora:Auth:Sessions:RefreshIdleTimeout=7.00:00:00
Settleora:Auth:Sessions:RefreshAbsoluteLifetime=30.00:00:00
Settleora:Auth:Sessions:ClockSkewAllowance=00:02:00
```

The existing no-refresh sign-in/session runtime uses the current access-session default and max. The internal refresh session runtime uses the refresh-mode access-session lifetime, refresh idle timeout, refresh absolute lifetime, and clock-skew allowance for refresh-like credential creation and rotation. These configuration values still do not add public refresh endpoint behavior, OpenAPI paths, generated clients, middleware, or UI behavior.

Idle timeout and absolute timeout are different:

- Idle timeout limits how long an unused refresh-like credential remains valid after last successful refresh.
- Absolute timeout limits the maximum age of the session family from the original sign-in, regardless of use.

Refreshing should extend only the allowed idle window, never the absolute family lifetime. Ordinary access-session validation should not silently extend refresh absolute lifetime.

## Revocation Policy

Revocation must be server-authoritative and use bounded safe reason categories.

Current-session sign-out:

- Revokes only the currently validated access session.
- Must also make any refresh-like credential for that session unusable when refresh runtime exists.
- Should emit a safe sign-out or session-revoked audit event.

Current-account sign-out-all:

- Revokes all active sessions owned by the authenticated account.
- Must also make every active refresh-like credential for those sessions or families unusable.
- Should not return counts or session details to the caller.

Current-account per-session revocation:

- Revokes one active session owned by the authenticated account.
- Must also revoke that session's refresh-like credential or session family.
- Missing, not-owned, already revoked, expired, or inactive targets should keep the existing safe public behavior.

Credential rotation or password change:

- Password reset, password change, credential revocation, suspected credential compromise, and provider unlinking should revoke affected session families by default unless a future policy explicitly narrows the scope.
- Routine password rehash after successful verification does not automatically require session revocation unless policy, pepper compromise, or credential migration risk requires it.

Account disabled or deleted:

- All active access sessions and refresh-like credentials for the account must become unusable.
- Future validation and refresh flows must reject disabled or deleted accounts uniformly.

Suspected compromise or replay:

- The affected family should be revoked at minimum.
- Account-wide revocation may be required for high-confidence compromise, password or pepper compromise, provider compromise, admin action, or repeated replay patterns.

Future admin revocation:

- Admin revocation requires a separate reviewed endpoint and authorization design.
- Admin paths must preserve the same raw-token, hash, metadata, and audit boundaries.

## Audit Requirements

Refresh and session-continuity events are security-impactful and must be auditable through API/domain auth boundaries.

Recommended event categories include:

- `refresh.succeeded`
- `refresh.failed`
- `refresh.rotated`
- `refresh.replay_detected`
- `session_family.revoked`
- `session.revoked`
- `session.expired`
- `session.policy_denied`
- `credential_rotation.sessions_revoked`
- `account_disabled.sessions_revoked`
- `admin.sessions_revoked`

Event names above are policy categories, not approved enum values or implementation constants.

Allowed audit metadata should be bounded and safe:

- Workflow name.
- Status or reason category.
- Actor account ID when safely resolved.
- Subject account ID when safely resolved.
- Auth session ID or family ID when policy allows and the value is not a bearer secret.
- Correlation ID or request ID.
- Coarse client category, device label, user-agent summary, or network hash when policy allows.
- Expiry or revocation reason category.

Audit metadata must not include:

- Raw access-session credentials.
- Raw refresh-like credentials.
- Token hashes or token identifiers used for lookup.
- Passwords, password hashes, verifier strings, salts in sensitive contexts, pepper identifiers in sensitive contexts, or derived password material.
- Provider token payloads.
- Signing keys or secret-provider internals.
- Reset tokens, recovery codes, MFA secrets, passkey private material, or provider secrets.
- Full IP history, unbounded user-agent strings, request bodies, or unnecessary PII.

Audit writes should happen after internal state is classified and should not turn unavailable credentials into public account or session enumeration signals.

## Future API Response Guidance

A future refresh endpoint should use a uniform public failure response.

The response must not reveal whether:

- The account exists.
- The session exists.
- The refresh-like credential was missing, malformed, unknown, expired, revoked, rotated, replayed, not owned, policy-denied, or linked to a disabled or deleted account.
- The submitted credential belonged to a known family.
- The caller triggered family revocation.

On success, the endpoint may return only the minimal data needed by clients to continue:

- The new raw access-session credential.
- The new raw refresh-like credential.
- Access-session expiry.
- Refresh idle and absolute expiry if policy approves client visibility.
- Safe session ID or display metadata only if needed and already approved by the session API contract.

Raw credentials must be returned only once on success. Token hashes, refresh-token hashes, family lookup identifiers, credential status, audit metadata, provider payloads, account state details, storage paths, diagnostics, and policy internals must not be returned.

The endpoint should be reviewed separately before OpenAPI paths or schemas are added.

## Authorization And Middleware Handoff

Refresh-like credentials are not authorization for business APIs. They are only inputs to the refresh boundary.

Future middleware should authenticate ordinary API requests with the access-session credential or approved equivalent. The refresh endpoint may need to bypass ordinary access-session middleware because an access-session credential may be expired when refresh is attempted. It should authenticate only through the refresh runtime service and should produce new authenticated state only after successful rotation.

Authorization handoff rules:

- Endpoint handlers stay thin and map internal result categories to approved HTTP responses.
- API/domain auth services own refresh lookup, rotation, replay detection, family revocation, account status checks, credential status checks, audit writes, and safe metadata updates.
- Business authorization consumes validated actor context produced by the auth runtime boundary.
- Clients must not infer authorization from stored credentials, session-list rows, generated client methods, hidden UI controls, or cached profile data.
- Workers must not create, rotate, validate, or revoke access sessions, refresh-like credentials, or session families directly.

If cookies, browser storage, CSRF defenses, device-bound credentials, or proof-of-possession tokens are introduced later, those choices need separate endpoint and client-security review.

## Privacy And Retention

Session-family metadata must support security review without becoming an unnecessary tracking dataset.

Privacy boundaries:

- Keep device labels optional and bounded.
- Normalize and truncate user-agent summaries.
- Prefer network hashes, coarse network categories, or short-retention network metadata over raw long-lived IP history.
- Store session-family IDs only as internal security metadata, not as client-visible tracking identifiers unless a future API contract explicitly approves it.
- Do not store refresh credential history longer than needed for lookup, replay detection, family revocation, and audit policy.
- Separate user-visible session metadata retention from security audit retention.
- Purge or archive expired, revoked, and consumed refresh-like credential metadata according to bounded retention policy.

If consumed refresh-like credential hashes are retained for replay detection, retention should usually end after the session family's absolute expiry plus any approved short replay/audit window. Longer retention requires a privacy and security review.

## Operational Notes

Single-node self-hosted deployment:

- PostgreSQL should be the source of truth for refresh validity, rotation, replay detection, and revocation.
- In-memory state must not be the only place where refresh validity or revocation is enforced.
- Rotation should use database transactions, unique constraints, and concurrency guards so duplicate refresh attempts cannot both succeed.
- The existing single-node sign-in abuse policy can remain separate from refresh credential validity.
- Validation and logs must stay sanitized.

Future distributed deployment:

- Every API node must enforce the same refresh, revocation, and replay policy from shared authoritative state.
- Avoid per-node revocation caches as the source of truth.
- If caches are introduced, they must be invalidated safely and treated as performance optimizations only.
- Concurrency control must work across nodes.
- Clock skew policy must be explicit.
- Secret-provider-backed keyed hashes, key rotation, and hash-version migration need separate design if selected.

## Remaining Non-goals

This document does not authorize:

- Refresh endpoints.
- OpenAPI paths or schemas.
- Generated client updates.
- Session middleware.
- Authorization handlers.
- Additional EF migrations or schema changes beyond the reviewed session-family and refresh-credential foundation.
- Package changes.
- Docker or CI behavior changes.
- Mobile, web, or admin UI changes.
- JWT, cookie, proof-of-possession, external-provider refresh-token, or secret-provider implementation choices.
- Admin session-management endpoints.
- Password reset, recovery, MFA, passkey, or provider-token storage behavior.

## Next Implementation Candidates

Future branches should stay small and reviewable:

1. Add a public refresh endpoint and OpenAPI contract only after the internal service and response-shape policy are approved.
2. Add generated clients and UI integration only after the OpenAPI contract is reviewed.
3. Add distributed deployment hardening, keyed hash secret rotation, retention cleanup, and admin revocation only in separate reviewed slices.
