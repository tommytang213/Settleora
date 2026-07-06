# Auth Local Password Reset Schema, OpenAPI, And Runtime Design Gate

## Purpose

This packet turns the approved Day 1 local-account password reset delivery and
token policy into an implementation-ready technical design direction. It is a
docs-only design gate. It does not implement runtime code, schema, migrations,
EF models, OpenAPI, generated clients, provider delivery, notification runtime,
UI, Figma assets, deployment behavior, secrets, auth config, or security
enforcement.

## Current-State Readback

- Verified repo baseline: `origin/main` at
  `a86be35a2c4be2cfc47294648282bdc5a39e90a5`, the PR #732 merge commit.
- PR #729 merged authenticated current-account local password change only at
  `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`.
- PR #730 merged the docs-only password reset and recovery policy gate at
  `0004b153b833fd9793df6102cc1b3ce3d0385002`.
- PR #731 merged the docs-only local password reset delivery/token policy gate
  at `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`.
- PR #732 merged Tommy's approved local reset delivery/token policy decision at
  `a86be35a2c4be2cfc47294648282bdc5a39e90a5`.
- GitHub #336 remains open as the broad auth/session/runtime security epic.
- GitHub #339 remains open and its Project status is `Needs Decision`.
- Current OpenAPI auth paths include first-owner bootstrap, local sign-in,
  refresh, authenticated current-account password change, sign-out,
  sign-out-all, current-account sessions, current-user/current-session reads,
  MFA/passkey/recovery-code foundations, and guarded admin local-user
  foundation endpoints. No password reset endpoint family exists.
- Current schema foundations include auth accounts, identities, local password
  credentials, sessions, session families, refresh credentials, and auth audit
  events. No general local password reset table or reset-token persistence
  model exists.

## Approved Policy Summary

The approved policy in
[AUTH_LOCAL_PASSWORD_RESET_TOKEN_POLICY_GATE.md](AUTH_LOCAL_PASSWORD_RESET_TOKEN_POLICY_GATE.md)
is the source for this design:

- local-account reset only;
- no Settleora reset for OIDC/provider-owned passwords;
- SMTP/email reset links only when the provider policy is configured, verified,
  and approved;
- no runtime forgotten-password endpoint without approved SMTP/email or
  separately approved admin-delivered recovery policy;
- admin-delivered reset material remains a separate later gate;
- uniform anti-enumeration-safe public responses;
- high-entropy one-time scoped hash/verifier-backed reset material with no raw
  storage;
- 60 minute default email-link expiry;
- owner/admin configurable email-link expiry from 15 to 120 minutes;
- 10 to 15 minute expiry for any future typed short-code or OTP flow;
- newer reset material revokes or replaces older outstanding material;
- account-wide active session and refresh/session-family revocation after
  successful reset by default;
- source, identifier, combined, global, and provider-send abuse buckets;
- no initial `Retry-After`;
- bounded secret-free audit;
- separate notification event/target/redaction gate;
- separate UI/Figma/product copy gate;
- separate schema/OpenAPI/generated-client/runtime implementation gate.

This design packet answers the technical questions for the next implementation
slices. It does not close #336 or #339.

## Proposed Persistence Model

Candidate table/entity name: `auth_password_reset_requests`.

Alternative names to review later: `local_password_reset_requests` or
`auth_local_password_reset_material`. The final name should live in the auth
domain and avoid implying support for OIDC/provider password recovery.

Required candidate columns/properties:

- `id`: stable server-generated identifier for internal lookup and audit
  correlation.
- `purpose`: bounded value such as `local_password_reset`.
- `status`: bounded state, initially `pending`, `consumed`, `expired`,
  `revoked`, or `suspicious_replay`.
- `auth_account_id`: nullable FK to `auth_accounts`, set only when an eligible
  local auth account is resolved internally.
- `local_password_credential_id`: nullable FK to the credential row active at
  issuance time, if useful for detecting stale material after credential
  replacement.
- `reset_material_hash`: required only for issued material; a purpose-bound
  keyed digest or verifier-backed lookup value. This must never be a raw token,
  raw code, reset URL, or reversible encrypted token.
- `reset_material_hash_version`: non-secret hash/verifier policy version.
- `reset_material_scope`: bounded value such as `email_link` or future
  `typed_code`.
