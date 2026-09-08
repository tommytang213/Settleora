# Issue #1137 group member-add shared-control evidence

Scoped shared-component adoption for [Issue #1137](https://github.com/tommytang213/Settleora/issues/1137), not membership policy, identity resolution, member update/removal, or whole-screen/native-platform acceptance.

- Implementation [PR #1138](https://github.com/tommytang213/Settleora/pull/1138), reviewed source `4f09394df47211d75179b46a9869a5f8f37bbc1b`, tree `f1f584a79557b2d23fc6d0fe461ec873a4f9533f`, normal merge `4baae3e8a5be8a3a8148088548e348ad74b27a07`; starting main `6566f9630adb33906c5cc230a3c4420edfea4969`. Source branch retained.
- The production [capture/regression harness](../../../../apps/mobile/test/ui/group_member_add_shared_controls_test.dart) mounts the actual group-detail screen with its repository, `AppTextField`, local role dropdown, and `AppButton` at 390px/1× and 320px/2×.
- The profile field and primary action were directly equivalent to existing shared controls. The role selector remains local because no generic shared selector has identical values, labels, selection, disabled semantics, callback, and layout. No shared API extension was needed.

## Equivalence and behavior

The state-owned `_memberProfileIdController` and its disposal remain host-owned. `group-member-profile-id`, `User profile ID`, `TextInputAction.next`, controller identity, raw single-line input, focus order, and request text remain exact; `labelAbove` uses the existing shared presentation to avoid narrow-scale label/value collision without trimming, normalization, validation, lookup, or reinterpretation.

The local `group-member-role` dropdown still owns no state: the host `_memberRole` starts as `SettleoraGroupRoleValues.member`, exposes exact `owner`/`member` values with `Owner`/`Member` labels, writes the same host state, and disables while `_isAddingMember`. No group-specific or generic selector abstraction was invented.

The exact `group-member-add` action remains primary with `Add Member` and `Icons.person_add_alt_1_outlined`; existing `AppButton.isLoading` supplies the 18px progress indicator, disables activation, preserves useful semantics, and retains the theme's 48dp minimum target. `_addMember` remains unchanged: it guards both `_isAddingMember` and `_busyMemberProfileId`, makes exactly one `repository.addGroupMember(groupId, SettleoraGroupMemberAddRequest(userProfileId: controller.text, role: _memberRole))` call, clears the controller and resets the role to member on success, replaces/inserts by returned profile ID without duplicate rows, preserves feedback and `_actionFailure`, and clears busy state in `finally`.

Member search/filter, update/remove, and destructive removal confirmation remain unchanged. Completed #1097 member picker, #1106 create/rename, and #1128 group-list search are not replayed. #1122 remains OPEN/manual-gated and untouched; #976 retains identity/membership-policy audit ownership.

## Exact validation and reviews

All commands below passed on clean implementation source `4f09394df47211d75179b46a9869a5f8f37bbc1b`.

| Command | Result |
|---|---|
| `git status --short` and exact three-file scope guard | PASS, clean/expected scope |
| `git diff --check origin/main...HEAD` | PASS |
| `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` | PASS |
| `cd apps/mobile && /opt/flutter/bin/flutter pub get` | PASS; dependency update notices informational |
| `cd apps/mobile && /opt/flutter/bin/flutter analyze` | PASS, no issues |
| `cd apps/mobile && /opt/flutter/bin/flutter test test/group_list_screen_test.dart test/ui/group_member_add_shared_controls_test.dart test/ui/group_form_shared_controls_test.dart test/ui/group_list_shared_search_test.dart test/ui/groups_shared_primitives_visual_capture_test.dart test/ui/groups_settle_notifications_parity_visual_capture_test.dart` | PASS, 55 tests |
| `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` | PASS, 966 tests |
| `npm run validate:scaffold` | PASS, 19 paths |

Fresh Gemini `strong_independent` and an independent local Codex reviewer passed the exact source and individually inspected all 16 images with no actionable findings. Fresh GitHub Codex passed the same head; CodeQL, Semgrep, Trivy, and scaffold checks succeeded with zero unresolved review threads and zero open PR code-scanning alerts at merge. No finding was suppressed or waived.

## Visual boundary and remaining scope

The exact reviewed images cover normal/default role, populated raw ID, owner selection, busy/loading/disabled, success/reset, focused profile field, keyboard focus reachability, and representative failure at both required widths/scales. The changed controls remain readable without critical clipping at 320px/2×. A pre-existing narrow Group bills handoff-card wrap is outside the exact three-file source change. These are deterministic Flutter production-control captures, not native IME/device/screen-reader or whole-screen acceptance; #975 retains that gate.

#301/#372 remain open. Remaining #301 candidates include other raw forms/buttons and private-dialog framing, token/summary styling, and participant/assignment sharing; completed focused children are not replayed. No backend/domain/API/OpenAPI/generated-client, auth/session/authz, membership/role policy, storage/privacy, money/split/settlement/payment/bill calculation, schema, OCR/sync/lifecycle authority, CI/deployment/config, or secret changes were made. Issue #1137 has no linked Project item.

## Image inventory

| Capture | SHA256 |
|---|---|
| [320-2x-add-busy-disabled.png](4f09394d/320-2x-add-busy-disabled.png) | `6e3e3b4d1e04f39d434a05059df311b87eabe6438d3d19ee35cd8d7a713f424f` |
| [320-2x-failure.png](4f09394d/320-2x-failure.png) | `4775c042636d53ef203f927626a725d8ad5f8686facb776b72d758b23f06e76e` |
| [320-2x-keyboard-focus-reachable.png](4f09394d/320-2x-keyboard-focus-reachable.png) | `830550b8debd44cc6944a21a55b4a42cfa26c36db918c18bd9794a6389d0baf3` |
| [320-2x-normal-default-role.png](4f09394d/320-2x-normal-default-role.png) | `5055789adf6715a19722f6735078f584675c2363a423375ca81f59fbe428cb8e` |
| [320-2x-owner-role-selected.png](4f09394d/320-2x-owner-role-selected.png) | `6f1d7f0d3aabdd9d0496c525d3955620b2bbb50efcdbc23743be1541d5827e7e` |
| [320-2x-populated-profile-id.png](4f09394d/320-2x-populated-profile-id.png) | `24eed505d67b29e89263377d6b099fafc60aae2fcc323d895098468c30f7d9a1` |
| [320-2x-profile-field-focused.png](4f09394d/320-2x-profile-field-focused.png) | `72ac89fbada3dcd970879dbb247f6e69f6460749c19480fc4ad41b4a9e3b8faa` |
| [320-2x-success-reset.png](4f09394d/320-2x-success-reset.png) | `72ac89fbada3dcd970879dbb247f6e69f6460749c19480fc4ad41b4a9e3b8faa` |
| [390-1x-add-busy-disabled.png](4f09394d/390-1x-add-busy-disabled.png) | `7e59a5118914f8485b7ba02bc097a1973be8a555d9c255ed4adf79df0c4eebb1` |
| [390-1x-failure.png](4f09394d/390-1x-failure.png) | `5f13823062e915f76fd5fdfb287c08e094ad0bfeae51499f0c8cb72e2980ae84` |
| [390-1x-keyboard-focus-reachable.png](4f09394d/390-1x-keyboard-focus-reachable.png) | `71e7be06ef6acc0d215f462ebd7310457d806658d24ba28bc56b4bf0286f2d9f` |
| [390-1x-normal-default-role.png](4f09394d/390-1x-normal-default-role.png) | `f88045d9e5bcc8bd5caa014152495d6e6f8f6afe3f08ace19d05e929534d44fe` |
| [390-1x-owner-role-selected.png](4f09394d/390-1x-owner-role-selected.png) | `b42c19be997152dbd1fc6ba047ac0e97f7c2f55e190dbe0e03eb901ae4dac36e` |
| [390-1x-populated-profile-id.png](4f09394d/390-1x-populated-profile-id.png) | `9a5470b9f05691a649c41883a751cecbe47910c007c38fef15b21cab3ff012d0` |
| [390-1x-profile-field-focused.png](4f09394d/390-1x-profile-field-focused.png) | `e071bc4f29941028467831ac28965de0d238c4f0dfd34fa1090b73d4e6166fbe` |
| [390-1x-success-reset.png](4f09394d/390-1x-success-reset.png) | `e071bc4f29941028467831ac28965de0d238c4f0dfd34fa1090b73d4e6166fbe` |
