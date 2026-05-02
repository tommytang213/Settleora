# Auth Sign-In Abuse Policy

This document defines Settleora's local sign-in abuse policy before any public login, sign-in, or token issuance endpoint exists.

It is a design gate for future runtime branches. It does not authorize endpoint implementation, OpenAPI auth paths, generated clients, UI behavior, migrations, package changes, Docker changes, or runtime sign-in behavior by itself.

## Purpose

Future local-account sign-in must resist abuse without teaching callers whether an account, identity, credential, or policy state exists.

This policy defines the required boundaries for:

- Account enumeration resistance.
- Rate limiting and throttling.
- Temporary blocking and lockout behavior.
- Credential-stuffing defense.
- Safe auth audit categories.
- Uniform public error responses.
- Operational diagnostics that help administrators without leaking secrets or identity state.

Exact endpoint paths, request schemas, response schemas, and OpenAPI contracts remain future proposals until a separate reviewed OpenAPI/runtime branch approves them.

## Current State

- The auth identity, users, groups, credential, session, and auth audit schema foundations exist.
- The internal password hashing service exists for Argon2id password verifier creation and verification.
- The internal credential workflow service exists for EF-backed local password credential creation, password verification, safe credential audit writes, and rehash after successful verification.
- The internal session runtime service exists for opaque session creation, validation, revocation, token hashing, and bounded session audit writes.
- `GET /api/v1/auth/current-user` exists and validates an existing opaque session token into a minimal current actor/profile/session/role response.
- Public login, sign-in, registration, token issuance, refresh-token runtime, sign-out, and session list/revocation endpoints do not exist.
- Global auth middleware, authorization handlers, generated auth clients, and UI/mobile/web/admin auth flows do not exist.

## Threat Model

Settleora is self-hosted, often for small groups, but small deployments are still reachable software once exposed to a LAN, VPN, reverse proxy, or the public internet.

Future local sign-in must consider:

- Password guessing against one known account.
- Credential stuffing with leaked email, username, or password pairs from other services.
- Account enumeration through response bodies, status codes, timing, lockout messages, password-reset hints, or audit-visible UI state.
- Source or network based brute force from one IP, subnet, proxy, VPN endpoint, or repeated forwarded source.
- User identifier based brute force where an attacker rotates networks but targets one normalized identifier.
- Distributed attempts that spread low-volume failures across many source buckets.
- Denial-of-service from forcing expensive password verification, especially Argon2id work, before cheap policy checks run.
- Audit, log, trace, metric, or error-detail leakage that reveals submitted passwords, raw identifiers, account existence, credential status, or provider internals.
- Trusted-LAN false confidence: a local network, homelab, office Wi-Fi, or private VPN should not be treated as proof that sign-in abuse controls are unnecessary.

## Public Response Policy

Future local sign-in failures must use uniform public behavior for cases where exposing the distinction could help attackers.

These states must not reveal whether the account or credential exists:

- Wrong password.
- Missing account.
- Missing local identity.
- Missing local password credential.
- Disabled credential.
- Revoked credential.
- Disabled account.
- Deleted account.
- Locked, throttled, or temporarily blocked state.
- Policy-denied sign-in.
- Invalid request shape where it is safe to map the request to the generic sign-in failure.

The recommended public shape is:

- Use a generic `401` problem response for ordinary failed authentication.
- Use a generic `429` problem response when the request is throttled before or during sign-in policy enforcement.
- Do not include account existence, credential existence, lockout state, remaining attempts, exact retry counters, password policy internals, or source-bucket details in the public response.
- Keep the response body, status choice, and headers consistent enough that attackers cannot distinguish missing account, wrong password, disabled state, or policy denial by probing.
- Consider `Retry-After` only when future policy decides it is useful and safe; it must not encode identifier-specific state.

Request-shape validation may return ordinary validation problems for clearly malformed transport input before any identity lookup, but future implementation should be careful: once a value is close enough to be a candidate sign-in identifier, public responses should favor the generic sign-in failure shape.

## Rate Limiting Policy

Future local sign-in must enforce layered rate limits. No single bucket is enough.

Required layers:

- Per source or network bucket, using safe source metadata such as a coarse network hash or trusted reverse-proxy-derived source after proxy policy is reviewed.
- Per normalized identifier bucket, so one account cannot be attacked cheaply across rotating sources.
- Combined normalized identifier plus source bucket, so focused attacks from one source degrade quickly.
- Global emergency backstop, so a deployment can shed abusive sign-in traffic before password verification overwhelms CPU or memory.

Initial window and backoff concepts should be conservative defaults, not frozen production constants:

- Short rolling windows can catch bursts from one source or identifier.
- Longer rolling windows can catch credential stuffing that stays just under short-window limits.
- Progressive backoff can slow repeated failures without turning one failure into a denial-of-service.
- Global emergency backoff can protect a small self-hosted node during obvious abuse.

Future implementation must enforce deterministic server-side checks before expensive password verification where practical. If a request is already blocked by a source, identifier, combined, or global bucket, the API should avoid Argon2id verification and return the uniform throttled public response.

Rate-limit policy belongs in API/domain services or dedicated auth policy services. Endpoint handlers should not hand-roll counters, parse forwarded network headers directly, or own the abuse logic.

## Lockout And Throttling Behavior

Settleora should prefer soft throttling and temporary blocking over permanent account lockout.

Policy direction:

- Use temporary lockouts, cooldowns, or progressive backoff rather than permanent lockout requiring manual admin intervention for ordinary password failures.
- Avoid easy user-lockout griefing: an attacker should not be able to indefinitely deny a known user access by repeatedly submitting bad passwords for that identifier.
- Do not expose lockout or throttled state publicly as a distinct account state.
- Keep any user or admin visibility for blocked/throttled sign-in attempts behind future safe audit, session, or security UI design.
- Treat account recovery and password reset as separate future designs. Sign-in throttling must not silently create reset tokens, recovery flows, or bypass paths.
- Let successful sign-in reset or age out failure counters according to a reviewed policy, without deleting security audit records that are still inside retention.

Temporary blocking may be identifier-scoped, source-scoped, combined-scope, or deployment-global. The selected scope should be recorded internally for operations and audit, but it must not be returned to public callers.

## Credential-Stuffing Defense

Credential stuffing usually succeeds by staying broad and boring. Future sign-in policy should resist both fast and low-rate campaigns.

Required behavior:

- Normalize identifiers before applying identifier buckets, using the same internal normalization policy used for identity lookup.
- Count failures for identifiers even when the account, local identity, or credential is missing, without exposing that distinction.
- Apply cheap pre-verification throttles before password hashing.
- Apply post-failure counters after verification or internal denial.
- Track suspicious repeated attempts with bounded source and identifier metadata.
- Support an emergency deployment-level throttle for unusual bursts.
- Keep any future password-compromise screening, breached-password checks, or external intelligence integrations behind a separate reviewed design.

## Audit Boundaries

Future sign-in runtime must emit safe auth audit events for security-impactful outcomes.

Recommended event categories:

- `sign_in.succeeded`
- `sign_in.failed`
- `sign_in.throttled`
- `sign_in.blocked_by_policy`
- `credential.verification_denied`
- `sign_in.suspicious_repeated_attempts`

These names are examples, not approved enum values or schema changes.

Audit metadata may include bounded internal categories such as:

- Outcome category.
- Policy decision category.
- Counter scope category, such as source, identifier, combined, or global.
- Correlation ID or request ID where available.
- Coarsened, truncated, or hashed source metadata.
- Normalized identifier hash or equivalent non-reversible lookup key if future policy approves it.
- Auth account or credential subject only when already safely resolved inside the service boundary.

Audit metadata must not contain:

- Plaintext passwords.
- Submitted password values.
- Password verifier strings.
- Password hashes.
- Raw session tokens.
- Raw refresh tokens.
- Raw provider payloads.
- Full IP address or full user-agent strings unless a later retention/privacy policy explicitly approves them.
- Unbounded request bodies, headers, query strings, or provider internals.
- Storage paths, secret-provider details, pepper values, reset tokens, recovery codes, MFA secrets, or passkey private material.

Audit events should be useful for investigation without becoming an unnecessary tracking dataset. Retention and visibility must remain policy-driven and bounded.

## Operational Diagnostics Boundaries

Operations need enough signal to diagnose abuse and misconfiguration, but diagnostics must not become a side channel.

Allowed diagnostics should be aggregated or bounded:

- Counts by outcome category.
- Counts by policy decision category.
- Counts by coarse source bucket where policy allows.
- Counts by normalized identifier hash where policy allows.
- Latency and password-verification load metrics without raw input values.
- Correlation IDs that let administrators connect API logs to safe audit records.

Diagnostics must not log submitted passwords, raw identifiers in sensitive contexts, raw tokens, verifier strings, hash parameters that expose secret pepper details, full request payloads, full provider payloads, or detailed reasons that would enable account enumeration from logs exposed to support users.

## Storage And Schema Considerations

Future implementation may start with in-memory counters for single-node self-hosted deployments if the branch explicitly documents the limits and tests the policy behavior.

Tradeoffs:

- In-memory counters are simple, fast, and acceptable for a first single-node dev or small self-hosted mode.
- In-memory counters reset on restart, do not coordinate across API replicas, and can be bypassed when traffic is load-balanced across multiple nodes.
- Database-backed, Redis-backed, or otherwise distributed counters are more robust, but they require reviewed schema/provider design, retention rules, cleanup behavior, and operational failure handling.
- The self-hosted 5-50 user target may start simple, but the design must not block a future distributed limiter provider.

No migrations are authorized by this branch. Any persistent or distributed limiter store, schema, Redis dependency, package addition, or provider abstraction must be reviewed in a future implementation branch.

## Sign-In Flow Placement

Future local sign-in should follow this conceptual order:

1. Validate request shape.
2. Normalize the submitted identifier.
3. Apply pre-verification throttles where practical.
4. Resolve identity, account, and credential internally.
5. Verify the submitted password through the credential workflow if policy allows it.
6. Apply post-failure counters and backoff.
7. Create a session only after successful verification and all policy checks pass.
8. Return a uniform public response.
9. Write safe audit events.

Session creation must happen after password verification and policy approval. Credential verification alone is not sign-in, does not authorize business actions, and must not issue current-user state.

## Non-goals

This branch does not authorize:

- Runtime implementation.
- Endpoint code.
- Login or sign-in OpenAPI paths.
- Token issuance.
- Session middleware.
- Generated clients.
- UI, mobile, web, or admin changes.
- Migrations or schema changes.
- Package changes.
- Docker or CI changes.
- Password reset or account recovery.
- MFA or passkeys.
- Persistent rate-limit storage.
- Distributed limiter provider implementation.

## Next Implementation Candidates

Future branches should stay small and reviewable:

1. Add an internal sign-in policy service interface and in-memory limiter for single-node dev/self-hosted mode, with tests and no endpoint.
2. Add the sign-in endpoint only after the policy service exists and the public response shape is reviewed with OpenAPI.
3. Add a persistent or distributed limiter provider later if multi-replica deployments need it.
4. Add password reset and account recovery design separately.
5. Add MFA and passkey sign-in policy separately after local password sign-in behavior is proven.
