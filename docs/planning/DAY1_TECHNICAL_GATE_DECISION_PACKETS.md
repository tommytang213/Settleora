# Day 1 Technical Gate Decision Packets

## Purpose

This document converts approved Day 1 product defaults into reviewable technical decision packets for the remaining highest-leverage manual gates.

It does not clear gates, create implementation permission, update GitHub issues, update Project fields, change OpenAPI, change schema, change generated clients, or implement runtime behavior. It gives Tommy a concise approval surface before the referenced issues are moved to their next gated state.

## Shared Guardrails

These guardrails apply to every packet:

- API/domain services own core business writes, authorization, money, status transitions, storage access, sync acceptance, policy, and audit.
- Workers must not mutate core business tables directly.
- OpenAPI is the source of truth; generated clients are regenerated from reviewed OpenAPI and are not hand-edited.
- File bytes go through storage abstraction; API responses expose stable file IDs and safe metadata, not storage internals.
- File access requires API authorization.
- Money uses decimal-safe values with currency attached and centralized rounding.
- On-device OCR remains required; server OCR is complementary.
- Clients may render, cache, and queue, but they do not decide authorization, financial truth, settlement state, storage access, or audit truth.
- Audit must avoid secrets, tokens, passwords, raw recovery codes, raw OCR text, sensitive file contents, storage paths, object keys, vault keys, and unrelated sensitive data.
- Public/admin exposure assumes hostile traffic.
- PostgreSQL, RabbitMQ, and storage backends remain non-public.
- UI-sensitive work still needs Figma or another explicit reference.

## 1. Auth MFA, Passkeys, And Recovery Codes

### Related Issues

#394, #413, #414, #415, #416, #417.

### Approved Product Defaults Already Recorded

- Day 1 includes WebAuthn/passkeys, authenticator-app TOTP MFA, one-time recovery codes, admin/security policy controls, and safe audit.
- SMS MFA is not Day 1.
- Normal-user MFA is optional unless admin policy requires it.
- Owners/admins are required or strongly guided by default in server mode.
- Raw TOTP secrets, recovery codes, passkey private material, raw challenge tokens, raw reset/session/provider tokens, and reusable challenge material must not appear in unsafe tables, logs, API responses, audit metadata, or generated clients.

### Remaining Technical Decisions

- Exact auth credential tables and indexes for passkey credentials, MFA factors, challenge records, recovery-code batches, and policy records.
- Which fields are hashed, which are encrypted, and which are public-key or non-secret metadata.
- WebAuthn challenge creation, expiry, single-use consumption, replay rejection, cleanup, and audit.
- TOTP secret generation, display/enrollment lifecycle, at-rest encryption boundary, rotation/removal, and verification windows.
- Recovery-code hashing algorithm, batch replacement, display-once response behavior, one-time use, exhausted-code handling, and regeneration policy.
- Admin policy enforcement points for sign-in, enrollment, step-up, owner/admin enforcement, account recovery, and incompatible external-provider states.
- Audit metadata shape for enrollment, removal, challenge success/failure, recovery-code generation/use/regeneration, and policy changes.
- OpenAPI/client slice order for enrollment, challenge, verification, factor listing, factor removal, recovery-code lifecycle, and admin policy.

### Recommended Default

Use separate auth-owned tables for passkeys, MFA factors, auth challenges, recovery-code batches/codes, and auth security policy. Store credential/factor state under `auth_account` ownership, never in `user_profiles`.

Recommended storage boundaries:

- Passkeys: store credential ID hash or provider-safe credential identifier, public key material, sign counter or equivalent replay metadata, attestation policy result category if retained, display label, status, created/last-used/revoked timestamps. Never store passkey private material.
- WebAuthn challenges: store a server-generated challenge hash, challenge type, account/session context, relying-party/origin metadata category, short expiry, consumed timestamp, failure category, and correlation ID. Never store reusable raw challenge material after it leaves the server response.
- TOTP: store the TOTP secret encrypted at rest under an auth-secret encryption boundary, plus issuer/label metadata, enrollment state, created/verified/last-used/revoked timestamps, and policy version. Never store TOTP secrets in logs, audit, OpenAPI examples, or generated-client fixtures.
- Recovery codes: return plaintext codes only once at generation/regeneration; store only per-code salted hashes or an approved password-hash-like verifier with code status, batch ID, created/used/revoked timestamps, and use correlation metadata. Regeneration revokes unused prior codes.
- Admin policy: default passkeys and TOTP allowed, SMS disabled, normal-user MFA optional unless required by policy, owner/admin MFA required or blocking-warning enforced before sensitive admin/security operations.

