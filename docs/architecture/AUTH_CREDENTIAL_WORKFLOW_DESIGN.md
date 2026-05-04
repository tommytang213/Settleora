# Auth Credential Workflow Design

This document designs Settleora's next local-account credential boundary: creating local password credentials and verifying submitted passwords against `local_password_credentials` by using the internal `IPasswordHashingService`.

It defines the internal service boundary now implemented for EF-backed local password credential creation and verification. The current first-owner local bootstrap endpoint is the only setup-time public consumer of credential creation and remains unavailable after any auth account exists. This document does not authorize general public runtime workflows, additional account-creation endpoints, token/session issuance, additional OpenAPI auth paths, additional generated-client changes, UI behavior, migrations, or package changes.

## Current State

- Auth, user, and group schema foundations exist in the API EF Core model and migrations.
- `auth_accounts` links the server-side auth account root to one `UserProfile`.
- `auth_identities` stores local or OIDC-style provider identity links without storing passwords or raw provider tokens.
- `local_password_credentials` stores verifier output plus non-secret hash metadata linked to `auth_accounts`.
- `auth_sessions` stores future server-side session metadata and token hashes only.
- `auth_audit_events` stores bounded safe audit metadata only.
- The internal password hashing service exists and can create and verify Argon2id password verifiers through `IPasswordHashingService`.
- An internal credential workflow service can create EF-backed local password credentials for existing active auth accounts.
- Internal password verification is wired to EF rows and can update `last_verified_at_utc` plus rehash after successful verification when required.
- Credential creation and verification workflows write EF-backed `auth_audit_events` rows with bounded safe metadata for workflow name and status category.
- A setup-only first-owner local bootstrap endpoint can call credential creation for the initial local account while no auth account exists. No general registration, password reset, current-user mutation, token issuance from bootstrap, Flutter, web, or worker account-creation behavior exists.

## Authority Boundaries

- API/domain auth services own all credential row writes.
- API/domain auth services own credential verification decisions, rehash decisions, credential status transitions, and related audit writes.
- Endpoint handlers may pass submitted password input into an approved auth service, but they must not parse verifier strings, inspect work factors, select password algorithms, compare derived bytes, update credential rows directly, or log credential material.
- Clients, generated clients, and workers must not mutate `local_password_credentials`, `auth_sessions`, `auth_accounts`, `auth_identities`, or auth audit rows directly.
- Workers must not bypass the API for auth table writes.
- Audit events are required for security-impacting credential actions, including credential creation, verification success or failure, disablement, revocation, and rehash.
- Public behavior must avoid confirming whether a given account, local identity, or credential exists.

## Credential Creation Workflow

Credential creation creates a local password credential for an existing auth account. The first-owner bootstrap service creates the initial auth account/profile boundary first and then calls this workflow to create the local password credential. Credential creation itself is not general account registration, invitation acceptance, password reset, login, or token issuance.

Future implementation should:

- Accept an existing `auth_account` boundary and submitted plaintext password inside an internal API/domain service.
- Confirm the auth account is eligible for local credentials before writing a row, including account status and local identity policy.
- Hash the plaintext only inside the service boundary by calling `IPasswordHashingService.HashPassword`.
- Store only the verifier output and non-secret metadata returned by the hashing service:
  - `password_hash`
  - `password_hash_algorithm`
  - `password_hash_algorithm_version`
  - `password_hash_parameters`
  - `status`
  - `created_at_utc`
  - `updated_at_utc`
  - `requires_rehash`
- Never store, return, log, trace, metric, or audit the plaintext password, verifier string, salt, pepper, derived key material, reset token, or recovery code.
- Set new credentials to `active` only when the auth account and local identity boundary allow local password sign-in.
- Set `created_at_utc` and `updated_at_utc` from a single service-owned clock value for the creation transaction.
- Leave `last_verified_at_utc` null at creation.
- Leave `revoked_at_utc` null for active credentials.
- Set `requires_rehash` from the hashing service or policy decision, normally false for a new verifier created with the current policy.

