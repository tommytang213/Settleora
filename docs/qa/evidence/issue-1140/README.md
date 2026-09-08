# Issue #1140 Receipt OCR Review Shared State/Loading Panels

This directory preserves the exact branch-rendered evidence reviewed for Issue
[#1140](https://github.com/tommytang213/Settleora/issues/1140).

## Reviewed implementation

- Starting main: `55315fba5c6f29d21cc3db999d68a1ff134a4616`
- Implementation branch: `feature/1140-receipt-ocr-review-shared-state-panels-20260908-1103`
- Reviewed source: `c64ecdeddf7ed387e18140b6c684f854380ab75e`
- Reviewed tree: `0424c526c768249d419def5e9fbc1d9f1f576123`
- Implementation PR: [#1141](https://github.com/tommytang213/Settleora/pull/1141)
- Normal merge: `a5d1a0c9a60d149661796f8fe311e7ba92580b86`

All nine local `_StatePanel` usages and both local `_LoadingPanel` usages were
directly equivalent to the existing shared components. They now use
`SettleoraStatePanel` and `SettleoraLoadingPanel`; the private definitions were
removed. No local shell was retained and no shared API changed. All five compact
usages explicitly pass `compactAlignment: Alignment.centerLeft`, preserving the
local shell's alignment.

## Complete pre-edit equivalence inventory

| Host / exact branch | Icon / label | Exact title and message | Action / compact | Presentation, semantics, tests, evidence |
| --- | --- | --- | --- | --- |
| Queue, repository disconnected | `Icons.lock_outline` | **Sign in required** — “Connect an account session before loading receipt reviews.” | None; normal | Centered 42px primary icon, centered `titleLarge`/copy, 24px padding. Screen semantics are unchanged. Focused disconnected test; both queue-disconnected captures. |
| Queue, connected + no rows + initial load | `Loading receipt reviews` | Exact label shown below progress | No action | Centered progress, 14px gap and label are equivalent; shared shell adds one useful, non-duplicative live-region semantic label. Focused loading/call-count and shared guardrail tests; both queue-loading captures. |
| Queue, connected + loaded true-empty | `Icons.receipt_long_outlined` | **No receipt reviews** — “Saved reviews that are visible to this account will appear here.” | None; normal | Same centered hierarchy/padding. Focused empty test; both queue-empty captures. |
| Queue, loaded rows + discovery yields zero | `Icons.search_off_outlined` | **No matching receipt reviews** — “Adjust the search or filters to show loaded receipt reviews.” | None; normal | Same centered hierarchy/padding. Existing search/filter/count/no-match tests plus focused shared assertion; both queue-no-match captures. |
| Queue/detail terminal failure through `_FailurePanel` | `_failureIcon(failure.kind)` | `failure.title` and `_safeReceiptOcrReviewFailureDisplayMessage(failure)` | Existing `_ReceiptOcrReviewRetryButton`; normal | Same centered hierarchy/action gap. Existing Tooltip/Semantics/OutlinedButton and callback are unchanged. Safe-copy, semantics, one-tap/one-reload and call-order tests; queue/detail failure captures at both sizes. |
| Detail, active first review load | `Loading receipt review` | Exact label shown below progress | No action | Same loading composition plus one live-region label. Focused detail load/call-count test; both detail-loading captures. |
| Detail read-only, `_hasAnyReviewCandidate(review)` false | `Icons.receipt_long_outlined` | **No OCR result** — “No reviewed OCR suggestions are saved for this receipt yet.” | None; compact | 28px icon, 8/6px gaps, `titleMedium`, centered copy inside left-aligned vertical-12px shell. Existing no-result behavior plus both no-OCR captures. |
| Editor, `_lineEditors.isEmpty` | `Icons.format_list_bulleted` | **No receipt lines** — “Save can proceed, but apply may be blocked by the server.” | None; compact | Exact compact alignment/padding retained. Existing edit/save/delete guard tests plus both editor-no-lines captures. |
| Read-only totals, nonempty candidate but no header-total rows | `Icons.payments_outlined` | **No header totals** — “Review the receipt lines or use manual entry.” | None; compact | Exact compact presentation retained. Existing detail candidate tests; current Bills/OCR references. |
| Read-only lines, `lines.isEmpty` | `Icons.format_list_bulleted` | **No receipt lines** — “Apply is blocked until this receipt has reviewed lines.” | None; compact | Exact compact presentation retained. Focused true-empty lines test; both detail-no-lines captures. |
| Read-only lines, multiple loaded lines + discovery yields zero | `Icons.search_off_outlined` | **No matching receipt lines** — “Adjust the search or filters to show loaded OCR receipt lines.” | None; compact | Exact compact presentation retained. Existing line search/filter/count/no-match tests; current Bills/OCR references. |

The local and shared state shells have the same icon sizes and primary color,
title styles, centered title/message/action column, 14px action gap, normal 24px
padding and compact vertical 12px padding. The shared component's existing
`compactAlignment` option reproduces the prior left-aligned compact shell. The
local and shared loading shells have the same progress indicator, 14px gap,
label and centering; shared loading semantics announce one live-region label.

## Behavior and authority proof

- `_FailurePanel` changed only its presentation shell. Failure classification,
  icon mapping, title, safe-display mapping, Retry widget and callback are
  unchanged. One semantic Retry activation moves queue `listCalls` from 1 to 2.
- Loaded-row refresh failures still retain last-known rows. Search/filter/count/
  no-match logic, deleted-route suppression, follow-up refresh scheduling,
  detail route opening and mutation-result return handling are unchanged.
- Detail route identity and load/edit/save/delete/preview/apply generation and
  duplicate-action guards are unchanged. No OCR/domain authority moved into UI.
- Tests and captures do not expose fixture route IDs. Unsafe Bearer/path input
  remains suppressed. No raw OCR payload, storage key/path, provider internal,
  token, credential, secret or hidden object identifier was newly exposed.
- No API/OpenAPI/generated client, schema/migration, auth/session/authz,
  storage/file privacy, OCR parser/provider/extraction, review apply authority,
  money/bill/settlement/payment calculation, deployment/CI/config or secret
  file changed. #1122, #959 and #970 remain independently owned and untouched.

## Validation and review

- `git diff --check origin/main...HEAD`: passed.
- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`: passed.
- `cd apps/mobile && /opt/flutter/bin/flutter pub get`: passed.
- `cd apps/mobile && /opt/flutter/bin/flutter analyze`: passed, no issues.
- Focused receipt/shared/Bills-OCR visual command: passed, 99 tests.
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`: passed, 974 tests.
- `npm run validate:scaffold`: passed, 19 paths.
- Production capture harness: passed, five tests and 20 PNGs.
- Fresh Gemini `strong_independent`: PASS, high confidence, no corrective
  finding on exact source and all images.
- Fresh independent local Codex: PASS, no source change required on exact
  source and all images.
- GitHub Codex: no major issues on `c64ecdeddf`; all 11 checks/scanners passed,
  with zero review threads and zero open PR-scoped code-scanning alerts.

The repository's milestone scope script classified all five implementation
files as `review` because the stale active M15 queue allows only `.ai/**` and
`docs/qa/**`. Issue #1140's explicit live task authority allowed exactly these
five paths; the manual file inventory matched that scope and no forbidden path
changed.

## Visual evidence

The production capture harness renders `ReceiptOcrReviewQueueScreen` and
`ReceiptOcrReviewDetailScreen` with the actual shared controls. Files under
`c64ecded/` cover 390px/1× and 320px/2× text scaling. The migrated panels are
readable without critical clipping or overflow, and failure Retry stays visible.
Dense wrapping/truncation in unchanged surrounding narrow detail chrome remains
outside this adoption. This is scoped Flutter evidence, not native IME/device/
screen-reader/whole-screen acceptance; #975 retains that gate.

| SHA256 | File |
| --- | --- |
| `948a0182acfac9b2e04bbac865a431b9beff12d34cb52bd4fa8c069fca281340` | `c64ecded/320-2x-detail-failure.png` |
| `f8e725a2351fb52d77b25aa07c79c46debb66de596a6c9981986b4766eef1d04` | `c64ecded/320-2x-detail-loading.png` |
| `f3b0928bd9358c6803a3e009f5b0c41dbe975f56ef65a4d4d280442ceb7fbe4c` | `c64ecded/320-2x-detail-no-lines.png` |
| `8e2ec204eac80540a98df47bea93a2f1648528e747c11e586ae08f570b7f5059` | `c64ecded/320-2x-detail-no-ocr-result.png` |
| `3a1ca5837504a7bf9e69272fbfc03111765475c7afe7b48a646a9c72138db627` | `c64ecded/320-2x-editor-no-lines.png` |
| `6c3a1998f464e1ea1e8480537047cb5a7cc3ed615c2f4724ddd9194763f7dd0d` | `c64ecded/320-2x-queue-disconnected.png` |
| `185b5b054abbfb4d73cde29a747bb8700d9bdd4be047dde899e16bc174880c7a` | `c64ecded/320-2x-queue-empty.png` |
| `a15e0831fdc11134767e30c19821bd356aaae66ed39ccae04b2d6189bfe57c08` | `c64ecded/320-2x-queue-failure.png` |
| `11d5d9ed3624ef2924e45c7822f7c0815fc56f61ba31af599d15a7db5b3972eb` | `c64ecded/320-2x-queue-loading.png` |
| `790cea94c56146dab1e9fdc95af6717f2855962cad40f0a8b660cedda267a55b` | `c64ecded/320-2x-queue-no-match.png` |
| `426acacff64db31a0677313c296b23d0b793b955c2781c05f5a04c2ffc1e0b4c` | `c64ecded/390-1x-detail-failure.png` |
| `dedca2be74a5dffba8b97d3265b88f06ee24f3832df3a61f8e57d0d054996093` | `c64ecded/390-1x-detail-loading.png` |
| `7df788bd171183ac752f272d0e63e92f08931f61cc2efd6e77b5559e27fd805f` | `c64ecded/390-1x-detail-no-lines.png` |
| `cb7a4453374ee03466dab6f147f8e8c42221fddd035d8c5968d33e0b52ba4abc` | `c64ecded/390-1x-detail-no-ocr-result.png` |
| `5833b63d0fbb787be5dbe08c5cbee8491a9e278201cb81972f249b06b330d439` | `c64ecded/390-1x-editor-no-lines.png` |
| `9b1add4aad689cebee85d39404360ffabc25211b0edac4d02572e66735b4d3ff` | `c64ecded/390-1x-queue-disconnected.png` |
| `14b5f00c1ddc77e5fadecc1996c85cebfbc67bbc5b0564fa754341ce3ada998f` | `c64ecded/390-1x-queue-empty.png` |
| `f8f5cb5ee2b12cb9209afa940982ff9bd0e3923b37467d3dfd142b359e01850a` | `c64ecded/390-1x-queue-failure.png` |
| `611b08b1ab0283fc275b42e976c72a843421bc91a4bf6ba6ea12fa3faf46582e` | `c64ecded/390-1x-queue-loading.png` |
| `05c6a26f27d21465ffac9f556d58c727c765fc3e4b1c08be46c51c667bf6f3cd` | `c64ecded/390-1x-queue-no-match.png` |
