# Issue #1143 Receipt OCR Edit Shared Save/Cancel Buttons

This directory preserves the exact branch-rendered evidence reviewed for Issue
[#1143](https://github.com/tommytang213/Settleora/issues/1143).

## Reviewed implementation

- Starting main: `4664d7769b18670a8551773e5404e7559eb8af13`
- Implementation branch: `feature/1143-receipt-ocr-edit-save-cancel-shared-buttons-20260908-1224`
- Reviewed source: `28e70639311f08a34f1f855f0bd096b995d41fec`
- Reviewed tree: `8d519f55e33998a7151c0a5414bc3d799265a9de`
- Implementation PR: [#1144](https://github.com/tommytang213/Settleora/pull/1144)
- Normal merge: `e81d0d2082e93bc4c233f2e86731c3cfcb47ee30`

Both receipt-review edit actions were equivalent to `AppButton` except for a
minimal generic semantic-label override. Cancel adopts the secondary variant;
Save adopts the primary variant and uses `isLoading` only while saving. No raw
Save/Cancel action was retained. The initial migration added optional
`semanticLabel`; a corrective focus-visibility review then added optional
`focusNode` forwarding. Every existing caller retains its prior visible-label
semantics and internally owned focus by default.

## Complete pre-edit equivalence inventory

| Contract | Cancel | Save | Shared-button result |
| --- | --- | --- | --- |
| Hierarchy/layout | `Row > Expanded > OutlinedButton.icon`; first child; 10px gap | `Row > Expanded > FilledButton.icon`; second child | `Row > Expanded > Tooltip > AppButton` for each action; order, equal width and 10px gap preserved |
| Key/visible label | `receipt-review-edit-cancel` / `Cancel` | `receipt-review-edit-save` / `Save` | Exact keys and visible labels preserved |
| Icon/loading | `Icons.close` | idle `Icons.save_outlined`; saving 18px, stroke-2 progress | Exact 18px shared icon/progress geometry; Save progress only for `widget.isSaving` |
| Enablement/callback | disabled for `isBusy`; `widget.onCancel` | disabled for `isBusy`; `_submit` | Nullable callbacks preserve disablement; one activation invokes the same callback once |
| Idle tooltip/semantics | `Cancel receipt review edit` | `Save receipt review` | Host Tooltip and shared semantic label remain exact |
| Saving tooltip/semantics | busy-label output | `Saving receipt review` | Exact labels; Save exposes disabled/in-progress shared semantics |
| Other busy tooltip/semantics | `Cancel receipt review edit. Disabled while receipt review action is in progress.` | `Save receipt review. Disabled while receipt review action is in progress.` | Exact existing helper output; neither action is actionable and Save does not falsely load |
| Focus/tap | first action before Save; themed 48dp minimum | second action; themed 48dp minimum | Same traversal/order and 48dp+ targets; supplied focus nodes only keep the row visible at narrow/2× |
| Tests/captures | existing accessibility/busy/cancel tests | existing validation/request/save/busy tests | Focused shared tests plus ten production captures cover both controls and all requested states |

The new host Tooltip wrappers replace the migrated controls' helper-owned
Tooltips while reusing the exact prior messages. They use
`excludeFromSemantics: true`; `AppButton` remains the single semantic button
node. Its semantic label defaults to the visible `label` for all callers and
can differ only when explicitly supplied. `_SemanticButtonLabel` was not
removed and still serves unchanged delete/apply/confirmation controls.

## Behavior and authority proof

- Cancel exits edit exactly once and causes zero repository mutation.
- `_submit`, Form validation and `_buildRequest` are unchanged. Merchant/date/
  currency, header amounts, source values and line text/quantity/unit/total
  normalization remain identical. Invalid input does not call save; a valid
  submission builds the same `ReceiptOcrReviewSaveRequest` and results in one
  existing repository save call.
- Save generation, route identity, success refresh/exit, bounded failure state,
  delete guards, preview/apply guards, pending return state and OCR provisional
  authority remain unchanged.
- Retry, queue Review receipt, line add/remove, delete/confirmation,
  preview/apply/confirmation and assignment/bill-revision behavior are untouched.
- No visible or semantic label exposes raw OCR text, file/storage data, IDs,
  tokens, credentials, secrets or repository/provider internals.
- #1140 is ancestral to the starting main and its state/loading work was not
  replayed. #1122 remains manual privacy-security gated; #959 parser work and
  #970 completeness-audit work remain independently owned and untouched.

## Validation and review

- `git diff --check origin/main...HEAD`: passed.
- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`: passed.
- `cd apps/mobile && /opt/flutter/bin/flutter pub get`: passed.
- `cd apps/mobile && /opt/flutter/bin/flutter analyze`: passed, no issues.
- Focused receipt/shared/capture command: passed, 102 tests.
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`: passed, 978 tests.
- `npm run validate:scaffold`: passed, 19 paths.
- Production capture harness: passed, two tests and ten PNGs.
- Fresh Gemini `strong_independent`: PASS, high confidence, no finding on exact
  source and all images.
- Fresh independent local Codex: PASS, zero actionable findings and no source
  change required on exact source and all images.
- GitHub Codex found no major issue on `28e7063931`; all 11 checks/scanners
  passed, with zero review threads and zero open branch-scoped scanning alerts.

The milestone scope script classified all six implementation files as `review`
because the stale active M15 queue only allows `.ai/**` and `docs/qa/**`.
Issue #1143 explicitly authorized these exact six files; the manual inventory
found no unrelated or forbidden path.

## Visual evidence

The production harness renders `ReceiptOcrReviewDetailScreen` and the actual
shared `AppButton` controls. Files under `28e70639/` cover idle, Cancel keyboard
focus, Save keyboard focus, active Save loading and unrelated delete-busy
disablement at 390px/1× and 320px/2×. The final narrow focus images show the
whole action row inside the viewport, both buttons remain 48dp+, geometry is
stable and no critical clipping/overflow is present. This is scoped Flutter
evidence, not native IME/device/platform screen-reader/whole-screen acceptance;
#975 retains that gate.

| SHA256 | File |
| --- | --- |
| `5ea74c2f6dcdb1ea492957eda397f1d249c5607d36185f388016880a0223c328` | `28e70639/320-2x-cancel-focus.png` |
| `633817e38beaafc3cb215fcb194090c7bacedd49b56bd8c94664a3b97c9b014f` | `28e70639/320-2x-delete-busy-disabled.png` |
| `6330271570c8bffe15da93d6200ec4c675e33d90686dc2cede3eb2f4c9644eb5` | `28e70639/320-2x-idle.png` |
| `5c32a7ea9e8d3114db71bfe0c64855979bf333cafbc2fd8c27290ede6c65af67` | `28e70639/320-2x-save-focus.png` |
| `595a6a2ffcfcba31ccceff864c47993974544915edbb51c0f91b002d615a8933` | `28e70639/320-2x-saving.png` |
| `4825e5388c06734f8d99fdc3933a02043791a4ddcb6ec7a367707ef554cfa702` | `28e70639/390-1x-cancel-focus.png` |
| `f61bcbb58339fb1fb3adf0d637c0eb6471ca15b2ffb23bff68b0d882121b2ca9` | `28e70639/390-1x-delete-busy-disabled.png` |
| `31c0082b73925c73a3496e609b3a2c600d4a96dbd6c2cb1efea432703ae6443a` | `28e70639/390-1x-idle.png` |
| `51fbdfe82e447ef59e327ad123103853fdc20c877ba68196489b6de4e3200568` | `28e70639/390-1x-save-focus.png` |
| `a1afe6daaad6fbaa20f9323375b4cb0a551912ca2a98d12484634fa9a49d56c1` | `28e70639/390-1x-saving.png` |
