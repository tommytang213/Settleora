# M10 Mobile Self Profile And Payment Details QA Map

Status: `M10-002 complete; M10-003 queued next; manual UI/code review deferred until Day 1 acceptance`

## Boundary

M10 hardens the mobile self profile and text payment-details UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy or file authorization policy changes, QR/proof/receipt byte behavior changes, self payment QR upload/remove/content UX, platform file/image picker dependencies, image normalization, camera/gallery permissions, private-vault behavior, money/bill/settlement/recurring/OCR authority changes, payment-detail visibility policy changes, counterparty authorization changes, global profile/payment lookup, admin/support payment-detail viewing, deployment, Docker, CI, secrets, web/admin runtime UI, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M10-002.

## Selection Basis

- `README.md` records guarded self-profile and self payment-details endpoints, self QR endpoints, settlement-scoped counterparty payment-detail/QR reads, and a starter authenticated mobile self profile/payment-details screen.
- `docs/prd/MVP_DAY1_SCOPE.md` requires Day 1 users to configure optional payment details, including display name, preferred currency, preferred payment method note, optional payment handle/note, optional QR/payment image attachment, and visibility with a recommended default of `settlement_counterparties_only`.
- `docs/architecture/PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md` defines payment details as sensitive app-domain profile data that must never be globally visible, must be API-authorized, and must avoid exposing storage paths, provider internals, QR bytes, vault internals, request bodies, tokens, secrets, or unrelated user data.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records that the mobile self profile/payment-details foundation reads and updates the authenticated actor's own profile and text payment details through generated-client repository seams, loads fresh data when opened, maps failures into bounded mobile states, and displays safe QR availability metadata without QR upload/remove UX.
- Current mobile files under `apps/mobile/lib/profile/` and focused tests under `apps/mobile/test/profile_*` provide bounded seams for mobile-only hardening.

## Current Repository And Model Inventory

`apps/mobile/lib/profile/profile_repository.dart` is the hand-written mobile boundary for authenticated self profile and payment details.

- `SettleoraSelfProfile` carries the server-returned self profile ID, display name, nullable default currency, and created/updated timestamps. Mobile displays the ID neither as authority nor visible user copy.
- `SettleoraSelfProfileUpdate` submits display name and nullable default currency only.
- `SettleoraSelfPaymentDetails` carries configured state, nullable payment profile ID, preferred method label, payment handle, payment note, constrained visibility string, nullable safe QR metadata, and nullable created/updated timestamps.
- `SettleoraSelfPaymentDetailsUpdate` submits text fields and visibility only. It does not carry actor IDs, auth account IDs, user profile IDs, file object IDs, storage paths, provider object keys, QR bytes, vault metadata, settlement IDs, or counterparty claims.
- `SettleoraSelfPaymentQrFile` exposes only content type, byte size, and updated timestamp to mobile. It intentionally omits the QR file ID from the hand-written mobile model even though the generated response includes a stable file ID.
- Visibility values are currently `private`, `settlement_counterparties_only`, and `group_members_when_shared`, with labels `Private`, `Settlement counterparties`, and `Group members when shared`. Unknown visibility values fall back to a title-cased label helper for display only.
- Bounded profile failure kinds are `sessionRequired`, `sessionExpired`, `denied`, `unavailable`, `conflict`, `validation`, `network`, and `server`. Failure `toString()` excludes raw server/problem details.

Mobile models and UI helpers may format server-returned profile/payment fields for display, but they must not decide current actor identity, payment-detail authorization, counterparty visibility, QR byte access, audit, storage policy, vault behavior, or settlement eligibility.

## Generated-Client Repository Mapping

`apps/mobile/lib/profile/generated_profile_repository.dart` adapts the generated Dart client into the hand-written profile seam.

