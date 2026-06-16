# Current Milestone

- ID: `M10`
- Name: `Day 1 Mobile Self Profile And Payment Details Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M9`

## Goal

Advance the next Day 1 blocker after the M9 mobile in-app notification inbox checkpoint by hardening the existing authenticated mobile self profile and text payment-details surface. M10 is intentionally mobile and self-profile/payment-details focused: it improves state reconciliation, text payment-detail edit/readout clarity, visibility messaging, safe failure/retry behavior, and QA coverage while preserving API/domain authority for current actor resolution, payment-detail authorization, audit, storage/file access, QR byte handling, privacy/vault policy, auth/session state, and settlement-scoped counterparty visibility.

Repo-state basis for this milestone:

- `README.md` says the backend has guarded self-profile read/update endpoints, guarded self payment-details read/update and self QR endpoints, and the mobile app has a starter authenticated self profile/payment-details screen backed by generated-client repository seams.
- `docs/prd/MVP_DAY1_SCOPE.md` requires users to configure optional profile/payment details, including display name, preferred currency, preferred payment method note, optional payment handle or note, optional QR/payment image attachment, and a visibility setting whose recommended default is `settlement_counterparties_only`.
- `docs/architecture/PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md` says payment details are sensitive app-domain profile data, must not be globally visible, must be API-authorized, and must not expose storage paths, provider internals, QR bytes, vault internals, raw request bodies, tokens, secrets, or unrelated user data.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` says the mobile self profile/payment-details foundation reads and updates the authenticated actor's own profile and text payment details through generated-client repository seams, loads fresh data when opened, maps failures into bounded mobile states, and displays safe QR availability metadata without QR upload/remove UX.
- Current mobile code under `apps/mobile/lib/profile/` and focused tests under `apps/mobile/test/profile_*` provide bounded seams for mobile-only profile/payment-details hardening without requiring API, contract, generated-client, schema, auth/session, storage/privacy, QR byte, settlement, money, deployment, or unrelated-domain changes.

## Allowed Scope For Future M10 Tasks

- Mobile self profile and payment-details repository, generated-client mapping, models, edit/readout state, visibility copy, QR metadata display, and safe failure handling in `apps/mobile/lib/profile/`.
- Existing authenticated app-shell entry points in `apps/mobile/lib/app/` only when needed to preserve self profile/payment-details routing or repository injection.
- Focused mobile tests for self profile/payment-details repository mapping, screen loading/editing, visibility labels, QR metadata readout, bounded failure/retry states, duplicate-submit prevention, refresh-after-save behavior, unsafe text suppression, and server-authority copy in `apps/mobile/test/`.
- M10 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M10 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Storage/file privacy policy, file authorization policy, QR/proof/receipt byte behavior, generic public file APIs, or private-vault behavior.
- Self payment QR upload, replace, remove, content-read UX, platform file/image picker dependencies, image normalization policy, camera/gallery permissions, or QR byte rendering beyond safe metadata already returned by the existing profile seam.
- Money, bill, settlement, residual, balance, reconciliation, recurring generation, OCR apply, or business status-transition authority.
- Counterparty payment-details authorization changes, settlement-scoped visibility policy changes, global user/profile lookup, group-directory payment-detail exposure, admin/support payment-detail viewing, or client-side authorization decisions from cached profile/payment rows.
- Docker/deployment/env/CI config.
- Production secrets.
- Payment provider integrations, direct bank sync, provider webhook behavior, statement import/matching, CSV import/export, backup/restore, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain work.
- Day 1 scope reduction or architecture direction replacement.

## Done Criteria

- Current mobile self profile and payment-details implementation is reconciled against Day 1 profile/payment requirements and captured in a QA map.
- Profile and payment-details reads/edits preserve server-returned actor-owned facts, default/unconfigured states, visibility values, QR metadata availability, and timestamps without exposing unsafe raw IDs, storage/provider internals, QR bytes, vault internals, tokens, request bodies, or unrelated user data.
- Save/update flows preserve duplicate-submit prevention, bounded session/denied/unavailable/conflict/validation/network/server failure states, retry behavior, refresh-after-save recovery, and server-authority messaging.
- Visibility and QR metadata copy explains that the API decides who can see payment details, that payment details are not globally visible, and that QR upload/remove/content handling remains a separate file-handling slice.
- M10 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M10 ends in a bounded controller stop state before backend/API, OpenAPI/contracts, generated clients, schema, auth/session/security, storage/privacy, QR byte behavior, money/settlement/bill/recurring/OCR authority, deployment, web/admin, broad offline sync/cache, or unrelated major-domain work.

## Current Task Pointer

- Current task: `M10-003-MOBILE-PAYMENT-VISIBILITY-READOUT-HARDENING-20260616-1110`.
- Last completed task: `M10-002-MOBILE-PROFILE-PAYMENT-EDIT-HARDENING-20260616-1110`.
- Current state: M10-002 hardened the existing mobile self profile and text payment-details edit flows for bounded normalization copy, duplicate-submit guards, safe failure handling, refresh-after-save recovery, unsafe edit-text suppression, and server-authority messaging without runtime API, generated-client, auth/session, schema, storage/privacy, QR-byte, payment-detail visibility-policy, counterparty-authorization, money, deployment, or unrelated-domain changes. M10 remains active as a bounded Day 1 mobile self profile and payment-details hardening milestone. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
- Recommended next automated task: `M10-003-MOBILE-PAYMENT-VISIBILITY-READOUT-HARDENING-20260616-1110`.
- Stop sentinel: `STOP-M10-001` stops API/contracts/generated-client/auth/schema/storage/privacy/QR-byte/money/deployment, payment-detail visibility policy, counterparty authorization, admin/global payment-detail exposure, web/admin, broad offline sync/cache, or unrelated major-domain scope.

## M9 Carry-Forward Boundary

M9 is finalized as `Day 1 Mobile In-App Notification Inbox Hardening` and remains awaiting deferred Day 1 acceptance review. M10 must not expand M9 ad hoc into notification delivery providers, push/email delivery, device-token registration, notification preferences, quiet hours, digests, reminder scheduling, server-side notification generation policy, notification queue/worker behavior, notification deep links/background delivery, linked-resource authorization changes, web/admin runtime, broad offline sync/cache, or generated-client/API changes.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