### Alternatives Considered

- Put all MFA/passkey state in one generic credential table. Rejected because recovery-code, passkey, TOTP, and challenge lifecycles have different retention, secret, and replay rules.
- Store TOTP secrets only client-side. Rejected for Day 1 because recoverable server-mode account recovery and multi-device use need a reviewed recovery story.
- Store recovery codes encrypted and reveal later. Rejected because recovery codes should be display-once and verifier-only after generation.
- Treat owner/admin MFA as optional forever. Rejected because admin exposure and self-hosted security defaults need stronger posture.

### Why This Is Safest For Day 1

It keeps every credential secret inside the auth boundary, makes replay and one-time recovery behavior explicit, supports owner/admin security defaults, and lets OpenAPI expose only reviewed challenge/enrollment transport shapes.

### Architecture Guardrails

- Auth identity, credential, session, and audit storage remain separate from profile data.
- API owns credential writes, challenge validation, policy enforcement, session validity, and auth audit.
- Workers and clients never mutate auth credential, challenge, MFA, passkey, or recovery-code tables.

### Data/API/Schema/OpenAPI Implications

Manual gate remains for schema/migration and OpenAPI/client changes. Future implementation should split into schema/persistence, WebAuthn API, TOTP/recovery API, admin policy/audit, and UI/reference issues.

### UI/Figma Implications

#417 remains `Needs Figma / Reference` for enrollment, challenge, recovery-code display-once, lost-device/recovery, security settings, and admin policy flows.

### Validation Implications

Future runtime work needs API/security tests for replay, expiry, one-time code use, policy enforcement, audit redaction, generated-client freshness, and stable error codes.

### Risks If Chosen Wrong

Credential leakage, challenge replay, unrecoverable account lockout, weak admin defaults, generated-client exposure of secrets, or audit records containing reusable security material.

### Issue Movement Recommendation

- #413: move from `Needs Decision` to `Ready for architecture implementation` after Tommy approves this packet, but keep manual auth/security and migration gates.
- #414, #415, #416: move from `Needs Decision` to `Ready for architecture implementation` after #413 records the concrete schema/API split; do not move directly to `Ready for Codex`.
- #417: remains `Needs Figma / Reference`.
- #394: remains gated as the parent until children are resolved.

### Explicit Non-goals

No SMS MFA, no runtime implementation, no schema migration, no OpenAPI/client change, no auth config or secret change, no issue/Project mutation from this document.

### Tommy Approval Checklist

- [ ] Approve separate auth-owned tables and no profile-table credential storage.
- [ ] Approve encrypted TOTP secret storage and display-once recovery codes with hash-only persistence.
- [ ] Approve short-lived single-use WebAuthn challenges.
- [ ] Approve owner/admin MFA enforcement or blocking-warning default.
- [ ] Confirm UI still waits for Figma/reference.

## 2. Friends, Direct Sharing, And Payment-Detail Exposure

### Related Issues

#400, #431, #432, #433, #434, #435.

### Approved Product Defaults Already Recorded

- Exact-match discovery only.
- No browse-all-users/global directory by default.
- Friend approval is required.
- Direct bill sharing is allowed only with approved friends or approved shared/group context.
- Unfriend stops future sharing and preserves historical financial/audit records.
- Block stops requests, messages/comments where applicable, and future direct sharing.
- Friend status alone does not expose payment details, QR files, or settlement proof files.
- Temporary participants can later claim/link to real accounts without rewriting history.

### Remaining Technical Decisions

- Friend request statuses, expiry/cancel behavior, duplicate request handling, and exact-match fields.
- Block/unfriend impact on pending requests, future direct shares, comments/messages, notification delivery, and historical record visibility.
- Direct bill sharing authorization checks and interaction with group context.
- Temporary participant identity, claim/link proof, history preservation, and conflict behavior if two accounts try to claim the same participant.
- Payment-detail exposure test boundaries across friend, group, bill, and settlement contexts.

### Recommended Default

