# Day 1 Acceptance Evidence And Hard-Gated Gaps

## Purpose

This tracker keeps Day 1 acceptance evidence, unpassed manual gates, known blockers, and Day 2 / Day 3 exclusions in one conservative control artifact.

It does not mark Day 1 acceptance, manual UI retest, manual code review, security review, storage/privacy review, money/settlement review, deployment review, production readiness, or release readiness as passed.

Status vocabulary used here:

- `Evidence required`
- `Automated evidence available`
- `Manual evidence required`
- `Blocked by Figma/reference`
- `Blocked by manual gate`
- `Blocked by runtime/implementation gate`
- `Deferred Day 2/Day 3`
- `Not assessed`

Source of truth remains the live repository, especially [MVP Day 1 scope](../../prd/MVP_DAY1_SCOPE.md), [Product requirements draft V5](../../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md), [Program architecture](../../../PROGRAM_ARCHITECTURE.md), [Day 1 acceptance state](DAY1_ACCEPTANCE_STATE.md), [Day 1 evidence map](DAY1_EVIDENCE_MAP.md), [Day 1 E2E regression matrix](DAY1_E2E_REGRESSION_MATRIX.md), [manual code review checklist](DAY1_MANUAL_CODE_REVIEW_CHECKLIST.md), and [manual gate package](MANUAL_GATE_PACKAGE.md).

## Evidence Inventory

