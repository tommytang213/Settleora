# Architecture Docs

The canonical high-level architecture summary is [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md) at the repository root.

This directory keeps supporting architecture and release-process notes.

- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md): auth/account versus profile boundaries, session and authorization rules, role separation, audit requirements, and non-goals before auth or user/group endpoint implementation.
- [Auth credentials, sessions, and audit design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md): local password credential, session metadata, auth audit schema foundation, future passkey/MFA direction, retention, and non-goals before auth runtime implementation.
- [Auth credential workflow design](AUTH_CREDENTIAL_WORKFLOW_DESIGN.md): design-only credential creation, password verification, rehash, audit, transaction, and service-boundary rules for future local password workflows.
- [Auth runtime and current-user design](AUTH_RUNTIME_CURRENT_USER_DESIGN.md): design-only local sign-in, session validation, token boundary, current-user, authenticated actor, audit, and authorization handoff rules before runtime auth implementation.
- [Auth refresh-token rotation policy](AUTH_REFRESH_TOKEN_ROTATION_POLICY.md): design-only refresh-like credential rotation, replay detection, session-family revocation, expiry, audit, privacy, and operational boundaries.
- [Auth sign-in abuse policy](AUTH_SIGN_IN_ABUSE_POLICY.md): account enumeration resistance, rate limiting, lockout/throttling, credential-stuffing defense, audit categories, and diagnostics boundaries before login/sign-in endpoints.
- [Password hashing policy](PASSWORD_HASHING_POLICY.md): local-account password hashing algorithm, salt, pepper, work-factor, verifier storage, and rehash policy.
- [Password hashing implementation design](PASSWORD_HASHING_IMPLEMENTATION_DESIGN.md): library evaluation, internal service boundary, verifier storage direction, benchmark plan, and non-goals for auth workflow work.
- [Database foundation](DATABASE_FOUNDATION.md): database authority boundaries, PostgreSQL/EF Core direction, migration rules, schema boundaries, and non-goals before persistence implementation.
- [OCR architecture](OCR_ARCHITECTURE.md): canonical OCR architecture for required on-device OCR, complementary server-side OCR worker responsibilities, authority boundaries, offline flow, and validation rules.
- [Currency exchange architecture](CURRENCY_EXCHANGE_ARCHITECTURE.md): Day 2 FX provider, exchange-rate storage, bill-level snapshot, recalculation, and audit rules.
- [Statement reconciliation architecture](STATEMENT_RECONCILIATION_ARCHITECTURE.md): Day 2 statement import, matching, tolerance, payment-method, FX, privacy, and audit rules.
- [Lock, refund, and group governance architecture](LOCK_REFUND_GOVERNANCE_ARCHITECTURE.md): Day 2 period/final lock, group approval, refund, reimbursement, and audit rules.
- [Group membership and participation architecture](GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md): Day 2 member type, participation status, default selection, authorization, notification, and audit rules.
- [AI insights architecture](AI_INSIGHTS_ARCHITECTURE.md): Day 3 AI provider mode, data sharing, authorized access, deterministic reporting, sensitive data, and audit rules.
