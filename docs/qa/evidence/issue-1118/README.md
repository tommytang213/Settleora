# Issue #1118 implementation evidence

This durable evidence record supports the [issue progress ledger](../../../planning/ISSUE_PROGRESS_LEDGER.md) and [Issue #1118](https://github.com/tommytang213/Settleora/issues/1118). It records the reviewed implementation, not whole-screen or native platform acceptance.

- Implementation [PR #1119](https://github.com/tommytang213/Settleora/pull/1119).
- Reviewed source: `109a66b4f1eafaa74a5ec8e2b34b3a0eab0e6f73`.
- Source tree: `a13af9cbe9804740ac0d6824e1e5adb0dcd54329`.
- Starting main: `c8ef68289858833b5c593f1f396e6ead80888793`.
- Normal merge: `5e70c418b7f005a79cf7a4babf322763325cd01b`.
- Production harness: [bill_attachment_discovery_shared_search_test.dart](../../../../apps/mobile/test/ui/bill_attachment_discovery_shared_search_test.dart).
- Current production attachment discovery uses `AppTextField` with the existing opt-in `labelAbove`; no shared API extension. Initial 320px/2× standard labels truncated. The adopted label is readable above the native field.
- Historical [PR #57](https://github.com/tommytang213/Settleora/pull/57) owns the discovery behavior; this task preserves it.

## Exact implementation validation

All commands ran from `/workspace/repos/Settleora` on the clean reviewed source. Logs were captured during execution; this checked-in record preserves the commands and outcomes.

| Command | Result |
|---|---|
| `cd /workspace/repos/Settleora; git status --short` | PASS, exit 0 |
| `git diff --name-only origin/main...HEAD + byte comparison outside field presentation/import` | PASS, exit 0; exact four-file scope |
| `cd /workspace/repos/Settleora; git diff --check origin/main...HEAD` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter pub get` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter analyze` | PASS, exit 0; no issues |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter test test/bill_attachment_section_test.dart test/bill_attachment_generated_repository_test.dart test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart test/receipt_ocr_review_screen_test.dart test/ui/settleora_component_guardrail_test.dart test/ui/bill_attachment_discovery_shared_search_test.dart` | PASS, exit 0; 362 tests |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run validate:mobile` | PASS, exit 0; 935 tests |
| `cd /workspace/repos/Settleora; npm run validate:scaffold` | PASS, exit 0 |
| `cd apps/mobile && TZ=Asia/Hong_Kong /opt/flutter/bin/flutter test test/ui/bill_attachment_discovery_shared_search_test.dart --plain-name 'safe metadata searches exclude actual private IDs and sanitized metadata'` | PASS, 1 test, exit 0 |

The GitHub timezone finding was corrected by deriving both clock queries from fixture timestamps with `toLocal()`. All implementation gates repeated after the correction. Nine existing personal-bill attachment tests gained a layout-settling pump after scrolling, preserving every action assertion.

## Behavior and privacy

- Controller identity/raw value/selection and existing listener drive local normalized discovery. Exact search/clear keys, label/hint, input action and icons remain unchanged.
- All, Receipts, Supporting, Reviewable OCR and Other counts derive from the loaded list. Query/filter intersection, ordering, filtered-empty copy, route reset and busy hiding remain local.
- The suffix is absent when inactive and present for query or filter-only activation. Both suffix and overall Clear reset query and selected filter to All. Search/filter/clear leave repository call counters unchanged.
- Search uses only safe purpose, sanitized type, size and uploaded/updated date labels. Actual private file IDs, storage-looking identifiers and unsafe metadata are proven non-searchable/non-visible. User-entered text remains owned input until cleared; no private values are populated by the application.
- Upload/download/remove/refresh/OCR typed-route actions, receipt eligibility and busy guards are unchanged. Production outside the field presentation/import is byte-identical to the starting main.
- Native focus/search submission, single useful clear semantics, 48dp+ clear target and above-label/input separation are tested. No API/domain/storage/privacy/file-policy or business authority changed.

## Independent and GitHub review

- Fresh Gemini `strong_independent`: PASS on the reviewed source and all 26 actual images. Fresh independent local Codex: PASS after inspecting the same source and every image. Neither found a material scoped issue on the corrective candidate.
- [GitHub Codex corrective-head review](https://github.com/tommytang213/Settleora/pull/1119) passed `109a66b4f1`; the timezone thread is resolved with corrective-head evidence. No findings were suppressed or waived.
- Exact-head checks: Analyze (actions) — SUCCESS, Validate scaffold — SUCCESS, Semgrep CE scan — SUCCESS, Trivy repository scan — SUCCESS, Analyze (c-cpp) — SUCCESS, Analyze (csharp) — SUCCESS, Analyze (javascript-typescript) — SUCCESS, Analyze (python) — SUCCESS, CodeQL — SUCCESS, Semgrep OSS — SUCCESS, Trivy — SUCCESS.
- Zero unresolved review threads and zero open PR scanning alerts at merge. Existing unrelated dependency alert #32 was not changed.
- Normal merge parents, source/merge ancestry and all four reviewed implementation/test blobs were verified on fetched main. Source branch retained.

## Capture boundaries

These PNGs are byte-for-byte copies of the immutable exact-head capture set reviewed by both providers. They render actual production `BillAttachmentSection` and shared `AppTextField` controls with production theme tokens. They are not recreated mockups.

- 390px/1× and 320px/2×: normal; purpose/type/size/date queries; filtered-empty; suffix clear; filter-only Receipts/Supporting/Reviewable OCR; overall Clear; download busy; native focus with a simulated 300px keyboard inset.
- Full field label and clear remain readable and separated. Native one-line hint ellipsis, selected-chip trailing-count fading and metadata/date wrapping at narrow/2× remain separate inherited limits.
- An unchanged-main diagnostic reproduced a 0.0812px refresh-status row overflow at 320px/2×. Narrow busy captures use existing download state; existing tests cover discovery hiding across refresh/upload/download/remove/purpose-selection states. No exceptions were suppressed.
- Focused screenshots retain a bounded download snackbar from the preceding real fixture action. The inset is simulated; these images do not show a native keyboard.
- #975 retains whole-screen/native IME/device/screen-reader acceptance. #301 retains separately scoped row/chip/status refinements.

## Image inventory

Every file is linked below with its SHA256 checksum, preserving the exact reviewed pixels in repository history.

| Capture | SHA256 |
|---|---|
| [320-2x-busy](109a66b4/320-2x-busy.png) | `6a781ed20953558dfc469d3ba54f20c99acf0389513dfcb2d512ae466934e992` |
| [320-2x-field-clear](109a66b4/320-2x-field-clear.png) | `e1965d5c748df1467ac425536aafec89dda0bc098d997ac905d05ac789f0bae3` |
| [320-2x-filter-receipts](109a66b4/320-2x-filter-receipts.png) | `cfaa2ee9f9fbc2e002bc5deeb8f6792251b5e9c2ad9e4dfffe610f2c02eb8533` |
| [320-2x-filter-reviewableOcr](109a66b4/320-2x-filter-reviewableOcr.png) | `6791b5484fca428579d43b06ffb9824605b5b73950d65d9a359c0324c8cf2402` |
| [320-2x-filter-supporting](109a66b4/320-2x-filter-supporting.png) | `82eaa05bc806a29f5ba4623f781bfbd89d9ec570f4f16b3ce0dd85de664f356f` |
| [320-2x-focused-inset](109a66b4/320-2x-focused-inset.png) | `83ce157d73ed3971efcb20432982783f5e1d75e581e37cdc27b75deda6129a2c` |
| [320-2x-normal](109a66b4/320-2x-normal.png) | `a50346acc42ee62e9db1ed543e69ac6fa3d61387b4135df2a0377f73e73f83f7` |
| [320-2x-overall-clear](109a66b4/320-2x-overall-clear.png) | `0abfa5f40b46a1b188640c2b7693b27fcdbb7f60e7429baef107ba428200dbdf` |
| [320-2x-query-2026](109a66b4/320-2x-query-2026.png) | `370747c60c68a9e86e9e5d4f8a10773adf2ed63fbfe670f7d370255cae78397b` |
| [320-2x-query-512-bytes](109a66b4/320-2x-query-512-bytes.png) | `bc83ac89e1ba1572cdc00fbe5b66bef2fa71c18fff3b6c76a0d6ce7d5483629c` |
| [320-2x-query-Receipt](109a66b4/320-2x-query-Receipt.png) | `9d184c42bd30a39e5089c0498e464c0bad26942efd89165b3bf12da1fd9072ac` |
| [320-2x-query-application-pdf](109a66b4/320-2x-query-application-pdf.png) | `074f00d90f827f53abe40b73ed010beb963a230101a59414f8d78bb069d3b2db` |
| [320-2x-query-no-match](109a66b4/320-2x-query-no-match.png) | `fabac308f7abda7e1f4b7b37848c86848e3e8c6af05e3a0b8f98a9d6ee1aca84` |
| [390-1x-busy](109a66b4/390-1x-busy.png) | `4f5778913a5d16f624d3368d442cb1631f2845c8360fcd081eeab338299192c7` |
| [390-1x-field-clear](109a66b4/390-1x-field-clear.png) | `fdc1ba5a60b478c62f1fe5d85311d3a5ef0691628446e2907e62b1f744a5bef8` |
| [390-1x-filter-receipts](109a66b4/390-1x-filter-receipts.png) | `788b8580b5a8457aba62dc931786c762d5f5f8b462da2809e6191ad73d0fe601` |
| [390-1x-filter-reviewableOcr](109a66b4/390-1x-filter-reviewableOcr.png) | `ab05c24ab80b3dc758c615873f25ceb83be7e6e9afbe057193859262348346e0` |
| [390-1x-filter-supporting](109a66b4/390-1x-filter-supporting.png) | `140fe22c505d4adff41f62ab230a15846a24e8098ae97b93ec16ea4c6a69009a` |
| [390-1x-focused-inset](109a66b4/390-1x-focused-inset.png) | `61d755298580105eb5701cc777d23bcb3c12c3a683371f293ef1b4d240e4c8aa` |
| [390-1x-normal](109a66b4/390-1x-normal.png) | `6cefdecd05c50495e68a191d30241ba36292f561c9052be39e351a0c6889cb55` |
| [390-1x-overall-clear](109a66b4/390-1x-overall-clear.png) | `ddfdc76cae197f6fdfba0566f59f2144cf9c91764169ff77db3df14eb7bb1f96` |
| [390-1x-query-2026](109a66b4/390-1x-query-2026.png) | `f29f142fd28593cf25586dad5d09be2148b8f0248aeef47596d70d6c2cfabc9b` |
| [390-1x-query-512-bytes](109a66b4/390-1x-query-512-bytes.png) | `a8c84136945d7bafa4ea340ff38295f9bde8ffb7477b3b9e4a56919a39a302ba` |
| [390-1x-query-Receipt](109a66b4/390-1x-query-Receipt.png) | `0630928360887e6de8bd6fcdb24dca15c6048eb20e5dd69cfab6b8cba5dc6177` |
| [390-1x-query-application-pdf](109a66b4/390-1x-query-application-pdf.png) | `96c812fbcc1f9e6ac677cbc2182750f6a35d6270bce7a986ffa37274dcd9cf93` |
| [390-1x-query-no-match](109a66b4/390-1x-query-no-match.png) | `2915d8183e83ce26a348570d8f129364e7b7b01470a6eb07d827797ffff1d3d2` |
