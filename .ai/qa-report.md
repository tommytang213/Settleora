# AI QA Report

Status: `M12 queued; M12-001 selected; M11 finalized/UI-test ready; manual UI/code review deferred until Day 1 acceptance`

## M12 Kickoff Summary

M12 is queued as `Day 1 Mobile Settings, Mode Boundary, And Data Portability Readiness`.

The selection is based on current repo state:

- `README.md` says mobile first-launch local/server configuration, secure-storage-backed app/session state, authenticated server shell, profile/payment details, session/device management, and sync readouts exist, while full offline cache hydration and broader product UI remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires CSV export, CSV import, local backup/restore, explicit local/server authority boundaries, and no silent merge between local-only and server/cloud data.
- `docs/ux/UI_UX_FOUNDATION.md` requires local mode and server mode to be visually and behaviorally distinct, local-to-server import/link and server-to-local export/disconnect to be explicit guided flows, and local profile data to never silently become a server account.
- `docs/ux/SCREEN_INVENTORY.md` identifies mobile Settings as the surface for user preferences, privacy, local/server mode, exports, account/session access, and destructive warnings.
- `docs/architecture/USER_EXPERIENCE_MODES_ARCHITECTURE.md` keeps UI modes and toggles as visibility/workflow-depth controls only, without changing backend authority.
- Current mobile code under `apps/mobile/lib/app/` and `apps/mobile/lib/profile/`, plus focused tests under `apps/mobile/test/`, provide bounded seams for mobile-only state/copy hardening without requiring API, OpenAPI, generated-client, schema, auth/security runtime, storage/privacy, real data-portability runtime, money, deployment, web/admin, or unrelated changes.

M12 queue:

- `M12-001-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-STATE-RECONCILE-20260616-1517` - Queued. Reconcile current mobile first-launch, local/server mode, authenticated settings/profile/account, sync-status, and data-portability readiness state without runtime behavior changes.
- `M12-002-MOBILE-FIRST-LAUNCH-MODE-BOUNDARY-HARDENING-20260616-1517` - Queued. Harden first-launch/setup/local/server mode boundary copy and tests inside existing mobile app seams.
- `M12-003-MOBILE-SETTINGS-DATA-PORTABILITY-READOUT-HARDENING-20260616-1517` - Queued. Harden authenticated settings/profile/account data-portability placeholder/readout states without adding real data-portability runtime.
- `M12-004-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-QA-FINALIZE-20260616-1517` - Queued. Finalize M12 QA/control state after bounded slices complete.
- `STOP-M12-001` - Stop. Manual gate for real data-portability runtime, API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

M12 kickoff changes only `.ai` control files, the M12 QA map, and a narrow M12 scope-guard allowlist. It does not change runtime product behavior, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token issuance, refresh rotation, revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, private-vault behavior, real CSV import/export, local backup/restore, migration/link/disconnect/export runtime, file byte behavior, money/bill/settlement/recurring/OCR/reconciliation authority, import-driven financial mutation, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope, or architecture direction.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed. Recommended next automated task is `M12-001-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-STATE-RECONCILE-20260616-1517`.

## M11 Kickoff Summary

M11 is queued as `Day 1 Mobile Account Session And Device Management Hardening`.

The selection is based on current repo state:

- `README.md` says the mobile app has first-launch local/server configuration, secure-storage-backed app/session state boundaries, a minimal authenticated server-mode shell with refresh, logout, session list, and per-session revocation.
- `docs/prd/MVP_DAY1_SCOPE.md` requires user registration/login foundations, secure sessions, revocation-ready sessions, device/session visibility, API-enforced role and permission checks, and security-impactful audit boundaries.
- `docs/features/auth-session/FUNCTIONAL_SPEC.md` requires users to understand active sessions/devices, revoke sessions, sign out, and see only safe own-session metadata.
- `docs/features/auth-session/TECHNICAL_SPEC.md` keeps auth/session/credential/audit writes API-owned and forbids raw tokens, password material, provider secrets, and MFA/passkey secrets from logs, audit, responses, and UI.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records the existing mobile auth/session lifecycle shell, secure storage boundary, access-token refresh provider, current-session logout, account-wide sign-out, session/device list, and per-session revocation.
- Current mobile code under `apps/mobile/lib/app/` and focused tests under `apps/mobile/test/auth_session_repository_test.dart`, `apps/mobile/test/secure_storage_test.dart`, and `apps/mobile/test/widget_test.dart` provide bounded seams for mobile-only hardening.

M11 queue:

- `M11-001-MOBILE-ACCOUNT-SESSION-STATE-RECONCILE-20260616-1315` - Completed. Reconciled current mobile account/session implementation and automated coverage without runtime behavior changes.
- `M11-002-MOBILE-SESSION-LIST-REVOKE-HARDENING-20260616-1315` - Completed. Hardened session/device list and per-session revoke UI inside existing mobile seams.
- `M11-003-MOBILE-SIGNOUT-REFRESH-SESSION-HARDENING-20260616-1315` - Completed. Hardened current-session sign-out, account-wide sign-out, server-unreachable local clear, expired-session, and access-token refresh behavior inside existing mobile seams.
- `M11-004-MOBILE-ACCOUNT-SESSION-QA-FINALIZE-20260616-1315` - Completed. Finalized M11 QA/control state after bounded slices completed.
- `STOP-M11-001` - Stop. Manual gate for API/contracts/generated-client/auth/session/security runtime/schema/token/credential/password/OIDC/MFA/passkey/recovery/admin/audit-policy/storage/privacy/money/deployment/import/export/backup/web-admin/broad-sync/secrets/unrelated scope.

M11 kickoff changed only `.ai` control files, the M11 QA map, and a narrow M11 scope-guard allowlist. It did not change runtime product behavior, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token issuance, refresh rotation, revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR authority, import/export/backup runtime, deployment/CI, web/admin runtime, broad offline cache/sync, secrets, or unrelated major-domain behavior.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed. M11 is UI-test ready for deferred Day 1 acceptance review. Recommended next automated action is the user-requested post-M11 docs-only FX/currency/UX architecture task before the next normal implementation milestone, unless the controller reports a stricter blocker.

## M11-001 Reconciliation Summary

Updated `docs/qa/M11_MOBILE_ACCOUNT_SESSION_QA_MAP.md` as the current control/QA map for M11. The map records:

- Current mobile auth/session repository model inventory for sign-in submission boundaries, server session material, current-user state, session summaries and safe labels, bounded auth failure kinds, generated/transport failure mapping, and the explicit rule that mobile formatting is not authority.
- Secure storage and access-token refresh inventory for app/server configuration storage, session material storage, fail-closed missing/blank/expired/rejected material, refresh with usable refresh material, unauthorized refresh local clearing, in-flight refresh sharing, fallback behavior, and token/refresh credential suppression.
- Mobile screen/session UI inventory for first-launch local/server mode, sign-in validation and storage, authenticated shell entry after current-user validation, session list entry and current-user context, safe session/device metadata display, current-session marker/protection, per-session revoke, current-session sign-out, server-unreachable local-clear confirmation, account-wide sign-out, and session-required/session-expired callback behavior.
- Automated coverage inventory across `auth_session_repository_test.dart`, `secure_storage_test.dart`, `widget_test.dart`, and relevant app-shell/dashboard tests, plus known gaps for M11-002 and M11-003.
- Day 1 requirement mapping for server-mode login, secure sessions, revocation-ready sessions, device/session visibility, API-enforced role/permission checks, audit boundaries, and local-only mode boundaries.
- Remaining M11 focus for M11-002 session/device list and per-session revoke hardening, M11-003 sign-out/refresh/session hardening, and M11-004 QA finalization.

M11-001 changed only `.ai` control files and the M11 QA map. It did not change mobile runtime behavior, tests, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token issuance, refresh rotation, revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR authority, import/export/backup runtime, deployment/CI, web/admin runtime, broad offline cache/sync, secrets, or unrelated major-domain behavior.

## M10 Kickoff Summary

M10 is queued as `Day 1 Mobile Self Profile And Payment Details Hardening`.

The selection is based on current repo state:

- `README.md` says the backend has guarded self-profile read/update endpoints, guarded self payment-details read/update and self QR endpoints, and the mobile app has a starter authenticated self profile/payment-details screen backed by generated-client seams.
- `docs/prd/MVP_DAY1_SCOPE.md` requires optional user profile/payment details, including display name, preferred currency, preferred payment method note, optional payment handle or note, optional QR/payment image attachment, and a visibility setting whose recommended default is `settlement_counterparties_only`.
- `docs/architecture/PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md` requires payment details to remain sensitive app-domain profile data, not globally visible, API-authorized, and free of storage paths, provider internals, QR bytes, vault internals, request bodies, tokens, secrets, and unrelated user data in ordinary responses/copy.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records an existing mobile self profile/payment-details foundation that reads and updates the authenticated actor's own profile and text payment details through generated-client repository seams, loads fresh data when opened, maps failures into bounded mobile states, and displays safe QR availability metadata without QR upload/remove UX.
- Current mobile code under `apps/mobile/lib/profile/` and focused tests under `apps/mobile/test/profile_*` provide bounded seams for mobile-only hardening.

M10 queue:

- `M10-001-MOBILE-PROFILE-PAYMENT-STATE-RECONCILE-20260616-1110` - Completed. Reconciled current mobile self profile/payment-details implementation and automated coverage without runtime behavior changes.
- `M10-002-MOBILE-PROFILE-PAYMENT-EDIT-HARDENING-20260616-1110` - Completed. Hardened existing profile/payment edit states, duplicate-submit prevention, bounded failures, refresh-after-save recovery, and server-authority copy inside current mobile seams.
- `M10-003-MOBILE-PAYMENT-VISIBILITY-READOUT-HARDENING-20260616-1110` - Completed. Hardened visibility labels, sensitive-data copy, QR metadata readout, and unsafe text suppression without adding QR byte handling or visibility-policy changes.
- `M10-004-MOBILE-PROFILE-PAYMENT-QA-FINALIZE-20260616-1110` - Completed. Finalized M10 QA/control state after bounded slices completed.
- `STOP-M10-001` - Stop. Manual gate for API/contracts/generated-client/auth/schema/storage/privacy/QR-byte/payment-visibility/counterparty-authorization/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

M10 kickoff changed only `.ai` control files, the M10 QA map, and a narrow M10 scope-guard allowlist. It did not change runtime product behavior, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime, schema/migrations, storage/privacy/file authorization, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR authority, payment-detail visibility policy, counterparty authorization, deployment/CI, web/admin runtime, broad offline cache/sync, secrets, or unrelated major-domain behavior.

## M10-001 Reconciliation Summary

Updated `docs/qa/M10_MOBILE_PROFILE_PAYMENT_DETAILS_QA_MAP.md` as the current control/QA map for M10. The map records:

