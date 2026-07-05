# Auth Password Reset And Recovery Policy Gate

## Purpose

This packet records the password reset, recovery, admin credential, and credential-creation policy gate that remains after PR #729. It is docs-only. It does not implement runtime code, schema, OpenAPI, generated clients, UI, notifications, deployment, auth config, or security enforcement.

## Current-state readback

- Verified repo baseline: `origin/main` at `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`, the PR #729 merge commit.
- PR #729 completed only the authenticated current-account password-change runtime slice:
  - `POST /api/v1/auth/password/change`;
  - request accepts only `currentPassword` and `newPassword`;
  - actor, account, profile, and session are derived from the validated bearer session;
  - success returns `204 No Content`;
  - current password verification and replacement verifier creation stay inside API auth credential workflow boundaries;
  - current bearer session remains active;
  - other active sessions and linked refresh families/credentials are revoked where supported;
  - OpenAPI and generated web/Dart clients were regenerated from the contract;
  - replacement hash-generation failure maps to generic `500 Password change failed`.
- GitHub #336 remains open as the broad auth/session/runtime security epic.
- GitHub #339 remains open for the broader Day 1 password reset and credential-change workflow.
- PR #729 does not complete password reset, first-owner recovery, break-glass recovery, admin reset/change, invitation/public-registration credential flows, password-change UI, user-facing security notifications, broader abuse/rate-limit policy, or final auth/security acceptance.

## Credential lifecycle lanes

### Current-account password change

Status: completed by PR #729 for authenticated local-account password change only.

This lane must not be reopened by stale #339 wording. Future tasks may add UI or security notification behavior for the completed endpoint, but they must not weaken its server-derived actor model, current-password verification, no-body success response, generated-client source-of-truth posture, or current-session/other-session revocation policy without an explicit auth/security gate.

### User-initiated password reset

Status: not implemented and not approved for runtime.

This lane covers an unauthenticated or partially authenticated user proving control over an approved recovery channel and setting a new local password. It needs anti-enumeration behavior, reset-token storage, expiry/replay handling, abuse controls, session revocation policy, audit behavior, notification behavior, provider readiness, and UI/Figma review before code.

### First-owner recovery / break-glass recovery

Status: not implemented and not approved for runtime.

This lane covers self-hosted operator lockout, especially where the first owner loses access and no other owner/admin can recover the deployment. It must be separate from ordinary public password reset because it can affect deployment control. It needs an explicit trust model, activation conditions, operator evidence, audit, rate limiting, and anti-abuse policy before any runtime work.

### Owner/admin-initiated password reset or change for another local user

Status: not implemented and not approved for runtime.

The current guarded admin local-user foundation can create normal local users but does not reset or change another user's password. Future admin credential actions require owner/admin authority checks, reason categories, target-account status checks, safe delivery or forced-change behavior, session revocation policy, audit, notification, and UI/Admin Web review.

### Invitation and public-registration credential creation

Status: not implemented and not approved for runtime.

This lane covers first credential setup after an invitation or intentional public self-registration. It is not password reset. It must preserve invite/public-registration policy, account enumeration resistance, account/profile binding, credential creation order, token/code storage, audit, and admin policy controls.

### OIDC, passkey, MFA, and recovery-code interactions

Status: adjacent but not a password-reset implementation.

The current repo contains MFA/passkey/recovery-code runtime and contract foundations, including recovery-code batches/verifiers for MFA challenges. Those are not password-reset tokens and do not create a general account password reset path. OIDC-owned passwords remain outside Settleora local-password reset authority unless a future provider-specific design explicitly says otherwise. MFA/passkey step-up or recovery-code use may become prerequisites for sensitive credential flows, but they must not be treated as automatically approving password reset, first-owner recovery, or admin reset behavior.

## Security decision table

