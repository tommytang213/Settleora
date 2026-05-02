# Auth Credentials, Sessions, And Audit Design

This document defines the schema direction for credential storage, sessions, and auth audit records. The current repository includes a schema foundation for local password credentials, server-side sessions, and auth audit events, plus internal password hashing and credential workflow service boundaries. Password hashing policy is defined separately in [PASSWORD_HASHING_POLICY.md](PASSWORD_HASHING_POLICY.md), and credential workflow boundaries are defined in [AUTH_CREDENTIAL_WORKFLOW_DESIGN.md](AUTH_CREDENTIAL_WORKFLOW_DESIGN.md). It does not authorize OpenAPI changes, generated clients, UI behavior, public credential endpoints, token issuance, session middleware, or auth runtime behavior.

## Current State

- The auth identity schema foundation exists.
- The credential/session/audit schema foundation exists.
- The current auth schema includes `auth_accounts`, `auth_identities`, and `system_role_assignments`.
- `auth_accounts` links a server-side auth account root to one `UserProfile`, but it does not store credentials.
- `auth_identities` stores local or OIDC-style provider identity links, but it does not store password hashes, passkey material, MFA secrets, or raw tokens.
- `system_role_assignments` stores product-level `owner`, `admin`, and `user` role assignments separately from group membership roles.
- `local_password_credentials` stores local password verifier hash metadata linked to `auth_accounts`; it does not store plaintext passwords, reset tokens, raw recovery codes, passkeys, or MFA secrets. The internal credential workflow service writes and verifies these rows for existing auth accounts.
- `auth_sessions` stores server-authoritative session metadata and token hashes; it does not store raw session IDs, raw bearer tokens, or raw refresh tokens.
- `auth_audit_events` stores bounded, safe auth audit metadata; it does not store raw secrets, raw tokens, password material, passkey private material, MFA secrets, or full provider payloads. The internal credential workflow writes bounded creation and verification audit events.
- No passkey, MFA, reset-token, recovery-code, invitation, friend, or business authorization tables exist yet.
- No authentication runtime behavior, authorization middleware, sign-in endpoint, session flow, or current-user API exists yet.

## Credential Storage Boundaries

Local account credentials must be separate from `auth_accounts`, `auth_identities`, and `user_profiles`.

- `auth_accounts` remains the account root and status boundary.
- `auth_identities` remains the provider lookup/link boundary.
- `user_profiles` remains app-domain profile data, not proof of authentication.
- Credential rows should link to the owning `auth_account` or approved provider identity boundary, but should not be embedded in account, identity, or profile rows.

Password storage must be designed as security material, not user profile data.

- Plaintext passwords must never be stored.
- Password hashes must record the password hashing algorithm and algorithm version.
- Password hashes must record parameters or work factor settings required to verify and upgrade the hash.
- Password hash records must include created and updated timestamps.
- Future schema should support rotation, revocation, disabled credentials, and "rehash required" decisions after policy changes.
- Credential verification metadata must avoid leaking reusable secrets.
- Password reset or recovery state must be reviewed separately before implementation.

OIDC and external provider tokens have a different boundary from local credentials.

- Raw OIDC access tokens, refresh tokens, and ID tokens must never be stored in ordinary credential tables.
- `auth_identities` should keep stable provider lookup values such as provider type, provider name, and provider subject only.
- If future OIDC token persistence is needed, it requires a separate encrypted token-storage design, retention policy, and review.

## Session Model Schema Direction

Sessions must be server-authoritative security state.

- Session IDs and refresh token IDs should not be stored as raw bearer tokens.
- Store hashed session or refresh-token identifiers if server-side lookup or revocation requires persistence.
- Session records should link to the owning `auth_account`.
- Session records should include issued, expires, revoked, and last-seen timestamps.
- Revoked sessions should record a safe revocation reason, such as user sign-out, user revocation, admin revocation, credential rotation, account disabled, policy change, suspected compromise, or token replay.
- Refresh-like credentials should support rotation and replay detection without storing reusable raw token material.

Session metadata should be useful for user security review without becoming an unnecessary tracking dataset.