- Current mobile profile/payment repository model inventory for authenticated self profile fields, text payment details, configured/unconfigured state, visibility values, safe QR metadata, timestamps, and bounded failure kinds.
- Generated-client repository mapping for per-call session token lookup, self `users/me` profile and payment-detail operations, local input trimming/validation, safe QR metadata mapping, and generated/transport failure reduction.
- Mobile screen inventory for load/refresh/retry states, profile edit, payment text edit, visibility dropdown, duplicate-submit guards, empty payment state, QR metadata-only readout, safe failure panels, cancel behavior, and unsafe raw-value suppression.
- App-shell inventory for bootstrap-time generated profile repository creation after current-user validation and authenticated server-shell routing through the injected repository.
- Automated coverage across `profile_generated_repository_test.dart`, `profile_screen_test.dart`, and profile/payment-adjacent dashboard/server-shell tests.
- Day 1 requirement mapping for display name, preferred currency, payment method/note/handle, visibility, optional QR attachment metadata, non-global visibility, and settlement-scoped counterparty boundaries.
- Remaining focus for M10-002 edit hardening, M10-003 visibility/QR metadata readout hardening, and M10-004 QA finalization.

Current implementation findings:

- Mobile profile/payment models preserve server-returned actor-owned facts and safe QR availability metadata while avoiding QR bytes, QR file IDs in the hand-written model, storage/provider internals, vault internals, tokens, request bodies, and unrelated user data.
- Generated profile repository calls are session-gated, read the token per operation, normalize submitted profile/payment fields before generated calls, and map generated/transport failures into bounded mobile failure kinds.
- The profile screen already supports fresh load on open, profile/payment readout, text edits, visibility selection, duplicate-submit guards, cancel, safe empty states, QR metadata-only copy, retry/sign-in-required failure paths, and focused unsafe-value suppression coverage.
- App-shell profile access is routed through injected repository composition after current-user validation; generated-client availability and local route state remain non-authoritative.
- No mobile runtime or test files were changed by M10-001.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed. M10 is now finalized and UI-test ready; recommended next automated action is to run the AI V3 controller for the next controller-approved Day 1 milestone or queue kickoff.

## M11-002 Session List/Revoke Hardening Summary

M11-002 completed mobile session/device list and per-session revoke hardening inside existing mobile seams:

- Session list copy now states API-returned rows are display metadata only and the server decides session validity and revocation.
- Current-session rows remain protected from per-session revoke and explain that current-session sign-out belongs to the main sign-out flow.
- Non-current session revoke now uses explicit non-dismissible destructive confirmation, blocks duplicate confirmation/revoke attempts, and shows in-flight state only while the server revoke call is active.
- Successful per-session revoke reloads the server-authoritative session list.
- If revoke succeeds but the follow-up reload fails, the UI preserves the previously loaded safe readout, disables another per-session revoke, and asks the user to refresh sessions before retrying instead of repeating the revoke blindly.
- Empty and preserved-failure copy stays bounded and avoids raw session IDs, tokens, refresh credentials, token hashes, auth account IDs, provider payloads, API paths, stack traces, secrets, and unrelated user data.

Focused automated coverage:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/widget_test.dart` passed with 25 tests during implementation.
- Added widget coverage for display-only/server-authority copy, current-session protection, destructive confirmation, duplicate revoke prevention, refresh-after-revoke behavior, refresh-failure preservation, retry recovery, and unsafe raw-value suppression.
- Required focused validation passed with 77 tests.
- Full mobile validation passed with 707 Flutter tests.

At M11-002 completion, M11-003 became current, M11-004 remained queued, `STOP-M11-001` remained preserved, M11 was not UI-test ready until M11-004 finalization, and manual UI retest/manual code review remained deferred until Day 1 acceptance and were not passed.

## M11-003 Sign-Out/Refresh Session Hardening Summary

M11-003 completed mobile current-session sign-out, account-wide sign-out, server-unreachable local-clear confirmation, expired-session routing, and refresh fail-closed hardening inside existing mobile seams:

- Current-session sign-out now uses explicit bounded copy that normal sign-out asks the server to end the current session before local session material is cleared.
- Current-session sign-out blocks duplicate confirmations and duplicate in-flight submissions while preserving local session material until the server confirms sign-out or the user explicitly confirms local-only device clear after an unreachable/server failure.
- Server-unreachable local-clear copy now distinguishes local device session material clearing from unconfirmed server-side session revocation and tells the user they may need to sign out from another device after connectivity returns.
- Account-wide sign-out confirmation copy now states the action asks the server to end every active session for the account before this device signs out.
- Account-wide sign-out blocks duplicate confirmations and duplicate in-flight submissions, preserves local session material while in flight, and routes session-expired failures through the shared session-ended/sign-in path.
- Access-token refresh now clears local session state if a refresh response produces blank access material, so protected routes receive no token and fail closed.

Focused automated coverage during implementation:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/widget_test.dart` passed with 28 tests.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/secure_storage_test.dart` passed with 10 tests.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/widget_test.dart test/auth_session_repository_test.dart test/secure_storage_test.dart test/server_mode_shell_dashboard_test.dart` passed with 82 tests.
- `cd /workspace/repos/Settleora && PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed with 712 Flutter tests.

At M11-003 completion, M11-004 became current, `STOP-M11-001` remained preserved, M11 was not UI-test ready until M11-004 finalization, and manual UI retest/manual code review remained deferred until Day 1 acceptance and were not passed.

M11-003 did not change backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration outside existing mobile presentation and secure-storage seams, token issuance, refresh rotation policy, server revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR authority, import/export/backup runtime, deployment/CI, web/admin runtime, broad offline cache/sync, secrets, or unrelated major-domain behavior.

## M11-004 QA Finalization Summary

M11 is finalized as `Day 1 Mobile Account Session And Device Management Hardening` and marked UI-test ready for deferred Day 1 acceptance review.

Completed M11 slices:

- M11-001 reconciled current mobile auth/session repository models, secure session storage, access-token refresh boundaries, first-launch/sign-in/session UI surfaces, automated coverage, Day 1 account/session requirement mapping, and forbidden-scope stop conditions without runtime behavior changes.
- M11-002 completed session/device list and per-session revoke hardening for safe server-returned metadata readout, current-session marker/protection, duplicate revoke prevention, bounded list/revoke failures, refresh-after-mutation behavior, preserved safe state after post-revoke reload failure, and raw ID/token/credential suppression.
- M11-003 completed current-session sign-out, account-wide sign-out, server-unreachable local clear, expired-session routing, duplicate destructive-action prevention, and access-token refresh fail-closed hardening inside existing mobile seams.
- M11-004 completed control/QA finalization and set M11 to UI-test ready with no remaining automated M11 work.

Recorded M11 validation coverage:

- M11-002 focused validation passed with 77 tests; full mobile validation passed with 707 Flutter tests.
- M11-003 focused validation passed with 82 tests; full mobile validation passed with 712 Flutter tests.
- M11-004 final full mobile validation passed with 712 Flutter tests.

M11-004 updated only `.ai` control files and `docs/qa/M11_MOBILE_ACCOUNT_SESSION_QA_MAP.md`. Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed.

M11 did not change backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration outside mobile presentation and secure-storage seams, token issuance, refresh rotation policy, server revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR authority, import/export/backup runtime, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope, or architecture direction.

Follow-up: a separate user-requested post-M11 docs-only FX/currency/UX architecture task should run before the next normal implementation milestone, unless the controller reports a stricter blocker. That follow-up is not an M11 runtime task and M11-004 did not edit currency/FX docs.

## M10-003 Payment Visibility Readout Summary

Updated `apps/mobile/lib/profile/profile_repository.dart`, `apps/mobile/lib/profile/profile_screen.dart`, focused profile screen tests, M10 QA docs, and `.ai` control state only.

Runtime hardening:

- Visibility readout now includes bounded descriptions for `private`, `settlement_counterparties_only`, and `group_members_when_shared` without changing the constrained visibility values or policy.
- Payment details copy now states visibility is a server-returned profile fact, not a client-side authorization decision; payment details are not globally visible; and the API decides who may see them, including settlement-scoped counterparty access.
- Empty/unconfigured readout now says blank or cleared payment fields mean the API currently has no payment text to show, with default/readout visibility treated as server-returned state only.
- QR readout remains metadata-only and shows only content type, byte size, and updated timestamp from the current mobile profile seam.
- QR upload, removal, content reading, file/image picker dependencies, camera/gallery permissions, image rendering, byte reads, backend/API changes, generated-client changes, storage/privacy changes, visibility-policy changes, and counterparty authorization changes remain out of scope.

Focused automated coverage:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/profile_screen_test.dart` passed with 12 tests.
- Added coverage for private/counterparty/group-shared visibility labels/copy, non-global/API-authority copy, unconfigured/default/cleared payment-details readout, QR metadata-only readout with content type/size/timestamp, absence of QR upload/remove/content-read UX or image rendering, unsafe raw text suppression, and no client-side authorization decisions from cached profile/payment rows.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed. M10-004 finalized the milestone as UI-test ready.

## M10-002 Edit Hardening Summary

M10-002 completed profile/payment edit-state hardening inside existing mobile seams:

- Profile/payment edit states, normalization copy, duplicate-submit guards, bounded failures, refresh-after-save recovery, unsafe edit-text suppression, and server-authority copy were completed.
- Validation: focused profile command passed with 52 tests; full mobile validation passed with 702 Flutter tests.

## M10-004 QA Finalization Summary

M10 is finalized as `Day 1 Mobile Self Profile And Payment Details Hardening` and marked UI-test ready.

Completed M10 slices:

- M10-001 reconciled current mobile self profile/payment-details repository seams, generated-client mapping, app-shell entry, focused automated coverage, Day 1 requirement map, and bounded M10 focus without runtime behavior changes.
- M10-002 completed profile/payment edit states, normalization copy, duplicate-submit guards, bounded failures, refresh-after-save recovery, unsafe edit-text suppression, and server-authority copy.
- M10-003 completed visibility labels, sensitive-data/non-global copy, QR metadata-only readout, default/cleared/unconfigured states, unsafe text suppression, and no cached-row authorization decisions.
- M10-004 completed control/QA finalization and set M10 to UI-test ready with no remaining automated M10 work.

Recorded M10 validation coverage:

- M10-002 focused profile command validation: 52 tests.
- M10-002 full mobile validation: 702 Flutter tests.
- M10-003 focused profile command validation: 54 tests.
- M10-003 full mobile validation: 704 Flutter tests.
- M10-004 final validation includes docs, scaffold, OpenAPI, mobile doctor, full mobile validation, scope guard, and final controller dry run. The final full mobile validation count is recorded in the external task report.

