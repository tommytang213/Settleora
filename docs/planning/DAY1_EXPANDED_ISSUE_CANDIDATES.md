# Day 1 Expanded Issue Candidates

## Purpose

This document converts the current Day 1 decision register and execution
coverage matrix into a reviewable issue-candidate backlog before any GitHub
Project mutation.

This is a planning document only. The rows below are candidate backlog entries,
not created GitHub issues. They must be reviewed and approved before any script
creates or updates GitHub issues, labels, Project items, Project fields, or board
state.

## Source Context

- Current `main` SHA used: `794f0ec0ab105a67071fb0673a2c62519abe3905`.
- Branch used for this planning pass:
  `planning/day1-expanded-issue-candidates-20260623-1340`.
- Coverage matrix used:
  [DAY1_EXECUTION_COVERAGE_MATRIX.md](DAY1_EXECUTION_COVERAGE_MATRIX.md).
- Decision register used:
  [DAY1_DECISION_REGISTER.md](DAY1_DECISION_REGISTER.md).
- Coverage status summary from the matrix:

| Coverage status | Row count |
|---|---:|
| `covered` | 5 |
| `partially covered` | 40 |
| `missing` | 7 |
| `needs decision` | 0 |
| `deferred day2/day3` | 7 |
| **Total** | **59** |

The task prompt referred to 6 currently missing rows. The checked-in matrix
currently records 7 missing rows, so this document preserves all 7 missing rows
as source-of-truth candidates and notes the discrepancy for Tommy review.

## Decision Register Application

The approved row-by-row conflict rule from `D1-DEC-SCOPE-001` is applied here.
PRD V5 does not globally override MVP Day 1, and MVP Day 1 does not globally
narrow every PRD V5 item. Rows stay Day 1 only where the current decision
register, MVP Day 1 scope, and matrix support that interpretation.

Applied Day 1 decisions:

- Passkeys/WebAuthn, TOTP MFA, recovery codes, admin policy, and audit are Day
  1, but auth/security implementation remains manual-gated and needs explicit
  schema/API/OpenAPI/generated-client/UI breakdown.
- Friends/direct sharing are Day 1 with server/admin policy, safe defaults,
  exact-match discovery, friend approval, block/unfriend behavior, and payment
  detail exposure guardrails.
- Day 1 notification channels are `in_app`, `email`, and `mobile_push` only.
  SMS is future/extensible and has no Day 1 runtime candidate here.
- Notification configuration is two-layer: admin/deployment policy is the hard
  cap, and user preferences can enable or narrow only allowed channels.
- `basic`, `guided`, `advanced`, and `help_me_decide` are Day 1 experience-mode
  onboarding options. They are UI/UX-only and must not change backend authority.
- User web and admin web are Day 1 feature-complete surfaces for Day 1
  capabilities, not placeholders.
- Local mode security is Day 1 user-configurable with app PIN, biometric unlock
  where available, encrypted local storage/export/backup where feasible, and
  clear no-collaboration warnings.
- Standard Secure Mode and Recoverable Private Vault for selected sensitive
  data are Day 1. Strict Private Vault stays Day 3/future.
- Traditional Chinese UI, full theme settings, statement upload/matching,
  provider FX/Frankfurter, locks/refunds/deposits, payment-provider integration,
  and AI insights stay out of Day 1 runtime candidates except explicit Day 1
  readiness or guardrail rows already approved.

## Architecture Guardrails For Candidate Issues

Generated issue bodies should cite the relevant subset of these guardrails:

- API/domain owns core business writes.
- Workers must not mutate core business tables directly.
- OpenAPI is the source of truth.
- Generated clients are not hand-edited.
- File bytes go through storage abstraction.
- API responses must not expose storage internals.
- File access requires API authorization.
- Money uses decimal-safe values with currency attached and centralized
  rounding.
- Clients must not decide authorization.
- Audit must avoid secrets, tokens, passwords, sensitive file contents, storage
  paths, object keys, raw OCR text, and unrelated user data.
- Day 1 remains production-shaped, not demo-grade.
- UI-sensitive work needs Figma or another explicit reference before Codex
  implementation.

## Ready-For-Codex Triage Rules

`Ready after issue creation` means the candidate already has clear acceptance
criteria, non-goals, dependencies, risk, validation class, and no Tommy/Figma
decision pending. Manual-gated runtime candidates are not marked ready even when
their scope is clear, because implementation must wait for explicit review.

## Candidate Issue Table

Estimate buckets are placeholders only: `XS: 0.25-0.5`, `S: 0.5-1`,
`M: 1-2`, `L: 3-5`, and `XL: split before estimating`.

