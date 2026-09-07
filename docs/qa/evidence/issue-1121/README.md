# Issue #1121 implementation evidence

This durable record supports [Issue #1121](https://github.com/tommytang213/Settleora/issues/1121) and the [progress ledger](../../../planning/ISSUE_PROGRESS_LEDGER.md). It records scoped field adoption, not whole-screen or native platform acceptance.

- Implementation [PR #1123](https://github.com/tommytang213/Settleora/pull/1123); source `41f94f95b99f872b61e0dea074b39d46c8bf2393`; tree `f4ccb7f26c0f3d2a021a59ef2c30b216cd2f8ff0`.
- Starting main `2ad834e974cf54a2d56be77ab1449e4cba7b59fd`; normal merge `23257211b2bd151d618c7244ff515fc6c1426271`. Source branch retained.
- Production harness: [bill_list_shared_search_test.dart](../../../../apps/mobile/test/ui/bill_list_shared_search_test.dart).
- Both personal/group list fields adopt existing `AppTextField`; no raw field retained and no shared API extension. Original 320px/2× captures showed truncated group label and clipped personal/group floating labels at the scroll viewport; existing `labelAbove` makes full labels readable above the input.

## Behavior and equivalence

- Personal state owns/disposes its controller; group state owns/disposes its separate controller. Both retain raw `controller.text`, exact `onSearchChanged` setState callback and helper-only trim/lowercase normalization. Personal label/key: `Search bills` / `bill-list-search`. Group: `Search group bills` / `group-bill-list-search`. Search input action and prefix icon remain native.
- Suffix `bill-list-clear-search` / `group-bill-list-clear-search`, tooltip `Clear search`, appears only for nonempty trimmed query. It clears controller and calls existing callback with empty string; selected filter is preserved. Overall `bill-list-clear-filters` / `group-bill-list-clear-filters` uses existing hasFilters/onClear and clears query plus resets All. Whitespace-only query hides suffix; a selected filter still enables overall Clear.
- Personal filter keys retain `bill-list-filter-` prefix and all/active/needsReview/archived. Group retains `group-bill-filter-` and all/needsYourResponse/youAccepted/youRejected/hasRejections. Counts derive from loaded rows independently of query; exact visible-count/scope copy and empty states stay host-owned.
- Personal USD/EUR fixture selects Train Tickets, then suffix clear preserves Archived. Group six-row fixture maps visible Morgan: three rows match; You accepted intersection has one row; suffix clear retains two accepted rows; overall reset restores six. Existing refresh/create/open/lifecycle suites remain green. Search/filter/clear leave fake repository counters unchanged.
- `_billMatchesQuery`, filter predicates, member maps/groupName context, loading/empty/readout logic and repository actions remain byte-identical. Existing searchable fields include merchant/display name, date, money/currency, status/archive/reconciliation labels and codes, count phrases, participant share/status/rejection values, mapped names and group context. Pre-existing hidden `participant.userProfileId` matching is separately owned by manually gated [#1122](https://github.com/tommytang213/Settleora/issues/1122); this presentation task neither fixes nor expands it. Bill/route identifiers are not newly added by the refactor.
- Tests prove stable controller/raw value/selection, exact field contract, both clear paths/counts/intersection, single useful clear tooltip/tap semantics, 48dp+ clear and label/input geometry, real focus and simulated inset. One existing group-state test now scrolls to its lazily built rejected row while preserving all status assertions.

## Exact validation

All commands ran on clean reviewed source from `/workspace/repos/Settleora`. No native/store build was routed.

| Command | Result |
|---|---|
| `cd /workspace/repos/Settleora; git status --short` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; python3 /workspace/logs/issue1121-20260907-2301/scope.py` | PASS, exit 0; exact three-file scope; production outside field byte-identical |
| `cd /workspace/repos/Settleora; git diff --check origin/main...HEAD` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter pub get` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter analyze` | PASS, exit 0; no issues |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart test/ui/settleora_component_guardrail_test.dart test/ui/bill_list_shared_search_test.dart test/ui/mobile_bills_list_detail_create_parity_visual_capture_test.dart` | PASS, exit 0; 284 tests |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run validate:mobile` | PASS, exit 0; 939 tests |
| `cd /workspace/repos/Settleora; npm run validate:scaffold` | PASS, exit 0 |

## Reviews and merge proof

Fresh Gemini `strong_independent` and independent local Codex passed the exact source and all36 actual images. Fresh GitHub Codex, required CI/scanners and final merge guards passed on the same head; no findings suppressed or waived. All review submissions, regular bot comments, inline threads and scanner alerts were inventoried: zero unresolved threads and zero open PR code-scanning alerts at merge. Existing unrelated dependency alert32 in web-user remains separate. Source/normal merge ancestry, merge parent pair and all three reviewed implementation/test blobs were verified on fetched main; branch retained.

No backend/API/OpenAPI/generated-client, auth/session/authz, storage/privacy policy, money/settlement/payment/bill calculation, schema, OCR/sync/lifecycle authority, deployment/CI/config or secret changes.

## Capture boundary and remaining work

All36 PNGs are exact byte copies of reviewed production-screen captures at390px/1× and320px/2×: normal, populated query, query-only suffix clear, filter-only, intersection, suffix preserving filter, no-match, overall Clear/reset and real field focus with simulated300px inset. SHA256 checks preserve exact reviewed pixels. Current Bills/OCR, Groups and shared input references/tokens were used; these are actual production controls, not mockups.

Labels and clear controls remain readable/separated. Existing horizontal filter scroll position persists after reset, so All can be selected offscreen. Narrow chips/cards truncate or wrap; verbose group readout and group FAB can obscure lower content. Narrow no-match captures show zero visible rows while longer empty text continues below the viewport. Those surrounding limits are not silently fixed or accepted here. #975 retains whole-screen/native IME/device/screen-reader acceptance; no native keyboard pixels are claimed.

#301 retains separate `bill-detail-search` equivalence, other raw forms/buttons/private dialog framing, token/summary styling and participant/assignment sharing. #372 remains open; #723 lifecycle, #299 dashboard, #295 navigation, #409 localization, #1096 setup, #975 platform and #959 parser retain independent ownership. Prior focused shared-component children are complete and must not be replayed.

## Image inventory

| Capture | SHA256 |
|---|---|
| [bill-list-320-2x-empty.png](41f94f95/bill-list-320-2x-empty.png) | `634049897a36e48547ec09a04a098101aca66fe4924671f7327bfcc2f64e9c28` |
| [bill-list-320-2x-filter-only.png](41f94f95/bill-list-320-2x-filter-only.png) | `b998b040682127d6bcbb1d12a31e109977f8167bd1ad1d8747722aeec8953473` |
| [bill-list-320-2x-focused-inset.png](41f94f95/bill-list-320-2x-focused-inset.png) | `f016031085ad72323ba96b5ca730c0f4cf29ce272802a587b537af69acc32fcd` |
| [bill-list-320-2x-intersection.png](41f94f95/bill-list-320-2x-intersection.png) | `7a8ef1cc77c32138f7b0e6a24f1fcf327e10221b5891984693e9c14e41bb9344` |
| [bill-list-320-2x-normal.png](41f94f95/bill-list-320-2x-normal.png) | `1b94ba7ce3305eccb2a61eeb74ac171847e7b78d0b4dc3967bb6da53e87fbad7` |
| [bill-list-320-2x-overall-clear.png](41f94f95/bill-list-320-2x-overall-clear.png) | `ff764b9d4fdeb5fb79af18f6400b3d072b7b9ccb6d676a879cf63faadccbb898` |
| [bill-list-320-2x-query-only-clear.png](41f94f95/bill-list-320-2x-query-only-clear.png) | `1fd6eac3609a68ecb5a10dbd0fd9342716aa3c66e02a7576f117849185f2f69f` |
| [bill-list-320-2x-query.png](41f94f95/bill-list-320-2x-query.png) | `4d83ffabd31d421c512ef635693271251070eb5d7c27554fdf61f0e27366c9ef` |
| [bill-list-320-2x-suffix-preserves-filter.png](41f94f95/bill-list-320-2x-suffix-preserves-filter.png) | `b998b040682127d6bcbb1d12a31e109977f8167bd1ad1d8747722aeec8953473` |
| [bill-list-390-1x-empty.png](41f94f95/bill-list-390-1x-empty.png) | `50eed4ccfa0957c2211782b2f25828b703adbd6db2482905f268fe52fbbb3769` |
| [bill-list-390-1x-filter-only.png](41f94f95/bill-list-390-1x-filter-only.png) | `e13a4bb7dab42b9a235f9cf885cc7d9f57824494f3509cf31259272729c032e6` |
| [bill-list-390-1x-focused-inset.png](41f94f95/bill-list-390-1x-focused-inset.png) | `beee17a1207cd8a21b3277dea8f9f5ad5349b269831041fc047b7d68e76cac95` |
| [bill-list-390-1x-intersection.png](41f94f95/bill-list-390-1x-intersection.png) | `1c3656be032de0f4f543e8620e523650894c14734c3d9659b0bca988afe95faa` |
| [bill-list-390-1x-normal.png](41f94f95/bill-list-390-1x-normal.png) | `e69819ee0813dbf651f4959abe55462fa0debcb87b4d1320302f4ea764559d30` |
| [bill-list-390-1x-overall-clear.png](41f94f95/bill-list-390-1x-overall-clear.png) | `1cfccf4332c62616e0e6714bd7f35e71a3ef86c651bedd5f439b9c97941b2588` |
| [bill-list-390-1x-query-only-clear.png](41f94f95/bill-list-390-1x-query-only-clear.png) | `6b139f3b7838daf859865e44012bb91736c7a0dde35477f61af5dea6a7c17eb9` |
| [bill-list-390-1x-query.png](41f94f95/bill-list-390-1x-query.png) | `7469b348dc1a29aff1e698480a0e1d25500c3a12c9186061acc2f6b3e4211abf` |
| [bill-list-390-1x-suffix-preserves-filter.png](41f94f95/bill-list-390-1x-suffix-preserves-filter.png) | `6dcb40e1f2ca051941cc84c24478190c768d0b028bcdc4b1446b248c49fd0e8a` |
| [group-bill-list-320-2x-empty.png](41f94f95/group-bill-list-320-2x-empty.png) | `9979efe88993b1b726f77b6684f2454562284cc3da3c1ece947e5d9998f90bf7` |
| [group-bill-list-320-2x-filter-only.png](41f94f95/group-bill-list-320-2x-filter-only.png) | `ce973beede66273bbc95f0359fc148b3cf651fb8fb30d86d7aaaa40636ee2f13` |
| [group-bill-list-320-2x-focused-inset.png](41f94f95/group-bill-list-320-2x-focused-inset.png) | `762943db74be31b4d2efa33379a3f448849000f1b83cefb8c46702e7c023d9f2` |
| [group-bill-list-320-2x-intersection.png](41f94f95/group-bill-list-320-2x-intersection.png) | `f867c053cae66d1ffaae6615e92aa6987dc086fb065bf7ea2bada838f8be318c` |
| [group-bill-list-320-2x-normal.png](41f94f95/group-bill-list-320-2x-normal.png) | `35d570822ff7417c7002070bd41ac7b1646923b4463bc091eec7492d151ca938` |
| [group-bill-list-320-2x-overall-clear.png](41f94f95/group-bill-list-320-2x-overall-clear.png) | `954f6b43fd51d0c87507a63271141d2ee184a9ad7f9595fb1bc19a87dcce1d53` |
| [group-bill-list-320-2x-query-only-clear.png](41f94f95/group-bill-list-320-2x-query-only-clear.png) | `401e82a9ffcca238993f74c80f24d98f8efe1340f4165e491aebe41c2dae2cae` |
| [group-bill-list-320-2x-query.png](41f94f95/group-bill-list-320-2x-query.png) | `260bb72c87d67e18919eb86667fd9ddbc27bc014ee28ae02816b4ad2876a951b` |
| [group-bill-list-320-2x-suffix-preserves-filter.png](41f94f95/group-bill-list-320-2x-suffix-preserves-filter.png) | `ce973beede66273bbc95f0359fc148b3cf651fb8fb30d86d7aaaa40636ee2f13` |
| [group-bill-list-390-1x-empty.png](41f94f95/group-bill-list-390-1x-empty.png) | `039429b2b977b7b09a0e501758800359a38ee51997d74f55c52a7912f20def6c` |
| [group-bill-list-390-1x-filter-only.png](41f94f95/group-bill-list-390-1x-filter-only.png) | `b5493b597e5ba0dde3a540f599cc3691b5092531f89d90aa2d8b5fd7ec819aff` |
| [group-bill-list-390-1x-focused-inset.png](41f94f95/group-bill-list-390-1x-focused-inset.png) | `d59a4542efe8932075a83e59dbf80401c05e464e593f319c975a13b280a3674e` |
| [group-bill-list-390-1x-intersection.png](41f94f95/group-bill-list-390-1x-intersection.png) | `d8a9c7cbf5f4afa792a1e47f82667710231e7768936b4445e646791f43b21606` |
| [group-bill-list-390-1x-normal.png](41f94f95/group-bill-list-390-1x-normal.png) | `a716101811ecd54028582070624e26be9f578368c2a2ce65ca3e55b7e7f89150` |
| [group-bill-list-390-1x-overall-clear.png](41f94f95/group-bill-list-390-1x-overall-clear.png) | `e71498ac3a2ee858a3101dfc5c74fa65a74a22102e3faeaa9c7132251b715cb3` |
| [group-bill-list-390-1x-query-only-clear.png](41f94f95/group-bill-list-390-1x-query-only-clear.png) | `27af52b76e01a48a7a2bc82497328e0869d358db6dc583e50fede7dc111ba60f` |
| [group-bill-list-390-1x-query.png](41f94f95/group-bill-list-390-1x-query.png) | `262f2e45dac8e5682014bb5e6e3c0d51217e4257bde6979042a605ac4e27aa68` |
| [group-bill-list-390-1x-suffix-preserves-filter.png](41f94f95/group-bill-list-390-1x-suffix-preserves-filter.png) | `b5493b597e5ba0dde3a540f599cc3691b5092531f89d90aa2d8b5fd7ec819aff` |
