# Issue Progress Ledger

## Purpose

This ledger prevents stale GitHub issue or Project state from causing duplicated
work. Current repo state, merged PRs, issue comments, and latest Codex reports
remain the source of truth.

## Rules

- An open issue is not proof of unfinished scope, and a closed issue is not
  proof that every adjacent Day 1 runtime slice is complete.
- Before planning issue-based work, check merged PRs, issue comments, recent
  `.codex/reports/` files, relevant planning docs, and this ledger.
- Do not close ambiguous umbrella issues automatically.
- Record completed slices, remaining Day 1 work, future gates, blockers,
  manual decisions, and close/keep-open recommendations.
- If a PR, merge SHA, report, or project field cannot be verified, write
  `unverified` and leave the issue or project row unchanged.

## Current Checkpoints

### Issue #672 - Mobile Flutter V1 visual parity implementation slices

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted by this implementation task.
- Last verified at main SHA:
  `914d1fe0a7ed42f4ce1f193db518b7ddc047d2c8` after PR #678 and before the
  `docs/mobile-672-followup-split-close-20260703` docs/control close handoff.
- Last child-slice checkpoint at base main SHA:
  `154ed6787e1cb1b7f06fd1310ddeff724bd7b886` for branch
  `feature/mobile-shell-home-more-profile-parity-672-20260702`.
- Created by branch:
  `feature/mobile-shared-visual-foundation-20260702`.
- Scope:
  - Tracks shared component foundation plus shell/Home/More,
    bills/OCR/revision, and groups/settle/notifications visual parity work
    against merged mobile references.
  - #371 remains closed and must not be redone without a concrete regression.
  - Mobile visual parity only; no backend/API/OpenAPI/generated-client/schema,
    money, storage, auth runtime, notification-open, TestFlight/App Store, or
    deployment changes are authorized by this issue.
