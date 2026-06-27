# Day 1 Manual Code Review Checklist

## Purpose

This checklist is a future human code review control for Day 1 acceptance. It does not mark manual code review, Day 1 acceptance, manual UI retest, security review, storage review, money review, deployment review, production readiness, or release readiness as passed.

Manual visual/UI retest remains tracked separately by GitHub issue [#386](https://github.com/tommytang213/Settleora/issues/386). Passing this checklist must not be used as visual retest evidence.

Allowed review states:

- `Not reviewed`
- `Needs reviewer`
- `Blocked`
- `Pass`
- `Fail`
- `N/A`

Default state for every item is `Not reviewed` until a human reviewer records evidence.

## Review Metadata And Evidence Capture

| Field | Value |
| --- | --- |
| Reviewer | `Needs reviewer` |
| Review date | `Needs reviewer` |
| Reviewed branch | `Needs reviewer` |
| Reviewed commit SHA | `Needs reviewer` |
| Reviewed PR or commit range | `Needs reviewer` |
| Base branch and SHA | `Needs reviewer` |
| Repo state before review | `Needs reviewer` |
| Repo state after review | `Needs reviewer` |
| Environment used | `Needs reviewer` |
| Validation commands reviewed | `Needs reviewer` |
| Linked Codex reports | `Needs reviewer` |
| Linked CI/check run | `Needs reviewer` |
| Linked manual UI retest evidence | `Needs reviewer`; #386 remains separate |
| Linked security/storage/money/deployment review evidence | `Needs reviewer` |
| Reviewer outcome | `Not reviewed` |

Evidence capture checklist:

- [ ] Record exact branch, base SHA, head SHA, and reviewed range.
- [ ] Record whether the worktree was clean before and after review.
- [ ] Record exact validation commands and results, or explain missing validation.
- [ ] Link PR, CI, Codex reports, screenshots, logs, and external evidence with secrets redacted.
- [ ] Confirm the reviewed evidence does not rely on copied snapshots over current repo files.
- [ ] Confirm review comments, blockers, and follow-ups have owners and issue links.
- [ ] Leave the final decision unpassed until a reviewer explicitly signs.

## Architecture Authority Boundaries

| Item | State | Evidence / notes |
| --- | --- | --- |
| API/domain services own server-mode business writes, authorization, money, bill/settlement/payment status transitions, storage access, sync acceptance, and audit. | `Not reviewed` | |
| Workers do not directly mutate core business tables, auth/session tables, file metadata tables, money tables, settlement tables, or audit tables unless a reviewed design explicitly allows it. | `Not reviewed` | |
| Clients render, cache, validate forms, and queue work only as presentation or pending intent. | `Not reviewed` | |
| Clients are not the source of authorization, money truth, settlement truth, storage access, sync acceptance, or audit truth. | `Not reviewed` | |
| Generated client method availability, hidden UI controls, route state, cached profile/group rows, or local IDs are never treated as permission. | `Not reviewed` | |
| Local-only, self-hosted server, and future cloud workspace authority boundaries do not silently merge. | `Not reviewed` | |

Stop and escalate if review finds authority moved from API/domain code into a client, worker, generated client, notification provider, OCR parser/provider, import/export path, or deployment helper.

## Auth, Session, And Runtime Security

| Item | State | Evidence / notes |
| --- | --- | --- |
| Password handling never stores, logs, returns, audits, or exposes plaintext passwords, verifier strings, salts, peppers, derived key material, reset tokens, recovery codes, passkey private material, MFA secrets, provider tokens, or raw session/refresh credentials. | `Not reviewed` | |
| Session and refresh behavior stores only approved hashes/metadata server-side and returns raw credential material only through reviewed one-time issuance paths. | `Not reviewed` | |
| Current actor/profile/session context is derived server-side from validated session state, not client-submitted profile IDs. | `Not reviewed` | |
| Sign-in, refresh, logout, session list, per-session revocation, and account-wide revocation keep generic public failure responses where needed to avoid enumeration. | `Not reviewed` | |
| Rate-limit, abuse, lockout, replay, and credential-stuffing posture is reviewed for the touched auth surface. | `Not reviewed` | |
| Account lifecycle changes, registration/invite/admin-created user paths, OIDC, MFA, passkey, recovery, and public self-registration are separately gated when in scope. | `Not reviewed` | |
| Auth/security audit events are bounded and do not include secrets, raw identifiers that act as credentials, unbounded request bodies, or unnecessary PII. | `Not reviewed` | |
| Public exposure assumptions do not weaken auth/session/security defaults. | `Not reviewed` | |

Escalate to security review for any auth/session/runtime security finding, account enumeration leak, token leak, unsafe credential persistence, public registration change, MFA/passkey/recovery change, or public/admin exposure change.

## Storage And File Privacy

| Item | State | Evidence / notes |
| --- | --- | --- |
| File bytes move only through the storage abstraction and purpose-specific API paths. | `Not reviewed` | |
| File metadata remains in PostgreSQL or an approved server metadata store. | `Not reviewed` | |
| API responses expose stable file IDs and safe metadata only. | `Not reviewed` | |
| API responses, logs, audit, generated clients, reports, and problem details do not expose filesystem paths, object keys, bucket names, provider URLs, signed URLs, mounted volume paths, temporary local paths, or storage internals. | `Not reviewed` | |
| File-byte reads and writes pass API authorization and fail closed for missing owner, subject association, lifecycle state, policy, or actor context. | `Not reviewed` | |
| Receipt files, supporting attachments, settlement proof files, payment QR files, OCR source data, statement/import files, exports, and backups follow purpose-specific policy. | `Not reviewed` | |
| Payment details and QR/payment images are not globally visible; counterparty reads require concrete authorized settlement or payment context. | `Not reviewed` | |
| Deletion, retention, trash, purge, vault, backup, and restore behavior preserve business dependencies and audit requirements. | `Not reviewed` | |
| Sensitive file contents, raw OCR text, payment details, storage paths, provider internals, and vault internals are redacted from audit/logging/support surfaces. | `Not reviewed` | |

Escalate to storage/privacy review for any direct storage exposure, generic public file API, signed/provider URL exposure, unauthorized file-byte access, payment detail visibility leak, or retention/deletion concern.

## Money, Bills, Splits, Settlements, Revisions, Refunds, And Adjustments

| Item | State | Evidence / notes |
| --- | --- | --- |
| Money calculations use decimal-safe types only and never use float/double/JavaScript number math as authoritative financial truth. | `Not reviewed` | |
| Every persisted and API-authoritative monetary value carries attached currency. | `Not reviewed` | |
| Rounding, allocation, residuals, and final payable amounts flow through centralized policy and are testable/reproducible. | `Not reviewed` | |
| Bill totals, item splits, participant shares, payer contributions, settlement candidates, residuals, and balances are API/domain-authoritative. | `Not reviewed` | |
| Clients may display previews but do not decide final split consistency, affected-user state, payer confirmation, settlement state, or balance truth. | `Not reviewed` | |
| Bill revision review context, changed markers, approval requirements, calculation hashes, and payer reconfirmation are server-derived. | `Not reviewed` | |
| Accepted/applied bill revisions do not silently mutate settlement requests, payments, allocations, residuals, proof records, balances, reports, or accepted history. | `Not reviewed` | |
| Refunds, credits, reversals, waivers, locks, destructive edits, finalized records, and adjustment policy are explicit and reviewed when in scope. | `Not reviewed` | |
| Receipt total mismatch, tax/discount/refund/fee edge cases, FX snapshots, and rounding residuals are reviewable and not silently spread or hidden. | `Not reviewed` | |
| Financial audit records are bounded and sufficient without exposing sensitive request bodies or unrelated data. | `Not reviewed` | |

Escalate to money/domain review for any financial authority shift, silent recalculation, client-authoritative total, missing currency, unsafe rounding, settlement mutation, refund/adjustment shortcut, or historical-truth overwrite.

## OCR Review-First Workflow

| Item | State | Evidence / notes |
| --- | --- | --- |
| OCR provider output, parser output, OCR completion, queue visibility, notification visibility, preview success, and generated client availability remain provisional. | `Not reviewed` | |
| OCR does not finalize bills, mutate authoritative money, infer final splits, apply settlements, or bypass API validation. | `Not reviewed` | |
| Review handoff requires editable user review before save/apply/finalization behavior. | `Not reviewed` | |
| Apply-preview is read-only and non-mutating. | `Not reviewed` | |
| Draft apply or future OCR-to-revision apply revalidates authorization, bill state, saved review, file visibility, money, settlement impact, and stale basis server-side. | `Not reviewed` | |
| Unsupported, failed, low-confidence, stale, blocked, offline, and manual-entry fallback paths do not silently bypass review. | `Not reviewed` | |
| OCR parser/provider logs, errors, tests, reports, and audit metadata do not expose raw OCR text, receipt image bytes, local paths, storage internals, tokens, credentials, or provider internals. | `Not reviewed` | |
| Server OCR worker behavior, when in scope, publishes reviewed results for API validation and does not directly mutate core business tables. | `Not reviewed` | |

Escalate to OCR, storage, or money review if OCR output can become authoritative without review/API acceptance, if raw OCR or receipt data leaks, or if fallback/manual-entry gates are bypassed.

## Sync, Offline, Import, Export, And Local Backup

| Item | State | Evidence / notes |
| --- | --- | --- |
| Server-mode queued/offline operations remain pending intent until the API accepts them. | `Not reviewed` | |
| Every queued server-mode mutation is authorized and validated as if submitted online at sync time. | `Not reviewed` | |
| Idempotency keys, payload hashes, version guards, calculation hashes, stale bases, and conflict handling prevent duplicate or stale mutation. | `Not reviewed` | |
| Failed, rejected, conflicted, cancelled, discarded, and superseded local changes preserve user-entered pending data until explicit resolution or retention cleanup. | `Not reviewed` | |
| Local-only data, server-mode data, export packages, import candidates, backup packages, and restore previews remain separate authority boundaries. | `Not reviewed` | |
| Import/export/backup/restore flows require explicit user action, safe manifests, privacy redaction, validation, preview/confirmation where needed, and no silent merge. | `Not reviewed` | |
| Export/report/backup outputs omit secrets, tokens, file bytes unless explicitly approved, local paths, storage internals, raw OCR text, vault internals, and unauthorized/private data. | `Not reviewed` | |
| Clients do not submit local profile IDs, cached roles, hidden UI state, generated-client availability, or local file paths as authorization or storage authority. | `Not reviewed` | |

Escalate to sync/storage/security/money review for any silent local-to-server merge, client-derived authorization, stale overwrite, dropped pending data, raw backup leak, import-driven financial mutation, or restore before preview/confirmation.

## Recurring, Forecasting, And Notifications

| Item | State | Evidence / notes |
| --- | --- | --- |
| Recurring templates store generation configuration, not final financial truth. | `Not reviewed` | |
| Forecast reads do not create bills, settlements, notifications, audit truth, or other mutations unless an explicit reviewed path says so. | `Not reviewed` | |
| Explicit draft generation revalidates actor access, group membership, payload money, currency, participants, payer policy, and idempotency server-side. | `Not reviewed` | |
| Background auto-generation, reminders, due-soon notifications, and skipped/failed generation remain explicit reviewed paths when in scope. | `Not reviewed` | |
| Notification recipients and channel eligibility are API/domain-derived and do not bypass underlying resource authorization. | `Not reviewed` | |
| Notification read/archive state does not mutate source bills, settlements, OCR reviews, sync operations, security events, groups, comments, or audit truth. | `Not reviewed` | |
| Email/push provider states are explicit; unsupported, unconfigured, disabled, muted, deferred, queued, or failed delivery is not represented as delivered/successful. | `Not reviewed` | |
| Email/push/device-token/provider logs and payloads avoid credentials, raw device tokens, provider secrets, sensitive receipt/payment/proof contents, storage internals, and unbounded money details. | `Not reviewed` | |

Escalate for notification/security review if channel policy bypasses admin/user/group caps, external snippets leak sensitive data, provider setup stores secrets unsafely, or notifications imply server acceptance without authorized refetch.

## OpenAPI, Generated Clients, And Contracts

| Item | State | Evidence / notes |
| --- | --- | --- |
| OpenAPI remains the source of truth when contracts are in scope. | `Not reviewed` | |
| Generated web and Dart clients are not hand-edited. | `Not reviewed` | |
| Generated-client diffs, if any, come from the repo generation command and are reviewed with the contract change. | `Not reviewed` | |
| Contract changes preserve API/domain authority for authorization, money, storage access, status transitions, sync acceptance, and audit. | `Not reviewed` | |
| Problem/response shapes avoid account, resource, file, storage, settlement, payment, or private-data enumeration. | `Not reviewed` | |
| Public response examples, schemas, and docs do not include secrets, realistic tokens, provider credentials, storage paths, object keys, signed URLs, private hostnames, or raw sensitive data. | `Not reviewed` | |
| Backward compatibility, additive schemas, stable enums, and versioning are reviewed where relevant. | `Not reviewed` | |
| OpenAPI/generated-client manual gate evidence is linked when actual contract or generated output changes. | `Not reviewed` | |

Escalate to contract review for any OpenAPI path/schema change, generated-client refresh, contract tooling change, unsafe problem shape, manual generated-client edit, or generated client treated as permission.

## Admin, Public Exposure, Deploy, Release, And CI

| Item | State | Evidence / notes |
| --- | --- | --- |
| Admin web/API exposure remains LAN, trusted VPN, Cloudflare Access-style, or equivalent protected access unless a separate public/admin exposure gate passes. | `Not reviewed` | |
| User web/API public exposure, reverse proxy, TLS, allowed hosts/origins, and forwarded headers are explicitly reviewed before runtime changes. | `Not reviewed` | |
| PostgreSQL, RabbitMQ AMQP, RabbitMQ management UI, storage datasets, worker internals, maintenance shells, and private diagnostics are not public. | `Not reviewed` | |
| TrueNAS/Docker/deployment changes preserve private dependency networking, persistent dataset safety, migration mode gates, health/readiness redaction, and no direct storage dataset exposure. | `Not reviewed` | |
| CI, branch protection, scaffold validation, and PR evidence expectations are reviewed for the exact head SHA before merge gates. | `Not reviewed` | |
| Codemagic, TestFlight, App Store, Play Store, signing, release, production deployment, and public promotion remain manual-only when in scope. | `Not reviewed` | |
| Secrets, credentials, environment files, SSH data, Codex auth/session state, signing material, provider dashboards, and private machine config are not changed or exposed. | `Not reviewed` | |
| Health/readiness, logs, reports, screenshots, and operator evidence redact connection strings, passwords, queue details, storage paths, object keys, provider internals, raw exceptions, and secrets. | `Not reviewed` | |

Escalate to deployment/security/release review for any public/admin exposure change, Docker/CI/deployment/runtime network change, secret/signing/provider change, production deploy, mobile store action, destructive migration, or branch protection concern.

## UI Code Review Boundaries

This section is for code review of UI implementation boundaries only. It is not a manual visual/UI retest and does not satisfy #386.

| Item | State | Evidence / notes |
| --- | --- | --- |
| Shared design tokens, theme extensions, common components, typography, spacing, icons, and status treatments are reused consistently where available. | `Not reviewed` | |
| Normal UI does not expose developer-note copy, internal seams, raw identifiers, storage paths, provider internals, secrets, or implementation jargon. | `Not reviewed` | |
| UI controls do not imply unsupported behavior, fake save/apply/sync/publish/release actions, or passed manual gates. | `Not reviewed` | |
| UI hides controls only for usability; API denial/session-expired/conflict/not-visible responses are still handled safely. | `Not reviewed` | |
| Accessibility, readability, semantics, touch targets, error/empty/loading states, and responsive layout are reviewed at code level. | `Not reviewed` | |
| UI route/deep-link handling re-fetches protected resources through authorized APIs and avoids existence leaks. | `Not reviewed` | |
| UI organization keeps generated clients, repositories, local caches, and presentation state separated from authority decisions. | `Not reviewed` | |

Manual visual review, screenshot comparison, Figma/reference approval, device retest, and end-to-end UI acceptance remain separate manual evidence under #386.

## Stop Conditions And Escalation

Stop review and escalate before approval if any of these are found:

- Auth/session/security-critical runtime concern.
- Secret, credential, token, signing, `.env`, SSH, Codex state, provider credential, or private config exposure.
- Storage/file-byte authorization, privacy, direct provider URL, object key, filesystem path, retention, deletion, vault, QR, proof, receipt, OCR, import/export, backup, or restore concern.
- Money, bill, split, settlement, payment, residual, refund, adjustment, lock, revision, payer-confirmation, rounding, currency, calculation, or financial audit concern.
- OpenAPI contract, generated-client, schema, migration, Docker, CI, deployment, release, public/admin exposure, or production/mobile-store concern.
- Client, worker, OCR provider/parser, notification provider, import/export path, or generated client becomes source of truth for authorization, money, settlement state, storage access, sync acceptance, or audit.
- Manual UI retest, manual code review, Day 1 acceptance, production readiness, release readiness, security review, storage review, or money review is being marked passed without explicit human evidence.

Escalation paths:

- Security/auth issue: security reviewer and maintainer.
- Storage/privacy issue: storage/privacy reviewer and maintainer.
- Money/settlement issue: money/domain reviewer and maintainer.
- OpenAPI/generated-client issue: contract reviewer and maintainer.
- Deploy/public/admin/release issue: deployment/release reviewer and maintainer.
- UI/Figma/manual retest issue: #386 reviewer, Figma/design loop, and maintainer.
- Acceptance evidence/hard-gated gap issue: #388 reviewer and maintainer.

## Final Reviewer Decision

This block must remain blank or `Not reviewed` until a human reviewer completes the review.

| Decision field | Value |
| --- | --- |
| Manual code review outcome | `Not reviewed` |
| Reviewer decision | `Needs reviewer` |
| Approved commit SHA | `Needs reviewer` |
| Blocking findings | `Needs reviewer` |
| Required follow-up issues | `Needs reviewer` |
| Manual UI retest #386 status | `Not reviewed` |
| Day 1 acceptance status | `Not reviewed` |
| Security/storage/money/deployment review status | `Not reviewed` |
| Reviewer signature/name | `Needs reviewer` |
| Decision timestamp | `Needs reviewer` |