| Candidate ID | Proposed issue title | Source coverage ID(s) | Area | Work type | Day scope | Risk labels | Suggested status | Suggested priority | Suggested size | Estimated man-days remaining | Confidence | Suggested validation class | Suggested bundle ID | Manual gate required | Figma/reference required | Dependencies/blockers | Acceptance criteria summary | Non-goals | Notes for issue body |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1-CAND-001 | Expand auth onboarding, invitation, registration policy, local-account policy, and OIDC plan | D1-AUTH-001 | Auth | feature | Day 1 | `risk:auth-security`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | L | L: 3-5 | medium | openapi-client | auth-security-1 | Yes: auth/session/security runtime and policy | Yes: onboarding and admin settings UX | Auth architecture breakdown; abuse/audit policy | Defines first-owner, admin-created user, invitation, self-registration toggle, local account, and OIDC/Keycloak slices with safe defaults and audit. | No public registration on by default; no raw provider tokens; no runtime work in planning issue. | Include required reading from auth identity, credentials/sessions/audit, password, and current-user docs. |
| D1-CAND-002 | Implement remaining Day 1 session visibility and new-device audit coverage | D1-AUTH-002 | Auth | hardening | Day 1 | `risk:auth-security`, `manual-gate` | Needs manual gate | P0 | M | M: 1-2 | medium | api | auth-security-1 | Yes: session/security behavior | Yes: session/device UI if included | Existing session lifecycle; audit event policy | Users can see useful session/device metadata, revoke sessions, and receive auditable new-device/security events without raw token exposure. | No arbitrary admin session control unless separately scoped. | Keep API authoritative for session validity and revocation. |
| D1-CAND-003 | Implement Day 1 password reset/change workflow | D1-AUTH-003 | Auth | feature | Day 1 | `risk:auth-security`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | L | L: 3-5 | medium | openapi-client | auth-security-1 | Yes: credential lifecycle and recovery | Yes: user/admin recovery UX | Token design, abuse controls, audit policy | Password change/reset flow uses short-lived non-raw tokens, bounded audit, abuse handling, and safe UX. | No plaintext passwords, reusable reset tokens, or silent account recovery. | Split schema/API/UI if implementation branch would become too large. |
| D1-CAND-004 | Break down Day 1 passkey, TOTP MFA, recovery-code, policy, audit, UI, and QA work | D1-AUTH-004 | Auth | feature | Day 1 | `risk:auth-security`, `manual-gate`, `risk:migration`, `risk:openapi` | Needs architecture breakdown | P0 | XL | XL: split before estimating | medium | openapi-client | auth-security-2 | Yes: MFA/passkey security and schema | Yes: enrollment, challenge, recovery, and policy UX | Explicit schema/API/OpenAPI/UI breakdown | Produces implementation-ready subissues for WebAuthn, TOTP, recovery codes, policy enforcement, audit, UI, and QA. | No SMS MFA; no raw MFA secrets, passkey private material, or recovery codes in unsafe storage. | This should likely become several issues before any runtime branch. |
| D1-CAND-005 | Add Day 1 profile and payment-details UI, visibility, privacy, and QA coverage | D1-PROFILE-001 | Profile/Payment | feature | Day 1 | `risk:storage-authz`, `risk:auth-security` | Needs Figma / Reference | P1 | M | M: 1-2 | high | mobile-ui | profile-payment-1 | Yes: if storage/privacy/authz changes are included | Yes: profile, QR, and visibility UX | Existing backend slices; storage policy for QR files | UI covers display name, preferred currency, payment note/handle, QR attachment, and default `settlement_counterparties_only` visibility. | No global payment detail visibility; no provider payment integration. | Figma/reference should show visibility warnings and settlement-counterparty scoping. |
| D1-CAND-006 | Expand purpose-specific upload policy by file purpose | D1-STORAGE-001 | Storage/Privacy | feature | Day 1 | `risk:storage-authz`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | L | L: 3-5 | medium | storage | storage-1 | Yes: storage/file privacy and byte handling | Yes: upload policy admin/user messages | Storage metadata and policy architecture | Receipt, proof, QR, supporting document, CSV/import, screenshot, and export file policies define limits, normalization, retention, hard caps, and audit. | No generic public file API; no unlimited admin file sizes. | Split by purpose if runtime work crosses storage, API, and UI together. |
| D1-CAND-007 | Create Day 1 privacy mode implementation and UX task set | D1-STORAGE-003 | Storage/Privacy | feature | Day 1 | `risk:storage-authz`, `risk:auth-security`, `manual-gate`, `risk:migration` | Needs architecture breakdown | P0 | XL | XL: split before estimating | medium | storage | storage-privacy-1 | Yes: vault/security/storage behavior | Yes: privacy mode, warning, recovery, and settings UX | Privacy vault architecture; key/envelope design | Produces scoped tasks for Standard Secure Mode, Recoverable Private Vault targets, policy, recovery, migration warnings, audit, and sensitive file/field integration. | No Strict Private Vault runtime; no client-owned money or authorization truth. | Keep shared accounting truth API/domain-authoritative. |
| D1-CAND-008 | Break bill edit, archive, restore, and lifecycle runtime into API, mobile, and QA tasks | D1-BILLS-001 | Bills | feature | Day 1 | `risk:money`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | L | L: 3-5 | medium | money | bills-core-1 | Yes: bill status and money-impacting lifecycle | Yes: edit/archive/restore UX | Bill lifecycle architecture and existing create/read APIs | Defines server-authoritative edit, archive, restore, status, audit, affected-user reset, and mobile surface criteria. | No destructive delete of financial truth; no settlement-impact mutation hidden in bill edit. | Separate OpenAPI/generated-client work from broad UI if needed. |
| D1-CAND-009 | Implement paid-by confirmation and payer contribution reset coverage | D1-BILLS-002 | Bills | feature | Day 1 | `risk:money`, `manual-gate` | Needs manual gate | P0 | M | M: 1-2 | medium | money | bills-core-1 | Yes: payer/money authority | Yes: paid-by confirmation UX | Bill calculation service and approval workflow | Paid-by person reconfirms when payer role, paid amount, payer contribution, or their financial share changes. | No client-authoritative payer confirmation. | Include affected-user and payer-specific tests. |
| D1-CAND-010 | Implement minimal temporary participant runtime and UX | D1-BILLS-003 | Bills/Auth | feature | Day 1 | `risk:auth-security`, `risk:money`, `manual-gate` | Needs manual gate | P0 | L | L: 3-5 | medium | openapi-client | bills-core-2 | Yes: participant identity, authz, money | Yes: participant creation/link/claim UX | Friend/direct sharing and group participation rules | Temporary participants can appear in shared bills with limited permissions and later claim/link while preserving historical participation. | No full Day 2 guest governance or voting. | Keep temporary participants narrower than Day 2 accountless members. |
| D1-CAND-011 | Split bill revision preservation into snapshot, API, mobile, and QA tasks | D1-BILLS-004 | Bills | feature | Day 1 | `risk:money`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | XL | XL: split before estimating | medium | money | bills-revision-1 | Yes: money-impacting revision authority | Yes: revision review/diff UX | Existing bill revision review context | Revision snapshots preserve enough item, split, adjustment, attachment, OCR, note, and metadata context for affected-user reapproval. | No multiple active official revisions in Day 1; no client-computed diff truth. | Use server-generated baseline and viewer-specific financial impact. |
| D1-CAND-012 | Audit all Day 1 money paths against centralized rounding policy | D1-MONEY-001 | Money | hardening | Day 1 | `risk:money`, `manual-gate` | Needs manual gate | P0 | M | M: 1-2 | high | money | money-1 | Yes: money authority audit | No: backend/test hardening | Existing money foundation and domain services | Every Day 1 money path uses decimal-safe values, attached currency, centralized rounding, and server-authoritative totals. | No UI redesign; no unrelated settlement feature expansion. | Focus on cross-domain tests and residual/rounding audit evidence. |
| D1-CAND-013 | Implement claim-state API, mobile review, and conflict tests | D1-MONEY-002 | Bills/Money | feature | Day 1 | `risk:money`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | L | L: 3-5 | medium | money | split-1 | Yes: split/money authority | Yes: claim/review/conflict UX | Quantity-level item claiming architecture | Supports unassigned, open, partially claimed, claimed, needs creator review, and ready states with tax/discount/refund propagation. | No client-finalized claim authority; no hidden conflict resolution. | Include local/offline queued state considerations where scoped. |
| D1-CAND-014 | Break multi-tax bill schema/runtime/OCR review work into subissues | D1-MONEY-003 | Bills/Money | feature | Day 1 | `risk:money`, `risk:migration`, `manual-gate`, `risk:openapi` | Needs architecture breakdown | P0 | XL | XL: split before estimating | medium | migration | tax-1 | Yes: money/schema/tax authority | Yes: OCR review and tax correction UX | Multi-tax architecture and receipt edge-case architecture | Produces implementation-ready schema, API, calculation, OCR review, UI, and test issues for mixed 8/10 percent, tax-included/excluded, and discount treatment. | No one global tax assumption; no silent receipt-total mutation. | Split before coding because schema, money, OpenAPI, and UI are all implicated. |
| D1-CAND-015 | Add receipt component classification and editable contribution treatment tasks | D1-MONEY-004 | Bills/OCR | feature | Day 1 | `risk:money`, `manual-gate` | Needs manual gate | P0 | L | L: 3-5 | medium | money | tax-1 | Yes: receipt component money treatment | Yes: OCR/component review UX | Receipt edge-case architecture | Coupons, points, gift cards, store credit, tender, change, void, free, refund, and tax corrections have safe defaults and editable contribution treatment. | No Day 3 AI/custom smart defaults. | Preserve source OCR line and manual review for unknown negatives. |
| D1-CAND-016 | Implement manual FX snapshot API, UI, audit, and tests | D1-MONEY-005 | Bills/Money | feature | Day 1 | `risk:money`, `risk:openapi`, `manual-gate` | Needs manual gate | P0 | L | L: 3-5 | medium | openapi-client | fx-day1-1 | Yes: money/FX financial truth | Yes: manual FX entry/review UX | Currency exchange architecture | Manual bill-level FX snapshots preserve original and target currency, rate, direction, reason, audit, and affected-user review when money changes. | No provider FX, Frankfurter, global daily rates, or silent recalculation. | Bill FX snapshot is financial truth. |
| D1-CAND-017 | Add receipt total mismatch review/error-state issue | D1-MONEY-006 | Bills/OCR | feature | Day 1 | `risk:money`, `manual-gate` | Needs manual gate | P0 | M | M: 1-2 | high | money | tax-2 | Yes: receipt total affects shares | Yes: mismatch review UX | Multi-tax and receipt edge-case architecture | Receipt mismatch becomes stable review/error state or explicit adjustment, with tests proving no silent item/tax/share mutation. | No automatic total balancing. | Matrix-missing row preserved as a Day 1 issue candidate. |
| D1-CAND-018 | Add group dashboard and group-balance Day 1 breakdown | D1-GROUP-001 | Groups | feature | Day 1 | `risk:auth-security`, `risk:money` | Needs Figma / Reference | P1 | L | L: 3-5 | medium | mobile-ui | groups-1 | Yes: if API/money/authz changes are included | Yes: group dashboard and balance UX | Group, bill, settlement, and authorization slices | Defines Day 1 group dashboard, group bills, balances, member management handoffs, and mobile/web parity expectations. | No Day 2 enhanced group dashboard or governance votes. | Keep group balance derived from server truth. |
| D1-CAND-019 | Add Day 1 friend request, direct sharing, discovery policy, block/unfriend, and temporary participant claim issue set | D1-GROUP-002 | Sharing/Auth | feature | Day 1 | `risk:auth-security`, `risk:storage-authz`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | XL | XL: split before estimating | medium | openapi-client | groups-2 | Yes: sharing authorization and privacy | Yes: discovery, friend request, block/unfriend, direct-share UX | Auth policy and payment-detail visibility rules | Produces scoped issues for approved friends, exact-match discovery, direct sharing authorization, block/unfriend, payment detail guardrails, and claim/link. | No browse-all-users directory by default; friend status alone does not expose payment details. | Safe defaults: exact-match discovery and friend approval required. |
| D1-CAND-020 | Split receipt capture/import into camera, file picker, share sheet, upload, and offline paths | D1-OCR-001 | OCR/Storage/Mobile | feature | Day 1 | `risk:storage-authz`, `manual-gate` | Needs Figma / Reference | P0 | L | L: 3-5 | medium | mobile-ui | ocr-1 | Yes: file bytes/storage policy | Yes: camera/import/review UX | Storage policy and OCR architecture | All receipt intake paths normalize before OCR/upload/storage, preserve policy, and support offline/local-only flows. | No bypass path; no raw source retention by default unless policy approves. | Web upload should follow the same policy when web surface is implemented. |
| D1-CAND-021 | Implement on-device OCR package decision, extraction, and fallback tasks | D1-OCR-002 | OCR/Mobile | feature | Day 1 | `risk:openapi` | Needs architecture breakdown | P0 | L | L: 3-5 | low | mobile-ui | ocr-1 | No, unless API/storage/auth changes are added | Yes: OCR failure/retry/manual-entry UX | Mobile OCR implementation decision | Selects on-device OCR approach and defines offline/local-only extraction, editable review data, fallback, and validation boundaries. | No server-only OCR path; no automatic finalization. | Avoid large ML assets unless explicitly approved. |
| D1-CAND-022 | Implement non-draft shared-bill OCR-to-revision workflow | D1-OCR-004 | OCR/Bills | feature | Day 1 | `risk:money`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | XL | XL: split before estimating | medium | money | ocr-2 | Yes: OCR-to-bill money mutation | Yes: revision apply/review UX | Bill revision and settlement-impact policy | Non-draft shared-bill OCR changes route through revision policy with participant approval, payer reconfirmation, settlement safety, and audit. | No direct non-draft bill rewrite; no automatic apply from OCR completion. | Draft-only apply remains the current safe baseline. |
| D1-CAND-023 | Add duplicate receipt and expense warning implementation issue | D1-OCR-005 | OCR/Bills | feature | Day 1 | `risk:money` | Ready after issue creation | P1 | M | M: 1-2 | medium | api | ocr-2 | Yes, if duplicate warning can block money workflows | Yes, if warning UX is included | OCR/bills matching policy | Duplicate-looking receipts or expenses produce warning states with clear blocking/non-blocking rules and tests. | No silent merge or deletion; no AI-only detection. | Matrix-missing row with clear acceptance criteria. |
| D1-CAND-024 | Break settlement basket UX/API plan into implementation tasks | D1-SETTLE-001 | Settlement | feature | Day 1 | `risk:money`, `manual-gate`, `risk:openapi` | Needs Figma / Reference | P0 | L | L: 3-5 | medium | money | settlement-1 | Yes: settlement money authority | Yes: basket selection and payment UX | Settlement basket runtime exists partially | Users can pay one bill, select visible eligible lines, or pay all outstanding; server persists concrete request lines and exact totals. | No group-wide simplification; no client-selected final truth. | Keep Day 1 same-currency unless FX snapshot task expands it. |
| D1-CAND-025 | Implement residual correction UI and receiver-confirmation tests | D1-SETTLE-002 | Settlement | feature | Day 1 | `risk:money`, `manual-gate` | Needs Figma / Reference | P0 | M | M: 1-2 | high | money | settlement-1 | Yes: under/overpayment clearing policy | Yes: residual outcome UX | Residual runtime foundation | UI and tests show selected total, actual paid amount, delta, proposed residual policy, receiver confirmation, dispute, and resulting balance impact. | No payer-unilateral underpayment waiver; no broad credit ledger. | Existing residual backend should be verified against UX and tests. |
| D1-CAND-026 | Add settlement proof mobile UX and authorization test subtasks | D1-SETTLE-003 | Settlement/Storage | feature | Day 1 | `risk:money`, `risk:storage-authz`, `manual-gate` | Needs Figma / Reference | P1 | M | M: 1-2 | high | storage | settlement-2 | Yes: proof file access and settlement authz | Yes: proof attach/list/read/remove UX | Settlement proof endpoints and storage policy | Mobile can attach/list/read/remove proof where authorized, proof stays optional, and confirmation does not depend on proof existing. | No generic file API; no proof-based auth bypass. | Include safe file metadata only and storage-internal suppression tests. |
| D1-CAND-027 | Add settlement impact policy issue for bill revision apply | D1-SETTLE-004 | Settlement/Bills | feature | Day 1 | `risk:money`, `manual-gate` | Needs manual gate | P0 | L | L: 3-5 | medium | money | settlement-2 | Yes: revision-settlement money authority | Yes: if user-facing reopen/adjust prompts are included | Bill revision apply policy and settlement runtime | Defines invalidation, block, reopen, adjustment, or explicit policy for accepted bill revisions affecting settlements. | No silent settlement balance mutation. | Matrix-missing row; current conservative policy blocks progressed settlement history. |
| D1-CAND-028 | Split offline cache hydration, queue persistence, and conflict resolution tasks | D1-SYNC-001 | Sync | feature | Day 1 | `risk:auth-security`, `risk:money`, `risk:storage-authz`, `manual-gate`, `risk:openapi` | Needs architecture breakdown | P0 | XL | XL: split before estimating | low | full | sync-1 | Yes: depends on operation class | Yes: conflict/offline UX | Sync technical spec; domain-specific authority | Produces scoped sync runtime issues for hydration, queued operations, conflict records, idempotency, authorization, and local pending preservation. | No clients as server-mode financial authority; no silent local/server merge. | Split by domain to avoid one unreviewable sync megatask. |
| D1-CAND-029 | Implement sync status indicator and conflict/failure UI states | D1-SYNC-002 | Sync/Mobile/Notifications | feature | Day 1 | `risk:auth-security` | Needs Figma / Reference | P1 | M | M: 1-2 | medium | mobile-ui | sync-1 | Yes, if mutation/conflict resolution is included | Yes: status, conflict, and failure UX | Sync state model and offline queue | Mobile surfaces queued, syncing, synced, failed, conflict, and preserved pending-state readouts without implying server acceptance. | No automatic conflict overwrite. | Use clear copy for authority boundary and local pending data. |
| D1-CAND-030 | Split recurring creation/editing, forecast, generated-draft confirmation, and notification tasks | D1-RECUR-001 | Recurring | feature | Day 1 | `risk:money`, `manual-gate`, `risk:openapi` | Needs Figma / Reference | P1 | L | L: 3-5 | medium | openapi-client | recurring-1 | Yes: recurring generation affects bills/money | Yes: recurring lifecycle UX | Existing recurring starter endpoints | Day 1 recurring covers create/edit, schedule, due-soon, forecast, explicit generated-draft confirmation, and notification handoffs. | No Day 2 seasonal/flexible-date forecasting or autopay overrides. | Separate auto-generation worker/reminders if they become broad. |
| D1-CAND-031 | Expand notification event coverage by event family | D1-NOTIF-001 | Notifications | feature | Day 1 | `risk:auth-security` | Ready after issue creation | P1 | M | M: 1-2 | medium | api | notifications-1 | Yes, for security-critical notification events | Yes, if new notification UI states are included | Source domain event flows | In-app notification coverage exists for bill, claim, settlement, recurring, sync, security, and OCR event families with tests. | No SMS; no fake delivery success for unsupported channels. | Keep content privacy-safe. |
| D1-CAND-032 | Expand Day 1 email, push provider, device-token, preference, delivery-state, policy, and QA issue set | D1-NOTIF-002 | Notifications | feature | Day 1 | `manual-gate`, `risk:auth-security`, `risk:openapi` | Needs manual gate | P0 | XL | XL: split before estimating | medium | openapi-client | notifications-2 | Yes: provider credentials, push setup, security delivery | Yes: preferences, permission, unsupported/unconfigured UX | Notification decision register and provider policy | Produces scoped issues for SMTP config, push abstraction, device token lifecycle, admin policy, user preferences, quiet hours, digest/immediate, categories, group mute, delivery state, and QA. | No SMS runtime; no user preference overriding disabled admin policy. | Admin/system policy is the hard cap; user/group preferences only narrow. |
| D1-CAND-033 | Implement and test notification deep links for bills, settlements, OCR, sync, and security | D1-NOTIF-003 | Notifications/Mobile | feature | Day 1 | `risk:auth-security` | Needs Figma / Reference | P1 | M | M: 1-2 | medium | mobile-ui | notifications-1 | Yes, if auth/session routing behavior changes | Yes: deep-link routing UX | Stable routes and session handling | Deep links route to authorized screens after session validation and handle missing, stale, or unauthorized records safely. | No notification-provider integration in this issue unless explicitly scoped. | Avoid leaking record existence through deep-link failures. |
| D1-CAND-034 | Add manual reconciliation status and search/filter implementation tasks | D1-RECON-001 | Reconciliation | feature | Day 1 | `risk:money`, `manual-gate`, `risk:openapi` | Needs manual gate | P1 | M | M: 1-2 | medium | openapi-client | reports-1 | Yes: reconciliation status can affect financial workflow | Yes: reconciliation/search UX | Statement reconciliation stays Day 2 | Manual reconciliation status, monthly report support, and search/filter fields exist without statement upload/matching. | No CSV statement upload/matching; no provider evidence; no auto-confirm. | Keep payment method as a reconciliation hint, not mandatory truth. |
| D1-CAND-035 | Expand advanced search/filter and group dashboard issue set | D1-REPORT-001 | Reports/Search | feature | Day 1 | `risk:openapi` | Needs Figma / Reference | P1 | L | L: 3-5 | medium | openapi-client | reports-1 | No, unless money/report authority changes are included | Yes: search/filter/report/group dashboard UX | API support for filters and report summaries | Day 1 search/filter, monthly reports, and group dashboard basics are implementation-ready across mobile/web where supported. | No full dashboard builder or Day 2 enhanced group dashboard. | Backend calculates report truth; clients filter/display only. |
| D1-CAND-036 | Add Day 1 CSV import/export and local backup/restore planning issue | D1-IMPORT-001 | Import/Export/Storage | feature | Day 1 | `risk:storage-authz`, `risk:money`, `manual-gate`, `risk:openapi` | Needs manual gate | P0 | XL | XL: split before estimating | low | storage | import-export-1 | Yes: import/export, backup, privacy, money | Yes: import/export/backup UX | Storage policy, sync authority, local security | Defines Day 1 CSV export, CSV import, local backup/restore, privacy, authority, validation, and explicit local/server migration guardrails. | No statement upload/matching; no silent import-driven financial mutation. | Matrix-missing row; split before implementation. |
| D1-CAND-037 | Add mobile screen-by-screen Day 1 completeness checklist | D1-MOBILE-001 | Mobile UI | hardening | Day 1 | `figma:required` | Needs Figma / Reference | P1 | L | L: 3-5 | high | mobile-ui | mobile-1 | No, unless runtime/API changes are included | Yes: screen completeness and interaction references | Current mobile starter surfaces and QA findings | Checklist maps every Day 1 mobile surface, flow, empty/error/loading state, accessibility expectation, and known missing runtime dependency. | No runtime implementation in checklist issue. | Should reference deferred manual UI retest and current M14/M15 state. |
| D1-CAND-038 | Split user web portal into Day 1 feature-complete surface issues | D1-WEBUSER-001 | Web User | feature | Day 1 | `risk:auth-security`, `risk:openapi`, `figma:required` | Needs Figma / Reference | P0 | XL | XL: split before estimating | medium | openapi-client | web-user-1 | Yes: auth/OpenAPI/storage/money where touched | Yes: user web surface design | Web app currently placeholder; Day 1 capability APIs | Produces subissues for dashboard, bills, groups/friends, settlements, reports/import-export, profile/payment, notifications, account/security, sync/status, receipt/file upload, and QA. | No marketing landing page; no placeholder-only Day 1 web. | Split into 2-4 safe sub-slices per bundle after design. |
| D1-CAND-039 | Split admin web into exposure, policy, audit, maintenance, backup, and QA issues | D1-WEBADMIN-001 | Web Admin | feature | Day 1 | `risk:auth-security`, `risk:storage-authz`, `manual-gate`, `figma:required`, `risk:openapi`, `risk:deploy` | Needs Figma / Reference | P0 | XL | XL: split before estimating | medium | full | web-admin-1 | Yes: admin/public exposure and policy changes | Yes: admin web design | Admin web currently placeholder; deployment-safe exposure policy | Produces subissues for user/invite/registration policy, auth/MFA/passkey policy, notification policy, storage/privacy policy, audit, health/logs/maintenance, backup/restore, deployment-safe settings, and QA. | No public/admin exposure change without gate; no secrets in UI/API responses. | Do not bundle admin security policy with broad UI polish. |
| D1-CAND-040 | Add Day 1 local mode security settings and explicit migration guardrail issue set | D1-LOCAL-001 | Local Mode/Security | feature | Day 1 | `risk:auth-security`, `risk:storage-authz`, `manual-gate` | Needs manual gate | P0 | L | L: 3-5 | medium | mobile-ui | local-mode-1 | Yes: local encryption/key/import behavior | Yes: setup/settings/warning UX | Local/server authority boundary | Local mode supports app PIN, biometric unlock where supported, encrypted local storage/backup/export where feasible, no-collaboration warning, and explicit migration/import guardrails. | No silent local-to-server conversion; no friends/groups/server collaboration in local mode. | Matrix-missing row; may need mobile storage architecture breakdown. |
| D1-CAND-041 | Expand Day 1 deployment readiness checklist by target | D1-DEPLOY-001 | Infra | hardening/docs | Day 1 | `risk:deploy`, `manual-gate` | Needs manual gate | P1 | M | M: 1-2 | high | deploy | infra-1 | Yes: deployment/Docker/env changes | No: docs checklist unless UI is added | TrueNAS/Docker docs and CI requirements | Checklist covers Dockerized self-hosting, TrueNAS compatibility, persistent volumes, env docs, health/readiness, and CI/merge gate evidence. | No silent Docker, CI, deployment, or env changes. | Implementation issues must be separate from checklist-only docs. |
| D1-CAND-042 | Add mobile release evidence and manual sign-off checklist subtasks | D1-DEPLOY-002 | Infra/Mobile Release | docs | Day 1 | `risk:deploy`, `manual-gate` | Needs manual gate | P1 | S | S: 0.5-1 | high | docs-only | infra-1 | Yes: mobile store release is manual-only | No: checklist-only | Codemagic/TestFlight docs | Release evidence checklist captures Codemagic/TestFlight prerequisites, manual sign-off, and no auto-release rule. | No mobile store release or signing change. | Keep Codemagic manual-only unless a future human task says otherwise. |
| D1-CAND-043 | Expand E2E regression rows after coverage matrix review | D1-QA-001 | QA | task/docs | Day 1 | `manual-gate` | Ready after issue creation | P0 | L | L: 3-5 | medium | docs-only | qa-1 | Yes: human acceptance gate remains manual | No | Acceptance evidence package and validation budget docs | E2E regression matrix maps Day 1 flows, hard-gated gaps, manual UI retest, manual code review, and acceptance evidence requirements. | No marking acceptance, manual UI retest, or manual code review as passed. | Should remain docs/control until human gate opens. |
| D1-CAND-044 | Add localization-readiness audit issue for Day 1 surfaces and APIs | D1-L10N-001 | Localization | hardening | Day 1 | `risk:openapi` | Ready after issue creation | P2 | M | M: 1-2 | medium | full | localization-1 | No, unless API/contract changes are included | Yes, if UI copy inventory/design is included | Day 1 English-only but localization-ready rule | Audits hardcoded strings, locale-aware dates/currency, stable error codes, and translatable notification templates across Day 1 surfaces. | No Traditional Chinese UI runtime; no full theme settings. | Matrix-missing row; keep as readiness/guardrail only. |
| D1-CAND-045 | Add cross-record archive/restore/delete restriction audit issue | D1-DELETE-001 | Lifecycle/Archive | hardening | Day 1 | `risk:money`, `risk:storage-authz`, `manual-gate` | Needs manual gate | P0 | M | M: 1-2 | medium | money | lifecycle-1 | Yes: archive/delete affects financial/storage history | Yes, if destructive-warning UX is included | Bill, settlement, file, recurring, export dependencies | Cross-record audit proves financial records archive instead of destructive delete, restore where safe, dependency restrictions, and audit delete attempts. | No permanent destructive delete of financial truth. | Include files, settlements, recurring, imports/exports where applicable. |
| D1-CAND-046 | Add OpenAPI/generated-client change control issue for Day 1 board | D1-OPENAPI-001 | OpenAPI/QA | hardening | Day 1 | `risk:openapi`, `manual-gate` | Needs manual gate | P0 | S | S: 0.5-1 | high | docs-only | qa-2 | Yes: actual contract/generated-client changes | No | Program architecture and client generation rules | Board has explicit gate labels and issue-body requirements for OpenAPI source-of-truth and generated-client refresh. | No contract or generated-client changes in this docs issue. | Use this before generating implementation issues that imply contracts. |
| D1-CAND-047 | Add Day 1 Basic/Guided/Advanced/Help-me-decide experience mode baseline issue set | D1-UXMODE-001 | UX Modes | feature/design | Day 1 | `figma:required`, `risk:openapi` | Needs Figma / Reference | P1 | L | L: 3-5 | medium | openapi-client | uxmode-1 | Yes, if schema/API/preferences are included | Yes: onboarding and settings UX | Experience modes architecture | First launch offers Basic, Guided, Advanced, and Help me decide; users can change mode; required review/security/privacy states still appear. | No backend authority change; no full dashboard builder or large customization system. | Modes affect UI visibility only, not money, authz, storage, audit, sync, or status transitions. |