- Current slice:
  - First shared Flutter visual foundation implementation slice adds shared
    visual primitives and migrates low-risk profile/settings-adjacent private
    visual shells without changing repository calls, navigation, actions,
    state handling, auth/session behavior, payment-detail authority, money,
    storage, OpenAPI, generated clients, schema, or backend behavior.
  - Tommy manually rejected the first profile/shared-foundation visual evidence
    from `20260702-2204-mobile-shared-visual-foundation` as
    `VISUAL_REJECTED_THEME_MISMATCH` because the capture still looked like a
    generic warm/light Material screen with beige canvas, white cards, a blue
    info panel, and orange/blue icons.
  - The `20260702-2224` follow-up adds an explicit `Settleora Midnight` shared
    token preset and regenerates the profile/shared-foundation proof against
    the approved dark More/Profile reference language. It does not switch the
    global app default theme, add runtime theme selection, or change profile
    repository/action behavior.
  - Tommy manually reviewed the corrected `20260702-2224` visual evidence at
    `/workspace/logs/settleora-visual-qa/20260702-2224-mobile-shared-visual-foundation-theme-correction/profile-shared-visual-foundation-390x844.png`
    and approved this shared visual foundation slice as
    `VISUAL_APPROVED_WITH_FOLLOWUPS`. This approval keeps the first warm/beige
    visual evidence rejected, does not approve full app visual parity, and does
    not authorize silently switching the entire runtime app default theme.
  - The Shell/Home/More/Profile child slice on branch
    `feature/mobile-shell-home-more-profile-parity-672-20260702` migrates the
    live authenticated shell first-impression surfaces toward the approved
    Settleora Midnight references by using shared bottom-sheet/dialog frames,
    shared list rows, inline panels, money chips, status chips, and tokenized
    shell card styling for Home, attention/readout cards, More/settings rows,
    data-safety preview shells, and profile/payment evidence. It preserves the
    current global app default theme because a true selectable preset/runtime
    theme system remains future work, and switching the full app default would
    affect unrelated Bills, Groups, Settle, Notifications, OCR, recurring, and
    report routes outside this child slice.
  - Fresh visual evidence for the Shell/Home/More/Profile slice was generated
    under
    `/workspace/logs/settleora-visual-qa/20260702-2258-mobile-shell-home-more-profile-parity/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, and `profile-payment-390x844.png`. This evidence
    was manually reviewed as
    `VISUAL_REVIEW_NEEDS_FOLLOWUP_BOTTOM_NAV_OVERLAP` because the Home
    attention and More hub captures showed content clipped at the persistent
    bottom nav boundary.
  - The `20260702-2323` visual follow-up on the same branch increases shell
    scroll bottom padding and updates the focused visual evidence harness to
    capture Home attention, More lower sections, and Profile/payment content
    only when the target content clears the bottom nav or viewport boundary.
    Fresh follow-up evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260702-2323-mobile-shell-home-more-profile-visual-followup/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, and `profile-payment-390x844.png`. This evidence
    is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR should be opened before explicit
    visual approval.
  - Tommy reviewed the `20260702-2323` refreshed Home/More/Profile evidence and
    requested that the settings/config-like content not live directly under the
    More root. The `20260702-2336` development follow-up on the same branch
    keeps More as a concise hub by moving notification preference controls,
    delivery timing readouts, local/server mode authority readouts, sync/security
    required readouts, unsupported appearance/theme readouts, and local
    backup/import-preview controls behind an App settings detail route/surface.
    Root More now keeps only grouped navigation/readout rows for Account,
    Security and privacy, App, Activity and records, and Data and sync. Fresh
    development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260702-2336-mobile-shell-more-settings-hub-followup/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`, and
    `profile-payment-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval is deferred.
  - The `20260703-0012` development polish pass on the same branch rechecked
    that the root More tab remains a concise grouped hub with navigation/readout
    rows only, then tightened the App settings data-safety section by composing
    the local backup and generated-backup preview readouts with shared
    `SettleoraSection`, `SettleoraInlinePanel`, and
    `SettleoraKeyValueText` primitives. It preserved notification preference
    behavior, local backup/import-preview behavior, unsupported appearance
    readouts, product copy, profile/payment repository calls, QR metadata
    behavior, and the global runtime app default theme. Fresh development
    evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-0012-mobile-shell-settings-profile-polish-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`, and
    `profile-payment-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval is deferred.
  - The `20260703-0018` development-only setup/sign-in/settings polish pass on
    the same branch started from remote head
    `f572cf9b591c33b9ba8df0fc14799e151797b788` and keeps the exact pushed
    branch head in the matching Codex report and #672 issue comment because the
    no-amend rule prevents recording a commit's own SHA inside the same commit.
    This pass composes setup and sign-in with shared Settleora cards, compact
    headers, inline/readout panels, and the existing Midnight visual evidence
    theme while preserving setup choices, server URL validation, sign-in
    validation, loading/error states, auth/session repository calls, change
    server behavior, and server/local authority copy. It also regenerates the
    existing shell/settings/profile evidence and adds setup/sign-in captures
    under
    `/workspace/logs/settleora-visual-qa/20260703-0018-mobile-setup-signin-settings-polish-dev-only/`
    with `setup-mode-390x844.png`, `sign-in-390x844.png`,
    `home-shell-390x844.png`, `more-hub-390x844.png`,
    `more-settings-390x844.png`, and `profile-payment-390x844.png` plus the
    existing `home-attention-390x844.png` capture. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval remains deferred.
  - The `20260703-1046` development-only follow-up on the same branch started
    from remote head `ef062fe2a5bbfb03d7b8edd66df636a357e1a099` and addresses
    Tommy's payment-profile copy, local-backup copy, and authenticated-shell
    top-right action feedback. It keeps the existing profile/payment detail
    model, QR metadata behavior, payment-detail visibility posture,
    notification center routing/readout behavior, local backup/import-preview
    authority boundaries, sign-out/session-management behavior, global runtime
    app default theme, and all API/OpenAPI/generated-client/schema/backend
    boundaries unchanged. Fresh development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1046-mobile-shell-profile-copy-nav-followup-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`,
    `profile-payment-390x844.png`, `setup-mode-390x844.png`, and
    `sign-in-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval remains deferred.
  - The `20260703-1110` development-only follow-up on the same branch started
    from remote head `b6088e707b4a75359fc8d780f8862eac5c3d1358` and addresses
    Tommy's Home duplicate bell cleanup plus setup/sign-in copy simplification.
    It keeps notification center routing/readout behavior, setup choices,
    server URL validation, local/server mode behavior, sign-in validation,
    auth/session repository calls, More/App settings/Profile payment accepted
    areas, the global runtime app default theme, and all
    API/OpenAPI/generated-client/schema/backend boundaries unchanged. Fresh
    development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1110-mobile-shell-home-setup-signin-copy-followup-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`,
    `profile-payment-390x844.png`, `setup-mode-390x844.png`, and
    `sign-in-390x844.png`.
  - Tommy manually reviewed the `20260703-1110` Shell/Home/More/App
    settings/Profile/Setup/Sign-in evidence and approved this bounded child
    slice as `VISUAL_APPROVED_WITH_FOLLOWUPS`. This approval is only for the
    bounded Shell/Home/More/App settings/Profile/Setup/Sign-in visual parity
    child slice under #672. It does not approve full mobile visual parity, does
    not close #672, does not approve Bills/OCR/revision visual parity, does not
    approve Groups/Settle/Notifications visual parity, and does not authorize
    runtime theme switching or a theme picker.
  - PR/merge gate started from reviewed source head
    `d45c7fdd2f752f696a791fc653fa237324763737` on branch
    `feature/mobile-shell-home-more-profile-parity-672-20260702`, with starting
    `origin/main` expected at
    `154ed6787e1cb1b7f06fd1310ddeff724bd7b886`. #672 remains open during and
    after this gate.
  - PR #674 merged the bounded Shell/Home/More/App settings/Profile/Setup/
    Sign-in visual parity child slice to `main` at
    `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`. This approval remains limited
    to that child slice and does not approve full mobile visual parity,
    Bills/OCR/revision visual parity, Groups/Settle/Notifications visual
    parity, runtime theme switching, or theme picker/persistence.
  - The `20260703-1208` development-only Bills/OCR/revision visual parity
    child slice on branch
    `feature/mobile-bills-ocr-revision-visual-parity-672-20260703` started
    from `origin/main` at `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`.
    Completed scope is presentation-only migration of selected high-visibility
    existing Bills/OCR/revision surfaces toward the approved Settleora Midnight
    direction: shared state/loading/sync panels in bills, shared card/header/
    key-value/inline panels for bill revision review and proposal editor
    shells, and shared OCR review queue card/error treatment. It also adds
    focused visual evidence capture for reachable OCR queue/detail and bill
    revision review/proposal surfaces. It preserves bill repositories,
    attachment/OCR review request construction, OCR apply/preview behavior,
    bill revision lifecycle behavior, settlement/payment/money authority,
    storage/file-byte behavior, API/OpenAPI/generated-client/schema/backend
    boundaries, #371 notification-open behavior, and the global runtime app
    default theme.
  - Fresh development evidence for the Bills/OCR/revision slice was generated
    under
    `/workspace/logs/settleora-visual-qa/20260703-1208-mobile-bills-ocr-revision-visual-parity-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
    Validation passed: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/bill_revision_review_screen_test.dart
    test/bill_revision_proposal_editor_screen_test.dart
    test/receipt_ocr_review_screen_test.dart`,
    `flutter test test/ui/bills_ocr_revision_parity_visual_capture_test.dart`,
    and full `flutter test` with 810 passing tests.
  - Tommy reviewed the `20260703-1208` Bills/OCR/revision visual evidence and
    blocked it for follow-up because the OCR review queue/listing looked too
    plain, listing cards did not expose enough important amount/date/status/
    source/line-count style context where available, and the pages still felt
    too far from the approved Bills/OCR/revision references. The
    `20260703-1248` dirty recovery on the same branch inspected and salvaged
    the failed `20260703-1238` development-only follow-up. It keeps the
    scope presentation-only and increases product readout density in the
    existing OCR queue/detail and bill revision review/proposal screens. OCR
    queue cards now show merchant, status, personal/group scope, source,
    line count, currency when exposed by the queue summary, updated date, and
    a `Review receipt` action. OCR detail now promotes merchant, grand total
    plus currency, receipt date, source, status, readiness, totals, and line
    quantity/unit/line-total readiness into stronger cards. Bill revision
    review/proposal now promote total/currency/status, viewer and payer deltas,
    participant/payer counts, and server-validation posture. The queue summary
    model still does not expose receipt date or total amount, so those values
    are only shown on the detail surface where available. Fresh follow-up
    recovery evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1248-mobile-bills-ocr-revision-info-density-followup-recovery/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; the previous failure was report/export
    compaction after validation, not a validation failure. No PR or merge has
    been performed.
  - Tommy reviewed the latest Bills/OCR/revision evidence and rejected it as
    `VISUAL_REJECTED_UX_FLOW_AND_INFORMATION_HIERARCHY` because the OCR queue
    still read like metadata-chip collections, the detail/review/proposal
    surfaces exposed technical facts without enough user journey, and the first
    viewport did not make attention, amount/change, next action, or blocked
    state obvious enough. The `20260703-1320` development-only follow-up on
    branch `feature/mobile-bills-ocr-revision-visual-parity-672-20260703`
    started from head `b158c4641556bfcc3c56d90abd847a0bd3e3a15a` and keeps the
    scope presentation-only. OCR queue cards now lead with merchant/scope,
    review reason, checkpoint count, receipt source/line/currency metadata,
    updated date, and one primary `Review receipt` action. OCR detail now leads
    with receipt total/context and a preview/apply attention panel before the
    lower structured totals and line review. Bill revision review now leads
    with a decision panel for what changed, viewer share delta, payer impact,
    and available/blocked next action. The proposal editor now starts with a
    guided proposal overview, participant/payer summary, and short save
    consequence copy. No OCR extraction/runtime, apply behavior, money/split/
    settlement logic, API/OpenAPI/generated-client/schema, auth/session/
    security, storage/file-byte, notification-open, deployment, or runtime theme
    behavior changed. Fresh evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1320-mobile-bills-ocr-revision-ux-density-followup-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. The captures are nonblank and do not
    show content hidden under bottom navigation. Validation passed after a
    focused OCR detail copy fix: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/bill_revision_review_screen_test.dart
    test/bill_revision_proposal_editor_screen_test.dart
    test/receipt_ocr_review_screen_test.dart`,
    `flutter test test/ui/bills_ocr_revision_parity_visual_capture_test.dart`,
    and full `flutter test` with 810 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
  - Tommy reviewed the `20260703-1320` Bills/OCR/revision evidence and found
    the direction improved but not PR-ready because OCR queue/review still felt
    too system-like, queue cards needed clearer receipt/action/value hierarchy,
    and revision/proposal copy still had backend/server wording. The
    `20260703-1348` development-only follow-up on the same branch keeps the
    scope presentation-only and makes the first viewport friendlier: OCR queue
    cards now use product-facing receipt source, detected currency or total-not-
    confirmed, line count, last-updated, action-needed, and `Review receipt`
    labels; OCR detail uses `Preview changes`, `Draft update`, and
    apply-to-draft copy without server-preview wording; revision review avoids
    raw revision IDs in the first header and emphasizes `Your share changes by`
    plus `Payer needs confirmation`; proposal save copy says saving sends the
    proposal for review and does not change the bill yet. No OCR extraction/
    runtime, apply behavior, money/split/settlement logic, API/OpenAPI/
    generated-client/schema, auth/session/security, storage/file-byte,
    notification-open, deployment, or runtime theme behavior changed. Fresh
    evidence is expected under
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`
    with the same four OCR/revision PNG artifacts. This checkpoint is
    `READY_FOR_TOMMY_VISUAL_REVIEW` after validation and push; no PR or merge
    is part of this dev-only task.
  - Tommy/Assistant manually approved the `20260703-1348` Bills/OCR/revision
    evidence for this bounded child slice as `VISUAL_APPROVED_WITH_FOLLOWUPS`.
    The reviewed source head before approval checkpoint is
    `a9dfa1a5d1b4901976a962bbfc1c4dfbefa73930` on branch
    `feature/mobile-bills-ocr-revision-visual-parity-672-20260703`. Approved
    evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This approval is limited to the
    bounded Bills/OCR/revision visual parity child slice under #672. It does
    not close #672 and does not approve full mobile Flutter visual parity,
    broader bills list/detail/create parity, saved OCR in-bill detail beyond
    current touched surfaces, OCR capture/processing states, advanced
    tax/discount/fee/refund review runtime, groups/settle/notifications
    parity, runtime theme selection/persistence, backend/API/OpenAPI/
    generated-client/schema/money/storage/security/OCR runtime changes, or
    #371 notification-open/deep-link redo. Known non-blocking follow-ups:
    `Action needed: needs review.` can become friendlier copy later, proposal
    total-lower helper copy can avoid backend-ish validation wording in a
    future copy pass, and full bills list/detail/create parity remains a later
    child slice.
  - The `20260703-1422` development-only Groups/Settle/Notifications visual
    parity child slice on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27` after PR #675. Completed scope
    is presentation-only migration of existing Groups, Settle, and
    Notifications runtime surfaces toward the approved Settleora Midnight
    direction: shared list rows and cards for group/member readouts, clearer
    settlement balance/request/payment/detail hierarchy using existing loaded
    values only, and shared card/bottom-sheet treatment for notification list
    and detail readouts. It preserves group repositories/actions, settlement
    payment/proof/status authority and money calculations, notification open/
    deep-link behavior from #371, push/provider/admin/global policy states,
    API/OpenAPI/generated-client/schema/backend boundaries, auth/session/
    security behavior, storage/file-byte behavior, deployment, and the global
    runtime app default theme.
  - Fresh development evidence for the Groups/Settle/Notifications slice was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1422-mobile-groups-settle-notifications-visual-parity-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. All captures are 390x844 PNGs,
    nonblank, and generated with `SettleoraTheme.midnight()`. Validation
    passed: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/group_list_screen_test.dart
    test/settlement_list_screen_test.dart test/notification_screen_test.dart`,
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`,
    and full `flutter test` with 811 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
    Project fields were not mutated.
  - Tommy manually reviewed the `20260703-1422` Groups/Settle/Notifications
    evidence and rejected it as not PR-ready because Notifications felt too
    wordy/debug-like, several screens still felt difficult for normal public use,
    and visible backend/API/architecture-style explanations remained in normal
    UI. The `20260703-1550` development-only UX simplification follow-up on
    branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from previous branch head
    `9a7755d6d035fd3c88b19ff847b8939df5e2ea48` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps the scope presentation-only and simplifies public-facing copy and
    hierarchy: notification center/detail now use concise product sections such
    as Inbox, Unread, Needs attention, Review, What happened, What you can do,
    Status, Linked item, and Safety note; Groups now emphasizes accessible
    groups, search, role, status, and membership status without route/dashboard
    authorization explanations; Settlements now emphasizes You owe/You're owed,
    remaining amount, pending payments, and plain next actions. It preserves
    notification list/filter/read/archive/restore/mark-read behavior and #371
    open/deep-link behavior, group list/detail/create/member actions and
    repository behavior, settlement state authority, payment/proof workflows,
    repository calls, money calculations, API/OpenAPI/generated-client/schema,
    auth/session/security runtime, storage/file-byte behavior, deployment, and
    the global runtime app default theme.
  - Fresh UX simplification evidence for the Groups/Settle/Notifications slice
    was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1550-mobile-groups-settle-notifications-ux-simplification-dev-only/`
    with `groups-list-or-dashboard-390x844.png` (61037 bytes),
    `settle-dashboard-or-list-390x844.png` (73589 bytes),
    `settlement-detail-or-payment-390x844.png` (75112 bytes),
    `notifications-center-390x844.png` (66624 bytes), and
    `notification-detail-or-review-390x844.png` (76436 bytes). All captures are
    390x844 PNGs and generated with `SettleoraTheme.midnight()`. Validation
    passed: `npm ci`, `npm run validate:docs`, `npm run validate:scaffold`,
    `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/group_list_screen_test.dart
    test/settlement_list_screen_test.dart test/notification_screen_test.dart`,
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`,
    and full `flutter test` with 811 passing tests. The existing test harness
    warning about unspecified tag `visual` on the guardrail helper test remains
    non-fatal. This evidence is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge
    has been performed. Project fields were not mutated.
  - Tommy reviewed the `20260703-1550` evidence and said the Notifications
    Center/detail still felt compressed and not convenient enough for normal
    public users, while Groups and Settlements were acceptable enough for now.
    The `20260703-1714` development-only density follow-up on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from previous branch head
    `7fe79a3f3a79eb9a0670adbc6bd80af5f9dfb803` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps scope to Notifications UI/test evidence and the ledger: Notification
    Center cards now use a roomier vertical layout with full-width title/message
    treatment, one clear primary action where a typed target can open, and
    quieter top-right secondary inbox actions; the visible bulk-read control is
    a compact inline row instead of a large boxed panel. The notification
    detail sheet now prioritizes `What happened`, `What you can do`,
    `Linked item`, and `Safety note` instead of dense key-value/debug-style
    status rows, and uses concise safety copy: `We recheck access before
    opening details.` It preserves notification list/filter/read/archive/
    restore/mark-read behavior, #371 notification-open/deep-link behavior,
    notification runtime/provider/push/email/admin/global policy semantics,
    API/OpenAPI/generated-client/schema, auth/session/security runtime,
    settlement/payment/money authority, storage/file-byte behavior,
    deployment, and the global runtime app default theme.
  - Fresh density follow-up evidence for the notification-focused pass was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1714-mobile-notifications-center-density-followup-dev-only/`
    with the grouped visual-capture harness artifacts
    `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. The follow-up scope was
    Notifications Center/detail only; Groups/Settlements were regenerated for
    visual continuity and were not intentionally redesigned. All captures are
    390x844 PNGs and generated with `SettleoraTheme.midnight()`. Focused
    validation during implementation passed:
    `flutter test test/notification_screen_test.dart` with 64 passing tests and
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`
    with 1 passing test. Full required validation is recorded in the matching
    Codex report. This evidence is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or
    merge has been performed. Project fields were not mutated.
  - Tommy reviewed the `20260703-1714` continuity evidence and requested a
    public-user UX polish pass focused on Groups and Settlements while leaving
    the improved Notifications Center alone unless required for continuity.
    The `20260703-1745` development-only polish pass on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from expected branch head
    `96caaf1b455983c611775a1d6af3128ebbbd7b99` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. It keeps scope to Groups,
    Settlements, visual-capture continuity, focused tests, and this ledger:
    group cards now use product-facing phrases such as `You are the owner`,
    `You are a member`, `Active group`, and `Removed from new activity` while
    preserving role/status chips and existing search/filter behavior. The
    settlement dashboard keeps server-provided balance fields but prioritizes
    `Remaining`, `Pending payments`, and `Paid`, moving low-frequency residual
    readouts into calmer chips and replacing stale/technical refresh copy with
    `Refresh if anything looks out of date.` Settlement detail sections now
    emphasize `Next step`, `What this includes`, `Included bills`, and
    `Payment details`, fix the singular grammar to `1 needs confirmation`, and
    use friendlier safety copy before settlement actions. This pass does not
    change settlement calculations, payment workflow, proof authorization,
    group membership/runtime permissions, repository calls, API/OpenAPI/
    generated-client/schema, notification-open/deep-link #371 behavior,
    notification runtime/provider/push/email/admin/global policy semantics,
    auth/session/security runtime, storage/file-byte behavior, deployment,
    or the global runtime app default theme.
  - Fresh UX polish evidence for the Groups/Settle pass is generated by the
    grouped visual-capture harness under
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. The notification artifacts are
    continuity-only unless the final report states otherwise. All captures use
    `SettleoraTheme.midnight()`. Final validation and the final commit SHA are
    recorded in the matching Codex report. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed. Project
    fields were not mutated.
  - Tommy manually reviewed the `20260703-1745` Groups/Settle/Notifications
    evidence and approved this bounded child slice as
    `VISUAL_APPROVED_WITH_SMALL_FOLLOWUPS`. The approved source head before the
    PR/merge approval checkpoint is
    `2b842fe868ba9d40c98f775c9d9ffa3436a85ae4` on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`.
    Approved evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. Known non-blocking visual
    follow-ups are notification detail safety note / received timestamp spacing
    polish and hiding zero-value settlement chips when they are not useful.
    This approval is limited to the bounded Groups/Settle/Notifications visual
    parity child slice under #672. It does not close #672, does not approve
    full mobile Flutter visual parity, and does not authorize backend/API/
    OpenAPI/generated-client/schema, auth/session/security runtime, storage/
    file-byte, settlement money/state authority, payment workflow, proof
    authorization, group membership/runtime permissions, notification runtime/
    provider/push/email/admin/global policy semantics, #371 notification-open/
    deep-link redo, deployment, runtime theme default switching, theme picker,
    theme persistence, or Figma API changes.
  - The `20260703-1830` development-only Bills list/detail/create visual parity
    child slice on branch
    `feature/mobile-bills-list-detail-create-visual-parity-672-20260703`
    started from `origin/main` at
    `6cd629dd8265b8f5dadce636beed51729126e13b`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps scope presentation-only and improves the current Flutter Bills
    first-viewport hierarchy: the personal Bills list now opens with a
    `Bills dashboard` card, bill counts, review/archive state, clearer primary
    create/scan actions, and bill summary rows that emphasize amount, status,
    next step, and honest loaded metadata. Bill detail now leads with a
    next-step panel for items, people, and payers before the existing loaded
    bill details, and create-bill/saved-receipt OCR copy now uses product-facing
    review language without changing receipt apply behavior. This pass also
    updates reachable saved OCR-in-bill readouts and focused tests for the
    affected list/detail/create surfaces. It preserves bill repositories,
    routing, archive/restore behavior, saved OCR review/open/apply behavior,
    OCR extraction/runtime, receipt storage/file-byte behavior, money/split/
    settlement/payment authority, bill status transitions, API/OpenAPI/
    generated-client/schema/backend boundaries, auth/session/security runtime,
    deployment, and the global runtime app default theme.
  - Fresh Bills list/detail/create evidence for the `20260703-1830` slice was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1830-mobile-bills-list-detail-create-visual-parity-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. All captures are nonblank 390x844
    PNGs generated with `SettleoraTheme.midnight()`. Validation passed:
    `npm ci`, `npm run validate:docs`, `npm run validate:scaffold`,
    `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/group_bill_list_screen_test.dart`,
    `flutter test test/server_mode_shell_dashboard_test.dart --name "bottom nav switches from bill detail to Groups"`,
    `flutter test test/ui/mobile_bills_list_detail_create_parity_visual_capture_test.dart`,
    and full `flutter test` with 812 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR, merge, or push has been performed.
    Project fields were not mutated. #672 should remain open for review,
    explicit PR/merge gates for approved child slices, remaining OCR capture/
    processing and advanced receipt review polish, future spacing/rhythm
    follow-ups, and any runtime/payment/storage/money/OCR/theme gates. #371
    remains closed and was not touched or reopened.
  - Tommy reviewed the `20260703-1830` Bills list/detail/create evidence and
    rejected it as not PR-ready because the create-bill sticky `Save bill`
    footer sat too close to the item form area, the Bills dashboard filter copy
    still sounded implementation-facing, and the Bills app bar showed
    duplicate-looking sync/refresh affordances. The `20260703-1840`
    development-only follow-up continues the same local task branch from
    `54777034412d40b6eac9d845a7bf806333661dbd`, keeps the existing bill detail
    and saved OCR review surfaces stable, increases create-bill scroll bottom
    padding with focused visual/test coverage for sticky-footer clearance,
    shortens the Bills dashboard filter copy to product-facing language, and
    keeps one app-bar refresh action while preserving the existing Sync queue
    panel `Sync` action. Fresh follow-up evidence is generated under
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`,
    `bill-create-items-safe-footer-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. Final validation, final branch head,
    and push status are recorded in the matching Codex report. #672 should
    remain open for Tommy visual review and any explicit PR/merge gate. #371
    remains closed and was not touched or reopened.
  - Tommy/Assistant manually approved the `20260703-1840` Bills
    list/detail/create follow-up evidence for this bounded child slice as
    `VISUAL_APPROVED_WITH_FOLLOWUPS`. The reviewed source head before this
    approval checkpoint is `a4a6489db934d5a0c23a5073292e33ec78a21e6e` on
    branch `feature/mobile-bills-list-detail-create-visual-parity-672-20260703`.
    Approved evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`,
    `bill-create-items-safe-footer-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. This approval is limited to the
    bounded Bills list/detail/create visual parity child slice under #672. It
    does not close #672, does not approve full mobile Flutter visual parity,
    OCR capture/processing states, advanced tax/discount/fee/refund review
    runtime, future spacing/rhythm follow-ups, runtime theme switching, theme
    picker/persistence, backend/API/OpenAPI/generated-client/schema/money/
    storage/security/OCR runtime changes, or #371 notification-open/deep-link
    redo.
- Post-PR #677 audit checkpoint:
  - GitHub readback on 2026-07-03 HKT verified #672 remains `OPEN`, #371
    remains `CLOSED`, and PRs #673, #674, #675, #676, and #677 are merged.
  - PR #673, merge SHA `154ed6787e1cb1b7f06fd1310ddeff724bd7b886`,
    completed the shared mobile visual foundation slice with approved evidence
    at
    `/workspace/logs/settleora-visual-qa/20260702-2224-mobile-shared-visual-foundation-theme-correction/`.
  - PR #674, merge SHA `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`,
    completed the Shell/Home/More/App settings/Profile/Setup/Sign-in visual
    parity slice with approved evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1110-mobile-shell-home-setup-signin-copy-followup-dev-only/`.
  - PR #675, merge SHA `51fb0baeed84586e5ef44e53c4a407966ac45f27`,
    completed the Bills/OCR/revision visual hierarchy slice with approved
    evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`.
  - PR #676, merge SHA `6cd629dd8265b8f5dadce636beed51729126e13b`,
    completed the Groups/Settle/Notifications visual hierarchy slice with
    approved evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`.
  - PR #677, merge SHA `0a29bba4d76446f641a40d916bae9242c6769996`,
    completed the Bills list/detail/create visual parity slice with approved
    evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`.
  - All verified #672 PRs were visual/presentation/test/ledger scoped only.
    They did not authorize backend/API/OpenAPI/generated-client/schema,
    auth/session/security runtime, storage/file-byte behavior, money/
    settlement/payment/bill calculation authority, OCR extraction/runtime/apply
    behavior, sync runtime behavior, notification runtime/provider/push/email/
    admin/global policy behavior, #371 notification-open/deep-link redo,
    Docker/deployment/env/CI/signing/TestFlight/App Store metadata, runtime
    theme default switching, theme picker/persistence, Figma API output, or
    binary design asset commits.
- Post-PR #678 close handoff:
  - PR #678, merge SHA `914d1fe0a7ed42f4ce1f193db518b7ddc047d2c8`,
    completed the #672 acceptance/readout ledger audit and confirmed PRs
    #673, #674, #675, #676, and #677 were merged.
  - Follow-up issue #679,
    <https://github.com/tommytang213/Settleora/issues/679>, tracks the
    remaining minor mobile copy/spacing/rhythm polish split out from #672.
  - Final #672 decision: the child visual parity implementation slices are
    complete through PRs #673-#677, the post-child audit was merged in PR #678,
    and minor visual polish is split to #679. #672 may be closed after the
    `docs/mobile-672-followup-split-close-20260703` docs/control PR merges.
  - #371 remains closed and untouched; do not reopen or redo notification-open/
    deep-link behavior under #672 or #679 without a separate concrete
    regression and approved gate.
  - Runtime/API/security/money/storage/OCR/theme/deployment gates remain
    separate and are not part of #679. #679 is presentation-only unless a
    future approved split issue explicitly gates broader behavior.
  - Project field updates are not mutated by this ledger entry when tooling is
    unavailable or ambiguous; report any skipped project/status updates in the
    task report.
- Remaining Day 1 work:
  - No currently approved #672 child implementation slice is waiting for a
    PR/merge gate after PR #678.
  - Minor copy/spacing/rhythm cleanup is split to #679 instead of keeping #672
    open as an umbrella.
  - Known non-blocking visual follow-ups after the merged slices include
    spacing/section rhythm, dense bills/OCR/settlement usage polish,
    notification detail safety-note / received-timestamp spacing, hiding
    zero-value settlement chips where not useful, friendlier OCR/revision copy
    such as `Action needed: needs review.`, and future theme/preset behavior.
  - OCR capture/processing states, advanced tax/discount/fee/refund review,
    push/provider/admin notification policy, auth security/privacy vault,
    import/export/backup runtime, and runtime theme picker/default-theme
    behavior remain separate future gated work and should not be treated as
    missing visual child slices unless a new bounded task explicitly approves
    them against existing runtime.
  - Manual/Figma visual review and evidence remain required for any later child
    slice or cleanup PR that changes material mobile presentation.
  - Runtime/payment/storage/money/OCR gates remain required for any behavior
    beyond visual presentation, including OCR extraction/runtime changes,
    receipt storage/file-byte changes, API/OpenAPI/generated-client/schema
    changes, settlement/payment/bill calculation authority, and runtime theme
    picker/default-theme behavior.
- Close/keep-open recommendation:
  - Close #672 as completed after the
    `docs/mobile-672-followup-split-close-20260703` docs/control PR merges,
    provided #679 exists, #371 remains closed, validation/CI pass, and the diff
    remains limited to this ledger.

### Issue #369 - Day 1 in-app notification event-family coverage

- GitHub state/project status: issue `OPEN`; Project field readback was not
  updated by this docs/control task. Related issues #368, #403, #634, and #635
  were read back as `OPEN`; #371 was read back as `CLOSED` after PR #664.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87` after PR #664 and before the
  `docs/auth-session-security-notification-source-policy-369-20260702`
  docs/control branch.
- Completed PRs/slices:
  - PR #654, merge SHA `d58c03753f16741fac0a572de16f1447711c6f64`:
    completed only the narrow `sync.operation_failed` in-app/provider-neutral
    notification slice for newly persisted current-actor rejected sync
    operations.
  - Branch
    `docs/settlement-residual-review-notification-source-policy-369-20260702`:
    adds the #369 settlement residual review notification source-policy gate.
  - Branch
    `feature/settlement-residual-review-needed-notification-369-20260702`:
    implements the narrow `settlement.residual_review_needed` runtime slice
    for successful debtor-created payment claims that persist pending
    receiver-confirmation residuals.
  - Branch `docs/sync-notification-source-policy-369-20260702`: defines the
    remaining sync queued/retry/resolved/conflict-resolution notification
    source policy after `sync.conflict_detected` and `sync.operation_failed`.
  - Branch
    `docs/auth-session-security-notification-source-policy-369-20260702`:
    defines the auth/session/security notification source-policy gate. It
    records current auth/session/security runtime facts and blocks security
    notification runtime until exact source transitions, recipient and
    self-notification rules, first-class target references, redaction, and
    manual auth-security approval exist.
  - PR #664, merge SHA `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`, finalized
    #371 ledger hygiene and issue close posture after accepted notification
    open/deep-link work. #371 is now closed and should not be redone under
    #369.
