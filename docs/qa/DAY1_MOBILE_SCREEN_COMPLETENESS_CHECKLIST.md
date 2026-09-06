# Day 1 mobile screen completeness checklist

Audit: Issue [#407](https://github.com/tommytang213/Settleora/issues/407), task `20260906-2230`, 2026-09-06. Source baseline:
`2b7e39d24cf39b4900d7f0bce0b1da36c0b8467f` (`origin/main`). This is a
current-source documentation/control inventory, not runtime implementation or
Day 1 acceptance. Clients remain presentation/form/cache/queue owners; the API
owns server authorization, money, status, file access, sync acceptance and audit.

## Reading and counting rules

Each canonical destination/flow appears once in the active M01–M58 rows. M07 and M54 are retired optional-scope identifiers (see exclusions); IDs are not reused. Entry aliases and
embedded/pushed variants are included in their canonical row, not counted again.
M49–M50 are cross-cutting component/acceptance flows included in the same totals.
Source symbols and named test cases below are current, inspected evidence; tests
were not rerun for this docs-only audit. Adjacent tests on absent flows are
explicitly not implementation evidence. A component/happy-path test is not full
screen acceptance.

- `complete`: accepted bounded flow with source, meaningful state tests and
  completed scoped issue evidence; does not close its broader product parent.
- `partial`: useful behavior exists but required capability, state or acceptance
  evidence is incomplete.
- `missing`: intended mobile surface is absent; row explains whether underlying
  capability exists.
- `blocked`: a missing/partial surface needs an explicit authority/reference/
  security/platform decision before a safe implementation contract can be given.
- State vectors: **E** empty; **L** loading; **R** error/retry; **D**
  denied/unavailable; **O** offline/conflict. These describe inspected code;
  named tests establish only the behavior they exercise, not every vector cell.
- One **owner** per remaining gap. Dependencies/parents are context, not second
  implementation owners. Audit owners must reconcile/split before runtime;
  their broad issue is not an executable implementation contract.
- Historical accepted captures are provenance only. Harness presence means
  reproducible branch-rendered fixtures exist, not that [#407](https://github.com/tommytang213/Settleora/issues/407) rendered or approved
  unseen UI. No new Figma or screenshots were required or created here.

Totals: **56 rows — complete 2, partial 37, missing 9, blocked 8**.

## Canonical inventory

### M01 — First launch / server-local authority choice

- Status: `partial`. Requirement/reference: PRD: identity and sync; Shell, Settings.
- Source: [SettleoraSetupScreen](../../apps/mobile/lib/app/setup_screen.dart); [SettleoraAppBootstrap](../../apps/mobile/lib/app/app_bootstrap.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `setup saves local mode without creating a server repository`; [widget_test.dart](../../apps/mobile/test/widget_test.dart): `setup rejects invalid server base URLs before saving`.
- States: E initial choice; L save busy; R URL validation and initial storage-read recovery; configuration save failure has no bounded feedback; D only syntactic URL validation on fresh setup; unreachable/incompatible-server setup feedback is uncovered; O local choice persists, operational workspace M02.
- Accessibility/visual: Labels, scroll and shared controls exist; shell capture harness; exhaustive large-text/keyboard/platform acceptance unproven.
- Owner: [#301](https://github.com/tommytang213/Settleora/issues/301). Remaining: Bounded setup exists, but _save and _saveConfiguration lack save-error mapping; add bounded save-failure presentation/tests in a focused state-pattern slice. Fresh setup does not probe server reachability/capability; _load contacts currentUser only for a saved session. The unconditional StatusChip labeled Server checked (setup_screen.dart) falsely implies verification; correct or condition that claim under this same state-pattern owner. The uncovered setup feedback belongs this owner, with any new connection contract reviewed separately. Per-device onboarding acceptance stays M50; experience modes are M45, not another authority mode.
- Gate/dependency: None for evidence-only work. Order: **W5**.

### M02 — Local-only operational workspace

- Status: `missing`. Requirement/reference: PRD: local-only expenses/offline; Settings.
- Source: [_BootstrapStateScreen](../../apps/mobile/lib/app/app_bootstrap.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `setup saves local mode without creating a server repository`.
- States: E local placeholder; L/R/D/O functional local record states absent.
- Accessibility/visual: Placeholder copy is not local bills/OCR/backup accessibility or visual evidence.
- Owner: [#971](https://github.com/tommytang213/Settleora/issues/971). Remaining: Selecting local mode reaches a placeholder with Connect to Server, not an operational local record/OCR/backup workspace. Underlying local product capability is absent.
- Gate/dependency: Local storage/security and migration boundaries; [#408](https://github.com/tommytang213/Settleora/issues/408) dependency. Order: **W4**.

### M03 — Local-account sign-in / refreshed session entry

- Status: `partial`. Requirement/reference: PRD: accounts/identity; Auth, Reset.
- Source: [SettleoraSignInScreen](../../apps/mobile/lib/app/sign_in_screen.dart); [SettleoraAppBootstrap](../../apps/mobile/lib/app/app_bootstrap.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `successful sign-in stores session and reaches the shell`; [widget_test.dart](../../apps/mobile/test/widget_test.dart): `bootstrap refreshes an expired access session before shell`; [widget_test.dart](../../apps/mobile/test/widget_test.dart): `network sign-in failure maps to a safe retry state`.
- States: E forms; L sign-in/session loading busy; R bounded validation/failure; D invalid/expired session prevents shell; O server-unavailable feedback, no offline authentication.
- Accessibility/visual: Autofill and next/done actions exist; setup/sign-in capture harness; physical-device focus/secure-input acceptance unproven.
- Owner: [#965](https://github.com/tommytang213/Settleora/issues/965). Remaining: Existing login and refreshed session shell must be retained; final auth/platform acceptance is not established by route tests. Additional onboarding methods are M04.
- Gate/dependency: Auth/security; [#777](https://github.com/tommytang213/Settleora/issues/777) exposure acceptance separate. Order: **W3**.

### M04 — Invitation / registration / OIDC mobile entry

- Status: `blocked`. Requirement/reference: PRD: configurable onboarding default-off; Auth.
- Source: [SettleoraSignInScreen](../../apps/mobile/lib/app/sign_in_screen.dart); [SettleoraAppBootstrap](../../apps/mobile/lib/app/app_bootstrap.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `setup rejects invalid server base URLs before saving`.
- States: E/L/R/D/O no method-specific mobile surface; local-account fallback is not implementation.
- Accessibility/visual: Existing auth reference only; method-specific platform/redirect and denied-state acceptance absent.
- Owner: [#965](https://github.com/tommytang213/Settleora/issues/965). Remaining: Mobile invitation acceptance, public registration and OIDC entry are absent from current entry UI. Invitation backend work exists; do not infer all underlying auth is missing. Reconcile [#784](https://github.com/tommytang213/Settleora/issues/784)/#786/#787/#788 before UI admission.
- Gate/dependency: Auth, redirect/provider, registration policy and any contract changes. Order: **W3**.

### M05 — Sessions/devices / logout / revoke / sign out all

- Status: `partial`. Requirement/reference: PRD: sessions and revocation; Settings, Auth.
- Source: [SettleoraSessionListScreen](../../apps/mobile/lib/app/server_mode_shell.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `session revoke confirmation and in-flight state prevent duplicate revoke`; [widget_test.dart](../../apps/mobile/test/widget_test.dart): `session revoke success preserves safe state when refresh fails`; [widget_test.dart](../../apps/mobile/test/widget_test.dart): `session list sign-out-all clears local session after backend call`.
- States: E no sessions; L load/revoke busy; R safe retry and retained returned state; D session-ended handler; O network failure is not offline revocation.
- Accessibility/visual: Session confirmations exist; private Material panel/dialog usage needs alignment review; exhaustive device/focus acceptance absent.
- Owner: [#338](https://github.com/tommytang213/Settleora/issues/338). Remaining: Bounded session lifecycle is implemented. Device-bound persistent sign-in and broader security event acceptance remain separate [#1059](https://github.com/tommytang213/Settleora/issues/1059)/#965 dependencies; do not recreate revoke.
- Gate/dependency: Auth/session/security. Order: **W3**.

### M06 — Password reset request

- Status: `complete`. Requirement/reference: PRD: account recovery; Reset.
- Source: [_requestReset](../../apps/mobile/lib/app/sign_in_screen.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `forgot password opens the reset request form`; [widget_test.dart](../../apps/mobile/test/widget_test.dart): `password reset failure uses generic safe copy`.
- States: E request form; L busy; R generic safe failure/retry; D non-enumerating request result; O bounded connection failure.
- Accessibility/visual: Accepted scoped password-reset package and [#771](https://github.com/tommytang213/Settleora/pull/771)/#778 completion; no new visual approval made here.
- Owner: [#339](https://github.com/tommytang213/Settleora/issues/339). Remaining: No remaining gap in the accepted reset-request surface. MFA remains M08; optional mobile reset-link continuation #772 is excluded from Day 1 counts.
- Gate/dependency: None for evidence-only work. Order: **Retain**.

### M08 — Passkey / TOTP / recovery-code enrollment and challenge

- Status: `blocked`. Requirement/reference: PRD: Day 1 MFA/passkeys; Auth.
- Source: [SettleoraSignInScreen](../../apps/mobile/lib/app/sign_in_screen.dart); [_AppSettingsScreen](../../apps/mobile/lib/app/server_mode_shell.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `forgot password opens the reset request form`.
- States: E/L/R/D/O no factor enrollment/challenge/recovery mobile flow; adjacent sign-in test only.
- Accessibility/visual: Approved auth frames exist; native credential, recovery disclosure and focus evidence absent.
- Owner: [#776](https://github.com/tommytang213/Settleora/issues/776). Remaining: Mobile factor UI is absent while schema/contracts/API slices [#501](https://github.com/tommytang213/Settleora/issues/501)–[#506](https://github.com/tommytang213/Settleora/issues/506) are closed. [#394](https://github.com/tommytang213/Settleora/issues/394) remains umbrella; no recreation of API factor runtime.
- Gate/dependency: Auth/security and platform factor APIs; [#965](https://github.com/tommytang213/Settleora/issues/965) reconciliation. Order: **W3**.

### M09 — Home dashboard and actionable metrics

- Status: `partial`. Requirement/reference: PRD: dashboard; Shell.
- Source: [_DashboardMetricChip](../../apps/mobile/lib/app/server_mode_shell.dart).
- Tests: [server_mode_shell_dashboard_test.dart](../../apps/mobile/test/server_mode_shell_dashboard_test.dart): `dashboard overview renders repository summaries`; [server_mode_shell_dashboard_test.dart](../../apps/mobile/test/server_mode_shell_dashboard_test.dart): `dashboard cards navigate to existing mobile surfaces`; [server_mode_shell_dashboard_test.dart](../../apps/mobile/test/server_mode_shell_dashboard_test.dart): `dashboard retries bounded load failures`.
- States: E honest empty sections; L overview loading; R retry/stale overview; D unavailable repositories; O stale warning, not hydrated cache.
- Accessibility/visual: Historical [#672](https://github.com/tommytang213/Settleora/issues/672) shell capture; static cards and route semantics need focused actionability comparison.
- Owner: [#299](https://github.com/tommytang213/Settleora/issues/299). Remaining: Home is a dashboard, not a missing menu replacement. Reconcile static summary affordances and meaningful filtered metric handoffs; Accounts & income already has More access.
- Gate/dependency: None for evidence-only work. Order: **W1**.

### M10 — Personal bills list / detail / loaded search

- Status: `partial`. Requirement/reference: PRD: personal expenses; Bills.
- Source: [SettleoraBillListScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [_BillDetailHeader](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `bill detail distinguishes filtered empty from true empty`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `bill detail combines search with filter chips`.
- States: E true/filtered empty; L list/detail load; R refresh/retry; D bounded unavailable/session; O queue badges exist, full cache M36.
- Accessibility/visual: MoneyText, shared panels and labeled filters exist; full route text-scale/focus acceptance unproven; bills capture harness.
- Owner: [#975](https://github.com/tommytang213/Settleora/issues/975). Remaining: Functional list/detail/search exists. Remaining row-specific acceptance is long-detail reading, scaling and platform back/scroll evidence; edit/lifecycle M13 and reconciliation M39 are separate.
- Gate/dependency: None for evidence-only work. Order: **W5**.

### M11 — Personal bill create / shared bill metadata / draft receipt handoff

- Status: `partial`. Requirement/reference: PRD: create/itemized expenses; Bills.
- Source: [SettleoraPersonalBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [SettleoraPersonalBillCreateDraft](../../apps/mobile/lib/bills/bill_repository.dart); [SettleoraGroupBillCreateDraft](../../apps/mobile/lib/bills/bill_repository.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `create save sends expected personal bill draft strings`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `attachment upload failure after create is retryable without duplicate bill create`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal bill create prompts before discarding edited draft`.
- States: E initial form/item validation; L create/upload busy; R preserves draft and retries remaining upload; D missing receipt seam bounded; O no offline create acceptance.
- Accessibility/visual: Shared DateField/MoneyInput; discard and validation tests; bills capture harness, complete keyboard/large-form acceptance absent.
- Owner: [#967](https://github.com/tommytang213/Settleora/issues/967). Remaining: Existing create and duplicate-safe upload must be retained. Personal/group drafts expose item.note and adjustment.reasonNote, but no category or bill-level note/comment field; current screens have no category editor or whole-bill/shared-note discussion surface. These explicit PRD Expenses and trust-workflow gaps belong #967 once here (including shared bills); establish current domain/API capability before extending UI or proposing a comment system. The optional personal-bill payment method is also missing from the form/_save: payerPaymentMethodLabelSnapshot already exists in the draft, generated repository and CreatePersonalBillRequest, but is never supplied by the screen. #967 owns mobile selection/wiring and acceptance, not a duplicate contract. Rich bill components are explicitly M58; specialized claims/FX/OCR corrections are owned separately below.
- Gate/dependency: Money/API and storage if expanding create payload or upload behavior. Order: **W4**.

### M12 — Group bill create / submit / participant accept-reject

- Status: `partial`. Requirement/reference: PRD: shared bills/multi-payer acknowledgement; Bills, Groups.
- Source: [SettleoraGroupBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [_GroupBillAcknowledgementActions](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill create happy path smoke reaches submitted detail`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill detail blocks duplicate participant action taps`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill participant failure shows bounded retryable state refresh`.
- States: E active-member requirement; L create/submit/ack busy; R retry without duplicate create; D loaded participant/status eligibility and member failure block actions; accept/reject calls mutate before refresh, with bounded API rejection; O online-only create, queue not claimed.
- Accessibility/visual: Guided assignment sections and shared money fields; group/bills captures; payer confirmation/platform acceptance still incomplete.
- Owner: [#346](https://github.com/tommytang213/Settleora/issues/346). Remaining: Group create, split/payer entry, submit and accept/reject exist. Category and whole-bill/shared-note metadata gaps are M11/#967. Remaining on-behalf-of/paid-by confirmation coverage must be reconciled against API capability, not added as a second group-create UI.
- Gate/dependency: Money/payer/participant authority; [#967](https://github.com/tommytang213/Settleora/issues/967) dependency. Order: **W4**.

### M13 — Bill edit / archive / restore lifecycle

- Status: `partial`. Requirement/reference: PRD: safe edit/archive/restore; Bills.
- Source: [SettleoraBillListScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [_CreateRevisionAction](../../apps/mobile/lib/bills/bill_list_screen.dart); [archiveGroupBill](../../packages/client-dart/lib/generated/client.dart); [restoreGroupBill](../../packages/client-dart/lib/generated/client.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `bill list queues archive and flushes through sync`; [bill_sync_controller_test.dart](../../apps/mobile/test/bill_sync_controller_test.dart): `queues archive and restore using empty safe payloads`.
- States: E no actionable records; L queued/in-flight guards; R retry-later/conflict; D server/sync acceptance after enqueue; archive/restore has no pre-action capability guard (revision guards are separate); O personal archive/restore queue only.
- Accessibility/visual: Existing controls/captures do not prove all group draft edit/archive/restore and terminal states.
- Owner: [#345](https://github.com/tommytang213/Settleora/issues/345). Remaining: Personal archive/restore queue and revision entry exist; archive/restore buttons gate only busy/open-operation state and choose action from isArchived. Lifecycle eligibility/denied presentation before enqueue remains #345 work; general draft edit is not proven. Group archive/restore API and generated archiveGroupBill/restoreGroupBill already exist with idempotent authorization/settlement guards; the handwritten mobile group repository/screens do not expose them. Remaining group parity is mobile repository/UI, capability presentation, queue policy and acceptance, not API recreation. Keep lifecycle policy [#718](https://github.com/tommytang213/Settleora/issues/718)/#960 separate from broad UI changes.
- Gate/dependency: Lifecycle/money, sync and any API contract changes. Order: **W4**.

### M14 — Bill revision proposal / review / approvals

- Status: `partial`. Requirement/reference: PRD: revision-specific approval and impact; Revision.
- Source: [SettleoraBillRevisionProposalEditorScreen](../../apps/mobile/lib/bills/bill_revision_proposal_editor_screen.dart); [SettleoraBillRevisionReviewScreen](../../apps/mobile/lib/bills/bill_revision_review_screen.dart).
- Tests: [bill_revision_review_screen_test.dart](../../apps/mobile/test/bill_revision_review_screen_test.dart): `review screen renders server review context and accessible markers`; [bill_revision_review_screen_test.dart](../../apps/mobile/test/bill_revision_review_screen_test.dart): `submit stops when refreshed server capability denies`; [bill_revision_proposal_editor_screen_test.dart](../../apps/mobile/test/bill_revision_proposal_editor_screen_test.dart): `revise save refreshes capability and sends supported fields`.
- States: E no baseline => full review; L refresh/action busy; R failed mutation recovery; D server actions/approval basis gate buttons; O stale capability refresh, no offline approval.
- Accessibility/visual: Accessible changed markers and revision capture harness; full item/attachment/adjustment snapshot highlighting not proven.
- Owner: [#402](https://github.com/tommytang213/Settleora/issues/402). Remaining: Server review, propose/revise/submit/withdraw/approve/reject/payer actions exist. Full granular snapshots and accepted-revision settlement impact acceptance remain bounded by domain capability, not a client diff algorithm.
- Gate/dependency: Money/revision/settlement policy; [#967](https://github.com/tommytang213/Settleora/issues/967) dependency. Order: **W4**.

### M15 — Item assignment / quantity and open self-claim

- Status: `partial`. Requirement/reference: PRD: quantity-level and unresolved claiming; Bills.
- Source: [_GroupBillAcknowledgementActions](../../apps/mobile/lib/bills/bill_list_screen.dart); [SettleoraGroupBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill assign item sheet renders quantity split controls`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill receipt items hides raw split controls and keeps quantity local`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill assign item sheet applies exact amounts locally`.
- States: E no eligible member; L member fetch; R form validation; D active-member options; O local draft assignment is not accepted offline claim.
- Accessibility/visual: Assignment sheets exist; no complete server-accepted quantity/open-claim state evidence.
- Owner: [#350](https://github.com/tommytang213/Settleora/issues/350). Remaining: Local assignment, exact amounts and share weights exist. Quantity UI does not establish persisted self-claim/unresolved workflow; reconcile server capability first.
- Gate/dependency: Money/claim ownership and contract; [#967](https://github.com/tommytang213/Settleora/issues/967) dependency. Order: **W4**.

### M16 — Participant/user/group selection primitives

- Status: `partial`. Requirement/reference: PRD: participant selection; Bills, Groups, DSL.
- Source: [SettleoraGroupBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [SettleoraGroupDetailScreen](../../apps/mobile/lib/groups/group_list_screen.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `group bill payer member picker searches and selects safely`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill create member menus use active members only`.
- States: E empty/filtered member list; L member load; R load/validation feedback; D active members only; O loaded choices only, no permission grant.
- Accessibility/visual: Searchable private selectors exist; consistent focus, scaling and reusable selector boundary unproven.
- Owner: [#301](https://github.com/tommytang213/Settleora/issues/301). Remaining: Consolidate repeated picker presentation only where behavior matches; no global user directory or inferred authorization. Temporary identities are M27.
- Gate/dependency: None for evidence-only work. Order: **W1**.

### M17 — Bill receipt/supporting attachment list/upload/read/remove

- Status: `partial`. Requirement/reference: PRD: authorized receipt/file sharing; Bills.
- Source: [BillAttachmentSection](../../apps/mobile/lib/bills/bill_attachment_section.dart).
- Tests: [bill_attachment_section_test.dart](../../apps/mobile/test/bill_attachment_section_test.dart): `labels refresh and retry controls accessibly`; [bill_attachment_section_test.dart](../../apps/mobile/test/bill_attachment_section_test.dart): `blocks duplicate and conflicting actions while downloading`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal bill attachment download reports bounded bytes only`.
- States: E no files/filtered empty; L list and single-flight actions; R safe upload/download/remove retry; D scoped route and receipt-purpose controls; O no durable offline bytes.
- Accessibility/visual: Dedicated attachment semantics; download currently reports bounded bytes, not proof of a usable file viewer.
- Owner: [#966](https://github.com/tommytang213/Settleora/issues/966). Remaining: Attach/list/remove and authorized download seams exist. Actual mobile content viewing/sharing, policy parity and private file acceptance remain storage-owned; no generic file API inferred.
- Gate/dependency: Storage/privacy/file-byte authorization. Order: **W4**.

### M18 — Receipt camera/gallery/import normalization

- Status: `partial`. Requirement/reference: PRD: normalized receipt intake on every entry; Bills.
- Source: [ImagePickerReceiptImageIntake](../../apps/mobile/lib/receipt_ocr_capture/receipt_image_intake.dart); [ReceiptImageArtifactProcessor](../../apps/mobile/lib/receipt_ocr_capture/receipt_image_artifact_processor.dart); [_processedReceiptAttachmentArtifact](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal bill receipt image permission error keeps manual entry`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal bill scan receipt reviews and applies OCR suggestions`; [receipt_ocr_capture/receipt_image_artifact_processor_test.dart](../../apps/mobile/test/receipt_ocr_capture/receipt_image_artifact_processor_test.dart): `produces normalized JPEG and thumbnail bytes from PNG input`.
- States: E cancel unchanged; L picker/provider busy; R safe picker errors; D permission-denied manual path; O artifacts in memory, secure cache deferred.
- Accessibility/visual: Capture guidance exists; camera/native permission and all intake variants need device evidence.
- Owner: [#358](https://github.com/tommytang213/Settleora/issues/358). Remaining: Personal/group camera/gallery and file-import intake call _processedReceiptAttachmentArtifact, which invokes processor.process and replaces supported input with normalized JPEG upload bytes. This integration is already implemented. The helper retains file.localPath; _runReceiptOcrPreview passes that original path, and MlKitReceiptOcrProvider uses InputImage.fromFilePath rather than normalized request bytes. Normalized native-OCR input/path parity is still missing. On failed processing the helper returns the original file, which stays uploadable; safe handling/blocking of failed decode/normalization is also an uncovered #358 boundary, not successful normalized intake. Share-sheet, replacement and offline queue normalization parity and secure-cache/device acceptance remain unproven; do not recreate camera/gallery/file wiring.
- Gate/dependency: Storage/image retention/privacy; no client override of API upload policy. Order: **W4**.

### M19 — On-device OCR extraction and parser quality

- Status: `partial`. Requirement/reference: PRD: on-device OCR; Bills.
- Source: [MlKitReceiptOcrProvider](../../apps/mobile/lib/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart); [ReceiptOcrParser](../../apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart).
- Tests: [receipt_ocr_capture/receipt_ocr_parser_test.dart](../../apps/mobile/test/receipt_ocr_capture/receipt_ocr_parser_test.dart): `parser extracts provisional HKD receipt candidates`; [receipt_ocr_capture/receipt_ocr_parser_test.dart](../../apps/mobile/test/receipt_ocr_capture/receipt_ocr_parser_test.dart): `parser extracts minimal Japanese receipt totals and charges`.
- States: E empty text => manual failure; L recognition in flight; R failure/manual path; D iOS/Android gate; O device OCR available independently of API, local workspace M02.
- Accessibility/visual: ML Kit Latin recognizer and fake/parser tests are not Chinese receipt recognition proof.
- Owner: [#959](https://github.com/tommytang213/Settleora/issues/959). Remaining: Focused HK Chinese receipt parser defect already owned by [#959](https://github.com/tommytang213/Settleora/issues/959) under [#740](https://github.com/tommytang213/Settleora/issues/740)/#970; no replacement parser ticket. Native language/provider coverage beyond this defect stays with [#970](https://github.com/tommytang213/Settleora/issues/970) reconciliation.
- Gate/dependency: OCR output stays provisional; native provider changes need scoped platform validation. Order: **W1**.

### M20 — OCR failure / unsupported / retry / manual fallback

- Status: `partial`. Requirement/reference: PRD: offline OCR fallback; Bills.
- Source: [MlKitReceiptOcrProvider](../../apps/mobile/lib/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart); [_ReceiptOcrPreviewPanel](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal bill OCR failure keeps manual entry and supports retry`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `group bill receipt scan shows unsupported manual path`.
- States: E no readable candidate; L busy; R retry/manual entry; D unsupported platform/permission; O local-only operational path absent M02.
- Accessibility/visual: Existing manual fallback and tests; cross-platform/local-mode fallback acceptance not established.
- Owner: [#438](https://github.com/tommytang213/Settleora/issues/438). Remaining: Do not implement fallback from scratch. Remaining acceptance concerns native failures and safe no-data-loss behavior once local workspace exists. Existing references cover derivative states; material new flow still needs focused review.
- Gate/dependency: Local workspace dependency; preserve any [#438](https://github.com/tommytang213/Settleora/issues/438) focused reference gate. Order: **W4**.

### M21 — Saved OCR queue / detail / correction

- Status: `partial`. Requirement/reference: PRD: reviewed OCR candidates; Bills.
- Source: [ReceiptOcrReviewQueueScreen](../../apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_screen.dart); [ReceiptOcrReviewDetailScreen](../../apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_screen.dart); [_ReceiptOcrReviewEditForm](../../apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_detail_content.dart).
- Tests: [receipt_ocr_review_screen_test.dart](../../apps/mobile/test/receipt_ocr_review_screen_test.dart): `keeps last-known reviews visible when refresh fails`; [receipt_ocr_review_screen_test.dart](../../apps/mobile/test/receipt_ocr_review_screen_test.dart): `saves edits through the group route and blocks conflicts`; [receipt_ocr_review_screen_test.dart](../../apps/mobile/test/receipt_ocr_review_screen_test.dart): `labels preview apply controls and issue chips safely`.
- States: E empty candidates/filtered empty; L queue/detail/save busy; R retained data and safe retry; D typed scoped routes; O pending edit retained, not offline acceptance.
- Accessibility/visual: Labeled actions/queue semantics and OCR capture harness; complete rich correction/platform coverage absent.
- Owner: [#970](https://github.com/tommytang213/Settleora/issues/970). Remaining: Saved queue/read/edit/delete is implemented. Required merge/split/reclassify, tax-category/refund/fee correction and source lineage need reconciliation against [#397](https://github.com/tommytang213/Settleora/issues/397)/#398/#429; never infer automatic finalization.
- Gate/dependency: OCR/money/contract; [#429](https://github.com/tommytang213/Settleora/issues/429) reference exists, do not recreate broad Figma. Order: **W4**.

### M22 — OCR apply-preview / draft apply / non-draft revision handoff

- Status: `partial`. Requirement/reference: PRD: explicit OCR acceptance; Bills, Revision.
- Source: [_ApplyPreviewSection](../../apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_detail_content.dart); [_SavedReceiptOcrApplyPreviewCard](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [receipt_ocr_review_screen_test.dart](../../apps/mobile/test/receipt_ocr_review_screen_test.dart): `blocks duplicate preview and apply actions while busy`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal blocked saved OCR review preview shows reasons and no apply`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal saved OCR apply refresh failure does not repeat apply mutation`.
- States: E no review/route => unavailable; L preview/apply single flight; R safe refresh/retry; D blocked reasons/confirmation; O stale results never accepted locally.
- Accessibility/visual: Saved OCR capture harness exists; non-draft proposal reference [#442](https://github.com/tommytang213/Settleora/issues/442) remains a distinct gate.
- Owner: [#360](https://github.com/tommytang213/Settleora/issues/360). Remaining: Draft preview/confirmed apply exists; backend non-draft routing [#528](https://github.com/tommytang213/Settleora/issues/528) is closed. Mobile complete non-draft proposal/affected-user UX is not established; use [#442](https://github.com/tommytang213/Settleora/issues/442) dependency, not duplicate API routing.
- Gate/dependency: Focused [#442](https://github.com/tommytang213/Settleora/issues/442) reference plus revision/money policy. Order: **W4**.

### M23 — Duplicate receipt/expense warning

- Status: `partial`. Requirement/reference: PRD: duplicate warning; Bills.
- Source: [BillDuplicateWarning](../../apps/mobile/lib/bills/bill_list_screen.dart); [_ReceiptDuplicateWarningBanner](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal OCR duplicate warning uses corrected merchant date currency`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal OCR duplicate save confirmation cancel keeps draft`.
- States: E no match => no warning; L loaded candidate context; R draft preserved; D unavailable match omits open action; O local heuristic is not complete server duplicate search.
- Accessibility/visual: Warning/cancel/review-existing controls tested; scope completeness and native acceptance remain.
- Owner: [#401](https://github.com/tommytang213/Settleora/issues/401). Remaining: Warning and save-anyway/cancel already exist. Completeness across authorized records and intake paths is not established; warn rather than silently discard or claim server duplicate truth.
- Gate/dependency: None for evidence-only work. Order: **W4**.

### M24 — Groups / member management

- Status: `partial`. Requirement/reference: PRD: group roles and historic membership; Groups.
- Source: [SettleoraGroupListScreen](../../apps/mobile/lib/groups/group_list_screen.dart); [SettleoraGroupDetailScreen](../../apps/mobile/lib/groups/group_list_screen.dart).
- Tests: [group_list_screen_test.dart](../../apps/mobile/test/group_list_screen_test.dart): `group detail edits group and manages members`; [group_list_screen_test.dart](../../apps/mobile/test/group_list_screen_test.dart): `group detail filtered actions target the visible member`; [group_list_screen_test.dart](../../apps/mobile/test/group_list_screen_test.dart): `group screen shows bounded failures`.
- States: E true/filtered empty; L group/member load; R safe failure; D API rejection is bounded, but edit/add/change-role/remove controls do not consult currentUserRole; O server-only, no offline membership acceptance.
- Accessibility/visual: Shared sections/rows, groups capture harness; historical removal/reactivation acceptance incomplete.
- Owner: [#720](https://github.com/tommytang213/Settleora/issues/720). Remaining: Create/edit groups and add/change-role/remove member presentation exists; ordinary-member controls remain actionable until API rejection. Role-aware action presentation and denied-state tests are missing under #720; keep authorization server-owned. Remaining historical participation/lifecycle policy must be reconciled, not recreated as basic membership CRUD.
- Gate/dependency: Membership/authz/lifecycle; [#976](https://github.com/tommytang213/Settleora/issues/976) dependency. Order: **W4**.

### M25 — Group dashboard / contextual cross-domain summaries

- Status: `partial`. Requirement/reference: PRD: group dashboard basics; Groups.
- Source: [SettleoraGroupDetailScreen](../../apps/mobile/lib/groups/group_list_screen.dart); [_GroupBillsHandoffCard](../../apps/mobile/lib/groups/group_list_screen.dart).
- Tests: [group_list_screen_test.dart](../../apps/mobile/test/group_list_screen_test.dart): `group detail opens read-only group bills`.
- States: E members/bills empty; L group load; R retry; D scoped repository; O no hydrated group dashboard.
- Accessibility/visual: Reference includes balances/attention/summary sections; current group detail plus bills is bounded workspace.
- Owner: [#399](https://github.com/tommytang213/Settleora/issues/399). Remaining: Full group-scoped summary and handoffs for balances, reports, recurring and attention are not implemented as one group dashboard. Domain screens elsewhere are not proof of contextual group entry.
- Gate/dependency: Use [#977](https://github.com/tommytang213/Settleora/issues/977)/#976 audit and authoritative summary APIs; new shell reference only if materially changed. Order: **W2**.

### M26 — Friends / exact-match discovery / direct sharing / block

- Status: `blocked`. Requirement/reference: PRD: approved relationships, no global directory; Groups, UX.
- Source: [SettleoraGroupListScreen](../../apps/mobile/lib/groups/group_list_screen.dart); [SettleoraAuthenticatedServerShell](../../apps/mobile/lib/app/server_mode_shell.dart).
- Tests: [group_list_screen_test.dart](../../apps/mobile/test/group_list_screen_test.dart): `group detail edits group and manages members`.
- States: E/L/R/D/O friend/discovery/direct-share screens absent; group membership tests are adjacent only.
- Accessibility/visual: Closed [#434](https://github.com/tommytang213/Settleora/issues/434) reference is not runtime; relationship/visibility/blocked-state UI acceptance missing.
- Owner: [#976](https://github.com/tommytang213/Settleora/issues/976). Remaining: No friend/direct-sharing surface in current mobile route graph. Reconcile [#400](https://github.com/tommytang213/Settleora/issues/400) and closed [#431](https://github.com/tommytang213/Settleora/issues/431)–[#435](https://github.com/tommytang213/Settleora/issues/435) policy/reference work before runtime children; group membership is not friend authorization.
- Gate/dependency: Authz/privacy/relationship lifecycle and any contract additions. Order: **W4**.

### M27 — Temporary participants / claim and account link

- Status: `blocked`. Requirement/reference: PRD: unregistered receipt participants; Groups, UX.
- Source: [SettleoraGroupBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill create member menus use active members only`.
- States: E/L/R/D/O no temporary identity/claim-link mobile flow; active-member selector does not supply one.
- Accessibility/visual: Closed [#433](https://github.com/tommytang213/Settleora/issues/433) flow/reference exists; no safe claim/link platform evidence.
- Owner: [#347](https://github.com/tommytang213/Settleora/issues/347). Remaining: Missing temporary participant presentation and accepted link handoff; identity cannot be synthesized from local selection. [#976](https://github.com/tommytang213/Settleora/issues/976) must reconcile domain readiness.
- Gate/dependency: Identity/authz, historical money participation and claim security. Order: **W4**.

### M28 — Settlement balances / request list and detail

- Status: `partial`. Requirement/reference: PRD: settlement read/status; Settle.
- Source: [SettleoraSettlementListScreen](../../apps/mobile/lib/settlements/settlement_list_screen.dart); [SettleoraSettlementDetailScreen](../../apps/mobile/lib/settlements/settlement_list_screen.dart).
- Tests: [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `settlement list shows full server balance readouts`; [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `settlement detail filters request lines locally`; [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `settlement list shows bounded session failure state`.
- States: E balances/requests/lines/filtered empty; L load; R refresh/retry; D bounded session/denied/unavailable; O server unavailable, no offline mutation.
- Accessibility/visual: Shared money/key-value states and settlement capture harness; exhaustive detail/platform acceptance incomplete.
- Owner: [#969](https://github.com/tommytang213/Settleora/issues/969). Remaining: Existing balance/request/payment reads are retained. End-to-end accepted settlement evidence remains incomplete; basket, residual and proof gaps are separately owned below.
- Gate/dependency: Final financial acceptance; no balance recalculation in client. Order: **W5**.

### M29 — Settlement basket / select-visible / create request

- Status: `missing`. Requirement/reference: PRD: basket and pay-all outstanding; Settle.
- Source: [SettleoraSettlementListScreen](../../apps/mobile/lib/settlements/settlement_list_screen.dart).
- Tests: [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `settlement detail filters request lines locally`.
- States: E/L/R/D/O no basket-selection/create-request UI; detail filters only existing request lines.
- Accessibility/visual: Settle reference covers intended request flow; no branch-rendered basket implementation.
- Owner: [#354](https://github.com/tommytang213/Settleora/issues/354). Remaining: Backend candidate/create capability exists, but mobile repository/screen exposes request reads and payment claims, not basket creation/eligible-line selection.
- Gate/dependency: Settlement money/eligibility and any contract change. Order: **W4**.

### M30 — Settlement payment claim / confirmation / dispute / residual

- Status: `partial`. Requirement/reference: PRD: actual paid vs selected/residual review; Settle.
- Source: [_MarkPaymentPaidDialog](../../apps/mobile/lib/settlements/settlement_list_screen.dart); [_ResidualList](../../apps/mobile/lib/settlements/settlement_list_screen.dart); [SettlementPaymentClaimEndpoints](../../services/api/src/Settleora.Api/Settlements/SettlementPaymentClaimEndpoints.cs) rejects unknown fields in ReadPaymentClaimRequestAsync.
- Tests: [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `debtor marks requested settlement paid after confirmation`; [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `receiver confirms marked-paid payment after confirmation`; [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `settlement list opens detail and confirms residuals`.
- States: E no payments/residuals; L single-flight actions; R state retained on failure/refresh failure; D payer/receiver/capability guards; O no offline payment acceptance.
- Accessibility/visual: Confirmation and residual readouts tested, captures exist; full residual outcome/correction acceptance not established.
- Owner: [#355](https://github.com/tommytang213/Settleora/issues/355). Remaining: Mark-paid, receiver confirmation, cancellation/dispute and residual confirmation already exist. Remaining explicit delta/policy/outcome correction acceptance must use server truth, not a broad credit ledger. Day 1 settlement notes are also missing from the mobile claim form and current payment-claim contract (which rejects notes); #355 owns this payment-flow gap with #969 domain reconciliation before any contract change. See PRD Settlement notes and [E2E-SETTLE-001](../acceptance/day1/DAY1_E2E_REGRESSION_MATRIX.md); this is missing underlying capability as well as presentation.
- Gate/dependency: Money/payment/residual policy. Order: **W4**.

### M31 — Settlement proof attach/list/view/remove and counterparty QR

- Status: `missing`. Requirement/reference: PRD: optional proof and authorized payment instructions; Settle.
- Source: [_CounterpartyPaymentDetailsSection](../../apps/mobile/lib/settlements/settlement_list_screen.dart); [_PaymentTile](../../apps/mobile/lib/settlements/settlement_list_screen.dart).
- Tests: [settlement_list_screen_test.dart](../../apps/mobile/test/settlement_list_screen_test.dart): `counterparty details explain settlement-scoped visibility`.
- States: E QR not configured metadata; L/R/D parent detail states only; O no offline file access; proof-specific states absent.
- Accessibility/visual: QR is Available/Not linked text; no proof viewer or attach/remove UI and tests.
- Owner: [#356](https://github.com/tommytang213/Settleora/issues/356). Remaining: Mobile proof/file-content presentation is missing despite backend proof endpoints. Counterparty QR content must remain scoped; proof never grants confirmation authority.
- Gate/dependency: Storage/privacy/authz and settlement reference acceptance. Order: **W4**.

### M32 — Recurring templates / create-edit / pause-resume-archive

- Status: `partial`. Requirement/reference: PRD: recurring lifecycle; Settings, UX.
- Source: [SettleoraRecurringBillScreen](../../apps/mobile/lib/recurring_bills/recurring_bill_screen.dart); [SettleoraRecurringBillTemplateFormScreen](../../apps/mobile/lib/recurring_bills/recurring_bill_screen.dart).
- Tests: [recurring_bill_screen_test.dart](../../apps/mobile/test/recurring_bill_screen_test.dart): `edit form opens with returned values and updates detail`; [recurring_bill_screen_test.dart](../../apps/mobile/test/recurring_bill_screen_test.dart): `edit form keeps schedule-only save when safe payload is absent`; [recurring_bill_screen_test.dart](../../apps/mobile/test/recurring_bill_screen_test.dart): `pause resume and archive require confirmation and refresh`.
- States: E no templates/filtered empty; L load/save/action; R bounded retry; D unsupported payload shape preserves safe schedule-only path; O online lifecycle only.
- Accessibility/visual: Shared MoneyInput/DateField and recurring captures; advanced edit-scope acceptance absent.
- Owner: [#366](https://github.com/tommytang213/Settleora/issues/366). Remaining: Create/edit and pause/resume/archive already exist. Group template creation still uses a raw Group ID (optional) text field and submits it directly, without loading authorized groups. #366 owns usable authorized group selection plus loading/empty/denied/error acceptance; server membership checks remain authoritative. Advanced split/payer/adjustment editing is explicitly unavailable; preserve existing payload and gate richer edit scope.
- Gate/dependency: Recurring money and edit-scope reference; [#972](https://github.com/tommytang213/Settleora/issues/972) dependency. Order: **W4**.

### M33 — Forecast / explicit recurring draft generation / one-time future bills

- Status: `partial`. Requirement/reference: PRD: forecast without silent financial mutation; Settings, UX.
- Source: [SettleoraFutureBillDetailScreen](../../apps/mobile/lib/recurring_bills/recurring_bill_screen.dart); [WriteDueSoonNotificationsAsync](../../services/api/src/Settleora.Api/Expenses/RecurringBills/RecurringBillEndpoints.cs); [SettleoraRecurringBillScreen](../../apps/mobile/lib/recurring_bills/recurring_bill_screen.dart).
- Tests: [recurring_bill_screen_test.dart](../../apps/mobile/test/recurring_bill_screen_test.dart): `explicit draft generation shows success and reloads`; [recurring_bill_screen_test.dart](../../apps/mobile/test/recurring_bill_screen_test.dart): `future bill create form saves upcoming bill draft`; [recurring_bill_screen_test.dart](../../apps/mobile/test/recurring_bill_screen_test.dart): `future bill post calls repository once and updates detail`; [RecurringBillEndpointTests.cs](../../services/api/tests/Settleora.Api.Tests/RecurringBillEndpointTests.cs): `ForecastCreatesIdempotentDueSoonNotificationsForVisibleActiveForecastedOccurrencesOnly`; [RecurringBillEndpointTests.cs](../../services/api/tests/Settleora.Api.Tests/RecurringBillEndpointTests.cs): `ForecastDueSoonNotificationsFollowGroupVisibilityAndDoNotNotifyUnrelatedUsers`.
- States: E no forecast/future rows; L load/generate/post; R refresh failure preserves generated context; D inactive/non-draft actions hidden; O no offline generation.
- Accessibility/visual: Future/recurring capture harness; Day 1 scheduling, due-soon, forecast and explicit draft-confirmation acceptance not proven. Autopay defaults and paid-state overrides are deferred Day 2.
- Owner: [#972](https://github.com/tommytang213/Settleora/issues/972). Remaining: Forecast, explicit draft generation and future bill create/edit/cancel/post exist. Closed [#367](https://github.com/tommytang213/Settleora/issues/367) via [#560](https://github.com/tommytang213/Settleora/pull/560) already implements recurring_bill.due_soon: authorized forecast reads create idempotent in-app events for visible active forecast occurrences. Credit this bounded runtime and its typed mobile handoff M35. Remaining work is proactive scheduling/background delivery, unsupported skip/failure states and final mobile schedule/forecast acceptance; do not recreate the forecast-read event path. [D1-RECUR-003](../planning/DAY1_EXECUTION_COVERAGE_MATRIX.md) explicitly excludes Day 2 autopay from this gap.
- Gate/dependency: Forecast/payment authority; provider FX remains later-day. Order: **W4**.

### M34 — Notification inbox / triage / detail

- Status: `partial`. Requirement/reference: PRD: in-app notifications; Inbox.
- Source: [SettleoraNotificationScreen](../../apps/mobile/lib/notifications/notification_screen.dart); [_NotificationDetailSheet](../../apps/mobile/lib/notifications/notification_screen.dart).
- Tests: [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `notification filters show counts and filtered empty state`; [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `successful archive preserves local state when follow-up refresh fails`; [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `duplicate bulk mark visible read taps are single flight`.
- States: E true/filtered empty; L load/action; R safe retry/retained state; D expired session and unavailable target; O loaded local filtering, no background delivery.
- Accessibility/visual: Dedicated bounded text/semantics tests; historical [#672](https://github.com/tommytang213/Settleora/issues/672)/#679 capture acceptance; event completeness remains separate.
- Owner: [#973](https://github.com/tommytang213/Settleora/issues/973). Remaining: Read/mark visible/all read/archive/restore/detail already exist. Remaining event-family/channel acceptance belongs notification audit, not another inbox implementation.
- Gate/dependency: Notification privacy and any domain event changes. Order: **W2**.

### M35 — Typed notification destination handoff

- Status: `complete`. Requirement/reference: PRD: authorized notification entry; Open.
- Source: [_openPersonalBill](../../apps/mobile/lib/notifications/notification_screen.dart); [_openBillRevision](../../apps/mobile/lib/notifications/notification_screen.dart); [_openGroupBill](../../apps/mobile/lib/notifications/notification_screen.dart); [_openSettlement](../../apps/mobile/lib/notifications/notification_screen.dart); [_openReceiptOcrReview](../../apps/mobile/lib/notifications/notification_screen.dart); [_openSyncOperation](../../apps/mobile/lib/notifications/notification_screen.dart); [_openRecurringBill](../../apps/mobile/lib/notifications/notification_screen.dart).
- Tests: [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `bill revision open action ignores action URLs`; [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `sync notifications refresh and show bounded sync readout`; [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `future and unsupported route families show safe fallback copy`; [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `recurring bill notifications show open recurring action and navigate`; [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `opening a recurring notification marks read and updates filters`.
- States: E missing typed target => fallback; L single-flight open; R safe retry; D fresh repository checks, archived no-open; O unavailable server => bounded result.
- Accessibility/visual: [#371](https://github.com/tommytang213/Settleora/issues/371) accepted scope closed via [#663](https://github.com/tommytang213/Settleora/pull/663)/#664; action/details safety tests and historical reference acceptance.
- Owner: [#371](https://github.com/tommytang213/Settleora/issues/371). Remaining: No remaining gap in accepted in-app typed handoffs. Recurring notifications re-fetch typed template IDs and open the recurring detail, with mark-read/filter coverage. Push delivery/OS registration is M37; mobile reset links #772 are future optional, outside Day 1; unsupported families remain honest fallbacks.
- Gate/dependency: None for evidence-only work. Order: **Retain**.

### M36 — Sync status / offline queue / conflict and reconnect

- Status: `partial`. Requirement/reference: PRD: queued/synced/conflict/failed; UX.
- Source: [_SyncQueueDetailsSection](../../apps/mobile/lib/bills/bill_list_screen.dart); [SettleoraSyncQueueProcessor](../../apps/mobile/lib/sync/sync_queue_processor.dart); [SettleoraSyncChangeFeedHydrationSeam](../../apps/mobile/lib/sync/sync_change_feed_hydration.dart).
- Tests: [sync_queue_test.dart](../../apps/mobile/test/sync_queue_test.dart): `marks conflict results as conflict and preserves the item`; [sync_queue_test.dart](../../apps/mobile/test/sync_queue_test.dart): `keeps network failures retryable and increments attempts`; [sync_queue_test.dart](../../apps/mobile/test/sync_queue_test.dart): `returns metadata-only change feed without accepting business truth`.
- States: E no/filtered queue items; L flush single-flight; R safe retry and persisted attempts; D no token preserves queue; O archive/restore queue exists, metadata feed does not hydrate cache.
- Accessibility/visual: Queue has labels/counts, eight-row visible cap without full pager; no complete conflict comparison/resolution UI evidence.
- Owner: [#971](https://github.com/tommytang213/Settleora/issues/971). Remaining: Existing status/queue and [#363](https://github.com/tommytang213/Settleora/issues/363) notification readout are credited. Full Day 1 offline hydration and supported keep-server/keep-local resolution remain; [#1066](https://github.com/tommytang213/Settleora/issues/1066) is later dedicated Sync Center, not permission to remove Day 1 conflict obligations.
- Gate/dependency: Sync acceptance/idempotency; field-level decisions only where supported. Order: **W4**.

### M37 — OS push permission and registration

- Status: `blocked`. Requirement/reference: PRD: notifications and policy caps; Push, Settings.
- Source: [_AppSettingsScreen](../../apps/mobile/lib/app/server_mode_shell.dart); [SettleoraNotificationScreen](../../apps/mobile/lib/notifications/notification_screen.dart).
- Tests: [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `notification preferences use safe defaults and local suppression`.
- States: E/L/R/D mobile provider/permission/registration UI absent; O local filters do not register tokens or promise delivery; preference wiring is M56.
- Accessibility/visual: [#653](https://github.com/tommytang213/Settleora/issues/653) push reference exists; physical OS permission/token/signing evidence absent.
- Owner: [#634](https://github.com/tommytang213/Settleora/issues/634). Remaining: API token/provider foundations are not mobile OS registration or real APNs/FCM delivery. This owner covers only device/provider integration; persisted preference wiring is separately M56.
- Gate/dependency: Provider choice/credentials/signing, platform permission and any API wiring. Order: **W3**.

### M38 — Monthly reports / statement drill-down

- Status: `partial`. Requirement/reference: PRD: reports and inspection; Shell, UX.
- Source: [SettleoraMonthlyReportScreen](../../apps/mobile/lib/reports/monthly_report_screen.dart); [_SummaryPanel](../../apps/mobile/lib/reports/monthly_report_screen.dart).
- Tests: [monthly_report_screen_test.dart](../../apps/mobile/test/monthly_report_screen_test.dart): `monthly report search filters loaded aggregate rows`; [monthly_report_screen_test.dart](../../apps/mobile/test/monthly_report_screen_test.dart): `monthly report distinguishes filtered empty from true empty`; [monthly_report_screen_test.dart](../../apps/mobile/test/monthly_report_screen_test.dart): `monthly report screen handles expired sessions safely`.
- States: E zero/filtered aggregate; L load; R retry/refresh; D expired/denied safe; O no hydrated report.
- Accessibility/visual: MoneyText and key-value sections; report capture harness; dense aggregate presentation still differs from statement reference intent.
- Owner: [#296](https://github.com/tommytang213/Settleora/issues/296). Remaining: Monthly totals and local aggregate filters exist. Underlying bill/payment statement records and authorized drill-down are absent from report response/UI; coordinate [#977](https://github.com/tommytang213/Settleora/issues/977) contract needs before presentation work.
- Gate/dependency: Authoritative report contract/financial totals if expanded. Order: **W2**.

### M39 — Manual reconciliation status

- Status: `partial`. Requirement/reference: PRD: manual reconciliation, not bank matching; Bills, UX.
- Source: [_BillDetailHeader](../../apps/mobile/lib/bills/bill_list_screen.dart); [_MonthlyReportDiscoveryState](../../apps/mobile/lib/reports/monthly_report_screen.dart); [updatePersonalBillReconciliation](../../packages/client-dart/lib/generated/client.dart); [updateGroupBillReconciliation](../../packages/client-dart/lib/generated/client.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `bill list and detail show bounded reconciliation readouts`; [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `bill reconciliation readout hides unsafe raw details`.
- States: E no status/filtered records; L parent load; R bounded failures; D safe readout; O no queued reconciliation mutation.
- Accessibility/visual: Readouts tested, no complete mobile update/clear/reason flow or large-record acceptance.
- Owner: [#404](https://github.com/tommytang213/Settleora/issues/404). Remaining: Audited personal/group reconciliation PATCH runtime and generated updatePersonalBillReconciliation/updateGroupBillReconciliation already exist, including request/response contracts. Mobile currently exposes readouts; update/clear/reason handwritten repository/screen wiring and acceptance are missing. Preserve supported policy and audit rather than recreate those APIs; advanced search/filter belongs M57/#405, not this status-mutation owner.
- Gate/dependency: Domain reconciliation/audit and any contract change. Order: **W2**.

### M40 — Accounts and income

- Status: `partial`. Requirement/reference: PRD: manual finance/forecast input; Settings.
- Source: [SettleoraManualFinanceScreen](../../apps/mobile/lib/manual_finance/manual_finance_screen.dart).
- Tests: [manual_finance_screen_test.dart](../../apps/mobile/test/manual_finance_screen_test.dart): `lists manual account and income data with explanatory copy`.
- States: E no accounts/income; L load/save; R safe failure; D typed SettleoraManualFinanceFailure denied/unavailable results; O no offline account mutation.
- Accessibility/visual: Shared MoneyInput/DateField; money-date form capture; distinct summaries have domain-specific justification, not automatic component defect.
- Owner: [#972](https://github.com/tommytang213/Settleora/issues/972). Remaining: Manual accounts/income and estimates exist and are reachable from More. Day 1 manual account/income estimates and forecast-input acceptance require current domain reconciliation; discoverability is M09. Autopay policy defaults and paid-state overrides remain Day 2 under D1-RECUR-003 and are not an acceptance gap here.
- Gate/dependency: Money/forecast authority. Order: **W4**.

### M41 — CSV import/export and local backup/restore preview

- Status: `partial`. Requirement/reference: PRD: portability and local recovery; Settings, UX.
- Source: [SecureStorageLocalDataBackupService](../../apps/mobile/lib/app/local_data_backup.dart); [_DataBackupImportPreviewDialog](../../apps/mobile/lib/app/server_mode_shell.dart); [exportPersonalBillsCsv](../../packages/client-dart/lib/generated/client.dart); [downloadLocalBackupPackageContent](../../packages/client-dart/lib/generated/client.dart).
- Tests: [local_data_backup_test.dart](../../apps/mobile/test/local_data_backup_test.dart): `buildExport creates a versioned backup without session material`; [local_data_backup_test.dart](../../apps/mobile/test/local_data_backup_test.dart): `previewImport validates JSON and blocks sensitive material`; [server_mode_shell_dashboard_test.dart](../../apps/mobile/test/server_mode_shell_dashboard_test.dart): `dashboard exposes backup export and import preview guards`.
- States: E initial export/paste; L service call; R validation result; D rejects session/sensitive material; O local metadata only, no restore apply.
- Accessibility/visual: Preview/dialog exists; no real file-share/export/import-apply or local workspace recovery acceptance.
- Owner: [#971](https://github.com/tommytang213/Settleora/issues/971). Remaining: Current export displays JSON for manual save and import previews configuration/queue metadata. This mobile metadata preview is not full record backup or CSV import/review/file-share integration. Existing server/generated foundations must be credited: personal/group CSV export, preflight, import sessions/confirmation/import; local backup package sessions, generation/download, data artifacts, restore preview and confirmation sessions already exist. See generated exportPersonalBillsCsv/exportGroupBillsCsv/preflightPersonalBillsCsvImport/importPersonalBillsCsv/downloadLocalBackupPackageContent and the [ledger completed import/export/local-backup checkpoint](../planning/ISSUE_PROGRESS_LEDGER.md) (PRs #596/#597/#599/#602/#603/#614/#617/#619/#622/#624). Remaining work is mobile file/share/import-review wiring and local recovery integration; actual restore apply, durable/encrypted package storage and file-byte package sections remain separate unfinished storage boundaries. Do not recreate those API foundations. Reuse [#406](https://github.com/tommytang213/Settleora/issues/406) and closed [#453](https://github.com/tommytang213/Settleora/issues/453)–[#457](https://github.com/tommytang213/Settleora/issues/457) reference design.
- Gate/dependency: Storage/privacy/import validation and destructive restore gates. Order: **W4**.

### M42 — Self profile and payment-detail editing / QR

- Status: `partial`. Requirement/reference: PRD: optional scoped payment details; Settings.
- Source: [SettleoraProfileScreen](../../apps/mobile/lib/profile/profile_screen.dart); [_QrStatus](../../apps/mobile/lib/profile/profile_screen.dart); [attachSelfPaymentQr](../../packages/client-dart/lib/generated/client.dart); [getSelfPaymentQrContent](../../packages/client-dart/lib/generated/client.dart).
- Tests: [profile_screen_test.dart](../../apps/mobile/test/profile_screen_test.dart): `profile screen updates profile and payment details`; [profile_screen_test.dart](../../apps/mobile/test/profile_screen_test.dart): `profile and payment saves ignore duplicate submits`; [profile_screen_test.dart](../../apps/mobile/test/profile_screen_test.dart): `profile screen handles expired sessions safely`.
- States: E no payment details/QR; L load/save; R validation and retained returned state; D bounded expired/denied/conflict; O no offline profile acceptance.
- Accessibility/visual: Shared currency/payment selector and profile capture; QR is metadata only; all text-scale/privacy states unproven.
- Owner: [#966](https://github.com/tommytang213/Settleora/issues/966). Remaining: Profile fields/handle/visibility edit exists. Authenticated attachSelfPaymentQr/removeSelfPaymentQr/getSelfPaymentQrContent already exist in API/OpenAPI/generated Dart; the handwritten profile repository/screen expose only QR metadata. Missing mobile scope is file intake, repository wiring, preview/content display, replacement/removal UX and platform/privacy acceptance; [#395](https://github.com/tommytang213/Settleora/issues/395) is parent reconciliation, not a second QR owner.
- Gate/dependency: Storage/file privacy and profile authorization. Order: **W4**.

### M43 — Privacy vault / local app-lock security settings

- Status: `blocked`. Requirement/reference: PRD: Standard Secure + Recoverable Private Vault; Vault, Settings.
- Source: [_AppSettingsScreen](../../apps/mobile/lib/app/server_mode_shell.dart); [_BootstrapStateScreen](../../apps/mobile/lib/app/app_bootstrap.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `setup saves local mode without creating a server repository`.
- States: E/L/R/D/O no selectable vault/PIN/biometric/recovery mobile flow; current local warning only.
- Accessibility/visual: Approved vault frames exist, not runtime; security warning and recovery acceptance missing.
- Owner: [#966](https://github.com/tommytang213/Settleora/issues/966). Remaining: Vault protection and app-lock controls cannot be inferred from secure session storage. [#343](https://github.com/tommytang213/Settleora/issues/343)/#408 and [#971](https://github.com/tommytang213/Settleora/issues/971) are dependencies; no Strict Vault Day 1 claim.
- Gate/dependency: Security/privacy/recovery key and local storage policy. Order: **W3**.

### M44 — Navigation / More / settings / lightweight shortcuts

- Status: `partial`. Requirement/reference: PRD: discoverability; Shell, Settings.
- Source: [_MoreHubSection](../../apps/mobile/lib/app/server_mode_shell.dart); [_AppSettingsScreen](../../apps/mobile/lib/app/server_mode_shell.dart); [SettleoraBottomNav](../../apps/mobile/lib/ui/settleora_components.dart).
- Tests: [server_mode_shell_dashboard_test.dart](../../apps/mobile/test/server_mode_shell_dashboard_test.dart): `bottom nav uses canonical M2 labels on Home`; [server_mode_shell_dashboard_test.dart](../../apps/mobile/test/server_mode_shell_dashboard_test.dart): `dashboard final content clears bottom nav on phone viewport`.
- States: E missing seams use honest unavailable; L parent loads; R navigable retry; D routing never grants access; O unavailable server features remain bounded.
- Accessibility/visual: Five Home/Bills/Groups/Settle/More tabs, shared settings rows and safe-area shell exist; shell capture harness.
- Owner: [#295](https://github.com/tommytang213/Settleora/issues/295). Remaining: Canonical More/settings and recurring/receipts/reports/session entry exist. Lightweight pin/show shortcuts still missing per live comment 4757022528; full drag/drop builder remains Day 2.
- Gate/dependency: New layout/reference only if material; no auth bypass. Order: **W1**.

### M45 — Basic / Guided / Advanced / Help me decide

- Status: `blocked`. Requirement/reference: PRD: experience modes; Settings, UX.
- Source: [_AppSettingsScreen](../../apps/mobile/lib/app/server_mode_shell.dart); [SettleoraSetupScreen](../../apps/mobile/lib/app/setup_screen.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `default app starts at setup when no mode is configured`.
- States: E/L/R/D/O no experience-mode choice/recommendation UI.
- Accessibility/visual: main.dart uses SettleoraTheme.midnight; light and midnight tokens exist, not a theme selector; focused mode reference remains.
- Owner: [#412](https://github.com/tommytang213/Settleora/issues/412). Remaining: Experience-mode selection/change/help-me-decide is absent, unlike authority-mode choice M01. Theme selection/persistence is explicitly Day 2 under [D1-DEC-DEFER-001](../planning/DAY1_DECISION_REGISTER.md); existing theme tokens are inventory only, not a Day 1 gap or #412 scope.
- Gate/dependency: Focused first-launch/reference; any server preference contract separate. Order: **W2**.

### M46 — Bundled What’s New / version-seen state

- Status: `missing`. Requirement/reference: PRD: user guidance release notes; Settings.
- Source: [SettleoraAppBootstrap](../../apps/mobile/lib/app/app_bootstrap.dart); [_AppSettingsScreen](../../apps/mobile/lib/app/server_mode_shell.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `default app starts at setup when no mode is configured`.
- States: E/L/R/D/O feature absent; adjacent setup tests only.
- Accessibility/visual: No feature-specific semantics/capture; derivative shared sheet suitable.
- Owner: [#1092](https://github.com/tommytang213/Settleora/issues/1092). Remaining: No bundled version notes, once-per-version state, pre-sign-in display or reopen action found. Newly focused owner; not deployment release automation.
- Gate/dependency: None for evidence-only work. Order: **W1**.

### M47 — Contextual screen help

- Status: `missing`. Requirement/reference: PRD: contextual screen help; DSL.
- Source: [SettleoraBottomSheetFrame](../../apps/mobile/lib/ui/settleora_components.dart); [SettleoraSetupScreen](../../apps/mobile/lib/app/setup_screen.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `default app starts at setup when no mode is configured`.
- States: E/L/R/D/O feature absent; explanatory inline text is not reopenable contextual help.
- Accessibility/visual: Shared sheet can support static help; dismiss/reopen/focus return and screen-specific copy need evidence.
- Owner: [#1093](https://github.com/tommytang213/Settleora/issues/1093). Remaining: No versioned per-screen help registry or help entry/overlay flow found. Keep distinct from [#412](https://github.com/tommytang213/Settleora/issues/412) mode recommender and from admin arbitrary content.
- Gate/dependency: Risky instructional copy needs domain/reference review. Order: **W1**.

### M48 — Server-managed announcements

- Status: `blocked`. Requirement/reference: PRD: announcements distinct from events; Inbox.
- Source: [SettleoraNotificationScreen](../../apps/mobile/lib/notifications/notification_screen.dart).
- Tests: [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `notification screen shows loading and loaded content`.
- States: E/L/R/D/O announcement states absent; event inbox tests adjacent only.
- Accessibility/visual: No announcement-specific reference/runtime; safe category/window/dismiss UX must follow contract.
- Owner: [#1094](https://github.com/tommytang213/Settleora/issues/1094). Remaining: No announcement mobile surface or OpenAPI announcement contract found. New focused authority/contract handoff issue precedes mobile runtime; event notifications do not satisfy requirement.
- Gate/dependency: API/admin/authz/audit and any schema/contract changes. Order: **W2**.

### M49 — Shared component families and cross-screen adoption

- Status: `partial`. Requirement/reference: PRD: usable product; DSL.
- Source: [SettleoraListRow](../../apps/mobile/lib/ui/settleora_components.dart); [SettleoraDialogFrame](../../apps/mobile/lib/ui/settleora_components.dart); [MoneyInput](../../apps/mobile/lib/ui/settleora_form_fields.dart); [DateField](../../apps/mobile/lib/ui/settleora_form_fields.dart).
- Tests: [ui/settleora_component_guardrail_test.dart](../../apps/mobile/test/ui/settleora_component_guardrail_test.dart): `key-value text announces label before value exactly once`; [ui/settleora_component_guardrail_test.dart](../../apps/mobile/test/ui/settleora_component_guardrail_test.dart): `shared button labels fit narrow mobile widths`; [ui/settleora_component_guardrail_test.dart](../../apps/mobile/test/ui/settleora_component_guardrail_test.dart): `amount status row stays readable at high text scale`.
- States: E/L/R shared StateCard/panels; D disabled AppButton; O state display only, no acceptance authority.
- Accessibility/visual: Completed semantics children [#839](https://github.com/tommytang213/Settleora/issues/839)/#840/#846/#847/#852/#853/#856/#859–[#866](https://github.com/tommytang213/Settleora/issues/866)/#1051; current source/test confirms primitives.
- Owner: [#301](https://github.com/tommytang213/Settleora/issues/301). Remaining: Existing money/date/status/row/sheet/dialog/header primitives must be reused. Remaining private form/button/summary patterns need equivalence-based adoption review; see component reconciliation below.
- Gate/dependency: None for evidence-only work. Order: **W1**.

### M50 — Cross-screen accessibility / responsive / visual / platform acceptance

- Status: `partial`. Requirement/reference: PRD: safe real-user product; DSL.
- Source: [SettleoraScreenScaffold](../../apps/mobile/lib/ui/settleora_components.dart); [SettleoraBottomSheetFrame](../../apps/mobile/lib/ui/settleora_components.dart).
- Tests: [ui/settleora_component_guardrail_test.dart](../../apps/mobile/test/ui/settleora_component_guardrail_test.dart): `key-value text announces label before value exactly once`; [ui/settleora_component_guardrail_test.dart](../../apps/mobile/test/ui/settleora_component_guardrail_test.dart): `shared button labels fit narrow mobile widths`; [ui/settleora_component_guardrail_test.dart](../../apps/mobile/test/ui/settleora_component_guardrail_test.dart): `amount status row stays readable at high text scale`.
- States: E/L/R/D/O state families exist, but no exhaustive destination × state × device acceptance matrix passed.
- Accessibility/visual: Shared semantic ordering, 1.8× button/2× amount tests and visual harnesses exist. TalkBack/VoiceOver, keyboard/focus, text scale, safe-area and long forms require final platform acceptance.
- Owner: [#975](https://github.com/tommytang213/Settleora/issues/975). Remaining: This single cross-cutting owner holds remaining acceptance evidence, not duplicate feature implementation. Day 2 [#1069](https://github.com/tommytang213/Settleora/issues/1069) does not defer existing Day 1 accessibility requirements.
- Gate/dependency: Human visual/device/Day 1 acceptance; [#974](https://github.com/tommytang213/Settleora/issues/974) release proof separate. Order: **W5**.

### M51 — Manual FX snapshot entry and review

- Status: `missing`. Requirement/reference: PRD: Day 1 travel-bill FX; Bills, UX.
- Source: [SettleoraPersonalBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [SettleoraGroupBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `personal bill create shows aligned date currency amount fields`.
- States: E/L/R/D/O no manual exchange-rate snapshot flow; currency selection is adjacent only.
- Accessibility/visual: Currency controls exist but no FX source/date/rate review or acceptance evidence.
- Owner: [#352](https://github.com/tommytang213/Settleora/issues/352). Remaining: No mobile manual FX snapshot editor found. A currency selector is not rate conversion; [#967](https://github.com/tommytang213/Settleora/issues/967) must establish current server financial model before any mobile payload change.
- Gate/dependency: Money/rounding and any OpenAPI/generated-client contract. Order: **W4**.

### M52 — First-owner mobile provisioning entry

- Status: `missing`. Requirement/reference: PRD: first-owner bootstrap; Auth.
- Source: [SettleoraSignInScreen](../../apps/mobile/lib/app/sign_in_screen.dart); [SettleoraAppBootstrap](../../apps/mobile/lib/app/app_bootstrap.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `successful sign-in stores session and reaches the shell`.
- States: E/L/R/D/O no mobile first-owner status/create flow; ordinary login test is adjacent only.
- Accessibility/visual: Auth reference and generated bootstrapLocalOwner/getAuthBootstrapStatus exist; no mobile provisioning capture/state tests.
- Owner: [#965](https://github.com/tommytang213/Settleora/issues/965). Remaining: App initialization is not owner creation. Mobile does not call bootstrapLocalOwner/getAuthBootstrapStatus although generated transport and API capability exist. Establish intended mobile onboarding handoff before implementation.
- Gate/dependency: Auth/security first-owner exposure and policy. Order: **W3**.

### M53 — Authenticated current-account password change

- Status: `missing`. Requirement/reference: PRD: account security; Reset, Auth.
- Source: [_AppSettingsScreen](../../apps/mobile/lib/app/server_mode_shell.dart); [SettleoraSignInScreen](../../apps/mobile/lib/app/sign_in_screen.dart).
- Tests: [widget_test.dart](../../apps/mobile/test/widget_test.dart): `successful sign-in stores session and reaches the shell`.
- States: E/L/R/D/O password-change mobile form and outcomes absent; login/reset request are separate flows.
- Accessibility/visual: No change-password screen/focus/reauthentication/session-effect capture or test.
- Owner: [#965](https://github.com/tommytang213/Settleora/issues/965). Remaining: Generated changeCurrentAccountPassword and merged API [#729](https://github.com/tommytang213/Settleora/issues/729) exist, but mobile has no authenticated change-password surface. Do not confuse reset request M06 with password change.
- Gate/dependency: Auth/security, factor/session effects; [#339](https://github.com/tommytang213/Settleora/issues/339) dependency. Order: **W3**.

### M55 — Shared/group bills list / detail / loaded filters

- Status: `partial`. Requirement/reference: PRD: shared records; Bills, Groups.
- Source: [SettleoraGroupBillListScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [SettleoraGroupBillDetailScreen](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill list renders loading, empty, and refresh states`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill list shows safe error and retries`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill list opens detail and refreshes detail`; [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill search combines with chips and clears together`.
- States: E true/filtered empty; L list/detail/member loading; R bounded retry/refresh; D member fallback and current-user eligibility; O online read, full cache M36.
- Accessibility/visual: Shared money/status/readouts and groups/bills capture harness; large lists, text scaling, screen-reader traversal and device acceptance unproven.
- Owner: [#975](https://github.com/tommytang213/Settleora/issues/975). Remaining: Read/list/detail/search is implemented and separate from create/submit/participant actions M12. Category/whole-bill discussion gaps are M11/#967. Remaining acceptance is evidence for long shared-record screens; no duplicate create task.
- Gate/dependency: None for evidence-only work. Order: **W5**.

### M56 — Persisted notification preferences / quiet hours / group mute

- Status: `partial`. Requirement/reference: PRD: user notification preferences; Inbox, Settings; [D1-NOTIF-002](../planning/DAY1_EXECUTION_COVERAGE_MATRIX.md).
- Source: [SettleoraNotificationScreen](../../apps/mobile/lib/notifications/notification_screen.dart).
- Tests: [notification_screen_test.dart](../../apps/mobile/test/notification_screen_test.dart): `notification preferences use safe defaults and local suppression`.
- States: E safe local defaults; L/R local preference interaction only; D policy caps and persisted failure states not established by local filtering; O local suppression is not synchronized server policy.
- Accessibility/visual: Current local preference controls and inbox reference exist; persisted-save/error/reload and full policy-resolution acceptance are unproven.
- Owner: [#973](https://github.com/tommytang213/Settleora/issues/973). Remaining: Mobile in-app server-preference wiring and Day 1 quiet-hours/digest/group-mute reconciliation remain. User email/push channel selection and admin-cap/unconfigured/disabled states also remain under #973; M37 covers device registration only. OpenAPI updateNotificationPreferences narrows optional in-app categories and explicitly cannot enable email/push providers or schedule digest delivery: channel preferences require contract/policy reconciliation, not simply wiring the existing in-app endpoint. [#370](https://github.com/tommytang213/Settleora/issues/370) is closed for persisted API foundations via [#561](https://github.com/tommytang213/Settleora/pull/561); its completion explicitly excluded mobile persistence wiring, workers and group/admin policy. Reuse the open notification reconciliation owner instead of reopening completed API work or assigning this non-push gap to #634.
- Gate/dependency: Notification privacy/security policy and any API changes; provider/OS registration remains M37. Order: **W2**.

### M57 — Advanced record search / filter / sort / pagination

- Status: `partial`. Requirement/reference: PRD: report/search/filter entry; Shell, UX; [current readiness plan](../planning/DAY1_UX_IMPLEMENTATION_READINESS_PLAN.md).
- Source: [_MonthlyReportDiscoveryState](../../apps/mobile/lib/reports/monthly_report_screen.dart); [SettleoraBillListScreen](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [monthly_report_screen_test.dart](../../apps/mobile/test/monthly_report_screen_test.dart): `monthly report search filters loaded aggregate rows`; [monthly_report_screen_test.dart](../../apps/mobile/test/monthly_report_screen_test.dart): `monthly report combines search and filters safely`.
- States: E local no-match distinct from server empty; L/R parent loading/retry; D loaded authorized rows only; O local filtering does not prove offline/global retrieval.
- Accessibility/visual: Current per-screen controls and report/bill references exist; advanced query/pagination and full device acceptance unproven.
- Owner: [#405](https://github.com/tommytang213/Settleora/issues/405). Remaining: Local search/chips exist. API/generated listPersonalBills/listGroupBills already support authorized date, status, reconciliation, currency, merchant, bounded bill-field search, archive-state and limit filters; the handwritten mobile repository sends archive-state/limit and filters loaded rows. Credit those query contracts: remaining work includes mobile wiring for supported server dimensions, separately from absent cross-record/global search and any sorting/pagination contract gaps reconciled through #977. #405 remains the search sub-umbrella, not direct auto-ready work. Reconciliation status mutation is solely M39/#404; do not duplicate it here or recreate existing loaded-row filters.
- Gate/dependency: #977 audit and authoritative authorized queries; any financial/API changes retain domain gates. Order: **W2**.

### M58 — Bill financial components / multi-tax / discounts / receipt-total review

- Status: `missing`. Requirement/reference: PRD: Money/split/rounding; [D1-MONEY-003/004/006](../planning/DAY1_EXECUTION_COVERAGE_MATRIX.md); [multi-tax architecture](../architecture/EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md); [receipt edge cases](../architecture/DAY1_RECEIPT_BILL_EDGE_CASE_ARCHITECTURE.md).
- Source: [SettleoraPersonalBillCreateAdjustmentDraft](../../apps/mobile/lib/bills/bill_repository.dart); [SettleoraGroupBillCreateAdjustmentDraft](../../apps/mobile/lib/bills/bill_repository.dart); [SettleoraPersonalBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart); [SettleoraGroupBillCreateScreen](../../apps/mobile/lib/bills/bill_list_screen.dart).
- Tests: [bill_list_screen_test.dart](../../apps/mobile/test/bill_list_screen_test.dart): `create save sends expected personal bill draft strings` (bounded existing create, not rich component UI); [group_bill_list_screen_test.dart](../../apps/mobile/test/group_bill_list_screen_test.dart): `group bill create happy path smoke reaches submitted detail` (adjacent only).
- States: E/L/R/D/O no rich component editor or receipt-total-mismatch review/acceptance states; ordinary item amount validation is not this coverage.
- Accessibility/visual: Architecture/reference classifications exist; no complete mobile multi-tax/component editor or rendered state/keyboard/semantics acceptance.
- Owner: [#967](https://github.com/tommytang213/Settleora/issues/967). Remaining: Current create screens never construct adjustment drafts despite bounded DTO/repository adjustment support. Missing explicit mobile scope: mixed tax groups and included/excluded interpretation; before/after-tax discounts; coupon/points/gift-card/tender/change/void/free/refund/tax-correction classification and editable contribution treatment; generic fee tax/allocation fields; manual adjustment and receipt-total-mismatch review. Current contracts/model must be reconciled before richer financial payloads. Historical [#351](https://github.com/tommytang213/Settleora/issues/351) is CLOSED after #427/#428/#429/#430 planning/validation children (#533/#534/#553/#535); its close comment explicitly sends runtime follow-up to separate scoped tasks. Credit that work, keep #351 closed, and use current open #967 as the sole remaining reconciliation owner. M21 owns OCR-candidate correction only; M58 owns bill financial-component controls.
- Gate/dependency: Money/allocation/rounding; any schema/migration/OpenAPI/generated-client changes require separate manual gates. Order: **W4**.

## Reference index and historical evidence

Requirement labels resolve to current repository documents below; consult their
named section for the row's flow. These references are design intent, not grants
to implement gated runtime. PRD applies to every row.

- **Shell**: [docs/design/mobile/MOBILE_DESIGN_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_DESIGN_REFERENCE_V1.md).
- **Settings**: [docs/design/mobile/MOBILE_MORE_SETTINGS_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_MORE_SETTINGS_REFERENCE_V1.md).
- **Auth**: [docs/design/mobile/MOBILE_AUTH_SECURITY_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_AUTH_SECURITY_REFERENCE_V1.md).
- **Reset**: [docs/design/mobile/MOBILE_AUTH_PASSWORD_RESET_APPROVAL_PACKAGE_V1.md](../../docs/design/mobile/MOBILE_AUTH_PASSWORD_RESET_APPROVAL_PACKAGE_V1.md).
- **Bills**: [docs/design/mobile/MOBILE_BILLS_OCR_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_BILLS_OCR_REFERENCE_V1.md).
- **Revision**: [docs/design/mobile/MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md).
- **Groups**: [docs/design/mobile/MOBILE_GROUPS_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_GROUPS_REFERENCE_V1.md).
- **Settle**: [docs/design/mobile/MOBILE_SETTLE_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_SETTLE_REFERENCE_V1.md).
- **Inbox**: [docs/design/mobile/MOBILE_NOTIFICATIONS_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_NOTIFICATIONS_REFERENCE_V1.md).
- **Open**: [docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md](../../docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md).
- **Push**: [docs/design/mobile/MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md](../../docs/design/mobile/MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md).
- **Vault**: [docs/design/mobile/MOBILE_PRIVACY_VAULT_REFERENCE_V1.md](../../docs/design/mobile/MOBILE_PRIVACY_VAULT_REFERENCE_V1.md).
- **UX**: [docs/planning/DAY1_UX_REFERENCE_DECISIONS.md](../../docs/planning/DAY1_UX_REFERENCE_DECISIONS.md).
- **PRD**: [docs/prd/MVP_DAY1_SCOPE.md](../../docs/prd/MVP_DAY1_SCOPE.md).
- **DSL**: [docs/design/mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md](../../docs/design/mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md).

The M1–M14 QA maps under `docs/qa/` contain useful bounded state/test inventories.
[M15](M15_DAY1_ACCEPTANCE_EVIDENCE_QA_MAP.md) and active `.ai` records preserve
manual UI/code acceptance as deferred. They neither forbid this explicitly
requested [#407](https://github.com/tommytang213/Settleora/issues/407) audit nor expand its two-file allowlist. Current source wins over
stale README/M6/M14 text: group create/edit lifecycle, recurring edit, OCR provider,
notification handoffs, normalized-artifact processor and midnight theme exist.
Current bill intake calls the processor; M18 credits that integration while preserving the uncovered intake/cache paths.

Historical [#672](https://github.com/tommytang213/Settleora/issues/672) closed after [#673](https://github.com/tommytang213/Settleora/pull/673)–[#677](https://github.com/tommytang213/Settleora/pull/677) visual slices and [#680](https://github.com/tommytang213/Settleora/pull/680) close handoff;
[#679](https://github.com/tommytang213/Settleora/issues/679) closed via [#681](https://github.com/tommytang213/Settleora/pull/681) copy/spacing follow-up. These are not new missing work.
[#371](https://github.com/tommytang213/Settleora/issues/371) closed after [#663](https://github.com/tommytang213/Settleora/pull/663) typed handoffs and [#664](https://github.com/tommytang213/Settleora/pull/664) ledger acceptance; [#339](https://github.com/tommytang213/Settleora/issues/339) comments
record accepted password-reset scope after [#771](https://github.com/tommytang213/Settleora/pull/771)/#778, while [#772](https://github.com/tommytang213/Settleora/issues/772)–[#777](https://github.com/tommytang213/Settleora/issues/777) remain
separate gates. [#865](https://github.com/tommytang213/Settleora/issues/865)/#866 closed via [#1080](https://github.com/tommytang213/Settleora/pull/1080)/#1082, with [#1081](https://github.com/tommytang213/Settleora/pull/1081)/#1083 ledger hygiene.
[#1084](https://github.com/tommytang213/Settleora/issues/1084) remains closed with its docs classifier; [#1087](https://github.com/tommytang213/Settleora/issues/1087) is closed/not-planned,
[#1088](https://github.com/tommytang213/Settleora/pull/1088) closed/unmerged, [#1090](https://github.com/tommytang213/Settleora/pull/1090)/#1091 merged. Default CodeQL remains intentional.

Current visual harnesses include production-flow fixtures in
`apps/mobile/test/ui/shell_home_more_profile_parity_visual_capture_test.dart`,
`mobile_bills_list_detail_create_parity_visual_capture_test.dart`,
`bills_ocr_revision_parity_visual_capture_test.dart`,
`groups_settle_notifications_parity_visual_capture_test.dart`,
`recurring_bill_money_fields_visual_capture_test.dart`,
`reports_money_fields_visual_capture_test.dart`, and
`settlement_money_readouts_visual_capture_test.dart` (all under the same UI test
directory). `profile_shared_visual_foundation_capture_test.dart` is a composed
component demonstration, not proof of the entire production profile route.
No historical capture is relabeled as current full-platform acceptance.

## [#301](https://github.com/tommytang213/Settleora/issues/301) component reconciliation

The current shared inventory is in
[components](../../apps/mobile/lib/ui/settleora_components.dart),
[fields](../../apps/mobile/lib/ui/settleora_form_fields.dart) and
[theme](../../apps/mobile/lib/ui/settleora_theme.dart). It already includes:

- Actions/navigation: AppButton, SettleoraListRow, SettingsRow,
  SettleoraBottomNav, SettleoraScreenScaffold, SettleoraCompactHeader,
  SettleoraBottomSheetFrame/showSettleoraBottomSheet and SettleoraDialogFrame.
- Surfaces/states: AppCard, SummaryCard, StateCard, InfoCard, WarningCard,
  SettleoraInlinePanel, SettleoraStatePanel, SettleoraLoadingPanel,
  EmptyState/LoadingState/ErrorState and SettleoraSection.
- Readouts: MoneyText, SettleoraMoneyChip, StatusChip/SettleoraStatusChip,
  SettleoraCountChip/ReadinessChip/AssignedMemberChip, AmountStatusRow and
  SettleoraKeyValueRow/Text/MoneyText.
- Forms: AppTextField, MoneyInput, compatibility MoneyAmountCurrencyField,
  CurrencySelector, PaymentMethodSelector and DateField. Tokens cover spacing,
  radius, typography/colors with light and midnight themes.

The old [shared-design-system audit](../design/mobile/MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md)
contains historical classifications such as missing sheet/dialog/settings rows
that current source supersedes. Private names alone are not duplicates:
`bill_list_screen.dart:_StatePanel/_LoadingPanel` delegate to shared primitives.
Manual finance's summary/account/income sections have distinct domain composition;
they should not be forced into a generic ledger abstraction.

Component adoption candidates belong M49/#301. The actionability and localization rows below identify adjacent work owned solely by #299 and #409 respectively; they are not additional #301 gaps:

| Family | Current deviation to inspect in focused wave | Boundary |
| --- | --- | --- |
| Repeated text/select forms | Session/auth and feature forms still compose raw Material fields/buttons; group/bill selectors remain feature-private | Reuse behavior-equivalent APIs; never change validation, payloads or auth behavior in a cosmetic slice |
| Summary/card/row styling | `monthly_report_screen.dart:_SummaryPanel` uses local border/radius; manual finance has private summary composition | Compare token/affordance consistency; preserve justified domain layout; report capability M38 stays [#296](https://github.com/tommytang213/Settleora/issues/296) |
| Sheets/dialogs | Shared frames exist, but session revocation and several domain form dialogs still use private Material composition | M49 audits equivalent framing/keyboard/safe-area adoption; M05 owns session behavior |
| Static vs tappable metrics | Dashboard metric/readout composition must be assessed against actual callbacks | M09/#299 is sole actionability owner; [#301](https://github.com/tommytang213/Settleora/issues/301) supplies primitive rules only |
| Loading/empty/error variants | Delegating helpers are retained; direct busy spinners and inline states require consistent labels and focus behavior | Do not recreate completed live-region/StateCard/header/chip/key-value semantics slices |
| Localization | Hardcoded screen text and manual timestamp formatting remain widespread | [#409](https://github.com/tommytang213/Settleora/issues/409) is sole localization audit owner; English-only Day 1 is allowed, scattered strings are not proof of readiness |

Component guardrail tests provide focused semantics and scaling evidence, not
an app-wide WCAG certificate. Existing Day 1 accessibility obligations stay with
M50/#975; the later [#1069](https://github.com/tommytang213/Settleora/issues/1069) enhancement must not absorb them.

## Smallest dependency-safe next waves

Wave order is queue guidance, not authorization to implement gated runtime.
Each child needs a current allowed-path contract, exact validation and review.

1. **W1 — bounded low-risk slices:** prioritize existing [#959](https://github.com/tommytang213/Settleora/issues/959) parser defect
   independently from UI work. For UI, first [#301](https://github.com/tommytang213/Settleora/issues/301) equivalent selector/sheet/state
   adoption (2–4 related slices), then [#299](https://github.com/tommytang213/Settleora/issues/299) metric handoffs plus [#295](https://github.com/tommytang213/Settleora/issues/295) lightweight
   shortcut visibility where validation/reference boundaries match. [#1092](https://github.com/tommytang213/Settleora/issues/1092) bundled
   What’s New and [#1093](https://github.com/tommytang213/Settleora/issues/1093) static help can follow as separate local presentation
   slices; do not bundle them with security or financial actions. [#409](https://github.com/tommytang213/Settleora/issues/409) findings
   guide copy extraction without a repository-wide rewrite.
2. **W2 — reference/contract-aware product work:** [#296](https://github.com/tommytang213/Settleora/issues/296) report readability plus
   [#399](https://github.com/tommytang213/Settleora/issues/399) group summary after [#977](https://github.com/tommytang213/Settleora/issues/977) establishes available data; [#412](https://github.com/tommytang213/Settleora/issues/412) focused mode
   reference before mode UI; [#1094](https://github.com/tommytang213/Settleora/issues/1094) announcement authority design before API and
   mobile work. Advanced search/filter #405 requires #977 reconciliation; notification [#973](https://github.com/tommytang213/Settleora/issues/973) reconciliation remains distinct. A report
   endpoint change is not ordinary UI polish.
3. **W3 — separately gated auth/privacy/provider work:** [#965](https://github.com/tommytang213/Settleora/issues/965)/#776,
   [#966](https://github.com/tommytang213/Settleora/issues/966) vault/local-security and [#634](https://github.com/tommytang213/Settleora/issues/634) push registration. Do not combine
   credentials, platform links, provider setup or vault warnings with W1.
4. **W4 — separately gated domain work:** [#967](https://github.com/tommytang213/Settleora/issues/967) bill lifecycle/payer/claim/FX and M58 financial components (closed #351 planning credited),
   [#970](https://github.com/tommytang213/Settleora/issues/970) OCR normalization/correction/non-draft handoff, [#969](https://github.com/tommytang213/Settleora/issues/969) settlement basket/
   residual/proof, [#972](https://github.com/tommytang213/Settleora/issues/972) recurring payload/forecast, [#976](https://github.com/tommytang213/Settleora/issues/976) relationship/linking,
   [#971](https://github.com/tommytang213/Settleora/issues/971) local workspace/offline/CSV/backup/restore. Existing focused owners
   [#345](https://github.com/tommytang213/Settleora/issues/345)/#346/#350/#352/#354/#355/#356/#358/#366/#438/#442 remain first choices.
   Money, storage, sync and API contracts are separate boundaries even when
   adjacent UI looks similar.
5. **W5 — acceptance:** [#975](https://github.com/tommytang213/Settleora/issues/975) coordinates exact changed-flow device, screen-reader,
   text-scaling/keyboard/focus, safe-area, state and visual evidence after each
   slice; [#974](https://github.com/tommytang213/Settleora/issues/974) owns build/release proof. Acceptance does not wait to detect obvious
   regressions, but final Day 1 approval remains a human gate.

## Coverage reconciliation, ownership and close rules

Search/filter entry is represented with each owning canonical flow; M39 covers
reconciliation status; M57 covers advanced record search/filter gaps. Receipt preview inside create, saved
review inside detail and the pushed review queue are distinct stages M18–M22,
not duplicate copies of one route. Settings aliases resolve to M41–M45; static
`DashboardPreviewScreen` is a fixture/preview entry, not another product Home.
Accepted optional exclusions: retired M07/#772 mobile reset-link continuation and M54/#774 credential-activity/security-center UI are future optional under the [ledger's approved password-reset future-surface matrix](../planning/ISSUE_PROGRESS_LEDGER.md) and Reset reference. They are not Day 1 blockers or W3 implementation requirements; required auth event/audit/notification boundaries remain with M05/M34/M56. This follows existing authority, not a new Day 1 reduction.

Server admin backup, web/admin management, SMS MFA, provider FX, bank/PDF matching,
Strict Vault, federation/cloud, full drag/drop builders and later dedicated Sync
Center enhancements are not invented Day 1 mobile destinations. Existing Day 1 manual FX is represented once in M51; provider FX does not replace it.

New issues: [#1092](https://github.com/tommytang213/Settleora/issues/1092) (bundled version notes), [#1093](https://github.com/tommytang213/Settleora/issues/1093) (static contextual help), [#1094](https://github.com/tommytang213/Settleora/issues/1094)
(announcement authority/contract handoff). Open/closed title/body searches and
current source/test/contract inspection found no same-scope owner; [#412](https://github.com/tommytang213/Settleora/issues/412) mode
recommendation is not contextual per-screen help. Release workflow issues do not
implement bundled notes. Event notifications are not server announcements.
All other gaps reuse the sole row owner; linked audit/parent dependencies must
not create parallel implementation tickets for the same gap.

[#407](https://github.com/tommytang213/Settleora/issues/407) may close **only after this checklist and ledger merge, exact-head local
validation/Gemini/local Codex/GitHub evidence is recorded, [#372](https://github.com/tommytang213/Settleora/issues/372) receives the gap
summary and next waves, and every remaining gap is linked without duplication**.
Before that, keep [#407](https://github.com/tommytang213/Settleora/issues/407) open. [#372](https://github.com/tommytang213/Settleora/issues/372) remains open until its own focused child and
screen/state/accessibility/visual/platform close rule passes. [#301](https://github.com/tommytang213/Settleora/issues/301) remains open
for the remaining adoption audit; completed semantic/component children are not
reopened merely because their parent is open.