| Lane | Recommended safe option | Rejected unsafe options | Blockers and manual decisions |
| --- | --- | --- | --- |
| User-initiated password reset | Uniform public response for submitted identifiers; short-lived one-time reset token stored only as a hash/verifier; token consumed atomically; generic expiry/replay responses; layered rate limits by source, identifier hash, combined bucket, and global backstop; reset delivery only through approved provider or admin-delivered flow; revoke all active sessions and refresh families after successful reset unless explicitly narrowed; write bounded audit for requested, issued, consumed, expired/replayed/denied, and sessions-revoked categories; user-facing security notification after approved notification event/target/redaction policy. | Public response that confirms account existence; raw reusable reset tokens in DB/logs/API/audit; long-lived reset links; reset without throttling; reset through unconfigured email; keeping compromised sessions active silently; client-side token validity decisions. | Decide delivery channel readiness: SMTP/email, in-app, admin-delivered out-of-band, or blocked. Decide expiry window, replay response, reset request throttles, session revocation breadth, notification behavior, Figma/UI copy, and OpenAPI paths. |
| First-owner / break-glass recovery | Treat as self-hosted emergency admin recovery, not public reset; require explicit deployment-local activation policy and operator evidence; use one-time short-lived hashed recovery material or offline/manual procedure; record high-visibility audit; revoke all account sessions after credential recovery; keep provider and UI behavior blocked until approved. | Hidden universal backdoor; environment variable or config password that works indefinitely; unaudited owner takeover; bypassing all owners/admins without policy; workers mutating auth tables. | Decide whether Day 1 supports runtime break-glass or remains manual/operator-runbook only. Decide who can trigger it, how first-owner absence/lockout is proven, whether email is required, whether admin web is involved, and how to avoid public exposure. |
| Owner/admin reset/change for another user | Authenticated system owner/admin endpoint only; server-derived actor; target local account only; reason category required; no plaintext temporary password in DB/logs/audit; prefer reset-initiation or forced-change credential bootstrap over admin knowing a user's long-term password; revoke target account sessions/refresh families after successful reset/change; audit actor and subject with bounded metadata; notify target user when approved. | Admin endpoint that accepts arbitrary account IDs without role checks; admin learns or stores reusable plaintext password; silent reset with no audit; reset OIDC/provider credentials from Settleora; reset that bypasses required MFA/freshness policy. | Decide whether admin may set a password directly, issue one-time setup material, or only trigger user reset. Decide owner/admin role boundary, fresh session/step-up requirement, notification, UI/Admin Web dependency, and OpenAPI impact. |
| Invitation credential creation | Invitation token/code is one-time, hashed, scoped, short-lived or explicitly expiring; public response is enumeration-resistant; credential creation happens only after invitation/account/profile policy passes; generated clients are transport only; audit invitation acceptance and credential creation. | Invitation links that create credentials after expiry/reuse; raw invite tokens in DB/logs/API; client-created account/profile authority; accepting invite without server-side policy checks. | Decide invite token storage, expiry, public response behavior, credential creation ordering, whether MFA/passkey setup is guided, UI/Figma, and notification/admin visibility. |
| Public registration credential creation | Disabled by default; enable only by admin/security policy with warnings and audit; uniform public responses where needed; rate limits; server-owned account/profile/credential creation; safe bootstrap away from first-owner path. | Broad public registration without abuse policy; global browse-all-users side effects; public endpoint that leaks existing local identifiers; generated-client availability treated as permission. | Decide admin toggle UX, warning copy, audit, abuse controls, identifier policy, OIDC/local-account interaction, and whether Day 1 public registration is blocked until admin UI exists. |
| OIDC/passkey/MFA interactions | Keep provider passwords outside Settleora local reset. Use MFA/passkey/recovery-code only as separately approved assurance/step-up/recovery inputs. Preserve raw secret redaction and short-lived challenge semantics. | Resetting IdP passwords from Settleora without provider design; using MFA recovery codes as password reset tokens; exposing TOTP seeds, recovery codes, passkey material, or challenge tokens. | Decide which sensitive credential flows require MFA/passkey step-up, how OIDC-only accounts recover, and whether MFA/passkey policy must ship before password reset/admin reset. |

Cross-lane minimums:

- Account enumeration: public unauthenticated flows must not reveal account, identity, credential, invite, reset-token, recovery-channel, or policy state.
- Storage: reset tokens, invite tokens, challenge material, and recovery material must be non-raw, hashed/verifier-backed, one-time, scoped, and short-lived where applicable.
- Expiry and replay: expired, consumed, revoked, unknown, wrong-account, and replayed material must map to safe generic public responses and bounded audit.
- Abuse controls: sign-in abuse policy concepts should be reused, but reset/invite/recovery need their own thresholds and possible provider throttles.
- Sessions: successful password reset or admin credential reset should revoke all active sessions and refresh families for the affected account by default. Any narrower behavior requires manual approval.
- Audit: audit must identify actor, subject, action, outcome, timestamp, request/correlation ID, and safe reason/status categories without raw secrets, reset tokens, recovery codes, password material, verifier strings, token hashes, full request bodies, raw identifiers, or unbounded IP/user-agent data.
- Authority: only API/domain auth services may mutate auth credential/session/reset/recovery/audit rows. Workers, clients, and generated clients are not authority.
- UI/Figma and notifications: user/admin UI and security notification behavior remain separate gates.