- Completed scope:
  - Records current residual facts: explicit same-currency underpayment and
    overpayment residual rows, `pending_receiver_confirmation` source state,
    receiver residual confirmation route, dispute/cancellation neutralization,
    and confirmed-only balance projection effects.
  - Separates existing `settlement.payment_partially_paid` and
    `settlement.payment_marked_paid` payment-claim notices from residual
    review semantics.
  - Adds `settlement.residual_review_needed` to the notification event
    vocabulary, OpenAPI enum, generated web/Dart clients, and notification
    event-type check constraints.
  - Writes one unread in-app/provider-neutral `settlement.residual_review_needed`
    notification to the receiver/creditor only when the debtor-created payment
    claim creates a pending receiver-confirmation residual.
  - Reuses existing settlement payment/request target references and existing
    authorized settlement payment read/residual confirmation APIs.
  - Preserves debtor actor suppression, unrelated participant/admin
    suppression, privacy-safe payload exclusions, duplicate/replay no-op
    behavior, and read/archive source-state isolation.
  - Records that current sync runtime has no server-side queued, retrying,
    retry-failed, resolved, reopened, or resolution-applied source states.
  - Defers noisy automatic `sync.operation_queued` and
    `sync.operation_retrying` notifications unless a later policy/runtime
    slice proves a specific transition is user-actionable and privacy-safe.
  - Conditionally allows future `sync.operation_retry_failed`,
    `sync.conflict_resolved`, and `sync.resolution_applied` only after exact
    persisted source transitions exist; `sync.conflict_reopened` remains
    deferred unless a real reopened source state exists.
  - Confirms current `syncOperationId` plus the current-actor sync operation
    read path is sufficient only for future events backed by a persisted
    server `SyncOperation`; local queue, retry schedule, conflict-record, or
    resolution-attempt targets need a future target/reference/API gate.
  - Records current auth/session/security facts: real auth account, identity,
    credential, session, refresh/session-family, auth audit, MFA/passkey,
    recovery-code, and auth security policy foundations exist, and public
    sign-in/refresh/current-user/sign-out/session-list/revocation runtime
    exists. However, notification event constants, subject types, first-class
    auth targets, security recipient/suppression rules, and runtime writers do
    not exist.
  - Blocks `security.session_new_device` / `security.new_session`,
    `security.session_revoked`, `security.all_sessions_revoked`,
    credential-change/reset/rotation events, account status events,
    role/policy-change events, suspicious session/replay, and failed-sign-in
    alerts until source-event semantics and manual auth-security policy are
    reviewed.
- Explicitly not complete:
  - No debtor notification after receiver residual decision.
  - No broader settlement mismatch/review event runtime.
  - No provider send, mobile/deep-link, admin/global policy, settlement
    business schema, money, residual, allocation, payment, proof, balance
    projection, auth/security, deployment, CI, or secret change.
  - No sync queued/resolved/retry/conflict-resolution runtime, event enum,
    OpenAPI/generated-client, EF migration/check constraint, queue consumer,
    scheduler, hosted worker, conflict-resolution implementation, mobile UI,
    or #371 deep-link change.
  - No auth/session/security notification runtime, event enum, target columns,
    OpenAPI/generated-client, EF migration/check constraint, security route,
    MFA/passkey/credential/session behavior, admin/global policy, provider
    delivery, or UI change.
- Remaining Day 1 work:
  - Future debtor notification after receiver residual decisions only if a
    later policy names the event/source/recipient rules.
  - Broader settlement mismatch/review notifications remain blocked until
    broader settlement review source states exist.
  - Runtime implementation for any remaining sync notification events remains
    blocked until exact persisted source states and recipient/action semantics
    exist. Ordinary queue/retry churn should stay local UI/readout rather than
    notification noise.
  - Auth/session/security notification runtime remains blocked until exact
    API-owned source transitions, first-class safe targets, recipient and
    actor-self policy, redaction, and manual auth-security approval exist.
  - #635 admin/global policy/readout, #634 real push/provider and mobile work,
    OCR completed/failed, item claim/split notifications, and final Day 1
    notification acceptance remain open/gated.
  - #371 is closed for notification-open/deep-link scope after PR #664; do not
    reopen or redo #371 work for remaining #369 source-policy slices.
- Close/keep-open recommendation:
  - Keep #369 open. This branch completes only the auth/session/security
    source-policy gate; it does not complete runtime coverage or Day 1
    notification acceptance.
  - Keep #368, #403, #634, and #635 open. Keep #371 closed.
- Last verified repo/report references:
  - `docs/architecture/SETTLEMENT_RESIDUAL_REVIEW_NOTIFICATION_SOURCE_POLICY.md`
  - `docs/architecture/SYNC_NOTIFICATION_SOURCE_POLICY.md`
  - `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
  - `/workspace/logs/settleora-codex-report-20260702-settlement-residual-review-notification-source-policy-369.md`
  - `/workspace/logs/settleora-codex-report-20260702-sync-notification-source-policy-369.md`

### Issue #371 - Notification deep links / mobile notification-open behavior

- GitHub state/project status: issue `CLOSED` after final close checkpoint;
  #368, #369, #403, #634, and #635 remain separate/open. Project field mutation
  was not attempted by this docs/control task.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87` after PR #664 and final close
  checkpoint.
- Completed slices:
  - PR #664, merge SHA `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`, finalized
    issue progress ledger closure-ready state and closed #371 after the final
    close comment.
  - PR #662, merge SHA `c5b2dae7d72cbd94da4437d19a0cdf5d30034723`,
    accepted the repo-native TSX/mobile reference copy and chrome polish.
  - PR #663, merge SHA `8b27a132aca6e6c52f602a940ef0d245ec46e9e5`,
    accepted the Flutter notification-open/deep-link implementation.
  - Branch `docs/notification-deep-link-route-policy-371-20260702` defines
    the #371 notification deep-link route/mobile navigation policy gate.
  - Branch `docs/notification-open-mobile-reference-371-20260702` adds the
    #371 mobile notification-open states reference handoff.
  - Branch
    `docs/notification-open-figma-reference-package-371-20260702` adds the
    focused #371 Figma/reference package for exact notification-open frame
    generation and review.
  - Branch `docs/notification-open-tsx-reference-371-20260702` adds the
    repo-native TSX equivalent reference package for reviewing the same
    notification-open frame inventory without Figma Make, Figma API, Figma
    screenshots, imported tokens, or binary assets.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    corrects that repo-native TSX package to visually align with the approved
    Settleora mobile shell, Notifications, More and Settings, Push
    Registration, Auth Security, and implementation guardrail references.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    also incorporates Tommy's partial visual review follow-up: the visual look
    is acceptable as mobile app UI, but notification-center/detail frames must
    not repeat the top bell affordance and visible phone-frame copy should be
    product-facing rather than backend/architecture phrasing.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    later applies the requested product-copy polish checkpoint: raw event names
    stay in docs/reference metadata only, while visible phone-frame copy uses
    product labels for settlement review, receipt review, sync issues, account,
    offline, unavailable, already handled, push-readiness, and generic fallback
    states.
  - Branch `feature/notification-open-flutter-deeplink-371-20260702` implements
    the first Flutter notification-open/deep-link slice for the existing mobile
    Notification Center without backend, OpenAPI, generated-client, provider,
    schema, deployment, auth/security runtime, or money-authority changes.
- Completed scope:
  - Defines that notification rows, push payloads, local cache, route state,
    object URLs, and generated-client availability are not authorization.
  - Requires opening a notification to re-fetch the notification detail and
    then re-fetch the linked bill, settlement, recurring bill, OCR review, or
    sync operation through authorized API paths.
  - Maps current implemented event families to future route targets: bill
    workflow/revision, settlement request/payment/proof/residual review,
    recurring due/draft, OCR `ocr.needs_review`, and sync
    `sync.conflict_detected` / `sync.operation_failed`.
  - Marks security/auth/session, item-claim/split, broader settlement review,
    OCR completed/failed, remaining sync queued/retry/resolved, provider,
    digest, admin/global policy, push-token, and delivery-attempt routes as
    future/blocked until source/runtime/target policies exist.
  - Defines missing, archived, restored, deleted, unauthorized, group-membership
    changed, resolved, retargeted, account-switched, sign-in-required, offline,
    and server-unavailable fallback behavior without private existence leaks.
  - Records privacy-safe external copy and mobile navigation posture, including
    no first-launch prompt coupling and Figma/reference-gated Flutter
    implementation.
  - Adds `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md` as
    the mobile reference handoff for opening notifications from in-app rows and
    OS push/local notifications.
  - Records product-facing state coverage for sign-in required, wrong account
    or account switched, local-only mode, offline/server unavailable,
    stale/missing targets, deleted/archived/restored targets, unauthorized or
    group-membership-changed targets, already resolved/completed notifications,
    retargeted notifications, loading, provider disabled/unconfigured readouts
    separated from authorization, and notification-detail fallback.
  - Adds privacy-safe copy and screenshot rules plus action-specific button
    wording such as `Open bill`, `Review settlement`, `Review receipt`,
    `View sync issue`, and `Back to notifications`.
  - Adds a paste-ready future Figma/reference prompt and a future Flutter/test
    readiness checklist while preserving server/API/domain authority.
  - Adds
    `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`
    as the Figma/reference review package with exact frame inventory,
    paste-ready Figma Make/designer prompt, UX/copy guardrails,
    privacy/safety restrictions, Tommy first-review checklist, Assistant
    second-review checklist, export evidence expectations, and the future
    Flutter implementation boundary.
  - Adds
    `docs/design/mobile/reference-tsx/notification-open/NotificationOpenReference.tsx`
    as a static, componentized, Figma-token-free equivalent reference with
    phone-frame TSX/CSS, frame index, and data objects covering notification
    inbox selection, authorized re-fetch loading, bill, settlement, residual
    review, recurring, OCR, sync, sign-in, account switch, local-only, offline,
    stale/missing, archived/deleted/restored, unauthorized or membership
    changed, resolved/completed, push-readiness, and generic fallback states.
  - Recovers the TSX visual language away from the initial standalone
    documentation-board look by removing the fake brand-mark treatment,
    arbitrary green gradient shell, square/flat card rhythm, and invented
    reference-board styling, while preserving all 18 #371 notification-open
    states and privacy/authority guardrails.
  - Refines the repo-native TSX reference so Notification Center uses filter
    chrome without a duplicate bell, notification detail/open frames use back
    navigation plus concise context titles without a bell, and visible
    phone-frame copy uses product phrases such as checking access, refreshing
    latest details, reviewing bills/settlements/receipts/sync issues, signing
    in, switching accounts, retrying, and returning to notifications.
  - Polishes the visible phone-frame copy so raw backend event strings such as
    OCR, settlement residual, and sync event names do not appear as user-facing
    labels; replaces debug-style labels such as visible context, shown/hidden,
    and stale-action explanations with shorter product copy and specific
    action labels.
  - Adds mobile notification-open route-family resolution for currently
    supported bill workflow/revision, settlement request/payment/proof/residual
    review, recurring due/draft, `ocr.needs_review`, and
    `sync.conflict_detected` / `sync.operation_failed` families using typed
    notification metadata only.
  - Updates the Flutter Notification Center to refresh the current notification
    row before opening a linked target, then re-fetch linked bill, settlement,
    recurring, OCR review, or sync-operation data through the current mobile
    repository/API seams before showing linked details or actions.
  - Keeps future/blocked auth/session/security, item claim/split,
    OCR completed/failed, remaining sync queued/retry/resolved/reopened,
    broader settlement mismatch/review, provider/digest/admin/global
    policy/readout, push-token/device-token, and delivery-attempt routes on
    product-facing unsupported fallback copy.
  - Removes duplicate bell iconography from Notification Center content while
    preserving the global top notification affordance on ordinary app screens
    and the existing `Home / Bills / Groups / Settle / More` shell.
  - Adds focused Flutter coverage for no duplicate Notification Center bell,
    supported route-family action mapping, OCR/sync opens, unsupported/future
    fallbacks, named sign-in/account/local-only/offline/stale/unauthorized/
    resolved/provider-unconfigured fallback copy, read/open/archive source
    mutation isolation, raw event-id suppression, and scroll-safe long
    notification rows.
  - Final acceptance check returned `READY_TO_CLOSE_RECOMMENDATION` with no
    remaining #371-specific gaps found.
- Explicitly not complete:
  - No Figma Make/API usage, Figma output, screenshots, binary assets,
    notification writer runtime, event enum, OpenAPI, generated-client, EF
    migration/check constraint, auth/session/security runtime,
    business-authority logic, provider sending, admin/global policy,
    deployment/env/CI, Docker, or secret changes.
  - Provider-backed push flows, push registration, admin/global policy/readout,
    backend notification event-family work, and broader notification epic work
    remain separate outside #371.
- Remaining Day 1 work:
  - No remaining #371-specific work was found by the final acceptance check.
  - Backend route/target tests only if a future implementation changes route
    metadata, target APIs, OpenAPI, or notification behavior.
- Close/keep-open recommendation:
  - Keep #371 closed. Do not redo notification-open/deep-link work under #369.
  - Keep #368, #369, #403, #634, and #635 open/separate.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md`
  - `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md`
  - `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`
  - `docs/design/mobile/reference-tsx/notification-open/README.md`
  - `docs/design/mobile/reference-tsx/notification-open/NotificationOpenReference.tsx`
  - `.codex/reports/settleora-codex-report-20260702-1705-notification-open-371-final-acceptance-check.md`
  - `/workspace/logs/settleora-codex-report-20260702-1705-notification-open-371-final-acceptance-check.md`

### Issue #570 - OCR review in-app notification runtime

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0`, `Actual Done Date`
  `2026-06-30`, and linked PR #626 by GraphQL readback on 2026-06-30.
- Last verified at main SHA:
  `ecbabe1bfe432deb8b10617ac59395f338c05b0b`.
- Completed PRs/slices:
  - PR #573, merge SHA `ce808da646146a5177444caff4702f1c645da994`:
    recorded that current OCR review `provisional` and `reviewed` states were
    not safe `ocr.needs_review` source events.
  - PR #574, merge SHA `d755e00efb0db386ace386ed136af66aa79c3b30`:
    recorded the explicit OCR review assignment/source-state policy and kept
    OCR notification runtime blocked until that source state existed.
  - PR #576 / issue #575, merge SHA
    `21c55062a8b7c49a7058e2fbc879b3c5c79bc822`: added the explicit
    API-owned OCR review needs-review assignment/source state prerequisite.
  - PR #626, source head `581aa6aca39041477e3f6ab58a1b8e33944e89ff`,
    merge SHA `ecbabe1bfe432deb8b10617ac59395f338c05b0b`: implemented the
    narrow `ocr.needs_review` in-app notification runtime for explicit
    API-owned OCR review assignment creation/retarget transitions only.
- Completed scope:
  - Creating a new active needs-review assignment, or retargeting an existing
    active assignment to a different authorized responsible editor, writes one
    safe unread `ocr.needs_review` in-app notification to the assigned profile.
  - Plain OCR review save/read/list/apply-preview/apply/delete, assignment
    visibility, completion, cancellation, duplicate same-recipient assignment,
    and actor self-assignment do not create OCR notifications.
  - Dependencies #568 target references and #575 assignment/source state are
    completed and closed/merged.
- Validation summary from PR #626:
  - Local validation passed before merge: `npm run doctor:validation`,
    `npm run validate:openapi`, `npm run validate:clients`,
    `npm run validate:scaffold`, API build with 0 warnings and 0 errors,
    focused API tests with 51 passed/0 failed/0 skipped,
    `timeout 900s npm run validate:api-local` with 1191 passed/0 failed/0
    skipped, `npm run validate:docs`, and final
    `git diff --check origin/main...HEAD`.
  - GitHub CI passed on exact PR head
    `581aa6aca39041477e3f6ab58a1b8e33944e89ff`: CodeQL jobs and Scaffold
    Validation.
- Remaining Day 1 work:
  - `ocr.completed` and `ocr.failed` remain blocked until server OCR
    worker/job source states exist.
  - #371 mobile/deep-link UI behavior remains separate and Figma/reference
    gated.
  - #369 and #368 remain open parent notification trackers.
  - Auth/session/security notification runtime remains manual-gated where
    applicable.
- Future gates requiring explicit approval:
  - Server OCR worker/job source states and failure/completion recipient policy.
  - Mobile/deep-link UI behavior under #371.
  - Auth/session/security notification policy and runtime.
  - Any future OpenAPI/generated-client, schema/migration, storage/privacy,
    money/settlement/bill authority, deployment, CI, or provider-delivery
    expansion outside the already merged #626 slice.
- Close/keep-open recommendation:
  - Keep #570 closed. It completed its narrow runtime slice and must not be
    used as proof that all OCR/server-worker/deep-link notification scope is
    complete.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1445-ocr-notification-source-state-review-570.md`
  - `.codex/reports/settleora-codex-report-20260628-1500-pr-ocr-notification-source-state-review-570-merge.md`
  - `.codex/reports/settleora-codex-report-20260628-1515-ocr-needs-review-source-transition-policy-570.md`
  - `.codex/reports/settleora-codex-report-20260628-1545-ocr-needs-review-assignment-source-state-child-issue-570.md`
  - PR #626:
    `https://github.com/tommytang213/Settleora/pull/626`
  - Issue #570 completion comment:
    `https://github.com/tommytang213/Settleora/issues/570#issuecomment-4844220380`