- `issued_at_utc`, `expires_at_utc`, `consumed_at_utc`, `revoked_at_utc`,
  `replaced_at_utc`, `suspicious_replay_at_utc`, `last_checked_at_utc`.
- `replaced_by_reset_request_id`: nullable self-reference when newer material
  supersedes older material.
- `revocation_reason`: bounded category such as `replaced_by_newer_material`,
  `successful_reset`, `policy_blocked`, `account_disabled`,
  `provider_unavailable`, or `cleanup_expired`.
- `delivery_category`: bounded value such as `email_link`,
  `admin_delivered_future_gate`, `provider_skipped`, or
  `provider_unavailable`.
- `provider_send_category`: bounded value such as `not_attempted`,
  `queued_or_sent`, `skipped_by_policy`, `throttled`, `failed_safe`, or
  `provider_disabled`.
- `request_source_bucket_ref`: safe coarse source bucket reference, not a raw IP
  address.
- `identifier_bucket_ref`: non-reversible normalized identifier hash or bucket
  reference, not a raw identifier or email.
- `combined_bucket_ref`: safe combined source plus identifier bucket reference.
- `global_bucket_ref`: optional deployment-wide abuse bucket reference.
- `provider_send_bucket_ref`: safe provider-send throttle bucket reference.
- `request_correlation_id` and `audit_correlation_id`: safe IDs for linking
  events across request, delivery, completion, session revocation, and audit.
- `created_at_utc`, `updated_at_utc`, and optional `cleanup_eligible_at_utc`.

Status/state model:

- `pending`: material was issued and can be consumed only if unexpired, not
  replaced, not revoked, account is still eligible, and password policy passes.
- `consumed`: material completed one reset and must never be reused.
- `expired`: material is past `expires_at_utc`; public behavior remains
  generic.
- `revoked`: material was invalidated before expiry, usually because newer
  material replaced it or policy/account state changed.
- `suspicious_replay`: a consumed, revoked, expired, or replaced material lookup
  was reused and could be safely linked.

Account binding and unresolved identifier posture:

- Public request input may contain an identifier, but persistence must not store
  raw identifiers, emails, normalized identifier strings, request bodies, or
  provider payloads.
- If a local eligible account is found, bind internally by `auth_account_id`.
- If no eligible account is found, do not create token material. Abuse counters
  may still record safe identifier/source buckets so missing, OIDC-only,
  disabled, deleted, and policy-blocked states receive indistinguishable public
  handling.
- If a row is needed for audit of an unresolved request, it must omit
  `auth_account_id`, omit token material, and store only safe outcome and bucket
  references. Prefer audit-only events over unresolved reset rows unless runtime
  implementation proves a row is needed.

Replacement and revocation:

- Issuing newer reset material for the same `auth_account_id` and purpose should
  atomically revoke outstanding `pending` rows and point them at the newer row
  where a self-reference is useful.
- Successful reset should consume the current material and revoke any older
  outstanding material for the same account.
- Replaced, revoked, consumed, expired, unknown, malformed, and wrong-scope
  material must map to generic public completion failures.

Indexes and constraints to review in the schema slice:

- unique or filtered unique index on `reset_material_hash` where material is
  present;
- lookup index on `auth_account_id`, `purpose`, `status`, and `expires_at_utc`;
- filtered index for outstanding `pending` rows by account and purpose;
- indexes for `expires_at_utc` and `cleanup_eligible_at_utc`;
- FK from `replaced_by_reset_request_id` to the same table;
- bounded check constraints for `purpose`, `status`, `reset_material_scope`,
  `delivery_category`, `provider_send_category`, and `revocation_reason`;
- non-blank constraints for hash and policy-version fields when material is
  issued;
- no unique constraint on raw identifiers because raw identifiers must not be
  stored.

Retention and cleanup:

- Expired, consumed, revoked, and suspicious rows should be retained only long
  enough for security investigation and replay classification, then pruned or
  minimized by policy.
- Cleanup must not delete auth audit events that are still inside audit
  retention.
- Cleanup must not reveal account existence through public responses or admin
  readouts.