| Day 1 area / flow | Current evidence sources | Automated evidence type | Manual evidence type still needed | Status |
| --- | --- | --- | --- | --- |
| Acceptance package and QA controls | `docs/acceptance/day1/README.md`, `DAY1_ACCEPTANCE_STATE.md`, `DAY1_EVIDENCE_MAP.md`, `DAY1_E2E_REGRESSION_MATRIX.md`, `DAY1_MANUAL_CODE_REVIEW_CHECKLIST.md`, `MANUAL_GATE_PACKAGE.md`, #384, #385, #386, #387, #388 | Docs validation and scaffold validation can prove the package is discoverable and well formed. | Maintainer acceptance review and explicit Day 1 gate decision. | `Manual evidence required` |
| Auth, identity, sessions, and account security | `PROGRAM_ARCHITECTURE.md`, auth/session architecture docs, `DAY1_ACCEPTANCE_STATE.md`, `DAY1_EVIDENCE_MAP.md`, #336, #337, #338, #339 | API/mobile tests and OpenAPI paths exist for starter bootstrap, sign-in, refresh, current-user, session list/revoke, and admin local-user foundation. | Security/auth/session review, manual session/device retest, and code review. | `Manual evidence required` |
| Profile and payment details | `PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md`, `DAY1_ACCEPTANCE_STATE.md`, `DAY1_EVIDENCE_MAP.md`, #340, #343, #353 | API/mobile tests and OpenAPI paths exist for self profile, payment details, QR storage, and counterparty payment-detail reads. | Payment visibility, QR, storage/privacy, and mobile UI review. | `Manual evidence required` |
| Bills, attachments, revisions, and participant flows | `EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md`, bill revision docs, `DAY1_ACCEPTANCE_STATE.md`, `DAY1_E2E_REGRESSION_MATRIX.md`, #344, #345, #346, #347, #348 | API/mobile tests and OpenAPI paths exist for bounded bill, attachment, archive/restore, revision, approval, and payer-confirmation slices. | Bill lifecycle UI retest, money/domain review, temporary participant review, and code review. | `Manual evidence required` |
| Money, splits, tax, rounding, FX, and settlement impact | `MONEY_ROUNDING_ARCHITECTURE.md`, `EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md`, `CURRENCY_EXCHANGE_ARCHITECTURE.md`, `DAY1_RECEIPT_BILL_EDGE_CASE_ARCHITECTURE.md`, #349, #350, #351, #352, #429, #430 | Existing money foundation and calculation tests exist. #351 is closed after its child artifacts, including #429 and #430, but the broad money parent #349 remains open. | Money/split/settlement reviewer sign-off, full fixture review, quantity/open-claim evidence, manual FX evidence, and manual UI review. | `Manual evidence required` |
| OCR capture, review, and apply safety | `OCR_ARCHITECTURE.md`, `MOBILE_OCR_IMPLEMENTATION_DECISION.md`, `OCR_MLKIT_PROVIDER_INTEGRATION_PLAN.md`, `OCR_NATIVE_BUILD_VALIDATION_PLAN.md`, `OCR_PARSER_REVIEW_HANDOFF_TEST_PLAN.md`, `RECEIPT_OCR_REVIEW_APPLY_POLICY.md`, `RECEIPT_OCR_REVIEW_UX_FLOW.md`, #357, #358, #359, #360, #438 | API OCR review tests and mobile OCR parser/provider/intake/artifact tests exist for bounded slices. #436, #437, and #439 are merged under #359. | OCR capture/review manual retest, storage/privacy review, money review, and code review. #438 remains an open Figma/reference blocker for fallback/error/retry/offline/manual-entry states. | `Blocked by Figma/reference` |
| Settlement requests, baskets, residuals, proof, and balances | `SETTLEMENT_RUNTIME_ARCHITECTURE.md`, `SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md`, `PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md`, #353, #354, #355, #356 | API/mobile tests and OpenAPI paths exist for bounded settlement request, payment, residual, proof, and balance slices. | Money/settlement calculation review, storage review for proof, manual settlement UI retest, and code review. | `Manual evidence required` |
| Notifications | `NOTIFICATION_EVENT_TAXONOMY.md`, `SMTP_EMAIL_PROVIDER_POLICY.md`, `PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`, `NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`, #368, #369, #370, #371 | API in-app notification tests and mobile local preference/readout tests exist for bounded slices. | Notification event coverage review, privacy-safe content review, manual UI retest, and future provider/preference review. | `Manual evidence required` |
| Recurring bills and forecasting | `docs/features/recurring-bills/TECHNICAL_SPEC.md`, #365, #366, #367 | API/mobile tests and OpenAPI paths exist for template lifecycle, forecast, and explicit draft generation slices. | Recurring UI retest, generated-draft review, notification handoff review, and money/domain review. | `Manual evidence required` |
| Sync, offline, import/export, and local backup | `OFFLINE_QUEUE_SYNC_STATE_MODEL.md`, `SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md`, `LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md`, `CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md`, `LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md`, `IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md`, `SYNC_AUDIT_VALIDATION_MATRIX.md`, #361, #362, #363, #364, #381, #447, #457 | API sync endpoint tests, mobile sync queue tests, and starter mobile local backup export/import-preview tests exist for bounded slices. | Manual sync/offline/data-safety retest, import/export privacy review, restore/migration review, and code review. | `Manual evidence required` |
| Storage and file privacy | `STORAGE_FILE_METADATA_ARCHITECTURE.md`, `STORAGE_FILE_POLICY_ARCHITECTURE.md`, `PRIVACY_VAULT_ARCHITECTURE.md`, #340, #341, #342, #343, #356, #457 | API file object, local storage provider, bill attachment, QR, and settlement proof tests exist for bounded file flows. | Storage/file privacy review, privacy-vault review, retention/policy runtime review, and manual file-flow retest. | `Manual evidence required` |
| Web user and admin portals | `README.md`, `DAY1_ACCEPTANCE_STATE.md`, `DAY1_EXECUTION_COVERAGE_MATRIX.md`, #373, #376, #377, #378, #379 | Placeholder evidence only for `apps/web-user` and `apps/web-admin`; no full Day 1 web/admin implementation evidence. | Web/admin implementation evidence, Figma/reference, admin exposure review, and manual review. | `Blocked by runtime/implementation gate` |
| Deployment, TrueNAS, release, CI, and GitHub settings | `CI_CD_AND_PUBLISHING_REQUIREMENTS.md`, `BRANCHING_AND_RELEASE_STRATEGY.md`, deployment docs, `CODEMAGIC_TESTFLIGHT_SETUP.md`, #380, #381, #382, #383, #483, #484, #485, #486, #487 | Docs/control and maintainer-run LAN evidence exist for bounded slices. #381 is closed for current-scope checklist/evidence work, but #380 remains open. | Deployment/security review, production/public/admin exposure review, GitHub settings review, TestFlight/release review if used, and maintainer acceptance. | `Blocked by manual gate` |