M10 remains explicitly out of scope for backend/API behavior, OpenAPI/contracts/generated clients, auth/session/security runtime or config, schema/migrations, storage/privacy/file authorization policy, QR/proof/receipt byte behavior, self QR upload/remove/content UX, platform file/image picker dependencies, image normalization, camera/gallery permissions, private-vault behavior, payment-detail visibility policy changes, counterparty authorization changes, global lookup, group-directory payment exposure, admin/support viewing, client-side authorization decisions from cached profile/payment rows, money/bill/settlement/recurring/OCR/reconciliation authority, Docker/deployment/env/CI, secrets/tokens/credentials, web/admin runtime UI, broad offline cache/sync, Day 1 scope reduction, and architecture replacement.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M10. Recommended next automated Day 1 action is to run the AI V3 controller for the next controller-approved milestone or queue kickoff.

## Acceptance Checklist

- [x] M3 mobile sync/offline queue work is controller-finalized as a bounded Day 1 checkpoint.
- [x] M2/M3 manual UI retests remain deferred until Day 1 acceptance, not passed.
- [x] Manual code review remains deferred until Day 1 acceptance, not passed.
- [x] Automated development may continue under scoped validation, CI, PR, and merge gates.
- [x] Current milestone moved to M4 `Day 1 Mobile Group Bill Lifecycle UX Hardening`.
- [x] M4 queue has 2-4 related sub-slices plus a hard stop sentinel.
- [x] Scope guard is expected to allow M4 docs/control files and only narrow mobile group bill lifecycle implementation paths.
- [x] No M4 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, money, storage privacy, deployment, Docker, CI, or secret changes.
- [x] M4-001 reconciled current mobile group bill lifecycle implementation and automated QA coverage without changing mobile runtime behavior.
- [x] M4-001 updated the M4 QA map with current implementation inventory, covered tests, acceptance targets, M4-002/M4-003 gaps, and stop conditions.
- [x] M4-002 hardened existing mobile group bill create/submit status, retry, duplicate-mutation, validation, and safe-error coverage without changing backend/API contracts, generated clients, schema, auth/session, storage, money, deployment, or offline queueing.
- [x] M4-003 hardened existing mobile group bill detail lifecycle acknowledgement failure, retry, duplicate-mutation, revision-entry, attachment/OCR-handoff, member fallback, and terminal/unavailable state coverage within existing mobile seams.
- [x] M4-004 finalized M4 QA/control state and marked M4 UI-test ready as a controller stop state.
- [x] Current state pointer no longer targets stale M4 work; next automated Day 1 action is the next controller-approved milestone or queue kickoff.
- [x] M5 queued as `Day 1 Mobile Recurring Bill Lifecycle UX Hardening`.
- [x] M5 queue has 2-4 related sub-slices plus a hard stop sentinel.
- [x] Scope guard allows only narrow M5 docs/control, recurring mobile, app-shell/group-display support, and mobile test paths.
- [x] No M5 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, money, storage privacy, deployment, Docker, CI, worker, notification delivery, reminder, background generation, or secret changes.
- [x] M5-001 reconciled the current mobile recurring bill lifecycle implementation and automated QA coverage without changing mobile runtime behavior.
- [x] M5-001 updated the M5 QA map with current implementation inventory, covered tests, acceptance targets, M5-002/M5-003 gaps, stop conditions, and explicit deferred manual UI/code review status.
- [x] M5-002 hardened mobile recurring template create/edit and pause/resume/archive lifecycle actions within existing generated-client seams.
- [x] M5-003 hardened mobile recurring forecast and explicit draft-generation handoff states, including generated context, idempotent existing-draft copy, refresh-after-generate failure handling, and safe no-route guidance.
- [x] Current M5 state is UI-test ready with no remaining queued M5 implementation task; STOP-M5-001 remains preserved.
- [x] M6 queued as `Day 1 Mobile Receipt OCR Capture + Review Handoff Hardening`.
- [x] M6 queue has 2-4 related sub-slices plus QA finalization and a hard stop sentinel.
- [x] Scope guard allows only narrow M6 docs/control, receipt OCR capture/review, bill handoff, app wiring, and mobile test paths.
- [x] No M6 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, money, storage privacy, OCR worker/runtime, deployment, Docker, CI, notification delivery, web/admin, or secret changes.
- [x] M6-001 reconciled current mobile receipt OCR capture/review implementation and automated QA coverage without changing mobile runtime behavior.
- [x] M6-001 updated the M6 QA map with current implementation inventory, Day 1 requirement map, covered tests, gaps, M6-002/M6-003 focus, stop conditions, and explicit deferred manual UI/code review status.
- [x] M6-002 hardened mobile receipt OCR capture intake and provisional review save handoff by binding local OCR preview state to its source receipt draft, clearing stale preview state when the receipt is removed or no longer receipt-purpose, and saving provisional review data only to the uploaded receipt that produced the active preview.
- [x] M6-003 hardened saved receipt OCR review edit, refresh, apply-preview, and explicit draft-only apply handoff so successful draft-only apply is not repeated after post-apply refresh failure and another apply requires a fresh preview.
- [x] M6-004 finalized M6 QA/control state and marked M6 UI-test ready with no remaining automated M6 work.
- [x] Current M6 state preserves `STOP-M6-001`, keeps manual UI/code review deferred until Day 1 acceptance, and recommends running the AI V3 controller for the next controller-approved Day 1 milestone or queue kickoff.
- [x] M7 queued as `Day 1 Mobile Monthly Reports + Reconciliation Readout Hardening`.
- [x] M7 queue has 2-4 related sub-slices plus QA finalization and a hard stop sentinel.
- [x] Scope guard allows only narrow M7 docs/control, mobile reports, dashboard, bill-list readout, app wiring, and mobile test paths.
- [x] No M7 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, money, storage privacy, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, deployment, Docker, CI, notification delivery, web/admin, or secret changes.
- [x] M7-001 reconciled current mobile monthly report, dashboard/report entry, bill search/filter, reconciliation-status readout implementation, and automated QA coverage without changing runtime behavior.
- [x] M7-001 updated the M7 QA map with current implementation inventory, Day 1 requirement map, covered tests, gaps, M7-002/M7-003 focus, stop conditions, and explicit deferred manual UI/code review status.
- [x] M7-002 hardened mobile monthly report discovery, safe aggregate copy, personal/group scope labels, unknown status display, safe failure copy, dashboard report entry clarity, and focused automated coverage inside existing mobile seams.
- [x] M7-003 hardened personal/group bill loaded-row filters, filtered-empty copy, bounded reconciliation status/note readouts, and server-authority/no-import/no-mutation copy inside existing mobile bill seams.
- [x] M7-004 finalized M7 QA/control state, recorded M7-001 through M7-004 completion and validation coverage, preserved deferred manual UI/code review, and marked M7 UI-test ready with no remaining automated M7 work.
- [x] Current M7 state preserves `STOP-M7-001`, keeps manual UI/code review deferred until Day 1 acceptance, and recommends running the AI V3 controller for the next controller-approved Day 1 milestone or queue kickoff.
- [x] M8 queued as `Day 1 Mobile Settlement Workflow Hardening`.
- [x] M8 queue has 2-4 related sub-slices plus QA finalization and a hard stop sentinel.
- [x] Scope guard allows only narrow M8 docs/control, mobile settlements, app-routing support, and mobile test paths.
- [x] No M8 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, money, settlement authority, storage privacy, settlement proof byte behavior, provider integration, statement import/matching, export/backup, deployment, Docker, CI, notification delivery, web/admin, or secret changes.
- [x] M8-001 reconciled current mobile settlement repository/model boundaries, generated-client mapping, settlement list/detail UI, app-shell/notification handoffs, automated coverage, Day 1 requirement gaps, and M8-002/M8-003 focus without changing runtime behavior.
- [x] M8-002 hardened mobile settlement request/payment action confirmations, duplicate-action guards, bounded action failure copy, refresh-after-mutation recovery, and server-authority messaging inside existing mobile seams.
- [x] M8-003 hardened mobile settlement residual, allocation, selected-line/basket, balance, loaded-row filter, and counterparty payment-detail readouts over server-returned data only.
- [x] M8-004 finalized M8 QA/control state, recorded validation coverage, preserved deferred manual UI/code review, and marked M8 UI-test ready with no remaining automated M8 work.
- [x] Current M8 state preserves `STOP-M8-001`, keeps manual UI/code review deferred until Day 1 acceptance, and recommends running the AI V3 controller for the next controller-approved Day 1 milestone or queue kickoff.
- [x] M9 queued as `Day 1 Mobile In-App Notification Inbox Hardening`.
- [x] M9 queue has 2-4 related sub-slices plus QA finalization and a hard stop sentinel.
- [x] Scope guard allows only narrow M9 docs/control, mobile notifications, app-routing support, and mobile test paths.
- [x] No M9 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, money, storage privacy, notification delivery/providers/preferences/queue/worker behavior, linked-resource authorization changes, deployment, Docker, CI, web/admin, broad offline sync/cache, or secret changes.
- [x] M9-001 reconciled current mobile notification repository/model boundaries, generated-client mapping, notification inbox UI, app-shell handoffs, automated coverage, Day 1 requirement gaps, and M9-002/M9-003 focus without changing runtime behavior.
- [x] M9-002 hardened mobile notification inbox count clarity, local loaded-row filter copy, archived boundaries, row/bulk action copy, duplicate-action guards, bounded failure copy, refresh-after-mutation recovery, mark-visible semantics, and server-authority messaging.
- [x] M9-003 hardened mobile notification typed handoff authority copy and notification-origin bill destination failure suppression while preserving destination repository re-fetch authority.
- [x] M9 implementation hardening slices are complete.
- [x] M10 queued as `Day 1 Mobile Self Profile And Payment Details Hardening`.
- [x] M10 queue has 2-4 related sub-slices plus QA finalization and a hard stop sentinel.
- [x] No M10 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, storage/privacy, QR byte behavior, payment-detail visibility policy, counterparty authorization, money, deployment, Docker, CI, web/admin, broad offline sync/cache, or secret changes.
- [x] M10-001 reconciled current mobile self profile/payment-details repository/model boundaries, generated-client mapping, profile screen state, app-shell injection, automated coverage, Day 1 requirement gaps, and M10-002/M10-003 focus without changing runtime behavior.
- [x] M10-002 hardened existing profile/payment edit states, duplicate-submit prevention, bounded failures, refresh-after-save recovery, unsafe edit-text suppression, and server-authority copy inside current mobile seams.
- [x] M10-003 hardened visibility labels, sensitive-data copy, QR metadata readout, and unsafe text suppression without adding QR byte handling or visibility-policy changes.
- [x] M10-004 finalized M10 QA/control state, recorded validation coverage, preserved deferred manual UI/code review, and marked M10 UI-test ready with no remaining automated M10 work.
- [x] Current M10 state preserves `STOP-M10-001`, keeps manual UI/code review deferred until Day 1 acceptance, and recommends running the AI V3 controller for the next controller-approved Day 1 milestone or queue kickoff.
- [x] M9 QA finalization marks the milestone UI-test ready with no remaining automated M9 work.