- Retention settings remain a later schema/runtime policy review; this packet
  recommends a bounded default, not permanent reset-token history.

Forbidden persistence fields:

- no raw reset tokens, raw short codes, reset URLs, raw verifier strings, raw
  identifiers, emails, request bodies, plaintext passwords, password hashes,
  session tokens, refresh credentials, token hashes, full IP addresses,
  unbounded user-agent strings, provider payloads, or delivery message bodies.

## Proposed API And OpenAPI Endpoint Family

No OpenAPI change is made by this packet. Future contract review should consider
this endpoint family:

- `POST /api/v1/auth/password-reset/request` for public reset initiation.
- `POST /api/v1/auth/password-reset/complete` for completing reset with
  submitted token/code material and a new password.
- No public verify/probe endpoint initially. A verification endpoint can create
  enumeration and replay side channels; completion should validate and consume
  in one server-authoritative operation.
- Optional internal/admin-delivered initiation or material handoff only as a
  future gate. It must not be silently mixed into public forgotten-password
  runtime.

Request/initiate shape:

- Accept only the submitted reset identifier and minimal client metadata needed
  by policy.
- Do not accept account IDs, profile IDs, delivery category overrides, expiry
  overrides, source keys, provider-send flags, or debug fields from clients.
- Return a generic accepted response, likely `202 Accepted`, for account found,
  account missing, OIDC-only, disabled/deleted, provider disabled, provider
  failed, delivery skipped, throttled, or policy-blocked states where a uniform
  response is required by the approved policy.

Completion shape:

- Accept submitted reset material and `newPassword`.
- Do not accept account IDs, profile IDs, credential IDs, session IDs, provider
  flags, expiry overrides, or revocation choices.
- On success, return `204 No Content` or another minimal success shape approved
  during OpenAPI review. Do not issue a session by default in this flow unless a
  future auth/security gate approves sign-in-after-reset behavior.
- On failure, map expired, consumed, revoked, replayed, unknown, malformed,
  wrong-account, replaced, disabled-account, missing-local-credential, OIDC-only,
  weak password, and policy-denied states to safe public problem responses. The
  exact status split must be reviewed so password policy feedback does not
  become an account/token validity oracle.

Problem response redaction:

- Public problems must not include account existence, local-vs-OIDC state,
  credential status, provider state, delivery attempt state, token expiry
  timestamp, token age, replacement state, replay classification, audit IDs,
  bucket keys, session counts, or internal policy names.
- Do not expose `Retry-After` initially.

Generated-client posture:

- OpenAPI remains the source of truth.
- Generated web and Dart clients must come from `npm run generate:clients` in a
  later contract slice.
- Generated-client availability must not be treated as permission, account
  existence proof, token validity proof, provider-delivery proof, or password
  reset authority.

## Proposed Runtime Service Boundaries

Candidate internal boundaries:

- `ILocalPasswordResetRequestService`: orchestrates public reset requests,
  anti-enumeration lookup, abuse checks, material issuance, provider handoff,
  provider skipped behavior, and request audit.
- `ILocalPasswordResetCompletionService`: validates and consumes reset material,
  replaces local password credentials, revokes sessions/families, writes audit,
  and classifies replay or denial.
- `IPasswordResetMaterialService`: generates high-entropy material, derives
  purpose-bound lookup hashes/verifiers, and compares submitted material without
  exposing raw values.
- `IPasswordResetDeliveryProvider`: provider abstraction for approved
  SMTP/email delivery, with disabled/skipped behavior represented internally.
  Admin-delivered behavior remains a separate future provider/gate.
- `IPasswordResetAbusePolicyService`: applies source, identifier, combined,
  global, and provider-send buckets for reset-specific thresholds.

Request orchestration order:

1. Validate transport shape.
2. Normalize submitted identifier inside the service boundary.
3. Derive safe identifier/source bucket references without logging raw input.
4. Apply cheap abuse checks before account lookup and before provider send.
5. Resolve local identity/account/credential internally without public
   enumeration.
6. If no eligible local account or provider policy is unavailable, record safe
   internal outcomes and return the same public accepted response.
7. If eligible and delivery policy is approved, generate high-entropy material,
   hash/verifier-store it, revoke older outstanding material in the same
   transaction, and call the approved delivery provider.