## Schema, API, and OpenAPI impact assessment

Current repo state at `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`:

- `local_password_credentials`, `auth_sessions`, `auth_session_families`, `auth_refresh_credentials`, and `auth_audit_events` exist.
- MFA/passkey/recovery-code runtime and contract foundations exist, including `auth_recovery_code_batches` and `auth_recovery_code_verifiers`.
- No general password-reset token table, first-owner/break-glass recovery table, admin reset ticket table, or invitation credential-token table was identified in this task.
- MFA recovery-code verifiers are not password-reset tokens. They must not be reused as a general password reset or owner recovery mechanism without a separate design.

Future schema classes likely include:

- password reset request/token rows with hashed one-time verifier material, subject account or unresolved identifier hash where safe, expiry, consumed/revoked/replayed state, delivery channel category, request/source buckets, and audit correlation;
- first-owner/break-glass recovery rows or an operator-runbook artifact model if runtime recovery is approved;
- admin reset/change request rows only if a multi-step admin flow, forced-change token, or delivery state needs persistence;
- invitation credential setup token rows if invitation runtime does not already provide a suitable one-time token boundary.

Likely future endpoint families, pending approval:

- user-initiated reset request, reset verification, and new-password completion;
- first-owner or break-glass recovery initiation/completion, or no endpoint if policy remains operator-runbook only;
- owner/admin target-user reset initiation or credential change;
- invitation acceptance or registration credential creation.

Path names are intentionally not finalized here. OpenAPI remains the source of truth, and generated clients must come only from `npm run generate:clients` after contract approval. Generated-client availability never grants authorization, proves reset-token validity, or moves credential authority out of the API.

## Smallest next runtime slice recommendation

Runtime remains blocked pending manual decisions.

Recommended proposed child issue title:

`Decide Day 1 local password reset delivery and token policy`

Allowed scope for that child gate:

- docs-only decision packet or issue-body checklist for the user-initiated local password reset lane;
- decide channel readiness, anti-enumeration response shape, token storage class, expiry, replay behavior, abuse controls, session revocation default, audit categories, notification dependency, UI/Figma dependency, and OpenAPI/manual gate requirements.

Non-goals:

- no runtime code;
- no schema/migration;
- no OpenAPI or generated clients;
- no email/push/in-app notification runtime;
- no UI;
- no admin reset, first-owner recovery, invitation, public registration, OIDC, MFA/passkey runtime changes.

Expected changed file categories:

- `docs/planning/**` and possibly `docs/architecture/**` only.

Expected validation:

- `git status --short`;
- `git diff --name-only origin/main...HEAD`;
- `git diff --check origin/main...HEAD`;
- `npm run validate:docs`.

Manual gates before implementation or merge of any runtime slice:

- product/trust decision on delivery channel and copy;
- auth/security approval of token storage, expiry, replay, rate limits, and session revocation behavior;
- notification approval if user-facing notification is included;
- UI/Figma approval before mobile/user/admin surfaces;
- schema/OpenAPI/generated-client approval if endpoint or persistence changes are included.

Close/keep-open posture:

- Keep #336 open.
- Keep #339 open.
- Do not burn #339 as complete from this packet or from PR #729.

## Unsafe shortcuts to reject

- Plaintext temporary passwords in databases, logs, API responses, validation output, reports, or auth audit metadata.
- Reversible password storage.
- Raw reusable reset tokens in databases.
- Broad public reset without abuse and enumeration policy.
- Admin reset that bypasses owner/admin authorization and server-derived actor checks.
- Reset flows that silently keep potentially compromised sessions active without a reviewed policy.
- UI or generated-client authority over credential validity, reset-token validity, account existence, or authorization.
- Workers mutating auth credential, reset, recovery, session, refresh, role, policy, or audit tables.
- Treating MFA recovery codes as password reset tokens.
- Resetting OIDC/provider-owned passwords through Settleora without a provider-specific design.

## Ledger posture

This packet materially updates the #336/#339 interpretation because the prior ledger checkpoint predates the PR #729 merge SHA and because current repo state includes MFA recovery-code tables that must not be confused with password-reset tables. A concise ledger checkpoint should record:

- verified repo SHA `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`;
- PR #729 completed current-account password change only;
- #336 and #339 remain open;
- reset/recovery/admin/invite/registration/UI/notification/abuse/final acceptance gates remain;
- runtime remains blocked pending manual decisions;
- no issue should be closed from this packet.