- All four operations read an access token through the injected `SettleoraAccessTokenProvider` per operation before calling the generated client.
- Missing, blank, or unreadable token state maps to `sessionRequired` before any generated-client call.
- Self profile reads and updates use `getSelfUserProfile` and `updateSelfUserProfile`.
- Self payment-details reads and updates use `getSelfPaymentDetails` and `updateSelfPaymentDetails`.
- Profile update input is trimmed before the generated call. Blank display names fail locally; default currency is trimmed, uppercased, nullable when blank, and locally limited to a three-letter code shape.
- Payment text input is trimmed before the generated call. Blank payment method, handle, and note become null. Current local maximums are 120 characters for method, 320 for handle, and 1000 for note.
- Payment visibility is trimmed and must match the known visibility set before the generated update call.
- Generated self payment-details responses map QR metadata into content type, size, and updated timestamp only; generated QR IDs are not surfaced by the mobile profile model.
- Generated failures are reduced to bounded safe failures: 400/422 validation, 401 session-expired, 403 denied, 404/410 unavailable, 409 conflict, 5xx server, transport/TLS/timeout/IO network, and unknown server failure.

Generated-client availability is not permission. The API remains authoritative for current actor resolution, profile mutation rights, payment-detail visibility, QR metadata/content access, file/storage policy, audit, and settlement-scoped counterparty reads.

## Mobile Screen Inventory

`apps/mobile/lib/profile/profile_screen.dart` is the existing authenticated mobile profile/payment-details surface.

- The screen loads self profile and self payment details when opened, and exposes refresh/retry paths that call the repository again.
- The signed-in summary displays the server-returned profile display name and the profile default currency, falling back to the current-user default currency only for display.
- Profile editing supports display name and default currency fields, clear optional three-letter currency helper copy, and a profile save action guarded against duplicate profile submissions.
- Payment editing supports preferred method, payment handle, payment note, visibility dropdown, payment save, and cancel. Payment save is guarded against duplicate payment submissions, and profile/payment saves are disabled while either save path is in flight so independent save paths do not race UI state.
- Payment text is trimmed to null before local validation/submission. Overlong method, handle, or note values fail locally before repository submission, restore the last server-returned/saved payment details into the fields, and suppress the discarded unsafe edit text from visible UI.
- The payment summary distinguishes configured text details from the empty/unconfigured state, shows `Not set` for missing text fields, and displays the selected/server-returned visibility label.
- Current visibility copy states that settlement counterparties are the default and that server authorization controls who can read the details. M10-003 remains the sharper place for final visibility label/copy hardening.
- QR readout is metadata-only: `QR not linked` points to a later file-handling slice, while `QR available` shows content type, size, and updated timestamp. There is no QR upload, remove, content-read, file picker, image normalization, camera/gallery permission, or QR byte rendering UX.
- Load failures use bounded panels with retry or sign-in-required actions for session-required/session-expired states. Inline save failures show bounded repository failure messages for validation, session-required/session-expired, denied, unavailable, conflict, network, and server failures without displaying raw problem details.
- Successful profile/payment saves apply the server-returned saved state first, then refresh through the existing repository seam. If the follow-up refresh fails, the screen preserves the saved state and shows bounded copy telling the user to refresh account details before saving again.
- Visible profile/payment copy avoids raw profile IDs, payment profile IDs, QR file IDs, tokens, API paths, storage paths, provider URLs/object keys, QR bytes, vault internals, request bodies, stack traces, and unrelated user data in current focused coverage.

## App-Shell And Injection Inventory

The authenticated app shell currently wires the profile surface through existing session-gated composition.

- `apps/mobile/lib/app/app_bootstrap.dart` creates the default profile repository with `GeneratedSettleoraProfileRepository.fromConfiguration` after server-mode current-user validation succeeds.
- `apps/mobile/lib/app/server_mode_shell.dart` accepts an injected `SettleoraProfileRepository`, builds `SettleoraProfileScreen` with the authenticated `currentUser`, and routes both dashboard/top-level profile affordances through the same injected repository.
- `apps/mobile/test/profile_screen_test.dart` verifies that the authenticated server shell opens the profile screen and that opening it triggers one self profile read and one self payment-details read.
- The app-shell route and repository injection do not create profile/payment authority. The destination still reloads through the repository, and the repository still relies on per-call token lookup plus API authorization.

## Automated Coverage Inventory

Focused profile/payment coverage currently exists in `apps/mobile/test/profile_generated_repository_test.dart` and `apps/mobile/test/profile_screen_test.dart`.