Implement a server-authoritative friend relationship model with statuses `pending`, `accepted`, `declined`, `cancelled`, and `blocked`, with exact-match discovery by normalized email/username/handle only where policy enables that identifier type. Do not expose browse lists or fuzzy search.

Direct bill sharing requires either an accepted friend relationship at write time or a separately authorized group/shared context. Blocking either party prevents new requests, pending request acceptance, future direct sharing, and non-essential social notifications between those users. Unfriend ends future direct sharing but does not remove bill participants, settlement records, file associations, or audit history.

Temporary participant claim/link must create a link record from placeholder participant to real profile from the claim time forward while preserving the historical placeholder identity on old bills and audit records. Do not rewrite old participant rows into a different person.

Payment details remain exposed only through concrete settlement/payment relationship endpoints unless a future policy explicitly adds another concrete relationship. Friend status and group membership alone are insufficient.

### Alternatives Considered

- Global user directory. Rejected because it expands privacy and enumeration risk.
- Friend status grants payment-detail visibility. Rejected because payment details are settlement-context scoped sensitive data.
- Hard-rewrite temporary participants into real profiles on claim. Rejected because it corrupts historical participation and audit.

### Why This Is Safest For Day 1

It allows direct sharing without turning Settleora into a user directory, protects payment details, and preserves financial history when social relationships change.

### Architecture Guardrails

- API owns friend, direct-share, block/unfriend, and claim/link authorization.
- Clients must not infer share permission from cached friend UI.
- Historical bill, settlement, and audit records are preserved.

### Data/API/Schema/OpenAPI Implications

Manual gate remains for friend relationship schema, temporary participant/link schema, direct-share OpenAPI, generated clients, and visibility tests.

### UI/Figma Implications

#434 remains `Needs Figma / Reference` for discovery, request inbox/outbox, accept/decline, block/unfriend confirmation, direct-share picker, temporary participant claim, and privacy-safe failure states.

### Validation Implications

Future validation must prove exact-match discovery, no directory enumeration, block/unfriend future-action denial, history preservation, direct-share authorization, and payment-detail non-exposure.

### Risks If Chosen Wrong

User enumeration, payment-detail leakage, accidental sharing with unrelated users, broken historical audit, or settlement records losing participant identity.

### Issue Movement Recommendation

- #431, #432, #433, #435: move from `Needs Decision` to `Ready for architecture implementation` after Tommy approves this packet; keep auth/security, storage/privacy, money, OpenAPI, and migration gates as applicable.
- #434: remains `Needs Figma / Reference`.
- #400: remains parent/manual-gated until child architecture and UI references exist.

### Explicit Non-goals

No global directory, no fuzzy/browse search, no payment-provider integration, no runtime implementation, no issue/Project mutation.

### Tommy Approval Checklist

- [ ] Approve exact-match discovery only.
- [ ] Approve accepted-friend or approved shared/group context as direct-sharing prerequisite.
- [ ] Approve block/unfriend behavior.
- [ ] Approve temporary participant claim/link without history rewrite.
- [ ] Confirm payment details remain settlement/payment-context scoped.

## 3. Privacy Vault And Sensitive Boundaries

### Related Issues

#343, #418, #419, #420, #421, #422.

### Approved Product Defaults Already Recorded

- Day 1 includes Standard Secure Mode and Recoverable Private Vault.
- Strict Private Vault is not Day 1.
- Recoverable vault targets include payment details, QR/payment images, receipt images, OCR raw text if stored, settlement proof files, private notes, and similar non-shared sensitive personal/financial data.
- Shared financial truth, settlement state, authorization, audit, sync authority, and core accounting records remain API/domain authoritative.
- Recovery model and warnings must be explicit.
- Backup/export must preserve privacy warnings and avoid leaking vault material.

### Remaining Technical Decisions

- Final data classification list and per-class default encryption mode.
- Recoverable Private Vault envelope/key model, recovery envelope storage, trusted-device envelope storage, participant envelope rules, and rotation/revocation behavior.
- Which sensitive shared files/fields can be vault-protected without breaking intended participant access.
- Recovery UX warnings and audit events.
- Backup/export representation of vault-protected data, recovery envelopes, and restore warnings.

### Recommended Default

Use three data classifications: `normal`, `sensitive`, and `highly_sensitive`.

