# Architecture Docs

The canonical high-level architecture summary is [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md) at the repository root.

This directory keeps supporting architecture and release-process notes.

- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md): auth/account versus profile boundaries, session and authorization rules, role separation, audit requirements, and non-goals before auth or user/group endpoint implementation.
- [Auth credentials, sessions, and audit design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md): local password credential, session metadata, auth audit schema foundation, future passkey/MFA direction, retention, and non-goals before auth runtime implementation.
- [Password hashing policy](PASSWORD_HASHING_POLICY.md): local-account password hashing algorithm, salt, pepper, work-factor, verifier storage, and rehash policy.
- [Password hashing implementation design](PASSWORD_HASHING_IMPLEMENTATION_DESIGN.md): library evaluation, internal service boundary, verifier storage direction, benchmark plan, and non-goals for auth workflow work.
- [Database foundation](DATABASE_FOUNDATION.md): database authority boundaries, PostgreSQL/EF Core direction, migration rules, schema boundaries, and non-goals before persistence implementation.
- [OCR architecture](OCR_ARCHITECTURE.md): canonical OCR architecture for required on-device OCR, complementary server-side OCR worker responsibilities, authority boundaries, offline flow, and validation rules.