## Covered Rows Preserved As Non-Candidates

The following covered rows remain non-candidates unless Tommy asks for a later
QA/checklist follow-up:

| Coverage ID | Reason preserved as non-candidate |
|---|---|
| D1-STORAGE-002 | Existing coverage directly audits stable file IDs and no storage internals in API responses. |
| D1-OCR-003 | Existing bug issue is specific and Codex-ready. |
| D1-SYNC-003 | Existing audit issue maps to local/server/cloud authority-boundary guardrails. |
| D1-QA-002 | The coverage matrix itself documents that the 64 seeded issues are not complete Day 1 coverage. |
| D1-SCOPE-001 | The decision register now records the PRD V5 versus MVP Day 1 row-by-row rule. |

## Deferred Rows Preserved Outside Day 1 Runtime Candidates

These rows stay deferred and should not become Day 1 runtime issues unless a
later explicit Tommy decision promotes a focused slice:

| Coverage ID | Deferred scope |
|---|---|
| D1-RECUR-002 | Day 2 seasonal/flexible-date recurring forecasting. |
| D1-RECUR-003 | Day 2 autopay policy defaults and per-recurring paid-state overrides. |
| D1-DAY2-001 | Day 2 Frankfurter/provider FX, currency registry, and context FX profiles. |
| D1-DAY2-002 | Day 2 guest/accountless group members beyond minimal Day 1 temporary participants. |
| D1-DAY2-003 | Day 2 statement upload/matching, lock periods, refunds, deposits, simplification, and payment requests. |
| D1-DAY3-001 | Day 3/future AI provider settings, category suggestions, summaries, Q&A, and anomaly explanation. |
| D1-DAY3-002 | Day 3/future payment provider integration, provider payment attempts, webhooks, and generated payment instructions. |