Use three encryption modes: `server_managed`, `recoverable_user_vault`, and `strict_user_vault_future`. Day 1 implements only `server_managed` and `recoverable_user_vault`.

Recoverable vault key model:

- Each vault user has a vault root key.
- Each sensitive file/field uses a data key where practical.
- Data key encrypts content; vault root key wraps data keys.
- Vault root key is wrapped for trusted device public keys and for a server-assisted recovery envelope in Recoverable mode.
- Shared sensitive file data keys are wrapped per authorized participant or participant-vault path, not made globally readable.
- Recovery envelope use requires strong account verification, audit, and user-visible security notification where available.

Do not vault-protect core accounting truth, settlement states, sync state, authorization decisions, or audit metadata needed for server accountability.

### Alternatives Considered

- Strict zero-knowledge for Day 1. Rejected because it risks unrecoverable data loss and client-owned financial authority.
- Server-managed encryption only. Rejected because Day 1 product default includes a stronger Recoverable option.
- Vault everything including financial truth. Rejected because server/domain authority would break.

### Why This Is Safest For Day 1

It gives stronger privacy for sensitive content while preserving recoverability and shared accounting correctness.

### Architecture Guardrails

- Vault protection cannot move money, settlement, authorization, audit, or shared accounting truth into client authority.
- File metadata and access decisions stay server-authoritative.
- Admin UI must be redacted for vault content by default.

### Data/API/Schema/OpenAPI Implications

Manual gate remains for vault schema/migration, key-envelope persistence, storage metadata encryption-mode fields, API response redaction, backup/export contracts, and generated-client changes.

### UI/Figma Implications

#421 remains `Needs Figma / Reference` for onboarding, mode selection, recovery warnings, trusted-device/recovery flows, settings, and backup/export warnings.

### Validation Implications

Future validation must prove data classification, redaction, recovery-envelope audit, no vault internals in API responses, participant access preservation, and backup/export warning behavior.

### Risks If Chosen Wrong

Unrecoverable user data, admin/support privacy leakage, broken participant access to shared files, exposure of vault keys/envelopes, or client-owned financial truth.

### Issue Movement Recommendation

- #418, #419, #420, #422: move from `Needs Decision` to `Ready for architecture implementation` after Tommy approves this packet; keep storage/privacy/security, migration, OpenAPI, and backup gates.
- #421: remains `Needs Figma / Reference`.
- #343: remains parent/manual-gated until child designs are accepted.

### Explicit Non-goals

No Strict Private Vault runtime, no zero-knowledge accounting, no runtime implementation, no schema/OpenAPI/client changes, no issue/Project mutation.

### Tommy Approval Checklist

- [ ] Approve `normal` / `sensitive` / `highly_sensitive` classifications.
- [ ] Approve Recoverable envelope/key model.
- [ ] Approve keeping financial truth outside the vault.
- [ ] Approve backup/export warning requirement.
- [ ] Confirm privacy UX still waits for Figma/reference.

## 4. Multi-Tax, Bill Revisions, And Settlement Impact

### Related Issues

#351, #427, #428, #429, #430, #348, #423, #424, #425, #426, #402.

### Approved Product Defaults Already Recorded

- Day 1 supports multiple tax-rate/category groups in one bill.
- Day 1 supports mixed tax-included and tax-excluded lines, discount-before-tax and discount-after-tax, refunds/returns/tax corrections, and receipt-total mismatch review/error state.
- One active pending official bill revision exists at a time.
- Affected users re-approve money-impacting changes.
- Paid-by person reconfirms if payer role, paid amount, payer contribution, or their financial share changes.
- Pending bill revisions must not silently mutate settlement balances.

### Remaining Technical Decisions

- Multi-tax schema shape for item tax metadata, tax group summaries, tax-inclusion mode, discount tax treatment, fee/refund linkage, and receipt-total reconciliation.
- Rounding and residual storage for item, tax group, participant, and receipt reconciliation boundaries.
- Revision snapshot scope for item/split/adjustment/attachment/OCR/note/metadata context.
- Affected-user approval calculation and payer reconfirmation triggers.
- Settlement-impact behavior for applied revisions when settlement requests/payments already exist.

### Recommended Default

Multi-tax:

- Add first-class item tax metadata: tax rate snapshot, tax label/category, tax inclusion mode, discount tax treatment, tax amount snapshot, and tax group key.
- Add tax group summary rows or structured adjustment rows with explicit group linkage, taxable subtotal, tax amount, currency, source kind, and rounding residual.
- Use `tax follows the item` as the default allocation rule.
- Receipt-total mismatch returns a stable review/error state or requires explicit manual adjustment. Never silently mutate item totals, tax groups, discounts, refunds, or participant shares.

Bill revisions:

- Snapshot the server-authoritative baseline used for review, including bill root, items, splits, adjustments, payers, participants, attachments, OCR review references, notes/metadata categories, calculation hash, and viewer-specific financial impact.
- Store revision-specific approvals tied to revision ID, amount, currency, calculation hash, and affected-user set.
- Rejected, withdrawn, or superseded revision approvals never carry forward.

Settlement impact:

- Pending/requested-only settlement state blocks revision apply until a bill-revision-owned invalidation workflow exists.
- Progressed settlement/payment history blocks revision apply until reviewed adjustment/reopen policy exists.
- When no settlement state exists, revision apply may proceed through normal affected-user/payer confirmation policy.
- Settlement impact display should show affected outstanding lines, selected request lines, payment claims, confirmation state, and whether apply is blocked, invalidation-required, or adjustment-required.

### Alternatives Considered

- One bill-level tax adjustment. Rejected because it cannot prove participant-specific tax correctness across tax groups.
- Client-computed revision diffs. Rejected because clients must not compute affected-user or money truth.
- Apply revisions and silently adjust settlements. Rejected because it breaks trust and audit.

### Why This Is Safest For Day 1

It prevents silent money mutation, preserves reviewable financial baselines, and keeps settlement history stable until explicit adjustment/reopen policy exists.

### Architecture Guardrails

- API/domain owns tax calculation, revision diff truth, affected-user state, payer reconfirmation, settlement impact, and audit.
- Clients render server-provided review context only.
- Money remains decimal-safe and centrally rounded.

### Data/API/Schema/OpenAPI Implications

Manual gates remain for schema/migration, OpenAPI/client changes, calculation services, revision snapshots, and settlement-impact endpoints/responses.

### UI/Figma Implications

#429 and #425 remain `Needs Figma / Reference` for OCR tax correction, receipt mismatch review, revision diff, affected-user approval, payer reconfirmation, and settlement-impact warnings.

### Validation Implications

Future validation must cover mixed 8%/10%, tax-included/excluded, before/after-tax discounts, grouped tax allocation, refunds/returns, receipt mismatch, deterministic residuals, revision approval invalidation, payer reconfirmation, and settlement-impact blocking.

### Risks If Chosen Wrong

Incorrect shares, tax charged to wrong participants, silent receipt balancing, stale approvals, settlement balances changing without consent, or unrebuildable audit history.

### Issue Movement Recommendation

- #427, #428, #430, #423, #424, #426, #402: move from `Needs Decision` to `Ready for architecture implementation` after Tommy approves this packet; keep money, migration, OpenAPI, and manual gates.
- #429 and #425: remain `Needs Figma / Reference`.
- #351 and #348: remain parent/manual-gated until child architecture and UI references are accepted.

### Explicit Non-goals

No tax-law advice, no provider tax lookup, no silent settlement mutation, no runtime implementation, no schema/OpenAPI/client changes, no issue/Project mutation.

### Tommy Approval Checklist

- [ ] Approve first-class item tax metadata and tax group summaries.
- [ ] Approve receipt mismatch as review/error or explicit adjustment only.
- [ ] Approve revision snapshot semantics and approval hash binding.
- [ ] Approve settlement-impact blocking until invalidation/adjustment policy exists.
- [ ] Confirm tax/revision UI still waits for Figma/reference.

## 5. Sync/Offline Authority, Idempotency, And Conflicts

### Related Issues

#362, #443, #444, #445, #446, #447.

### Approved Product Defaults Already Recorded

- Local-only profiles are locally authoritative.
- Server-mode profiles are server-authoritative.
- Offline shared edits remain pending until synced and accepted by the API.
- Sync states include `queued`, `synced`, `conflict`, and `failed`.
- Conflicts preserve local pending edits until resolved.
- Local/server/cloud boundaries must not silently merge.

### Remaining Technical Decisions