### Issue #629 - Notification preference decision-envelope and delivery-state foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-06-30`, and linked PR #630 by GitHub/Project
  readback on 2026-06-30.
- Last verified at main SHA:
  `34caca01a6a746f08b1892134a9510b9265cb645`.
- Completed PRs/slices:
  - PR #630, reviewed source head
    `3b181365246d895c9e8b69653dbd67e125cdcfc8`, merge SHA
    `34caca01a6a746f08b1892134a9510b9265cb645`: implemented the
    internal notification decision-envelope foundation.
- Completed scope:
  - Internal `INotificationDecisionEnvelopeResolver` service boundary.
  - Provider-free `NotificationDecisionEnvelopeResolver`.
  - Bounded `in_app`, `email`, and `mobile_push` channel vocabulary.
  - Bounded decision/reason vocabulary with no fake provider success.
  - Decision-only email and push outcomes without SMTP, push, queue, worker,
    device-token, or provider-success runtime.
  - In-app baseline eligibility behavior without weakening
    `IInAppNotificationWriter`.
  - Focused resolver tests.
- Explicitly not complete:
  - No SMTP runtime.
  - No push runtime.
  - No device-token API/storage.
  - No delivery worker, queue, or provider-success state.
  - No provider secrets, environment, or deployment changes.
  - No admin/global notification policy API.
  - No OpenAPI or generated-client changes.
  - No EF schema, migration, or database persistence changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
- Remaining related work:
  - #403 remains open for SMTP runtime, push runtime/device-token lifecycle,
    server-side preference resolution beyond this foundation, delivery-state
    persistence/workers, admin/global policy, and related gated work.
  - #369 remains open for remaining Day 1 notification event-family runtime and
    source-state work.
  - #368 remains open as the notification epic.
  - #371 is now closed after PR #664 for notification-open/deep-link scope;
    do not redo it under #629/#403/#369 work.
- Close/keep-open recommendation:
  - Keep #629 closed as complete for the internal decision-envelope foundation
    only. Do not treat #629 or PR #630 as completion of #403 or #369.
- Last verified repo/report references:
  - PR #630:
    `https://github.com/tommytang213/Settleora/pull/630`
  - Issue #629 completion comment:
    `https://github.com/tommytang213/Settleora/issues/629#issuecomment-4845421050`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2331-notification-decision-envelope-foundation-629-pr-merge.md`

### Issue #638 - Notification delivery-attempt persistence foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-07-01`, and linked PR #639 by GitHub/Project
  readback on 2026-07-01.
- Last verified at main SHA:
  `de2a7a38fe902c71592fef62d26fab4a4797ca5a`.
- Completed PRs/slices:
  - PR #639, reviewed source head
    `41e3c565d003dd7199a42442ec52e0a1bf16df9a`, merge SHA
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`: implemented the
    approved Option A provider-neutral notification delivery-attempt
    persistence/service foundation.
- Completed scope:
  - Provider-neutral `NotificationDeliveryAttempt` domain model.
  - Additive `notification_delivery_attempts` table.
  - Bounded pre-provider delivery-attempt constants and constraints.
  - Internal `INotificationDeliveryAttemptRecorder` service boundary and EF
    implementation.
  - DI registration without hooking the recorder into current writers or
    endpoints.
  - Recorder consumes #629 decision-envelope output plus source-domain
    eligibility and creates rows only for eligible `email` or `mobile_push`
    decisions.
  - Disabled, unconfigured, deferred, skipped, unsafe, source-ineligible, and
    missing-recipient paths no-op without fake `sent`, `delivered`, or
    provider success.
  - Idempotency is enforced by unique idempotency key/correlation behavior.
  - Focused tests cover persistence, no fake success, idempotency, no in-app
    or source mutation, sensitive-field exclusions, additive migration shape,
    and provider dependency absence.
- Migration/schema review:
  - Additive-only review passed.
  - `Up` creates only `notification_delivery_attempts` plus check constraints,
    indexes, and restricted FKs.
  - `Down` drops only `notification_delivery_attempts`.
  - No destructive `Up` operation against existing tables/columns.
  - No raw provider payload, SMTP credential, device token, storage path,
    object key, signed URL, local path, raw OCR/receipt text, payment detail,
    private note, hidden bill detail, or unrelated user-data field was added.
- Explicitly not complete:
  - No SMTP sending/runtime/provider adapter under #632.
  - No push sending/runtime/provider adapter or device-token API/storage under
    #634.
  - No worker/outbox processing loop.
  - No provider secrets, environment, deployment, APNs, FCM, or SMTP
    credentials.
  - No admin/global notification policy API/readout under #635.
  - No OpenAPI or generated-client changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
  - No storage/file-byte behavior.
  - No money, bill, split, settlement, payment, recurring, sync, OCR worker,
    import, export, or restore authority.
- Close/keep-open recommendation:
  - Keep #638 closed as complete for the provider-neutral delivery-attempt
    persistence/service foundation only.
  - Do not treat #638 or PR #639 as completion of #633 or #403.
- Last verified repo/report references:
  - PR #639:
    `https://github.com/tommytang213/Settleora/pull/639`
  - Issue #638 completion comment:
    `https://github.com/tommytang213/Settleora/issues/638#issuecomment-4850635401`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-0155-notification-delivery-attempt-persistence-foundation-638.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`

### Issue #641 - Notification delivery worker/outbox foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-07-01`, and linked PR #642 by GitHub/Project
  readback on 2026-07-01.
- Last verified at main SHA:
  `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`.
- Completed PRs/slices:
  - PR #642, reviewed source head
    `e65ad69f7ecfc28f4d56d844e2d1a2c8ca927d69`, merge SHA
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`: implemented the
    approved Option A provider-neutral notification delivery worker/outbox
    foundation over #638 `notification_delivery_attempts`.
- Completed scope:
  - Internal provider-neutral lease service and outbox processor service
    boundaries.
  - Lease-owner, lease-expiry, and last-attempt metadata for delivery
    attempts.
  - Retry/backoff handling through `next_attempt_at_utc`.
  - Provider-neutral safe no-op processing for disabled, unconfigured,
    cancelled, suppressed, expired, and other non-runnable attempts.
  - Bounded pre-provider state transitions: expired queued attempts transition
    only to `expired`; unsafe, source-invalid, or missing-recipient queued
    attempts transition only to `suppressed`.
  - DI registration for internal/future use only.
  - Focused tests for schema, lease/claim behavior, retry/backoff,
    idempotency, safe no-ops, provider/runtime absence, no source/in-app
    mutation, and sensitive-field exclusions.
- Migration/schema review:
  - Additive-only review passed.
  - `Up` adds nullable `last_attempted_at_utc`, nullable
    `lease_expires_at_utc`, nullable `lease_owner`, one lease/status index,
    and two lease consistency check constraints on
    `notification_delivery_attempts`.
  - `Down` removes only the new index, constraints, and columns.
  - No destructive operation against existing business tables/columns.
  - No raw provider payload, SMTP credential, push credential, device token,
    storage path, object key, signed URL, local path, raw OCR/receipt text,
    payment detail, private note, hidden bill detail, or unrelated sensitive
    schema field was added.
- Runtime activation review:
  - No hosted background service, scheduler, queue consumer, RabbitMQ
    consumer, cron, endpoint, notification-writer hook, provider adapter,
    SMTP sending, push sending, device-token API/storage, deployment/env
    behavior, or secret behavior was added.
- Explicitly not complete:
  - No SMTP sending/runtime/provider adapter under #632.
  - No push sending/runtime/provider adapter or device-token API/storage under
    #634.
  - No provider secrets, environment, deployment, APNs, FCM, or SMTP
    credentials.
  - No real provider-result success states without a separately approved real
    provider adapter.
  - No admin/global notification policy API/readout under #635.
  - No OpenAPI or generated-client changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
  - No direct source-business-table mutation by workers.
  - No storage/file-byte behavior.
  - No money, bill, split, settlement, payment, recurring, sync, OCR worker,
    import, export, or restore authority.
- Close/keep-open recommendation:
  - Keep #641 closed as complete for the provider-neutral worker/outbox
    foundation only.
  - Do not treat #641 or PR #642 as completion of #633 or #403.
- Last verified repo/report references:
  - PR #642:
    `https://github.com/tommytang213/Settleora/pull/642`
  - Issue #641 completion comment:
    `https://github.com/tommytang213/Settleora/issues/641#issuecomment-4851348342`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1450-notification-delivery-worker-outbox-foundation-641.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`

### Issue #632 - SMTP email notification runtime

- GitHub state/project status: issue `CLOSED`; PR #645 merged; Project
  status `Merged`, `Progress %` `100`, `Man-days Remaining` `0`, and
  `Actual Done Date` `2026-07-01` by GitHub/Project readback after PR #645.
- Last verified at main SHA:
  `39d1d669cc55988da31d4c5b76800c3f29aa4e83`.
- Completed PRs/slices:
  - PR #645, reviewed source head
    `28791c2159646a17733ea7ac08f9c744c7fd7687`, merge SHA
    `39d1d669cc55988da31d4c5b76800c3f29aa4e83`: implemented the
    approved Option A disabled-by-default SMTP email notification runtime
    foundation.
- Completed scope:
  - Approved Option A disabled-by-default SMTP email notification runtime
    foundation.
  - Internal SMTP provider adapter boundary behind server configuration.
  - Safe `disabled` and `unconfigured` outcomes.
  - Integration with #629 decision-envelope output and #638/#641
    delivery-attempt/outbox foundations.
  - Delivery-attempt state updates only through approved notification
    delivery-attempt/outbox boundaries.
  - No fake `sent` or `delivered` success.
  - In-app fallback unchanged.
  - Minimal generic email templates.
  - Bounded provider-result categories without raw SMTP response persistence.
  - Focused tests for disabled/unconfigured behavior, no fake sent success,
    redaction, provider classification, no secret leakage, no real network
    dependency, and no source business mutation.
- Configuration/secrets review:
  - SMTP remains disabled by default through
    `Notifications:SmtpEmail:Enabled = false`.
  - Enablement is through server/operator configuration only.
  - No committed SMTP secrets, credentials, tokens, `.env`, local secret
    files, deployment/env exposure files, or secret-like sample values.
  - No options endpoint, admin route, public route, OpenAPI schema,
    generated client, or UI exposes SMTP values.
  - Provider exceptions are classified into bounded redacted categories.
  - No secrets are exposed in logs, API responses, issue comments, docs, test
    snapshots, exceptions, or client-visible payloads.
- Email template/privacy review:
  - Minimal generic subject/body.
  - Bodies say a notification is available in Settleora and require
    sign-in/authorization.
  - Bodies include only event type and one safe stable reference when present.
  - Bodies exclude raw OCR/receipt text, private/hidden bill details, payment
    data, proof contents, signed URLs, object keys, storage paths, tokens,
    credentials, provider payloads, private notes, and unrelated user data.
- Explicitly not complete:
  - Recipient email-address source/policy for actual recipient addressing.
  - Hosted runtime activation.
  - Production deployment/env/secrets setup.
  - Admin/global notification policy/readout under #635.
  - Push/device-token/provider runtime under #634.
  - OpenAPI/generated-client/readout.
  - Admin, web, mobile UI and #371 deep links.
  - Auth/session/security notification behavior.
  - Email digests, bulk campaigns, or marketing emails.
  - Money, bill, split, settlement, payment, recurring, sync, OCR, import,
    export, or restore authority.
- Remaining related work:
  - #403 remains open because #632 completed only the disabled-by-default SMTP
    runtime foundation; push/device-token runtime (#634), admin/global
    policy/readout (#635), future route-family extensions after closed #371,
    hosted runtime
    activation, recipient-email source/policy, OpenAPI/readout, and remaining
    notification work remain gated.
  - #369 remains open because #632 closure is provider runtime foundation
    only, not full Day 1 notification event-family acceptance.
  - #634/#635/#368 remain open; #371 is closed after PR #664.
  - #629/#633/#638/#641/#632 remain closed/Merged as completed
    foundations/slices.
- Close/keep-open recommendation:
  - Keep #632 closed as complete for the disabled-by-default SMTP runtime
    foundation only.
  - Do not treat #632 or PR #645 as completion of #403.
- Last verified repo/report references:
  - PR #645:
    `https://github.com/tommytang213/Settleora/pull/645`
  - Issue #632 completion comment:
    `https://github.com/tommytang213/Settleora/issues/632#issuecomment-4852592872`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1632-smtp-email-runtime-foundation-632.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1655-smtp-email-runtime-foundation-632-pr-merge.md`

### Issue #633 - Notification delivery-state persistence and worker foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0`, and `Actual Done Date`
  `2026-07-01` by GitHub/Project readback on 2026-07-01 after PR #644.
  PR #636, PR #639, PR #642, PR #643, and PR #644 are merged, and #633's
  own close rule is satisfied for the reviewed and validated delivery-state
  persistence/worker foundation scope. This closure does not complete
  provider runtime, hosted worker activation, admin policy, OpenAPI/readout,
  UI/deep-link work, remaining event-family runtime, or provider/deployment
  gates.
- Last verified at main SHA:
  `79d6f71cade6f6edfa3bdb95b8b7b1aebd1b370d` after PR #644.
- Completed PRs/slices:
  - PR #636, reviewed source head
    `bed8689325fc76dcf071970256df1da4f7ebe615`, merge SHA
    `94f71c96446780966bec7cefc415c0ee6bbdd54e`: completed the docs/control
    architecture review for notification delivery-state persistence and worker
    foundation.
  - PR #639 / issue #638, reviewed source head
    `41e3c565d003dd7199a42442ec52e0a1bf16df9a`, merge SHA
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`: completed the first
    approved provider-neutral delivery-attempt persistence/service foundation
    slice only.
  - PR #642 / issue #641, reviewed source head
    `e65ad69f7ecfc28f4d56d844e2d1a2c8ca927d69`, merge SHA
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`: completed the approved
    provider-neutral worker/outbox processing foundation slice.
  - PR #643, reviewed source head
    `f18bbc5e6c1dd7dfc68ffb361e118b8164c9ca88`, merge SHA
    `b669afc095f2fceec110813b58904fd1a367a415`: recorded the #641/#633
    ledger checkpoint before #633 closure.
  - PR #644, reviewed source head
    `23991b533a4e459c53b58769f69736e8b0a173cc`, merge SHA
    `79d6f71cade6f6edfa3bdb95b8b7b1aebd1b370d`: closed #633 for the
    delivery-state persistence/worker foundation only and recorded the closure
    checkpoint.
- Completed scope:
  - Added
    `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`.
  - Updated README and architecture index references.
  - Separated in-app unread/read/archive state, #629 decision-envelope
    eligibility, external delivery attempts, SMTP runtime, push runtime,
    admin/global policy, and device-token lifecycle.
  - Recorded API/domain authority boundaries for recipient eligibility, channel
    eligibility, idempotency, redaction, audit-safe metadata, and delivery
    attempt acceptance.
  - Constrained future workers to API/domain-created outbox/queue records or a
    separately approved service boundary.
  - Defined provider-neutral state vocabulary, redaction rules, future
    persistence-model guidance, and implementation split recommendations.
  - Added provider-neutral `NotificationDeliveryAttempt` persistence and
    internal recorder service foundation that consumes #629 decision envelopes
    plus source-domain eligibility for eligible `email` and `mobile_push`
    decisions.
  - Added only bounded pre-provider queued-attempt persistence behavior with
    no fake success and no in-app/source mutation.
  - Added provider-neutral lease/claim and outbox processor service
    boundaries over `notification_delivery_attempts`, with retry/backoff,
    idempotent safe no-op handling, bounded pre-provider transitions, and no
    hosted runtime activation.
  - Added safe metadata only: no raw provider payload, SMTP credential, push
    credential, raw device token, storage path, object key, signed URL, local
    path, raw OCR/receipt text, payment detail, private note, hidden bill
    detail, or unrelated sensitive field.
  - Validated that the persistence and worker/outbox foundations do not create
    fake provider success, do not mutate source business state, do not mutate
    in-app read/archive state, have no provider dependency, do not change
    OpenAPI/generated clients, and use additive migrations only.
- Explicitly not complete:
  - No hosted provider runtime activation, push runtime/device-token storage
    under #634, or admin/global policy API/readout under #635.
  - SMTP runtime under #632 is now separately closed only for the
    disabled-by-default internal SMTP foundation; #633 itself did not complete
    SMTP recipient addressing, hosted activation, deployment/env/secrets, or
    external delivery-state API/readout.
  - No hosted background service, scheduler, queue consumer, RabbitMQ
    consumer, cron, endpoint, notification-writer hook, provider adapter, SMTP
    sending, push sending, device-token API/storage, deployment/env behavior,
    or secret behavior.
  - No OpenAPI contract or generated-client changes.
  - No mobile, web, admin UI, deep-link, or #371 work.
  - No provider secrets, environment, deployment, auth/session/security
    runtime, or bypass policy changes.
  - No external delivery-state API/readout, OpenAPI contract, generated-client
    exposure, hosted runtime activation, UI/deep links, or source-state event
    families.
