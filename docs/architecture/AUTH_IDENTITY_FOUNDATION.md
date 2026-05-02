# Auth Identity Foundation

This document defines Settleora's authentication and identity foundation. The current repository includes schema-only identity, local password credential, session, and auth audit foundations plus an internal password hashing service boundary, but it still has no login/current-user endpoints, credential persistence workflows, token issuance, session middleware, user/group API endpoints, OpenAPI contract changes, generated clients, or UI behavior.

Detailed credential storage, session metadata, passkey/MFA direction, auth audit records, and retention boundaries are defined in [AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md).
Design-only credential creation, password verification, and rehash workflow boundaries are defined in [AUTH_CREDENTIAL_WORKFLOW_DESIGN.md](AUTH_CREDENTIAL_WORKFLOW_DESIGN.md).

It is an architecture gate for future user and group endpoint work. It describes boundaries and required design properties only.

## Current State

- `UserProfile`, `UserGroup`, and `GroupMembership` domain models exist under the API users domain.
- `AuthAccount`, `AuthIdentity`, and `SystemRoleAssignment` domain models exist under the API auth domain.
- The current EF Core migrations create `user_profiles`, `user_groups`, `group_memberships`, `auth_accounts`, `auth_identities`, `system_role_assignments`, `local_password_credentials`, `auth_sessions`, and `auth_audit_events`.
- `user_profiles` stores app-domain profile data: display name, optional default currency, timestamps, and a future soft-delete timestamp.
- `user_groups` stores shared group containers with a creator profile reference.
- `group_memberships` stores profile-to-group membership rows with group-level `role` values of `owner` or `member`, and `status` values of `active` or `removed`.
- `auth_accounts` links one server-side auth account root to exactly one `UserProfile`.
- `auth_identities` stores provider type, provider name, and stable provider subject links for local or OIDC-style identities without credentials or raw tokens.
- `system_role_assignments` stores product-level `owner`, `admin`, and `user` role assignments separately from group membership roles.
- `local_password_credentials` stores local password verifier hash metadata linked to `auth_accounts`, without plaintext passwords, reset tokens, recovery codes, passkeys, or MFA secrets. The internal hashing service is not wired to credential row creation or mutation yet.
- `auth_sessions` stores server-side session/revocation metadata with token hashes only, not raw bearer or refresh tokens.
- `auth_audit_events` stores bounded auth audit event metadata without raw secrets, raw tokens, password material, passkey private material, MFA secrets, or full provider payloads.
- No login/current-user runtime behavior, credential persistence workflow implementation, token issuance, session middleware, authorization, invitations, friends, or user/group business API endpoints exist yet.
- No invitation, friend, business permission, passkey, MFA, reset-token, or recovery-code tables exist yet.

## Identity Concepts

Settleora must separate authentication identity from app-domain profile data.

- An authentication identity or account proves who is signing in.
- A `UserProfile` represents the app-domain person/profile used by expenses, groups, preferences, settlements, and future collaboration records.
- A `UserProfile` is not proof of authentication by itself.
- A request is authenticated only when the API validates a supported credential, token, or session through the approved auth boundary.
- Server-mode APIs must derive the current actor from the authenticated account/session boundary, then resolve the linked `UserProfile` for app-domain operations.
- Clients may display profile data, but profile display state must never be treated as an authorization signal.

This separation lets Settleora support local accounts, OIDC providers, future passkeys, and future MFA without mixing provider-specific auth data into app-domain profile tables.

## Supported Auth Foundations

The auth foundation must support these directions:

- Local accounts for self-hosted deployments that want built-in sign-in.
- OIDC integration, including Keycloak, for deployments that want an external identity provider.
- Future passkey support controlled by policy.
- Future MFA policy for local accounts and compatible provider flows.

Future implementation should use provider abstractions so auth method choices remain deployment policy, not hardcoded product behavior. Secure defaults should be least privilege, with invite-only mode, public self-registration, local-account enablement, OIDC-only mode, passkey policy, and MFA policy treated as explicit configuration or persisted policy decisions.

## Account To Profile Mapping

Future account or identity records should link to `UserProfile` rather than making `UserProfile` itself an auth record.

Required mapping properties:

- Every server-mode actor that can access app-domain data must resolve to exactly one active `UserProfile` for normal user operations.
- A future `UserProfile` may be linked to one or more approved auth identities only if policy allows account linking.
- OIDC identities should be keyed by stable provider identity values such as issuer and subject, not by mutable display names.
- Local account credentials should be stored only in identity/account credential storage, never in `user_profiles`.
- Provider secrets, raw access tokens, raw refresh tokens, raw ID tokens, password hashes, passkey credential material, and MFA secrets must not be stored in profile, group, or membership tables.
- Profile deletion, account disablement, and account unlinking are related but distinct state transitions and must be designed explicitly before implementation.