Day 1 readiness/guardrail candidates above intentionally do not promote these
deferred runtime domains.

## Suggested Bundles

Bundle IDs are recommendations for later issue creation and triage. Use them
only when each issue in the bundle has compatible risk, validation class, review
surface, and rollback scope.

Safe bundle patterns:

| Bundle ID | Candidate IDs | Notes |
|---|---|---|
| auth-security-1 | D1-CAND-001, D1-CAND-002, D1-CAND-003 | Related auth onboarding/session/password planning, but implementation may still split because all are manual-gated. |
| profile-payment-1 | D1-CAND-005 | Keep profile/payment UI separate from storage policy and settlement money. |
| storage-1 | D1-CAND-006 | Purpose-specific upload policy is storage-gated and should not bundle with broad UI polish. |
| storage-privacy-1 | D1-CAND-007 | Vault work is too sensitive to bundle with unrelated storage UI. |
| bills-core-1 | D1-CAND-008, D1-CAND-009 | Same money/bill lifecycle surface; do not add unrelated UI polish. |
| bills-core-2 | D1-CAND-010 | Temporary participants cross auth and money; keep separate. |
| tax-1 | D1-CAND-014, D1-CAND-015 | Only bundle after architecture split proves schema/money/OCR/UI review remains manageable. |
| tax-2 | D1-CAND-017 | Receipt-total mismatch is a focused money correctness candidate. |
| groups-2 | D1-CAND-019 | Friends/direct sharing should split into 2-4 sub-slices before implementation. |
| ocr-1 | D1-CAND-020, D1-CAND-021 | Capture/import and on-device OCR are adjacent but may need separate mobile/storage validation. |
| ocr-2 | D1-CAND-022, D1-CAND-023 | Duplicate warning can proceed separately if non-draft OCR revision apply is blocked. |
| settlement-1 | D1-CAND-024, D1-CAND-025 | Basket and residual UX are related money surfaces. |
| settlement-2 | D1-CAND-026, D1-CAND-027 | Do not implement proof storage and settlement-impact policy in one PR unless tightly scoped. |
| sync-1 | D1-CAND-028, D1-CAND-029 | Runtime sync architecture should split from UI status if manual gates trigger. |
| notifications-1 | D1-CAND-031, D1-CAND-033 | In-app event coverage and deep links are related if auth routing is bounded. |
| notifications-2 | D1-CAND-032 | Email/push/provider policy is manual-gated and should split before runtime. |
| reports-1 | D1-CAND-034, D1-CAND-035 | Manual reconciliation and search/report work may bundle only if contract/money risk stays narrow. |
| infra-1 | D1-CAND-041, D1-CAND-042 | Checklist/docs can bundle; runtime deploy/release changes cannot. |
| qa-1 | D1-CAND-043 | Keep acceptance evidence separate from implementation. |
| qa-2 | D1-CAND-046 | OpenAPI gate metadata is workflow-only until implementation issues exist. |
| uxmode-1 | D1-CAND-047 | UI mode baseline needs Figma/reference before implementation. |