8. Record provider skipped/failed categories safely without changing public
   response.
9. Write bounded audit events.

Completion orchestration order:

1. Validate transport shape without logging submitted material or password.
2. Derive reset material lookup hash/verifier.
3. Resolve candidate reset row inside the auth service boundary.
4. Reject unknown, expired, consumed, revoked, replaced, wrong-scope, or
   suspicious material with generic public failure.
5. Re-check account status, local-account eligibility, current credential state,
   and password policy.
6. In one transaction or equivalent consistency boundary, atomically mark reset
   material consumed, replace the local password credential through the existing
   credential workflow/password hashing boundary, revoke outstanding reset
   material for the account, revoke all active sessions and refresh/session
   families for the account, and write bounded audit.
7. Treat concurrent consume races so only one completion can succeed.
8. Treat later reuse of consumed/revoked material as replay/suspicious where it
   can be linked safely, while returning the generic public failure.

Transaction and idempotency:

- Request initiation is not idempotent in the sense of reusing material; newer
  approved material should replace older material.
- Completion is one-time and destructive; two concurrent completions must not
  both replace credentials.
- Provider delivery failure must not expose public differences. The runtime
  slice must decide whether failed provider sends leave material pending,
  immediately revoke it, or record provider failure without material issuance.
  The safer default is to avoid creating consumable material unless delivery was
  accepted by the approved provider boundary.

Session and refresh-family revocation:

- Successful reset revokes all active access sessions and all active
  refresh/session families for the account by default.
- Revocation reason category should be bounded, such as `password_reset`.
- Completion response must not return revoked counts, session IDs, family IDs,
  token hashes, or device metadata.

## Audit Taxonomy And Redaction Matrix

Proposed audit categories are policy categories, not final enum names:

| Category | When | Safe metadata | Forbidden metadata |
| --- | --- | --- | --- |
| `password_reset.requested` | Public request accepted for processing. | workflow, outcome category, correlation ID, safe bucket categories. | raw identifier, email, request body, provider detail, token material. |
| `password_reset.material_issued` | Eligible local account received issued material. | subject account ID, delivery category, expiry bucket/range, correlation ID. | raw token/code/link, token hash, verifier string, email address. |
| `password_reset.provider_skipped` | Provider unavailable, disabled, or policy skipped. | provider-send category, policy category, correlation ID. | provider credentials, raw recipient, SMTP diagnostics that reveal identity. |
| `password_reset.provider_failed` | Provider failed after internal attempt. | safe failure category, provider category, correlation ID. | provider payloads, recipient address, message body, stack traces with secrets. |
| `password_reset.consumed` | Reset completed successfully. | subject account ID, credential workflow category, correlation ID. | submitted token, new password, password hash, verifier output. |
| `password_reset.denied` | Policy/account/password checks denied completion. | safe denial category, correlation ID, subject only if safely resolved. | exact token state, account existence hints, password policy internals that aid attacks. |
| `password_reset.expired` | Expired material observed or cleaned up. | subject if safely resolved, expiry category, correlation ID. | raw token/hash, exact submitted material, raw recipient. |
| `password_reset.replay_suspicious` | Consumed/revoked/replaced material reused. | suspicious category, subject/family only if safely linked, correlation ID. | raw token/hash, caller-provided identifiers, full IP/user-agent. |
| `password_reset.replaced_or_revoked` | Newer material supersedes older material or policy revokes it. | revocation reason category, replacement reference if safe, subject. | old/new raw material, token hashes, delivery URLs. |
| `password_reset.sessions_revoked` | Successful reset revokes sessions/families. | subject account ID, reason category, correlation ID. | session tokens, refresh tokens, token hashes, revoked counts unless separately approved. |

Audit remains the security source of truth until a later notification gate maps
reset events to user-facing notifications.

## Validation And Test Matrix

Future implementation slices should include focused tests for:

- anti-enumeration request response for existing local, missing, OIDC-only,
  disabled, deleted, provider-disabled, provider-failed, throttled, and
  policy-blocked identifiers;
- no raw token, code, reset URL, raw identifier, email, request body, password,
  session token, refresh credential, or token hash in logs/audit/problem
  responses;
