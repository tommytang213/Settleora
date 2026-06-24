# Auth MFA And Passkey Policy Audit

This document defines the Day 1 control architecture for admin-configurable MFA/passkey policy and auth audit coverage for GitHub issue #416. It builds on [AUTH_MFA_PASSKEY_ARCHITECTURE.md](AUTH_MFA_PASSKEY_ARCHITECTURE.md), which defines the design-only factor, challenge, recovery-code, sensitive-data, and schema-category breakdown.

This is documentation and control architecture only. It does not implement runtime enforcement, approve migrations, change OpenAPI, regenerate clients, add UI, create secrets, change auth/session middleware, or change deployed security behavior.

## Current State

Settleora already has auth identity, local password credential, session, refresh/session-family, role, admin local-user foundation, and bounded auth audit foundations. The current repository does not have MFA/passkey tables, recovery-code tables, WebAuthn challenge storage, TOTP secret storage, MFA/passkey endpoints, admin policy endpoints, OpenAPI MFA/passkey contracts, generated MFA/passkey clients, UI flows, or runtime MFA/passkey enforcement.

Day 1 product direction requires production-shaped WebAuthn/passkey support, authenticator-app TOTP, one-time recovery codes, and admin/security policy controls. SMS MFA is not a Day 1 default. Normal users may keep MFA optional unless policy requires it. Owners/admins should be required or strongly guided by default in server mode, especially before sensitive admin/security operations.

## Authority Boundaries

- API/domain auth services own policy evaluation, factor/challenge/recovery-code writes, session validity, step-up decisions, role-sensitive enforcement, and auth audit writes.
- Clients may display enrollment state, challenge prompts, policy readouts, and warnings, but clients must not decide authorization, MFA satisfaction, passkey eligibility, policy enforcement, or audit truth.
- Generated clients are transport helpers after future reviewed OpenAPI changes; generated-client availability must not imply permission.
- Workers must not mutate auth, credential, MFA, passkey, challenge, recovery-code, security-policy, session, role, or auth audit rows.
- OIDC providers may enforce their own MFA policy, but Settleora must represent provider assurance and capability carefully and must not store raw OIDC tokens or full provider payloads in ordinary auth/profile tables, audit metadata, logs, reports, or generated examples.
- Admin web is LAN/VPN/Cloudflare Access protected by default. Product policy may expose admin controls only after separate admin exposure and UI/reference gates.

## Policy Model

Future policy storage should represent security behavior explicitly and should be versioned. Names below are architecture vocabulary, not approved enum or schema names.

### Support Modes

- `disabled`: enrollment and challenge flows for the factor class are unavailable. Existing enrolled factors should not be silently deleted; later runtime must define whether they are ignored, preserved, or revoked.
- `optional`: eligible users may enroll and use MFA/passkeys, but normal account access does not require them.
- `required_for_admins`: owners/admins must enroll or satisfy an approved MFA/passkey requirement before sensitive admin/security operations, and possibly before normal server-mode access after a transition period.
- `required_for_all_users`: all eligible local accounts must enroll or satisfy policy before access continues, subject to safe transition and recovery rules.
- `policy_pending_enrollment`: a transition/readout state for accounts that are now in scope for a stricter policy but have not completed enrollment. Runtime should guide enrollment and avoid abrupt lockout unless a reviewed hard-enforcement date, bypass, or recovery path exists.

Policies should distinguish factor availability from enforcement. For example, passkeys may be optional while TOTP is required for owners/admins, or passkeys and TOTP may both be allowed as satisfying factors.

### Factor Types

- Passkeys/WebAuthn: allowed, optional, required, or disallowed by policy; usable as a phishing-resistant factor where platform and RP/origin checks pass.
- TOTP: allowed, optional, required, or disallowed by policy; TOTP secrets require an approved encrypted auth-secret boundary before runtime.
- Recovery codes: fallback verifiers for already enrolled accounts; generation and use must be controlled separately from ordinary MFA factor enrollment.
- Future factors: require separate design and policy approval before becoming Day 1 runtime. SMS MFA and email OTP are not Day 1 defaults.

### Account And Role Scope

