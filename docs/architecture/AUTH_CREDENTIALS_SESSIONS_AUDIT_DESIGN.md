# Auth Credentials, Sessions, And Audit Design

This document defines the schema direction for credential storage, sessions, refresh-like credential history, session-family state, and auth audit records. The current repository includes a schema foundation for local password credentials, server-side sessions, refresh/session-family persistence, and auth audit events, plus internal password hashing, credential workflow, session runtime, refresh session runtime service boundaries, first-owner local bootstrap, guarded admin local-user creation, refresh-capable local sign-in, the public refresh endpoint/OpenAPI contract, guarded group member-management success audit events, and generated web/Dart client foundations from OpenAPI. Password hashing policy is defined separately in [PASSWORD_HASHING_POLICY.md](PASSWORD_HASHING_POLICY.md), credential workflow boundaries are defined in [AUTH_CREDENTIAL_WORKFLOW_DESIGN.md](AUTH_CREDENTIAL_WORKFLOW_DESIGN.md), and refresh rotation policy is defined in [AUTH_REFRESH_TOKEN_ROTATION_POLICY.md](AUTH_REFRESH_TOKEN_ROTATION_POLICY.md). It does not authorize additional generated-client changes beyond reviewed OpenAPI slices, UI behavior, general public credential endpoints, session middleware, authorization middleware, or additional public auth runtime behavior beyond the implemented auth endpoints.

## Current State

- The auth identity schema foundation exists.
- The credential/session/audit schema foundation exists, including explicit refresh/session-family persistence for future rotation and replay detection.
- The current auth schema includes `auth_accounts`, `auth_identities`, and `system_role_assignments`.
- `auth_accounts` links a server-side auth account root to one `UserProfile`, but it does not store credentials.
- `auth_identities` stores local or OIDC-style provider identity links, but it does not store password hashes, passkey material, MFA secrets, or raw tokens.
- `system_role_assignments` stores product-level `owner`, `admin`, and `user` role assignments separately from group membership roles.
- `local_password_credentials` stores local password verifier hash metadata linked to `auth_accounts`; it does not store plaintext passwords, reset tokens, raw recovery codes, passkeys, or MFA secrets. The internal credential workflow service writes and verifies these rows for existing auth accounts.
- `auth_sessions` stores server-authoritative session metadata and token hashes; it does not store raw session IDs, raw bearer tokens, or raw refresh tokens.
- `auth_session_families` stores account-scoped refresh/session continuity lineage status, absolute expiry, rotation, and revocation metadata without raw credential material.
- `auth_refresh_credentials` stores unique refresh credential hashes, status, issued/idle/absolute expiry, consumed/revoked timestamps, optional session linkage, and optional replacement linkage without raw refresh tokens.
- `auth_audit_events` stores bounded, safe auth audit metadata; it does not store raw secrets, raw tokens, password material, passkey private material, MFA secrets, or full provider payloads. The internal credential workflow writes bounded creation and verification audit events, and guarded group member management writes success events for member add, role update, and removal.
- No passkey, MFA, reset-token, recovery-code, invitation, friend, or business authorization tables exist yet.
- First-owner local bootstrap can create the initial local password credential only through the internal credential workflow and only while no auth account exists. Guarded admin local-user creation can create later normal local users through the same credential workflow for authenticated system owners/admins. Neither path returns credential material, and neither path is general public registration.
- Admin local-user creation writes a bounded safe auth audit event for the admin-created account plus the existing credential workflow audit event. Audit metadata must remain free of submitted identifiers, plaintext passwords, verifier strings, password hash metadata, raw tokens, provider payloads, storage paths, and unnecessary PII.
- Group membership add, role update, and removal success events write `group_member.added`, `group_member.role_updated`, and `group_member.removed` with actor/subject auth account IDs when safely resolvable and bounded metadata for `workflowName`, `groupId`, `targetUserProfileId`, and applicable role/status transitions. They do not add failure audit coverage, audit UI, admin audit viewing, export, retention cleanup, notifications, OpenAPI changes, or generated-client changes.
- Internal refresh credential generation, rotation, replay classification, and linked family revocation behavior now exists behind the refresh runtime service boundary. `POST /api/v1/auth/sign-in` now creates refresh-capable session families and initial refresh-like credentials through that boundary, and `POST /api/v1/auth/refresh` rotates submitted refresh-like credentials without adding raw refresh-token storage or new schema. Generated web and Dart client foundations exist from the OpenAPI contract. No authorization middleware, general registration flow, arbitrary/admin session flow, or UI behavior exists yet.

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
- Group membership additions, role changes, removals, and future status transitions.
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
- Request bodies.
- Local account identifiers or emails unless a future reviewed policy explicitly allows a bounded form.
- Storage paths.
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
- Generated clients expose typed calls for reviewed auth endpoints, but generated client availability must not imply permission.

## Non-goals

This schema foundation does not authorize:

- General public credential creation or password verification endpoints beyond the setup-only first-owner local bootstrap path and guarded owner/admin local-user creation path.
- Additional session implementation beyond the current reviewed sign-in/refresh/current-user/sign-out/session-list/session-revocation boundaries.
- Passkey implementation.
- MFA implementation.
- Audit UI, admin audit viewing, audit export, retention cleanup, notifications, or broad failure-audit behavior outside reviewed slices.
- Additional OpenAPI changes beyond the reviewed auth endpoint contracts.
- Additional generated-client changes beyond the existing web/Dart client foundations.
- UI behavior.
- Additional runtime behavior changes beyond current reviewed auth and group membership audit boundaries.

## Next Implementation Candidates

Future work should remain small and separately reviewable.

- Auth middleware and authorization handoff after the current endpoint-level behavior is proven.
- UI integration over the generated client foundations only in separate reviewed slices.
- Admin revocation, retention cleanup, and distributed hardening in separate reviewed slices.
- Separate passkey and MFA schema review before passkey or MFA implementation.