- Remaining related work:
  - The #632 disabled-by-default SMTP runtime foundation is complete, but
    actual recipient email-address source/policy, hosted runtime activation,
    deployment/env/secrets setup, admin/readout, OpenAPI/readout, and UI
    remain separate gated work and must not be inferred from #633 or #641.
  - Future push provider runtime, device-token lifecycle, provider adapters,
    provider-result success/failure classification, and hosted runtime
    activation remain separate gated work and must not be inferred from #641.
  - Any external delivery-state API/readout requires separate
    OpenAPI/generated-client gates.
  - #403 remains open because #632 completed only the disabled-by-default SMTP
    runtime foundation, while server-side preference/runtime resolution beyond
    foundations, admin policy/readout, deep links, push/device-token, hosted
    runtime activation, recipient-email source/policy, OpenAPI/readout, and
    remaining notification work remain gated.
  - #369 remains open because #633 closure is provider-neutral
    delivery-state foundation only, not full Day 1 notification event-family
    acceptance.
  - #368 remains open as the notification epic.
  - #371 is closed after PR #664; future route-family extensions require
    separate scope but should not redo #371.
  - #634/#635 remain separate gated issues for push/device-token runtime and
    admin/global policy API/readout.
  - #632/#638/#641/#629 remain closed/Merged as completed foundations/slices.
- Close/keep-open recommendation:
  - Keep #633 closed as complete for delivery-state persistence/worker
    foundation only.
  - Do not treat #633 closure as provider/runtime/admin/UI completion.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - PR #636:
    `https://github.com/tommytang213/Settleora/pull/636`
  - PR #639:
    `https://github.com/tommytang213/Settleora/pull/639`
  - PR #642:
    `https://github.com/tommytang213/Settleora/pull/642`
  - PR #643:
    `https://github.com/tommytang213/Settleora/pull/643`
  - PR #644:
    `https://github.com/tommytang213/Settleora/pull/644`
  - Issue #633 merge checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/633#issuecomment-4846071136`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-0034-notification-delivery-state-worker-architecture-633.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-0107-notification-delivery-state-worker-architecture-633-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1512-issue-progress-ledger-641-633-checkpoint.md`

### Issue #634 - Mobile push device-token API and provider-neutral delivery runtime

- GitHub state/project status: issue `OPEN`; Project status `Blocked` by
  GitHub/Project readback on 2026-07-01 after PR #650 and issue-comment
  readback on 2026-07-01 after PR #652. A1 design, A2 token-protection
  design, the A2 server-side token lifecycle API foundation, the A3 Option A
  provider-neutral push runtime foundation, and the #634 mobile push
  registration UX/readiness reference gate are complete. #634 remains open
  because real APNs/FCM providers, Flutter token registration implementation,
  APNs/FCM/provider setup, hosted activation, admin/readout, #371 deep links,
  and related notification work remain blocked/gated. Remaining MD must not be
  reduced to `0`.
- Last verified at main SHA:
  `98dc4ab0e6ae7363b0d3638c3d17500c3a26f610`.
- Completed PRs/slices:
  - PR #647, reviewed source head
    `837e51ccad71f79762ddd6b2b4035145d8497469`, merge SHA
    `7898d8f75008474a6bc1aff6d0a02552291f2bc4`: completed the #634 A1
    push token lifecycle architecture/contract design checkpoint only.
  - PR #649, reviewed source head
    `784782fa15f7c74b9247cb383fdcbb090a43f7e0`, merge SHA
    `200d608da2b2b6ebb8d0d80cfd67ad58e9715414`: completed the A2 Option C
    token-protection design checkpoint before A2 implementation.
  - PR #650, reviewed source head
    `c86b95f3e16b40495e23f9c2a8aca008789a4470`, merge SHA
    `1983832614394ed0dd8c8c6d4aab63e512e42b4b`: completed the #634 A2
    Option A server-side push token lifecycle API foundation only.
  - Branch `feature/push-a3-provider-runtime-634-option-a-20260701`:
    implements the approved #634 A3 Option A provider-neutral push delivery
    runtime foundation over the existing #629/#638/#641 notification
    foundations. This branch is not a real APNs/FCM provider implementation and
    does not close #634.
  - Branch `docs/mobile-push-registration-ux-design-gate-634-20260702`:
    records the no-code mobile push registration UX/readiness reference gate in
    `docs/design/mobile/MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md`. This gate
    defines permission timing, settings/readout states, token
    registration/revocation UX, privacy-safe copy, provider/dependency posture,
    mobile identity/signing readiness, and Figma/reference handoff. It does not
    implement Flutter UI, generate Figma, change OpenAPI/generated clients, add
    provider credentials, or close #634.
- Completed A1/A2/A3 Option A scope:
  - Future current-user push token register/replace, revoke current token,
    revoke current-session tokens, revoke all current-user tokens, optional
    safe readout, token rotation, and stale-cleanup endpoint shapes.
  - Idempotent duplicate registration behavior, token-conflict posture,
    authenticated session/profile binding, rate-limiting posture, and safe
    error vocabulary.
  - Later token persistence fields for user/profile/session/device
    association, platform/provider, token fingerprint, protected token
    secret/ciphertext, lifecycle timestamps, revocation/stale/failure
    metadata, provider feedback category, unique constraints, idempotency keys,
    retention, and cleanup.
  - Token protection policy with no plaintext normal read paths, no raw token
    exposure, a purpose-bound keyed fingerprint, and a protected server
    boundary for raw provider send.
  - Privacy-safe push payload exclusions and the rule that notification opens
    must re-fetch linked resources through authorized API paths.
  - Provider-neutral-first runtime posture with no real provider enabled by
    default.
  - Mobile/Figma posture, including a required Figma/reference gate for mobile
    OS permission/settings UI and separate mobile validation/release gates for
    actual app integration.
  - #371 notification deep links kept separate from push provider work; #371 is
    now closed after PR #664.
  - Recommended A2/A3/A4 future implementation split: A2 server-side token
    persistence/API foundation, A3 provider-neutral push delivery runtime, and
    A4 mobile app registration/permission UX.
  - A2 token-protection design classifies push tokens as provider-usable
    sensitive secrets; defines protected storage/sealing/key-management
    posture; defines purpose-bound keyed fingerprinting for dedupe/correlation
    only; defines API/read-path, log, audit, telemetry, issue, docs,
    generated-client, and test redaction expectations; defines backup/restore
    and local-mode re-registration posture; and keeps provider/runtime work
    separate.
  - A2 implementation adds additive `push_device_tokens` persistence; protected
    raw token storage through push-specific `IPushTokenProtector` /
    `PushTokenProtector`; HMAC token fingerprint and device-installation hash
    support through a push-specific service boundary; fail-closed registration
    and token-based revocation when fingerprint key/config is unavailable;
    authenticated current-user APIs
    `PUT /api/v1/me/push-devices/current-token`,
    `DELETE /api/v1/me/push-devices/current-token`, and
    `DELETE /api/v1/me/push-devices/current-session`; OpenAPI contract
    updates; regenerated web/Dart generated clients; and safe lifecycle
    metadata responses only.
  - A3 Option A adds internal provider-neutral push send boundaries,
    disabled/unconfigured default provider registration, a privacy-safe
    provider-neutral payload builder, bounded provider feedback categories,
    existing `mobile_push` delivery-attempt/outbox integration, no-active-token
    handling, and protected token unprotect only inside the push send boundary.
  - A3 Option A maps disabled, unconfigured, and no-active-token outcomes to
    existing safe non-success delivery-attempt states and never records fake
    `sent` or `delivered` success.
  - Mobile push registration UX/readiness reference gate records that push
    permission must not be requested on first launch, must require
    authenticated server-mode context plus clear user intent, must expose
    local-only/unsupported/disabled/unconfigured/readiness states before OS
    prompting, must use only the existing authenticated current-user
    push-device APIs for future token registration/revocation, and must keep
    push copy generic with authorized re-fetch on open.
  - The reference gate records that Firebase is not an approved required
    product dependency unless Tommy explicitly approves it later, and keeps
    direct APNs + direct FCM and FCM-with-APNs-linkage as future options only.
  - The reference gate records non-secret mobile identity/signing readiness
    checks for iOS bundle ID, Android package name, environment split, Apple
    Developer/App Store Connect readiness, push capability/provisioning,
    Codemagic/TestFlight/Android signing path, Firebase ownership if later
    approved, and real-device/manual validation expectations.
  - A2 validation covered protection, auth/session binding, dedupe/idempotency,
    revocation, schema/migration, OpenAPI/client validation, no provider
    dependency, and token redaction.
- Migration/schema review:
  - Additive-only migration
    `20260701115832_AddPushDeviceTokensFoundation` creates only
    `push_device_tokens` plus constraints, indexes, and restrictive foreign
    keys to `auth_accounts`, `auth_sessions`, and `user_profiles`.
  - No destructive operation against existing tables or columns.
  - No plaintext token column and no committed secret/key/provider
    credential/default secret material.
  - Token material is stored as `protected_token_blob`.
  - Dedupe/correlation uses internal HMAC fingerprint fields.
- OpenAPI/generated-client review:
  - OpenAPI updated at `packages/contracts/openapi/settleora.v1.yaml`.
  - Generated web and Dart clients were refreshed and validated.
  - Token request input is write-only where possible.
  - Response schemas and generated response models exclude raw token, protected
    blob/ciphertext, fingerprint, and device-installation hash, exposing safe
    lifecycle metadata only.
- Token protection/redaction review:
  - Data Protection purpose is push-specific.
  - HMAC key must be configured and at least 32 bytes.
  - Registration and token-based revocation fail closed with safe `503` when
    fingerprint key/config is missing.
  - No raw token, protected blob, fingerprint, provider payload, provider
    credential, or realistic provider token is exposed in responses, generated
    clients, docs, tests, issues, or reports.
- Auth/session/current-user binding review:
  - Endpoints require the existing authenticated-user policy.
  - Server-derived actor/account/profile/session IDs are the only authority.
  - Request bodies cannot target another account, profile, user, role, or
    session.
  - Current-token revocation is scoped to the authenticated actor and current
    session.
  - Current-session revocation affects push token bindings only, not auth
    sessions.
- Explicitly not complete:
  - No real APNs/FCM provider sending.
  - No APNs/FCM secrets, credentials, signing/release config, provider account
    setup, or deployment/env setup.
  - No mobile app code.
  - No mobile OS permission/settings UI implementation or Figma output.
  - No #371 deep links/navigation.
  - No hosted runtime activation, scheduler, queue consumer, or push sender
    worker beyond the existing internal outbox processor service boundary.
  - No admin/global policy/readout under #635.
  - No public/admin UI.
  - No public/admin push payload readout, provider payload persistence, or
    raw provider request/response storage.
  - No source-business mutation.
  - No auth/session/security bypass behavior.
  - No storage/file-byte behavior outside the approved token-protection
    boundary.
  - No money, bill, split, settlement, payment, recurring, sync, OCR, import,
    export, or restore authority changes.
- Auto-close hygiene:
  - PR #647 originally auto-closed #634 due to a GitHub keyword phrase in the
    PR body.
  - Codex reopened #634 immediately and edited the PR body to remove the
    accidental auto-close phrase.
  - Final readback after hygiene: #634 is `OPEN` and Project status `Blocked`;
    the accidental close must not be read as completion of #634.
- Remaining related work:
  - #403 remains open because #634 A2/A3 Option A completed only the
    server-side token lifecycle foundation and disabled/unconfigured
    provider-neutral push runtime foundation, while real APNs/FCM providers,
    A4 mobile/Figma, APNs/FCM secrets/provider account setup, hosted
    activation, admin/readout, future route-family extensions after closed
    #371, recipient/policy/runtime
    wiring, and remaining notification work remain gated.
  - #369 remains open because #634 A2/A3 Option A are push token/runtime
    foundations only, not full Day 1 notification event-family acceptance.
  - #635 and #368 remain open; #371 is closed after PR #664.
  - #629, #632, #633, #638, and #641 remain closed/Merged as completed
    foundations/slices.
- Close/keep-open recommendation:
  - Keep #634 open/Blocked. A2 plus A3 Option A complete only the server-side
    token lifecycle foundation and disabled/unconfigured provider-neutral push
    runtime foundation, and the mobile push registration UX/readiness reference
    is only a no-code gate. Do not treat #634 as complete, and do not treat
    #403 as complete.
- Last verified repo/report references:
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `docs/architecture/PUSH_TOKEN_PROTECTION_DESIGN.md`
  - PR #647:
    `https://github.com/tommytang213/Settleora/pull/647`
  - PR #649:
    `https://github.com/tommytang213/Settleora/pull/649`
  - PR #650:
    `https://github.com/tommytang213/Settleora/pull/650`
  - #634 A1 completion comment:
    `https://github.com/tommytang213/Settleora/issues/634#issuecomment-4853371580`
  - #634 A2 merge checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/634#issuecomment-4855524740`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1755-push-device-token-runtime-decision-packet-634.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1802-push-token-lifecycle-architecture-contract-634-a1.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1920-push-token-protection-design-634-a2-option-c.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1951-push-token-a2-api-foundation-634-option-a.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-2032-push-token-a2-api-foundation-634-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-2219-push-a3-provider-runtime-634-option-a.md`
    and
    `.codex/reports/settleora-codex-report-20260702-0005-mobile-push-registration-ux-design-gate-634.md`

### Issue #369 - Complete Day 1 in-app notification event coverage