- Queued mutation envelope and local persistence requirements.
- Idempotency key scope, retention, replay behavior, and duplicate financial mutation prevention.
- Server accepted/rejected/conflict/failed response shapes.
- Optimistic version model and conflict resolution permissions.
- Local-only to server import/migration boundary.
- Audit coverage for accepted, rejected, denied, conflict, and migration operations.

### Recommended Default

Use a local `OfflineQueueItem` envelope with stable local ID, profile/workspace authority ID, operation type, resource type, resource ID if known, payload, idempotency key, base server version if known, created/last-attempt timestamps, attempt count, state, and last error code.

Use idempotency keys scoped by actor account/profile, authority boundary, operation type, target resource or client-generated resource key, and request payload hash. Reusing the same key with the same payload returns the prior accepted/rejected result. Reusing it with a different payload returns a conflict/error. Retain keys long enough to cover offline retry windows and financial mutation replay risk.

Server responses should classify outcomes as `accepted`, `rejected`, `conflict`, or `failed`:

- `accepted`: mutation committed by API/domain policy, with server version and safe resulting state.
- `rejected`: valid transport but denied by authorization, validation, policy, or unsupported operation; local pending data is preserved for user review.
- `conflict`: stale version or competing state; include authorized server current summary and resolution options.
- `failed`: transient or infrastructure failure; client retries according to policy.

Local-to-server import/migration is always explicit, user-approved, validated by server policy, and never triggered by changing server configuration alone.

### Alternatives Considered

- Per-endpoint ad hoc retry without idempotency. Rejected because duplicate money/status mutations are likely.
- Client-side conflict overwrite by default. Rejected because financial and authorization state must remain server-authoritative.
- Silent local-to-server merge. Rejected because it crosses authority boundaries.

### Why This Is Safest For Day 1

It preserves local work, prevents duplicate financial writes, and keeps server-mode collaboration authoritative without losing offline usability.

### Architecture Guardrails

- Every synced operation is authorized and validated as if online.
- Clients never mark shared edits effective for others before API acceptance.
- Local paths and local IDs never become server-authoritative storage or identity.

### Data/API/Schema/OpenAPI Implications

Manual gate remains for sync queue persistence, idempotency persistence, resource versioning, OpenAPI conflict/problem shapes, generated clients, and migration/import contracts.

### UI/Figma Implications

#446 remains `Needs Figma / Reference` for sync status, queue, retry, conflict compare, server rejection, and preserved local pending data.

### Validation Implications

Future validation must cover duplicate idempotency keys, stale version conflicts, unauthorized queued operations, failed sync preserving local data, local-only no-server behavior, and local-to-server import validation.

### Risks If Chosen Wrong

Duplicate bills/payments, silent overwrite, data loss, unauthorized offline mutation acceptance, or local/server data mixing without consent.

### Issue Movement Recommendation

- #443, #444, #445, #447: move from `Needs Decision` to `Ready for architecture implementation` after Tommy approves this packet; keep sync/auth/storage/money/OpenAPI gates.
- #446: remains `Needs Figma / Reference`.
- #362: remains parent/manual-gated until children are accepted.

### Explicit Non-goals

No peer-to-peer sync, no Cloud federation, no runtime implementation, no OpenAPI/client changes, no schema changes, no issue/Project mutation.

### Tommy Approval Checklist

- [ ] Approve queued mutation envelope.
- [ ] Approve idempotency key scope and replay behavior.
- [ ] Approve accepted/rejected/conflict/failed server result model.
- [ ] Approve no silent local-to-server merge.
- [ ] Confirm sync conflict UI still waits for Figma/reference.

## 6. Notifications Taxonomy, Providers, Channels, And Preferences

### Related Issues

#403, #448, #449, #450, #451, #452.

### Approved Product Defaults Already Recorded

- Day 1 includes in-app, SMTP email, and mobile push provider abstraction.
- In-app notifications are the baseline channel.
- Push and email require explicit provider/device-token architecture.
- Admin/system policy is the hard cap; user preferences can only narrow or select allowed channels.
- Group mute/preferences can further reduce group notifications where policy allows.
- Unsupported or unconfigured channels must be visible as unsupported/unconfigured, not fake success.
- Notification content must remain privacy-safe.

### Remaining Technical Decisions

