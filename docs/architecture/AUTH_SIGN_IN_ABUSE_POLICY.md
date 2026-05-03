# Auth Sign-In Abuse Policy

This document defines Settleora's local sign-in abuse policy for the public local sign-in endpoint and the internal sign-in orchestration boundary.

It began as a design gate and now also records the implemented internal policy, local sign-in orchestration boundary, and first public local sign-in endpoint. It does not authorize generated clients, UI behavior, migrations, package changes, Docker changes, registration, public refresh endpoints, or additional auth endpoints by itself.

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
- `POST /api/v1/auth/sign-in` exists and exposes the first public local sign-in endpoint.
- `GET /api/v1/auth/current-user` exists and validates an existing opaque session token into a minimal current actor/profile/session/role response.
- An internal local sign-in orchestration service exists for endpoint-independent identifier normalization, local identity/account lookup, abuse-policy checks and attempt recording, credential verification, and session creation.
- The local sign-in runtime writes safe sign-in-specific `auth_audit_events` for success, invalid credentials, pre-verification throttling, and session-creation failure without storing submitted identifiers, normalized identifiers, identifier keys, source keys, passwords, token material, verifier material, or policy counters.
- Public registration and public refresh endpoints do not exist. Current-session and current-account session endpoints are covered by the auth runtime design.
- Global auth middleware, authorization handlers, generated auth clients, and UI/mobile/web/admin auth flows do not exist.

## Implemented Internal Policy Boundary

The first internal service boundary now exists under the API auth layer.

- `ISignInAbusePolicyService` exposes endpoint-independent pre-verification checking and post-result recording for future sign-in code.
- The in-memory implementation is a single-node dev/self-hosted limiter. It uses only .NET BCL types, process-local state, `TimeProvider`, short and longer windows, temporary throttling, retention pruning, and bounded bucket counts.
- The service evaluates source, normalized identifier, combined source plus identifier, and global buckets before credential lookup or password verification.
- The service records failed, throttled, and policy-blocked attempts into the layered buckets. Successful attempts clear the matching identifier and combined counters, while source and global counters remain in place.
- Bucket keys must be caller-provided safe, bounded values such as normalized hashes or coarse source buckets. The service rejects blank, oversized, or unsafe keys and its result strings do not include raw identifier or source keys.
- The implementation does not query accounts, identities, credentials, sessions, or audit rows, so it cannot reveal whether an account exists.

This policy service boundary deliberately remains internal-only. It does not by itself add generated clients, migrations, packages, Docker changes, distributed limiter storage, password reset, MFA, passkeys, sign-out, session list/revocation, or auth middleware.

## Implemented Internal Sign-In Orchestration Boundary

The internal local sign-in orchestration boundary now exists under the API auth layer.

- `ILocalSignInService` exposes endpoint-independent local sign-in orchestration for future endpoint code.
- The service trims and lower-cases submitted identifiers with invariant culture, rejects blank or overlong identifiers, and looks up local identities with `ProviderType = local`, `ProviderName = local`, and `ProviderSubject = normalized identifier`.
- It derives abuse-policy identifier keys as `local-id-sha256:<base64url-sha256(normalizedIdentifier)>` and requires caller-provided source keys to already be safe, bounded, and coarsened.
- It calls `ISignInAbusePolicyService.CheckPreVerification` before local identity/account lookup and password verification, and records succeeded, failed, or throttled attempts with bounded policy outcomes.
- It verifies local passwords only through `IAuthCredentialWorkflowService.VerifyLocalPasswordAsync` and creates sessions only through `IAuthSessionRuntimeService.CreateSessionAsync`.
- Its results use bounded internal statuses such as signed-in, invalid credentials, throttled, and session-creation failed. Success returns the raw session token only through the result object and result strings do not include raw identifiers, normalized identifiers, passwords, source keys, token material, hashes, verifiers, or credential details.

Sign-in-specific `auth_audit_events` are now written inside the local sign-in service boundary with bounded workflow, status, and policy-status categories only. Existing credential and session runtime services still write their bounded credential/session audit events during verification and session creation. Persistent or distributed limiter storage remains deferred to a later reviewed branch.

## Implemented Public Sign-In Endpoint

The implemented public endpoint is `POST /api/v1/auth/sign-in`.

- It accepts JSON only with `identifier`, `password`, optional `deviceLabel`, and optional bounded `requestedSessionLifetimeMinutes`.
- It derives a conservative fixed single-node source bucket internally and does not accept source keys from clients.
- It does not parse forwarded proxy headers, store full IP addresses, or pass full user-agent strings in this first endpoint slice.
- It calls `ILocalSignInService.SignInAsync(...)` and does not reimplement identity lookup, credential verification, session creation, or abuse-policy logic in the endpoint.
- It maps ordinary failures to a generic `401 application/problem+json` and throttled failures to a generic `429 application/problem+json`.
- On success, it returns only auth account ID, user profile ID, session ID, raw opaque session token, and session expiry. The raw token is returned only in that success response.

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

Sign-in runtime emits safe auth audit events for security-impactful outcomes.

Implemented event categories:

- `sign_in.succeeded`
- `sign_in.failed`
- `sign_in.throttled`
- `sign_in.session_creation_failed`

Future reviewed policy work may add additional categories such as `sign_in.blocked_by_policy`, credential-verification denial summaries, or suspicious repeated-attempt categories.

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

- Additional runtime implementation beyond the internal policy, local sign-in orchestration, current-user, and public local sign-in boundaries described above.
- Additional auth endpoint code.
- Additional login or sign-in OpenAPI paths.
- Refresh-token issuance.
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

1. Add a persistent or distributed limiter provider later if multi-replica deployments need it.
2. Add password reset and account recovery design separately.
3. Add MFA and passkey sign-in policy separately after local password sign-in behavior is proven.