- Local accounts: Settleora policy owns local MFA/passkey enrollment, enforcement, factor removal, recovery-code handling, challenge verification, session invalidation, and audit.
- OIDC accounts: the IdP may own primary MFA enforcement. Settleora may still record a bounded provider capability or assurance result, but it must not treat unverified provider claims as stronger assurance than the reviewed integration supports.
- Product owners/admins: default policy should require MFA/passkeys or blocking-warning enforcement before sensitive admin/security operations. No policy change may silently weaken owner/admin requirements.
- Ordinary users: MFA may be optional unless admin policy requires it for all users or selected sensitive operations.
- Group owners: group role alone does not equal system owner/admin. Group owner operations may need step-up later only where domain policy explicitly requires it.
- Role changes: assigning or removing `owner` or `admin` may trigger enrollment requirements, step-up, session review, or session revocation in later runtime design. These transitions must be audited.

### Safe Day 1 Defaults

- Least privilege and invite/admin-controlled account creation remain the safe baseline until public registration policy is separately implemented.
- Local account MFA/passkey policy defaults should avoid silent weakening, especially for owners/admins.
- Policy changes that reduce enforcement for owners/admins require explicit approval, a reason, visible audit, and ideally a fresh step-up by the actor making the change.
- New self-hosted deployments should guide the first owner toward enrolling at least one strong factor and recovery codes before broad admin use.
- Emergency/recovery options should exist before strict enforcement blocks access, but they must be narrow, reasoned, audited, and secret-free.

## Enrollment And Recovery Guardrails

- Users in scope for a stricter policy need a safe enrollment path before lockout. Runtime may use pending-enrollment grace, guided setup, or operation-specific step-up, but the API remains authoritative.
- Recovery-code generation, download, and display must show raw codes only once and must persist only salted/verifier hashes or equivalent one-time verifiers.
- Recovery-code use must consume exactly one code, prevent reuse, emit audit, and should trigger remaining-code reminders or rotation requirements in later flows.
- Factor removal, replacement, passkey revocation, TOTP rotation, and recovery-code regeneration require elevated checks such as fresh session/MFA, owner/admin authorization where applicable, and safe audit.
- Account recovery and admin reset operations require a reason code, actor and subject IDs, correlation ID, and audit. They must not expose TOTP seeds, raw recovery codes, passkey private material, raw tokens, or password material.
- Admin-initiated resets should prefer revoking/replacing factors and requiring re-enrollment over exposing existing secrets.
- When policy changes make an account non-compliant, runtime should define whether existing sessions remain usable, require step-up, are downgraded, or are revoked.

## Audit Coverage

Future auth audit must record security-impactful MFA/passkey actions inside API/domain auth boundaries. Event names below are examples; future implementation may use equivalent names if the category and metadata rules are preserved.

| Category | Example actions | Safe metadata examples |
| --- | --- | --- |
| Passkey enrollment | `passkey.enrollment_started`, `passkey.enrollment_completed`, `passkey.enrollment_failed`, `passkey.revoked` | actor account ID, subject account ID, factor type, opaque factor ID/key ID, outcome, reason code, policy version, request/correlation ID, coarse session/device reference |
| Passkey assertion | `passkey.challenge_succeeded`, `passkey.challenge_failed`, `passkey.replay_suspected`, `passkey.factor_mismatch` | subject account ID, opaque factor ID/key ID, challenge purpose, outcome, replay/failure category, policy version, request/correlation ID |
| TOTP enrollment | `totp.enrollment_started`, `totp.enrollment_verified`, `totp.enrollment_failed`, `totp.revoked` | actor account ID, subject account ID, opaque factor ID, outcome, reason code, policy version, request/correlation ID |
| Recovery codes | `recovery_codes.generated`, `recovery_codes.rotated`, `recovery_codes.used`, `recovery_codes.revoked` | actor account ID, subject account ID, opaque batch ID, used-count/remaining-count category, outcome, reason code, request/correlation ID |
| MFA challenge | `mfa.challenge_succeeded`, `mfa.challenge_failed`, `mfa.challenge_denied` | subject account ID, factor type, challenge purpose, outcome, failure category, coarse session reference, request/correlation ID |
| Step-up | `step_up.required`, `step_up.satisfied`, `step_up.failed` | actor account ID, operation category, policy version, freshness category, outcome, request/correlation ID |
| Policy lifecycle | `mfa_policy.created`, `mfa_policy.changed`, `mfa_policy.disabled`, `mfa_policy.admin_enforcement_changed` | actor account ID, policy ID/version, previous/new support mode category, affected role scope, approval reason code, request/correlation ID |
| Account recovery/admin reset | `account_recovery.started`, `account_recovery.completed`, `admin_factor_reset.performed`, `admin_recovery.denied` | actor account ID, subject account ID, reset/recovery category, factor type when applicable, reason code, outcome, request/correlation ID |