## M9 Selection Summary

M9 is `Day 1 Mobile In-App Notification Inbox Hardening`.

The selection is based on current repo state:

- `README.md` says the backend has guarded current-user in-app notification list/summary/read/archive APIs and the mobile app has a starter authenticated in-app notification list/summary/read/archive surface backed by generated-client seams.
- `docs/prd/MVP_DAY1_SCOPE.md` requires basic in-app notifications for bills, approvals/corrections, settlements, recurring due-soon, sync failures, security/session events, and OCR completion/failure where server OCR is used.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` says notification visibility is presentation only and linked bill, settlement, or recurring data must still be re-fetched through its own server-authorized route before future deep-link behavior.
- `docs/features/expenses-bills/TECHNICAL_SPEC.md` requires bill revision notifications to carry safe stable metadata only, while email, push delivery, preferences, and deep-link behavior remain separate slices.
- Current mobile code under `apps/mobile/lib/notifications/` and focused tests under `apps/mobile/test/notification_*` provide bounded seams for mobile-only inbox, read/archive, filter, generated mapping, and typed handoff hardening without requiring API, contract, generated-client, schema, auth, storage, money, delivery-provider, deployment, or unrelated-domain changes.

## M9 Queue Summary

- `M9-001-MOBILE-NOTIFICATION-INBOX-STATE-RECONCILE-20260616-0055` - Completed. Reconciled current mobile notification implementation and automated coverage without runtime behavior changes.
- `M9-002-MOBILE-NOTIFICATION-INBOX-ACTION-HARDENING-20260616-0055` - Completed. Hardened notification inbox filters, read/archive/bulk action clarity, duplicate-action guards, failure/retry states, refresh behavior, and server-authority copy inside existing mobile seams.
- `M9-003-MOBILE-NOTIFICATION-HANDOFF-AUTHORITY-HARDENING-20260616-0055` - Completed. Hardened typed handoff authority boundaries for bill, bill revision, settlement, and recurring notification targets.
- `M9-004-MOBILE-NOTIFICATION-INBOX-QA-FINALIZE-20260616-0055` - Completed. Finalized M9 QA/control state, recorded validation coverage, preserved deferred manual UI/code review status, and marked UI-test ready without runtime behavior changes.
- `STOP-M9-001` - Stop for API/contracts/generated-client/auth/schema/storage/privacy/money/bill/settlement/recurring/OCR/deployment, notification delivery/provider/preference/queue/worker behavior, linked-resource authorization changes, web/admin, broad offline sync/cache, secrets, or unrelated major-domain scope.

## M9-001 Reconciliation Summary

Updated `docs/qa/M9_MOBILE_NOTIFICATION_INBOX_QA_MAP.md` as the current control/QA map for M9. The map records:

- Current mobile notification repository/model inventory for row fields, status/priority/subject/event labels, typed target helpers for bill revision, group bill, personal bill, settlement, and recurring targets, bounded failure kinds, and optional restore support.
- Generated-client repository mapping for per-call session token handling, list filter normalization, 1-100 limit caps, UTC before-cursor handling, summary/list/read/archive response mapping, trimmed route IDs, blank-ID pre-call failures, and safe generated/transport failure mapping.
- Mobile inbox UI inventory for initial summary/list load, unread/attention/urgent counts, local filters, archived-row boundary, visible row fields, row and bulk actions, duplicate-action flags, refresh-after-mutation behavior, load/empty/filtered-empty/retry/session/action-failure states, typed handoffs, and raw action URLs as non-authoritative hints only.
- App-shell and handoff inventory for authenticated notification repository injection, dashboard/header notification affordances, and linked-resource re-fetch expectations through existing authorized bill, bill-revision, settlement, and recurring repository seams.
- Automated coverage across notification screen tests, generated notification repository tests, server shell/dashboard notification tests, dashboard preview notification copy tests, and related destination screen tests only where relevant.
- Day 1 requirement mapping for basic in-app inbox, bill and bill-revision events, item claims, settlement events, recurring due soon, sync conflict/failure, security/session events, server OCR completion/failure, and Day 2/non-goal push/email delivery.
- Focus areas for M9-002 inbox/action hardening and M9-003 typed handoff authority hardening.

Current implementation findings:

- Mobile notification models preserve server-returned safe presentation fields and typed target IDs while bounding unknown display values and suppressing unsafe raw UUID, token, HTTP URL, API path, query, storage, payment, proof, receipt/OCR, and unrelated-user content from visible copy.
- Generated notification repository calls are session-gated, normalize filters/cursors/limits, trim action IDs, reject blank IDs before generated calls, and map 400/422/401/403/404/410/409/5xx/network failures to bounded mobile failure categories.
- The mobile notification screen already supports summary/list loading, local filters, archived exclusion outside the archived filter, read/archive/mark-all/mark-visible actions, optional restore support, duplicate-action guards, refresh-after-success, safe failure/retry/session states, detail sheets, and typed handoffs to bill, bill revision, settlement, and recurring destinations.
- Notification metadata, action URLs, raw IDs, cached rows, and generated-client availability remain navigation hints only; linked resources are expected to be re-fetched through destination repository seams before display/actions.
- No mobile runtime or test files were changed by M9-001.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed. M9-002 is now complete; recommended next automated task is `M9-003-MOBILE-NOTIFICATION-HANDOFF-AUTHORITY-HARDENING-20260616-0055`.

## M9-002 Inbox Action Hardening Summary

Updated `apps/mobile/lib/notifications/notification_screen.dart`, focused notification screen tests, M9 QA docs, and `.ai` control state only.

Runtime hardening:

- Notification summary copy now distinguishes server-authoritative API summary counts from local loaded-row filter counts.
- Local filter copy now says filters only hide loaded rows, clearing filters restores already-loaded rows rather than new server truth, and active filters exclude archived rows unless Archived is selected.
- Mark-all and mark-visible copy now says actions ask the API to mutate server-authorized notification state, while Mark Visible targets currently visible loaded unread rows only.
- Row and bulk mutations update loaded rows after successful API responses before attempting a follow-up refresh, so a refresh failure does not ask the user to repeat the mutation.
- Refresh-after-mutation failures now preserve loaded state and show bounded refresh guidance without exposing raw notification IDs, linked-resource IDs, action URLs, API paths, tokens, storage paths, payment/proof/OCR content, or generated-client internals.
- Notification details now include bounded server-authority copy for visibility, read/archive state, and linked-resource access.

Focused automated coverage:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/notification_screen_test.dart` passed with 56 tests.
- Added/updated coverage for count clarity, loaded-row local filter copy, archived-row boundaries, filtered-empty versus true-empty copy, action duplicate guards, bounded unsafe failure copy, refresh-after-mutation recovery, mark-visible loaded-row semantics, and server-authority copy.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed. Recommended next automated task is `M9-003-MOBILE-NOTIFICATION-HANDOFF-AUTHORITY-HARDENING-20260616-0055`.

## M9-003 Handoff Authority Hardening Summary

Updated `apps/mobile/lib/notifications/notification_screen.dart`, focused notification screen tests, M9 QA docs, and `.ai` control state only.

Runtime hardening:

- Notification detail copy now states that raw links, notification IDs, linked-resource IDs, cached rows, and generated-client availability are routing hints only.
- Destination copy now says the destination API re-checks access and current state before linked details or actions are shown.
- Unsupported or incomplete destination metadata now shows bounded copy that the notification only points to a destination and cannot open safely without supported typed metadata and an authorized repository.
- Notification-origin personal/group bill destination loads pass through a small delegating wrapper that preserves the existing bill repository seam while suppressing unsafe failure text from bill detail failure panels.
- Unsafe generated-client, API path, token/secret, storage/provider, proof, receipt/OCR, payment-detail, filesystem, stack-trace, and unrelated-user strings remain suppressed from notification handoff and destination-failure copy.

