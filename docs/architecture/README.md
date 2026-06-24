# Architecture Docs

The canonical high-level architecture summary is [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md) at the repository root.

This directory keeps supporting architecture and release-process notes.

- [Settleora Cloud SaaS readiness](SETTLEORA_CLOUD_SAAS_READINESS.md): future optional managed single-tenant/workspace hosting boundaries, explicit migration/export rules, subscription entitlement limits, and non-goals for shared multi-tenant SaaS and federation.
- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md): auth/account versus profile boundaries, session and authorization rules, role separation, audit requirements, and non-goals before auth or user/group endpoint implementation.
- [Auth credentials, sessions, and audit design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md): local password credential, session metadata, auth audit schema foundation, future passkey/MFA direction, retention, and non-goals before auth runtime implementation.
- [Auth credential workflow design](AUTH_CREDENTIAL_WORKFLOW_DESIGN.md): design-only credential creation, password verification, rehash, audit, transaction, and service-boundary rules for future local password workflows.
- [Auth runtime and current-user design](AUTH_RUNTIME_CURRENT_USER_DESIGN.md): design-only local sign-in, session validation, token boundary, current-user, authenticated actor, audit, and authorization handoff rules before runtime auth implementation.
- [Auth refresh-token rotation policy](AUTH_REFRESH_TOKEN_ROTATION_POLICY.md): design-only refresh-like credential rotation, replay detection, session-family revocation, expiry, audit, privacy, and operational boundaries.
- [Auth sign-in abuse policy](AUTH_SIGN_IN_ABUSE_POLICY.md): account enumeration resistance, rate limiting, lockout/throttling, credential-stuffing defense, audit categories, and diagnostics boundaries before login/sign-in endpoints.
- [Mobile auth, session, and API client flow](MOBILE_AUTH_SESSION_CLIENT_FLOW.md): mobile server-mode setup, sign-in/session UX, secure token handling, generated-client injection, and self-hosted deployment rules before live mobile auth wiring.
- [Password hashing policy](PASSWORD_HASHING_POLICY.md): local-account password hashing algorithm, salt, pepper, work-factor, verifier storage, and rehash policy.
- [Password hashing implementation design](PASSWORD_HASHING_IMPLEMENTATION_DESIGN.md): library evaluation, internal service boundary, verifier storage direction, benchmark plan, and non-goals for auth workflow work.
- [Database foundation](DATABASE_FOUNDATION.md): database authority boundaries, PostgreSQL/EF Core direction, migration rules, schema boundaries, and non-goals before persistence implementation.
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md): Day 1 storage abstraction, file metadata, upload/download authorization, sensitive file lifecycle, and storage non-goals before implementation.
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md): Day 1 user-selectable Standard Secure Mode and Recoverable Private Vault for selected sensitive data, future-compatible Strict Private Vault, and recovery/migration boundaries without authorizing implementation.
- [Payment details visibility architecture](PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md): Day 1 payment-detail concepts, default visibility, storage/QR boundaries, privacy-vault interaction, audit, and future API direction without authorizing implementation.
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md): Day 1 decimal-safe money, currency, rounding, allocation, validation, persistence, audit, and API direction before expense, bill, or settlement runtime implementation.
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md): Day 1 implementation-facing boundaries for core bills, splits, settlement state, balances, authorization, audit, storage/OCR interaction, and future slicing before runtime implementation.
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md): Day 1 design gate for server-authoritative settlement request creation, payment claims, receiver confirmation, dispute, cancellation, proof linkage, privacy, audit, and rebuildable balance projections before endpoint implementation.
- [Notification event taxonomy](NOTIFICATION_EVENT_TAXONOMY.md): Day 1 notification event family ownership, safe payload rules, in-app baseline behavior, delivery-state vocabulary, privacy exclusions, audit expectations, and validation boundaries.
- [OCR architecture](OCR_ARCHITECTURE.md): canonical OCR architecture for required on-device OCR, complementary server-side OCR worker responsibilities, authority boundaries, offline flow, and validation rules.
- [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md): current-state policy for the landed draft-only receipt OCR review apply operation, plus boundaries for future wider apply, finalization, revision, worker, and UI behavior.
- [Receipt OCR review UX flow](RECEIPT_OCR_REVIEW_UX_FLOW.md): mobile-first UX gate for receipt capture, OCR review, apply-preview, explicit draft apply, permissions, blocked states, and privacy before UI implementation.
- [Currency exchange architecture](CURRENCY_EXCHANGE_ARCHITECTURE.md): Day 2+ currency registry, FX provider/cache storage, common-currency materialization, bill-level snapshots, group/context FX profiles, approval, bill-create UX, recalculation, and audit rules.
- [User experience modes architecture](USER_EXPERIENCE_MODES_ARCHITECTURE.md): simple/guided/advanced presets, per-feature advanced toggles, visibility resolution, and the rule that UI mode does not change backend authority.
- [Statement reconciliation architecture](STATEMENT_RECONCILIATION_ARCHITECTURE.md): Day 2 statement import, matching, tolerance, payment-method, FX, privacy, and audit rules.
- [Lock, refund, and group governance architecture](LOCK_REFUND_GOVERNANCE_ARCHITECTURE.md): Day 2 period/final lock, group approval, refund, reimbursement, and audit rules.
- [Group membership and participation architecture](GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md): Day 2 member type, participation status, default selection, authorization, notification, and audit rules.
- [AI insights architecture](AI_INSIGHTS_ARCHITECTURE.md): Day 3 AI provider mode, data sharing, authorized access, deterministic reporting, sensitive data, and audit rules.
