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

### Issue #369 - Complete Day 1 in-app notification event coverage

- GitHub state/project status: issue `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `60`, `Initial MD` `2`,
  `Man-days Remaining` `2`, `Figma Required` `Yes`, `Manual Gate` `Yes` by
  GraphQL readback on 2026-06-30.
- Parent epic readback: #368 is `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `33`, `Figma Required` `Yes`,
  `Manual Gate` `Yes`.
- Last verified at main SHA:
  `ecbabe1bfe432deb8b10617ac59395f338c05b0b`.
- Completed child slices now recorded:
  - PR #626 / #570 completed the narrow OCR `ocr.needs_review` runtime for
    explicit API-owned assignment creation/retarget transitions only.
  - Earlier merged #369/#367/#370 slices already cover recurring due-soon,
    notification preferences infrastructure, notification event coverage
    review, settlement notification coverage, bill workflow coverage, bill
    revision coverage, recurring draft-generated coverage, #568 OCR/sync target
    references, and #571 persisted sync-conflict-only runtime.
- Remaining Day 1 work:
  - Future OCR `ocr.completed` and `ocr.failed` events require server OCR
    worker/job source states and safe recipient/action policy first.
  - Remaining sync notification events such as operation failed, queued,
    conflict resolved, retry behavior, conflict resolution behavior, mobile
    deep links/UI, and broad offline-sync expansion remain future work.
  - Auth/session/security notification runtime remains manual auth-security
    gated.
  - Item claim/split/creator-review notification coverage remains blocked on
    source claim runtime and #371/Figma/deep-link references.
  - Future settlement mismatch/residual/review event coverage remains separate
    source-state work.
  - Push/email provider delivery, provider workers, digests, delivery receipts,
    background delivery, admin/global policy, Day 1 notification acceptance,
    production readiness, release readiness, manual UI retest, and manual code
    review are not completed by #626.
- Future gates requiring explicit approval:
  - #371 Figma/reference-gated notification deep links/mobile UI.
  - Auth/session/security policy before security-impactful notifications.
  - OpenAPI/generated-client/schema/runtime work only for exact implemented
    event types with reviewed source states and safe targets.
- Close/keep-open recommendation:
  - Do not close #369 or mark it `100`. PR #626/#570 is one completed child
    runtime slice, not full Day 1 notification event-family acceptance.
- Last verified repo/report references:
  - `docs/architecture/DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`
  - Issue #369 PR #626 progress comment:
    `https://github.com/tommytang213/Settleora/issues/369#issuecomment-4844221960`

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
