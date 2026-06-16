# Current Milestone

- ID: `M11`
- Name: `Day 1 Mobile Account Session And Device Management Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M10`

## Goal

Advance the next Day 1 blocker after the finalized M10 mobile self profile/payment-details checkpoint by hardening the existing mobile account session and device management surface. M11 is intentionally mobile and account/session UX focused: it improves state reconciliation, session/device safe metadata readout, per-session revoke behavior, current-session sign-out and account-wide sign-out handling, expired-session and refresh failure states, and QA coverage while preserving backend authority for authentication, authorization, session issuance, refresh rotation, revocation, credential policy, audit, and current actor/profile resolution.

Repo-state basis for this milestone:

- `README.md` says the mobile app has first-launch local/server configuration, secure-storage-backed app/session state boundaries, a minimal authenticated server-mode shell with refresh, logout, session list, and per-session revocation.
- `docs/prd/MVP_DAY1_SCOPE.md` requires user registration/login, secure sessions and revocation-ready session model, device/session visibility, API-enforced role and permission checks, and audit boundaries for security-impactful events.
- `docs/features/auth-session/FUNCTIONAL_SPEC.md` requires users to understand active sessions/devices, revoke sessions, sign out, use local-only mode without server auth, and see only safe own-session metadata.
- `docs/features/auth-session/TECHNICAL_SPEC.md` keeps auth/session/credential/audit writes API-owned and forbids raw tokens, password material, provider secrets, and MFA/passkey secrets from logs, audit, or responses.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records the existing mobile auth/session lifecycle shell, secure app/session storage boundary, refresh-aware access-token lookup, current-session logout, account-wide sign-out, session/device list, and per-session revocation.
- Current mobile code under `apps/mobile/lib/app/` and focused tests under `apps/mobile/test/auth_session_repository_test.dart`, `apps/mobile/test/secure_storage_test.dart`, and `apps/mobile/test/widget_test.dart` provide bounded seams for mobile-only account/session UX hardening without requiring API, contract, generated-client, schema, credential, token-policy, audit-policy, storage/privacy, money, deployment, or unrelated-domain changes.

## Allowed Scope For Future M11 Tasks

- Mobile auth/session repository mapping, secure session material handling, access-token refresh seam, first-launch/sign-in state, authenticated server shell sign-out/session-list routing, session/device list UI, per-session revoke UI, and bounded session failure copy in `apps/mobile/lib/app/`.
- Focused mobile tests for auth repository mapping, secure storage/access-token provider behavior, app bootstrap/sign-in/session-expired states, session list, per-session revoke, sign-out-all, server-unreachable local-clear confirmation, duplicate-action prevention, safe failure/retry states, and unsafe token/session/credential suppression in `apps/mobile/test/`.
- M11 QA map and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M11 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration changes outside existing mobile presentation and secure-storage seams.
- Token issuance, refresh rotation policy, revocation semantics, password handling, OIDC/Keycloak, MFA, passkey, recovery, registration policy, admin user management, credential storage, or audit-policy changes.
- Database schema/migrations.
- Storage/file privacy policy, file authorization policy, QR/proof/receipt byte behavior, generic public file APIs, or private-vault behavior.
- Client-side authorization decisions from cached profile/session rows, hidden UI controls, route state, generated-client availability, or local device labels.
- Money, bill, settlement, residual, balance, reconciliation, recurring generation, OCR apply, or business status-transition authority.
- CSV import/export, backup/restore, direct bank sync, provider integrations, statement import/matching, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain work.
- Docker/deployment/env/CI config.
- Production secrets, credentials, tokens, `.env`, `.ssh`, `.codex`, or local auth/session config.
- Day 1 scope reduction or architecture direction replacement.

## Done Criteria

- Current mobile account/session implementation is reconciled against Day 1 account/session requirements and captured in a QA map.
- Session/device list readout preserves only safe server-returned metadata, current-session markers, status/timestamp labels, and bounded empty/failure states without exposing raw session IDs, tokens, refresh credentials, token hashes, auth account IDs, provider payloads, API paths, stack traces, secrets, or unrelated user data.
- Per-session revoke protects the current session, prevents duplicate revoke requests, confirms destructive account/session actions, refreshes or preserves safe state after mutation, and treats revocation as server-authoritative.
- Current-session sign-out, account-wide sign-out, server-unreachable local-clear confirmation, expired-session handling, and access-token refresh failures fail closed and keep token material hidden.
- M11 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M11 ends in a bounded controller stop state before backend/API, OpenAPI/contracts, generated clients, schema, credential/token policy, auth/session/security runtime, storage/privacy, money/settlement/bill/recurring/OCR authority, deployment, web/admin, broad offline sync/cache, import/export/backup, or unrelated major-domain work.

## Current Task Pointer

- Current task: `none`.
- Last completed task: `M11-004-MOBILE-ACCOUNT-SESSION-QA-FINALIZE-20260616-1315`.
- Current state: M11 is finalized as `Day 1 Mobile Account Session And Device Management Hardening` and is UI-test ready for deferred Day 1 acceptance review. M11-001 reconciled current account/session state, M11-002 hardened session/device list and per-session revoke behavior, M11-003 hardened current-session sign-out, account-wide sign-out, server-unreachable local clear, expired-session routing, and refresh fail-closed behavior, and M11-004 finalized QA/control state without runtime changes.
- Manual UI retest status: `deferred_until_day1_acceptance`; not passed by M11.
- Manual code review status: `deferred_until_day1_acceptance`; not passed by M11.
- Recommended next automated task: run the user-requested post-M11 docs-only FX/currency/UX architecture task before the next normal implementation milestone, unless the controller reports a stricter blocker. This follow-up is not an M11 runtime task and does not authorize currency/FX docs edits inside M11.
- Stop sentinel: `STOP-M11-001` stops API/contracts/generated-client/auth/session/security runtime/schema/token/credential/password/OIDC/MFA/passkey/recovery/admin/audit-policy/storage/privacy/money/deployment/import/export/backup/web-admin/broad-sync/secrets/unrelated scope.

## M10 Carry-Forward Boundary

M10 is finalized as `Day 1 Mobile Self Profile And Payment Details Hardening` and remains awaiting deferred Day 1 acceptance review. M11 must not expand M10 ad hoc into payment-detail visibility policy changes, counterparty authorization changes, self QR upload/remove/content UX, platform file/image picker dependencies, image normalization, camera/gallery permissions, private-vault behavior, QR byte rendering, payment provider integrations, settlement-scoped payment-detail policy changes, web/admin runtime, broad offline sync/cache, or generated-client/API changes.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
