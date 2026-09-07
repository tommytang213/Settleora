# Issue #1128 group-list shared-search evidence

Scoped adoption for [Issue #1128](https://github.com/tommytang213/Settleora/issues/1128), not whole-screen or native platform acceptance.

- Implementation [PR #1129](https://github.com/tommytang213/Settleora/pull/1129), reviewed source `bfad01cf7817207e51eabd0124bb3ebab7bebada`, normal merge `25d68f136104cf00623aabe52cfdd80d8f70dcba`; start main `7726bde47df5c43254c81afb98c95ff3b41c0409`. Source branch retained.
- Production [search/capture harness](../../../../apps/mobile/test/ui/group_list_shared_search_test.dart) mounts the actual group-list screen and shared field at 390px/1× and 320px/2×.
- `_GroupDiscoveryControls` adopts existing `AppTextField`; no raw list search remains and no shared API extension was needed. Existing `labelAbove` keeps the full label separate and readable at narrow/2×.
- Historical [PR #47](https://github.com/tommytang213/Settleora/pull/47) retains ownership of the group discovery/filter behavior. Completed #1097 separately owns `SettleoraMemberSearchField` for member search; that control is unchanged.

## Host and search equivalence

The host still owns and disposes `_searchController`, owns `_searchQuery`, `_selectedRole` and `_selectedStatus`, and uses the same `_updateSearchQuery`, toggle and `_clearFilters` paths. The shared field receives the same controller and preserves its raw `TextEditingValue`, selection and change callback. Refresh, create, open/navigation and repository behavior are unchanged.

The field retains key `group-list-search`, label `Search by group name`, `TextInputAction.search` and search prefix. Its suffix retains key `group-list-search-clear` and tooltip `Clear search`; it is absent for an empty or whitespace-only trimmed value and present for a nonempty trimmed value. The suffix clears the controller and invokes the existing `onSearchChanged('')`, affecting search only and preserving active role/status filters. The separate `group-list-clear-filters` remains rendered only while any query/role/status filter is active and invokes the existing host `_clearFilters`, which clears query/controller and resets both role and status.

Fixtures prove loaded-group counts remain Owner 2 / Member 1 and Active 2 / Removed 1 across the existing keys and labels. Role-only, status-only, query+role, query+status and query+role+status intersections preserve the same visible rows. `group-list-visible-count` retains `Groups you can access: <visible> of <loaded>`. Loaded-empty retains the true empty state; active-filter zero results retain `No matching groups` and the existing clear guidance.

`_groupMatchesQuery`, `_filteredGroups`, role/status ordering/count helpers and loaded-row source were not modified. Matching remains limited to product-facing group display name, role label and membership-status label. Tests prove raw group/member/profile IDs are neither searchable nor displayed. Search/filter/clear cause zero mutation calls and no additional repository reads. Separate `group-member-search`, `group-member-search-clear`, `SettleoraMemberSearchField`, member filters and callbacks remain unchanged.

## Exact validation and reviews

All commands below passed on clean `bfad01cf7817207e51eabd0124bb3ebab7bebada` from the repository root.

| Command | Result |
|---|---|
| `cd /workspace/repos/Settleora; git status --short` | PASS, exit 0 |
| exact four-file implementation scope guard | PASS, exit 0 |
| `cd /workspace/repos/Settleora; git diff --check origin/main...HEAD` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter pub get` | PASS, exit 0 |
| `cd /workspace/repos/Settleora; cd apps/mobile && /opt/flutter/bin/flutter analyze` | PASS, no issues |
| focused group-list/server-shell/shared-field/visual suite | PASS, 109 tests |
| additional group-form/group-list/shared-search suite | PASS, 42 tests |
| `cd /workspace/repos/Settleora; PATH=/opt/flutter/bin:$PATH npm run validate:mobile` | PASS, 946 tests |
| `cd /workspace/repos/Settleora; npm run validate:scaffold` | PASS, 19 paths |

No native build was routed. Focus and a simulated 300px keyboard inset are deterministic; the suffix clear target is at least 48dp. Fresh Gemini `strong_independent` and independent local Codex passed the exact source and individually inspected all 30 images with no actionable findings. Fresh GitHub Codex passed the same head; required checks/scanners succeeded with zero unresolved review threads and zero open PR code-scanning alerts at merge. No finding was suppressed or waived.

No backend/domain/API/OpenAPI/generated-client, auth/session/authz, storage/privacy, group-membership policy, money/split/settlement/payment/bill calculation, schema, OCR/sync/lifecycle authority, CI/deployment/config or secret changes were made. [#1122](https://github.com/tommytang213/Settleora/issues/1122) remains OPEN/manual privacy-gated and was not implemented or approved.

## Visual boundary and remaining scope

The 30 exact reviewed PNGs below cover normal, group-name/role-label/status-label query, query-only suffix clear, role/status filter-only, query intersections, filter-preserving suffix clear, filtered empty, overall reset and real focus with simulated inset at both widths/scales. They exercise actual production/shared controls. At 320px/2× the label is fully readable and the field/clear geometry is safe. Existing surrounding chip/card wrapping and scroll needs remain separate.

The blank inset is simulated, not native keyboard pixels. Native IME/device/screen-reader and whole-screen acceptance remain with #975. #301 retains other raw forms/buttons/private dialog framing, token/summary styling and participant/assignment sharing; this and prior focused shared-search children are complete. #301/#372 stay open. #723, #299, #295, #409, #1096, #975 and #959 retain independent ownership. No Day 1 scope or completeness count changes. #1128 has no linked Project item.

## Image inventory

| Capture | SHA256 |
|---|---|
| [group-list-320-2x-filtered-empty.png](bfad01cf/group-list-320-2x-filtered-empty.png) | `b36a2126d94182305456c261f45480c91ed8bead8f330fd68d185dd4c1763a6f` |
| [group-list-320-2x-focused-inset.png](bfad01cf/group-list-320-2x-focused-inset.png) | `e16a2861972c9ef920439e08d18309ceda351ca2f000b9cf8e297b95c2bfd808` |
| [group-list-320-2x-group-name-query.png](bfad01cf/group-list-320-2x-group-name-query.png) | `f098dbabdda65eb05cdb5aeaa7f8449cdec6b7148562c0a5e2631ddb3b4268cb` |
| [group-list-320-2x-normal.png](bfad01cf/group-list-320-2x-normal.png) | `52329d15d60afc2bff32f93d7bf51e0195cb2beef73f7a569f166c4d67538111` |
| [group-list-320-2x-overall-clear-reset.png](bfad01cf/group-list-320-2x-overall-clear-reset.png) | `f6be5064c3603c6e966eb88448ff5534cd8cc9d4a4e61ee1310d92f28d477f74` |
| [group-list-320-2x-query-only-suffix-clear.png](bfad01cf/group-list-320-2x-query-only-suffix-clear.png) | `24081f8e637df442e75b23bc1f7f69352fa5f02df70b00fcd7781fd8b4421364` |
| [group-list-320-2x-query-role-intersection.png](bfad01cf/group-list-320-2x-query-role-intersection.png) | `e000d2d40d434443316cc0fb57b3bba81425729c44fe93604945d77b7cad641c` |
| [group-list-320-2x-query-role-status-intersection.png](bfad01cf/group-list-320-2x-query-role-status-intersection.png) | `b3063ade7029239e5c8eb7ae219d29650f5dce850293480cc7734de53abbee82` |
| [group-list-320-2x-query-status-intersection.png](bfad01cf/group-list-320-2x-query-status-intersection.png) | `cefabe8f4f3a0e250178b51d320793d02a082284d2a84d91357db5eec5049a9e` |
| [group-list-320-2x-role-filter-only.png](bfad01cf/group-list-320-2x-role-filter-only.png) | `5650792304784cc41c1cd30875dba38014aae9f437039fccfb349356e6839123` |
| [group-list-320-2x-role-label-query.png](bfad01cf/group-list-320-2x-role-label-query.png) | `8948bc2ebb581330d3688d3fdc76e20778109b49a065ddef9b9634493e361336` |
| [group-list-320-2x-status-filter-only.png](bfad01cf/group-list-320-2x-status-filter-only.png) | `63323c9eca445929647c338e528a3b137c950f2271a83f7c4dc6a24e29a2bf5f` |
| [group-list-320-2x-status-label-query.png](bfad01cf/group-list-320-2x-status-label-query.png) | `d3c98f082e0a5df05f3e494d1b9bb20f903186f3f25c3a8b899664659828b17f` |
| [group-list-320-2x-suffix-preserves-role-status.png](bfad01cf/group-list-320-2x-suffix-preserves-role-status.png) | `151e98cc200a58a9ff890645ff71a99dd1a691d0b4b636c4494e1d51dd232868` |
| [group-list-320-2x-suffix-preserves-role.png](bfad01cf/group-list-320-2x-suffix-preserves-role.png) | `35d30f04484adc79ff0f6c1e1f7a67588f09aa03e6e06dd359d55b23479df178` |
| [group-list-390-1x-filtered-empty.png](bfad01cf/group-list-390-1x-filtered-empty.png) | `89a172c697ce47bcddac4f13da223e1219f9913a94e99dde638b7260ca6c8685` |
| [group-list-390-1x-focused-inset.png](bfad01cf/group-list-390-1x-focused-inset.png) | `9316f3971229d37d9211d2a564517c8d4745d3e7adc0b1b6719a97a664500813` |
| [group-list-390-1x-group-name-query.png](bfad01cf/group-list-390-1x-group-name-query.png) | `4d118e3df17b4f1b635feabed52e7c6c6b59500914a7ffa6621fe53d6ceff880` |
| [group-list-390-1x-normal.png](bfad01cf/group-list-390-1x-normal.png) | `e9c257052084be5cc9cfb282b9ea01a58ef546dcfc34b6d2a68b4a17125c8f0a` |
| [group-list-390-1x-overall-clear-reset.png](bfad01cf/group-list-390-1x-overall-clear-reset.png) | `559e661510945f572ae9a80573ee931e0df54ff08d9aea79d02732a418d6335a` |
| [group-list-390-1x-query-only-suffix-clear.png](bfad01cf/group-list-390-1x-query-only-suffix-clear.png) | `559e661510945f572ae9a80573ee931e0df54ff08d9aea79d02732a418d6335a` |
| [group-list-390-1x-query-role-intersection.png](bfad01cf/group-list-390-1x-query-role-intersection.png) | `82f9d98e8c64130a12f2174fe6d0ec9abf56000476aa202122eb6da60d092431` |
| [group-list-390-1x-query-role-status-intersection.png](bfad01cf/group-list-390-1x-query-role-status-intersection.png) | `ae868fdd5fbab3391ab5bed01d4a3a11a39a0d9675f72d6e2e357803f4ea3283` |
| [group-list-390-1x-query-status-intersection.png](bfad01cf/group-list-390-1x-query-status-intersection.png) | `fa2317a288d79562d848eb08595a391b54eba2bf5de20ba761cda7b57b8aec0c` |
| [group-list-390-1x-role-filter-only.png](bfad01cf/group-list-390-1x-role-filter-only.png) | `41d57811678a3f418d89afa770cf80eff879f935af8fc8f87390a71e26185363` |
| [group-list-390-1x-role-label-query.png](bfad01cf/group-list-390-1x-role-label-query.png) | `f410a111effb5e1991789499ee1e3082be4bc864956ecd985d841c8aa673114a` |
| [group-list-390-1x-status-filter-only.png](bfad01cf/group-list-390-1x-status-filter-only.png) | `5ff6d2e140699ef9883caa0a84eecfce5a54802dc2972cc1ae0527ec4fda5088` |
| [group-list-390-1x-status-label-query.png](bfad01cf/group-list-390-1x-status-label-query.png) | `3bbe385547f5fb46e5ca42643fee711b7b178b06a3eee6ae0be97585c03afe0b` |
| [group-list-390-1x-suffix-preserves-role-status.png](bfad01cf/group-list-390-1x-suffix-preserves-role-status.png) | `de8f1ed3a2f848a8541954d7191f9b808b9587e5a5447826fe860c9ae9628369` |
| [group-list-390-1x-suffix-preserves-role.png](bfad01cf/group-list-390-1x-suffix-preserves-role.png) | `b99e6f9fa0c8f524d932822192a0dba2cd6a64a6ca9582866ef9377b95245924` |