Do not bundle:

- Multiple manual-gated domains together.
- Security-critical work with broad UI polish.
- Money/settlement calculation changes with unrelated UI.
- OpenAPI/generated-client work with unrelated runtime work.
- Migration work with broad product features.
- Storage/authz changes with unrelated file UI.

## Candidate Count Summary

| Dimension | Count summary |
|---|---|
| Total candidates | 47 |
| By suggested status | `Needs manual gate`: 24; `Needs Figma / Reference`: 14; `Needs architecture breakdown`: 5; `Ready after issue creation`: 4; `Blocked by dependency`: 0 |
| By priority | `P0`: 32; `P1`: 14; `P2`: 1; `P3`: 0 |
| By size | `S`: 2; `M`: 15; `L`: 19; `XL`: 11 |
| By validation class | `openapi-client`: 12; `money`: 12; `mobile-ui`: 8; `storage`: 4; `api`: 3; `docs-only`: 3; `full`: 3; `migration`: 1; `deploy`: 1 |
| By risk label | `manual-gate`: 35; `risk:openapi`: 24; `risk:money`: 22; `risk:auth-security`: 17; `risk:storage-authz`: 11; `figma:required`: 4; `risk:migration`: 3; `risk:deploy`: 3 |

Risk-label counts are non-exclusive because one candidate can carry multiple
labels.

