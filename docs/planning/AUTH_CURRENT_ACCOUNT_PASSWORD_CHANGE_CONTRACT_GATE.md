# Auth Current-Account Password Change Contract Gate

Status: `BLOCKED_PENDING_MANUAL_DECISIONS` for runtime implementation.

This is a docs/planning contract gate for the first future current-account
local-password change API slice. It does not implement runtime behavior, change
OpenAPI, regenerate clients, add migrations, or authorize password reset,
recovery, invitation, registration, admin reset, UI, notification, or session
runtime changes.

## Current Repo Basis

- First-owner local bootstrap, local sign-in, refresh, current-user,
  current-session sign-out, current-account sign-out-all, current-account
  session list/revocation, guarded self profile/payment endpoints, and guarded
  admin local-user list/read/create exist in runtime and OpenAPI.
- The `SettleoraSession` bearer scheme validates opaque session tokens through
  the API auth/session runtime boundary, and protected endpoints derive current
  auth account, user profile, and session server-side.
- The internal credential workflow service can create and verify local password
  credentials and can rehash after successful verification.
- Local password credentials are account-scoped with one credential row per auth
  account in the current schema direction.
- Password change, password reset, password recovery, admin reset/change, and
  password/account-management UI are not implemented.

## Recommended API Contract

Future route:

- Method/path: `POST /api/v1/auth/password/change`
- Operation ID: `changeCurrentAccountPassword`
- Auth: `SessionBearerAuth` required.
- Purpose: change the authenticated current account's local password after
  verifying the submitted current password.

This route is intentionally under `/api/v1/auth` rather than under
`/api/v1/admin/users` or `/api/v1/users/me/profile` because it changes
credential security state, not app-domain profile data and not admin-managed
user metadata.

The endpoint must not accept account IDs, user profile IDs, auth session IDs,
local identifiers, provider identifiers, role fields, policy flags, revocation
targets, notification targets, or audit metadata from the client. The current
auth account, profile, and session must be resolved only from the validated
bearer session and server-side auth boundaries.

## Request Shape

Future request schema: `CurrentAccountPasswordChangeRequest`.

Required fields:

- `currentPassword`: string, write-only input, required.
- `newPassword`: string, write-only input, required.

No optional session/device metadata should be included in the first slice. The
current session already carries server-owned bounded metadata, and adding client
metadata to this endpoint would create another sensitive input surface without a
clear need. If a later policy needs a password-change reason, device label, or
reauthentication context, it should be a separate reviewed contract change.

Validation posture:

- Reject unsupported JSON fields with the same strict request posture used by
  auth endpoints that reject unsupported input.
- Apply the approved password policy to `newPassword` inside the API/domain
  auth boundary.
- Do not log, echo, audit, trace, metric, or return either password.

## Response And Error Posture

Recommended success response:

- `204 No Content`

The success response should not return password material, verifier metadata,
credential IDs, account IDs, profile IDs, session tokens, refresh credentials,
audit metadata, policy internals, or revocation counts. Clients that need fresh
session display state can re-fetch `GET /api/v1/auth/current-user` and
`GET /api/v1/auth/sessions`.

Recommended public error mapping:

| HTTP status | Public meaning | Notes |
| --- | --- | --- |
| `400` | Invalid request or unsupported fields. | Includes missing fields, same-password policy rejection if approved, or new-password policy failure without exposing verifier details. |
| `401` | Authentication is required or current-password verification failed. | Missing/invalid bearer session and wrong current password should remain generic enough to avoid credential-state leakage. |
| `409` | Password change cannot be completed for the current auth state. | Use only if manual policy approves a distinct safe conflict for unavailable local password credential, provider-only account, disabled credential, or concurrent credential change. Otherwise map to `401` or a generic failure. |
| `429` | Too many password-change attempts. | Only if a reviewed password-change abuse policy is implemented. |
| `500` | Password change could not be completed. | Persistence, hashing, or audit transaction failures must not expose internals. |

