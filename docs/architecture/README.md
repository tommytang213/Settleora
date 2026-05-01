# Architecture Docs

The canonical high-level architecture summary is [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md) at the repository root.

This directory keeps supporting architecture and release-process notes.

- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md): auth/account versus profile boundaries, session and authorization rules, role separation, audit requirements, and non-goals before auth or user/group endpoint implementation.
- [Auth credentials, sessions, and audit design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md): local password credential, session metadata, auth audit schema foundation, future passkey/MFA direction, retention, and non-goals before auth runtime implementation.
- [Database foundation](DATABASE_FOUNDATION.md): database authority boundaries, PostgreSQL/EF Core direction, migration rules, schema boundaries, and non-goals before persistence implementation.
- [OCR architecture](OCR_ARCHITECTURE.md): canonical OCR architecture for required on-device OCR, complementary server-side OCR worker responsibilities, authority boundaries, offline flow, and validation rules.