## Hard Gates That Remain Unpassed

| Gate | Current status | Required evidence before any pass claim |
| --- | --- | --- |
| Day 1 acceptance | `Blocked by manual gate` | Maintainer-run acceptance decision with exact reviewed branch/commit, evidence package, validation results, unresolved blocker status, and explicit sign-off. |
| Manual UI retest / Figma/reference | `Blocked by Figma/reference` | #386 completion evidence, screenshots/video or equivalent checklist results, and resolution of known Figma/reference blockers such as #438. |
| Manual code review execution | `Blocked by manual gate` | #387 created the checklist artifact and is closed, but a human review execution must still record branch, commit, validation, PR/CI, comments, and decision. |
| Security/auth/session review | `Blocked by manual gate` | Auth/session/security reviewer notes for token/session/device/account/admin exposure behavior, abuse/audit posture, and unresolved #336 children. |
| Storage/file privacy review | `Blocked by manual gate` | File-flow request/response evidence, authorization review, purpose-policy review, retention/vault notes, and confirmation that storage internals are not exposed. |
| Money/split/settlement review | `Blocked by manual gate` | Calculation fixture review, rounding/currency/tax/FX/residual review, settlement impact review, and confirmation that clients are not financial authority. |
| OCR review | `Blocked by Figma/reference` | OCR UI fallback/reference evidence for #438 plus OCR/storage/money review showing OCR output remains provisional and review-first. |
| Notification review | `Manual evidence required` | Event producer matrix, privacy-safe payload review, unsupported provider state review, and manual UI evidence. |
| Recurring review | `Manual evidence required` | Template/forecast/generated-draft review, due-soon/notification handoff review, and confirmation unsupported background/reminder behavior is not implied. |
| Sync/offline/import/export/local backup review | `Manual evidence required` | Queue/conflict/offline evidence, local/server boundary review, export/import/backup privacy review, and restore/migration review. |
| Deployment/TrueNAS/release/CI/TestFlight/GitHub settings review | `Blocked by manual gate` | Reviewer evidence for deployment posture, TrueNAS limits, protected exposure, release gates, branch protection/CI, GitHub security settings, and TestFlight evidence if used. |

## Known Open Blockers And Follow-Up Trackers

Live issue readback on 2026-06-27 showed:

| Issue | State | Status note |
| --- | --- | --- |
| #384 E14 QA/E2E/regression | Open | Parent remains open with #386 and #388 unchecked; #385 and #387 are checked/closed docs-control artifacts. |
| #385 Build Day 1 E2E regression matrix | Closed | Merged docs/control artifact via PR #551. This did not pass Day 1 acceptance or manual gates. |
| #386 Prepare manual Day 1 UI retest checklist | Open | Labeled `figma:required` and `manual-gate`; manual UI retest remains unpassed. |
| #387 Prepare manual Day 1 code review checklist | Closed | Merged docs/control checklist artifact via PR #552. Manual code review execution remains unpassed. |
| #388 Track Day 1 acceptance evidence and hard-gated gaps | Open | Target issue for this tracker; should not be closed by this implementation task. |
| #336 E1 Auth/session/runtime security | Open | Children #337, #338, and #339 remain open; auth/security manual gate remains. |
| #344 E3 Bills/expenses core | Open | Children #345, #346, and #347 remain open; #348 is checked/closed. |
| #347 Add temporary participant architecture and implementation plan | Open | Still manual-gated and Figma/reference-gated for participant creation/link/claim UX. |
| #349 E4 Money/split/rounding engine | Open | #351 is closed, but #350 quantity/open claim and #352 manual FX remain open. |
| #351 Implement mixed tax-rate and fee allocation validation coverage | Closed | Child/supplemental artifacts are complete, including #429 and #430. Runtime/API/schema/money follow-ups remain separate gated work. |
| #357 E6 OCR receipt workflow | Open | OCR parent remains open with #358, #359, and #360 unchecked. |
| #359 Implement on-device OCR extraction foundation | Open | #436, #437, and #439 are merged; #438 remains open and blocks the parent on Figma/reference. |
| #438 OCR fallback, error, retry, and offline handling slice | Open | Explicit Figma/reference blocker for OCR failure/retry/offline/manual-entry states. |
| #361 E7 Sync/offline/local mode | Open | Children #362, #363, and #364 remain open. |
| #365 E8 Recurring/forecasting | Open | Children #366 and #367 remain open; #291 and #294 are Day 2 recurring improvements. |
| #368 E9 Notifications | Open | Children #369, #370, and #371 remain open. |
| #370 Implement persisted notification preferences | Open | Persisted/server notification preferences remain incomplete. |
| #380 E13 Deploy/release/CI | Open | #381, #382, and #383 are checked/closed, but the broader deploy/release/CI epic remains open and manual-gated. |
| #381 Harden TrueNAS LAN Docker validation and release checklist | Closed | Current-scope checklist/evidence work complete; not production/public/admin exposure or release approval. |

Do not close parent epics or claim Day 1 acceptance while any required manual, Figma/reference, runtime, implementation, deployment, security, storage, money, OCR, notification, recurring, sync, import/export, or release gate remains unpassed.

## Day 2 / Day 3 Exclusions

The following are not Day 1 acceptance blockers only because repo source documents already defer them. This list does not move any Day 1 requirement out of scope.

| Exclusion | Source support | Status |
| --- | --- | --- |
| Seasonal/flexible-date recurring forecasting | [DAY1_EXECUTION_COVERAGE_MATRIX.md](../../planning/DAY1_EXECUTION_COVERAGE_MATRIX.md) rows D1-RECUR-002 and #291 | `Deferred Day 2/Day 3` |
| Autopay policy defaults and per-recurring paid-state overrides | Coverage matrix row D1-RECUR-003 and #294 | `Deferred Day 2/Day 3` |
| Provider-based FX such as Frankfurter/global daily rates/context FX profiles | [DAY1_DECISION_REGISTER.md](../../planning/DAY1_DECISION_REGISTER.md) D1-DEC-DEFER-001 and coverage row D1-DAY2-001 | `Deferred Day 2/Day 3` |
| Guest/accountless group members beyond minimal Day 1 temporary participants | Coverage row D1-DAY2-002 | `Deferred Day 2/Day 3` |
| Statement upload/matching, lock periods, refunds, deposits, simplification, and broader payment-request features | D1-DEC-DEFER-001 and coverage row D1-DAY2-003 | `Deferred Day 2/Day 3` |
| Traditional Chinese UI and full theme settings | D1-DEC-DEFER-001 | `Deferred Day 2/Day 3` |
| Payment provider integrations such as PayPal/FPS QR generation, provider payment attempts, provider webhooks, and provider-generated payment instructions | D1-DEC-DEFER-002 and coverage row D1-DAY3-002 | `Deferred Day 2/Day 3` |
| AI insights, provider settings, category suggestions, summaries, Q&A, and anomaly explanation | D1-DEC-DEFER-002, [DAY3_AI_INSIGHTS_SCOPE.md](../../prd/DAY3_AI_INSIGHTS_SCOPE.md), and coverage row D1-DAY3-001 | `Deferred Day 2/Day 3` |

## Acceptance Boundary

This tracker supports future review by making evidence and blockers visible. It is not acceptance evidence by itself. Passing docs validation for this file can only show that the tracker is formatted and discoverable; it cannot prove runtime correctness, UI readiness, security readiness, storage/privacy readiness, money/settlement correctness, OCR readiness, deployment readiness, release readiness, or human acceptance.
