# Issue #1131 sign-in-required state-action evidence

Scoped shared-component adoption for [Issue #1131](https://github.com/tommytang213/Settleora/issues/1131), not sign-in/session implementation or whole-screen/native-platform acceptance.

- Implementation [PR #1132](https://github.com/tommytang213/Settleora/pull/1132), reviewed source `ca55c0298fb9c8fdfcdbcc92260ea0584451e55b`, tree `d27b1467b0ad6852d0550f5e94d8dbd09f0d9514`, normal merge `11d370568db547719aa4781aca9a6ade325b6ed6`; starting main `7c16c47539337d71971e6b31c7749176c7c4bf86`. Source branch retained.
- The production [capture/regression harness](../../../../apps/mobile/test/ui/sign_in_required_state_actions_test.dart) mounts the actual Profile, Monthly report and Notifications screens with their repositories and the shared `AppButton` at 390px/1× and 320px/2×.
- All three actions are directly equivalent to the existing primary `AppButton`; no raw action was retained and no shared API extension was needed.

## Three-surface equivalence and behavior

Profile `_FailurePanel` classifies `sessionRequired` and `sessionExpired` as `requiresSignIn`. Its action remains absent for other failure classes and when `onSessionEnded` is null. The helper still receives `VoidCallback?`; the host closure still calls `_endSession(loadFailure)`, preserves the existing pop behavior and invokes the existing `Future<void> Function(String?)?` callback once with `failure.message`.

Monthly report `_FailurePanel` has the same two-class and non-null callback gate. Its host closure still calls `_endSession(failure)`, preserves the existing pop behavior and invokes the existing asynchronous callback once with `failure.userMessage`. Notifications uses the same two-class and callback gate, with its existing closure, pop behavior and `failure.message` forwarding unchanged.

Each directly equivalent action now uses explicit `AppButtonVariant.primary` while retaining its exact key (`profile-sign-in-required`, `monthly-report-sign-in-required`, or `notification-sign-in-required`), `Sign In` label, `Icons.login_outlined`, callback and `SettleoraStatePanel` position. Default enabled behavior, a minimum 48dp target, useful single button semantics and deterministic keyboard focus are supplied by the existing shared component. No loading or expanded state was invented.

The failure title, message, lock/cloud-off icon and tone remain host-owned and unchanged. Representative network failures retain the existing outlined Retry action and never show Sign In. Both session-required classes render Sign In. Null callbacks render no Sign In. Exact tap tests prove one callback invocation and zero profile/report/notification repository mutations. Existing token/secret/private-value redaction tests remain green.

The excluded `session-list-sign-in-required` action in `server_mode_shell.dart` remains byte-identical. It is a central session/security-shell action with a required `SettleoraSessionEndedCallback` and explicitly forwards its own failure message, so it was not forced into this presentation-only scope. Setup/bootstrap sign-in/connect actions are also unchanged. No classification, token/session validation, secure storage, auth repository, navigation/session policy, server authorization or redaction behavior changed.

## Exact validation and reviews

All commands below passed on clean implementation source `ca55c0298fb9c8fdfcdbcc92260ea0584451e55b`.

| Command | Result |
|---|---|
| `git status --short` and exact four-file scope guard | PASS, clean/expected scope |
| `git diff --check origin/main...HEAD` | PASS |
| `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` | PASS |
| `cd apps/mobile && /opt/flutter/bin/flutter pub get` | PASS; dependency update notices informational |
| `cd apps/mobile && /opt/flutter/bin/flutter analyze` | PASS, no issues |
| focused Profile/Monthly report/Notification/shared-button/visual suite | PASS, 145 tests |
| independent focused Profile/Monthly report/Notification suite | PASS, 89 tests |
| `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` | PASS, 955 tests |
| `npm run validate:scaffold` | PASS, 19 paths |

Fresh Gemini `strong_independent` and an independent local Codex reviewer passed the exact source and individually inspected all 18 images with no material findings. Focused and unfocused image hashes differ for each host/viewport. Fresh GitHub Codex passed the same head; CodeQL, Semgrep, Trivy and scaffold checks succeeded with zero unresolved review threads and zero open PR code-scanning alerts at merge. No finding was suppressed or waived.

## Visual boundary and remaining scope

The exact reviewed images cover Sign In, real traditional keyboard-focus highlight and a representative non-sign-in failure for all three hosts at both required widths/scales. The shared action remains readable without critical clipping at 320px/2×, the state panel remains coherent, and non-sign-in failures preserve Retry. These are deterministic Flutter production-control captures, not native IME/device/screen-reader or whole-screen acceptance; #975 retains that gate.

Issue #1122 remains OPEN/manual privacy-security gated and was neither implemented nor approved. #301/#372 remain open. Remaining #301 candidates include other raw forms/buttons and private-dialog framing, token/summary styling, and participant/assignment sharing; completed focused children are not replayed. No backend/domain/API/OpenAPI/generated-client, auth/session/authz, storage/privacy, money/split/settlement/payment/bill calculation, schema, OCR/sync/lifecycle authority, CI/deployment/config or secret changes were made. Issue #1131 has no linked Project item.

## Image inventory

| Capture | SHA256 |
|---|---|
| [monthly-report-320-2x-focused.png](ca55c029/monthly-report-320-2x-focused.png) | `6bd97ee960d57e5dbeefd533132a00919aac052f5677f3269c13283ed9dbfa3d` |
| [monthly-report-320-2x-non-sign-in.png](ca55c029/monthly-report-320-2x-non-sign-in.png) | `b10a7d3ff6472cf4256b9ff6d5cd1676b7c2322fceb309aa580852cf19125a1c` |
| [monthly-report-320-2x-sign-in.png](ca55c029/monthly-report-320-2x-sign-in.png) | `7ec6077575fe4e865bef55a9a7fa32ba0d07ef67e8f7bca917f0bc1a4a503889` |
| [monthly-report-390-1x-focused.png](ca55c029/monthly-report-390-1x-focused.png) | `58cb65a65fd1977d56de8c16f20bed61b6623712cace283e71d76d2062e82e45` |
| [monthly-report-390-1x-non-sign-in.png](ca55c029/monthly-report-390-1x-non-sign-in.png) | `24f6ce6af69e2f323cb14d5b8aaab3eba521becf519ddae292abf376f1407eec` |
| [monthly-report-390-1x-sign-in.png](ca55c029/monthly-report-390-1x-sign-in.png) | `12291a2c30d5cc3585e4bda77d4b6b857c20696b6bbd2a69c0d933ba9172f369` |
| [notification-320-2x-focused.png](ca55c029/notification-320-2x-focused.png) | `f94dd78eea87dbd7628a444c5302aa8a7f37933caf6aa9a7079237be5c547140` |
| [notification-320-2x-non-sign-in.png](ca55c029/notification-320-2x-non-sign-in.png) | `f617cd4fd43d35021799981a7907ef60363c32f65311b5953135d6b8bd12cef6` |
| [notification-320-2x-sign-in.png](ca55c029/notification-320-2x-sign-in.png) | `f3d83275626ffb9ad0d804177a9734d2e2bc365a171f6eb22de728261f9dd053` |
| [notification-390-1x-focused.png](ca55c029/notification-390-1x-focused.png) | `0facf099719c2b14874c28ecc815ef396c5539589966cd3317e382361e2904a5` |
| [notification-390-1x-non-sign-in.png](ca55c029/notification-390-1x-non-sign-in.png) | `23f41de91c4efc49b321321808dfbcd4082e4958bd5bb2bcf8d4b2596d3291ea` |
| [notification-390-1x-sign-in.png](ca55c029/notification-390-1x-sign-in.png) | `bec47726dcb2974fcc389d251ea5cd4901f45726a02867da48f89422ba39d449` |
| [profile-320-2x-focused.png](ca55c029/profile-320-2x-focused.png) | `97de75cfa0790585d95d49fbeec462bb1243db4438996f4912441b890ecdf753` |
| [profile-320-2x-non-sign-in.png](ca55c029/profile-320-2x-non-sign-in.png) | `10ab052310d0b63c67b3fa73e8ed560636242ea82c10e5119e3a9d05f7d0f052` |
| [profile-320-2x-sign-in.png](ca55c029/profile-320-2x-sign-in.png) | `0a941024958e0c566386dbfd54a5b9240ca01e74a9ceb74d8d1c3e039c82f2f8` |
| [profile-390-1x-focused.png](ca55c029/profile-390-1x-focused.png) | `a3f18ec2695a92bc14eb99f6bcd7688af3c86337335af4823f891213b2505869` |
| [profile-390-1x-non-sign-in.png](ca55c029/profile-390-1x-non-sign-in.png) | `f414a3e01afb7cf90710015d569beefa4e680f74e81a14fc3839274d9ca7f75b` |
| [profile-390-1x-sign-in.png](ca55c029/profile-390-1x-sign-in.png) | `59b6ae87e53beb25fedda9d2b782e16a2a1e3743bfa1782d915831e7ecefb0f6` |