`profile_generated_repository_test.dart` covers:

- Session-required behavior before generated-client calls when no access token is available.
- Per-operation access-token trimming and lookup for profile read, payment read, profile update, and payment update.
- Safe mapping of generated self profile and self payment-details responses, including QR metadata.
- Profile update normalization for display name and default currency.
- Payment update normalization for method, handle, note, and visibility.
- Exclusion of actor/profile/auth/storage/QR authority fields from generated update payloads.
- Local profile validation before generated calls.
- Mapping generated 400/403/404/409/422/500 failures to bounded validation, denied, unavailable, conflict, validation, and server failures without leaking problem detail text, API paths, tokens, storage paths, or QR/file identifiers.
- Mapping generated 401 failures to bounded session-expired failures without leaking problem detail text.
- Mapping socket/network errors to bounded retry copy without leaking raw transport details.

`profile_screen_test.dart` covers:

- Authenticated server shell opens the profile screen through the injected repository.
- Initial profile/payment load displays display name, currency, configured payment text, visibility, server-authorization copy, QR availability, and suppresses raw profile/payment/QR IDs.
- Empty payment details show `No payment details yet`, `Not set` rows, default settlement-counterparties visibility, and unconfigured guidance.
- Profile and payment edit submissions trim values, update visible state after repository success, and show success snackbars.
- Duplicate profile and payment save taps submit only once while the first save remains in flight.
- Save success plus follow-up refresh failure preserves the returned saved state and shows bounded refresh-before-saving-again copy.
- Repository validation failures show bounded inline copy and suppress unsafe user-entered hidden payment text.
- Overlong payment handle validation fails locally before repository submission and suppresses the unsafe overlong edit text from visible UI.
- Payment cancel restores existing values and suppresses discarded edit text.
- Expired-session load failures show sign-in-required UI, suppress token text, and call the session-ended callback with safe copy.

Profile/payment-adjacent app-shell coverage currently includes:

- `apps/mobile/test/server_mode_shell_dashboard_test.dart`, which includes dashboard/profile affordance expectations and a fake profile repository for server-shell composition.
- `apps/mobile/test/dashboard_preview_screen_test.dart`, which includes the dashboard preview profile affordance among top-level navigation labels.

M10-002 changed only the existing mobile self profile/payment-details screen and focused profile tests, preserving the generated-client repository seam and app-shell injection boundaries.

## Day 1 Requirement Map

| Day 1 profile/payment requirement | Current state | M10 implication |
| --- | --- | --- |
| Display name | Self profile endpoint, generated-client mapping, profile seam, screen readout/edit, duplicate-submit guard, refresh-after-save recovery, and focused screen/repository tests exist. | M10-002 completed edit hardening without adding client-side authority. |
| Preferred currency | Self profile endpoint, generated-client mapping, profile seam, screen readout/edit, optional three-letter helper copy, and local three-letter normalization exist. | M10-002 completed bounded field-copy hardening without adding currency policy or money authority. |
| Preferred payment method note | Self payment-details endpoint, generated-client mapping, profile seam, screen readout/edit, trimming/nulling, duplicate-submit guard, refresh-after-save recovery, and focused coverage exist. | M10-002 completed text edit hardening inside the current seam. |
| Optional payment handle or user-entered note | Self payment-details endpoint, generated-client mapping, profile seam, screen readout/edit, trimming/nulling, max-length validation, and focused coverage exist. | M10-002 completed edit/failure behavior and unsafe text suppression. |
| Visibility setting | API supports constrained values; mobile model, generated mapping, labels, dropdown edit, summary readout, and coverage exist. | M10-003 may harden labels and copy without changing visibility policy or making client authorization decisions. |
| Optional QR/payment image attachment | API and generated clients include self QR endpoints; mobile self payment-details response displays safe QR metadata only. | QR upload/remove/content UX, file picker dependencies, image normalization, permissions, content-read UX, and QR byte rendering are explicit non-goals for M10. M10-003 may only harden metadata readout/copy. |
| Payment details not globally visible | Architecture requires API authorization and no global lookup; current mobile copy says server authorization controls readership. | M10-003 should strengthen non-global visibility copy without changing policy or counterparty authorization. |
| Settlement-scoped counterparty visibility | Backend has settlement-scoped counterparty payment-details/QR reads; settlement mobile surfaces have their own bounded repository seam. | M10 does not alter counterparty endpoints, settlement authorization, or settlement mobile behavior; self-profile copy may clarify server authority only. |

