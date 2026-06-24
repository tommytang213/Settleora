# Auth MFA And Passkey Architecture

This document defines the Day 1 architecture and schema-design breakdown for passkeys, TOTP MFA, recovery codes, challenge ceremonies, policy hooks, and auth audit hooks. It is a planning/control document for GitHub issue #413. It does not implement runtime behavior, approve migrations, add OpenAPI paths, regenerate clients, add UI, create secrets, or change session/auth middleware.

## Current State

The current repository already has auth identity, local password credential, session, refresh/session-family, role, and auth audit foundations:

- `auth_accounts` is the server-side auth account root and links to exactly one `user_profiles` row.
- `auth_identities` stores local or OIDC-style provider identity links without raw provider tokens.
- `system_role_assignments` stores product-level `owner`, `admin`, and `user` roles separately from group membership.
- `local_password_credentials` stores local password verifier metadata linked to `auth_accounts`; it stores no plaintext passwords, reset tokens, recovery codes, passkeys, or MFA secrets.
- `auth_sessions`, `auth_session_families`, and `auth_refresh_credentials` store server-authoritative session and refresh-continuity state with token hashes only.
- `auth_audit_events` stores bounded secret-free auth audit metadata.
- Public auth/session runtime currently includes first-owner bootstrap status/local-owner creation, local sign-in, refresh, current-user/current-session summaries, sign-out, sign-out-all, current-account session list, and current-account session revocation.
- The `SettleoraSession` bearer scheme validates opaque server-side sessions, and protected handlers consume a server-derived current actor/profile boundary.
- Guarded admin local-user foundation endpoints can create normal local users for owners/admins; they are not public self-registration or invitation flows.

The current repo does not have MFA/passkey tables, reset-token tables, recovery-code tables, WebAuthn ceremony tables, TOTP factor tables, public MFA/passkey endpoints, token issuance beyond the current local sign-in/refresh/session shell, new session middleware for MFA, OpenAPI MFA/passkey paths, generated-client MFA/passkey output, or UI behavior unless a future task explicitly adds them. Existing OpenAPI auth paths cover the current auth/session shell; this task does not change them.

## Authority Boundaries

Passkey and MFA work must stay inside the auth account boundary, not app-domain profile state.

- API/domain auth services own credential, factor, session, challenge, role, audit, and security-policy writes.
- Factor records bind to `auth_accounts`, not `user_profiles`; profile data may be displayed to users but must not prove authentication or authorization.
- Clients may render enrollment/challenge flows and cache display state, but clients never decide authorization from cached state, hidden UI, route visibility, local factor flags, or generated-client availability.
- Workers must not mutate auth, credential, MFA, passkey, session, role, security-policy, challenge, recovery-code, or auth audit tables.
- OpenAPI/generated clients are transport boundaries only when future contract tasks approve them; they do not grant permission.
- Audit writes belong in API/domain auth services and must avoid raw secrets, raw tokens, plaintext passwords, password verifiers, recovery codes, TOTP seeds, passkey private material, sensitive provider payloads, full request bodies, and unbounded device/network data.

## Factor Model

Day 1 factor design should support these factor families without making every family runtime scope in this document:

- Passkey/WebAuthn factors: account-bound public-key credentials where Settleora stores provider-neutral public credential material and replay metadata. Passkey private keys never touch Settleora server storage.
- TOTP factors: authenticator-app factors backed by a protected shared-secret storage boundary. TOTP secrets must not be plaintext ordinary columns.
- Recovery codes: random one-time fallback verifiers displayed once at generation time and stored only as hashes/verifiers after display.
- Future extensible factor types: the factor model should leave room for later approved factor types without approving SMS or email OTP as Day 1 defaults. SMS MFA is explicitly not Day 1.

Factor lifecycle state should be explicit. Candidate states include `pending`, `enrolled`, `disabled`, and `revoked`; implementation may use equivalent names if the state transitions remain clear. Pending factors are not authentication authority until verified and enabled. Disabled factors are preserved for review or re-enable policy where allowed. Revoked factors must not authenticate and should retain safe revocation metadata according to retention policy.

An account may have multiple factors. Policy later decides when at least one factor is required, which factor types are allowed, whether owners/admins must enroll, whether normal users are optional, and what step-up contexts require a fresh challenge.