- no raw reset material in PostgreSQL;
- token expiry with 60 minute default email-link expiry and configurable
  15-120 minute range;
- future typed short-code/OTP expiry constrained to 10-15 minutes if that flow
  is approved;
- newer reset material revoking/replacing older outstanding material;
- replay and concurrent consume where only one completion can succeed;
- local-account-only behavior;
- OIDC/provider-owned account request and completion behavior that does not
  reset provider passwords;
- disabled/deleted/account-status handling with uniform public responses;
- weak new password validation without account/token validity leakage;
- hash/verifier generation failure mapping to a safe internal failure and
  generic public response;
- credential replacement through the existing password hashing/credential
  workflow boundary;
- active session and refresh/session-family revocation after success;
- provider disabled, skipped, throttled, and failure behavior with uniform
  public response;
- generated-client source-of-truth posture after contract changes, including
  no hand-edited generated output and no client-side token validity authority.

Validation commands for later implementation depend on changed files. Expected
runtime slices should include focused API tests, `npm run validate:openapi`,
`npm run generate:clients`, `npm run validate:clients`, `npm run validate:api`
or `npm run validate:api-local`, and migration/runtime validation if schema
changes are included.

## Implementation Slicing Recommendation

1. Schema/migration and domain model slice:
   add reset persistence, constraints, retention placeholders, and focused
   model tests only after manual schema gate approval.
2. OpenAPI/generated-client contract slice:
   add reviewed endpoint paths/schemas/problem responses, regenerate clients,
   and prove generated output is not hand-edited.
3. API/service runtime slice:
   implement request and completion services with provider-disabled/skipped path
   if delivery is not configured, but do not expose runtime endpoint unless the
   approved delivery policy is satisfied.
4. SMTP provider/config verification slice:
   configure and verify SMTP/email security flow if Day 1 email reset is
   enabled.
5. Notification slice:
   map reset success/suspicious categories to user-facing notification events
   only after event/target/redaction approval.
6. UI/Figma/mobile/web slice:
   build product copy and UI from approved Figma/reference only.
7. Final auth/security acceptance gate:
   review schema, OpenAPI, generated clients, runtime, provider, notification,
   UI, audit, abuse, redaction, and session-revocation evidence together before
   claiming reset readiness.

## Non-Goals

This packet does not implement or approve:

- runtime password reset;
- schema/migrations or EF models;
- OpenAPI contract changes;
- generated clients;
- provider delivery or SMTP/email configuration;
- notification runtime;
- UI/Figma/design assets;
- admin reset/change;
- first-owner or break-glass recovery;
- invitation/public-registration credential runtime;
- OIDC password behavior;
- MFA/passkey runtime behavior;
- deployment, Docker, CI, Codemagic, or TestFlight behavior;
- secrets, env, or appsettings changes;
- money, settlement, payment, bill, OCR, storage, sync, import, export, backup,
  restore, or reconciliation behavior.

## Unsafe Shortcuts Rejected

- Raw reset tokens, short codes, URLs, token hashes, verifier strings, emails,
  or submitted identifiers in database rows, logs, audit, reports, OpenAPI
  examples, generated clients, issue comments, screenshots, or UI copy.
- Password reset for OIDC/provider-owned passwords through Settleora.
- Runtime forgotten-password endpoint when approved SMTP/email delivery and
  separately approved admin-delivered recovery are both absent.
- Public responses that reveal account existence, provider state, delivery
  state, token state, replay state, or account status.
- Client-side or generated-client authority over reset-token validity,
  account existence, password policy, or credential replacement.
- Provider send before abuse checks or without provider-send throttles.
- Reusing MFA recovery codes, invitation tokens, refresh credentials, or session
  tokens as password reset material.
- Completing reset without atomic consume plus credential replacement.
- Keeping active sessions/refresh families alive after successful reset unless
  a later auth/security gate explicitly narrows revocation.
- Workers or clients mutating auth credential, reset, session, refresh, or audit
  tables.

## Close And Keep-Open Posture

- Keep #336 open.
- Keep #339 open and in `Needs Decision` until implementation children are
  split and approved or Project status is explicitly updated by a later task.
- This design gate can reduce ambiguity for future implementation tasks, but it
  does not make runtime password reset complete or ready to ship.