## M10-002 Implementation Summary

- Hardened profile/payment save controls so duplicate taps do not submit twice and profile/payment save paths are disabled while either save is active.
- Added bounded optional-currency and payment text normalization copy without adding currency policy, money authority, backend validation, or generated-client changes.
- Preserved server-returned saved state before follow-up refresh, and added bounded refresh-before-saving-again copy when the refresh fails after a successful save.
- Restored the last safe payment-details state after local validation failure or repository save failure so discarded/invalid edit text is not left visible.
- Expanded focused repository and screen tests for bounded failure mapping, duplicate-submit guards, refresh-after-save recovery, and unsafe text suppression.

## Remaining M10 Focus

- `M10-003` should focus on visibility and QR metadata readout: private/counterparty/group-shared copy, sensitive-data copy, non-global visibility language, default/cleared visibility readout, and QR metadata-only messaging without adding file/byte UX.
- `M10-004` should finalize M10 QA/control state, preserve manual UI/code review deferral, and mark M10 UI-test ready only after bounded implementation slices complete.

## Queue Status

- `M10-001-MOBILE-PROFILE-PAYMENT-STATE-RECONCILE-20260616-1110` - Completed. Reconciled current mobile self profile/payment-details implementation and automated coverage without runtime behavior changes.
- `M10-002-MOBILE-PROFILE-PAYMENT-EDIT-HARDENING-20260616-1110` - Completed. Hardened existing profile/payment edit states, duplicate-submit prevention, bounded failures, refresh-after-save recovery, unsafe edit-text suppression, and server-authority copy inside current mobile seams.
- `M10-003-MOBILE-PAYMENT-VISIBILITY-READOUT-HARDENING-20260616-1110` - Queued next. Harden visibility labels, sensitive-data copy, QR metadata readout, and unsafe text suppression without adding QR byte handling or visibility-policy changes.
- `M10-004-MOBILE-PROFILE-PAYMENT-QA-FINALIZE-20260616-1110` - Queued. Finalize M10 QA/control state, record validation, preserve deferred manual UI/code review status, and mark UI-test ready only after bounded slices complete.
- `STOP-M10-001` - Preserved. Stop for forbidden API/contracts/generated-client/auth/schema/storage/privacy/QR-byte/payment-visibility/counterparty-authorization/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## Validation Expectations

M10-002 final validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `cd apps/mobile && /opt/flutter/bin/dart format --set-exit-if-changed lib/profile lib/app test`
- `cd apps/mobile && /opt/flutter/bin/flutter pub get`
- `cd apps/mobile && /opt/flutter/bin/flutter analyze`
- `cd apps/mobile && /opt/flutter/bin/flutter test test/profile_screen_test.dart test/profile_generated_repository_test.dart test/server_mode_shell_dashboard_test.dart`
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

The final controller dry run should select `M10-003-MOBILE-PAYMENT-VISIBILITY-READOUT-HARDENING-20260616-1110`.

M10-002 changes mobile runtime and tests, so focused Flutter formatting, analyze, focused tests, and full mobile validation are required by the task prompt.

## Stop Conditions And Non-Goals

Stop and report `BLOCKED` if an M10 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy or authorization policy changes, QR/proof/receipt byte behavior, self QR upload/remove/content UX, platform file/image picker dependencies, image normalization, camera/gallery permissions, private-vault behavior, payment-detail visibility policy changes, counterparty authorization changes, global lookup, group-directory payment exposure, admin/support payment-detail viewing, client-side authorization decisions from cached rows, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Non-goals preserved through M10-002: no backend/API behavior, no OpenAPI or generated-client changes, no schema/auth/storage/privacy/QR-byte/money/business authority changes, no payment-detail visibility policy or counterparty authorization changes, no manual UI/code review pass, and no merge without the required PR/CI/merge gates.