## Ambiguous Rows And Review Notes

- The prompt says 6 missing rows, while the checked-in coverage matrix says 7.
  This document includes all 7 matrix-missing rows.
- Several `XL` candidates are intentionally not implementation-ready. They need
  architecture breakdown into smaller schema/API/UI/QA issues before Codex
  implementation.
- Some candidates list `Needs Figma / Reference` even when manual gates may
  also apply. This means the next triage blocker is visual/reference readiness;
  runtime implementation still must honor manual gates if it touches auth,
  storage, money, OpenAPI, migrations, deployment, or admin exposure.
- Day 1 web-user and web-admin scope is approved, but both are too large to
  become single implementation issues. They should be split after Tommy approves
  this candidate backlog and after Figma/reference exists.
- Import/export/local backup is Day 1 in MVP scope, but it crosses storage,
  privacy, money, local/server authority, and migration boundaries. Keep it
  manual-gated and split before runtime.

## Issue-Generation Safety Notes

- This document must be reviewed before any script creates or updates GitHub
  issues.
- Actual issue creation must be a separate task after Tommy approves this
  candidate backlog.
- Do not create, update, label, close, sync, or move GitHub issues or Project
  items from this document task.
- Later generated issue bodies must include required reading, scope, non-goals,
  acceptance criteria, dependencies, manual/Figma gates, validation class, and
  report requirements.
- Later generated issue bodies should explicitly confirm that no forbidden
  runtime, API, security, money, schema, deployment, or secret changes are
  allowed unless that issue scope and manual gate approve them.
