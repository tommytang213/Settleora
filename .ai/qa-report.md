# AI QA Report

Status: `M1 UI-test date/currency input polish validated locally; human review required before merge`

## Acceptance Checklist

- [x] Current milestone goal is still accurate.
- [x] Task queue reflects the next safe milestone work.
- [x] Scope guard passes for the branch under review.
- [x] Required validation commands pass or have documented blockers.
- [x] No forbidden backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, money, storage/privacy, deployment/env, or secret changes are present.
- [x] UI testing checklist is ready when milestone work reaches QA.

## M1 Final Validation Summary

- M1-009 UI-test date/currency input polish is validated locally on `ai/task/m1-ui-test-date-currency-input-polish-20260611-2125`.
- Group bill create now uses a mobile date picker affordance with a `Today` shortcut in Basics instead of visible free-text date entry.
- Group bill create currency controls now use dropdown/selectors for bill-level currency, receipt item currency, and payer currency; submitted draft values remain uppercase 3-letter currency codes.
- Focused validation: `/opt/flutter/bin/dart format --set-exit-if-changed apps/mobile/lib/bills/bill_list_screen.dart apps/mobile/test/group_bill_list_screen_test.dart apps/mobile/test/bill_list_screen_test.dart` passed, `flutter analyze` passed, and `flutter test test/group_bill_list_screen_test.dart test/bill_list_screen_test.dart` passed with 144 tests.
- Full mobile validation: `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed; mobile doctor passed, `flutter pub get` passed with dependency-update notices only, `flutter analyze` found no issues, and the full Flutter suite passed with 531 tests.
- QA docs now note mobile picker/today and currency selector expectations plus a future web note that web date UX should support keyboard/manual input as well as picker/today behavior.
- No forbidden backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, settlement/payment/bill calculation, Docker/env/deployment/CI, web runtime, storage/privacy policy, or secret changes are part of this UI-test bugfix loop.

- M1-008 UI-test item quantity/split cleanup is validated locally on `ai/task/m1-ui-test-item-quantity-split-cleanup-20260611-2058`.
- The group bill create `Receipt & Items` item card no longer exposes raw split-entry controls (`Splits`, `Add split`, member dropdown, split method, basis value, or allocation order); split assignment remains in the `Split` step assignment workspace and sheet.
- Item entry now labels the amount as line total and adds local quantity/units guidance that initializes unit/share assignment guidance without multiplying or changing the submitted line total amount.
- Focused validation: `/opt/flutter/bin/dart format --set-exit-if-changed apps/mobile/lib/bills/bill_list_screen.dart apps/mobile/test/group_bill_list_screen_test.dart apps/mobile/test/bill_list_screen_test.dart` passed, and `flutter test test/group_bill_list_screen_test.dart test/bill_list_screen_test.dart` passed with 143 tests.
- Full mobile validation: `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed; mobile doctor passed, `flutter pub get` passed with dependency-update notices only, `flutter analyze` found no issues, and the full Flutter suite passed with 530 tests.
- M1-007 UI-test bugfix loop is validated on `ai/task/m1-ui-test-group-bill-create-fixes-20260611-2021` at implementation commit `fb19242a3ae5aa57a6be34daf053a3461e106078`.
- Human UI testing found group bill create UX/product bugs in split assignment, payer defaults, and submit payload handling.
- Mobile-side fixes now make unit/share assignment use supported `share_weight` payloads with explicit line-unit copy, expose exact amount inputs, expose share-weight inputs, default current-user payer rows when safe, and omit blank equal-split `basisValue` keys from generated create payloads.
- Focused validation: `flutter analyze` passed, `flutter test test/bill_generated_repository_test.dart` passed with 28 tests, `flutter test test/group_bill_list_screen_test.dart` passed with 68 tests, and the focused combined command over `group_bill_list_screen_test.dart`, `bill_list_screen_test.dart`, and `bill_generated_repository_test.dart` passed with 169 tests.
- Full mobile validation: `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed; mobile doctor passed, `flutter pub get` passed with dependency-update notices only, `flutter analyze` found no issues, and the full Flutter suite passed with 529 tests.
- PR #83 (`M1-005`) was validated and merged into `ai/integration` at `64b3d324f9f140e991bb1f9c14fe8fa8d3eab3ae`.
- M1 group bill create/list/detail readiness is now human-gated for server-mode owner UI testing.
- UI testing checklist: `docs/qa/M1_GROUP_BILL_UI_TESTING_CHECKLIST.md`.
- Last validated integration commit for M1 readiness: `64b3d324f9f140e991bb1f9c14fe8fa8d3eab3ae`.
- Human UI-testing findings are recorded in `.ai/qa-findings.json` as `fixed_validated`.
- No forbidden backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, settlement/payment/bill calculation, Docker/env/deployment/CI, storage/privacy policy, or secret changes are part of M1 finalization.

## Validation

- AI V3 controller hardening: Codex real-run output is redirected to per-iteration logs under `/workspace/logs/ai-v3-controller/codex-runs/` instead of being buffered in Node memory, preserving command/source/status/log-path diagnostics and a short failure tail.
- AI V3 milestone runner wrapper added at `scripts/ai/run-v3-milestone.sh`; it starts from the repo root, refuses `main`, exports the stable Flutter/user-bin PATH, and runs the controller with `--run --allow-auto-merge` plus a bounded max iteration count.
- Scope guard path allowance updated for the new AI controller runner wrapper so controller-only hardening can pass the same PR gate as other AI workflow changes.
- `git status --short`: passed before commit; changed files were limited to `.ai/qa-report.md`, `docs/workflow/AI_V3_CONTROLLER.md`, `scripts/ai/v3-controller.mjs`, `scripts/ai/v3-scope-guard.mjs`, and `scripts/ai/run-v3-milestone.sh`.
- `git diff --name-only origin/ai/integration...HEAD`: passed before commit with no output because the task changes were not committed yet; rerun required after commit.
- `git diff --check origin/ai/integration...HEAD`: passed before commit with no output.
- `node --check scripts/ai/v3-controller.mjs`: passed with no output.
- `bash -n scripts/ai/run-v3-milestone.sh`: passed with no output.
- `bash -lc 'command -v node && command -v /home/tommytang213/bin/codex-vm-full && command -v /opt/flutter/bin/flutter'`: passed; resolved `/usr/bin/node`, `/home/tommytang213/bin/codex-vm-full`, and `/opt/flutter/bin/flutter`.
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`: passed; selected `M1-005 - Group bill UI navigation and checklist polish`, wrote a prompt under `/workspace/logs/ai-v3-controller/tasks/`, wrote a run log under `/workspace/logs/ai-v3-controller/`, and did not invoke Codex.
- `npm run validate:docs`: passed; documentation validation passed.
- `npm run validate:scaffold`: passed; scaffold validation passed for 19 paths.
- `npm run validate:openapi`: passed; Redocly validated `packages/contracts/openapi/settleora.v1.yaml`.
- Post-commit `git status --short`: passed with no output.
- Post-commit `git diff --name-only origin/ai/integration...HEAD`: passed; changed files were `.ai/qa-report.md`, `docs/workflow/AI_V3_CONTROLLER.md`, `scripts/ai/run-v3-milestone.sh`, `scripts/ai/v3-controller.mjs`, and `scripts/ai/v3-scope-guard.mjs`.
- Post-commit `git diff --check origin/ai/integration...HEAD`: passed with no output.
- Post-commit `node --check scripts/ai/v3-controller.mjs`: passed with no output.
- Post-commit `bash -n scripts/ai/run-v3-milestone.sh`: passed with no output.
- Post-commit `bash -lc 'command -v node && command -v /home/tommytang213/bin/codex-vm-full && command -v /opt/flutter/bin/flutter'`: passed; resolved `/usr/bin/node`, `/home/tommytang213/bin/codex-vm-full`, and `/opt/flutter/bin/flutter`.
- Post-commit `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`: passed; selected `M1-005 - Group bill UI navigation and checklist polish`, wrote a prompt under `/workspace/logs/ai-v3-controller/tasks/`, wrote a run log under `/workspace/logs/ai-v3-controller/`, and did not invoke Codex.
- Post-commit `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD`: passed; five changed files were classified as allowed M1 paths and scope guard passed.
- Post-commit `npm run validate:docs`: passed; documentation validation passed.
- Post-commit `npm run validate:scaffold`: passed; scaffold validation passed for 19 paths.
- Post-commit `npm run validate:openapi`: passed; Redocly validated `packages/contracts/openapi/settleora.v1.yaml`.
- M1-004 dirty salvage: preserved the dirty M1-004 diff on `ai/task/m1-004-receipt-attachment-handoff-clarity`, confirmed dirty files were limited to the six expected mobile bill/test files, and completed focused receipt/supporting-attachment handoff copy polish without backend/API, generated-client, storage-policy, auth, schema, money, deployment, CI, or secret changes.
- M1-004 implementation: clarified receipt versus supporting attachment upload choices, receipt upload success feedback, saved attachment row handoff copy, and group/personal bill create draft attachment copy so receipts remain evidence/input with provisional review-first OCR and supporting files remain bill evidence only.
- M1-004 state repair: `M1-004` is marked completed, `lastCompletedTaskId` is `M1-004`, `currentTaskId` is `M1-005`, and human-review/blocker state remains clear.
- M1-005 implementation: receipt/import group bill create navigation now returns Back from Receipt & Items to Start, and the group bill review checklist now labels no attachments as an optional state rather than an incomplete review item.
- M1-005 state update: `M1-005` is marked completed, `lastCompletedTaskId` is `M1-005`, `currentTaskId` is `M1-006`, and human-review/blocker state remains clear.
- `/opt/flutter/bin/dart format --set-exit-if-changed lib/bills/bill_list_screen.dart test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart` from `apps/mobile`: passed; 3 files checked and 0 changed.
- `/opt/flutter/bin/flutter test test/group_bill_list_screen_test.dart` from `apps/mobile`: passed; 65 tests passed.
- `/opt/flutter/bin/flutter test test/bill_list_screen_test.dart` from `apps/mobile`: first run failed after an over-broad assertion update in the personal checklist test and one remaining stale group checklist assertion; rerun after correcting test expectations passed with 74 tests.
- `npm run doctor:mobile`: passed; mobile doctor passed with Flutter `3.44.0` and Dart `3.12.0`.
- `npm run validate:mobile`: passed; mobile doctor passed, `flutter pub get` passed with dependency-update notices only, `flutter analyze` found no issues, and the full Flutter suite passed with 526 tests.
- `git status --short --branch` from repo root before salvage: passed; branch was `ai/task/m1-004-receipt-attachment-handoff-clarity` with only the six expected dirty mobile files.
- `git diff --name-only` from repo root before salvage: passed; dirty files were `apps/mobile/lib/bills/bill_attachment_section.dart`, `apps/mobile/lib/bills/bill_attachment_section_accessibility.dart`, `apps/mobile/lib/bills/bill_list_screen.dart`, `apps/mobile/test/bill_attachment_section_test.dart`, `apps/mobile/test/bill_list_screen_test.dart`, and `apps/mobile/test/group_bill_list_screen_test.dart`.
- `git diff --stat` from repo root before salvage: passed; six files changed with 136 insertions and 20 deletions before final polish.
- `git fetch origin ai/integration`: passed; `origin/ai/integration` fetched successfully and the task branch already contained the latest integration commit.
- `git diff --check` from repo root after `.ai` updates: passed with no output.
- `/opt/flutter/bin/dart format --set-exit-if-changed lib/bills/bill_attachment_section.dart lib/bills/bill_attachment_section_accessibility.dart lib/bills/bill_list_screen.dart test/bill_attachment_section_test.dart test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart` from `apps/mobile`: first run formatted `lib/bills/bill_list_screen.dart` and exited nonzero as expected under `--set-exit-if-changed`; rerun passed with 6 files checked and 0 changed.
- `/opt/flutter/bin/flutter pub get` from `apps/mobile`: passed; dependencies resolved, with dependency-update notices only.
- `/opt/flutter/bin/flutter analyze` from `apps/mobile`: passed; no issues found.
- `/opt/flutter/bin/flutter test test/bill_attachment_section_test.dart test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart` from `apps/mobile`: passed; 164 tests passed.
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` from repo root: passed; mobile doctor passed with Flutter `3.44.0` and Dart `3.12.0`, `flutter pub get` passed, `flutter analyze` passed, and the full Flutter suite passed with 524 tests.
- `git diff --check origin/ai/integration...HEAD`: passed after commit with no output.
- `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD`: passed after commit with changed files limited to `.ai/qa-report.md`, `.ai/state.json`, `.ai/task-queue.json`, `apps/mobile/lib/bills/bill_attachment_section.dart`, `apps/mobile/lib/bills/bill_attachment_section_accessibility.dart`, `apps/mobile/lib/bills/bill_list_screen.dart`, `apps/mobile/test/bill_attachment_section_test.dart`, `apps/mobile/test/bill_list_screen_test.dart`, and `apps/mobile/test/group_bill_list_screen_test.dart`.
- `npm run validate:docs`: passed before and after commit; documentation validation passed.
- M1-003 implementation: polished group bill create recovery so a transient detail reload failure after successful submit retries `getGroupBill` without duplicating `submitGroupBill`; added focused widget coverage in `apps/mobile/test/group_bill_list_screen_test.dart`.
- `/opt/flutter/bin/dart format --set-exit-if-changed lib/bills/bill_list_screen.dart test/group_bill_list_screen_test.dart` from `apps/mobile`: passed; formatted 2 files, 0 changed.
- `/opt/flutter/bin/flutter pub get` from `apps/mobile`: passed; dependencies resolved, with dependency-update notices only.
- `/opt/flutter/bin/flutter analyze` from `apps/mobile`: passed; no issues found.
- `/opt/flutter/bin/flutter test test/group_bill_list_screen_test.dart` from `apps/mobile`: passed; 64 tests passed.
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`: passed; mobile doctor passed with Flutter `3.44.0` and Dart `3.12.0`, `flutter pub get` passed, `flutter analyze` passed, and the full Flutter suite passed with 524 tests.
- `git diff --check origin/ai/integration...HEAD`: passed with no output after mobile validation.
- `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD`: passed after mobile validation with changed files limited to `.ai/qa-report.md`, `.ai/state.json`, `.ai/task-queue.json`, `apps/mobile/lib/bills/bill_list_screen.dart`, and `apps/mobile/test/group_bill_list_screen_test.dart`.
- `npm run validate:docs`: passed; documentation validation passed.
- M1-003 state repair: `M1-003` is marked completed, validation blockers are cleared, `lastCompletedTaskId` is `M1-003`, and the next controller task is `M1-004`.
- M1-002 state repair: previous validation-blocked queue metadata is cleared because M1-002 has already merged into `ai/integration`.
- Explicit Flutter/Dart paths used for validation: `/opt/flutter/bin/flutter` and `/opt/flutter/bin/dart`.
- PR #79 merge gate may proceed only if the PR is marked ready, GitHub checks pass, Codex review/comment gate remains clear, scope remains allowed, and the final head SHA is unchanged at merge time.
- `git diff --check`: passed with no output before commit.
- `git status --short`: showed only `.ai/qa-report.md`, `.ai/state.json`, `.ai/task-queue.json`, `apps/mobile/lib/bills/bill_list_screen.dart`, and `apps/mobile/test/group_bill_list_screen_test.dart` modified before commit.
- `git diff --check origin/ai/integration...HEAD`: passed with no output before commit, but `HEAD` had no task commit yet and scope guard reported zero committed changed files; will be rerun after commit.
- `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD`: passed before commit with zero committed changed files; will be rerun after commit.
- M1-002 implementation: added `docs/qa/M1_GROUP_BILL_CREATE_QA_MAP.md` and one group bill create happy-path smoke widget test under `apps/mobile/test/group_bill_list_screen_test.dart`.
- M1-002 local focused Flutter test attempt: `flutter test test/group_bill_list_screen_test.dart` from `apps/mobile` failed before running tests because `/bin/bash: line 1: flutter: command not found`.
- `npm run doctor:mobile`: failed in mobile preflight. Node `v22.22.2`, npm `10.9.7`, dotnet `9.0.117`, npm cache/logs writable, Docker skipped; warning `dart: unable to start (spawnSync dart ENOENT)`; failure `flutter: unable to start (spawnSync flutter ENOENT)`.
- `npm run validate:mobile`: failed in the same mobile preflight before `flutter pub get`, `flutter analyze`, or `flutter test`; warning `dart: unable to start (spawnSync dart ENOENT)`; failure `flutter: unable to start (spawnSync flutter ENOENT)`.
- `npm run validate:docs`: passed; documentation validation passed.
- `git status --short`: passed with no output after commit.
- `git diff --check origin/ai/integration...HEAD`: passed with no output after commit.
- `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD`: passed after commit with changed files limited to `.ai/qa-report.md`, `.ai/state.json`, `.ai/task-queue.json`, `apps/mobile/test/group_bill_list_screen_test.dart`, and `docs/qa/M1_GROUP_BILL_CREATE_QA_MAP.md`.
- M1-001 pre-validation reconciliation: active controller state now points at `M1-001`, the bootstrap task is marked completed, and the M1 queue remains ordered for safe mobile group-bill UI-test readiness work.
- M1-001 state closure: `M1-001` is marked completed, `lastCompletedTaskId` is `M1-001`, and the next controller task is `M1-002`.
- PR #77 scope guard/check status before merge gate: GitHub `Scope guard` passed, changed files are limited to `.ai/qa-report.md`, `.ai/state.json`, and `.ai/task-queue.json`, and the PR merge state is `CLEAN`.
- `git status --short`: showed only `.ai/qa-report.md`, `.ai/state.json`, and `.ai/task-queue.json` modified.
- `git diff --check`: passed with no output.
- `git diff --check origin/ai/integration...HEAD`: passed with no output before commit; will be rerun after commit.
- `npm run validate:docs`: passed; documentation validation passed.
- `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD`: passed before commit with zero committed changed files; will be rerun after commit.

## Findings

- No open QA blockers for M1-009 after focused validation with the explicit Flutter SDK path.
