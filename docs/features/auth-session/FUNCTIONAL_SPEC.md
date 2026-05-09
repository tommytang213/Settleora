# Auth and Session Functional Spec

## Purpose

Define the user-facing behavior for authentication, account/session visibility, and security-sensitive account flows.

This spec describes product behavior only. Runtime implementation details belong in `TECHNICAL_SPEC.md` and the auth architecture docs.

## User goals

Users should be able to:

- create or access an account where server mode requires authentication
- sign in safely
- understand active sessions/devices
- revoke sessions
- receive clear security-impactful notifications
- use local-only mode without server authentication

Admins/owners should be able to:

- configure local account/OIDC policy where supported
- manage user/admin/owner role assignment through reviewed flows
- review relevant auth/security audit events

## Modes

### Local-only mode

- Does not require server authentication.
- May use local app lock, biometric unlock, app PIN, or encrypted local storage where feasible.
- Does not support server collaboration, friends, groups, or admin portal behavior.

### Server mode

- Requires authenticated API access.
- Server resolves current actor from auth/session boundary.
- Current actor maps to an active user profile before app-domain operations.

## Primary user flows

### Registration

1. User opens server-connected setup.
2. Server policy determines whether registration is allowed.
3. User creates an account or uses an external provider.
4. User profile is created/linked.
5. Initial session is created.
6. Security audit event is recorded.

### Sign in

1. User enters credentials or uses an auth provider.
2. API verifies credentials/provider response.
3. API creates session if allowed.
4. User lands in current profile/app shell.
5. Sign-in success or safe failure is auditable.

### Sign out

1. User chooses sign out.
2. Current session is revoked.
3. Client clears local authenticated state.
4. Audit event records sign-out/revocation.

### Session/device list

1. User opens security/session settings.
2. User sees active/recent sessions with safe metadata.
3. User can revoke an individual session.
4. User may revoke all other sessions where policy allows.

### Security event notification

Users should receive visible notices for important account/security events where appropriate, such as:

- new device/session
- password/credential change
- session revoked
- account disabled
- suspicious or blocked sign-in where safe to show

## UI surfaces

- first launch mode selection
- sign-in screen
- registration screen where enabled
- account/security settings
- session/device list
- admin user management screen later
- security notification center

## Permissions and visibility

- Users can view their own session/device information.
- Users cannot view other users' session/device details.
- Admin/owner views must avoid raw tokens, secrets, passwords, and sensitive provider payloads.
- System owner/admin role changes require server-side authorization and audit.

## States

Suggested user/account/session display states:

```text
active
disabled
revoked
expired
needs_reauth
policy_blocked
```

Session display should distinguish:

```text
current_session
other_active_session
expired_session
revoked_session
```

## Error behavior

- Avoid account enumeration where practical.
- Show clear but safe failure messages.
- Do not reveal whether a password, token, provider subject, or credential detail was correct.
- Offer recovery only after recovery/reset design is approved.

## Acceptance criteria

- Local-only mode can be used without server auth.
- Server mode requires authenticated access for protected app operations.
- Current user/profile information comes from the authenticated session, not user-supplied profile IDs.
- Session list shows safe metadata only.
- Users can revoke sessions.
- Security-impactful events create audit records.

## Non-goals

- Password reset implementation unless separately designed.
- Passkey/MFA implementation unless separately scoped.
- Public self-registration without policy controls.
- Storing raw provider tokens or plaintext passwords.
- Client-only authorization decisions.
