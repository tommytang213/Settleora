# Day 1 Notification Completeness Audit

Audit date: 2026-10-29 UTC. Source baseline: `f0f54b081b37e48b1099a0379c3d444b08b0ea94`.
Owner: [#973](https://github.com/tommytang213/Settleora/issues/973), under #368/#369/#403.
This is a documentation audit, not runtime implementation, provider activation, notification delivery, native acceptance or issue closure.

## Authority, evidence and admission

Read with [Program Architecture](../../PROGRAM_ARCHITECTURE.md), [README](../../README.md),
[task guide](../workflow/CODEX_TASK_GUIDE.md), [Day 1 scope](../prd/MVP_DAY1_SCOPE.md),
[technical decision packet 6](../planning/DAY1_TECHNICAL_GATE_DECISION_PACKETS.md),
[event taxonomy](../architecture/NOTIFICATION_EVENT_TAXONOMY.md),
[event coverage review](../architecture/DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md)
and [remaining-gates checkpoint](../planning/NOTIFICATION_UMBRELLA_REMAINING_GATES_CHECKPOINT.md).
Those documents retain their domain/policy authority; this audit reconciles their older snapshots against this exact source and live issue evidence.

#973 has no source prerequisite and permits exactly this document and the ledger checkpoint, using `docs-planning` / `docs-only` / `cheap_independent`.
It is a separate scoped task, not permission to broaden M15, runner lanes or a stop sentinel.
Serial peers #960/#407/#409/#963/#964/#970 have no active managed ledger writer or relevant lock at admission.
Their retained branches are history, not evidence of current execution.
PR #1340's unmerged #1315 ledger checkpoint is preserved in its own worktree; reconcile both entries when merging, without overwriting or transplanting that work.

Evidence means source plus focused test assertions and merged history, not issue closed status, UI rows or design prose alone.
No runtime tests or external deliveries were performed by this docs audit.
Test references below describe inspected existing tests, not new execution passes.
The external task report retains exact commands, candidate/review hashes, issue snapshots and validation receipts.

## Classification and channel rules

- **Implemented** credits the specific inspected source/test slice only. **Partial** means useful code exists with named behavior or acceptance gaps.
- **Unavailable** means a source transition/target/channel implementation is absent; **unconfigured** is provider readiness, not permission or delivery.
- **Blocked** names a prerequisite/decision; **superseded** names an older claim replaced by narrower source evidence; **later-day** is only used when existing scope assigns it there.
- In-app is the guaranteed baseline for eligible authorized events, not a guarantee that every planned event has a producer.
- Email and mobile push are optional attempts after source eligibility/content safety, global cap, reviewed critical-event policy, user preference, group mute, timing and device availability.
- A notification is not authorization. Opening a record re-fetches through its live domain API; read/archive never accepts a bill, confirms payment, resolves a conflict or completes OCR.
- Repository defaults and disabled-provider adapters do not establish live deployment configuration. This audit reads no secrets and performs no host/provider readiness probe.
- SMS is unsupported/out of Day 1. Browser push is not credited by the user-web readout. Server announcements belong to #1094 and are not event-notification coverage.

## Source and test evidence index

All paths are relative to the repository root.

| ID | Current source | Inspected tests / merged evidence |
| --- | --- | --- |
| E1 | `services/api/src/Settleora.Api/Domain/Notifications/InAppNotificationEventTypes.cs`; `Notifications/InAppNotificationEvents.cs` and `EfInAppNotificationWriter.cs` under the same API root | `services/api/tests/Settleora.Api.Tests/InAppNotificationWriterTests.cs`, `InAppNotificationEndpointTests.cs`; merged event slices #560–#566 and current source. Writer checks supported types/safe IDs, existing recipient, self suppression unless explicitly allowed, and pending duplicate rows; this is not a claim of universal durable event idempotency. |
| E2 | API `Expenses/BillWorkflow/ExpenseBillWorkflowEndpoints.cs`; `Expenses/BillRevisions/ExpenseBillRevisionNotificationWriter.cs` | `BillWorkflowEndpointTests.cs`, `ExpenseBillRevisionEndpointTests.cs`; merged #564/#565 event coverage. |
| E3 | API `Settlements/SettlementRequestCreateEndpoints.cs`, `SettlementPaymentClaimEndpoints.cs`, `SettlementPaymentConfirmationEndpoints.cs`, `SettlementDisputeEndpoints.cs`, `SettlementCancellationEndpoints.cs`, `SettlementPaymentProofEndpoints.cs` | Corresponding `Settlement*EndpointTests.cs`; #656 residual review runtime (merge `1766fe99`), plus earlier request/payment/proof coverage. |
| E4 | API `Expenses/RecurringBills/RecurringBillEndpoints.cs` | `RecurringBillEndpointTests.cs`; #367 due-soon and merged #566 (`25a51953`) explicit generated-draft coverage. |
| E5 | API `Expenses/ReceiptOcrReviews/ReceiptOcrReviewEndpoints.cs`; `Sync/SyncOperationService.cs` | `ReceiptOcrReviewEndpointTests.cs`, `SyncOfflineServerFoundationEndpointTests.cs`; merged #626 (`ecbabe1b`), #572 (`04e8a18b`), #654 (`d58c0375`). |
| E6 | API `Notifications/NotificationPreferenceEndpoints.cs`, `NotificationDecisionEnvelopeResolver.cs`, `NotificationDecisionPolicyResolver.cs` | `NotificationDecisionEnvelopeResolverTests.cs`, `NotificationDecisionPolicyResolverTests.cs`, preference assertions in `InAppNotificationEndpointTests.cs`; merged #630 (`34caca01`), #702 (`f7d8239b`), #370 foundation. |
| E7 | API `Notifications/EfNotificationDeliveryAttemptRecorder.cs`, `EfNotificationDeliveryAttemptLeaseService.cs`, `NotificationDeliveryOutboxProcessor.cs`, `SmtpEmailNotificationSender.cs`, `PushNotificationSender.cs`, `PushDeviceTokenEndpoints.cs` | Delivery recorder/schema/outbox, SMTP sender, push sender and token endpoint/schema tests; merged #639 (`de2a7a38`), #642 (`8b4ac636`), #645 (`39d1d669`). Source proves foundations, not a running scheduler or external delivery acceptance. |
| E8 | API `Notifications/AdminNotificationPolicyEndpoints.cs`, `AdminNotificationPolicyReadoutService.cs`, `NotificationProviderReadinessSnapshotService.cs`, `NotificationPolicyReadoutRedactor.cs` | Admin endpoint/schema, provider-readiness and redaction tests; merged #697 (`b9363ab7`), #699 (`9ed8cb49`), #701 (`90e5355b`), #702; accepted readout-first chain #689/#704/#705 only. |
| E9 | `apps/mobile/lib/notifications/`: repository, generated adapter, screen, preferences, localization; current notification-open routing | `apps/mobile/test/notification_generated_repository_test.dart`, `notification_screen_test.dart`, `notification_localization_test.dart`, `test/ui/notification_action_buttons_test.dart`; merged #663 (`8b27a132`), #1113 (`328df709`), #1172/#1174. |
| E10 | `apps/web-user/src/notificationsReadout.ts`, `App.tsx` | `notificationsReadout.test.ts`; merged #588 (`6e47bba2`) and #589 (`fc5a3c82`); [user-web audit](DAY1_USER_WEB_COMPLETENESS_AUDIT.md). |

In E1–E8 the abbreviated API paths use `services/api/src/Settleora.Api/`; test basenames use `services/api/tests/Settleora.Api.Tests/`.
The source catalog has **27** supported event constants: 12 bill/revision, 10 settlement, 2 recurring, 2 sync and 1 OCR.
The next table partitions those 27 once; representative taxonomy-only names are not silently added to that count.

## Day 1 event-family coverage

Email/push columns apply to each row independently of the in-app source claim. **Optional foundation** means E6/E7 can represent decisions/attempts for supported safe events; it does not prove source-to-provider activation, configured credentials, scheduling, device delivery or user visibility.

| Family / exact supported events | Eligibility, recipients, interaction and current in-app posture | Email / mobile push posture | Remaining owner / gate |
| --- | --- | --- | --- |
| Bills: `bill.submitted`, `bill.participant_accepted`, `bill.participant_rejected`, `bill.confirmed` (4) | Implemented narrow authorized workflow transitions, E1/E2. Submission notifies pending participants; responses/confirmation use source-derived creator/recipient policy and actor suppression. Safe bill/group IDs; re-fetch bill on open. No general edit/assignment/dispute event inferred. | Optional foundation for these supported events; no live activation evidence. | #369 reuses #967/#345 for any additional bill source semantics; N2 below. |
| Revisions: `bill.revision_proposed`, `revision_resubmitted`, `revision_submitted`, `revision_withdrawn`, `revision_approved`, `revision_rejected`, `revision_payer_confirmed`, `revision_applied` (all with `bill.` prefix, 8) | Implemented bounded transitions, E2. Pending reviewers, affected participants/payers, creator/owner are selected by the revision writer; actor filtering and successful-transition tests exist. Read/archive does not approve/apply; financial truth remains domain-owned. | Optional foundation; no arbitrary financial detail in snippets. | #369/#967 and source owner #402 for new settlement-impact/revision semantics; N2. |
| Settlements: `settlement.request_created`, `payment_marked_paid`, `payment_partially_paid`, `payment_confirmed`, `request_disputed`, `payment_disputed`, `request_cancelled`, `payment_cancelled`, `proof_attached`, `residual_review_needed` (all `settlement.`, 10) | Implemented exact request/payment/proof/residual handoffs, E3. Counterparty derived from request; residual review goes only to receiver/creditor for debtor-created pending residual. Partial-paid notice is not residual acceptance. Proof re-fetch remains authorized; no proof bytes/payment details in notification. | Optional foundation; generic external content only. Provider acceptance is not payment confirmation or delivery receipt. | #969/#353 own broader mismatch/decision-source reconciliation, #369 notification slice; N3. |
| Recurring: `recurring_bill.due_soon`, `recurring_bill.draft_generated` (2) | Implemented explicit due-soon/generate paths, E4, not autonomous scheduling. Generated-draft recipient is template owner; self-generation suppressed; repeated occurrence does not duplicate the draft notice. Due-soon enumeration/dedupe is not proof of a background reminder service. | Optional foundation, no reminder scheduler/digest service acceptance. | #972/#365 own skipped/failed generation and scheduling prerequisites; N4. |
| OCR: `ocr.needs_review` (1); completed/failed have no supported constants | Partial family. E5 creates a notice for a new active API-owned assignment or changed authorized assignee; same-assignee duplicate, self-assignment, completion/cancel, ordinary save/preview/apply/remove do not notify. On-device success is not a server job source. Safe review/bill/attachment IDs only. | Optional foundation only for the existing needs-review event; completed/failed unavailable on both channels. | #570/#575 closed for exact assignment slice; #357/#967 own absent server-worker/source semantics before #369 follow-on, N5. |
| Sync: `sync.conflict_detected`, `sync.operation_failed` (2) | Implemented exact newly persisted conflict/failure source rows, E5, to current actor with explicit self-notification allowance. Retry of an existing terminal row is not a fresh failed event. Queue/retry/resolved/reopened names are not supported events. Open must authorize current sync record, not replay payload. | Optional foundation for two existing events; no automatic noisy queue/retry event or delivery claim. | #361/#362 source authority; #363 existing mobile conflict/failure surface owner; N6. |
| Security/session/account: no supported constants or first-class auth-session notification target | Unavailable, not completed by auth/session APIs or audit records. No current producer, recipient/self rule, unfamiliar-device classifier or safe-open route is credited. Existing session-revocation design remains blocked; reset/invitation service emails are separate auth flows, not generic event coverage. | Unavailable event delivery, even though separate SMTP/auth composers exist. No bypass policy is assumed. | #338/#339/#774 and #369 retain explicit domain/security decisions, N7; #965 comment5666988667 confirms this boundary. |
| Item claims/split/creator review: no supported constants/target writer | Unavailable notification source. Claim/split truth, exact item/claim targets, creator-review eligibility and financial safe summaries require source-domain proof; do not infer from a claim UI. | Unsupported until event/target/content contracts are approved. | #350/#967 own source prerequisites, then a focused #369 child, N2. |
| Friends/group membership/invitations and comments/threads: taxonomy-only events, no supported constants | Unavailable event notifications in this catalog. Existing group/membership APIs and invitation emails are not a generic in-app producer. Day 1 friends/direct-sharing, membership/invitation and shared-bill notes/comments remain required under the PRD. Their missing event producers are not deferred: membership/friend prerequisites stay with #976/#1257/#784, while shared-bill comment/mention source and recipient policy need the focused N8 recommendation. Broader social/thread extensions require a separate scope decision. | Unsupported for absent events; existing invitation transport is not credit for these families. | N8 retains existing source owners and recommends a narrow Day 1 shared-bill comment/mention source gate. No Day 1 requirement is moved later. |

## Channels, preferences, delivery state and readouts

| Capability | Exact inspected posture | Gap / owner |
| --- | --- | --- |
| In-app persistence and current-user list/summary/read/archive | Implemented foundation E1. Recipient-scoped API, unread/read/archived state; client presentation filters do not create authorization. Source writer currently does not call the persisted preference resolver to suppress baseline writes. This is deliberate evidence separation, not a promise of all future critical-event behavior. | Preserve baseline and target authorization in all future children; event completeness stays #369. |
| Persisted preferences | #370 foundation exists (E6): preferences can be saved/read; mobile-local filtering and web readouts are distinct. Resolver evaluates source authorization/content, supported types, admin/provider caps, recipient category, mute/timing/device conditions. Its future-provider eligibility is not permission to send. | End-to-end producer/attempt wiring, group mute and timing enforcement require bounded acceptance/source review under #403; N9. |
| Decision states | `unsupported`, `disabled`, `unconfigured`, `deferred`, `skipped`, `eligible`/`baseline_created`/`eligible_for_future_provider` are decision vocabulary. Reasons retain policy/user/mute/quiet-hours/digest/device distinctions. | Never flatten muted/disabled/deferred into sent, or treat eligible as queued/delivered. |
| Persisted delivery states and leased processing | E7 has recorder, lease, expiry/cancel/suppress and outbox tests. Current supported persistence states: `not_applicable`, `disabled`, `unconfigured`, `deferred`, `queued`, `suppressed`, `cancelled`, `expired`. `attempting`, `sent`, `failed_transient`, `failed_permanent`, `delivered` are explicitly provider-runtime statuses, not accepted foundation states. | Accepted provider result remains queued with bounded result/completion metadata in this foundation; retryable failure can stay queued with next-attempt time. Do not fabricate sent/failed receipts from vocabulary or successful tests. #403/#633 retained foundation; N9 for remaining complete lifecycle. |
| SMTP email | E7 is a real bounded transport seam with disabled/unconfigured and classified failure results; tests use controlled transport boundaries. Options default disabled; repository inspection is not live SMTP configuration evidence. Sender acceptance is not mailbox delivery. | #632 foundation closed; activation/configuration/secret and end-to-end optional-attempt acceptance stay #403, N9. No send/test-send here. |
| Mobile push | E7 has protected token storage, current-user token API and neutral sender. Sender selects active authorized/provisional tokens; default disabled provider returns unconfigured. No APNs/FCM adapter, mobile OS registration/permission or receipt acceptance is credited. | #634 stays open: provider/device lifecycle, feedback/revocation, release/signing and mobile-reference gates; N10. No credentials/tokens read. |
| Admin/global policy | E8 implements guarded readout, cap/provider readiness and redaction/resolver foundations. #689's accepted readout-first chain is complete, not admin mutation/deployment acceptance. | #635 stays open for separately decided write/audit/admin UI scope; #466/#964 are related owners, N11. |
| Mobile user interaction | E9 list/summary, unread/attention/archive filters, read/archive actions, preferences and current supported record-open flow exist; tests cover safe failures and shared controls. Reference [open-state package](../design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md) preserves sign-in, unavailable/deleted/unauthorized/unsupported fallback and re-fetch. | #371 remains closed for its accepted route slice; no automatic credit for new security/claim targets, OS push, all-event accessibility or native acceptance. #372/#975 own composed acceptance, N12. |
| User-web | E10 supports current-user list/summary/preferences readout, filters/sort and safe session/error/empty states. It explicitly does not implement read/archive/mark-all/dismiss, preference mutation, provider status, browser push or authorized record opening. `App.tsx` still exposes transport keys/fallbacks rather than complete localized message resolution. | #373 owns web product completion; source readout is not full interaction parity. N1 handles the known key-display seam first; remaining actions require focused separate contracts. |

## Localization boundary: generic keys versus typed dynamic arguments

[#409 comment5599460079](https://github.com/tommytang213/Settleora/issues/973#issuecomment-5599460079)
is reconciled with merged #1160, #1172, #1174 and #1179, rather than redoing their completed slices.
See [localization readiness audit](DAY1_LOCALIZATION_READINESS_AUDIT.md).
#1172 adds the 27 emitted key pairs; #1174 retains keys through mobile generated-adapter mapping and resolves known static English catalog entries. Bounded safeSummary still takes precedence, unknown keys use product-safe fallback, and raw keys must not become visible copy. This is implemented generic-key behavior, not typed-argument support.
#1179 is historical localization/What's New reconciliation, not a new notification template contract.

`L10N-D1-019` remains partial: recurring due-soon and other dynamic safe summaries cannot be reverse-parsed to infer names, dates, counts, amounts or grammatical arguments.
Current responses have no typed template-argument contract.
Preserve the existing safe generic-key/summary behavior while a separately reviewed server-owned decision defines whether and which dynamic meanings require typed arguments.
Do not silently select a new product/contract direction in this audit.
Then split API/OpenAPI/schema if needed, generated clients, mobile consumption, user-web message resolution (`L10N-D1-008`), push (`015`) and SMTP (`017`) template work into distinct lanes.
Day 1 English foundation is not translation completion; Traditional Chinese/other later-day translations are not newly admitted.

## Existing owners, deduplication and dependency-safe recommendations

Live readback on audit date: #368/#369/#403/#634/#635 remain open.
#370/#371/#448–#452/#629/#689 are closed for the inspected slices above, not replacement-ticket opportunities.
Merged #630/#639/#642/#645/#697/#699/#701/#702/#704/#705 substantiate channel/readout foundations; #707–#714 substantiate source/design blockers, not security runtime.
Duplicate search covered current open PRs and all-state PR references to #973, live open notification/localization/claim issues, current docs/ledger, branch/worktree claims and exact source.
No existing #973 audit PR or active shared-ledger owner was found.
Closed related PRs #1095/#1160/#1161/#1172/#1174/#1179/#1243 are retained prerequisites, not runnable duplicate work.
The external report records query/receipt details.
No child is created, labeled, assigned or activated here.

Each recommendation has **one accountable routing owner**, with related domain owners as prerequisites. Broad umbrellas are not executable contracts. Proposed filenames/path sets below describe boundaries to freeze later, not new allowlists or permission to implement.

| Packet | One routing owner / reuse or proposed focused child | Lane and path strategy / profile / reviewer | Dependency and close rule |
| --- | --- | --- | --- |
| N1 | #373: recommend one focused user-web notification static-key resolution child (`L10N-D1-008`), no exact open child found | `web-user-ui`; explicit hand-written catalog/readout/UI/test files only, exclude generated clients/auth/runtime authority; web profile, cheap independent + local/required GitHub reviews | First safe implementation wave after separate issue contract/reference admission. Preserve bounded safeSummary and safe unknown-key fallback, no typed argument inference. Close only after exact-source tests, responsive evidence and required checks/reviews merge; do not close #373. |
| N2 | #967 routes missing bill/claim notification source children; #350/#345/#402 remain prerequisites | API/domain strong lane; separate source/recipient contract, then enum/OpenAPI/generated-client slice only if needed; focused API + required broader high-risk/contract tests, strong independent | First establish actual persisted authorized source and safe target; money/claim/Figma/manual gates before notification writer. Close each focused child only with source-transition/recipient/idempotency/no-mutation evidence and merge. |
| N3 | #969 routes additional settlement mismatch/review events, reusing #353 domain decisions | API/domain strong; bounded settlement source/tests separate from UI/provider; high-risk API/contract profile | Current residual event is complete for its narrow handoff. No new event before broader review state/recipient policy exists. Close with privacy/authorization/financial non-mutation tests and exact-head merge. |
| N4 | #972 routes recurring scheduling/skip/failure gaps, reusing #365 | Separate recurring source/API and scheduler/provider children; strong for financial source, docs-only for prerequisite plan | Source lifecycle/scheduler decision precedes event writer. Close only actual bounded transition/scheduler evidence, not due-soon endpoint existence. |
| N5 | #357 routes server OCR job/result source prerequisite, then focused #369 notice child | Separate worker contract/source, API-authoritative ingestion and notification target lanes; strong API/storage/contract review as affected | No completed/failed event from on-device preview or manual review save. Job/result recipient/redaction/idempotency evidence precedes runtime; existing #570/#575 not reopened. |
| N6 | #363 owns existing mobile sync conflict/failure surface; source extensions route through #361/#362 | Mobile presentation separate from sync/API strong source contract; mobile profile/reference for UI, high-risk sync/contract profile for source | Current two events stay credited. Queue/retry/resolved events await persisted actionable transition and noise policy, not automatic expansion. Close each surface/source child with authorized open and preserved queued-data tests. |
| N7 | #338 routes narrow session-revocation/security design; #339/#774 supply related auth UX/source prerequisites | Auth/security strong; source/target/recipient/redaction decision packet, schema/OpenAPI/client/runtime split only after approval | #965 comment5666988667 and [session readiness packet](../planning/NOTIFICATION_369_SESSION_REVOCATION_RUNTIME_READINESS_DECISION_PACKET.md) remain gates. No constants/target/classifier/safe-open proof yet. Close only after approved source, exact tests and reviewed merge; audit records never substitute for notice. |
| N8 | #976 routes membership/invitation source completeness, reusing #1257/#784 | Group/auth strong source lane and separate client/reference children; API/contract then mobile/web profile as affected | No generic notification inferred from invitation email. Freeze exact Day 1 source/recipient scope first. PRD Day 1 friends/direct sharing and shared-bill comments remain missing source work, not later-day deferrals. Recommend one focused shared-bill comment/mention event-source and safe-recipient design child under #369 after duplicate reconciliation with #967/#976; broader social/thread features need separate scope approval. No issue is created here. |
| N9 | #403 routes complete optional-attempt/SMTP/timing lifecycle, reusing completed #629/#632/#633 foundations | Separate internal policy/delivery persistence/worker tests and separately gated provider configuration; strong if security/schema/contracts/config touched | Prove source-to-attempt wiring, mute/quiet-hours/digest behavior, expiry/retry/cancel and honest receipt states before activation. Live secrets/provider sending require their own approval. Close bounded children with no-fake-success evidence, not mocked transport alone. |
| N10 | #634 remains push/device lifecycle owner | Separate API token lifecycle, provider adapter, mobile OS permission/registration and release/config tasks; strong source/contract plus mobile profile/reference | Provider/secret/signing/release/manual gates remain. Close only exact protected token lifecycle + neutral runtime plus accepted activation/defer decision; no assumed APNs/FCM success. |
| N11 | #635 remains admin policy mutation/readout owner | Admin/auth strong API/contract lane; separate admin UI/reference under #466/#964; high-risk/API/contract profile | Readout-first chain and #689 remain credited. Decide Day 1 write scope, audit and exposure before mutations; close only accepted bounded API/UI evidence or explicit deferral, not readout rows alone. |
| N12 | #975 owns composed acceptance, consuming #372/#373 client and #368/#403 source/channel evidence | Acceptance-only after admitted children; exact platform/readout/accessibility/native/release evidence as required, independent strong gates for sensitive behavior | No blanket pass here. Keep manual UI/code acceptance and external configuration gaps visible. #368/#369/#403 remain open until their full close rules are met. |

Canonical routing for the later, separately contracted packets follows the current lane manifest, not the generic domain labels above:
- N1: `web-user-ui` / `web-ui` / `cheap_independent`; exact hand-written web paths, with explicit feature tests/build beyond the minimum scaffold profile.
- N2/N3 financial source work and N4 money-impactful generation: `money-settlement-payment` / `api-money` / `strong_independent`; non-financial event plumbing separately uses `api-domain-runtime` / `api-domain` / `strong_independent`.
- N5: `api-domain-runtime` / `api-domain`, escalating receipt/file authorization to `storage-file-privacy-authz` / `api-storage`; both strong. A worker path outside those allowlists needs its own separately admitted contract, never a broad path exemption.
- N6 source: `sync-import-export-restore` / `sync-import-export` / strong; its separate client child: `mobile-application` / `mobile` / cheap, escalated for actual sensitive semantics.
- N7: `auth-session-security` / `api-security` / strong. N8 authorization/membership source uses that lane where security semantics change, otherwise a focused `api-domain-runtime` / `api-domain` / strong child; comment-source planning itself is `docs-planning` / `docs-only` / cheap.
- N9/N10/N11 internal API plumbing: `api-domain-runtime` / `api-domain` / strong; token/security changes use `auth-session-security` / `api-security` / strong. Admin UI is a separate `web-admin-ui` / `web-ui` / strong child; mobile UI is `mobile-application` / `mobile`, with strong escalation for token/security behavior. Live activation/configuration is not granted by any lane.
- N12 planning: `docs-planning` / `docs-only` / cheap; actual acceptance execution needs its own exact platform and sensitive-domain gates.
- Any schema changes split to `schema-migrations` / `api-migrations`; any public contract/client refresh splits to `openapi-generated-clients` / its same-named profile. Both require strong independent review. Each packet retains separate local Codex and required GitHub reviews, explicit allowed paths and its close rule above. No lane/profile declaration here makes an uncontracted child eligible.

The **first safe implementation wave is N1 preparation and its separately admitted generic static-key user-web slice**, not a provider activation or security runtime shortcut.
It can preserve existing safe summary behavior without pretending to solve typed dynamic arguments.
In parallel only separately admitted source/decision packets may prepare N2–N11; none becomes runnable from this table.
Later waves follow domain source/target contracts → bounded event writers → channel wiring → client interaction → composed acceptance.
Security/financial/privacy/product choices unresolved in those domains remain explicit gates owned under current AGENTS policy.

## Validation, close rule and truthful remaining state

This audit changes only two Markdown files.
Run docs-only scope/whitespace/sensitive/link/evidence-consistency checks and inspected docs/scaffold validation, then freeze exact candidate for configured independent, local Codex and required hosted reviews/CI.
Any changed bytes invalidate earlier candidate-bound proof.
No slow local API/Flutter/native/provider test is implied by reading their source/tests.
Normal isolated PR CI is distinct from deployment or artifact publication; no Codemagic action is needed.

Keep this PR draft and unmerged: main-push GHCR publication is outside this task.
Do not close #973 until this audit/ledger merge, #368/#369/#403 receive the completed/remaining graph, duplicate search is recorded, recommendations retain gates/close rules and first safe wave is named.
Those issue/graph mutations are not executed by this task.
No parent closes from documentation alone.
#975/manual UI/native/provider/release acceptance remain incomplete, and no externally delivered notification is claimed.