Focused automated coverage:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/notification_screen_test.dart` passed with 57 tests.
- Added coverage for denied personal bill destination failure through the authorized repository seam, no read mutation after denied destination failure, safe fallback failure copy, and unsafe string suppression.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed. Recommended next automated task is `M9-004-MOBILE-NOTIFICATION-INBOX-QA-FINALIZE-20260616-0055`.

## M9-004 QA Finalization Summary

M9 is finalized as a bounded Day 1 mobile in-app notification inbox hardening checkpoint.

Completed M9 slices:

- M9-001 reconciled the current mobile notification repository/model boundaries, generated-client mapping, notification inbox UI, app-shell handoffs, automated coverage, Day 1 requirement map, and bounded M9 focus without runtime behavior changes.
- M9-002 completed inbox action hardening for summary/list count clarity, local loaded-row filter copy, archived-row boundaries, filtered-empty states, read/archive/restore-if-present/mark-all/mark-visible action copy, duplicate-action prevention, bounded failure/retry copy, refresh-after-mutation recovery, and API/server-authority messaging.
- M9-003 completed typed handoff authority hardening so notification metadata, action URLs, raw IDs, cached rows, and generated-client methods remain navigation hints only while linked bill, bill-revision, settlement, and recurring destinations re-fetch through existing authorized repositories.
- M9-004 completed control/QA finalization and set M9 to UI-test ready with no remaining automated M9 work.

Recorded M9 validation coverage:

- M9-002 focused notification-screen validation: 98 tests.
- M9-002 full mobile validation: 698 Flutter tests.
- M9-003 focused notification-screen validation: 57 tests.
- M9-003 focused notification command validation: 99 tests.
- M9-003 full mobile validation: 699 Flutter tests.
- M9-004 final validation includes docs, scaffold, OpenAPI, mobile doctor, full mobile validation, scope guard, and final controller dry run. The final full mobile validation for M9-004 is recorded as 699 Flutter tests.

M9 remains explicitly out of scope for item claim-specific event constants if not already returned safely by the server, sync conflict/failure notifications, auth/security/session notification generation behavior, OCR completion/failure notifications tied to future server OCR worker/runtime, push/email delivery, device-token registration, notification preferences, quiet hours, digests, reminder scheduling, server-side notification generation policy, notification queue/worker behavior, linked-resource authorization changes, backend/API behavior, OpenAPI/generated clients, schema/migrations, storage/privacy/file byte behavior, money/bill/settlement/recurring/OCR authority, deployment/CI/env/secrets, web/admin runtime UI, and broad offline cache/sync.

M9-004 validation and PR/merge/CI status are recorded in the external task report at `/workspace/logs/settleora-codex-report-20260616-1053-m9-notification-inbox-qa-finalize.md`. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M9. Recommended next automated Day 1 action is to run the AI V3 controller for the next controller-approved milestone or queue kickoff.

## M8 Selection Summary

M8 is `Day 1 Mobile Settlement Workflow Hardening`.

The selection is based on current repo state:

- `README.md` says the mobile app has a starter authenticated settlement balance/request/payment detail foundation backed by generated-client seams.
- `README.md` says current backend settlement request/payment/proof flows, basket preview/create, balance projection, payment allocations, and residual confirmation runtime already exist.
- `docs/prd/MVP_DAY1_SCOPE.md` requires settlement requests, settlement baskets, pay-all outstanding, exact selected total versus actual paid amount display, explicit residual handling, mark-paid, receiver confirmation, settlement proof attachments, payment profile display, audit events, and no silent settlement mutation from bill revisions.
- `docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md`, `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md`, and `docs/features/settlements/TECHNICAL_SPEC.md` require API/domain authority for settlement state transitions, selected lines, payment allocations, residual policy, balances, authorization, proof access, and audit.
- Current mobile code under `apps/mobile/lib/settlements/` and focused tests under `apps/mobile/test/settlement_*` provide bounded seams for mobile-only settlement workflow hardening without requiring API, contract, generated-client, schema, auth, storage, money, deployment, provider, or unrelated-domain changes.

## M8 Queue Summary

- `M8-001-MOBILE-SETTLEMENT-WORKFLOW-STATE-RECONCILE-20260615-2306` - Completed. Reconciled current mobile settlement balance, request, payment, residual, counterparty payment-detail, and basket/readout implementation against Day 1 settlement requirements without changing runtime behavior.
- `M8-002-MOBILE-SETTLEMENT-REQUEST-PAYMENT-ACTION-HARDENING-20260615-2306` - Completed. Hardened settlement request/payment action availability, confirmations, duplicate-action guards, retry/failure recovery, and server-authority copy inside existing mobile seams.
- `M8-003-MOBILE-SETTLEMENT-RESIDUAL-BASKET-READOUT-HARDENING-20260615-2306` - Completed. Hardened residual, allocation, selected-line/basket, balance, loaded-row filter, and counterparty payment-detail readouts over server-returned data only.
- `M8-004-MOBILE-SETTLEMENT-WORKFLOW-QA-FINALIZE-20260615-2306` - Completed. Finalized M8 QA/control state, recorded validation coverage, preserved deferred manual UI/code review status, and marked UI-test ready without runtime behavior changes.
- `STOP-M8-001` - Stop for API/contracts/generated-client/auth/schema/storage/privacy/money/settlement authority/deployment, residual/basket/balance policy, provider integrations, statement import/matching, CSV import/export, backup/restore, notification delivery, web/admin, broad offline sync/cache, secrets, or unrelated major-domain scope.

## M8-001 Reconciliation Summary

Updated `docs/qa/M8_MOBILE_SETTLEMENT_WORKFLOW_QA_MAP.md` as the current control/QA map for M8. The map records:

- Current mobile repository/model inventory for settlement requests, request lines/selected lines, payments, allocations, residuals, balances, counterparty payment details, failure kinds, and proof-readout absence.
- Generated-client repository mapping for session token handling, server/current-actor assumptions, request/payment/residual/balance/counterparty payment-detail mapping, bounded failure mapping, and the rule that generated-client availability is not permission.
- Current mobile UI inventory for landing summaries, balance rows, request search/filter, detail review summary, selected-line/request-line display, payment/allocation/residual readouts, counterparty payment-detail visibility, action availability, refresh/retry/empty/filtered-empty states, and server-authority copy.
- Automated coverage across `settlement_list_screen_test.dart`, `settlement_generated_repository_test.dart`, app-shell dashboard settlement tests, dashboard preview tests, notification settlement handoff tests, and notification generated-client settlement ID mapping tests.
- Day 1 requirement mapping for settlement request/create, baskets/pay-all, exact selected total versus actual paid amount, residual handling, mark-paid, partial payment/allocation readout, receiver confirmation, dispute/cancellation, proof readout, payment profile display, settlement audit/authorization, and pending bill revision boundaries.
- Focus areas for M8-002 request/payment action hardening and M8-003 residual/basket/readout hardening, with stop conditions and non-goals.

Current implementation findings:

- Mobile settlement models preserve server-returned facts and expose UI helper methods only; they do not calculate authoritative money, selected lines, residual policy, balances, authorization, audit, or proof access.
- Generated settlement repository calls are session-gated and map generated responses into bounded mobile models; 400/401/403/404/409/5xx/network failures are mapped to safe user-facing failure categories.
- Settlement list/detail UI already supports loaded-row search/filter, server-returned balance/request/payment/residual readouts, counterparty payment detail display, mark-paid, request cancel/dispute, payment confirm/cancel/dispute, residual confirm, refresh/retry/empty states, duplicate-action busy guards for existing paths, and server-authority copy.
- Current mobile UI does not surface basket preview/create, select-all-visible, proof metadata/readout, QR content, fully itemized allocation details, visible residual direction/policy labels, explicit exact-selected-total versus actual-paid comparison, or all balance residual fields.
- No mobile runtime or test files were changed by M8-001.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed. M8-002 is now complete; recommended next automated task is `M8-003-MOBILE-SETTLEMENT-RESIDUAL-BASKET-READOUT-HARDENING-20260615-2306`.

## M8-002 Request/Payment Action Hardening Summary

Updated `apps/mobile/lib/settlements/settlement_list_screen.dart`, focused settlement screen tests, M8 QA docs, and `.ai` control state only.

Runtime hardening:

- Request and payment confirmations now explicitly say mobile asks the API to perform status-affecting transitions and does not decide authorization, settlement/payment truth, residual blocking, audit state, or money.
- The request detail header now shows that action availability is based on loaded server status and actor role only as UI guidance.
- Successful mutations refresh server-authoritative detail state through the existing repository seam; if that refresh fails, the loaded state is preserved and the user is told to refresh before repeating any settlement action.
- Mutation failures now use bounded action-specific copy for session, denied, unavailable, conflict, validation, network, and server failures instead of surfacing raw exception text.
- Existing duplicate-action guards continue to block conflicting request/payment/residual actions while one mutation is active.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/settlement_list_screen_test.dart` passed with 25 tests.
- Added coverage for refresh-after-success failure, bounded unsafe mutation failure copy, payment cancellation, payment dispute, strengthened confirmation copy, and server-authority action guidance.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed. Recommended next automated task is `M8-003-MOBILE-SETTLEMENT-RESIDUAL-BASKET-READOUT-HARDENING-20260615-2306`.

## M8-003 Residual/Basket Readout Hardening Summary

Updated `apps/mobile/lib/settlements/settlement_list_screen.dart`, focused settlement screen tests, M8 QA docs, and `.ai` control state only.

Runtime hardening:

- Balance tiles now display server-returned selected-line amount, pending claimed, confirmed cleared, remaining unclaimed, confirmed remaining residual, waived residual, credit residual, line count, pending payment count, and confirmed payment count with copy that mobile does not recalculate projection values.
- Request detail copy now separates server-returned selected total/request amount from actual paid amounts on payment claims and states that mobile shows loaded API rows without expanding baskets or deciding eligibility.
- Request-line and payment/residual filters now say they hide only loaded API rows locally, distinguish filtered-empty from true-empty, and direct users to clear filters to restore loaded rows.
- Payment tiles now label actual paid amount, show server-returned allocation clearing facts, and expose residual direction, policy, status, and pending receiver confirmation readouts.
- Counterparty payment details now explain settlement-scoped, relationship-backed, API-authorized visibility and continue to avoid QR bytes, storage/provider internals, broad profile lookup, and raw identifiers.
- Proof readouts remain out of scope because current mobile settlement seams do not expose safe proof metadata; no proof byte/storage/file behavior was added.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/settlement_list_screen_test.dart test/settlement_generated_repository_test.dart` passed with 34 settlement list/widget tests plus generated settlement repository tests in the same command.
- Added coverage for balance residual/allocation field readouts, loaded selected-line scope, exact selected total versus actual paid amount separation, allocation facts, residual direction/policy/status labels, counterparty visibility copy, loaded-row local filtering copy, filtered-empty states, and suppression of raw IDs/API/storage strings in new visible copy.
- Full mobile validation passed with 697 Flutter tests through `cd /workspace/repos/Settleora && PATH=/opt/flutter/bin:$PATH npm run validate:mobile`.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed. M8-004 is complete, and the recommended next automated Day 1 action is to run the AI V3 controller for the next controller-approved milestone or queue kickoff.

## M8-004 QA Finalization Summary

M8 is finalized as a bounded Day 1 mobile settlement workflow hardening checkpoint.

Completed M8 slices:

- M8-001 reconciled the current mobile settlement repository/model boundaries, generated-client mapping, settlement list/detail UI, app-shell and notification handoffs, automated coverage, Day 1 requirement map, and bounded M8 focus without runtime behavior changes.
- M8-002 completed request/payment action hardening for role-aware availability, confirmation copy, duplicate-action prevention, safe failure/retry handling, refresh-after-mutation recovery, and server-authority messaging inside existing mobile seams.
- M8-003 completed residual, allocation, selected-line/basket, balance, loaded-row filter, and counterparty payment-detail readout hardening over server-returned data only.
- M8-004 completed control/QA finalization and set M8 to UI-test ready with no remaining automated M8 work.

Recorded M8 validation coverage:

- M8-002 focused settlement validation: 31 tests from the focused settlement request/payment action hardening command.
- M8-002 full mobile validation: 694 Flutter tests.
- M8-003 focused settlement validation: 34 settlement list/widget tests plus generated settlement repository tests in the same command.
- M8-003 full mobile validation: 697 Flutter tests.
- M8-004 final validation includes docs, scaffold, OpenAPI, mobile doctor, full mobile validation, scope guard, and final controller dry run. The final full mobile validation for M8-004 passed with 697 Flutter tests.

M8 remains explicitly out of scope for proof metadata/readout because current mobile settlement seams do not expose safe proof metadata. Basket preview/create, pay-all, select-all-visible, basket expansion authority, provider integrations, direct bank sync, statement import/matching, reconciliation mutation, CSV import/export, backup/restore, notification delivery, web/admin, broad offline sync/cache, storage/privacy/proof byte policy, money/settlement authority, residual policy, balance projection policy, and generated-client/API changes remain outside M8.

M8-004 validation and PR/merge/CI status are recorded in the external task report at `/workspace/logs/settleora-codex-report-20260616-0039-m8-settlement-workflow-qa-finalize.md`. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M8. Recommended next automated Day 1 action is to run the AI V3 controller for the next controller-approved milestone or queue kickoff.

## M7 Selection Summary

M7 is `Day 1 Mobile Monthly Reports + Reconciliation Readout Hardening`.

The selection is based on current repo state:

- `README.md` says the mobile app has a starter monthly report screen, personal/group bill list/detail surfaces, and generated-client-backed report/bill seams, while broader search/filter/report/import/export remain incomplete.
- `docs/prd/MVP_DAY1_SCOPE.md` requires monthly reports, advanced search/filter, reconciliation-related filters where available, and group dashboard basics for Day 1.
- `docs/features/reconciliation/TECHNICAL_SPEC.md` and `docs/architecture/STATEMENT_RECONCILIATION_ARCHITECTURE.md` make statement import/matching, raw statement visibility, reconciliation link/unlink, and related persistence/storage/privacy work a broader future domain, so M7 is limited to read-only mobile report/reconciliation readouts over existing server-provided fields.
- Current mobile code under `apps/mobile/lib/reports/`, `apps/mobile/lib/dashboard/`, and `apps/mobile/lib/bills/bill_list_screen.dart` already provides bounded seams and tests for monthly reports, dashboard previews, bill search/filter, and reconciliation status/note display.

## M7 Queue Summary

- `M7-001-MOBILE-REPORT-RECONCILIATION-STATE-RECONCILE-20260615-2123` - Completed. Reconciled current mobile monthly report, dashboard/report entry, bill search/filter, and reconciliation readout implementation against Day 1 requirements without changing runtime behavior.
- `M7-002-MOBILE-MONTHLY-REPORT-DISCOVERY-HARDENING-20260615-2123` - Completed. Hardened monthly report discovery, safe aggregate display, month/group scope clarity, unknown statuses, failures, and dashboard/report entry inside existing mobile seams.
- `M7-003-MOBILE-BILL-REPORT-RECONCILIATION-READOUT-HARDENING-20260615-2123` - Completed. Hardened bill list/detail reporting filters and reconciliation-status readouts over loaded server data only.
- `M7-004-MOBILE-REPORT-RECONCILIATION-QA-FINALIZE-20260615-2123` - Completed. Finalized M7 QA/control state, recorded validation coverage, preserved deferred manual UI/code review status, and marked M7 UI-test ready without runtime behavior changes.
- `STOP-M7-001` - Stop for API/contracts/generated-client/auth/schema/storage/privacy/money/deployment, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, notification delivery, web/admin, broad offline sync/cache, secrets, or unrelated major-domain scope.

## M7-001 Reconciliation Summary

Updated `docs/qa/M7_MOBILE_REPORT_RECONCILIATION_QA_MAP.md` as the current control/QA map for M7. The map records:

- Current mobile implementation inventory for monthly report repository/generated-client mapping, report screen aggregate display, month/group scope, loading/empty/retry/error states, local report discovery, bounded status labels, dashboard/report entry, personal/group bill list search/filter, and bill detail reconciliation status/note readouts.
- Day 1 requirement mapping for monthly reports, advanced search/filter, reconciliation-related readouts where available, group dashboard basics, and explicit exclusion of CSV import/export plus local backup/restore from this mobile readout slice.
- Existing automated coverage across monthly report screen tests, generated report repository tests, dashboard preview/shell tests, generated bill repository tests, and personal/group bill list/detail search/filter tests.
- Gaps and next-slice expectations for M7-002 monthly report/dashboard discovery hardening and M7-003 bill reporting/reconciliation readout hardening.
- Stop conditions and explicit deferred manual UI/code review status.

Current implementation findings:

- Monthly report data flows through `SettleoraMonthlyReportRepository` and `GeneratedSettleoraMonthlyReportRepository`; generated-client responses preserve server-provided amount strings, status codes, counts, generated timestamp, month, and group ID.
- The monthly report screen renders server-returned totals and counts, supports previous/next month navigation, group scope display, refresh, loading, zero activity, filtered-empty, retry/error, and expired-session handling.
- Dashboard preview is read-only/local fixture data. Authenticated shell dashboard uses existing repositories for summaries and opens the monthly report screen through the report repository seam.
- Personal/group bill list and detail surfaces filter loaded server rows locally and display/search server-provided reconciliation status fields; bill detail also displays the server-provided reconciliation note.
- M7-001 did not change mobile runtime or tests.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M7-002 Monthly Report Discovery Summary

Updated `apps/mobile/lib/reports/`, `apps/mobile/lib/app/server_mode_shell.dart`, focused monthly/dashboard tests, M7 QA docs, and `.ai` control state only.

Runtime hardening:

- Monthly report summary and filtered-discovery copy now explicitly state that report totals, bill counts, status counts, and settlement readouts remain server-returned monthly aggregates while local search/filter only hides loaded rows.
- Personal and group report scope labels remain bounded and readable, including `Personal report`, explicit group labels, and `Group report` fallback without raw group ID leakage.
- Unknown/future monthly report statuses now render as bounded `Other status: ...` labels rather than raw/generated-client-ish status fragments.
- Unsafe monthly report failure messages are sanitized before display and before session-ended notices, preventing raw API paths, tokens, local paths, stack traces, generated-client internals, and similar details from reaching UI copy.
- Dashboard report entry copy clarifies that the monthly report opens server-returned aggregates while preserving existing authenticated shell routing and repository seams.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/monthly_report_screen_test.dart test/report_generated_repository_test.dart test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart` passed with 60 tests.
- Full mobile validation for M7-002 passed with 688 Flutter tests.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M7-003 Bill Report Reconciliation Readout Summary

Updated `apps/mobile/lib/bills/bill_list_screen.dart`, focused bill-list tests, M7 QA docs, and `.ai` control state only.

Runtime hardening:

- Personal and group bill lists now show visible/loaded server row counts and copy that search/filter is local to already-loaded rows on this device.
- Personal/group filtered-empty states now differ from true-empty states and point users back to clearing local filters to review every loaded server row.
- Bill detail discovery copy clarifies local row hiding over loaded server detail rows and preserves server authority for bill/reconciliation metadata, financial truth, and authorization.
- Reconciliation status labels preserve known values and bound unknown/future, malformed, or hostile-looking codes without showing generated-client-like or internal details.
- Server-provided reconciliation notes are bounded plain text; unsafe raw API paths, tokens, local filesystem paths, stack traces, storage/provider internals, and generated-client internals are suppressed.
- Detail copy clarifies reconciliation readouts are record metadata, not bank statement matching, and no statement import, statement matching, reconciliation mutation, CSV import/export, backup/restore, generated dashboard/report API, or client-side money authority was added.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart test/bill_generated_repository_test.dart test/monthly_report_screen_test.dart` passed with 274 tests.
- Full mobile validation for M7-003 passed with 690 Flutter tests.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M7-004 QA Finalization Summary

M7 is finalized as a bounded Day 1 mobile monthly reports and reconciliation readout hardening checkpoint.

Completed M7 slices:

- M7-001 reconciled current mobile monthly report, dashboard/report entry, bill search/filter, reconciliation-status readout implementation, and automated QA coverage without runtime behavior changes.
- M7-002 completed monthly report discovery, safe aggregate display, personal/group scope clarity, unknown statuses, failures, and dashboard/report entry hardening inside existing mobile seams.
- M7-003 completed bill list/detail reporting filters and reconciliation-status readouts over loaded server data only.
- M7-004 completed control/QA finalization and set M7 to UI-test ready with no remaining automated M7 work.

Recorded M7 validation coverage:

- M7-002 focused report/dashboard validation: 60 tests from `monthly_report_screen_test.dart`, `report_generated_repository_test.dart`, `dashboard_preview_screen_test.dart`, and `server_mode_shell_dashboard_test.dart`.
- M7-002 full mobile validation: 688 Flutter tests.
- M7-003 focused bill/report/reconciliation validation: 274 tests from `bill_list_screen_test.dart`, `group_bill_list_screen_test.dart`, `bill_generated_repository_test.dart`, and `monthly_report_screen_test.dart`.
- M7-003 full mobile validation: 690 Flutter tests.

M7 remains explicitly out of scope for full statement import/matching/linking, raw statement row visibility, reconciliation link/unlink/update mutations, CSV import/export, local backup/restore, generated dashboard APIs, broad reporting backend redesign, storage/privacy changes, API/contracts/generated-client/schema/auth/money/deployment/security changes, notification delivery, web/admin runtime, broad offline cache/sync, and unrelated major-domain work.

M7-004 validation and PR/merge/CI status are recorded in the external task report at `/workspace/logs/settleora-codex-report-20260615-2249-m7-report-reconciliation-qa-finalize.md`. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M7. Recommended next automated Day 1 action is to run the AI V3 controller for the next controller-approved Day 1 milestone or queue kickoff.

## M6 Selection Summary

M6 is `Day 1 Mobile Receipt OCR Capture + Review Handoff Hardening`.

The selection is based on current repo state:

- `README.md` says the mobile app has a starter receipt OCR review queue/detail/edit foundation, while mobile OCR extraction/capture, automatic OCR-to-bill finalization, non-draft OCR revision apply, and OCR worker/runtime behavior remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires mobile receipt capture/import, policy-driven receipt image normalization before OCR/upload/storage, on-device OCR, OCR review/correction, provisional server-mode validation, and manual fallback.
- `docs/architecture/OCR_ARCHITECTURE.md` records existing bill-scoped receipt OCR review intake/list/read/apply-preview/draft-only apply endpoints for existing receipt attachments, while OCR engine/worker behavior, generic receipt APIs, thumbnails, and automatic finalization remain non-goals.
- `docs/architecture/RECEIPT_OCR_REVIEW_UX_FLOW.md` says current mobile has saved OCR review queue/detail/edit foundations and defines the next mobile-first capture/review/apply handoff flow.
- Current mobile code under `apps/mobile/lib/receipt_ocr_capture/`, `apps/mobile/lib/receipt_ocr_review/`, and `apps/mobile/lib/bills/` already provides bounded seams for receipt intake/provider/parser, saved-review UI/repository, and bill attachment OCR handoff, making a mobile-only handoff milestone coherent without selecting a task that requires API, contract, generated-client, schema, storage/privacy, auth, money, OCR worker, deployment, Docker, CI, secrets, or unrelated domain changes.

## M6 Queue Summary

- `M6-001-RECEIPT-OCR-CAPTURE-REVIEW-STATE-RECONCILE-20260615-1950` - Completed. Reconciled current mobile receipt OCR capture/provider/parser, bill attachment, saved OCR review, apply-preview, and draft-only apply handoff implementation against Day 1 OCR requirements without changing runtime behavior.
- `M6-002-RECEIPT-OCR-CAPTURE-INTAKE-HANDOFF-20260615-1950` - Completed. Hardened mobile receipt intake, unsupported/on-device OCR provider fallback, parser/preview, and bill attachment OCR review save handoff inside existing mobile seams.
- `M6-003-RECEIPT-OCR-SAVED-REVIEW-APPLY-HANDOFF-20260615-1950` - Completed. Hardened saved receipt OCR review edit, refresh, apply-preview, and explicit draft-only apply handoff for stale review data, blocked previews, safe retries, duplicate mutation prevention, refresh-after-apply failure recovery, and server-authority copy.
- `M6-004-RECEIPT-OCR-CAPTURE-REVIEW-QA-FINALIZE-20260615-1950` - Completed. Finalized M6 QA/control state, recorded validation coverage, preserved deferred manual UI/code review status, and marked UI-test ready without runtime behavior changes.
- `STOP-M6-001` - Stop for API/contracts/generated-client/auth/schema/storage/privacy/money/deployment, OCR engine/worker/runtime, generic receipt APIs, automatic OCR finalization, non-draft revision apply, multi-participant OCR split inference, broad offline sync/cache, notification delivery, web/admin, secrets, or unrelated major-domain scope.

## M6-004 QA Finalization Summary

M6 is finalized as a bounded Day 1 mobile receipt OCR capture and review handoff hardening checkpoint.

Completed M6 slices:

- M6-001 reconciled the current mobile receipt OCR capture/review implementation and QA state without runtime changes.
- M6-002 completed capture/intake and provisional review-save handoff hardening inside existing mobile seams.
- M6-003 completed saved-review edit, apply-preview, and explicit draft-only apply handoff hardening inside existing mobile seams.
- M6-004 completed control/QA finalization and set M6 to UI-test ready with no remaining automated M6 work.

Automated validation for the finalization task is recorded in the task report. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M6.

M6 makes no claims of backend/API/contract/generated-client/auth/schema/storage/privacy/money/settlement/payment/OCR-worker/deployment/CI/runtime changes, generic receipt APIs, automatic OCR finalization, non-draft revision apply, multi-participant split inference, broad offline cache/sync, notification delivery, web/admin UI, or manual UI acceptance. The recommended next automated Day 1 action is to run the AI V3 controller for the next controller-approved milestone or queue kickoff.

## M6-001 Reconciliation Summary

Updated `docs/qa/M6_MOBILE_RECEIPT_OCR_CAPTURE_REVIEW_QA_MAP.md` as the current control/QA map for M6. The map records:

- Current mobile implementation inventory for receipt image intake, OCR provider/parser/preview seams, unsupported/manual fallback, personal/group bill create capture flow, receipt attachment OCR handoff, saved-review queue/detail/edit, apply-preview, draft-only apply, app bootstrap wiring, server-mode session gating, and authority boundaries.
- Day 1 OCR requirement mapping for capture/import, on-device OCR, review/correction, provisional server-mode state, receipt attachment handoff, apply-preview, explicit draft-only apply, manual fallback, and server authority.
- Existing automated coverage across receipt OCR parser/provider tests, generated receipt OCR review repository tests, saved-review screen tests, bill attachment section tests, and personal/group bill OCR handoff tests.
- Uncovered areas for full Day 1 receipt normalization, full receipt tax/classification/lineage model, authoritative duplicate detection, server OCR worker/runtime, generic receipt/OCR APIs, non-draft apply, automatic finalization, and split inference.
- Focus areas for M6-002 capture/intake handoff and M6-003 saved-review/apply handoff.
- Stop conditions and explicit deferred manual UI/code review status.

Current implementation findings:

- Mobile now has camera/gallery receipt intake, an OCR provider seam, an unsupported provider fallback, and an ML Kit provider default for iOS/Android through app bootstrap.
- The parser is conservative and provisional. It extracts basic merchant/date/currency/header totals and item candidates, but does not satisfy the full Day 1 receipt edge-case model.
- Personal and group bill create flows can run local OCR preview, let users edit/select candidate sections, and apply those candidates only to local editable draft form fields before save.
- Receipt attachment upload can save a provisional OCR review through existing generated-client-backed bill attachment OCR review endpoints; save failure is retryable and does not block bill creation.
- Saved-review queue/detail and bill-detail sheet flows support route-aware load/edit/save/remove, apply-preview, and explicit draft-only apply using `expectedReviewUpdatedAtUtc`.
- Mobile does not mutate authoritative existing bill state except through the API's explicit draft-only apply endpoint, and it does not mutate settlement, payment, balance, file/storage, worker/job, non-draft revision, or split authority.

No mobile runtime files or mobile test files were changed by M6-001.

## M6-002 Capture Intake Handoff Summary

Updated `apps/mobile/lib/bills/bill_list_screen.dart`, focused bill-list tests, M6 QA docs, and `.ai` control state only.

Runtime hardening:

- Bound active local OCR preview state to the draft receipt attachment that produced it for both personal and group bill create flows.
- Cleared OCR preview, corrected candidates, section selection, applied state, and extraction state when that source receipt is removed or changed away from receipt purpose.
- Saved provisional OCR review data after bill creation only for the uploaded receipt whose draft attachment produced the active preview, preventing stale preview candidates from being saved against another receipt.
- Preserved unsupported-provider/manual-entry fallback, extraction failure retry, duplicate-warning guidance-only copy, personal/group route context, review-save failure retry from detail, and no automatic existing-bill mutation.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart` passed with 155 tests.
- Exact focused M6 command passed with 270 tests across receipt OCR parser, bill list, attachment section, and group bill list tests.
- Full `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed with 685 Flutter tests.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M6-003 Saved Review Apply Handoff Summary

Updated `apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_detail_content.dart`, `apps/mobile/lib/bills/bill_list_screen.dart`, focused bill-list tests, M6 QA docs, and `.ai` control state only.

Runtime hardening:

- Kept the saved-review apply button disabled after a successful apply result until the user requests a fresh apply preview, preventing duplicate draft-only apply from a stale preview.
- Preserved successful draft-only apply state in the bill-detail saved-review sheet even when the subsequent bill refresh fails.
- Added explicit refresh-needed copy for post-apply refresh failure that tells the user to refresh bill state or reopen the bill, not repeat apply just to reload.
- Kept existing stale-preview conflict, blocked-preview/manual-correction, route mismatch/unavailable review, duplicate save/remove/preview/apply busy guards, and server-authority/no-finalization copy inside current mobile seams.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart --plain-name "personal saved OCR apply refresh failure does not repeat apply mutation"` passed.
- `cd apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart` is part of M6-003 validation.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M5 Selection Summary

M5 is `Day 1 Mobile Recurring Bill Lifecycle UX Hardening`.

The selection is based on current repo state:

- `README.md` says the mobile app has a starter recurring-bill template/forecast/detail/draft-generation surface, while recurring bill creation/editing/full lifecycle/offline queueing/reminders/background generation remain future Day 1 work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires recurring bill creation, basic schedules, due-soon visibility, forecasting, and user confirmation for generated recurring bill instances.
- `docs/features/recurring-bills/TECHNICAL_SPEC.md` confirms backend/generated-client seams already exist for recurring template create/list/get/update/pause/resume/archive, forecast reads, and explicit draft generation.
- Current mobile code under `apps/mobile/lib/recurring_bills/` already exposes recurring list/detail/forecast/draft-generation seams and focused tests, making mobile-only recurring lifecycle hardening coherent without selecting a task that requires API, contract, generated-client, schema, auth, storage, money, deployment, worker, notification delivery, or recurring background generation changes.

## M5 Queue Summary

- `M5-001-RECURRING-BILL-LIFECYCLE-STATE-RECONCILE-20260615-1825` - Completed. Reconciled current mobile recurring bill lifecycle state and updated `docs/qa/M5_MOBILE_RECURRING_BILL_LIFECYCLE_QA_MAP.md` without changing runtime behavior.
- `M5-002-RECURRING-BILL-CREATE-EDIT-LIFECYCLE-20260615-1825` - Completed. Hardened generated-client-backed mobile recurring template create/edit plus pause/resume/archive actions, safe retry states, duplicate-mutation prevention, and server-authority messaging.
- `M5-003-RECURRING-BILL-FORECAST-DRAFT-HANDOFF-20260615-1825` - Completed. Hardened recurring forecast/detail and explicit draft-generation handoff states for stale occurrence data, inactive templates, generated-draft refresh failures, safe retries, idempotent existing-draft copy, and bounded generated context without inventing a generated-bill route.
- `STOP-M5-001` - Stop for API/contracts/generated-client/auth/schema/storage/money/deployment, recurring background generation/reminders/advanced exceptions, broad offline queue/cache/sync, OCR-worker/runtime expansion, settlement, reporting/import/export, notification delivery, web/admin, secrets, or unrelated major-domain scope.

## M5-001 Reconciliation Summary

Updated `docs/qa/M5_MOBILE_RECURRING_BILL_LIFECYCLE_QA_MAP.md` as the current control/QA map for the milestone. The map records:

- Current mobile implementation inventory for recurring template list, read-only template detail, forecast list, explicit confirmed draft generation, loading/empty/retry/error states, generated-client repository seams, server-mode/session-gated behavior, and current tests.
- Day 1 recurring requirement mapping for creation, schedule display, due-soon visibility, forecast reads, user-confirmed generated draft instances, and server-authoritative recurrence/authorization/money/generated-draft behavior.
- Covered automated tests in `apps/mobile/test/recurring_bill_screen_test.dart` and `apps/mobile/test/recurring_bill_generated_repository_test.dart`.
- Focused gaps for M5-002 recurring create/edit/pause/resume/archive lifecycle hardening and M5-003 forecast/draft handoff hardening.
- Explicit non-goals, stop conditions, and validation expectations.

Current implementation findings:

- Mobile currently supports generated-client-backed template list, template detail, forecast list, and explicit confirmed draft generation only.
- Current recurring repository methods are `listTemplates`, `listForecast`, `getTemplate`, and `generateDraft`; create/edit/pause/resume/archive methods are not yet exposed in the mobile recurring repository interface.
- Current UI renders server-provided schedule, status, forecast, generated-draft state, and scope labels without calculating recurrence, authorization, final money, or occurrence state locally.
- Server-mode access remains session-gated through the secure access-token provider; missing tokens fail before generated-client calls.
- Draft generation is explicit, confirmation-gated, duplicate-tap blocked while in progress, and refreshes server state after success.

No mobile runtime files or mobile test files were changed by M5-001.

## M5-002 Create/Edit Lifecycle Hardening Summary

Updated `apps/mobile/lib/recurring_bills/` and focused recurring tests only for the mobile recurring bill create/edit/lifecycle flow.

Runtime hardening:

- Added generated-client-backed mobile repository methods for recurring template create, update, pause, resume, and archive using existing OpenAPI/Dart client seams.
- Added a recurring template create form for contract-supported display, optional group ID, schedule, currency, and one minimal item payload field set.
- Added edit from template detail for server-returned display fields and schedule fields; raw payload editing remains bounded by what the read response exposes.
- Added pause/resume/archive lifecycle actions with confirmation, action-specific in-flight state, duplicate/conflicting mutation blocking, safe terminal archived copy, and server refresh after success.
- Added server-authority copy clarifying that recurrence, group membership, authorization, money, generated drafts, and audit remain API/domain authoritative.
- Preserved existing template list, detail, forecast, and explicit draft-generation behavior.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/recurring_bill_screen_test.dart test/recurring_bill_generated_repository_test.dart` passed with 30 tests.
- New tests cover create form validation, create success/reload, duplicate create blocking, edit prefill/update, pause/resume/archive confirmation and refresh, lifecycle failure safe copy, generated repository create/update/lifecycle mapping, token usage, validation, and bounded failure handling.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M5-003 Forecast/Draft Handoff Summary

Updated `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart` and focused recurring screen tests only.

Runtime hardening:

- Added a generated draft handoff panel that shows server-returned generated draft context without raw generated bill IDs, API paths, stack traces, tokens, or local/generated-client internals.
- Changed post-generate copy to neutral `Draft ready` language so idempotent existing-draft responses are not represented as a newly created mutation.
- Reconciled the matching forecast row from the generated draft response while waiting for server refresh, and cleared the handoff context only when refreshed server forecast no longer matches the returned generated draft.
- Preserved generated context if refresh after generation fails, with a refresh action that reloads server state without repeating draft generation.
- Kept generated, skipped, cancelled, and unknown occurrence states read-only in mobile and preserved server-authority copy for recurrence, authorization, money, generated drafts, and audit.
- Did not add generated bill navigation because no safe generated-bill route dependency exists in the current recurring screen shell; bounded copy points users to Bills instead.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/recurring_bill_screen_test.dart test/recurring_bill_generated_repository_test.dart` passed with 32 tests.
- New tests cover generated context after success, idempotent existing-draft copy without new-mutation language, refresh-after-generate failure preserving generated context, and refresh retry without duplicate draft generation.

M5 is now finalized as a bounded Day 1 mobile recurring bill lifecycle UX hardening checkpoint. Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M5 Kickoff Summary

M5 is queued as a bounded Day 1 mobile recurring bill lifecycle UX hardening milestone. The kickoff moves controller state out of the M4 UI-test-ready stop condition, adds a recurring lifecycle QA map, and updates the scope guard with narrow M5 path allowances only.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.

## M3 Finalization Carry-Forward

M3 is finalized as `Day 1 Mobile Sync + Offline Queue Foundation`.

M3 coverage remains bounded to the existing mobile sync queue, processor, generated sync repository seam, metadata-only change-feed hydration seam, and authenticated bootstrap wiring. M4 must not expand M3 ad hoc into persistent offline cache hydration, cache merge policy, startup/background sync, conflict-resolution UX, manual discard/cancel, backoff/max-attempt policy, API/auth/schema/storage/money/deployment, notification delivery, or unrelated major-domain work.

## M4 Selection Summary

M4 is `Day 1 Mobile Group Bill Lifecycle UX Hardening`.

The selection is based on current repo state:

- `README.md` says the mobile app has starter group-bill list/detail surfaces, while mobile group bill create/edit/lifecycle/offline support remains future Day 1 work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires shared bill creation, group bills and balances, participant acknowledgement/approval, bill attachments/receipt sharing, correction proposals, and dispute basics for Day 1.
- `docs/features/expenses-bills/FUNCTIONAL_SPEC.md` defines shared bill create, bill-on-behalf-of-payer, edit/revision, participant correction, archive/restore, attachments, and group bill list/detail expectations.
- `docs/features/expenses-bills/TECHNICAL_SPEC.md` keeps server-mode business writes, authorization, financial truth, revision context, attachments, and audit behavior API/domain-authoritative.
- Current mobile code under `apps/mobile/lib/bills/` and `apps/mobile/lib/groups/` already exposes group bill list/detail/create/submit, participant accept/reject, group member display, attachments, OCR-review handoff, and revision entry seams backed by existing repository interfaces and tests.
- This makes mobile-only group bill lifecycle hardening the next coherent Day 1 milestone without selecting a task that requires backend/API, OpenAPI/generated-client, auth/session/security, schema, storage, money, settlement, deployment, Docker, CI, secret, or unrelated domain changes.

## M4 Queue Summary

- `M4-001-GROUP-BILL-LIFECYCLE-STATE-RECONCILE-20260615-1659` - Completed. Reconciled current mobile group bill lifecycle state and updated `docs/qa/M4_MOBILE_GROUP_BILL_LIFECYCLE_QA_MAP.md` without changing runtime behavior.
- `M4-002-GROUP-BILL-CREATE-SUBMIT-HARDENING-20260615-1659` - Completed. Hardened existing group bill create/submit UX, safe retries, member/payer/split validation coverage, safe status labels, duplicate-mutation prevention, and bounded unsafe-error display inside current mobile seams.
- `M4-003-GROUP-BILL-DETAIL-LIFECYCLE-HARDENING-20260615-1659` - Completed. Hardened group bill detail lifecycle participant action failure/retry state, action-specific duplicate blocking, server-authority copy, and focused detail tests while preserving current revision, attachment/OCR-review, and member fallback seams.
- `M4-004-GROUP-BILL-LIFECYCLE-QA-FINALIZE-20260615-1659` - Completed. Finalized M4 QA/control state, marked M4 UI-test ready, and preserved deferred manual review status.
- `STOP-M4-001` - Stop for API/contracts/generated-client/auth/schema/storage/money/deployment, broader offline queue/cache/sync, OCR-worker/runtime expansion, recurring, settlement, reporting/import/export, notification delivery, web/admin, secrets, or unrelated major-domain scope.

## M4-004 QA Finalization Summary

M4 is finalized as a bounded Day 1 mobile group bill lifecycle UX hardening checkpoint.

Completed M4 slices:

- M4-001 reconciled current mobile group bill lifecycle implementation and QA state.
- M4-002 completed create/submit resilience hardening within existing mobile seams.
- M4-003 completed detail lifecycle hardening within existing mobile seams.
- M4-004 completed control/QA finalization and set M4 to UI-test ready.

Automated validation for the finalization task is recorded in the task report. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M4.

M4 makes no claims of backend/API/contract/auth/schema/storage/money changes, broad offline queue/cache/sync expansion, recurring/reporting/notification/OCR-worker/web-admin expansion, or manual UI acceptance. The recommended next automated Day 1 action is to run the controller and select the next controller-approved milestone or queue kickoff.

## M4-001 Reconciliation Summary

Updated `docs/qa/M4_MOBILE_GROUP_BILL_LIFECYCLE_QA_MAP.md` as the current control/QA map for the milestone. The map records:

- Day 1 requirement boundary for group bill lifecycle work.
- Current mobile implementation inventory for group bill list/detail/create/submit, participant actions, attachments, OCR review handoff, correction/revision entry, member display/fallbacks, and safe terminal/unavailable/stale/session-required states.
- Covered automated tests across group bill screens, generated bill/group/attachment/revision repositories, attachment sections, and revision screens.
- M4 acceptance targets for M4-002, M4-003, and M4-004.
- Gaps and next-task focus for M4-002 create/submit hardening and M4-003 detail lifecycle hardening.
- Explicit non-goals, stop conditions, and validation expectations.

Current implementation findings:

- Group bill create already persists post-create continuation state so attachment upload, submit, and submitted-detail refresh retries can resume without duplicate create.
- Participant accept/reject actions use the current group/bill/user route and a shared busy state to block duplicate actions.
- Group bill detail uses group attachment routes and receipt-only OCR review discovery/handoff.
- Revision entry refreshes current group bill capability before proposal creation and uses server-provided revision IDs/actions for review.
- Group member display names fall back to bounded participant labels when member loading fails or rows are unknown.
- Safe repository failures cover session-required/session-expired, denied, unavailable, conflict, validation, network, and server states.

No mobile runtime files or mobile test files were changed by M4-001.

## M4-002 Create/Submit Hardening Summary

Updated `apps/mobile/lib/bills/bill_list_screen.dart` and `apps/mobile/test/group_bill_list_screen_test.dart` only for the mobile group bill create/submit flow.

Runtime hardening:

- Added explicit local create operation tracking for creating draft, attaching, submitting, and submitted-detail refresh.
- Rendered bounded status labels and messages for ready to submit, draft created retry upload, retry submit, submitting, submitted, and retry detail refresh.
- Preserved the created draft bill across attachment, submit, and submitted-detail refresh failures so retry uses the existing bill rather than calling create again.
- Kept submit and draft attachment controls disabled while create/attachment/submit/detail refresh work is in flight.
- Added a final UI display guard for create failure messages that suppresses obvious API paths, tokens/secrets, stack traces, and local/storage paths while preserving already-safe bounded repository messages.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/group_bill_list_screen_test.dart` passed with 74 tests.
- Tests assert no duplicate create after attachment/submit/detail failures, no duplicate submit during in-flight submit, visible retry labels, member/payer/split validation blocking before mutation, and safe bounded create error text.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## M4-003 Detail Lifecycle Hardening Summary

Updated `apps/mobile/lib/bills/bill_list_screen.dart` and `apps/mobile/test/group_bill_list_screen_test.dart` only for the mobile group bill detail lifecycle flow.

Runtime hardening:

- Added explicit accept-vs-reject in-flight acknowledgement state so duplicate and conflicting participant actions stay blocked while showing the correct busy affordance.
- Added bounded acknowledgement failure UI with failure title, safe repository message, and a `Refresh bill state` retry that reloads server state without automatically retrying the money-impacting acknowledgement mutation.
- Added explicit server-authority guidance to the acknowledgement card so mobile does not imply it decides authorization or final bill state.
- Preserved current generated-client seams for accept/reject, group-scoped attachment routes, receipt-only OCR review handoff, revision capability refresh, server-returned revision IDs/actions, participant member fallbacks, and terminal/unavailable copy.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/group_bill_list_screen_test.dart` passed with 76 tests.
- New tests assert bounded participant-action failure copy, retryable server-state refresh after acknowledgement failure, no automatic duplicate mutation retry, reject in-flight duplicate/conflicting action blocking, and reject-specific progress state.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.

## Deferred Manual Acceptance Gates

The following remain pending and deferred until Day 1 acceptance. They are not passed:

- Human PC/wide and narrow/mobile UI retest for prior mobile UI milestones.
- Manual code review.
- Day 1 acceptance review of M4 group bill lifecycle behavior after automated M4 work completes.

## Hard Safety Stops

M4 must stop for human approval if a task requires backend/API behavior, OpenAPI or generated-client changes, auth/session/security runtime or configuration, database schema/migrations, storage/file privacy policy changes, money/settlement/bill calculation logic, Docker/env/deployment/CI changes, production deploy/public exposure, force/history operations, branch deletion, secrets, reducing Day 1 scope, replacing architecture direction, or expanding across unrelated major domains.

## Validation Expectations

Kickoff validation must run:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

M4 implementation tasks should add mobile validation:

- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`
