# Day 1 Manual UI Retest Checklist

## Purpose

This checklist is a future human-executed manual UI retest plan for Day 1 acceptance issue [#386](https://github.com/tommytang213/Settleora/issues/386).

It does not record that any UI retest was performed. It does not mark manual UI retest, manual code review, Day 1 acceptance, security review, storage/privacy review, money/settlement review, deployment review, production readiness, or release readiness as passed.

Allowed result states:

- `Not run`
- `Blocked`
- `Needs reference`
- `Ready for human retest`
- `Passed by human`
- `Failed by human`

Default state for executable retest rows is `Not run`. Default state for missing or unresolved reference/runtime gates is `Blocked` or `Needs reference`.

## Retest Metadata

Leave execution fields blank or unpassed until a human reviewer performs the retest.

| Field | Value |
| --- | --- |
| Tester |  |
| Retest date |  |
| Retest timezone |  |
| Device model(s) |  |
| OS version(s) |  |
| App build/source SHA |  |
| Branch or PR |  |
| Base branch and SHA |  |
| Environment |  |
| App mode |  |
| Account/test data used |  |
| Server URL or local-only context |  |
| Fixture seed notes |  |
| Screenshot/video evidence links |  |
| Redaction notes |  |
| Blockers found |  |
| Final manual UI retest outcome | `Not run` |

Minimum evidence to record during a real retest:

- Branch, commit SHA, build source, device model, OS version, app mode, and environment.
- Test accounts, groups, bills, receipts, settlement requests, files, and notification fixtures used.
- Screenshots or video for each flow, with sensitive material redacted.
- Pass/fail/blocked state for every applicable row.
- Issue links for every failure or missing reference.

## Reference Source Map

Use only current repo references and assets. Do not invent Figma links, filenames, screenshots, or unstored exports.

| Area | Approved repo reference | Screenshot or asset source | Current retest posture |
| --- | --- | --- | --- |
| Package scope and acceptance boundaries | [Day 1 acceptance package](README.md), [Day 1 E2E regression matrix](DAY1_E2E_REGRESSION_MATRIX.md), [Day 1 acceptance evidence and gaps](DAY1_ACCEPTANCE_EVIDENCE_AND_GAPS.md), [manual gate package](MANUAL_GATE_PACKAGE.md) | N/A | `Ready for human retest` as planning references only. |
| Program and Day 1 scope | [Program architecture](../../../PROGRAM_ARCHITECTURE.md), [MVP Day 1 scope](../../prd/MVP_DAY1_SCOPE.md), [Product requirements draft V5](../../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md) | N/A | `Ready for human retest` as authority references only. |
| Mobile shell, Home, More, shared components | [Mobile design reference](../../design/mobile/MOBILE_DESIGN_REFERENCE_V1.md), [mobile implementation guardrails](../../design/mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md), [mobile shared design system audit](../../design/mobile/MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md) | [mobile-shell-v1 assets](../../design/mobile/assets/mobile-shell-v1/) | `Not run` |
| More, settings, profile, payment details, local/server mode, import/export | [Mobile More/settings reference](../../design/mobile/MOBILE_MORE_SETTINGS_REFERENCE_V1.md) | [more-settings-v1 assets](../../design/mobile/assets/more-settings-v1/) | `Not run` |
| Auth security setup, MFA, passkeys, recovery codes | [Mobile auth security reference](../../design/mobile/MOBILE_AUTH_SECURITY_REFERENCE_V1.md) | [auth-security-v1 assets](../../design/mobile/assets/auth-security-v1/) | `Blocked` for full Day 1 auth runtime; references exist for visual review. |
| Privacy vault and app lock | [Mobile privacy vault reference](../../design/mobile/MOBILE_PRIVACY_VAULT_REFERENCE_V1.md), [privacy vault architecture](../../architecture/PRIVACY_VAULT_ARCHITECTURE.md) | [privacy-vault-v1 assets](../../design/mobile/assets/privacy-vault-v1/) | `Blocked` for privacy-vault runtime; references exist for visual review. |
| Bills, receipt scan, OCR review, item assignment, total mismatch | [Mobile bills/OCR reference](../../design/mobile/MOBILE_BILLS_OCR_REFERENCE_V1.md) | [bills-ocr-v1 assets](../../design/mobile/assets/bills-ocr-v1/) | `Not run`; OCR fallback/error/offline/manual-entry remains blocked by #438. |
| OCR tax, discount, fee, refund correction | [OCR tax/discount/fee/refund UX reference](../../features/expenses-bills/OCR_TAX_DISCOUNT_FEE_REFUND_UX_REFERENCE.md) | [ocr-tax-discount-fee-refund-v1 assets](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/) | `Not run`; money/runtime completeness remains gated. |
| Bill revision review/diff | [Bill revision review UX](../../features/expenses-bills/BILL_REVISION_REVIEW_UX.md), [mobile/web bill revision diff reference](../../design/mobile/MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md), [mobile bill revision proposal UX](../../features/expenses-bills/MOBILE_BILL_REVISION_PROPOSAL_UX.md) | [bill-revision-diff-v1 assets](../../design/mobile/assets/bill-revision-diff-v1/) | `Not run` |
| Groups and group bills | [Mobile groups reference](../../design/mobile/MOBILE_GROUPS_REFERENCE_V1.md) | [groups-v1 assets](../../design/mobile/assets/groups-v1/) | `Not run` for referenced group screens; `Needs reference` for friends/direct sharing and temporary participant claim/link UI. |
| Settlement, payment details, payment status, proof states | [Mobile settle reference](../../design/mobile/MOBILE_SETTLE_REFERENCE_V1.md), [settlements functional spec](../../features/settlements/FUNCTIONAL_SPEC.md) | [settle-v1 assets](../../design/mobile/assets/settle-v1/) | `Not run` |
| Notifications and review queue | [Mobile notifications reference](../../design/mobile/MOBILE_NOTIFICATIONS_REFERENCE_V1.md), [notification event taxonomy](../../architecture/NOTIFICATION_EVENT_TAXONOMY.md) | [notifications-v1 assets](../../design/mobile/assets/notifications-v1/) | `Not run`; push/email/provider delivery remains incomplete. |
| OCR architecture and fallback gates | [OCR architecture](../../architecture/OCR_ARCHITECTURE.md), [mobile OCR implementation decision](../../architecture/MOBILE_OCR_IMPLEMENTATION_DECISION.md), [OCR parser review handoff test plan](../../architecture/OCR_PARSER_REVIEW_HANDOFF_TEST_PLAN.md), [receipt OCR review UX flow](../../architecture/RECEIPT_OCR_REVIEW_UX_FLOW.md), [receipt OCR review apply policy](../../architecture/RECEIPT_OCR_REVIEW_APPLY_POLICY.md) | Existing OCR assets listed above. | `Blocked` for #438 fallback/error/retry/offline/manual-entry UI/Figma gate if still open. |
| Sync/offline/import/export/local backup | [sync/offline functional spec](../../features/sync-offline/FUNCTIONAL_SPEC.md), [sync/offline technical spec](../../features/sync-offline/TECHNICAL_SPEC.md), [local/server/import/export boundaries](../../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md), [import/export storage privacy audit matrix](../../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md) | Import/export references exist under [more-settings-v1 assets](../../design/mobile/assets/more-settings-v1/). | `Not run` for referenced settings/readouts; `Blocked` for full runtime apply/restore/conflict behavior. |
| Recurring bills and forecasting | [recurring bills technical spec](../../features/recurring-bills/TECHNICAL_SPEC.md), [Day 1 E2E regression matrix](DAY1_E2E_REGRESSION_MATRIX.md) | No dedicated recurring mobile asset folder currently listed in [mobile assets README](../../design/mobile/assets/README.md). | `Needs reference` for dedicated recurring visual comparison; current app starter surface may still be manually smoke-tested. |
| Monthly reports and reconciliation | [reconciliation functional spec](../../features/reconciliation/FUNCTIONAL_SPEC.md), [reconciliation technical spec](../../features/reconciliation/TECHNICAL_SPEC.md), [Day 1 acceptance state](DAY1_ACCEPTANCE_STATE.md) | No dedicated report/reconciliation mobile asset folder currently listed in [mobile assets README](../../design/mobile/assets/README.md). | `Needs reference` for dedicated visual comparison; current app starter surface may still be manually smoke-tested. |
| User web and admin web | [Day 1 acceptance evidence and gaps](DAY1_ACCEPTANCE_EVIDENCE_AND_GAPS.md), [MVP Day 1 scope](../../prd/MVP_DAY1_SCOPE.md) | No user-web or admin-web UI assets are listed in `docs/design/mobile/assets/`. | `Blocked` by runtime/implementation and UI reference gaps. |
| Public/admin exposure and deployment UI | [self-hosting exposure guardrails](../../deployment/SELF_HOSTING_EXPOSURE_GUARDRAILS.md), [TrueNAS LAN Docker testing](../../deployment/TRUENAS_LAN_DOCKER_TESTING.md), [Codemagic/TestFlight setup](../../workflow/CODEMAGIC_TESTFLIGHT_SETUP.md) | No user-facing admin/deployment UI reference asset is listed for this retest. | `Blocked` or out of scope for mobile UI retest unless a concrete user-facing reference is added. |

## Global UI And Safety Checks

| ID | Check | Result | Evidence / notes |
| --- | --- | --- | --- |
| UI-GLOBAL-001 | Screens use the approved Settleora mobile visual language, shared theme tokens, shared components, consistent spacing, status colors, and readable typography. | `Not run` | |
| UI-GLOBAL-002 | Mobile layout remains single-column where appropriate, uses safe areas, avoids clipped text, and behaves on narrow and wide test viewports. | `Not run` | |
| UI-GLOBAL-003 | Bottom navigation stays consistent for top-level Home, Bills, Groups, Settle, and Settings/More navigation where the current implementation exposes it. | `Not run` | |
| UI-GLOBAL-004 | Bottom sheets, dialogs, pickers, and confirmation flows are reachable, dismissible, and do not hide critical warnings or actions. | `Not run` | |
| UI-GLOBAL-005 | Empty, loading, error, denied, offline, conflict, stale, unsupported, and unconfigured states use honest user-facing copy and do not imply unsupported behavior succeeded. | `Not run` | |
| UI-GLOBAL-006 | Tap targets are usable on mobile, controls are not too close together, destructive actions require clear wording, and primary/secondary actions are visually distinct. | `Not run` | |
| UI-GLOBAL-007 | Basic accessibility is checked: dynamic text/readability, contrast, labels, focus/reading order where applicable, and screen-reader-safe semantics for important states. | `Not run` | |
| UI-GLOBAL-008 | UI does not expose secrets, tokens, raw session data, recovery codes after creation, provider credentials, storage paths, object keys, signed URLs, local file paths, vault internals, raw OCR text beyond safe fixtures, or unrelated personal data. | `Not run` | |
| UI-GLOBAL-009 | UI does not expose over-detailed payment information or QR/payment contents outside authorized settlement/payment context. | `Not run` | |
| UI-GLOBAL-010 | UI does not derive or display authorization, financial truth, settlement state, storage access, sync acceptance, or audit truth from client-only state. | `Not run` | |

## Core Flow Retest Rows

| ID | Flow | Reference(s) | Required checks | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| UI-AUTH-001 | First launch, app mode, server/local entry, sign-in, current session, logout, sign-out-all, session list/revoke. | `MOBILE_DESIGN_REFERENCE_V1.md`, `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `MOBILE_AUTH_SECURITY_REFERENCE_V1.md`, `MOBILE_AUTH_SESSION_CLIENT_FLOW.md`. | Confirm entry paths are understandable; session state survives refresh where expected; logout/revoke states do not leak protected UI; errors avoid enumeration or token detail. | `Not run` | |
| UI-AUTH-002 | Passkey, TOTP MFA, recovery-code, invitation, OIDC, and public registration UI references. | `MOBILE_AUTH_SECURITY_REFERENCE_V1.md`, `MVP_DAY1_SCOPE.md`. | Visual reference exists for security setup, but full Day 1 auth runtime remains incomplete/manual-gated; do not mark passed unless implementation and security evidence exist. | `Blocked` | Full runtime is not proven by the reference assets. |
| UI-HOME-001 | Home/dashboard, More/settings, navigation discoverability. | `MOBILE_DESIGN_REFERENCE_V1.md`, `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `mobile-shell-v1` assets. | Verify dashboard hierarchy, More/settings routes, quick actions, current-user context, refresh/notification/profile affordances, and no implementation-jargon copy. | `Not run` | |
| UI-GROUP-001 | Groups list, group dashboard, members, group bill context, group balances. | `MOBILE_GROUPS_REFERENCE_V1.md`, `groups-v1` assets. | Verify list/detail/dashboard states, member management affordances, unauthorized/empty states, and group bill handoffs. | `Not run` | |
| UI-GROUP-002 | Friends/direct sharing, discovery, block/unfriend, temporary participant claim/link. | `MVP_DAY1_SCOPE.md`, `DAY1_DECISION_REGISTER.md`, `TEMPORARY_PARTICIPANT_CLAIM_LINK_FLOW.md` if present in current repo. | Do not invent visual acceptance. Mark blocked until a current approved reference exists for friend discovery/request/block/direct-share and temporary participant claim/link UI. | `Needs reference` | Current mobile assets cover groups, not a complete friends/direct-sharing/claim-link reference. |
| UI-BILL-001 | Bills list, add bill, personal/group bill creation, review, split, submit, accept/reject, archive/restore. | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, `EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md`, `expenses-bills` feature specs. | Verify bill creation/review states, payer and participant prompts, empty/error states, archive/restore messaging, and no client-authoritative money claims. | `Not run` | |
| UI-BILL-002 | Bill revision proposal, changed-only/full review, approval saved, denied, stale, blocked states. | `BILL_REVISION_REVIEW_UX.md`, `MOBILE_BILL_REVISION_PROPOSAL_UX.md`, `MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md`, `bill-revision-diff-v1` assets. | Verify server-derived review context is rendered, denied/stale/blocked states are clear, and approval is not shown as applying to superseded revisions. | `Not run` | |
| UI-MONEY-001 | Split, tax, discount, fee, refund, mismatch, manual adjustment, and money-impacting warnings. | `OCR_TAX_DISCOUNT_FEE_REFUND_UX_REFERENCE.md`, `MONEY_ROUNDING_ARCHITECTURE.md`, `EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md`, `DAY1_RECEIPT_BILL_EDGE_CASE_ARCHITECTURE.md`. | Verify UI exposes reviewable states for mismatch, tax groups, discount/refund/payment-like components, fees, and manual review without silently changing shares. | `Not run` | |
| UI-OCR-001 | Receipt capture/import, OCR processing, OCR review, manual itemized entry, item assignment, split preview. | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, `RECEIPT_OCR_REVIEW_UX_FLOW.md`, `RECEIPT_OCR_REVIEW_APPLY_POLICY.md`, `bills-ocr-v1` assets. | Verify OCR is review-first, editable, and provisional; confirm apply-preview is not presented as final money authority. | `Not run` | |
| UI-OCR-002 | OCR fallback, error, retry, offline, and manual-entry states. | `OCR_PARSER_REVIEW_HANDOFF_TEST_PLAN.md`, `DAY1_E2E_REGRESSION_MATRIX.md`. | If #438 is still open, stop acceptance for this row and record it as unresolved. Do not infer fallback/offline UI acceptance from parser/API tests. | `Blocked` | #438 is identified in current acceptance docs as unresolved if still open. |
| UI-STORAGE-001 | Bill receipt/supporting attachment preview/download/remove and safe metadata display. | `STORAGE_FILE_METADATA_ARCHITECTURE.md`, `STORAGE_FILE_POLICY_ARCHITECTURE.md`, `MOBILE_BILLS_OCR_REFERENCE_V1.md`. | Verify files are shown through stable IDs and safe user-facing labels only; no storage internals, local paths, object keys, signed URLs, or raw provider details. | `Not run` | |
| UI-STORAGE-002 | Payment QR/payment detail and settlement proof preview/download/remove. | `MOBILE_SETTLE_REFERENCE_V1.md`, `PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md`, `STORAGE_FILE_METADATA_ARCHITECTURE.md`. | Verify payment details/proofs are visible only in authorized settlement/payment context; denied/redacted states do not reveal hidden data. | `Not run` | |
| UI-SETTLE-001 | Settle dashboard, balances, suggested settlements, request payment, mark paid, confirmation, residual/payment status states, history. | `MOBILE_SETTLE_REFERENCE_V1.md`, `SETTLEMENT_RUNTIME_ARCHITECTURE.md`, `SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md`. | Verify exact selected total vs paid amount, under/overpayment residual states, denied/disputed/cancelled states, and no proof-based auth bypass. | `Not run` | |
| UI-SETTLE-002 | Payment detail visibility, proof, and redaction states. | `MOBILE_SETTLE_REFERENCE_V1.md`, `PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md`. | Verify no overexposed payment detail, QR, proof, or counterparty information; screenshots must redact QR/payment content beyond safe display. | `Not run` | |
| UI-RECUR-001 | Recurring template list/detail, forecast, due-soon readout, explicit draft generation. | `recurring-bills/TECHNICAL_SPEC.md`, `DAY1_E2E_REGRESSION_MATRIX.md`. | Verify existing starter surface honestly distinguishes forecast from created bills and explicit draft generation from background auto-generation. | `Needs reference` | No dedicated recurring visual asset folder is currently listed. |
| UI-NOTIF-001 | Notification center, review queue, notification details, read/archive, bulk triage, local preference readouts. | `MOBILE_NOTIFICATIONS_REFERENCE_V1.md`, `NOTIFICATION_EVENT_TAXONOMY.md`, `notifications-v1` assets. | Verify content is privacy-safe, unsupported push/email states are not shown as delivered, and read/archive does not imply source-resource mutation. | `Not run` | |
| UI-SYNC-001 | Sync/offline queue states, local/server mode, conflict/failure readouts, data safety, import/export/backup flows. | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `OFFLINE_QUEUE_SYNC_STATE_MODEL.md`, `LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md`, `IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md`. | Verify queued/synced/conflict/failed states, local pending preservation language, explicit import/export/backup warnings, and no silent authority-boundary merge. | `Not run` | Full apply/restore/conflict behavior remains implementation-gated. |
| UI-REPORT-001 | Monthly report, reconciliation status, search/filter readouts. | `reconciliation` feature specs, `DAY1_ACCEPTANCE_STATE.md`, `DAY1_E2E_REGRESSION_MATRIX.md`. | Smoke-test current starter surfaces if present, but mark visual parity `Needs reference` until dedicated report/reconciliation UI references exist. | `Needs reference` | |
| UI-PRIVACY-001 | Privacy mode, vault setup, app lock, unlock, privacy controls, redacted dashboard/list states. | `MOBILE_PRIVACY_VAULT_REFERENCE_V1.md`, `PRIVACY_VAULT_ARCHITECTURE.md`, `privacy-vault-v1` assets. | Verify references and any implemented readouts do not imply recoverable vault runtime is complete unless separate evidence exists. | `Blocked` | Privacy vault runtime remains manual-gated/incomplete in current acceptance docs. |
| UI-ADMIN-001 | Admin/public exposure checks. | Deployment/exposure docs only. | Only retest if a concrete user-facing mobile/web/admin UI reference and implementation exist. Otherwise mark blocked/out of scope for this mobile UI retest. | `Blocked` | No full user-facing admin web implementation evidence or UI reference is present in this checklist scope. |
| UI-WEB-001 | User web and admin web Day 1 surfaces. | `MVP_DAY1_SCOPE.md`, `DAY1_ACCEPTANCE_EVIDENCE_AND_GAPS.md`. | Confirm placeholders are not mistaken for Day 1-ready web/admin UI. Do not mark passed until implementation/reference evidence exists. | `Blocked` | Current acceptance docs classify web/admin as blocked by runtime/implementation gate. |

## Evidence Rules

Human evidence must be useful for review and safe to share.

- Screenshots, videos, logs, and notes must not include secrets, credentials, tokens, recovery codes, provider keys, `.env` content, private URLs that act as credentials, or local credential/session state.
- Do not expose QR payment contents beyond a safe redacted display.
- Do not expose storage internals, filesystem paths, object keys, provider URLs, signed URLs, mounted paths, or temporary local paths.
- Do not include raw OCR text beyond safe test fixtures or unrelated receipt/personal data.
- Do not include unrelated personal data, real payment details, real bank details, real email addresses, real phone numbers, or real group member data unless intentionally created as safe fixtures.
- Redact money/payment/proof details when they are not necessary to prove the UI state.
- Record whether each screenshot is from local mode, server mode, offline mode, or an error/blocked fixture.
- A screenshot proves only the visual state shown; it does not prove API/domain authority, money correctness, storage authorization, or security unless paired with the relevant validation/review evidence.

## Stop Conditions

Stop Day 1 acceptance and record a blocker if any of the following are observed:

- Any money mismatch, silent recalculation, missing currency, unsafe rounding, incorrect split, incorrect residual, unsupported refund/tax/discount/fee behavior, or client-derived financial truth.
- Any authz/privacy leak, account/session/token leakage, hidden-resource existence leak, client-derived role/permission claim, or unsafe session/logout behavior.
- Any storage/file exposure, direct path/object key/provider URL/signed URL leak, unauthorized file preview/download, unsafe proof/QR/receipt visibility, or generic public file behavior.
- Any payment-detail overexposure, QR overexposure, settlement/proof leakage, denied/redacted state revealing hidden detail, or proof bypassing settlement authorization.
- Any OCR flow finalizing money, applying non-draft shared-bill changes, bypassing review/API validation, leaking raw OCR text, or skipping fallback/manual-entry review.
- Broken critical navigation for Home, Bills, Groups, Settle, Settings/More, sign-in/out, bill review, settlement, OCR review, notifications, or local/server mode.
- Release/deployment/public/admin exposure mismatch, including UI implying production, public exposure, TestFlight, App Store, Play Store, or admin exposure readiness without manual gate evidence.
- Missing required reference for a UI-sensitive flow.
- Unreviewed Figma-sensitive UI, especially #386 or #438-related screens, being treated as accepted.
- Manual UI retest, manual code review, Day 1 acceptance, production readiness, or release readiness being marked passed without explicit human evidence.

## Parent And Sibling Gate Posture

- #386 remains open until this checklist artifact passes PR/merge gate review and the issue is explicitly handled by the normal GitHub workflow.
- #384 remains open while #386/manual UI retest/acceptance remains unresolved.
- #385, #387, and #388 are docs/control artifacts. Their closure or merge does not mean Day 1 acceptance, manual UI retest, manual code review execution, production readiness, or release readiness passed.
- This checklist prepares the retest path only. A future human must run it and record evidence before any `Passed by human` state is valid.