Public problem responses must not reveal whether the account has a local
credential, whether the submitted current password matched, verifier status,
hashing algorithm, work factor, policy counters, account identifiers, or session
ownership hints.

## Credential Workflow Requirements

The runtime slice must verify the submitted current password through the
existing credential workflow boundary or a narrowly extended API/domain auth
service that preserves the same responsibilities:

- Resolve the current auth account server-side from the validated bearer
  session.
- Load and verify only the active local password credential for that account.
- Treat missing, disabled, revoked, malformed, unsupported, provider-only, or
  policy-denied credential state as safe public failure.
- Create or update the replacement password verifier only inside the
  API/domain auth service boundary.
- Use the approved password hashing service and policy for the new verifier.
- Preserve the one-active-local-password-credential policy unless a separate
  migration/design explicitly changes credential history.
- Use a transaction for successful current-password verification, verifier
  replacement, audit writes, and required session revocation side effects where
  the future implementation can do so safely.
- Never expose plaintext passwords, verifier strings, password hashes, salts,
  pepper secrets, pepper lookup details, derived key material, reset tokens,
  recovery codes, raw session tokens, refresh credentials, or token hashes.

## Session Revocation Policy Recommendation

Default recommendation for the first runtime slice:

- Keep the current validated session active after successful password change.
- Revoke all other active sessions for the same auth account by default with a
  bounded reason such as `password_changed`.
- Do not accept revocation policy, target sessions, or session IDs in the
  request body.
- Do not return a revocation count in the response.

Rationale: the current session has just proven possession of the old password
and a valid bearer session, while revoking other sessions reduces exposure from
lost devices or previously issued credentials. Keeping the current session
avoids returning new token material and keeps the first slice smaller than
session rotation.

If later deployments need configurability, represent it as server-owned auth
security policy, not request input. A future policy enum can be reviewed with
values such as:

- `keep_current_revoke_others` as the recommended default.
- `revoke_all_require_sign_in` for stricter deployments.
- `rotate_current_revoke_others` only after session rotation response shape and
  refresh credential behavior are explicitly designed.
- `keep_all_sessions` only if manual security review approves the weaker
  posture.

Any policy that rotates or revokes the current session must also define whether
fresh access/refresh credentials are returned, whether the client must sign in
again, and how refresh/session-family state is revoked.

## Audit Requirements

Runtime must write bounded safe auth audit events for:

- Current-password verification outcome for this workflow.
- Password changed after successful verifier replacement.
- Other-session revocation side effects, including a safe reason category.
- Operational failure categories where security investigation requires them.

Recommended audit metadata:

- workflow name, such as `current_account_password_change`.
- actor auth account ID and current auth session ID where safely available.
- subject auth account ID, and credential/session subjects where existing audit
  schema supports them.
- outcome category.
- password policy version or algorithm family only if already considered
  non-secret by the credential workflow boundary.
- session revocation policy category and safe count only if approved for audit.
- bounded current-session metadata already available to auth/session audit, such
  as device label category or correlation/request ID.

Audit metadata must not include request bodies, local identifiers, emails,
plaintext passwords, password hashes, verifier strings, salts, pepper secrets,
raw tokens, token hashes, refresh credentials, provider payloads, unbounded IP
addresses, unbounded user-agent values, or unrelated profile/business data.

## Notification Recommendation

Password change is a security-impactful event and should eventually create a
user-facing security notification. The first password-change runtime slice
should not create in-app, email, push, or external-provider notifications unless
a separate notification/security gate explicitly approves:

- event key and subject/target shape,
- recipient and self-notification rule,
- required versus preference-suppressible behavior,
- safe in-app content,
- email/push snippet redaction,
- provider disabled/unconfigured behavior,
- OpenAPI/generated-client effects, and
- notification/audit correlation rules.

Until that gate exists, notification behavior remains
`BLOCKED_PENDING_MANUAL_DECISIONS`; auth audit remains the source of security
evidence.