Safe metadata may include actor account/profile ID, subject account ID, factor type, opaque factor ID or key ID, outcome, reason code, policy version, request/correlation ID, coarse device/session reference, and timestamp.

Audit metadata must not contain:

- Plaintext passwords.
- Password hashes, verifiers, salts, derived material, or sensitive pepper details.
- Raw bearer, refresh, reset, session, challenge, or provider tokens.
- Raw recovery codes or reusable recovery material.
- TOTP seeds/secrets, otpauth URIs, or submitted TOTP codes.
- Passkey private material.
- Private attestation material or full authenticator/provider payloads.
- Full OIDC provider payloads, raw ID/access/refresh tokens, or unreviewed provider claims.
- Full request bodies or response bodies.
- Unnecessary IP/user-agent history beyond bounded policy.
- Storage paths, object keys, file bytes, or unrelated sensitive business data.

## Policy Change Approval And Visibility

- Policy changes that enable, disable, or change MFA/passkey enforcement must be visible in admin audit history and should show the current policy version and effective scope.
- Weakening owner/admin enforcement, disabling all MFA/passkey support, bypassing recovery requirements, or changing recovery/admin reset rules requires elevated checks and a reason category.
- Future runtime should reject policy changes that would immediately lock out all owners/admins unless an approved emergency path remains.
- Policy changes should record old and new mode categories, affected role/account scope, actor, reason code, timestamp, and correlation ID without copying full policy blobs when unnecessary.
- Admin UI/readouts remain future work, but API/domain audit must be sufficient for later admin audit viewing and export without relying on client-only state.

## Future API And Schema Prerequisites

Before #414/#415 OpenAPI contracts or runtime implementation:

- Schema/storage design for passkey, TOTP, recovery-code, challenge, and policy material must be reviewed and approved.
- TOTP secret storage must use an approved encrypted auth-secret, envelope-encryption, or vault boundary with rotation and operational recovery behavior.
- Recovery codes must be display-once and persisted only as one-time salted/verifier hashes.
- WebAuthn and MFA challenge issuance/verification must be short-lived, single-use, replay-rejected, origin/RP-bound where applicable, rate-limited, and free of raw secret persistence.
- Session invalidation, step-up freshness, session-risk behavior, and policy-invalid session handling must be designed before enforcement.
- Audit writes must happen in API/domain auth boundaries and must be validated for secret redaction.
- OpenAPI changes must be explicit in future tasks. Generated clients may change only after OpenAPI changes and validation.
- UI/reference work, including mobile/user web/admin policy screens, remains separate and must not be inferred from this document.

## Non-goals

This document does not implement or authorize:

- Migrations or schema changes.
- EF entities or runtime persistence.
- Login, session, refresh, current-user, or auth middleware changes.
- MFA/passkey/recovery-code endpoints.
- Admin policy endpoints.
- OpenAPI changes.
- Generated-client changes.
- Mobile, user web, admin web, or Figma work.
- OIDC integration runtime.
- Notification, email, or push behavior.
- Production secrets, config, Docker, CI, deployment, or environment changes.
- Runtime weakening or strengthening of current auth/session/security behavior.

## Next Implementation Candidates

- #414 passkey/WebAuthn API contract after schema, challenge, audit-redaction, and session/step-up prerequisites are reviewed.
- #415 TOTP MFA and recovery-code API contract after secret-storage, recovery-code verifier, challenge, audit-redaction, and session/step-up prerequisites are reviewed.
- Later schema/migration and runtime implementation only after explicit auth/security, schema/migration, OpenAPI/generated-client, validation, and UI/reference gates.
