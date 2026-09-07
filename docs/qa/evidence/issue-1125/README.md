# Issue #1125 bill-detail shared-search evidence

Scoped adoption for [Issue #1125](https://github.com/tommytang213/Settleora/issues/1125), not whole-screen or native platform acceptance.

- Implementation [PR #1126](https://github.com/tommytang213/Settleora/pull/1126), source `72f9141cf0aa39860f3d824015eac6ea1df58226`, normal merge `1caeca517cb1967c462733adfac30e1969fd2227`; start main `533d5cfd35c8f75f8fea70138ecf0aa7e878fe12`. Source branch retained.
- Production [search/capture harness](../../../../apps/mobile/test/ui/bill_detail_shared_search_test.dart); existing money capture now scrolls to its asserted row instead of a fixed distance, preserving the assertion.
- Personal/group detail both adopt existing `AppTextField`. No raw detail-search retained and no shared API extension. Initial actual320px/2× normal label truncated to “Search det…” and floating label clipped at the viewport edge; existing `labelAbove` preserves readable label/input separation.
- Historical [PR #56](https://github.com/tommytang213/Settleora/pull/56) owns discovery behavior. The task checkpoint listed five filters, but live source and M13 expose seven: All, Items, Participants, Payers, Adjustments, Needs response, Rejected. All seven are preserved; source outranks stale prose.

## Host and search equivalence

Personal and group state independently own/dispose their controllers, initially empty; raw `controller.text` and native value/selection remain unchanged. Both `onSearchChanged` callbacks only rebuild. Both overall Clear callbacks use one setState to clear query and restore All. Group adds normalized participant display-name mapping and current-user context to the unchanged snapshot. Known name or original-index Participant N, `(you)`, friendly status/rejection labels remain unchanged. Membership/response eligibility and acknowledgement actions are separate unchanged host logic.

Shared field retains exact `bill-detail-search`, `Search detail rows`, search input action and search prefix icon. No suffix query-clear is added. Overall `bill-detail-clear-filters` / Clear is enabled iff trimmed query is nonempty or filter is not All. Tests assert one controller notification for reset, empty raw value, All selected and disabled Clear. All seven `bill-detail-filter-<name>` keys/labels/selection and `bill-detail-visible-count` / `$visibleCount of $loadedCount bill details visible.` stay unchanged; section is Find bill details.

Snapshot alone trims/lowercases query and filters loaded rows. Items match name/note/amount/currency/formatted money; participants match rendered label/share amount/currency/formatted money/friendly status/friendly rejection reason; payers match Payer N/amount/currency/formatted money; adjustments match title-cased type/direction/amount/currency/formatted money/reason note. Detail matcher does not directly add raw profile ID. Raw IDs only map identity/display context. Needs response selects pending acceptance; Rejected selects rejected. Category flags/counts/empty logic remain unchanged: filtered empty only when loaded rows exist, filter/query active and visible count zero; otherwise category empty panels remain.

Production outside the field block is byte-identical to starting main, including list-level `_billMatchesQuery`. [#1122](https://github.com/tommytang213/Settleora/issues/1122) stays OPEN/manual privacy-gated and is not executed or approved. No searchable values are added/removed. Safe Morgan/current-user and Participant2 fallback/rejection fixtures retain query intersections. Search/filter/clear leave repository counters unchanged. Existing personal/group lifecycle, attachment, revision and list suites pass.

## Exact validation and reviews

All commands below passed on clean `72f9141cf0aa39860f3d824015eac6ea1df58226` from the repo root.

| Command | Result |
|---|---|
| `cd /workspace/repos/Settleora; git status --short` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; python3 /workspace/logs/issue1125-20260907-2358/scope.py` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; git diff --check origin/main...HEAD` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter pub get` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter analyze` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart test/ui/settleora_component_guardrail_test.dart test/ui/bill_detail_shared_search_test.dart test/ui/bill_list_shared_search_test.dart test/ui/bill_detail_readonly_money_readouts_visual_capture_test.dart test/bill_attachment_section_test.dart test/bill_revision_review_screen_test.dart test/ui/mobile_bills_list_detail_create_parity_visual_capture_test.dart` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run validate:mobile` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; npm run validate:scaffold` | PASS, exit 0 |

Analyzer: no issues. Focused333 tests and full mobile943 tests passed. No native build routed. Scope guard proves exact three-file implementation scope and byte-identical production outside the field.

Fresh Gemini strong_independent and independent local Codex reviewed exact source and all32 actual images with no actionable findings. Fresh GitHub Codex passed the same head; required checks/scanners succeeded, zero unresolved threads and zero open PR code-scanning alerts at merge. No findings suppressed or waived. Source/merge ancestry, normal merge parent pair, retained branch and all reviewed implementation/test blobs were proven on fetched main.

No backend/API/OpenAPI/generated-client, auth/session/authz, storage/privacy policy, money/bill/settlement/payment calculation, schema, OCR/sync/lifecycle authority, CI/deployment/config or secret changes.

## Visual boundary and remaining scope

All32 exact reviewed PNGs below cover personal/group at390px/1× and320px/2×: normal All, populated search, filter-only, intersection, no-match, overall reset, restored rows and focused field with simulated300px inset. They exercise actual production/shared controls and current Bills/OCR, Groups and shared-theme references. SHA256 values bind reviewed pixels to durable copies.

Field label and input are separated; prefix/overall Clear are readable and no suffix exists. Narrow discovery controls fill most of the viewport; section title or lower rows may require scrolling. Narrow focused inset leaves Clear below the viewport, reachable by ordinary scrolling. Blank inset is simulated, not native keyboard pixels. Existing participant-row money ellipsis/wrapping and surrounding content limits remain separate. #975 retains native IME/device/screen-reader/whole-screen acceptance.

#301 retains separately verified `group-list-search` in `_GroupDiscoveryControls` (`apps/mobile/lib/groups/group_list_screen.dart`) for a future equivalence check, other raw forms/buttons/private dialog framing, token/summary styling and participant/assignment sharing; bill-detail and prior focused shared-search children are complete. #301/#372 stay open. #723 lifecycle, #299 dashboard, #295 navigation, #409 localization, #1096 setup, #975 platform and #959 parser retain independent ownership; no Day1 scope reduction or completeness-count changes. #1125 stays open at this pre-hygiene checkpoint and closes only after hygiene merge and final parent/main reconciliation. No linked Project item exists.

## Image inventory

| Capture | SHA256 |
|---|---|
| [group-320-2x-empty.png](72f9141c/group-320-2x-empty.png) | `908959b39abf6b1f9aec3a9599fdd08602a4fe799d754b2ce9c632efae4b006f` |
| [group-320-2x-filter-only.png](72f9141c/group-320-2x-filter-only.png) | `87085e5f5bca6bc2a49c43eb389e4fe9d85d46a768fc77ba15a88aa29192cc10` |
| [group-320-2x-focused-inset.png](72f9141c/group-320-2x-focused-inset.png) | `b9ea1bbdb78fb60e22d9eaba49770e68567b1263ce1be28cb11e61b06cef40f8` |
| [group-320-2x-intersection.png](72f9141c/group-320-2x-intersection.png) | `6bd2b1458f377590c9c69fc4933cac22c564e022d79a7f5e4676eab1ee5789ee` |
| [group-320-2x-normal.png](72f9141c/group-320-2x-normal.png) | `14d53bedeee48c5d5faf237c53b387dd079f26e610ae213a7b596a22e55b7898` |
| [group-320-2x-overall-clear.png](72f9141c/group-320-2x-overall-clear.png) | `404aab1ab4c76e4cee47d916779bd191d0f6d62bfe89df839cf17e45b51fbc93` |
| [group-320-2x-query.png](72f9141c/group-320-2x-query.png) | `e697c0aab4a9edc28442a67bc83e6081d550d0d59b7324bd4a75d45b66d28f60` |
| [group-320-2x-restored-rows.png](72f9141c/group-320-2x-restored-rows.png) | `48d3b2d543e10850277eac746ec7923d566514e17b6a2b219edaa365fafab8dc` |
| [group-390-1x-empty.png](72f9141c/group-390-1x-empty.png) | `33c9cd59f21345754cceb2c55382d989eb420e8d9c53584df081a2141c525439` |
| [group-390-1x-filter-only.png](72f9141c/group-390-1x-filter-only.png) | `56ef586d437c0ce5443bd3a7da2d6d41aabd19b7d6a8b88386d1a2eb3fa488f2` |
| [group-390-1x-focused-inset.png](72f9141c/group-390-1x-focused-inset.png) | `85ad36443e949a8ac4d72c3bff9a384ed41f95f636fbcb30c2fa90e7c1282ee2` |
| [group-390-1x-intersection.png](72f9141c/group-390-1x-intersection.png) | `6a1e7b06aa9c1916d58a05b0ff959f37c533ca180043c0ac5960cc068c03f449` |
| [group-390-1x-normal.png](72f9141c/group-390-1x-normal.png) | `9121ed6bb8439715f9559b7eb85300e37f90b21c35cbda1f8693d17b2ae03298` |
| [group-390-1x-overall-clear.png](72f9141c/group-390-1x-overall-clear.png) | `4129caca3e7edc35abc8f83b8f65da73222192506bfbc0759668a1e52664c22f` |
| [group-390-1x-query.png](72f9141c/group-390-1x-query.png) | `309712d54e45950afad36434668f06f386329875059431bb5b7749ea96ff7bc2` |
| [group-390-1x-restored-rows.png](72f9141c/group-390-1x-restored-rows.png) | `12345f766c69873b2c377a7b11b6a298707f190666fd3673e7522af3101fa7e0` |
| [personal-320-2x-empty.png](72f9141c/personal-320-2x-empty.png) | `73265d19a619607617dbfff5fae09ef219e25e11f57e383bd56f2b26c844db49` |
| [personal-320-2x-filter-only.png](72f9141c/personal-320-2x-filter-only.png) | `ac8e4d22600bdf3aa1a7f59cbd6f02b64f62af048cea53e13d452bdc0fc17c3c` |
| [personal-320-2x-focused-inset.png](72f9141c/personal-320-2x-focused-inset.png) | `57b36f4b9e628c3416b68eb137ed698839989fdb1aaf4cd33874153031da7564` |
| [personal-320-2x-intersection.png](72f9141c/personal-320-2x-intersection.png) | `38617e41cfaf29a8ab2c1693b19c116c7db7f30e9fbc0f63b00756bd0d99e7af` |
| [personal-320-2x-normal.png](72f9141c/personal-320-2x-normal.png) | `dfa90058fd627b8acd335bddb27353834f3e10571193fd0b1bf00126708da8c7` |
| [personal-320-2x-overall-clear.png](72f9141c/personal-320-2x-overall-clear.png) | `21c822adf94898e97f36363c66fca85f4ab019b9e2937987ba31aaa54aef8ffa` |
| [personal-320-2x-query.png](72f9141c/personal-320-2x-query.png) | `015b4ced7f7e7fc9afc1c75bc85efc854f0632f430aed6d15c4c6ecb9fdbec69` |
| [personal-320-2x-restored-rows.png](72f9141c/personal-320-2x-restored-rows.png) | `2bba0533d9cfa90053499e024765cd01b0427ef0ecc254b5599c8e79bd204526` |
| [personal-390-1x-empty.png](72f9141c/personal-390-1x-empty.png) | `c536655b8a9715b3606385b9375eb60f991d614862455f10a18dacd98cba6bb5` |
| [personal-390-1x-filter-only.png](72f9141c/personal-390-1x-filter-only.png) | `33a0a89e1e8506b115cc116852a77559b5ae8ccad5954d8378ba48a315c2812f` |
| [personal-390-1x-focused-inset.png](72f9141c/personal-390-1x-focused-inset.png) | `63cdabcff041f6c8d96f22e210e926f572535a1d3f7f74d3f1a9243191d3219b` |
| [personal-390-1x-intersection.png](72f9141c/personal-390-1x-intersection.png) | `9207cd84e0ed7eb837c31d8c7db17aa92074adeb9e02071b88d4c89fc5ad4bfc` |
| [personal-390-1x-normal.png](72f9141c/personal-390-1x-normal.png) | `c27c13e0dff0296d1f41510990217c4910b64f812dc4ce9c5308bd4e467b14f9` |
| [personal-390-1x-overall-clear.png](72f9141c/personal-390-1x-overall-clear.png) | `26a1a014d4246536eedb2706bf203ab8e9f07019627bb8f7ac39914ae66e82be` |
| [personal-390-1x-query.png](72f9141c/personal-390-1x-query.png) | `d5a228f67372db03581c2087328d50a6ba3b9fe6b12377644e37b6d128fe9346` |
| [personal-390-1x-restored-rows.png](72f9141c/personal-390-1x-restored-rows.png) | `a85c068bdbfb6243dcc85127278e4321630dd6e762eba8418cd345ee9030cf33` |