The active credential uniqueness policy must stay explicit. The current schema has a unique index on `local_password_credentials.auth_account_id`, which means the next implementation should treat Settleora as allowing at most one local password credential row per auth account. If future rotation history requires multiple credential rows, that must be a separate migration and design that replaces the current account-wide uniqueness with a reviewed active-credential uniqueness policy.

Safe failure behavior:

- If the account is missing, disabled, deleted, ineligible for local password credentials, or already has an active credential, return a safe internal failure category.
- If hashing fails because of unsupported algorithm, invalid configuration, or library failure, do not write a partial credential row.
- Do not expose whether the account exists through any future public endpoint response.
- Do not emit logs or audit metadata containing password input, verifier output, hash parameters that include sensitive pepper details, or raw failure payloads.
- Emit a safe audit event for security-impacting attempts where policy allows audit collection.

## Password Verification Workflow

Password verification checks a submitted password against an active local credential. It does not create a session, issue tokens, update current-user state, or authorize business actions.

Future implementation should:

- Resolve the account and local identity boundary through the approved API/domain auth service.
- Load the active `local_password_credentials` row for the resolved auth account.
- Reject missing, disabled, revoked, or otherwise ineligible credentials before issuing any session or token.
- Reject disabled or deleted auth accounts before considering verification successful.
- Build a `StoredPasswordHash` from the persisted verifier and metadata.
- Call `IPasswordHashingService.VerifyPassword` with the submitted password and stored hash.
- Treat wrong password, malformed verifier, unsupported algorithm, and invalid hashing configuration as safe failures.
- Update `last_verified_at_utc` and `updated_at_utc` only after successful verification.
- Leave credential rows unchanged after wrong password, malformed verifier, unsupported algorithm, disabled credential, revoked credential, or policy-denied verification.
- Return a bounded internal result such as verified, failed, denied, credential disabled, credential revoked, malformed verifier, unsupported algorithm, or invalid configuration.
- Map future public responses to a uniform sign-in failure shape so account or credential existence is not leaked.

Verification must not:

- Log plaintext passwords, verifier strings, salts, pepper identifiers in sensitive contexts, derived key material, token material, or full provider payloads.
- Return verifier internals to endpoint handlers, clients, generated clients, workers, logs, metrics, traces, or audit metadata.
- Create auth sessions.
- Issue access tokens or refresh tokens.
- Change account status.
- Create or update OpenAPI auth paths.

Malformed verifier strings and unsupported algorithms are security-relevant operational failures. They should be auditable with safe metadata, but they should not be exposed to public callers as distinct reasons.

## Rehash Workflow

Rehash upgrades a credential after successful password verification. It is not a startup migration or background bulk rewrite.

Future implementation should consider rehash when:

- The credential row has `requires_rehash = true`.
- The stored policy version differs from the current password hashing policy.
- The stored work factor or parameter metadata differs from the current policy.
- The algorithm family, verifier format, library profile, or non-secret pepper metadata requires migration.

Rehash rules:

- Rehash only after `IPasswordHashingService.VerifyPassword` succeeds for an active credential.
- Rehash using the submitted password still held inside the service boundary.
- Update only verifier output and metadata fields needed for the new hash:
  - `password_hash`
  - `password_hash_algorithm`
  - `password_hash_algorithm_version`
  - `password_hash_parameters`
  - `requires_rehash`
  - `updated_at_utc`
  - optionally `last_verified_at_utc` when part of the same successful verification transaction
- Clear `requires_rehash` only after the new verifier and metadata are successfully persisted.
- Emit a safe credential rehash audit event.
- If rehash fails after verification succeeds, preserve the old credential row, keep authentication result handling separate from token/session issuance, and record a safe operational audit or warning.
- Avoid production startup bulk rewrites because plaintext passwords are not available and silent verifier mutation at startup creates operational and audit risk.

## Audit Boundaries