The current `UserProfile` schema remains a profile foundation. Authentication account linkage belongs to `auth_accounts`, and provider-specific identity linkage belongs to `auth_identities`.

## Session Model

Future sessions must be designed as security state, not as client convenience state.

The session model must include:

- Secure expiry with short-lived access where practical and bounded refresh lifetime.
- Revocation for individual sessions and, where needed, all sessions for an account.
- Server-side enforcement of revoked, expired, disabled, or policy-invalid sessions.
- Device/session visibility for users.
- New-device or unfamiliar-device audit events.
- Session metadata sufficient for security review without storing raw tokens.
- Rotation and replay protections for refresh-like credentials where applicable.

Clients may cache session display state, but the API remains authoritative for session validity.

## Authorization Model

Authorization must be enforced by the API through server-side policy checks.

- Clients must not infer authorization from hidden buttons, cached profile data, route visibility, or UI state.
- API endpoints must check the authenticated actor, linked `UserProfile`, product role, group membership, record ownership, sharing state, and policy requirements as appropriate.
- Group membership is not enough by itself without server policy checks.
- Possessing a `UserProfile` ID is not enough to access that profile or related records.
- Generated clients may expose typed calls later, but generated client availability does not imply permission.
- Authorization decisions should be centralized enough to avoid duplicating sensitive policy across handlers, clients, workers, or generated code.

Workers must not bypass API authorization for core business database writes. If future worker outputs affect user data, the API must validate and apply those outputs through domain policy.

## Role Boundaries

The PRD defines product-level roles:

- `owner`: manages global settings, auth integrations, encryption/storage policy, system health/logs, admin assignment, and maintenance/backup policy.
- `admin`: manages users, invitations, defaults, support/debug screens, audit-log viewing, and maintenance UI.
- `user`: manages their own profile, friends/groups, expenses, receipts, assignments/splits, settlement actions, notification preferences, and allowed privacy/security settings.

The current group membership schema defines group-level role and status only:

- Group role: `owner` or `member`.
- Group status: `active` or `removed`.

These group-level values are separate from system `owner`, `admin`, and `user` product roles. A group `owner` is not automatically a system owner or admin. A system admin is not automatically a member of every group unless future policy explicitly grants and audits that access.

Future endpoint work must check the correct role boundary for the operation being performed.

## Audit Requirements

Future auth and identity work must emit audit records for security-impactful actions, including:

- Sign-in success and failure events where safe to record.
- Sign-out and session revocation.
- New device, unfamiliar device, or suspicious session events.
- Account creation, disablement, re-enablement, deletion, recovery, and identity linking/unlinking.
- Password, passkey, MFA, and auth-provider changes.
- Product role assignment and removal.
- Permission and security-policy changes.
- Group membership additions, removals, role changes, and status changes.
- Invitation lifecycle events when invitations are implemented.

Audit records should identify actor, action, subject, timestamp, outcome, and correlation IDs where practical. They must avoid raw secrets, raw tokens, password material, unnecessary PII, and sensitive provider payloads.

## Local Mode And Server Mode

Local mode and server mode have different authority boundaries.

- Local mode should not require server authentication.
- Local-only profile authority is local to the device/app data store.
- Local mode may use device security such as biometric unlock, app PIN, and encrypted local storage where feasible.
- Local mode does not support friends, groups, or server collaboration.
- Server-mode profile authority belongs to the API and PostgreSQL.
- Server-mode collaboration, user/admin web access, sync, group membership, and shared records require server auth and authorization checks.
- Local-to-server migration must create or link server-mode accounts and profiles through an explicit import/linking flow; local profile data must not silently become an authenticated server account.
- Offline server-mode edits remain pending local state until synced and accepted by the API.

This distinction protects local-only use while keeping server-mode collaboration under a consistent auth and authorization boundary.

## Non-goals

This document does not authorize:

- Login/current-user auth implementation.
- Session middleware or runtime session validation.
- API endpoints.
- OpenAPI changes.
- Generated client changes.
- UI behavior.
- Runtime behavior changes.
- Plaintext password storage, raw token storage, passkey storage, or MFA storage.
- Invitation, friend, or group endpoint implementation.

## Next Implementation Candidates

Future work should remain small and reviewable. Good next candidates are:

- Internal credential creation and verification service implementation that follows [AUTH_CREDENTIAL_WORKFLOW_DESIGN.md](AUTH_CREDENTIAL_WORKFLOW_DESIGN.md).
- Runtime auth/session boundaries only after credential and session policy are reviewed.
- API current-user boundary that resolves the authenticated account/session to the current `UserProfile` without exposing unrelated user data.
- Guarded user/group endpoints only after the auth boundary exists and server-side policy checks are designed.

Each candidate should define its own explicit non-goals, validation, migration expectations, and OpenAPI/generated-client impact before implementation starts.