- Event taxonomy and versioned event payload categories.
- In-app persistence baseline and delivery/read/archive states.
- SMTP config source, secret handling, test-send behavior, and failure states.
- Push provider abstraction, device token registration/revocation/rotation, app install/session linkage, and platform permission state.
- Preference resolution order across admin policy, provider state, user preferences, quiet hours, digest/immediate mode, event category preferences, and group mute.
- Security-critical bypass policy and audit.

### Recommended Default

Define a versioned event taxonomy by domain and sensitivity:

- Bills: assigned, updated, approval required, correction proposed/revised/withdrawn/accepted/rejected/applied, item claim state changes.
- Settlements: requested, marked paid, confirmed, disputed, proof attached.
- Recurring: due soon.
- Sync: conflict, failure.
- Security: new device/session, credential/MFA/passkey/recovery and policy events.
- OCR: completed/failed only when server OCR is used.

Use in-app as the guaranteed baseline. Email and push delivery are optional channel attempts under admin/provider policy. Record delivery state per channel as `not_configured`, `disabled_by_admin`, `disabled_by_user`, `muted`, `quiet_hours_deferred`, `digest_pending`, `queued`, `sent`, `failed`, or `unsupported` where applicable.

Preference resolution order:

1. Event eligibility and privacy-safe content template.
2. Admin/system channel policy and provider configured state.
3. Security-critical bypass policy, only for explicitly listed security events.
4. User per-event/category/channel preference.
5. Group mute or group preference where the event is group-scoped.
6. Quiet hours and digest/immediate rules.
7. Device/platform permission/token availability.

SMTP secrets live only in deployment secret/config boundaries, never in database rows, audit metadata, OpenAPI examples, or generated clients. Device tokens are treated as sensitive credential-like delivery material, hashed or encrypted where practical, and revoked on logout, app uninstall signal where available, account revocation, or token refresh.

### Alternatives Considered

- Push/email as required for all deployments. Rejected because self-hosted deployments may be unconfigured.
- User preference can enable disabled admin channel. Rejected because admin/system policy is the hard cap.
- Generic free-form event names. Rejected because templates, preferences, audit, and privacy need stable taxonomy.

### Why This Is Safest For Day 1

It guarantees a working in-app baseline, avoids pretending unconfigured providers delivered anything, and keeps security/privacy policy explicit.

### Architecture Guardrails

- API/domain owns event creation for business/security events.
- Workers may deliver notifications but must not mutate core business state.
- Notification content avoids sensitive file contents, raw OCR text, payment details, secrets, and unrelated financial data.

### Data/API/Schema/OpenAPI Implications

Manual gate remains for notification event contracts, provider config, device-token storage, preference APIs, generated clients, and secret handling.

### UI/Figma Implications

#452 remains `Needs Figma / Reference` for preferences, unsupported/unconfigured channel states, OS permission prompts, digest/quiet hours, group mute, deep links, and delivery status.

### Validation Implications

Future validation must cover event taxonomy, preference resolution, disabled/unconfigured channel states, quiet hours/digest, group mute, device-token revocation, privacy-safe content, and security-critical bypass audit.

### Risks If Chosen Wrong

Notification spam, missing security events, credential/token leakage, false delivery success, privacy leaks in notification content, or user preferences overriding admin policy.

### Issue Movement Recommendation

- #448, #449, #450, #451: move from `Needs Decision` to `Ready for architecture implementation` after Tommy approves this packet; keep provider/secret/auth/OpenAPI gates.
- #452: remains `Needs Figma / Reference`.
- #403: remains parent/manual-gated until children are accepted.

### Explicit Non-goals

No SMS runtime, no provider credentials committed, no push release/provider setup, no runtime implementation, no schema/OpenAPI/client changes, no issue/Project mutation.

### Tommy Approval Checklist

- [ ] Approve event taxonomy families.
- [ ] Approve in-app baseline with optional email/push attempts.
- [ ] Approve preference resolution order.
- [ ] Approve unsupported/unconfigured channel states.
- [ ] Confirm notification UI still waits for Figma/reference.

## 7. Import, Export, Local Backup, And Restore

### Related Issues

#406, #453, #454, #455, #456, #457.

### Approved Product Defaults Already Recorded

- Day 1 includes CSV export, CSV import, and local backup/restore.
- Local mode backup/export should be encrypted where feasible.
- Local-only and server-mode data must not silently merge.
- Silent AI or import-driven financial record mutation is not Day 1.
- Statement upload/matching remains Day 2.

