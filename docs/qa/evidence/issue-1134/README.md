# Issue #1134 failure-retry state-action evidence

Scoped shared-component adoption for [Issue #1134](https://github.com/tommytang213/Settleora/issues/1134), not retry-policy, sign-in/session implementation, or whole-screen/native-platform acceptance.

- Implementation [PR #1135](https://github.com/tommytang213/Settleora/pull/1135), reviewed source `0387fc77a58ebc61a47c6ed6da34d49b1b38822c`, tree `302a6652e139fd72848b1f74a9b888e8e1bf0d33`, normal merge `54d9fbb808921077598f547d183b449ad369d06b`; starting main `a7266bd4947968271848d09cd897d072cf1201e3`. Source branch retained.
- The production [capture/regression harness](../../../../apps/mobile/test/ui/sign_in_required_state_actions_test.dart) mounts the actual Profile, Monthly report, and Notifications screens with their repositories and shared `AppButton` at 390px/1× and 320px/2×.
- All three Retry actions were directly equivalent to existing `AppButtonVariant.secondary`; no raw action was retained and no shared API extension was needed.

## Three-surface equivalence and behavior

Each host's `_FailurePanel` still classifies only `sessionRequired` and `sessionExpired` as `requiresSignIn`. The completed #1131 branch condition remains `requiresSignIn && onSessionEnded != null`: it renders the same primary `AppButton` with the exact `*-sign-in-required` key, `Sign In` label, login icon, and existing callback. The non-sign-in branch retains required `VoidCallback onRetry` and now renders an explicit secondary `AppButton` with the exact `profile-retry`, `monthly-report-retry`, or `notification-retry` key, `Retry` label, refresh icon, and unchanged `SettleoraStatePanel` position.

Profile Retry still calls the host `_load`: `getSelfProfile` first, then `getSelfPaymentDetails` only after a successful profile read. The representative failure produces profile/payment counts 1/0 initially and 2/1 after one Retry. Monthly report Retry still calls one `getMonthlyReport` with the same month and group; counts move 1 to 2 and arguments remain `2026-05`/null in order. Notifications Retry still calls `getNotificationSummary` first, then `listNotifications(limit: 50)` after a successful summary; counts move 1/0 to 2/1. One pointer activation produces one reload intent in every host, and all profile/notification mutation counters remain zero; Monthly report exposes no mutation operation.

The existing shared component supplies nullable callback/disabled semantics, one useful button semantic label and tap action, deterministic keyboard focus, and the theme's minimum 48dp target. No loading, expanded width, throttling, navigation, or domain state was invented. Failure titles/messages, cloud-off icons, tones, classification, repository contracts/order, state-panel composition, and token/secret/private-data redaction remain host-owned and unchanged.

The excluded `session-list-sign-in-required` control in `server_mode_shell.dart` and setup/bootstrap controls remain unchanged and outside this presentation-only adoption. #1122 remains OPEN/manual privacy-security gated and was neither implemented nor approved.

## Exact validation and reviews

All commands below passed on clean implementation source `0387fc77a58ebc61a47c6ed6da34d49b1b38822c`.

| Command | Result |
|---|---|
| `git status --short` and exact four-file scope guard | PASS, clean/expected scope |
| `git diff --check origin/main...HEAD` | PASS |
| `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` | PASS |
| `cd apps/mobile && /opt/flutter/bin/flutter pub get` | PASS; dependency update notices informational |
| `cd apps/mobile && /opt/flutter/bin/flutter analyze` | PASS, no issues |
| `cd apps/mobile && /opt/flutter/bin/flutter test test/profile_screen_test.dart test/monthly_report_screen_test.dart test/notification_screen_test.dart test/ui/settleora_component_guardrail_test.dart test/ui/sign_in_required_state_actions_test.dart test/ui/profile_shared_visual_foundation_capture_test.dart test/ui/reports_money_fields_visual_capture_test.dart test/ui/notifications_shared_primitives_visual_capture_test.dart` | PASS, 145 tests |
| `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` | PASS, 955 tests |
| `npm run validate:scaffold` | PASS, 19 paths |

Fresh Gemini `strong_independent` and an independent local Codex reviewer passed the exact source and individually inspected all 24 images with no material findings. Focused and unfocused Retry image hashes differ for every host/viewport. Fresh GitHub Codex passed the same head; CodeQL, Semgrep, Trivy, and scaffold checks succeeded with zero unresolved review threads and zero open PR code-scanning alerts at merge. No finding was suppressed or waived.

## Visual boundary and remaining scope

The exact reviewed images cover secondary Retry normal/focused states plus primary Sign In normal/focused regression states for all three hosts at both required widths/scales. Controls remain readable without critical clipping at 320px/2×, focus is visible, and private values are absent. These are deterministic Flutter production-control captures, not native IME/device/screen-reader or whole-screen acceptance; #975 retains that gate.

#301/#372 remain open. Remaining #301 candidates include other raw forms/buttons and private-dialog framing, token/summary styling, and participant/assignment sharing; completed focused children are not replayed. No backend/domain/API/OpenAPI/generated-client, auth/session/authz, storage/privacy, money/split/settlement/payment/bill calculation, schema, OCR/sync/lifecycle authority, CI/deployment/config, or secret changes were made. Issue #1134 has no linked Project item.

## Image inventory

| Capture | SHA256 |
|---|---|
| [monthly-report-320-2x-focused.png](0387fc77/monthly-report-320-2x-focused.png) | `6bd97ee960d57e5dbeefd533132a00919aac052f5677f3269c13283ed9dbfa3d` |
| [monthly-report-320-2x-non-sign-in.png](0387fc77/monthly-report-320-2x-non-sign-in.png) | `3a866c29e3b8e9d68580c61f5488f1164e72ea4d7ced8a5cc5f173627ebb80cf` |
| [monthly-report-320-2x-retry-focused.png](0387fc77/monthly-report-320-2x-retry-focused.png) | `122ec41489e7d1005be5639047e63f8f905d6977dbee6dbc5ba8e734cbe3de22` |
| [monthly-report-320-2x-sign-in.png](0387fc77/monthly-report-320-2x-sign-in.png) | `7ec6077575fe4e865bef55a9a7fa32ba0d07ef67e8f7bca917f0bc1a4a503889` |
| [monthly-report-390-1x-focused.png](0387fc77/monthly-report-390-1x-focused.png) | `58cb65a65fd1977d56de8c16f20bed61b6623712cace283e71d76d2062e82e45` |
| [monthly-report-390-1x-non-sign-in.png](0387fc77/monthly-report-390-1x-non-sign-in.png) | `6c85f25aae81b1db2c586d11d30151db2d37d9e57ec926864259cc9a284df128` |
| [monthly-report-390-1x-retry-focused.png](0387fc77/monthly-report-390-1x-retry-focused.png) | `999197555cf7321b5ec5edbf4b0674df785db5f042d575a3ad9ac97fe9184fe4` |
| [monthly-report-390-1x-sign-in.png](0387fc77/monthly-report-390-1x-sign-in.png) | `12291a2c30d5cc3585e4bda77d4b6b857c20696b6bbd2a69c0d933ba9172f369` |
| [notification-320-2x-focused.png](0387fc77/notification-320-2x-focused.png) | `f94dd78eea87dbd7628a444c5302aa8a7f37933caf6aa9a7079237be5c547140` |
| [notification-320-2x-non-sign-in.png](0387fc77/notification-320-2x-non-sign-in.png) | `3c316a95ce7d8573d99a81de81167c7511a374a7f863757f628fcd26244c2cee` |
| [notification-320-2x-retry-focused.png](0387fc77/notification-320-2x-retry-focused.png) | `b383d63349f36aa47b8700fc2ce05071c105481ae05b7f5204276a6d20a3fe24` |
| [notification-320-2x-sign-in.png](0387fc77/notification-320-2x-sign-in.png) | `f3d83275626ffb9ad0d804177a9734d2e2bc365a171f6eb22de728261f9dd053` |
| [notification-390-1x-focused.png](0387fc77/notification-390-1x-focused.png) | `0facf099719c2b14874c28ecc815ef396c5539589966cd3317e382361e2904a5` |
| [notification-390-1x-non-sign-in.png](0387fc77/notification-390-1x-non-sign-in.png) | `07a2a88e1238b078f18fdd5a959f6a093064ba4970139ca51263200a4381f884` |
| [notification-390-1x-retry-focused.png](0387fc77/notification-390-1x-retry-focused.png) | `5c16a3ef406645546c1158a0f29621f8f0411c2d50ee8a55676557ce61fa8b43` |
| [notification-390-1x-sign-in.png](0387fc77/notification-390-1x-sign-in.png) | `bec47726dcb2974fcc389d251ea5cd4901f45726a02867da48f89422ba39d449` |
| [profile-320-2x-focused.png](0387fc77/profile-320-2x-focused.png) | `97de75cfa0790585d95d49fbeec462bb1243db4438996f4912441b890ecdf753` |
| [profile-320-2x-non-sign-in.png](0387fc77/profile-320-2x-non-sign-in.png) | `757cc48690225b480a8b000ac02aec7f28d9147d5a0f0802ee8e80d59884239b` |
| [profile-320-2x-retry-focused.png](0387fc77/profile-320-2x-retry-focused.png) | `1d63d2fbfde81b3b6f6e3b2bf42ecbf868d6e9a0893b4d67933e08f3f0b98042` |
| [profile-320-2x-sign-in.png](0387fc77/profile-320-2x-sign-in.png) | `0a941024958e0c566386dbfd54a5b9240ca01e74a9ceb74d8d1c3e039c82f2f8` |
| [profile-390-1x-focused.png](0387fc77/profile-390-1x-focused.png) | `a3f18ec2695a92bc14eb99f6bcd7688af3c86337335af4823f891213b2505869` |
| [profile-390-1x-non-sign-in.png](0387fc77/profile-390-1x-non-sign-in.png) | `721883443350cbef6f547b69aac7d2573ba0ce455dad45c87189d61e98d65c97` |
| [profile-390-1x-retry-focused.png](0387fc77/profile-390-1x-retry-focused.png) | `f7477eb02c82ea633e4ce2eb6383863b1aed286aed4c21d50f9fa4e22830f816` |
| [profile-390-1x-sign-in.png](0387fc77/profile-390-1x-sign-in.png) | `59b6ae87e53beb25fedda9d2b782e16a2a1e3743bfa1782d915831e7ecefb0f6` |