## OpenAPI And Generated-Client Impact

The future runtime slice should include a reviewed OpenAPI change for the new
path and request schema, followed by generated web and Dart client refresh.

Rules:

- `packages/contracts/openapi/settleora.v1.yaml` is the source of truth.
- Generated clients under `packages/client-web/src/generated/` and
  `packages/client-dart/lib/generated/` must not be hand-edited.
- After the approved OpenAPI change, run `npm run generate:clients` and review
  only generated diffs produced by that command.
- Generated client availability does not authorize the operation; the API must
  enforce bearer auth, current-account resolution, credential verification,
  session revocation policy, and audit.

This planning gate intentionally makes no OpenAPI or generated-client change.

## Validation Plan For Future Runtime Slice

Minimum future validation should include:

- API endpoint tests for successful current-account password change.
- API tests that old password no longer works and new password can sign in.
- Negative tests for missing bearer session, invalid bearer session, wrong
  current password, missing fields, unsupported fields, weak/invalid new
  password, provider-only or missing local credential if representable, disabled
  account/credential, and concurrent/stale credential change.
- Tests proving no client-submitted account/user/profile/session IDs are
  accepted or trusted.
- Tests proving current account/profile/session are resolved server-side.
- Tests proving current session remains active under the approved default.
- Tests proving all other sessions for the account are revoked, unrelated
  accounts' sessions are untouched, and refresh/session-family state follows the
  approved revocation policy.
- Audit tests for verification outcome, password changed, revocation side
  effects, safe metadata, and forbidden-data redaction.
- OpenAPI validation with `npm run validate:openapi`.
- Generated-client refresh and validation with `npm run generate:clients` and
  `npm run validate:clients`.
- API validation with focused auth tests during development and broader
  `npm run validate:api-local` or the repo-approved API validation profile
  before merge.

## Manual Decisions Still Needed

Runtime remains blocked until manual auth/security review approves:

- Final route and operation ID.
- Final public error mapping, including whether a distinct `409` is safe.
- New-password policy requirements and same-password handling.
- Whether password-change attempt throttling is required for the first slice.
- Final session revocation policy and current-session behavior.
- Whether refresh/session-family rows are revoked together with other access
  sessions and exactly how that is represented.
- Final audit action names, subject mapping, outcome categories, and safe
  metadata.
- Whether user-facing security notification behavior is included now or remains
  a later gate.
- OpenAPI/generated-client review scope and validation commands.
- Whether any schema/migration change is required; the preferred first slice
  should avoid one unless implementation proves the current credential schema is
  insufficient.

## Explicit Non-Goals

This gate does not authorize:

- Runtime endpoint implementation.
- OpenAPI changes.
- Generated-client changes.
- EF migrations or schema changes.
- Auth/session middleware changes.
- Direct credential table mutation from endpoint handlers.
- Password reset, password recovery, recovery codes, invitation acceptance,
  public registration, admin password reset/change, or first-owner recovery.
- Mobile, web, or admin UI.
- Notification runtime.
- Secrets, config, deployment, Docker, CI, CodeMagic, TestFlight, or signing
  changes.
- Money, settlement, payment, bill, storage, OCR, sync, import/export, backup,
  restore, reconciliation, or notification provider behavior changes.

## Issue, Project, And Ledger Posture

`docs/planning/ISSUE_PROGRESS_LEDGER.md` was checked before this gate. The only
narrow predecessor is the merged auth password/account-management decision
packet from PR #727, and the broad linked GitHub issue found during this task is
the open auth/session/runtime security epic #336. This gate does not complete
that epic or any runtime close rule.

No issue, Project, or ledger update is required for this docs-only gate because
it does not change issue state, runtime capability, Project status, or a merged
PR checkpoint. A future runtime PR should update the ledger only if it changes a
linked issue's close posture or could otherwise be misread as completing broader
password reset/recovery/account-management scope.