- GitHub state/project status: issue `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `60`, `Initial MD` `2`,
  `Man-days Remaining` `2`, `Figma Required` `Yes`, `Manual Gate` `Yes` by
  GraphQL readback on 2026-06-30. GitHub issue remains `OPEN` and Project
  status remains `Needs Architecture Review` by readback on 2026-07-01 after
  PR #650 and by issue readback on 2026-07-02 before the
  `sync.operation_failed` implementation branch report. Issue readback before
  `docs/auth-session-security-notification-source-policy-369-20260702` showed
  #369 still `OPEN`; related #371 is now `CLOSED` after PR #664.
- Parent epic readback: #368 is `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `33`, `Figma Required` `Yes`,
  `Manual Gate` `Yes`. GitHub issue #368 remains `OPEN` by readback on
  2026-07-01.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`.
- Current remaining-gates checkpoint on 2026-07-03 HKT:
  - Verified `origin/main` is
    `503d29530a4d317f937edab383a248e47050f776`, the PR #681 merge commit, and
    it includes the expected #681 visual-polish merge after PR #680 closed #672.
  - Live issue readback: #368 `OPEN`, #369 `OPEN`, #403 `OPEN`, #634 `OPEN`,
    and #635 `OPEN`; #371 `CLOSED` after PR #664 and must not be redone without
    a concrete regression; #570 `CLOSED` after PR #626 and #575 `CLOSED` after
    PR #576, which is consistent with current docs/runtime because only
    `ocr.needs_review` assignment/runtime is complete while `ocr.completed` and
    `ocr.failed` remain blocked; #672 `CLOSED` after PR #680; #679 `CLOSED`
    after PR #681.
  - Completed notification event-family/runtime/control slices verified by
    merged PRs include: recurring due-soon PR #560
    `12bbdbdf1f00912589dea5d38d9d2ac5949af440`; notification preferences
    PR #561 `0ed5547a230cbad1f4dbb366d9c873dca38099df`; coverage review
    PR #562 `40bf0d7aaa294221a272143376afcd963228ccae`; settlement coverage
    PR #563 `99b2c6b2112a44ffada671da1294aca2481213a8`; bill workflow
    PR #564 `52667ccdf8447157b265a61ed4ec6993b3a8faa7`; bill revision PR #565
    `ea2560cb2648f8890a6c185f7296e389b473a2c6`; recurring draft-generated
    PR #566 `25a519530821fd611f3b6bd2ddbbfa8d96cf9c54`; target-reference
    docs/control PR #567 `7cb283612cd8e5d5a95e7e8ecfeebba1fc572358` and
    OCR/sync target-reference runtime PR #569
    `64351208be72558329547cdd1fc415005c9be075`; sync conflict PR #572
    `04e8a18bbf2ef280845cf6978638bec949e597c0`; OCR source-state/policy
    PRs #573 `ce808da646146a5177444caff4702f1c645da994`, #574
    `d755e00efb0db386ace386ed136af66aa79c3b30`, #576
    `21c55062a8b7c49a7058e2fbc879b3c5c79bc822`, and #626
    `ecbabe1bfe432deb8b10617ac59395f338c05b0b`; decision/delivery/provider
    foundations PR #630 `34caca01a6a746f08b1892134a9510b9265cb645`, #636
    `94f71c96446780966bec7cefc415c0ee6bbdd54e`, #639
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`, #642
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`, #645
    `39d1d669cc55988da31d4c5b76800c3f29aa4e83`, #647
    `7898d8f75008474a6bc1aff6d0a02552291f2bc4`, #649
    `200d608da2b2b6ebb8d0d80cfd67ad58e9715414`, #650
    `1983832614394ed0dd8c8c6d4aab63e512e42b4b`, #652
    `98dc4ab0e6ae7363b0d3638c3d17500c3a26f610`, and #653
    `1c94fda04dfcea282bc15f6d06a83ce5cb7faaef`; sync operation failed
    PR #654 `d58c03753f16741fac0a572de16f1447711c6f64`; settlement residual
    review PR #656 `1766fe9962fe0b4f6d543e0d3aa4c87490e608cf`; remaining sync
    source-policy PR #657 `d814d2a221b2335366bebbdb372f8e1c1c85fc71`; #371
    route/open implementation and close PRs #658
    `40afe9babff51aade50b3312ef77a85f7db65a74`, #663
    `8b27a132aca6e6c52f602a940ef0d245ec46e9e5`, and #664
    `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`; auth/session/security
    source-policy PR #665 `e98f6b880b4e87980ec747532783492fc3869d0f`.
  - Remaining gates by category:
    in-app event constants/writers/tests have no currently safe small runtime
    slice unless a future source-state/manual gate first approves exact source
    transitions and safe targets; source-state/design gaps remain for
    `ocr.completed`/`ocr.failed`, remaining sync queued/retry/resolved flows,
    auth/session/security events, item claim/split/creator-review, and broader
    settlement mismatch/review or debtor residual-decision notifications;
    OpenAPI/generated-client/schema changes are allowed only as part of a
    later exact runtime slice with reviewed source states; #371 mobile
    notification-open/deep-link work is closed; #634 push/provider/device-token
    work remains open/Blocked for real APNs/FCM providers, provider secrets,
    hosted activation, mobile registration/permission UX, feedback cleanup, and
    release/deployment gates; #635 admin/global policy/readout remains open;
    auth/session/security notification runtime remains blocked by manual
    auth-security and target-reference gates; final Day 1 notification
    acceptance/release readiness, manual UI retest, and manual code review are
    not complete.
  - Recommended next action: do not start a runtime notification slice from
    #369 solely because the issue is open. The next safe path is a docs/design/
    decision gate for the highest-priority remaining blocked family, preferably
    auth/session/security target-reference plus manual auth-security approval,
    or a #635 admin/global policy/readout decision if operator policy should
    gate provider work first.
  - Close/keep-open recommendation: keep #369, #368, #403, #634, and #635
    open; keep #371, #570, #575, #672, and #679 closed unless a concrete
    regression or newly approved follow-up scope is filed separately.
- #635 admin/global policy readout checkpoint on
  `docs/notification-635-admin-global-policy-readout-20260703`:
  - Verified `origin/main` is
    `7d371c33a8317e64d1df289f8318b2712fb6926d`, the PR #682 merge commit,
    before starting the #635 readout branch.
  - Live issue readback during the branch showed #368 `OPEN`, #369 `OPEN`,
    #403 `OPEN`, #634 `OPEN`, and #635 `OPEN`; #371 `CLOSED`, #570 `CLOSED`,
    #575 `CLOSED`, #672 `CLOSED`, and #679 `CLOSED`.
  - Added `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md` as a
    docs/control policy readout for global channel caps, provider readiness
    states, security/money force-in-app and external-channel policy, quiet
    hours/digest/group mute boundaries, policy precedence, authorization and
    audit requirements, product-facing readout behavior, and implementation
    split planning.
  - This is not runtime implementation and does not add notification event
    constants, writers, schema, OpenAPI/generated clients, provider sending,
    admin UI, mobile UI, secrets, deployment, auth/session/security runtime,
    money/settlement/storage/OCR/sync behavior, or #371 deep-link behavior.
  - #635 remains open. Future #635 implementation remains blocked until manual
    admin/security, schema/migration, OpenAPI/generated-client, provider,
    audit, and UI/Figma gates are cleared in focused child tasks.
- Completed child slices now recorded:
  - #634 / PR #647 completed the A1 push token lifecycle
    architecture/contract design checkpoint. PR #649 completed the A2
    token-protection design checkpoint. PR #650 completed the A2 server-side
    push token lifecycle API foundation with protected token storage,
    authenticated current-user token register/revoke APIs, additive
    `push_device_tokens` persistence, OpenAPI updates, regenerated web/Dart
    clients, safe lifecycle metadata responses only, fail-closed fingerprint
    configuration behavior, and no provider dependency. It did not implement
    mobile code, APNs/FCM provider runtime or sending, provider secrets,
    hosted activation, admin/readout, #371 deep links, or full Day 1
    notification acceptance.
  - #634 A3 Option A branch
    `feature/push-a3-provider-runtime-634-option-a-20260701` adds only the
    internal disabled/unconfigured provider-neutral push runtime foundation:
    safe payload builder, `mobile_push` outbox integration, no-active-token
    handling, bounded provider categories, and no fake `sent`/`delivered`
    success. It does not add real APNs/FCM sending, mobile UI, hosted
    activation, admin/readout, #371 deep links, or Day 1 notification
    acceptance.
  - #632 / PR #645 completed only the disabled-by-default SMTP runtime
    foundation. It did not add recipient email-address source/policy, hosted
    runtime activation, deployment/env/secrets setup, admin/global
    policy/readout, push/device-token runtime, OpenAPI/readout, UI, or deep
    links, and it does not complete full Day 1 notification event-family
    acceptance.
  - #633 is closed for its own provider-neutral delivery-state
    persistence/worker foundation after PR #636 architecture/design, PR
    #639/#638 persistence/service foundation, PR #642/#641 worker/outbox
    foundation, PR #643 ledger checkpoint, and PR #644 closure. This does not
    complete full Day 1 notification event-family acceptance.
  - PR #642 / #641 completed only the provider-neutral worker/outbox
    foundation over `notification_delivery_attempts`. It did not add SMTP
    runtime, push runtime, provider adapters, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, hosted runtime activation, or
    deep links.
  - PR #639 / #638 completed only the provider-neutral delivery-attempt
    persistence/service foundation for eligible `email` and `mobile_push`
    decisions. It did not add worker/outbox processing, SMTP runtime, push
    runtime, provider adapters, device-token APIs/storage, admin/global policy,
    OpenAPI/readout, UI, or deep links.
  - PR #636 / #633 completed the delivery-state worker foundation architecture
    review only. It did not add event-family runtime, provider delivery,
    source states, OpenAPI event values, schema, UI, or deep links.
  - PR #630 / #629 completed the internal notification decision-envelope
    foundation only. It did not add new Day 1 event-family runtime, provider
    delivery, source states, OpenAPI event values, schema, UI, or deep links.
  - PR #626 / #570 completed the narrow OCR `ocr.needs_review` runtime for
    explicit API-owned assignment creation/retarget transitions only.
  - Earlier merged #369/#367/#370 slices already cover recurring due-soon,
    notification preferences infrastructure, notification event coverage
    review, settlement notification coverage, bill workflow coverage, bill
    revision coverage, recurring draft-generated coverage, #568 OCR/sync target
    references, and #571 persisted sync-conflict-only runtime.
  - Branch `feature/sync-operation-failed-notification-369-20260702`
    implements the next narrow #369 sync slice for
    `sync.operation_failed`: newly persisted current-actor
    `SyncOperationStatuses.Rejected` rows write one unread in-app notification
    with first-class `syncOperationId`, safe sync operation action URL, current
    actor recipient, and bounded safe resource metadata. Accepted operations,
    replay/idempotency reuse, existing conflict rows, and invalid requests that
    do not persist a rejected row do not write this notification. This branch
    updates OpenAPI/generated clients only for the notification event enum and
    adds an additive EF migration that widens notification event-type check
    constraints; it does not implement queued/resolved/retry/conflict
    resolution, mobile/deep links, provider send, admin policy, or broader sync
    behavior.
  - Branch
    `feature/settlement-residual-review-needed-notification-369-20260702`
    implements the narrow settlement residual-review notification slice:
    successful debtor-created payment claims that persist pending
    receiver-confirmation residuals write one unread
    `settlement.residual_review_needed` in-app/provider-neutral notification
    to the receiver/creditor, with existing settlement payment/request target
    references, safe action URL, privacy-safe metadata, replay/no-op duplicate
    prevention, and no residual amount/reason/payment/proof/storage details.
    This branch updates OpenAPI/generated clients only for the notification
    event enum and adds an EF migration that widens notification event-type
    check constraints; it does not change settlement business schema, money,
    residual policy, allocation, confirmation, balance projection, proof,
    provider send, mobile/deep links, or admin policy behavior.
  - Branch
    `docs/auth-session-security-notification-source-policy-369-20260702`
    adds the auth/session/security notification source-policy gate. It records
    that current auth/session/security runtime has real API-owned session,
    credential, refresh/session-family, MFA/passkey, recovery-code, security
    policy, and auth audit foundations, but security notification runtime is
    not implementation-ready because event semantics, event constants,
    first-class targets, recipient/self-notification policy, redaction,
    authorized re-fetch paths, and manual auth-security approval are missing.
- Remaining Day 1 work:
  - Future OCR `ocr.completed` and `ocr.failed` events require server OCR
    worker/job source states and safe recipient/action policy first.
  - Remaining sync notification events such as queued, conflict resolved, retry
    behavior, conflict resolution behavior, mobile deep links/UI, and broad
    offline-sync expansion remain future work.
  - Auth/session/security notification runtime remains blocked behind the
    manual auth-security source-policy and target-reference gates. Do not
    infer security notifications from profile display, current-user/session
    display, cached mobile session lists, local-only mode, generated-client
    availability, or generic auth audit rows without reviewed event semantics.
  - Item claim/split/creator-review notification coverage remains blocked on
    source claim runtime and #349/#350 money/Figma/manual gate posture unless
    separately approved in the repo.
  - Future settlement debtor notification after receiver residual decisions
    and broader settlement mismatch/review event coverage remain separate
    source-state/policy work.
  - Push/email provider delivery, provider workers, digests, delivery receipts,
    background delivery, admin/global policy, Day 1 notification acceptance,
    production readiness, release readiness, manual UI retest, and manual code
    review are not completed by #626, #630, #636, #639, #642, #643, #644,
    #645, #647, #649, or #650.
- Future gates requiring explicit approval:
  - #371 notification-open/deep-link scope is closed after PR #664 and should
    not be redone.
  - Auth/session/security source-policy, target-reference design, and manual
    auth-security approval before security-impactful notifications.
  - OpenAPI/generated-client/schema/runtime work only for exact implemented
    event types with reviewed source states and safe targets.
- Close/keep-open recommendation:
  - Do not close #369 or mark it `100`. PR #626/#570 is one completed child
    runtime slice, PR #630/#629 is one internal foundation slice, PR #636/#633
    is one architecture slice, PR #639/#638 is one provider-neutral
    persistence/service foundation slice, PR #642/#641 is one provider-neutral
    worker/outbox foundation slice, PR #644 closed #633 for delivery-state
    persistence/worker foundation, PR #645/#632 is one disabled-by-default SMTP
    runtime foundation slice, PR #647/#649/#650 are #634 push-token lifecycle
    design/protection/API-foundation checkpoints, and
    `feature/sync-operation-failed-notification-369-20260702` is one narrow
    `sync.operation_failed` implementation slice, and
    `feature/settlement-residual-review-needed-notification-369-20260702` is
    one narrow settlement residual-review implementation slice, and
    `docs/auth-session-security-notification-source-policy-369-20260702` is
    one auth/session/security docs/control gate. None of these is full Day 1
    notification event-family acceptance.
- Last verified repo/report references:
  - `docs/architecture/DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`
  - `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
  - Issue #369 PR #626 progress comment:
    `https://github.com/tommytang213/Settleora/issues/369#issuecomment-4844221960`
  - Branch report:
    `/workspace/logs/settleora-codex-report-20260702-0112-sync-operation-failed-notification-369.md`

### Issue #403 - Day 1 email, push, provider, preference, delivery-state split

- GitHub state/project status: issue `OPEN`; Project status
  `Needs Figma / Reference`, `Progress %` `80`, `Man-days Remaining` `1`,
  `Figma Required` `Yes`, `Manual Gate` `Yes` by GraphQL readback on
  2026-06-30 after PR #630. GitHub issue remains `OPEN` and Project status
  remains `Needs Figma / Reference` by readback on 2026-07-01 after PR #650.
- Last verified at main SHA:
  `1983832614394ed0dd8c8c6d4aab63e512e42b4b`.
- Completed docs/control child slices now recorded:
  - #448 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #493 merged on 2026-06-24. It
    completed the notification event taxonomy and in-app baseline coverage
    control slice only.
  - #449 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #494 merged on 2026-06-24. It
    completed SMTP email provider policy docs/control only.
  - #450 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #495 merged on 2026-06-24. It
    completed mobile push provider abstraction and device-token lifecycle
    policy docs/control only.
  - #451 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #496 merged on 2026-06-24. It
    completed admin/user notification preference resolution model
    docs/control only.
  - #452 is `CLOSED`; Project row was stale before this checkpoint and has now
    been updated to Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, `Actual Done Date` `2026-06-28`, and
    `Blocking Gate` `None`. The issue comment says it closed the
    UX/reference gate only through repo-tracked Day 1 UX/reference decisions
    and existing domain references.
- Completed adjacent design/runtime slices that must not be redone:
  - #634 / PR #647 completed the A1 push token lifecycle
    architecture/contract design checkpoint. PR #649 completed the A2
    token-protection design checkpoint. PR #650 completed only the A2
    server-side token lifecycle API foundation: additive `push_device_tokens`
    persistence, push-specific protected token storage and HMAC fingerprint
    boundaries, authenticated current-user token register/revoke endpoints,
    OpenAPI updates, regenerated web/Dart clients, safe lifecycle metadata
    responses only, fail-closed missing fingerprint config behavior, and no
    provider dependency. #634 remains open/Blocked; PR #650 did not implement
    mobile code, APNs/FCM provider runtime or sending, provider secrets, hosted
    activation, admin/readout, #371 deep links, or provider payload behavior.
    Branch `feature/push-a3-provider-runtime-634-option-a-20260701` adds the
    A3 Option A internal provider-neutral push runtime foundation:
    disabled/unconfigured default provider, safe payload builder,
    `mobile_push` outbox processing integration, no-active-token handling, and
    protected token unprotect only inside the push send boundary. It still does
    not implement real APNs/FCM sending, provider secrets, hosted activation,
    mobile UI, admin/readout, #371 deep links, or full #403 completion.
  - #632 / PR #645 completed only the approved Option A disabled-by-default
    SMTP runtime foundation: internal SMTP adapter boundary, safe
    disabled/unconfigured outcomes, #629/#638/#641 integration through
    approved delivery-attempt/outbox boundaries, generic privacy-safe
    templates, bounded redacted provider-result categories, no fake `sent` or
    `delivered` success, no real network dependency in tests, and no source
    business mutation. It did not add recipient email-address source/policy,
    hosted runtime activation, production deployment/env/secrets setup,
    admin/global policy/readout, push/device-token runtime, OpenAPI/readout,
    UI, deep links, auth/session/security notification behavior, email
    digests/bulk campaigns/marketing, or money/source-business authority.
  - #641 / PR #642 completed only the provider-neutral
    worker/outbox processing foundation over `notification_delivery_attempts`:
    internal lease service and outbox processor boundaries, lease metadata,
    retry/backoff handling, idempotent safe no-op behavior, bounded
    pre-provider state transitions, and focused tests. It did not add hosted
    runtime activation, SMTP runtime, push runtime, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, or deep links.
  - #638 / PR #639 completed only the provider-neutral
    `NotificationDeliveryAttempt` persistence/service foundation for eligible
    external-channel decisions. It did not add worker/outbox processing, SMTP
    runtime, push runtime, provider adapters, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, or deep links.
  - #633 is closed for its own provider-neutral delivery-state
    persistence/worker foundation after PR #636 architecture/design, PR
    #639/#638 persistence/service foundation, PR #642/#641 worker/outbox
    foundation, PR #643 ledger checkpoint, and PR #644 closure. It did not
    implement hosted provider runtime activation, push runtime/device-token
    storage, admin/global policy, external delivery-state API/readout,
    OpenAPI/generated-client exposure, UI/deep links, provider secrets,
    deployment, recipient-email source/policy, or remaining event-family
    source-state work.
  - #629 / PR #630 completed only the internal notification
    decision-envelope foundation: provider-free resolver, bounded
    `in_app`/`email`/`mobile_push` channel vocabulary, bounded decision/reason
    vocabulary, decision-only external-channel outcomes, in-app baseline
    eligibility behavior, and focused resolver tests.
  - #570 / PR #626 completed only the narrow `ocr.needs_review` in-app
    notification runtime for explicit API-owned OCR review assignment
    creation/retarget transitions.
  - #571 / PR #572 completed only the narrow persisted
    `sync.conflict_detected` runtime for newly persisted sync conflict rows.
  - Earlier #369 child slices completed current bill workflow/revision,
    settlement request/payment/proof, recurring due-soon, recurring
    draft-generated, current-user in-app notification APIs, and current-user
    notification preference persistence boundaries where documented in
    `DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`.