## Schema-Design Categories

The categories below are candidate table/entity areas only. They are not migration approval, table-name approval, or runtime scope.

### Passkey Credentials

Passkey credential records should be auth-owned and linked to `auth_accounts`.

Candidate fields:

- Stable primary key and owning `auth_account_id`.
- Credential ID lookup strategy, preferably a hash or deterministic lookup value that supports unique lookup without exposing raw credential IDs unnecessarily.
- Public key material in the format required by the selected WebAuthn library.
- User handle reference or account-bound handle value that does not move authority to `user_profiles`.
- Signature counter or equivalent replay metadata, including support for authenticators where counters are absent, global, or backup-synced.
- Display label, user-visible device name, and optional normalized authenticator metadata safe for account settings.
- Safe transport hints and backup eligibility/state flags where retained and where not sensitive.
- Optional bounded attestation metadata or attestation policy result. Store only what Day 1 policy actually needs; avoid full attestation payload retention by default.
- Status, created, enrolled/verified, last-used, disabled, revoked, updated, and optional last-replay-suspected timestamps.
- Revocation or disablement reason category and actor/correlation metadata where safe.

Passkey records must not store passkey private keys, raw challenge secrets, raw assertion responses beyond short-lived ceremony validation needs, sensitive platform payloads, or full device fingerprints.

### TOTP Factors

TOTP factor records should be auth-owned and linked to `auth_accounts`.

Candidate fields:

- Stable primary key and owning `auth_account_id`.
- Protected shared-secret reference or encrypted secret payload handled by an approved auth-secret, envelope-encryption, or vault boundary before runtime implementation.
- Issuer and account label metadata used to produce enrollment display values.
- Algorithm, digits, period, and policy version metadata.
- Status, created, pending enrollment, verified/enabled, last-used, disabled, revoked, rotated, and updated timestamps.
- Rotation/revocation reason categories and actor/correlation metadata where safe.

TOTP records must not store shared secrets as plaintext ordinary columns, logs, metrics, traces, audit metadata, examples, committed appsettings, or reports. Runtime implementation must first define the approved secret-storage boundary and operational rotation behavior.

### Recovery Codes

Recovery-code storage should separate batch lifecycle from individual one-time verifier rows.

Candidate batch fields:

- Stable batch key and owning `auth_account_id`.
- Policy version, generated timestamp, generated-by actor category, displayed-once marker, revoked/replaced timestamp, and active/replaced/revoked status.
- Count metadata such as total generated, remaining unused, used count, and batch version.

Candidate code fields:

- Stable code row key and batch/account link.
- Salted hash or verifier material only; never raw recovery code text after first display.
- Status, generated, used, revoked, replaced, and updated timestamps.
- Safe use context such as correlation ID, session/challenge reference, and reason category.

Recovery codes must be random, one-time, display-once, and regenerated through an explicit flow that revokes or replaces prior unused codes according to policy.

### Challenge And Ceremony Records

Challenge/ceremony records may be needed for WebAuthn enrollment, WebAuthn assertion, TOTP enrollment verification, sign-in MFA challenges, step-up challenges, and recovery-code use.

Candidate fields:

- Stable challenge ID and owning `auth_account_id` where known.
- Challenge purpose, factor type, ceremony state, and correlation/request ID.
- Short expiry timestamp, consumed timestamp, failed/blocked timestamp, and replay-detected timestamp.
- Hash or verifier for challenge material where persistence is required; do not store reusable raw challenge secrets.
- Bound origin/RP ID/client context where WebAuthn validation requires it, keeping metadata bounded.
- Optional factor ID link for existing-factor challenges.
- Attempt count, safe failure category, rate-limit/lockout correlation, and status.

Challenge state must be short-lived, single-use, replay-rejected, and cleaned up by a retention policy. Raw challenge secrets/tokens must not appear in logs, API responses, metrics, traces, generated examples, audit metadata, or long-lived rows.

### Policy And Configuration Hooks

Future #416 work needs policy/config hooks for:

- Enabling/disabling passkey enrollment.
- Enabling/disabling TOTP enrollment.
- Enabling/disabling recovery codes.
- Requiring MFA for owners/admins, normal users, or selected sensitive operations.
- Requiring passkey-only, TOTP-only, either-factor, or multiple-factor policies where explicitly approved.
- Owner/admin guided setup versus hard enforcement before sensitive admin/security operations.
- Recovery-code regeneration and minimum remaining-code warning policy.
- Challenge expiry, retry limits, rate limits, lockout dependencies, and session freshness requirements.
- Policy versioning and audit on every security-impacting policy change.

Persisted policy should represent product/security behavior. Deployment secrets, cryptographic keys, and environment-specific secret-provider configuration must stay outside source control and ordinary policy rows.

### Audit Hooks

Future #416 work also needs audit action coverage for:

- Factor enrollment start, verification, enablement, failure, disablement, and revocation.
- Passkey assertion success/failure and replay/suspicious counter events.
- TOTP challenge success/failure and enrollment verification failure.
- Recovery-code batch generation, one-time display completion where safe, use success/failure, regeneration, replacement, and revocation.
- Policy enablement, enforcement-level changes, bypass/override, and admin override.
- Account disablement, role changes affecting MFA requirements, and session revocation due to factor or policy changes.
- Challenge expiry, replay rejection, rate-limit/lockout interactions, and suspicious activity.

Audit metadata may include action, outcome, actor account or system actor, subject account, safe factor type, factor/challenge/recovery batch IDs, policy version, reason category, timestamp, and correlation ID. Audit metadata must not contain raw secrets, raw codes, raw challenges, tokens, passwords, TOTP seeds, passkey private material, or sensitive provider payloads.

## Sensitive Data Handling

MFA/passkey runtime work is blocked until sensitive-data boundaries are explicit.

- Passkey private keys never touch Settleora server storage.
- Passkey public keys and credential metadata are security material and must be bounded, access-controlled, and secret-free in logs/audit.
- TOTP shared secrets must not be stored as plaintext in ordinary columns. Runtime implementation requires an approved secret/envelope/vault boundary, key-management story, rotation behavior, and validation coverage.
- Recovery codes must be generated with cryptographically secure randomness, shown once, and stored only as one-time verifiers/hashes after display.
- Raw challenge secrets, ceremony tokens, reset tokens, recovery codes, TOTP seeds, session tokens, provider tokens, and passwords must not appear in logs, API responses, metrics, traces, generated examples, OpenAPI examples, audit metadata, CI logs, validation output, or Codex reports.
- Secrets must not be committed in `appsettings`, `.env`, examples, docs beyond safe placeholders, CI config, report files, or generated clients.

## Enrollment And Challenge Flows

These are design-level flow boundaries only. They do not define endpoint paths or response schemas; #414 and #415 own future API contract work.

### Passkey Enrollment

Start:

- Authenticated account requests passkey enrollment.
- API checks account status, session freshness, factor policy, rate limits, and enrollment eligibility.
- API creates a short-lived enrollment ceremony/challenge and returns only safe WebAuthn creation options.

Finish:

- Client returns the authenticator response to the API.
- API validates origin/RP ID, challenge, attestation policy, credential uniqueness, account binding, and replay constraints.
- API creates or activates the passkey credential only after successful validation and emits safe audit.
- Failed, expired, or replayed ceremonies do not create credentials and emit safe audit where policy allows.

### Passkey Assertion

Start:

- API creates a short-lived assertion challenge for sign-in, step-up, or factor verification.
- Challenge options are scoped to the account when known, or to discoverable credential policy where future sign-in design allows it.

Finish:

- API validates the authenticator response, challenge, account binding, signature, credential status, counter/replay metadata, origin/RP ID, and policy requirements.
- On success, API updates safe last-used/replay metadata and marks the sign-in or step-up challenge satisfied.
- Suspicious replay or counter regression is blocked or escalated according to policy and audited without raw assertion payloads.

### TOTP Enrollment

Start:

- Authenticated account requests TOTP enrollment.
- API checks policy, session freshness, and existing factor state.
- API creates a pending TOTP factor and protected shared secret through the approved secret boundary, then returns only the minimum enrollment display material needed by the client. The shared secret/URI must be treated as display-time sensitive material and not logged.

Verify/Enable:

- Client submits a TOTP code for the pending factor.
- API verifies against protected secret material, algorithm/digits/period metadata, time-window policy, replay policy, and rate limits.
- API enables the factor only after successful verification and emits safe audit.
- Failed verification leaves the factor pending or blocked according to policy.

### TOTP Challenge

- API creates or records a sign-in or step-up challenge that requires TOTP where policy demands it.
- Client submits a code.
- API verifies the code against active factor state, protected secret material, allowed drift, replay-prevention rules, rate limits, lockout state, and session/account status.
- Successful verification marks MFA satisfied for the current auth flow or session freshness window as defined by later session policy.

### Recovery Codes

Generation:

- Authenticated account requests recovery-code generation or regeneration.
- API checks session freshness and policy.
- API generates random codes, displays raw codes once, stores only verifiers/hashes, and records batch metadata.
- Regeneration replaces or revokes prior unused codes according to explicit policy.

Use:

- During sign-in or step-up recovery, client submits one code.
- API verifies against unused hashed/verifier records, consumes exactly one matching code, prevents reuse, and emits safe audit.
- Successful recovery may satisfy MFA for the current flow and should trigger a recommendation or requirement to regenerate codes if remaining count is low.

Revocation:

- User, admin, account disablement, factor reset, or policy change may revoke a recovery-code batch.
- Revocation must not reveal raw code values and should trigger session revocation where policy requires.

### Account And Session State After MFA

After successful MFA, the API should record only server-authoritative state:

- Auth flow challenge satisfied for sign-in, step-up, or enrollment verification.
- Session MFA strength/freshness metadata where later session design approves it.
- Factor last-used or recovery-code consumed timestamps.
- Audit event with safe factor type, outcome, and correlation ID.

Clients may display a post-success state, but the API remains authoritative for whether a session is authenticated, MFA-satisfied, fresh enough for sensitive operations, revoked, expired, or policy-invalid.

Expiry, replay protection, rate limiting, and lockout are dependencies of runtime implementation. They must be designed with the existing sign-in abuse policy and future #416 policy/audit coverage before endpoint work starts.

## Dependencies And Sequencing

#413 is the architecture/schema-design breakdown for later work. It should unblock or inform:

- #414 passkey/WebAuthn enrollment, assertion, listing, and revocation API contract.
- #415 TOTP MFA enrollment, challenge, recovery-code generation/use/regeneration/revocation API contract.
- #416 admin MFA/passkey policy and auth audit coverage.
- #417 UI/reference work for enrollment, challenge, recovery, settings, and admin policy flows.

Sequencing constraints:

- No API/OpenAPI/generated-client work is included in #413.
- No UI/Figma work is included in #413.
- No schema migration is included in #413.
- No runtime auth/session/security behavior change is included in #413.
- Runtime/session/auth middleware work remains blocked on explicit manual auth/security gates, schema/migration review, OpenAPI/generated-client review, audit-redaction review, validation scope, and UI/reference gates where applicable.

## Non-goals

This document does not authorize:

- Runtime MFA/passkey implementation.
- Database migrations or EF model changes.
- OpenAPI path or schema changes.
- Generated web or Dart client changes.
- UI, mobile, web, admin, or Figma work.
- Credential, challenge, token, recovery-code, TOTP secret, or passkey generation in runtime code.
- Session middleware, current-user, token issuance, refresh, sign-in, or authorization runtime changes.
- Secrets, config, environment, deployment, Docker, CI, or appsettings changes.
- Edits to `docs/design/mobile/*`.
- SMS MFA or email OTP as a Day 1 default.

## Future Implementation Candidates

Good next implementation-planning candidates are:

- #414 passkey/WebAuthn API contract for enrollment start/finish, assertion start/finish, credential listing, credential label update if needed, and revocation.
- #415 TOTP MFA/recovery-code API contract for enrollment start/verify/enable, challenge verification, recovery-code generation/use/regeneration/revocation, and stable error shapes.
- #416 admin MFA/passkey policy and auth audit coverage for availability, enforcement, owner/admin defaults, step-up contexts, override behavior, retention, and audit redaction.
- Later schema/migration implementation after explicit schema review and secret-storage approval.
- Later runtime/session/auth middleware work only after explicit manual security gates and validation planning.
