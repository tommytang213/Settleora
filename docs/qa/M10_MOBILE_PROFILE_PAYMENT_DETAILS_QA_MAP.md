# M10 Mobile Self Profile And Payment Details QA Map

Status: `M10 active; first queued task is M10-001; manual UI/code review deferred until Day 1 acceptance`

## Boundary

M10 hardens the mobile self profile and text payment-details UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy or file authorization policy changes, QR/proof/receipt byte behavior changes, self payment QR upload/remove/content UX, platform file/image picker dependencies, image normalization, camera/gallery permissions, private-vault behavior, money/bill/settlement/recurring/OCR authority changes, payment-detail visibility policy changes, counterparty authorization changes, global profile/payment lookup, admin/support payment-detail viewing, deployment, Docker, CI, secrets, web/admin runtime UI, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M10.

## Selection Basis

- `README.md` records guarded self-profile and self payment-details endpoints, self QR endpoints, settlement-scoped counterparty payment-detail/QR reads, and a starter authenticated mobile self profile/payment-details screen.
- `docs/prd/MVP_DAY1_SCOPE.md` requires Day 1 users to configure optional payment details, including display name, preferred currency, preferred payment method note, optional payment handle/note, optional QR/payment image attachment, and visibility with a recommended default of `settlement_counterparties_only`.
- `docs/architecture/PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md` defines payment details as sensitive app-domain profile data that must never be globally visible, must be API-authorized, and must avoid exposing storage paths, provider internals, QR bytes, vault internals, request bodies, tokens, secrets, or unrelated user data.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records that the mobile self profile/payment-details foundation reads and updates the authenticated actor's own profile and text payment details through generated-client repository seams, loads fresh data when opened, maps failures into bounded mobile states, and displays safe QR availability metadata without QR upload/remove UX.
- Current mobile files under `apps/mobile/lib/profile/` and focused tests under `apps/mobile/test/profile_*` provide bounded seams for mobile-only hardening.

## Current Repository And Model Inventory

`apps/mobile/lib/profile/profile_repository.dart` is the hand-written mobile boundary for self profile and payment details.

- The repository seam represents authenticated self profile fields such as display name and default currency.
- The payment-details seam represents text payment configuration, configured/unconfigured state, visibility, and safe QR metadata availability.
- Failure kinds must stay bounded as session-required, session-expired, denied, unavailable, conflict, validation, network, and server where supported by the current profile seam.
- Mobile models and UI helpers may format server-returned profile/payment fields for display, but they must not decide current actor identity, payment-detail authorization, counterparty visibility, QR byte access, audit, storage policy, vault behavior, or settlement eligibility.

`apps/mobile/lib/profile/generated_profile_repository.dart` adapts the generated Dart client into the hand-written profile seam.

- Token/session handling must read the access token through the approved mobile access-token provider per operation.
- Self reads and updates must use the authenticated `users/me` generated-client routes and must not submit actor IDs, profile IDs, auth account IDs, file object IDs as authority, storage provider details, or settlement/counterparty claims.
- Generated failures must be reduced to bounded mobile failures before visible UI display.
- Generated-client availability is not permission; the API remains authoritative for current actor resolution, profile mutation rights, payment-detail visibility, QR metadata/content access, and audit.

`apps/mobile/lib/profile/profile_screen.dart` is the existing mobile profile/payment-details screen.

- The screen should load fresh self profile and payment details when opened.
- It should show unconfigured/default payment-detail states without implying global visibility or counterparty access.
- It should show visibility values and QR metadata availability as server-returned profile facts only.
- It should keep raw IDs, API paths, storage paths, provider URLs, object keys, QR bytes, vault internals, request bodies, tokens, stack traces, and unrelated user data out of visible copy.
- Save/update actions should prevent duplicate submits, surface bounded validation/session/denied/conflict/network/server failures, and recover through server-authoritative reloads when a save succeeds.

## Day 1 Requirement Map

| Day 1 profile/payment requirement | Current state | M10 implication |
| --- | --- | --- |
| Display name | Self profile endpoint and mobile profile seam exist. | M10-001 reconciles current coverage; M10-002 may harden edit/readout UX only. |
| Preferred currency | Self profile endpoint and mobile profile seam exist. | M10-002 may harden field state and safe validation copy without money authority. |
| Preferred payment method note | Self payment-details endpoint and mobile seam exist. | M10-002 may harden text edit and unconfigured/default states. |
| Optional payment handle or user-entered note | Self payment-details endpoint and mobile seam exist. | M10-002 may harden edit/failure behavior and unsafe text suppression. |
| Visibility setting | API supports constrained values and mobile can display/update through generated-client seam. | M10-003 may harden labels/copy without changing visibility policy. |
| Optional QR/payment image attachment | API and generated clients include self QR endpoints, and mobile displays safe QR availability metadata. | QR upload/remove/content UX and byte rendering are explicit non-goals for M10; M10-003 may only harden safe metadata readout/copy. |
| Payment details not globally visible | Architecture requires API authorization and no global lookup. | M10-003 should make server-authority and non-global visibility clear without client-side authorization decisions. |
| Settlement-scoped counterparty visibility | Backend has settlement-scoped counterparty reads. | M10 does not alter counterparty endpoints or settlement authorization; it may only clarify self-profile copy. |

## Queue Expectations

- `M10-001-MOBILE-PROFILE-PAYMENT-STATE-RECONCILE-20260616-1110` - Queued. Reconcile current mobile self profile/payment-details implementation and automated coverage without runtime behavior changes.
- `M10-002-MOBILE-PROFILE-PAYMENT-EDIT-HARDENING-20260616-1110` - Queued. Harden existing profile/payment edit states, duplicate-submit prevention, bounded failures, refresh-after-save recovery, and server-authority copy inside current mobile seams.
- `M10-003-MOBILE-PAYMENT-VISIBILITY-READOUT-HARDENING-20260616-1110` - Queued. Harden visibility labels, sensitive-data copy, QR metadata readout, and unsafe text suppression without adding QR byte handling or visibility-policy changes.
- `M10-004-MOBILE-PROFILE-PAYMENT-QA-FINALIZE-20260616-1110` - Queued. Finalize M10 QA/control state, record validation, preserve deferred manual UI/code review status, and mark UI-test ready only after bounded slices complete.
- `STOP-M10-001` - Preserve. Stop for forbidden API/contracts/generated-client/auth/schema/storage/privacy/QR-byte/payment-visibility/counterparty-authorization/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## Validation Expectations

M10 kickoff validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

The kickoff controller dry run should select `M10-001-MOBILE-PROFILE-PAYMENT-STATE-RECONCILE-20260616-1110`.

## Stop Conditions And Non-Goals

Stop and report `BLOCKED` if an M10 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy or authorization policy changes, QR/proof/receipt byte behavior, self QR upload/remove/content UX, platform file/image picker dependencies, image normalization, camera/gallery permissions, private-vault behavior, payment-detail visibility policy changes, counterparty authorization changes, global lookup, group-directory payment exposure, admin/support payment-detail viewing, client-side authorization decisions from cached rows, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Non-goals preserved through M10: no backend/API behavior, no OpenAPI or generated-client changes, no schema/auth/storage/privacy/QR-byte/money/business authority changes, no payment-detail visibility policy or counterparty authorization changes, no manual UI/code review pass, and no merge without the required PR/CI/merge gates.