- Remaining Day 1 provider/preference/delivery-state work:
  - SMTP/email runtime foundation is complete only for disabled-by-default
    internal SMTP sending behind server/operator configuration. Actual
    recipient email-address source/policy, hosted runtime activation,
    production deployment/env/secrets setup, admin/readout, OpenAPI/readout,
    UI/configuration surfaces, digests/bulk emails, and security-sensitive
    notification behavior remain separate gated work.
  - Mobile push provider runtime is partially implemented only as #634 A3
    Option A disabled/unconfigured provider-neutral foundation. #634 A2 covers
    the server-side token lifecycle foundation. Remaining push follow-ups must
    still cover real APNs/FCM provider adapters, provider secrets/account
    setup, hosted activation, OS permission/mobile registration UX, stale-token
    cleanup from real provider feedback, multi-device provider behavior,
    admin/readout, and #371 deep links. This remains manual-gated for
    provider/secrets, mobile release configuration, deployment/env,
    auth/security-sensitive behavior, and UI/Figma.
  - Server-side notification preference resolution is not implemented beyond
    current persisted current-user preference readouts and the internal #629
    decision-envelope foundation. Future work must implement admin/global caps,
    group/thread mute, channel capability checks, provider/device readiness,
    required/security-event bypass policy, and runtime wiring before provider
    delivery.
  - Hosted worker runtime activation is not implemented. PR #642 added only
    provider-neutral internal lease/outbox service boundaries and processing
    rules, without a hosted background service, scheduler, queue consumer,
    RabbitMQ consumer, cron, endpoint, notification-writer hook, provider
    adapter, push sending, device-token API/storage, deployment, environment,
    or secret behavior. PR #645 added only the disabled-by-default SMTP
    adapter foundation and did not activate hosted delivery. Current in-app
    unread/read/archive state is separate and must not be treated as provider
    delivery truth.
  - #632 closure does not complete #403. It closes only the
    disabled-by-default SMTP runtime foundation sub-scope; push/device-token
    runtime (#634), admin/global policy/readout (#635), #371 deep links/mobile
    UI, hosted runtime activation, recipient-email source/policy,
    OpenAPI/readout, and remaining notification work stay open/gated.
  - #634 A2/A3 Option A do not complete #403. They complete only the
    server-side token lifecycle foundation and disabled/unconfigured
    provider-neutral push runtime foundation; real APNs/FCM providers, A4
    mobile/Figma, APNs/FCM secrets/provider account setup, hosted activation,
    admin/readout, future route-family extensions after closed #371, and
    remaining notification work stay open/gated.
  - Any external delivery-state API/readout requires a separate
    OpenAPI/generated-client gate.
  - Admin/global notification policy APIs and admin UI are not implemented.
  - Notification deep-link/mobile UI implementation for current supported
    families is complete and #371 is closed after PR #664. Future route-family
    extensions remain separately gated if new event families need mobile
    handling.
  - Real push provider adapters, admin/global policy, mobile registration/UI,
    deep-link, hosted activation, recipient-email source/policy, and provider
    runtime expansion work remains separate and gated.
- Future gates requiring explicit approval:
  - Provider/secrets/deployment/env/mobile release gates for SMTP expansion
    and push.
  - OpenAPI/generated-client and schema/migration gates for any contract,
    delivery-state, device-token, admin-policy, or preference-runtime storage
    changes.
  - Auth/session/security manual policy gate before security-impactful
    notification runtime or bypass behavior.
  - #371 mobile/deep-link implementation and any UI-sensitive work.
  - Source-state gates for OCR completed/failed, item claim/split,
    settlement mismatch/residual/review, and remaining sync event families.
- Close/keep-open recommendation:
  - Keep #403 open as a parent/split tracker. The original docs/control
    children #448-#452, the internal #629 foundation, the #633 delivery-state
    persistence/worker foundation, the #632 disabled-by-default SMTP
    foundation, the #634 A2 server-side push token lifecycle API foundation,
    and #634 A3 Option A disabled/unconfigured push runtime foundation are
    complete, but real push provider adapters, hosted runtime activation,
    mobile integration/UI, recipient-email source/policy, server-side
    preference resolution beyond the foundation, admin policy, and #371
    implementation remain separate work and should be split into focused
    implementation issues before runtime expansion starts.
- Current #635 readout checkpoint:
  - Branch `docs/notification-635-admin-global-policy-readout-20260703`
    adds `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md` and links it
    from the architecture index.
  - It defines only the admin/global notification policy design and readout
    gate. It does not complete #403, #635, #634, #369, or #368.
  - Future #403/#635 work still needs separate manual admin/security,
    schema/migration, OpenAPI/generated-client, provider/secrets/deployment,
    audit, and UI/Figma gates before runtime or admin exposure work.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md`
  - `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md`
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`
  - `docs/planning/DAY1_UX_REFERENCE_DECISIONS.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2228-notification-day1-provider-remaining-gates-split-403-369.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2331-notification-decision-envelope-foundation-629-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-0107-notification-delivery-state-worker-architecture-633-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1755-push-device-token-runtime-decision-packet-634.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1802-push-token-lifecycle-architecture-contract-634-a1.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1920-push-token-protection-design-634-a2-option-c.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1951-push-token-a2-api-foundation-634-option-a.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-2032-push-token-a2-api-foundation-634-pr-merge.md`

### Issue #635 - Admin global notification policy API and readout

- GitHub state/project status: issue `OPEN` by live issue readback on
  2026-07-03 HKT during branch
  `docs/notification-635-child-issue-breakdown-20260703`. Project field
  mutation was not attempted.
- Last verified at main SHA:
  `573801c447d2b4bd2eccb84a7f5713235190d87d` after PR #683.
- Completed PRs/slices:
  - PR #683, merge SHA
    `573801c447d2b4bd2eccb84a7f5713235190d87d`: merged the
    admin/global notification policy docs/control readout.
- Completed docs/control scope:
  - Adds `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`.
  - Updates `docs/architecture/README.md`.
  - Updates this ledger.
  - Defines admin/global policy as the deployment/admin cap over in-app, email,
    and mobile push channels.
  - Preserves in-app as the Day 1 baseline where an event is supported,
    eligible, authorized, and safe.
  - Records that email and push are optional attempts only when admin/provider
    policy, provider readiness, content safety, and user preference allow them.
  - Records that user and group preferences cannot widen admin/global policy.
  - Defines provider readiness and delivery/readout states such as
    `unsupported`, `unconfigured`, `disabled`, `muted`, `deferred`, `queued`,
    `sent`, and `failed`, and keeps `delivered` unavailable without future
    provider receipt semantics.
  - Defines precedence: event eligibility and content safety; admin/provider
    cap; explicit security/required/money policy; user preference; group mute;
    quiet-hours/digest; device/platform/provider availability.
  - Defines admin/owner authorization and audit requirements for future
    policy reads/updates, including redaction boundaries for provider secrets,
    device tokens, auth/session details, raw OCR/receipt text, storage
    internals, payment details, private notes, and hidden bill details.
  - Defines product-facing admin/user/mobile/web readout behavior without
    exposing backend/provider internals or implying delivery success.
  - Recommends future child tasks for policy model/schema/API, OpenAPI and
    generated clients, admin/user readout references, provider readiness
    integration, audit tests, and final acceptance.
- Child issues created/reused on 2026-07-03 HKT:
  - #684 `Admin notification policy schema and API design`:
    `https://github.com/tommytang213/Settleora/issues/684`.
  - #685 `Admin and user notification policy readout UX reference`:
    `https://github.com/tommytang213/Settleora/issues/685`.
  - #686 `Notification provider readiness integration policy`:
    `https://github.com/tommytang213/Settleora/issues/686`.
  - #687 `Notification policy resolution runtime wiring`:
    `https://github.com/tommytang213/Settleora/issues/687`.
  - #688 `Notification policy audit and redaction coverage`:
    `https://github.com/tommytang213/Settleora/issues/688`.
  - #689 `Admin notification policy final acceptance`:
    `https://github.com/tommytang213/Settleora/issues/689`.
- Remaining Day 1 work:
  - Policy schema/API implementation.
  - OpenAPI/generated-client contracts.
  - Admin/user/mobile/web readout UI references and implementation.
  - Provider readiness integration and real provider activation gates.
  - Audit/redaction tests and authorization tests.
  - Final #635 acceptance after runtime work.
- Future gates requiring explicit approval:
  - Manual admin/security approval for reads/mutations and
    security/money-critical bypass behavior.
  - Schema/migration gate.
  - OpenAPI/generated-client gate.
  - Provider/secrets/deployment gate for SMTP/APNs/FCM or hosted activation.
  - UI/Figma gate for admin/user/mobile/web readouts.
  - Audit/security gate for policy-change logging and redaction.
- Non-goals confirmed for this branch:
  - No runtime API, schema, migration, OpenAPI, generated-client, provider
    sending, SMTP/APNs/FCM secrets, admin web exposure, mobile permission UX,
    auth/session/security runtime, money/settlement/storage/OCR/sync behavior,
    #371 deep-link behavior, deployment/env/CI, Figma output, screenshots, or
    binary assets.
- Close/keep-open recommendation:
  - Keep #635 open. This branch makes later implementation ready to split, but
    it does not implement the policy API or readout.
  - Runtime remains blocked until the relevant #635 child gates clear.
  - Keep #368, #369, #403, and #634 open.
  - Keep #371, #570, #575, #672, and #679 closed unless a separate concrete
    regression or approved follow-up scope is filed.
- Last verified repo/report references:
  - `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`
  - `docs/architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md`
  - `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md`
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `.codex/reports/settleora-codex-report-20260703-2215-notification-635-admin-global-policy-readout.md`
  - `.codex/reports/settleora-codex-report-20260703-2225-notification-635-admin-global-policy-readout-pr-merge.md`

- #684 schema/API design gate checkpoint on
  `docs/notification-684-schema-api-design-gate-20260703`:
  - Base main SHA:
    `1a7798dadfc9b8dd0395de603e3062131b600fc1` after PR #690.
  - Adds
    `docs/architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md` and
    links it from `docs/architecture/README.md`.
  - Defines future persistence concepts only, including a
    `notification_global_policy` policy root,
    `notification_event_policy_overrides`, and bounded policy audit metadata.
    These are design-level names only, not approved EF entities, table names,
    migration names, OpenAPI schema names, or generated-client contracts.
  - Defines the future API/domain service boundary: API owns policy reads,
    writes, validation, authorization, resolver composition, and product-facing
    readouts; user/group preferences can narrow policy only; provider
    readiness cannot be invented by preferences or device state.
  - Designs future OpenAPI endpoint families without editing OpenAPI:
    `GET /api/v1/admin/notification-policy`,
    `PUT/PATCH /api/v1/admin/notification-policy`,
    `GET /api/v1/notification-policy/readout`, and an optional bounded
    provider-readiness readout endpoint with no secret configuration exposure.
  - Records owner/admin mutation requirements, current-user readout boundaries,
    audit events for reads/writes where appropriate, and redaction rules for
    SMTP/APNs/FCM secrets, provider payloads, raw device tokens, raw
    OCR/receipt text, storage internals, payment details, private notes,
    hidden bill data, and auth/session secret material.
  - Records future migration/rollout safety: explicit EF migrations only, no
    production startup auto-migration, in-app baseline enabled where supported,
    external channels disabled/unconfigured until configured, no silent
    widening of delivery, no fake provider success, and self-hosted
    TrueNAS/Docker-compatible degrade behavior.
  - Records the future test plan and implementation split: schema/API
    implementation behind manual/admin/security/schema/OpenAPI gates, then
    OpenAPI/generated clients, resolver/runtime wiring, #685 UI readout gate,
    #686 provider readiness integration, #688 audit/redaction coverage, and
    #689 final acceptance.
  - #684 should remain open pending design review/PR merge and later
    implementation. #635 remains open. Runtime remains blocked.
  - This docs/design branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, provider sending, provider secrets,
    auth/session/security runtime, money/settlement/storage/OCR/sync behavior,
    notification constants/writers, #371 notification-open behavior,
    deployment/env/CI, Figma output, screenshots, binary assets, or issue
    closure.

- #686 provider-readiness policy gate checkpoint on
  `docs/notification-686-provider-readiness-policy-gate-20260703`:
  - Base main SHA:
    `a857a6368b367f5914c49be7740e8057c81402e9` after PR #691.
  - Adds
    `docs/architecture/NOTIFICATION_PROVIDER_READINESS_POLICY.md` and links it
    from `docs/architecture/README.md`.
  - Defines provider readiness as a bounded signal into admin/global
    notification policy, not delivery success and not authority for event
    creation, recipient authorization, money truth, storage access, OCR
    acceptance, sync acceptance, auth/session state, or audit truth.
  - Defines design-level readiness states: `unsupported`, `disabled`,
    `unconfigured`, `configured`, `degraded`, `failing`, `rate_limited`,
    `maintenance`, `unknown`, and `ready`. Only `ready` permits a normal
    external attempt by default; `configured` is not enough by itself to claim
    attempts are allowed.
  - Records SMTP/email, APNs/iOS push, FCM/Android push, and in-app baseline
    boundaries. In-app is not an external provider-readiness state and remains
    the Day 1 baseline where an event is supported, eligible, authorized, and
    safe.
  - Inserts provider readiness into the future #635/#684 resolver after
    event support/content safety and admin/global channel caps, and before
    security/money external redaction policy, user preference, group mute,
    quiet-hours/digest, and device/platform availability.
  - Records source-of-truth boundaries: API/domain owns effective policy
    resolution; provider config/secrets are never exposed through policy
    readout; deployment/operator config may determine configured/unconfigured
    state without leaking values; user preferences, group mute, quiet-hours,
    device state, generated clients, browser cache, and mobile cache cannot
    invent provider readiness.
  - Defines product-facing and operator-facing readout semantics for
    unsupported, disabled, unconfigured, degraded, failing, deferred, queued,
    sent/attempted, and failed states without exposing secrets, tokens,
    private hostnames where sensitive, provider payloads, credentials, raw
    provider errors, payment details, OCR text, storage internals,
    auth/session data, or hidden bill data.
  - Defines future failure/retry posture for transient failure, permanent
    failure, rate limits, invalid recipient/device token, provider
    unavailable, queued/deferred attempts, idempotency/readout expectations,
    and audit-safe error categories.
  - Records self-hosted posture: external providers default to disabled or
    unconfigured until intentionally configured; missing external providers do
    not fail startup by themselves; TrueNAS/Docker-friendly warnings/readouts
    stay product-facing and non-secret; hosted activation and real provider
    secrets remain manual/deployment gates.
  - Recommends future split ordering: readiness config/readout design
    acceptance, secret/config-loading design if needed, SMTP readiness/readout
    adapter without sending, APNs/FCM readiness/readout adapter tied to #634
    without token handling unless #634 approves it, policy resolver
    integration through #687, audit/redaction through #688, and final
    acceptance through #689.
  - Records future test plan for provider state mapping, blocking
    unconfigured providers, admin disabled cap precedence, preference/group/
    quiet-hours narrowing only, device-state narrowing only, cache/generated
    client non-authority, secret/token redaction, safe failure
    classification, in-app baseline preservation, and unchanged #371 behavior.
  - #686 remains open pending design review/PR merge and later implementation
    acceptance unless the close rule is clearly satisfied. #635 and #634
    remain open. Runtime remains blocked. Keep #371 closed.
  - This docs/design branch does not implement SMTP/APNs/FCM runtime, provider
    SDKs, device-token handling, secrets/config files, deployment/env/CI,
    mobile release/signing, API runtime, schema/migrations, OpenAPI/generated
    clients, admin UI, mobile UI, notification constants/writers/provider
    delivery, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes, Figma
    output, screenshots, binary assets, or issue closure.

- #685 notification policy readout UX reference checkpoint on
  `docs/notification-685-policy-readout-ux-reference-20260704`:
  - Base main SHA:
    `d1c37256da4b416964c1b1afef58a9ee8806b96a` after PR #692.
  - Adds
    `docs/design/notifications/NOTIFICATION_POLICY_READOUT_UX_REFERENCE.md`,
    adds `docs/design/notifications/README.md`, and links the notification
    design folder from `docs/design/README.md`.
  - Defines this packet as a non-authorizing UX/reference gate only. It does
    not approve runtime API, schema/migrations, OpenAPI/generated clients,
    admin/user/mobile/web UI implementation, provider sending, provider
    secrets, device-token handling, deployment, CI, or Figma API output.
  - Covers admin/operator global policy readouts, user settings readouts,
    mobile notification settings/readouts, user web settings/readouts,
    notification detail/error/explanation surfaces, and empty/degraded/
    disabled states.
  - Defines product-facing matrix guidance for `unsupported`, `disabled`,
    `unconfigured`, `configured`, `ready`, `degraded`, `failing`,
    `rate_limited`, `maintenance`, `unknown`, `muted`,
    `quiet_hours_deferred`, `digest_deferred`, `device_unavailable`,
    `token_missing`, `queued`, `sent_or_attempted`, `failed_transient`,
    `failed_permanent`, `blocked_by_admin_policy`,
    `blocked_by_security_policy`, `blocked_by_privacy_policy`,
    `blocked_by_user_preference`, and `blocked_by_group_preference`.
  - Records copy rules: no raw enum strings as primary UI copy, no raw provider
    failure codes in user copy, no normal-user "backend/client/server" debug
    wording except self-hosted "this server" product copy where appropriate,
    action-specific button labels, non-blaming unavailable states, in-app
    fallback where eligible, and no implied external delivery success without
    provider confirmation.
  - Records redaction boundaries for SMTP/APNs/FCM secrets, private hostnames
    where sensitive, raw device tokens, protected token blobs, provider
    payloads/errors, rendered external bodies when unauthorized, payment
    details, OCR/receipt text, storage internals, auth/session data, hidden
    bill data, private notes, and unrelated recipient/user data.
  - Defines admin versus normal-user distinction: admins may see bounded
    non-secret readiness/policy categories and setup/review actions; users see
    effective availability and preference actions only where allowed.
  - Defines reference-only mobile/web/admin layout guidance and accessibility
    expectations compatible with Settleora V1 mobile, user-web, and admin-web
    references.
  - Recommends future split ordering: manual review, optional Figma/reference,
    API/readout contract from #684, provider readiness readout from #686,
    separate UI implementation slices, accessibility/copy review, #688
    audit/redaction cross-check, and #689 final acceptance.
  - #685 remains open pending review/PR merge and future UI/reference
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684 and #686 remain open. Runtime remains blocked. Keep #371 closed.
  - This docs/design branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, user web UI, mobile UI, provider
    sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, or issue
    closure.

- #688 audit/redaction coverage gate checkpoint on
  `docs/notification-688-audit-redaction-coverage-gate-20260704`:
  - Base main SHA:
    `2649f0cacefbb26d223f0fcf9e97834a97ffef1c` after PR #693.
  - Adds
    `docs/architecture/NOTIFICATION_POLICY_AUDIT_REDACTION_COVERAGE.md` and
    links it from `docs/architecture/README.md`.
  - Defines this packet as a non-authorizing docs/security/control coverage
    gate for future audit/redaction requirements only. It does not authorize
    runtime API, schema/migrations, OpenAPI/generated clients, provider
    sending, secrets, device-token handling, admin/mobile/user-web UI,
    deployment, CI, production audit plumbing, notification constants/writers,
    or #371 behavior.
  - Covers future admin/global policy reads and mutations, current-user
    effective policy readouts, provider-readiness readouts, degraded/failing/
    maintenance/rate-limited readouts, resolver decisions, later delivery
    attempt result categories, notification detail explanations,
    admin/operator diagnostics, logs, metrics, reports, CI artifacts, issue
    comments, screenshots, and test fixtures.
  - Records design-level safe category candidates such as `policy_read`,
    `policy_updated`, `policy_denied`, provider readiness categories,
    delivery deferred/queued/attempted/failure categories, admin/security/
    privacy/user/group preference block categories, `token_missing`, and
    `device_unavailable`.
  - Defines a forbidden-data matrix covering SMTP/API/app passwords, APNs/FCM
    credentials, private keys/certificates/team IDs where sensitive, raw or
    reversible device tokens, provider payloads and raw provider errors,
    unauthorized rendered external bodies, auth/session secrets, raw
    OCR/receipt text/images/storage keys, storage internals, payment details,
    private notes, hidden bill/settlement details, unauthorized recipient
    lists, private hostnames/ports where sensitive, and unrelated user data.
  - Defines future redaction/normalization requirements: non-reversible
    identifiers, short purpose-bound token fingerprints only if approved, safe
    provider error categories, URL/host classification before display,
    category/state/action event payload reduction, explicit allow-listing for
    money/security/OCR/storage/auth/payment fields, admin readout redaction,
    and debug-mode redaction by default.
  - Records authorization expectations for owner/admin policy mutation audit,
    admin/operator read authorization, current-user effective-state readouts,
    denial auditing without existence leakage, and the rule that policy audit
    does not replace money/settlement/bill/OCR/sync/storage/auth/security
    source-domain audit.
  - Defines conceptual audit fields only: opaque actor/admin ID, action
    category, policy ID/version if approved, channel/event-family category,
    safe readiness category, decision category, timestamp, request correlation
    ID, redaction policy version, and result category. Raw payload storage is
    forbidden.
  - Records future test plan for redaction helpers, policy read/update audit,
    forbidden-field absence in admin/user readouts, provider-readiness
    redaction, resolver categories, UI copy snapshots if surfaces exist,
    negative raw OCR/storage/payment/auth/session tests, log/audit fixture
    tests, OpenAPI/generated-client contract tests when contracts exist, and
    #371 regression preservation.
  - Records self-hosted posture: Docker/TrueNAS logs safe by default, debug mode
    cannot dump secrets/raw provider payloads without a future explicit
    local-only diagnostic gate, provider unconfigured/disabled/degraded/failing
    states use safe categories, and missing external provider config is a
    readout category rather than a fatal startup condition by itself.
  - Recommends future sequence: manual/security review, redaction helper/design
    implementation if approved, audit event schema/API after #684, provider
    readiness redaction tests after #686, UX/readout snapshots after #685
    surfaces exist, resolver audit hooks after #687, and final acceptance
    through #689.
  - #688 should remain open pending review/PR merge and future implementation
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684 and #686 remain open unless separately satisfied. #685 is closed and
    should not be reopened without a concrete reference regression. Runtime
    remains blocked. Keep #371 closed.
  - This docs/security branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, user web UI, mobile UI, provider
    sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, production
    audit plumbing, or issue closure.

### Issue #458 - User web auth/session shell and navigation foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #580, merge SHA `c83001caea4835b9fe2c8de0d1056484a0f09b2f`:
    implemented the user-web React/Vite auth/session shell, responsive
    navigation, auth-required/session boundary seam, safe placeholder route
    states, and visual evidence. It did not add fake login success, token
    persistence, auth runtime changes, OpenAPI changes, or generated-client
    edits.
- Completed scope:
  - Auth/session shell and navigation foundation for user web.
  - Session-required/expired presentation and generated-client boundary seam.
  - Modern rounded Settleora web shell direction recorded through PR evidence.
- Remaining Day 1 work:
  - Feature-complete bills, groups, friends/direct sharing, settlements,
    notifications, reports, import/export, backup, profile/payment, and
    account/security screens were explicitly future slices under later issues.
  - Real web auth credential wiring remains a future reviewed auth/security
    task.
- Future gates requiring explicit approval:
  - Auth/session/security runtime, token persistence, credential storage, or
    account/security settings.
  - OpenAPI/generated-client changes.
  - Figma/human UI approval for new production user-web screens.
- Blockers/manual decisions:
  - None for the completed #458 foundation slice.
  - Future auth/security runtime remains manual-gated.
- Close/keep-open recommendation:
  - Safe to keep closed as the #458 foundation slice is complete.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1815-user-web-auth-session-shell-nav-458.md`
  - Issue completion comment:
    `https://github.com/tommytang213/Settleora/issues/458#issuecomment-4825978404`

### Issue #459 - User web bills, groups, friends, and direct-sharing flows

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #581, merge SHA `d4b046cc53c120b1bf1d8a2691b3e6e7e1dbfc97`:
    merged `docs/planning/USER_WEB_BILLS_GROUPS_FRIENDS_IMPLEMENTATION_PLAN.md`.
  - PR #582, merge SHA `03560c687221b41c75195ba93cc2c1f593f206be`:
    added read-only personal bills readout.
  - PR #583, merge SHA `a2f85aa0d49fd003d76db85de8bbdff2c12eb69a`:
    added groups and friends readout surfaces.
  - PR #584, merge SHA `a4bbcd4f07fcadbb8b7b834c4680af3c41977cfa`:
    added group bills readout.
- Completed scope:
  - Planning gate for bills/groups/friends/direct-sharing flows.
  - Read-only user-web bills, groups/friends, and group-bills readout slices
    using existing generated-client boundaries.
- Remaining Day 1 work:
  - Full bill create/edit/lifecycle UI, receipt/file attachment handoffs, bill
    revision review, bill correction proposal/edit, friends/direct-sharing
    contract/runtime, and temporary participant claim/link contract/runtime
    remain follow-up slices where not already covered elsewhere.
- Future gates requiring explicit approval:
  - Money/split/rounding authority changes.
  - Storage/file privacy or attachment byte behavior.
  - Friends/direct-sharing API/OpenAPI/generated-client work.
  - Figma/human UI approval for production interaction depth.
- Blockers/manual decisions:
  - Future runtime slices must keep API/domain authority for authorization,
    money, storage, status transitions, and audit.
- Close/keep-open recommendation:
  - Safe to keep closed as the original planning gate and readout follow-ups
    have merged. Do not treat closure as completion of every future bill,
    group, friend, direct-share, file, or temporary-participant runtime slice.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1948-user-web-bills-groups-friends-plan-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2105-user-web-bills-readout-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2134-user-web-groups-friends-readout-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2207-user-web-group-bills-readout-459.md`
  - Issue completion comment:
    `https://github.com/tommytang213/Settleora/issues/459#issuecomment-4826032800`

### Issue #460 - User web settlement, notifications, profile, and payment-details flows

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #585, merge SHA `60bd9c3f51921692fe0a904d8139c865d8abd33e`:
    added read-only settlements readout.
  - PR #586, merge SHA `41082a5fa2653922f653704743b89dc975abe665`:
    added profile payment details readout.
  - PR #587, merge SHA `c40d4b314626d59e931f39836dd34956c0af53ac`:
    added settlement counterparty payment details readout.
  - PR #588, merge SHA `6e47bba2ffc4b0f8495eb8b5721f70ce77836f39`:
    added notifications readout.
  - PR #589, merge SHA `fc5a3c827fa4419caca1e7ff5af2d91cd45cd566`:
    added notification preferences readout.
  - PR #590, merge SHA `8249760740f90369ecff033438e82bfd50ac06a1`:
    added settlement proof metadata readout.
- Completed scope:
  - Settlement, profile/payment details, counterparty payment details,
    notifications, notification preferences, and settlement proof metadata
    readout surfaces for user web.
  - Privacy/visibility and unsupported-state messaging around payment details,
    QR/proof/file metadata, notification delivery, and user preference
    persistence boundaries.
- Remaining Day 1 work:
  - Full settlement action UI, proof upload/download byte flows, profile/payment
    edit/upload flows, channel delivery runtime, push/email provider behavior,
    and server-side notification suppression/filtering remain separate unless
    a later merged PR verifies them.
- Future gates requiring explicit approval:
  - Storage/file-byte behavior for proof or QR uploads/downloads.
  - Money/settlement/payment calculation or state-transition authority.
  - Auth/security, OpenAPI/generated-client, notification provider, push/email,
    or privacy policy changes.
  - Figma/human UI approval for production settlement and settings flows.
- Blockers/manual decisions:
  - Future mutations must preserve API/domain authority and payment-details
    visibility rules. No global payment directory is approved.
- Close/keep-open recommendation:
  - Safe to keep closed for the merged readout/checkpoint scope. Do not treat
    closure as approval for future payment/provider/storage/settlement mutation
    work.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-2245-user-web-settlements-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260628-2320-user-web-profile-payment-details-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0004-user-web-settlement-counterparty-payment-details-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0030-user-web-notifications-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0126-user-web-notification-preferences-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0150-user-web-settlement-proof-metadata-readout-460.md`

### Issue #461 - User web reports, search, export, import, and local-mode surfaces

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #591, merge SHA `4a7634d764d3c9eab89d773447980ff058e8803d`:
    user-web reports/search readout.
  - PR #592, merge SHA `86cc3bb9c939c0c312e56d3d48001fe2b37a911e`:
    export/import/local-mode surface plan.
  - PR #593, merge SHA `e6705a8041a1af4cd20d3b151d8217e873141dc1`:
    import/export availability readout.
  - PR #594, merge SHA `b381cbcd4136c65724e568a687109e64e72a1d0b`:
    export readiness contract plan.
  - PR #595, merge SHA `266a8e6fae354226280a901aca553ed47990718a`:
    bill export readiness contract.
  - PR #596, merge SHA `dd2af800b22b426cf6c2effe354b309e2def9a48`:
    readiness-gated export runtime.
  - PR #597, merge SHA `24d7773681ace08ca4386166882c8a4a2e4e1014`:
    group export runtime.
  - PR #598, merge SHA `0bf17a0024b2473651776bec723d84756117bfea`:
    import preflight/review plan.
  - PR #599, merge SHA `193475031c5d55af69a90c663734e6381cfd8ed8`:
    bill CSV import preflight contract.
  - PR #600, merge SHA `97914fee91f44254a9811f718e10b11e0c5ad6ac`:
    import preflight review runtime.
  - PR #601, merge SHA `c43042909a33852352f32537cc1722a615630cdd`:
    import confirmation contract plan.
  - PR #602, merge SHA `8c98ef88fceefd2b8616c40bf240ce11abd6cea6`:
    bill CSV import confirmation sessions.
  - PR #603, merge SHA `d240e929eaad9cb65bb6111a215795b0e530b19a`:
    import confirmation runtime.
  - PR #604, merge SHA `9561aafe360a340ad25e97539afed37f3c1f6ea2`:
    sync/local status surface plan.
  - PR #605, merge SHA `a4a27ba451b54b181a4e84d6935dc74ac23c03a8`:
    sync/local status contract plan.
  - PR #606, merge SHA `2e72d0e937bc12a32836297aa86b195e987a5b6e`:
    sync/local status read contract.
  - PR #607, merge SHA `5a9c7a6c2cb12ea76ec849fd67cc0a74f0037445`:
    sync/local status readout.
  - PR #608, merge SHA `f0bc262207b29de7a1c87cec9ec58a0fc90b5020`:
    local backup/restore surface plan.
  - PR #609, merge SHA `ab77f554b760a1410c9709a2e459f59b26dc5eb5`:
    local backup package contract plan.
  - PR #610, merge SHA `719af62f0154f53a1a6c0e578c91d9c49c74be75`:
    local backup package readiness contract.
  - PR #611, merge SHA `007170e5707654cf5f01fdf54324dc928f17d80c`:
    local backup package session plan.
  - PR #612, merge SHA `c1eaee71de53765b6a97cf86429d10ecbaa6dca2`:
    local backup package session contract.
  - PR #613, merge SHA `49926c547c03600499f437fa14c23cf28ef3327a`:
    local backup generation/download surface plan.
  - PR #614, merge SHA `6066eefed357f2592e1d60e7b983b9730d66c03a`:
    local backup package generation/download contract.
  - PR #617, merge SHA `a6564827c9c6d40f765a2dad9701ba3213bf06c3`:
    local backup package data artifact runtime.
  - PR #618, merge SHA `e8cc2d0f5379f4f2f7739780c7766e8d529df994`:
    user-web local backup package data download runtime.
  - PR #619, merge SHA `5a655c8028b424a59aac4ecbdf791a5eff177fb7`:
    local backup restore preview contract.
  - PR #620, merge SHA `1ab29e7795664af966cf0d5b69ce7cadc9e54934`:
    user-web local backup restore preview runtime.
  - PR #621, merge SHA `238d8eb143dfe7eb6d276ca2a722296f8164d680`:
    local backup restore confirmation contract plan.
  - PR #622, merge SHA `23346a2c9d71c8eb4a62342e1b4dd0ef6c276566`:
    local backup restore confirmation session contract.
  - PR #623, merge SHA `b0088732290cc6fe9fb907a6b668d89d368d6718`:
    user-web restore confirmation session runtime.
  - PR #624, merge SHA `66e997098e737e85cd1d64a999ff18d01b165d9c`:
    local backup personal bill candidate package/restore-preview slice.
- Completed scope:
  - Reports/search readout and import/export availability readouts.
  - Readiness-gated personal/group bill export runtime.
  - CSV import preflight, import confirmation sessions, and user-web import
    preflight/confirmation runtime.
  - Sync/local status read contract and readout.
  - Local backup package readiness, package sessions, generation/download
    metadata, data-only artifact runtime, user-web package download runtime,
    restore preview, restore confirmation sessions, and non-mutating personal
    bill candidate package/restore-preview coverage.
- Remaining Day 1 work:
  - Actual restore apply mutation remains unimplemented and not approved.
  - Durable/encrypted package storage remains separate.
  - File-byte package sections remain separate.
  - Package upload/storage remains separate.
  - Browser-local persistence/security design remains separate.
  - Full local-only authority-boundary persistence and local-to-server
    migration remain future-gated.
- Future gates requiring explicit approval:
  - Restore apply/mutation.
  - Storage/file-byte package sections, durable package storage, upload/storage,
    encryption/key-handling, or privacy/vault byte behavior.
  - Browser-local persistence using IndexedDB, localStorage, Cache Storage,
    service workers, object URLs, browser file-system APIs, or local queues.
  - OpenAPI/generated-client contract changes and API/domain authority changes.
- Blockers/manual decisions:
  - Human approval is required before treating #461 as proof that every Day 1
    reports/search/export/import/local-mode requirement is complete.
  - Future backup/restore mutation and browser-local authority decisions remain
    manual-gated.
- Close/keep-open recommendation:
  - Keep closed as current project status is `Merged`, but treat #461 as an
    umbrella/history checkpoint. Do not open duplicate work from stale issue
    text; create focused follow-up issues for the remaining gates above.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260629-1106-user-web-reports-search-readout-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1249-user-web-import-export-availability-readout-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1204-user-web-export-import-local-mode-plan-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1441-user-web-export-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1751-user-web-import-preflight-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-2011-user-web-import-confirmation-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-2220-user-web-sync-local-status-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260630-1828-user-web-local-backup-personal-bill-data-package-preview-461.md`
  - `.codex/reports/settleora-codex-report-20260630-1913-user-web-local-backup-personal-bill-data-package-preview-pr-merge.md`
  - Issue checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/461#issuecomment-4842928407`