- Store user-visible device/session labels where available.
- Store user-agent or client metadata in normalized, bounded form.
- Store IP or network metadata only at the level needed for security review, abuse detection, and audit correlation.
- Prefer bounded or coarse network data over full long-lived IP history unless a future policy review explicitly requires more.
- Include first-seen and last-seen timestamps for device/session display.
- Support a user-visible session/device list.
- Support per-session revocation.
- Support account-wide revocation when credentials rotate, an account is disabled, or policy requires it.

## Passkey And MFA Future Direction

Passkeys and MFA are future features. They must receive separate schema and policy review before implementation.

Likely future table categories include:

- Passkey credential records linked to an auth account, with credential identifiers, public-key material, sign count or equivalent replay metadata, attestation policy results where retained, display label, created/last-used timestamps, and revocation state.
- MFA factor records linked to an auth account, with factor type, enrollment state, created/verified/last-used timestamps, and revocation state.
- MFA challenge or recovery records with short retention, strict expiry, and no reusable secret exposure.
- Security policy records for whether passkeys, MFA enrollment, recovery, or step-up authentication are required.

These categories are directional only. They are not approved table names or implementation scope.

## Auth Audit Schema Direction

Auth audit records must capture security-impactful actions without storing secrets.

Events should include:

- Sign-in success.
- Sign-in failure where safe to record.
- Sign-out.
- Session revocation.
- New-device or unfamiliar-device detection.
- Role assignment and removal.
- Identity link and unlink.
- Account disablement, re-enablement, deletion, and recovery.
- Credential creation, rotation, revocation, reset, and policy-driven rehash.
- Future passkey and MFA enrollment, verification, removal, recovery, and failed challenge events.

Audit records should include:

- Actor account or system actor.
- Subject account, identity, session, role assignment, credential, or policy target.
- Action name.
- Outcome, such as success, failure, denied, revoked, expired, or blocked by policy.
- Timestamp.
- Correlation ID or request ID.
- Safe metadata needed to investigate the event.

Audit records must not store:

- Plaintext passwords.
- Password hashes.
- Raw session tokens.
- Raw refresh tokens.
- Raw OIDC access tokens, refresh tokens, or ID tokens.
- Passkey private material.
- MFA secrets.
- Full sensitive provider payloads.
- Unbounded user-agent or IP history.

Audit writes should happen in API/domain auth boundaries. Clients may display audit history later, but clients must not be the source of truth for audit records.

## Retention And Privacy

Retention must be policy-driven and bounded.

- Auth audit retention should be configurable by deployment policy.
- Some security events may need longer retention than session display metadata.
- Session/device metadata retention should be bounded after expiry or revocation.
- IP and user-agent details should be minimized, normalized, truncated, or coarsened where practical.
- Future admin export or audit viewing features must preserve the same secret-redaction rules.
- Deletion, account disablement, and legal/privacy retention requirements must be reviewed before permanent purge behavior is implemented.

## Runtime Boundaries

- The API owns credential, session, and auth audit writes.
- API/domain services own authorization checks, session validation, credential policy, audit decisions, and security policy enforcement.
- Workers must not mutate auth tables.
- Workers must not bypass the API to change accounts, sessions, credentials, roles, MFA, passkeys, or auth audit records.
- Clients must not decide authorization.
- Clients may present session state, device lists, security prompts, or cached profile data, but the API remains authoritative for authentication and authorization.
- Generated clients may expose future auth endpoints, but generated client availability must not imply permission.

## Non-goals

This schema foundation does not authorize:

- Auth implementation.
- Public credential creation or password verification endpoints.
- Session implementation.
- Passkey implementation.
- MFA implementation.
- General auth audit implementation outside the internal credential workflow.
- OpenAPI changes.
- Generated client changes.
- UI behavior.
- Runtime behavior changes.

## Next Implementation Candidates

Future work should remain small and separately reviewable.

- Current-user API boundary that resolves the authenticated account/session to the linked `UserProfile`.
- Auth middleware and runtime only after schema and password/session policy are reviewed.
- Separate passkey schema review before passkey implementation.
- Separate MFA schema review before MFA implementation.