Credential workflows must emit bounded audit events for security-impacting actions. Action names below are examples, not approved enum or schema changes.

| Action | Typical outcome | Safe metadata examples |
| --- | --- | --- |
| `credential.created` | `success`, `failure`, `denied`, `blocked_by_policy` | credential status, policy version, algorithm family, reason category |
| `credential.verification_succeeded` | `success` | credential status, rehash recommended flag, policy version |
| `credential.verification_failed` | `failure`, `denied`, `blocked_by_policy` | bounded failure category, credential status when already known inside service |
| `credential.disabled` | `success`, `denied` | reason category, actor type |
| `credential.revoked` | `revoked`, `denied` | revocation reason category, actor type |
| `credential.rehashed` | `success`, `failure` | rehash reason category, old/new policy version, algorithm family |

Audit metadata must not contain:

- Raw passwords.
- User input password values.
- Verifier strings.
- Password hashes.
- Salts.
- Pepper values or sensitive pepper lookup details.
- Raw session tokens or refresh tokens.
- Reset tokens, reset codes, recovery codes, or MFA/passkey secrets.
- Full provider payloads.
- Unbounded user-agent, IP, or request payload data.

Audit writes should happen in the same service boundary as the credential decision. When a credential write and audit write must succeed together, use one transaction. When audit best-effort behavior is later considered, it needs a separate operational design because dropping security audit records is itself security-relevant.

## Future Repository And Service Shape

Implementation names are examples only. A future branch could introduce an internal service such as `ILocalPasswordCredentialService` or `IAuthCredentialService` plus small request/result types under the API auth boundary.

Recommended shape:

- Keep endpoint handlers thin and unaware of password verifier internals.
- Keep EF queries and updates inside an internal auth service or repository boundary.
- Query `auth_accounts`, `auth_identities`, and `local_password_credentials` together only as needed for the workflow.
- Convert EF credential rows to `StoredPasswordHash` inside the service boundary.
- Convert `IPasswordHashingService` results to credential row updates inside the service boundary.
- Use a service-owned clock abstraction or consistent timestamp source if one exists when implementation starts.
- Use transactions for create, successful verification timestamp update, rehash, disable, revoke, and associated audit writes.
- Use optimistic concurrency or explicit retry handling if future schemas add concurrency tokens.
- Treat the current unique `auth_account_id` credential index as the database backstop for the one-local-password-credential policy.
- Catch uniqueness conflicts and return a safe duplicate/ineligible result rather than leaking database exception detail.
- Avoid public distinctions between missing account, missing identity, missing credential, wrong password, disabled credential, revoked credential, and policy-denied sign-in.

Possible internal result categories should be safe to map to uniform public responses later. They may retain enough detail for audit and operations inside the service boundary without exposing account existence to callers.

## Non-goals

This design does not authorize:

- Code implementation.
- Package changes.
- EF migrations.
- Schema changes.
- Login endpoints.
- Current-user endpoints.
- Session creation.
- Access-token or refresh-token issuance.
- Auth middleware.
- Password reset, recovery code, passkey, or MFA flows.
- OpenAPI auth paths.
- Additional generated-client changes beyond the existing web/Dart client foundations.
- Flutter, web, or admin UI changes.
- Worker behavior changes.
- Docker or runtime behavior changes.

## Implemented Internal Service Boundary

The implemented internal service boundary:

- Adds an internal credential workflow service using `IPasswordHashingService`.
- Adds EF-backed tests for creation, verification success, wrong password, disabled/revoked credential rejection, malformed verifier handling, unsupported algorithm handling, invalid configuration handling, successful `last_verified_at_utc` update, successful rehash, no mutation on failed verification, missing credentials, and safe result string output.
- Adds an EF-backed credential audit writer that persists bounded safe `auth_audit_events` metadata for credential creation and verification outcomes.
- Keeps public endpoints, additional OpenAPI paths, additional generated-client changes, token/session issuance, migrations, UI, and worker changes out of scope.