### Remaining Technical Decisions

- CSV import/export authority boundaries and privacy filters.
- Export content scope, redaction, vault behavior, and audit.
- Import validation, duplicate detection, conflict review, and draft/review staging.
- Local backup package format, encryption default, key/password handling, and recovery warnings.
- Restore validation, preview, destructive/merge confirmation, and rollback behavior.
- Local/server collaboration and migration boundary.

### Recommended Default

CSV export:

- API/server exports only records the actor is authorized to export.
- Exports include stable decimal string amounts with currency, server-calculated financial fields, and privacy-aware redaction.
- Vault-protected content is omitted, redacted, or exported as encrypted payload with explicit warnings; never silently decrypted into plaintext exports.

CSV import:

- Imports are staged as review records or drafts until the API validates money, currency, ownership, participants, dates, categories, duplicates, conflicts, and policy.
- Import cannot directly create confirmed shared bills, settlements, payments, or reconciliation truth without explicit review/acceptance.
- Duplicate and conflict review is required before creating or updating money-impacting records.

Local backup:

- Default to encrypted backup packages where platform support is feasible.
- Backup includes manifest/version, authority boundary, mode (`local_only` or `server_mode_cache_export`), creation timestamp, app/schema version, encrypted payload sections, and privacy/vault metadata categories without raw keys in plaintext.
- Restore requires preview, validation, explicit confirmation, and clear warning when it crosses local/server authority or may overwrite local data.

Local/server boundary:

- Local-to-server migration/import is explicit, user-approved, server-validated, and does not silently convert local profiles into server accounts.
- Server-mode disconnect/export-to-local is an export/migration flow with warnings, not a hidden sync mode.

### Alternatives Considered

- Plaintext local backups by default. Rejected because backups are highly sensitive.
- Import directly writes confirmed shared financial truth. Rejected because imports need validation, authorization, and human review.
- CSV statement matching in Day 1. Rejected because statement upload/matching is Day 2.

### Why This Is Safest For Day 1

It allows data portability without making imports, backups, or restores a bypass around authorization, privacy, or money authority.

### Architecture Guardrails

- API/domain owns server-mode import acceptance and export authorization.
- Local backup is local authority only unless explicitly imported to server.
- Export/import audit avoids file contents, vault keys, secrets, and unrelated user data.

### Data/API/Schema/OpenAPI Implications

Manual gate remains for import/export APIs, backup package schema, validation staging records, OpenAPI/client changes, storage policy, vault integration, and audit.

### UI/Figma Implications

#456 remains `Needs Figma / Reference` for import mapping, duplicate/conflict review, backup encryption/password warnings, restore preview, overwrite/merge confirmation, and local/server migration warnings.

### Validation Implications

Future validation must cover export authz/redaction, import validation failures, duplicate detection, conflict review, encrypted backup restore, wrong-password/corrupt backup handling, authority-boundary warnings, and audit.

### Risks If Chosen Wrong

Plaintext sensitive backups, import-driven financial corruption, unauthorized data export, vault material leakage, accidental local/server merge, or destructive restore without informed consent.

### Issue Movement Recommendation

- #453, #454, #455, #457: move from `Needs Decision` to `Ready for architecture implementation` after Tommy approves this packet; keep storage/privacy/money/OpenAPI/import gates.
- #456: remains `Needs Figma / Reference`.
- #406: remains parent/manual-gated until children are accepted.

### Explicit Non-goals

No statement upload/matching, no direct bank sync, no silent financial mutation from import, no runtime implementation, no schema/OpenAPI/client changes, no issue/Project mutation.

### Tommy Approval Checklist

- [ ] Approve privacy-aware CSV export boundary.
- [ ] Approve staged/reviewed import model.
- [ ] Approve encrypted local backup default where feasible.
- [ ] Approve restore preview/confirmation requirements.
- [ ] Confirm import/export/backup UI still waits for Figma/reference.

## Cross-Packet Ambiguities

No product default in these seven domains is too ambiguous to recommend a Day 1 technical default. The unresolved work is implementation-detail approval, schema/API slicing, security/storage/money review, and Figma/reference readiness.

Do not interpret this as approval to implement. The next safe action is Tommy review of these packets, then targeted issue movement or child issue refinement in a separate GitHub/Project task.
