# Bill And Settlement Record Lifecycle Policy

Issue: [#718](https://github.com/tommytang213/Settleora/issues/718)

Parent chain: [#716](https://github.com/tommytang213/Settleora/issues/716) →
[#717](https://github.com/tommytang213/Settleora/issues/717) → #718; shared
template: [#960](https://github.com/tommytang213/Settleora/issues/960).

## 1. Decision, Scope, And Authority

This document defines the provider-independent Day 1 lifecycle policy and
implementation handoff for expense bills, bill revisions and financial
dependents, settlement requests and lines, payment claims and allocations,
residuals, recurring templates and occurrences, and deterministic reports,
balances, and forecasts derived from those records. It reconciles current
source at `5d313cb2745b5c9b1239ce1196d1eb883eeba9f5` (tree
`36d123b85a2c82a5c63bbba85421c903e9492bd9`).

This is a documentation-only planning contract. It does not change a formula,
rounding or FX rule, split or residual algorithm, settlement/payment
authority, runtime state, schema, migration, API or OpenAPI, generated client,
UI, file byte, storage, membership, auth/security, sync/import/restore,
deployment, or destructive operation. A statement labelled **future
acceptance requirement** is a condition for later implementation, not current
runtime and not authorization to implement it.

In server mode, API/domain services own financial writes, lifecycle-transition
acceptance, authorization, audit, bill and settlement state, calculations, and
projection inputs. Amounts remain decimal-safe, carry explicit currency, and
use centralized rounding. Clients render server results and may queue requests;
they do not decide current authority, lifecycle eligibility, balance effects,
or financial truth. Workers do not directly mutate core business tables.

Local-only records remain inside the local application/domain boundary. The
current mobile source does not prove an implemented locally authoritative
financial store or lifecycle transition engine. The local-only rows below are
therefore blocked future requirements, not a claim that server records can be
restored or rewritten locally.

File-object and attachment-link lifecycle is owned by
[the #719 policy](STORAGE_FILE_LIFECYCLE_POLICY.md). Group membership and
historical-participant lifecycle is owned by #720. Auth/security lifecycle is
owned by [the #721 policy](AUTH_SECURITY_LIFECYCLE_POLICY.md). This policy may
name those domains as dependency checks, but does not decide them.

## 2. Evidence Classification

The policy uses four evidence classes:

- **Implemented current fact:** directly supported by current source, schema,
  API, or tests. This describes runtime even where it conflicts with intended
  policy.
- **Documented accepted requirement:** already stated by authoritative merged
  architecture or Day 1 scope; it is not necessarily implemented.
- **Future acceptance requirement:** a safety condition that later focused
  implementation must prove before acceptance. It does not choose a missing
  product or money rule.
- **Unresolved product/money choice:** current authority does not determine the
  answer. The affected transition remains blocked or retains current behavior
  until its named owner and manual gate decide it.

## 3. Reconciled Current Runtime Facts

### 3.1 Bills, dependents, and revisions

- `ExpenseBillStatuses` defines `draft`, `pending_confirmation`, `confirmed`,
  `rejected`, `cancelled`, `finalized`, and `archived`, while implemented bill
  archive/restore changes only `ExpenseBill.ArchivedAtUtc`; it does not change
  `ExpenseBill.Status`. The two state dimensions must not be conflated.
- `ExpenseBillLifecycleService.ApplyLifecycleAsync` makes repeated archive or
  restore requests no-op successes. Archive is blocked only when an unarchived
  settlement request directly linked through `SourceExpenseBillId` has status
  `requested`, `partially_paid`, `marked_paid`, or `confirmed`. Restore clears
  `ArchivedAtUtc` without equivalent settlement, revision, participant,
  policy-version, or stale-authorization dependency revalidation.
- Personal/group archive and restore require the current profile/group checks
  and bill creator or owner condition implemented by
  `ExpenseBillLifecycleService`; ordinary list queries exclude archived bills,
  while archive-filtered bill search can retrieve them.
- `ExpenseBillWorkflowEndpoints` implements draft submit, pending participant
  accept, and pending participant reject. Submit resets eligible participant
  acknowledgement rows; all accepted makes the bill `confirmed`; one reject
  makes the root `rejected`. No current endpoint implements bill cancellation,
  finalization, status-`archived`, reopening, or hard deletion.
- Items have `DeletedAtUtc`; bill roots, splits, participants, payers, and
  adjustments do not expose a generic delete lifecycle. Revision application
  mutates the active participant share/status rows in place and synchronizes
  active payer rows: it overwrites a retained matching row, inserts a new row,
  and physically removes absent or duplicate active payer rows. Historical
  pre-apply meaning is therefore carried by retained revision baseline/proposed
  snapshots and revision participant/payer/approval evidence, not by guaranteed
  retention of every prior active component row. An item marker or current
  component row alone is not proof that a confirmed source fact is disposable
  or historically complete.
- `ExpenseBillRevisionStatuses` defines `draft_revision`,
  `submitted_for_review`, `withdrawn_by_proposer`,
  `superseded_by_resubmission`, `rejected`, `accepted_applied`, and
  `cancelled_by_authorized_editor`. Revision rows retain baseline/proposed
  snapshots, calculation and policy-version hashes, affected-user and payer
  confirmation basis, approvals, timestamps, and supersession links.
- Revision rejection is broad in both current server paths. The capability
  policy calls `ExpenseBillRevisionProposalService.IsBillParticipant`, whose
  name is narrower than its predicate: it returns true for a creator, owner,
  participant, or payer. The mutation endpoint uses the same four actor
  categories through `LoadVisibleBillAsync`, and `RejectProposal` does not
  require an approval row. This aligned broad runtime acceptance is current
  fact, not a decision that it is the intended future authority policy. No
  source implements the separate `cancelled_by_authorized_editor` transition.
- Current revision application is blocked when settlement state exists. The
  documented intended policy also forbids a pending revision from silently
  changing balances and requires an explicit future settlement-impact policy
  for an accepted revision after settlement dependencies exist.

### 3.2 Settlements, payments, allocations, and residuals

- `SettlementRequestStatuses` defines `requested`, `partially_paid`,
  `marked_paid`, `confirmed`, `disputed`, and `cancelled`.
  `SettlementRequest.ArchivedAtUtc` exists, but no current endpoint mutates it.
- Request creation persists concrete request lines referencing source bill and,
  where available, source revision. Request lines transition among `open`,
  `partially_cleared`, `cleared`, `waived`, `disputed`, and `cancelled` as a
  dependent result of request/payment operations; no independent line
  lifecycle endpoint exists.
- A request can currently be cancelled only by its requester while status is
  `requested` and no payment exists. Cancellation retains the request and
  changes selected lines and pending residuals to `cancelled`.
- A payment claim creates a `SettlementPayment` in `marked_paid`, allocation
  rows, and any explicit supported pending residual. Receiver confirmation
  moves an eligible claim to `confirmed`; current request status is recomputed
  from persisted active/confirmed coverage.
- A debtor-created `marked_paid` payment may be cancelled while its request is
  `partially_paid` or `marked_paid`; allocations remain stored but cease to be
  active because cancelled payments are excluded. The request and line states
  are recomputed. A creditor may dispute eligible marked-paid payment/request
  state; history is retained and affected pending residuals become disputed.
- `SettlementPaymentAllocation` has no mutable status: it is durable evidence
  of how the payment claim was assigned to request lines. Its effect depends on
  the parent payment status. Allocation deletion or reassignment is not an
  implemented user lifecycle.
- Residuals start `pending_receiver_confirmation`; receiver confirmation maps
  them through the centralized policy to `confirmed`, `carried_forward`,
  `waived`, or `credited`. Cancellation/dispute can instead terminate pending
  residuals as `cancelled`/`disputed`. No current residual restore, reopen,
  expiry, or purge path exists.
- Current money-mutating endpoints generally precheck loaded state, stage
  bounded audit/notification rows, then call `SaveChangesAsync`. The entities
  shown here have no concurrency token and these mutations do not accept an
  idempotency key. A timeout/cancellation or competing writer can therefore
  make the accepted outcome or retry response uncertain; a `DbUpdateException`
  maps to a bounded failure but does not prove all stale-state races are
  rejected.

### 3.3 Recurring records and derived reads

- `RecurringBillTemplateStatuses` defines `active`, `paused`, and `archived`.
  Current endpoints implement active/paused movement and archive. Archive sets
  `ArchivedAtUtc`, clears `NextOccurrenceDate`, and is idempotent only in its
  resulting values; repeated calls still stage an archive audit. Update,
  pause, and resume reject archived templates. There is no restore endpoint.
- Current personal-template mutations are visible only to the owner. Current
  group-template pause, resume, archive, update, and occurrence generation are
  visible to any active group member through `VisibleTemplates` and then use
  `CanAccessGroupAsync`; the handlers add no template-owner predicate. That
  broad group-member acceptance is runtime fact, not an intended-authority
  decision.
- For group occurrence generation, `RecurringBillDraftBuilder.CreateDraftBill`
  records the acting group member as both `CreatedByUserProfileId` and
  `BillOwnerUserProfileId`. The recurring template retains its separate owner,
  who receives the current generated-draft notification when another member
  acts. The focused notification test distinguishes template owner and actor,
  but does not directly assert the generated bill-owner field; that missing
  assertion is future acceptance evidence, not permission to infer a different
  owner.
- `RecurringBillOccurrenceStatuses` defines `forecasted`, `draft_generated`,
  `skipped`, and `cancelled`. Current runtime persists an occurrence when an
  explicit draft is generated, links exactly one generated draft bill through
  a uniqueness constraint, and returns that bill on a sequential retry.
  `skipped`/`cancelled` are recognized blockers but have no current mutation or
  restoration endpoints. Forecast-only rows can be synthesized without
  persistence.
- Template changes do not rewrite previously generated bills. Generated bills
  start as ordinary draft `ExpenseBill` roots and thereafter follow bill
  authority, not template lifecycle.
- `SettlementBalanceProjectionEndpoints` derives read-only balances from
  unarchived active request roots, request lines, active payment claims,
  allocations, and receiver-confirmed residual effects. It excludes
  cancelled/disputed request/payment roots from ordinary active balances and
  refuses unsafe/inconsistent source sets instead of guessing.
- `MonthlyReportEndpoints` derives monthly totals/status counts from
  unarchived bills and unarchived settlement requests. Therefore archiving a
  bill currently removes it and its settlement status counts from this
  ordinary monthly read, even though authoritative financial history remains.
  That current presentation behavior does not prove that archive erases money
  meaning.
- Forecasts and reports are derived views. They are not lifecycle owners and
  must not become hidden mutable financial truth.

## 4. Shared Row Contract

Sections 5.1 through 5.5 are synchronized by stable row ID and together satisfy
every field in the #960 reusable schema. The following values apply to every
row unless a cell says otherwise:

- **Authority mode/workspace:** server mode in one self-hosted workspace for
  `FIN-*` rows; local-only application boundary for `LOCAL-*` rows.
- **Decision authority:** `PROGRAM_ARCHITECTURE.md`,
  `MVP_DAY1_SCOPE.md` sections “Money handling” and “Soft delete and archive,”
  and the three settlement/bill architecture documents named in the evidence
  index. Issue #718 was reverified open and prerequisite #960 complete on
  2026-09-16 UTC. Current implementation evidence never creates policy
  authority by itself.
- **Authoritative boundary and actor:** API/domain service and current
  authorization for server rows. An ID, visible button, generated method,
  cached membership, or prior authorization is not authority. Actor-specific
  differences are stated in section 5.1.
- **User-visible action surface:** `FIN-BILL-*` and `FIN-COMP-*` use the bill
  detail/history surface; `FIN-REV-*` uses bill revision review/history;
  `FIN-SET-*`, `FIN-LINE-*`, `FIN-PAY-*`, `FIN-ALLOC-*`, `FIN-RES-*`, and
  `FIN-PROOF-*` use settlement request/payment detail and history; `FIN-REC-*`
  uses recurring template/occurrence management; `FIN-DER-*` uses balance, report, or forecast
  readouts; and `LOCAL-*` has no accepted user-visible mutation surface. A
  proposed or blocked action has no current surface even when its record family
  has a read surface. This value is part of each row's
  `user_visible_action.surface`, not evidence that a UI control exists.
- **Preconditions:** current authorization, exact current root/dependent state,
  current participants/membership where owned by #720, non-archived required
  roots, currency/invariant validation, current policy version, dependency
  checks, and a concurrency/version condition for future mutations. A required
  confirmation must name the consequence and cannot authorize purge.
- **Ordinary-read effect:** inactive roots may leave ordinary active lists but
  remain retrievable through an authorized history/archive surface where the
  policy row allows it. Historical meaning and audit are retained. File reads
  remain separately subject to #719; membership/auth reads remain subject to
  #720/#721.
- **Mutation effect:** archive/inactive state blocks future ordinary selection
  and mutation unless an exact row permits re-entry. It never rewrites prior
  amounts, currencies, rates, participants, payers, splits, allocations,
  residual outcomes, or confirmations.
- **Persisted metadata:** lifecycle rows require stable subject ID, prior/new
  state and archive dimension, UTC timestamp, requesting/accepting actor,
  bounded reason, correlation/request/idempotency identity, policy/calculation
  versions where money meaning depends on them, and a concurrency/version
  value. A field missing in current persistence is a gap, not a claim it exists.
- **Retry/idempotency/concurrency:** current behavior is credited only where
  section 3 or 5 says so. Future mutation acceptance must return the same
  authoritative result for a proven replay, reject stale/conflicting state,
  recheck authorization/dependencies at acceptance, and atomically commit the
  financial state plus required audit. No row authorizes a new formula.
- **Retention:** confirmed, accepted, applied, allocated, settled, disputed,
  cancelled, superseded, or report-explaining authoritative financial facts
  are class `FINANCIAL_HISTORY_RETAINED`; draft/provisional rows are
  `FINANCIAL_DRAFT_UNRESOLVED`; projections are `DERIVED_REBUILDABLE`; local
  unaccepted material is `LOCAL_UNACCEPTED_UNRESOLVED`. Exact durations,
  clocks, holds, and copy disposition remain `FIN-CHOICE-010`.
- **Hard delete:** ineligible for `FINANCIAL_HISTORY_RETAINED`. It is unresolved
  for a positively dependency-free draft and blocked by `FIN-CHOICE-002`,
  positive dependency/copy proof, audit, concurrency, consequence warning,
  explicit confirmation if user initiated, and destructive/manual gates.
- **Purge/disposal:** unresolved for every authoritative row. It must be a
  separate action after approved retention/hold and backup/export/snapshot/
  replica disposition, positive dependency proof, authority, bounded audit,
  retry/concurrency proof, consequence warning, explicit confirmation, and the
  destructive gate. Retention expiry alone is insufficient.
- **Audit:** record success and material denial/blocked/conflict with actor,
  action, stable subject, bounded prior/new state, reason category, timestamp,
  correlation/idempotency identity, and applicable policy/version evidence.
  Do not log raw request bodies, full notes, OCR text, file bytes/metadata,
  payment details, tokens, credentials, storage/provider internals, or unrelated
  financial data.
- **Client implication:** show the exact row wording, current server result,
  blocked reason, refresh/retry state, and historical readout; never infer
  deletion, settlement finality, restore eligibility, balance effect, or
  authorization. UI/Figma behavior remains a separate lane.
- **Runtime acceptance:** focused API/domain tests; authorization and denied-
  existence tests; stale/concurrent/replay/timeout tests; atomic state/audit
  proof; deterministic rebuild/report tests; schema/migration and OpenAPI/client
  validation only if those focused lanes later change; redaction tests; and
  manual gates listed in section 8. Planning text is never runtime evidence.
- **Manual-gate approval evidence:** every applicable stable gate ID is listed
  in section 5.4. Its status is `pending` and its `approval_evidence` is the
  empty set unless section 5.4 or the gate registry explicitly says otherwise;
  no row in this policy claims a satisfied downstream gate. Gates absent from a
  row are `not-required` for that row's documented current fact, while a future
  change may make them applicable. Section 8 supplies each gate's owner and
  blocked downstream work.

## 5. Lifecycle Policy Rows

### 5.1 Transition, authority, wording, and current evidence

| Row ID | Record / relationship and user wording | Accepted transition and actor/authority | Current implementation state and exact evidence |
| --- | --- | --- | --- |
| `FIN-BILL-001` | Expense bill root — **Archive bill** | Authorized creator/owner requests archive overlay `ArchivedAtUtc: null → timestamp`; API accepts only after current dependencies pass. Underlying financial `Status` is unchanged. | **Implemented current fact, partial safety.** `ExpenseBillLifecycleEndpoints`; `ExpenseBillLifecycleService.ApplyLifecycleAsync`; `BillLifecycleEndpointTests`. Direct active linked requests block archive, but other dependency categories and acceptance-time concurrency are incomplete. |
| `FIN-BILL-002` | Archived expense bill — **Restore bill** | Authorized creator/owner requests archive overlay `timestamp → null`; target is the same retained bill/status, not a recalculated or reopened bill. | **Implemented current fact, incomplete revalidation.** Same lifecycle service/tests; sequential replay is a no-op success. No complete revision, participant, settlement-history, policy-version, or stale-auth guard. |
| `FIN-BILL-003` | Draft bill and participant acknowledgements — **Submit for confirmation** | Creator submits `draft → pending_confirmation|confirmed`; eligible participant rows reset and creator is accepted. | **Implemented current fact.** `ExpenseBillWorkflowEndpoints.SubmitBillAsync`; `ExpenseBillWorkflowEndpointTests`. Archived roots are excluded by query. No idempotency key/version token. |
| `FIN-BILL-004` | Pending participant acknowledgement — **Accept bill** | Exact pending participant accepts `pending_acceptance → accepted`; the root becomes confirmed only when every required acknowledgement is accepted. | **Implemented current fact.** `AcceptBillParticipantAsync`; workflow tests. This row does not describe rejection. |
| `FIN-BILL-005` | Confirmed/finalized/rejected/cancelled bill — **Correct with revision**; no “reopen” claim | Ordinary edit/reopen is blocked until focused policy chooses revision/new-record behavior. A later transition must preserve previous accepted meaning. | **Documented accepted requirement; partially implemented through revision workflow.** `EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md`; no current cancel/finalize/reopen endpoint. `FIN-CHOICE-003/004`. |
| `FIN-BILL-006` | Pending participant acknowledgement — **Reject bill** | Exact pending participant rejects `pending_acceptance → rejected`, which makes the root `rejected`; the server participant workflow accepts the transition. | **Implemented current fact.** `RejectBillParticipantAsync`; workflow tests. Re-entry after rejection is unresolved under `FIN-CHOICE-004`. |
| `FIN-COMP-001` | Bill item — proposed **Remove draft item** / historical **Item retained** | Draft-only logical removal may set `DeletedAtUtc`; confirmed/history-bearing item removal must use a revision and retain source meaning. | **Partial current fact.** `ExpenseBillItem.DeletedAtUtc`; active queries filter it, but no general item lifecycle endpoint or complete retention/dependency policy exists. `FIN-CHOICE-005`. |
| `FIN-COMP-002` | Bill item split / assignment — no independent lifecycle action after acceptance | Split rows are calculation inputs created with their item. Current revision application does not independently mutate or archive split rows; any accepted change must preserve the prior calculation basis through reviewed revision evidence. | **Implemented persistence; independent lifecycle unimplemented.** `ExpenseBillItemSplit`; bill create/calculation source and tests. Exact revision coverage, removal/disposition, and history proof remain `FIN-CHOICE-005`. |
| `FIN-COMP-003` | Bill participant/share relationship — no independent remove/restore after acceptance | Draft creation establishes the relationship. Revision apply mutates current share and acknowledgement fields in place; it does not retain each former active participant-row value as a separate row. | **Implemented persistence and in-place apply mutation; lifecycle/history safety partial.** `ExpenseBillRevisionProposalService.ApplyParticipantState`; revision apply tests; `FIN-CHOICE-005`. Membership/historical-person eligibility remains #720. |
| `FIN-COMP-004` | Bill payer/contribution relationship — no independent remove/restore after acceptance | Draft creation establishes payer rows. Revision apply may overwrite a retained matching row, insert a new row, or physically remove absent/duplicate active payer rows. | **Implemented persistence and replacement/removal behavior; lifecycle/history safety partial.** `ExpenseBillRevisionEndpoints.SynchronizeAppliedPayers`; revision apply tests; `FIN-CHOICE-005`. |
| `FIN-COMP-005` | Bill adjustment and its derived allocation result — no independent lifecycle action after acceptance | The adjustment row and its allocation method are accepted calculation inputs at bill creation; the calculation service derives allocation output rather than persisting a separate adjustment-allocation entity. Current revision snapshots do not prove an independent adjustment archive, restore, or replacement transition. | **Implemented adjustment persistence and derived calculation; independent lifecycle unimplemented.** `ExpenseBillAdjustment`; `ExpenseBillCalculationService` and `ExpenseBillCalculatedAdjustmentAllocation`; bill create/calculation tests; `FIN-CHOICE-005`. |
| `FIN-REV-001` | Draft bill revision root — **Propose changes** | Authorized proposer creates `draft_revision` with a retained baseline/proposed snapshot and calculation/policy identity. | **Implemented current fact.** revision create endpoint, `ExpenseBillRevisionProposalService`, and revision tests. Submission is separately `FIN-REV-006`. |
| `FIN-REV-002` | Submitted revision — **Withdraw proposal** | Proposer moves the exact pending proposal to `withdrawn_by_proposer`; terminal history and invalidated approval evidence remain. | **Implemented current fact.** withdraw endpoint/proposal service and tests. Resubmission is separately `FIN-REV-007`; no restore. |
| `FIN-REV-003` | Revision approval — **Approve changes** | Affected participant accepts the exact revision/calculation hash; its approval row moves `pending_review → approved`. Supersession invalidates that approval rather than carrying it forward. This row does not describe proposal rejection. | **Implemented current fact.** `ExpenseBillRevisionProposalService.RecordApproval`; `ExpenseBillRevisionApproval`; `ExpenseBillRevisionApprovalStatuses`; approval policy/tests. Proposal rejection is separately and accurately classified by `FIN-REV-005`. |
| `FIN-REV-004` | Fully approved revision — **Apply approved changes** | Authorized API applies `submitted_for_review → accepted_applied` only after current approvals/hash and settlement-impact guard pass; becomes active accepted revision without rewriting old snapshots. | **Implemented current fact with settlement block.** revision apply endpoints, `ExpenseBillRevisionSettlementApplyPolicy`, tests. Future settled-impact behavior remains `FIN-CHOICE-006`. |
| `FIN-REV-005` | Pending revision — **Reject proposal** | Current capability and mutation paths both admit a visible creator, owner, participant, or payer: `CanReject` calls the broadly defined `IsBillParticipant`, while the endpoint uses the equivalent `LoadVisibleBillAsync` categories. The accepted transition is `submitted_for_review → rejected` and does not require an approval row. | **Implemented current fact with unresolved intended authority.** `RejectBillRevisionAsync`; `LoadVisibleBillAsync`; `ExpenseBillRevisionProposalService.IsBillParticipant` and `RejectProposal`; `ExpenseBillRevisionActionCapabilityPolicy.CanReject`; revision tests. Whether all four actor categories should remain authorized is `FIN-CHOICE-004`/`G-PRODUCT/G-MONEY`; no current mismatch is claimed. |
| `FIN-REV-006` | Draft revision — **Submit changes for review** | Authorized proposer moves `draft_revision → submitted_for_review`; exact snapshots, hashes, affected users, approvals, and payer-confirmation basis become the review basis. | **Implemented current fact.** submit endpoint/proposal service and revision tests. One active pending official revision is enforced by current service rules. |
| `FIN-REV-007` | Submitted revision — **Revise and resubmit** | Proposer creates a successor; predecessor becomes `superseded_by_resubmission`, approval evidence is invalidated, and stable supersession links remain. | **Implemented current fact.** revise/resubmit endpoint, proposal service, and tests. The predecessor is not restored. |
| `FIN-REV-008` | Pending revision — proposed **Cancel proposal** | `cancelled_by_authorized_editor` exists only as a supported status. No endpoint/domain transition, accepted actor, precondition, or re-entry rule implements it. | **Schema/status possibility; runtime unimplemented.** `ExpenseBillRevisionStatuses`; `FIN-CHOICE-004`; `G-PRODUCT/G-MONEY`. It must remain unavailable until separately decided. |
| `FIN-SET-001` | Settlement request root — **Request payment** | Authorized API derives eligible source facts and creates a `requested` root. Concrete request-line selection and its dependent lifecycle are separately `FIN-LINE-001`. | **Implemented current fact.** `SettlementRequestCreateEndpoints`, `SettlementBasketCreateEndpoints`, expansion service/tests. Retry identity is absent; stale selection is re-derived but concurrent duplicate behavior needs acceptance proof. |
| `FIN-SET-002` | Unpaid request — **Cancel request** | Requester may move an unpaid `requested` root and its lines/pending residuals to `cancelled`; it remains retained history. | **Implemented current fact.** `SettlementCancellationEndpoints.CanCancelSettlementRequest`; cancellation tests. No restore. |
| `FIN-SET-003` | Marked-paid/eligible request — **Dispute settlement** | Authorized counterparty moves eligible request/lines/pending residuals to `disputed`; history remains. | **Implemented current fact.** `SettlementDisputeEndpoints`; tests. Re-entry is separately blocked by `FIN-SET-005`. |
| `FIN-SET-004` | Settlement request archive dimension — proposed **Archive settlement history** | No transition is accepted today. Any future presentation-only archive must preserve all money meaning and cannot change payment progression. | **Schema field only; runtime unimplemented.** `SettlementRequest.ArchivedAtUtc`; read queries filter it; no mutation endpoint. `FIN-CHOICE-008/009`. |
| `FIN-SET-005` | Disputed/cancelled/confirmed settlement request — proposed **Reopen settlement** | No current transition is accepted. Any re-entry target and effect on lines, payments, allocations, residuals, and balances is unresolved. | **Unimplemented.** `FIN-CHOICE-007`; `G-PRODUCT/G-MONEY`. Current terminal/review history is retained. |
| `FIN-SET-006` | Archived settlement request — proposed **Restore settlement history** | No current transition is accepted. A future presentation restore may not reopen or recalculate the workflow and must name its target archive state independently. | **Unimplemented.** `FIN-CHOICE-008/009`; archive field/read filters are evidence only. |
| `FIN-LINE-001` | Settlement request line — not independently user-visible for lifecycle | Parent payment/request operation drives `open ↔ partially_cleared|cleared|waived` or terminal `disputed|cancelled`; source bill/revision and exact amount remain stable. | **Implemented dependent transitions.** `SettlementPaymentAllocationRuntime`; request creation/read tests. No independent restore/delete. |
| `FIN-PAY-001` | Payment claim — **Mark as paid** | Debtor creates `marked_paid` claim, allocations, and supported residual proposal; API validates amount/currency/current request. | **Implemented current fact.** `SettlementPaymentClaimEndpoints`, allocation/residual runtime, claim tests. No idempotency key; timeout/concurrency result can be uncertain. |
| `FIN-PAY-002` | Marked-paid claim — **Confirm payment** | Receiver moves eligible claim `marked_paid → confirmed`; request/line coverage is recomputed from retained allocations/residuals. | **Implemented current fact.** `SettlementPaymentConfirmationEndpoints`; claim/confirmation tests. Confirmed result is not ordinarily reversible. |
| `FIN-PAY-003` | Debtor’s marked-paid claim — **Cancel payment claim** | Debtor moves eligible claim `marked_paid → cancelled`; retained allocations stop contributing and request/lines recompute. | **Implemented current fact.** `SettlementCancellationEndpoints.CanCancelSettlementPayment`; tests. No restore. |
| `FIN-PAY-004` | Marked-paid claim — **Dispute payment** | Receiver moves eligible claim `marked_paid → disputed`, request/lines to disputed, and pending residuals to disputed. | **Implemented current fact.** `SettlementDisputeEndpoints`; tests. Reopen/rejection distinction is unresolved by `FIN-CHOICE-007`. |
| `FIN-ALLOC-001` | Payment allocation — not independently user-visible | Created with claim; remains immutable evidence. Active effect is determined by parent payment status and centralized projection/runtime policy. | **Implemented current fact.** `SettlementPaymentAllocation`; `SettlementPaymentAllocationRuntime`; balance projection tests. No edit/archive/delete endpoint. |
| `FIN-RES-001` | Payment residual proposal — **Propose handling** | Supported non-exact claim creates `pending_receiver_confirmation`; proposal is not final money truth. | **Implemented current fact.** residual policy service, payment claim endpoint/tests. |
| `FIN-RES-002` | Pending residual — **Confirm residual handling** | Receiver maps the exact pending residual to its policy-derived `confirmed|carried_forward|waived|credited` outcome. | **Implemented current fact.** `SettlementPaymentResidualConfirmationEndpoints`, `SettlementResidualRuntime`, policy tests. No restore or expiry. |
| `FIN-RES-003` | Pending residual — dependent **Cancel residual** | Accepted parent request/payment cancellation maps unresolved residual evidence to `cancelled`; there is no independent residual action or restore. | **Implemented dependent transition.** `SettlementCancellationEndpoints`, `SettlementResidualRuntime`, cancellation tests. |
| `FIN-RES-004` | Pending residual — dependent **Dispute residual** | Accepted parent request/payment dispute maps unresolved residual evidence to `disputed`; there is no independent residual action or restore. | **Implemented dependent transition.** `SettlementDisputeEndpoints`, `SettlementResidualRuntime`, dispute tests. |
| `FIN-REC-001` | Active personal recurring template — **Pause schedule** | The personal template owner moves `active → paused`; future forecast selection/generation stops without rewriting old bills. | **Implemented current fact.** `VisibleTemplates`; pause endpoint/tests. Repeated same-state calls write again; no concurrency key. Group authority is separately `FIN-REC-009`. |
| `FIN-REC-002` | Active/paused personal recurring template — **Archive recurring bill** | The personal template owner moves `active|paused → archived`, sets the archive timestamp, clears next occurrence, and stops future forecast generation. | **Implemented current fact.** `VisibleTemplates`; `ArchiveTemplateAsync`; endpoint tests. Restore is separately `FIN-REC-006`; group authority is `FIN-REC-010`. |
| `FIN-REC-003` | Personal forecast occurrence — **Generate draft bill** | The personal template owner explicitly generates `forecasted → draft_generated`, linking one new draft bill; retry returns the existing linked bill. Generated bill then has independent lifecycle. | **Implemented current fact with database uniqueness.** `VisibleTemplates`; `GenerateDraftAsync`; recurring tests/schema constraint. Uncertain commit response and concurrent loser behavior still need proof. Group authority is `FIN-REC-011`. |
| `FIN-REC-004` | Forecast occurrence — proposed **Skip occurrence** | No current transition is accepted. `skipped` is a supported status and generation blocker, but actor, schedule effect, metadata, and re-entry are unresolved. | **Status/schema only; runtime unimplemented.** `RecurringBillOccurrenceStatuses`; generation guard; `FIN-CHOICE-012`. |
| `FIN-REC-005` | Paused personal recurring template — **Resume schedule** | The personal template owner moves `paused → active` and recalculates the next occurrence from the current schedule without rewriting generated bills. | **Implemented current fact.** `VisibleTemplates`; resume endpoint/schedule tests. Archived templates are rejected; no concurrency key. Group authority is `FIN-REC-012`. |
| `FIN-REC-006` | Archived recurring template — proposed **Restore recurring bill** | No current transition is accepted. Target `active` versus `paused` and schedule/dependency/policy revalidation are unresolved. | **Unimplemented.** resume/update reject archived; `FIN-CHOICE-011`; `G-PRODUCT/G-MONEY`. |
| `FIN-REC-007` | Forecast occurrence — proposed **Cancel occurrence** | No current transition is accepted. `cancelled` is a supported status and generation blocker, but actor, schedule effect, metadata, and re-entry are unresolved. | **Status/schema only; runtime unimplemented.** `RecurringBillOccurrenceStatuses`; generation guard; `FIN-CHOICE-012`. |
| `FIN-REC-008` | Skipped/cancelled occurrence — proposed **Reopen occurrence** | No current transition is accepted. A target state and protection against duplicate or historically inconsistent generation are unresolved. | **Unimplemented.** `FIN-CHOICE-012`; `G-PRODUCT/G-MONEY`. |
| `FIN-REC-009` | Active group recurring template — **Pause schedule** | Any current active group member admitted by `VisibleTemplates` and `CanAccessGroupAsync` may move `active → paused`; the handler adds no owner-only predicate. | **Implemented current fact with broad group-member authority.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; pause endpoint/tests. Whether this remains intended authority is an unresolved product/money choice under `FIN-CHOICE-011`. |
| `FIN-REC-010` | Active/paused group recurring template — **Archive recurring bill** | Any current active group member admitted by the group visibility/authorization path may move `active|paused → archived`; the handler adds no owner-only predicate. | **Implemented current fact with broad group-member authority.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; `ArchiveTemplateAsync`; tests. Restore remains `FIN-REC-006`; intended actor policy remains `FIN-CHOICE-011`. |
| `FIN-REC-011` | Group forecast occurrence — **Generate draft bill** | Any current active group member admitted by the group visibility/authorization path may generate the occurrence; current builder source records that acting member as both generated bill creator and bill owner, while the template keeps its distinct owner. | **Implemented current fact with database uniqueness and broad group-member authority; focused owner assertion missing.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; `GenerateDraftAsync`; `RecurringBillDraftBuilder.CreateDraftBill`; `GroupMemberGenerateDraftNotifiesTemplateOwnerWithSafeRecurringMetadataAndAuthorizedRoute` distinguishes notification recipient/template owner from actor but does not assert `BillOwnerUserProfileId`. Intended actor/ownership policy remains `FIN-CHOICE-011`. |
| `FIN-REC-012` | Paused group recurring template — **Resume schedule** | Any current active group member admitted by the group visibility/authorization path may move `paused → active` and recalculate next occurrence; the handler adds no owner-only predicate. | **Implemented current fact with broad group-member authority.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; resume tests. Intended actor policy remains `FIN-CHOICE-011`. |
| `FIN-DER-001` | Settlement balance projection — **View balances** | Read-only deterministic derivation from retained authoritative settlement records; no archive/restore mutation of a projection. | **Implemented current fact.** `SettlementBalanceProjectionEndpoints`, response and endpoint tests. Active read filters archived/disputed/cancelled roots as described in section 3. |
| `FIN-DER-002` | Monthly financial report — **View report** | Read-only derivation from authoritative bills and settlement records. Regeneration never changes source lifecycle. | **Implemented current fact, presentation gap.** `MonthlyReportEndpoints`; tests. Current monthly reads exclude archived bills; `FIN-CHOICE-009`. |
| `FIN-DER-003` | Recurring forecast — **View forecast** | Read-only schedule derivation; an unmaterialized forecast is not an occurrence lifecycle owner and generation is separately `FIN-REC-003`. | **Implemented current fact.** `RecurringBillEndpoints.ListForecastAsync`; tests. It never changes a source template or bill. |
| `FIN-PROOF-001` | Payment-claim proof attachment relationship — **Attach proof** | The financial-domain link follows purpose-specific payment-proof authorization and retains stable payment/file references. File metadata/bytes and their archive/disposal remain #719 authority. | **Implemented current link behavior; cross-domain lifecycle split.** proof attach endpoint/link entity/tests and #719 policy. Exact historical-link retention is governed by `FIN-CHOICE-010` and #719 dependency evidence. |
| `FIN-PROOF-002` | Payment-claim proof attachment relationship — **Remove proof** | Purpose-specific authorization logically removes or unlinks the proof relationship without rewriting the payment claim, allocation, or settlement history. File metadata/bytes, final-copy disposal, and retained-link policy remain #719 authority. | **Implemented current link behavior with cross-domain retention dependency.** proof remove endpoint/link entity/tests and #719 policy. No financial-record hard delete is authorized. |
| `LOCAL-BILL-001` | Local-only bill root — **Archive** only after a local domain exists | A proven local store would own a local archive transition; later server acceptance is a separate sync/import request with full revalidation and conflict handling. | **Unimplemented.** Current mobile queue models a server archive request, not a locally authoritative bill transition. `FIN-CHOICE-013`. |
| `LOCAL-BILL-002` | Local-only archived bill root — **Restore** only after a local domain exists | A proven local store would own local restore to a named local state; it cannot restore or overwrite the server record by implication. | **Unimplemented.** Current mobile queue models a server restore request, not locally authoritative re-entry. `FIN-CHOICE-013`. |
| `LOCAL-REV-001` | Local-only bill revision root | Local proposal/review/apply authority and later server conflict handling are blocked; no local acceptance may rewrite a server bill. | **Unimplemented.** No source proves a locally authoritative revision workflow. `FIN-CHOICE-013`. |
| `LOCAL-ITEM-001` | Local-only bill item | Local item lifecycle, calculation-version identity, disposition, and server acceptance are blocked; no item is disposable by assumption. | **Unimplemented.** No source proves this local financial family. `FIN-CHOICE-013`. |
| `LOCAL-SPLIT-001` | Local-only bill item split / assignment | A local split cannot become accepted server calculation input without conflict-safe server revalidation. | **Unimplemented.** No local split authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-PART-001` | Local-only bill participant/share relationship | Local participant/share state cannot establish server participation, acknowledgement, or historical identity by implication. | **Unimplemented.** No local participant authority is proven; #720 remains the cross-domain dependency. `FIN-CHOICE-013`. |
| `LOCAL-PAYER-001` | Local-only bill payer/contribution relationship | Local payer state cannot establish or rewrite accepted server contribution history. | **Unimplemented.** No local payer authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-ADJ-001` | Local-only bill adjustment/allocation | Local adjustment state cannot change an accepted total, split, payer contribution, or server calculation result. | **Unimplemented.** No local adjustment authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-SET-001` | Local-only settlement request root | Money-moving local acceptance and later server merge are blocked; no client may claim server settlement finality. | **Unimplemented.** No safe local request authority/idempotency/conflict contract is proven. `FIN-CHOICE-013`. |
| `LOCAL-LINE-001` | Local-only settlement request line | A local line may not become accepted source selection or clearing evidence without explicit server acceptance. | **Unimplemented.** No local authoritative line lifecycle is proven. `FIN-CHOICE-013`. |
| `LOCAL-PAY-001` | Local-only payment claim | A local claim is pending presentation only until new server acceptance; it cannot establish paid or settled state. | **Unimplemented.** No local payment acceptance/replay contract is proven. `FIN-CHOICE-013`. |
| `LOCAL-PROOF-001` | Local-only payment-proof relationship | A local proof link is not an accepted payment claim or server file relationship; bytes remain #719 and later upload/linking requires separate server acceptance. | **Unimplemented.** No local proof-link authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-ALLOC-001` | Local-only payment allocation | A client allocation cannot clear a server balance or become immutable accepted evidence by sync implication. | **Unimplemented.** No local allocation authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-RES-001` | Local-only settlement residual | A client residual choice cannot waive, credit, or carry forward server debt without new server acceptance. | **Unimplemented.** No local residual authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-REC-001` | Local-only recurring template | Local schedule state and later server acceptance are blocked pending an explicit local authority/sync contract. | **Unimplemented.** Mobile current state is server-mode reads. `FIN-CHOICE-013`. |
| `LOCAL-OCC-001` | Local-only recurring occurrence | Local generation identity cannot authorize or duplicate a server bill occurrence without conflict-safe server acceptance. | **Unimplemented.** No local occurrence authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-DER-001` | Local-only cached balance projection | Cache is derived presentation only; it must name source version/staleness and never become accepted financial truth. | **Partial presentation/caching only; no authoritative local projection lifecycle proven.** `FIN-CHOICE-013`. |
| `LOCAL-DER-002` | Local-only cached report | Cache is derived presentation only; discard/rebuild cannot affect retained source records or accepted export duties. | **Partial presentation/caching only; no authoritative local report lifecycle proven.** `FIN-CHOICE-013`. |
| `LOCAL-DER-003` | Local-only cached forecast | Cache is derived presentation only; it cannot create an accepted occurrence or generated bill. | **Partial presentation/caching only; no authoritative local forecast lifecycle proven.** `FIN-CHOICE-013`. |

### 5.2 Read, mutation, reversibility, re-entry, and dependencies

| Exact row(s) | Ordinary read and future mutation effect | Reversibility / re-entry rule | Required dependency checks and missing evidence |
| --- | --- | --- | --- |
| `FIN-BILL-001/002` | Archive hides ordinary active bill reads and blocks workflow queries; retained authorized archive/history read remains required. Restore may only re-enable future eligible actions; it cannot change prior money/history. | Archive is conditionally reversible to the same status; restore is conditional. Block on finalized/immutable downstream records, active or completed settlements/payments, replaced revisions, inactive/deleted dependencies, authorization loss, policy/version drift, sync/import conflicts, holds, or stale version. | Current code checks only a direct subset of active request statuses on archive. Future checks: all request lines/payments/allocations/residuals; revisions; participants/payers/splits; reports/exports/import/sync; files via #719; membership via #720; notifications/audit; copies. Missing: complete graph, restore guard, versioning. |
| `FIN-BILL-003..006` | Submit/accept/reject changes future selection and settlement eligibility; retained acknowledgements explain current bill status. Terminal or accepted bills are not ordinary editable drafts. | Submit and participant decisions are not “restore.” Correction/re-entry uses an explicit revision/new root chosen by policy, never status overwrite. | Revisions, payer confirmation, settlement candidates, membership/history, sync, audit, notifications, policy/hash. Missing cancel/finalize/reopen and rejection-recovery policy. |
| `FIN-COMP-001..005` | Draft removal may exclude an input from future calculation. Accepted source meaning must remain readable through authorized revision snapshots/component evidence; current active participant/payer rows are not immutable history. | Draft item restore is unresolved. Confirmed component change uses a new revision. Pre-apply meaning relies on retained snapshot/revision evidence because active participants are overwritten and active payers may be deleted/replaced; split/adjustment revision coverage is incomplete. | Root state; complete baseline/proposed snapshot and revision component/approval coverage; OCR/file #719; participant #720; calculation hash/version; settlement lines; reports/exports/import; audit/copies. Missing item tombstone actor/reason/version, positive proof that snapshots cover every deleted/mutated active fact, active-row disposition audit, and full dependency inventory. |
| `FIN-REV-001..008` | Pending rows remain reviewable to authorized actors; terminal revisions/approvals remain historical and cannot become the active revision except through the exact apply transition. | Withdrawn, superseded, rejected, cancelled, and applied revisions are not restored. A new correction is a new revision. Apply is conditional and irreversible as an accepted event; later correction is another revision. | Active revision identity; snapshot schema/money/rounding policy; affected users; approval/hash; payer confirmation; source bill state; settlement state; participant/member authorization; files/OCR #719; notifications/audit; sync/import/copies. Missing future accepted-revision settlement impact and cancellation policy. |
| `FIN-SET-001..006`, `FIN-LINE-001` | Cancelled/disputed requests leave ordinary active balance but remain history. Archive, if later approved, may affect presentation only and must not change line/payment effects. | Cancel and dispute are retained terminal/review states, not restore. Reopen is blocked pending `FIN-CHOICE-007`. Archive/restore cannot reopen payment progression. | Source bill/revision; exact lines/candidate keys; actors/membership #720; all payments/allocations/residuals/proofs #719; reports/balances; audit/notifications; sync/import/copies. Missing archive actor/reason, reopen policy, complete concurrency/idempotency. |
| `FIN-PAY-001..004`, `FIN-ALLOC-001`, `FIN-RES-001..004`, `FIN-PROOF-001/002` | Parent status determines active balance effect; allocation/residual/proof-link evidence remains readable in authorized history as retention policy requires. Cancel/dispute never deletes allocation evidence; proof-link/byte lifecycle remains #719-dependent. | Marked-paid may reach confirm, cancel, or dispute only through current policy. Confirmed/cancelled/disputed claims, allocations, resolved residuals, and required proof-link history are not restored or edited. A correction/reversal requires a separately approved future record/transition, not history rewrite. | Request/line current coverage; counterparty authorization; source bill/revision; currency/policy; residual state; proof links/files #719; membership #720; notifications/audit; report/balance; sync/import/copies. Missing refund/reversal/reopen policy is Day 2/out of scope. |
| `FIN-REC-001..012` | Paused/archived templates stop future forecast selection/generation; generated bills and historical occurrences remain. Personal mutations require the owner; current group mutations admit any active group member. Template edits never mutate generated bills. | Pause is reversible only through the distinct resume transition. Archive restore target (`active` or `paused`) and revalidation are unresolved. Draft generation is not reversible; the bill is a separate root. Skip/cancel re-entry is unresolved. | Current personal owner or active group membership #720 as split by row; payload participants/payers; schedule/policy version; occurrence uniqueness; generated bill/revisions/settlements; notifications; audit; sync/import/copies. Missing intended group actor policy, a focused group-generation creator/bill-owner/template-owner assertion, archive restore and skip/cancel/reopen APIs, version guards, and local authority. |
| `FIN-DER-001..003` | Projection/report/forecast outputs have no independent mutation or source-retention authority; cached outputs may be discarded and rebuilt only where no snapshot/export duty exists. Archived-source inclusion/exclusion must be explicitly presented. | Recompute, not restore. A persisted historical output is a separate record family requiring its own policy. | Every source family above, query policy/version/as-of identity, authorization, archive filters, missing/unsafe input handling, exports/backups/copies. Missing historical archived-report presentation decision. |
| `LOCAL-*` | Local presentation must say local/pending/stale and cannot imply server acceptance. | Local re-entry is bounded to local state; upload/sync/import is new server acceptance, never silent restoration. | Local store/encryption/backup, device identity, sync operation/idempotency/conflict, server authority, all cross-domain dependencies. Current evidence is absent; implementation blocked. |

### 5.3 Metadata, retry, retention, disposal, and audit profiles

| Exact row(s) | Metadata and retry/concurrency profile | Retention / hard-delete / purge | Audit and redaction additions |
| --- | --- | --- | --- |
| `FIN-BILL-001/002` | `ArchivedAtUtc` and `UpdatedAtUtc` exist; actor/reason/version/idempotency are absent from root. Sequential duplicate returns current result; concurrency is last-save/guard-query behavior, not proven serialization. | Confirmed/history-bearing bill: retained, hard delete ineligible. Positively dependency-free draft: unresolved. Purge unresolved/separate. | Current `bill.archived/restored` success audit; future denial/block/conflict and dependency-version evidence. Do not copy items, notes, payment details, OCR/file data. |
| `FIN-BILL-003..006`, `FIN-COMP-*` | Status/ack timestamps exist; no entity concurrency token/idempotency key. Revision apply mutates active participant rows and can physically remove/replace active payer rows. Future accepted mutation must bind calculation hash/policy and expected version. | Accepted bill meaning is retained through the root plus complete revision snapshots/revision component evidence; retention of every former active component row is not implemented. Draft and active-row disposition classifications remain unresolved. | Current workflow/revision successes are audited, but payer-row removal has no separately identified lifecycle outcome. Future edit/remove/apply/cancel/finalize/reopen attempts require bounded mutated/deleted-row inventory, snapshot-coverage proof, denial/conflict outcomes, and redacted audit. |
| `FIN-REV-*` | Rich timestamps, supersession links, request/correlation fields and calculation/policy hashes exist; current retry/concurrent exact-result behavior remains partial. | Every submitted/terminal/applied revision, snapshot and approval is retained financial history; draft disposal unresolved. | Current revision audit/notifications exist. Never log snapshot JSON, raw notes/OCR, affected-user private detail, or file IDs beyond approved bounded references. |
| `FIN-SET-*`, `FIN-LINE-001` | Status/timestamps exist; request/line version/idempotency key absent. Request creation retry can duplicate unless database/domain conflicts prevent it; exact prior-result replay is not implemented. | All created requests/lines retained; hard delete ineligible. Archive/purge unresolved. | Current create/cancel/dispute successes audited. Future conflict/replay/archive/restore blocked outcomes and exact source-basis version required. |
| `FIN-PAY-*`, `FIN-ALLOC-001`, `FIN-RES-*`, `FIN-PROOF-*` | Claim/payment/residual/link timestamps exist; allocations have creation time only. No idempotency/version token for money transitions. Future acceptance must atomically bind expected request/line coverage and return prior result on replay; file/link retry behavior stays #719-owned. | All claims, allocations, residuals and required financial proof-link outcomes retained; hard delete ineligible; purge unresolved. File-copy disposition stays #719. | Current claim/confirm/cancel/dispute/residual-confirm and proof-link successes are audited by their owners. Exclude full notes, proof bytes/metadata, payment instructions, and unrelated counterparties. |
| `FIN-REC-001/002/005/006/009/010/012` | Status, archive/create/update times exist; actor/reason/version/idempotency missing on root. Same-state operations are not proven prior-result replay. | Template retained while generated bills/occurrences or audit depend on it. Draft-like unused template deletion unresolved; purge separate. | Current create/update/pause/resume/archive success audit. Future restore, group-actor-policy, block, and conflict audit; no raw payload JSON or notes. |
| `FIN-REC-003/004/007/008/011` | Occurrence has status, generated IDs/actor/times and unique template/date constraint. No skip/cancel actor/reason/version. Sequential generation replay returns existing bill; concurrent/timeout proof incomplete. | Generated occurrence retained with bill; unmaterialized forecast is derived. Skip/cancel retention and disposition are unresolved. | Generation success audit exists. Future group-actor-policy, skip/cancel/reopen, and duplicate/conflict audit required. |
| `FIN-DER-*` | Require source/as-of/policy/query version for any persisted cache. Current reads are request-time and create no authoritative projection row. | `DERIVED_REBUILDABLE`; discardable only when positive proof says no authoritative snapshot/export duty. Source records remain retained. | Read audit only where approved; never copy full source rows, notes, payment details, file data, or unrelated identities. |
| `LOCAL-*` | Entire metadata/idempotency/concurrency contract unresolved; local operation ID plus later server sync identity would be required. | `LOCAL_UNACCEPTED_UNRESOLVED`; device cache cleanup cannot delete accepted server history or authoritative local-only records by assumption. | Local audit/privacy/backup rules unresolved; never upload logs/material as acceptance evidence. |

### 5.4 Unresolved-choice references, implementation owner, gates, and acceptance

| Exact row(s) | Open choices | Implementation status | Focused future owner / canonical lane | Manual gates and focused acceptance evidence |
| --- | --- | --- | --- | --- |
| `FIN-BILL-001/002` | `FIN-CHOICE-001/009/010` | Partial | #722 split: money-settlement-payment runtime; schema-migrations and OpenAPI/generated-client only if required; UI via #723 | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`, and conditional `G-SCHEMA/G-CONTRACT`; dependency graph, stale auth/state, concurrent archive/restore, report/history tests. |
| `FIN-BILL-003..006` | `FIN-CHOICE-003/004/010` | Partial | Existing bill/revision owners, then #722/#724 split | `G-MONEY/G-PRODUCT/G-RET/G-PRIV/G-DEST`, conditional `G-CONTRACT/G-CLIENT/G-SCHEMA`; transition/history, retention, copy-disposition, and dependency tests. |
| `FIN-COMP-001..005` | `FIN-CHOICE-002/005/010` | Partial | #722 money runtime plus schema if tombstone/version fields; #724 retention | `G-MONEY/G-RET/G-PRIV/G-DEST`, conditional `G-SCHEMA`; positive dependency, pre/post-apply component inventory, removed-payer and split/adjustment snapshot coverage, redacted audit, and deterministic history rebuild tests. |
| `FIN-REV-001..008` | `FIN-CHOICE-004/006/010` | Implemented/partial/unimplemented by row | Existing revision lane; #722/#724 follow-ups | `G-MONEY/G-PRODUCT/G-RET/G-PRIV/G-DEST`, conditional `G-CONTRACT/G-CLIENT/G-SCHEMA`; any new cancellation or settled-impact behavior remains pending and blocks API/OpenAPI/generated-client, UI/Figma, and persistence changes until its applicable gates pass; concurrency/snapshot/hash/history tests. |
| `FIN-SET-001..006`, `FIN-LINE-001` | `FIN-CHOICE-007/008/009/010` | Implemented/partial/unimplemented by row | #722 money runtime; #724 retention; #723 UI | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`, conditional `G-SCHEMA/G-CONTRACT`; exact line/source, cancellation/dispute/reopen/archive, concurrency, rebuild tests. |
| `FIN-PAY-001..004`, `FIN-ALLOC-001`, `FIN-RES-001..004`, `FIN-PROOF-001/002` | `FIN-CHOICE-007/010` | Implemented/partial | Existing settlement owners; #719 for file/link lifecycle; #722/#724 | `G-MONEY/G-PRODUCT/G-RET/G-PRIV/G-DEST`; rejection/reopen/reversal/refund choices remain pending and outside this task; hostile replay/atomicity/projection and proof-link dependency tests. |
| `FIN-REC-001/002/005/006/009/010/012` | `FIN-CHOICE-011/010` | Implemented/unimplemented by row | #722 money runtime; #724 retention; #723 UI | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`, conditional `G-SCHEMA/G-CONTRACT`; intended group-actor authority, generated-history, and schedule-policy tests. |
| `FIN-REC-003/004/007/008/011` | `FIN-CHOICE-011/012/010` | Implemented/unimplemented by row | Recurring owner through #722 split | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`; intended group-generation actor plus skip/cancel/re-entry remain pending; uniqueness/replay/generated-bill independence tests. |
| `FIN-DER-001..003` | `FIN-CHOICE-009/010` | Implemented read/partial policy | Report/balance/recurring owner after #961 synthesis; UI separately | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST` for future accepted semantics/retention; conditional `G-CONTRACT`. Golden rebuild, archive presentation, inconsistent-source fail-closed tests. |
| `LOCAL-*` | `FIN-CHOICE-013` | Unimplemented | sync-import-export-restore plus local/mobile and money lanes, after #961/#722 split | `G-MONEY/G-SYNC/G-PRIV/G-PRODUCT/G-RET/G-DEST`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; offline conflict, replay, retention/disposition, encryption/backup, server acceptance tests. |

### 5.5 Hard-delete and purge exact fields

For every row classified `FINANCIAL_HISTORY_RETAINED`,
`hard_delete_eligibility.status = ineligible`, target classification is
authoritative financial/history evidence, conditions are unsatisfied,
consequence warning and explicit confirmation are not applicable because no
ordinary hard-delete action is allowed. For `FINANCIAL_DRAFT_UNRESOLVED`, status
is `unresolved`, target classification must be a positively dependency-free
draft, and `FIN-CHOICE-002`, positive dependency/copy proof, authority, audit,
concurrency, warning, confirmation, `G-RET`, and `G-DEST` remain pending.

For every exact row, `purge_disposal_eligibility.status = unresolved`;
`separate_action = required`; conditions are approved retention clock and
expiry, no hold, positive dependencies including backup/export/snapshot/
replica disposition, authority, bounded audit, retry/concurrency safety, and
all relevant gates; consequence warning and explicit confirmation are
required for a user/admin-initiated destructive action. Nothing in this policy
approves that action.

For `FIN-DER-*`, `hard_delete_eligibility.status = ineligible` because the
current request-time projection is not a persisted lifecycle target;
`target_classification = not-applicable request-time projection`; the
conditions require proof that a future cache is non-authoritative and has no
snapshot/export/audit duty; consequence warning and explicit confirmation are
not applicable to the current projection. Its
`purge_disposal_eligibility.status = unresolved` for any future persisted
cache, with separate action required, the same positive non-authority/copy
proof, `G-RET/G-PRIV/G-DEST`, and unresolved warning/confirmation until an
actual user/admin disposal surface exists. Rebuilding or discarding a proven
cache never affects source rows.

For `LOCAL-*`, `hard_delete_eligibility.status = unresolved` and
`target_classification = unresolved authoritative local record versus
non-authoritative cache`. Conditions are an approved local authority model,
complete dependency/copy/backup and server-acceptance inventory, current
authorization, bounded audit, concurrency/retry proof, and
`G-SYNC/G-PRIV/G-RET/G-DEST`; consequence warning and explicit confirmation
remain unresolved. `purge_disposal_eligibility.status = unresolved`,
`separate_action = required`, and uses those same conditions plus approved
retention/hold expiry; consequence warning and explicit confirmation remain
unresolved. Current source does not prove which local material is
authoritative, cached, backed up, or server-accepted, so no local deletion or
disposal is eligible by inference.

## 6. Explicit Open Choices

| Choice ID | Affected authority domain | Exact question and why current authority does not answer | Safe default / blocked posture | Owner, downstream blocker, and manual gate |
| --- | --- | --- | --- | --- |
| `FIN-CHOICE-001` | Server bill lifecycle and every financial/history dependency consulted by restore | Which complete dependency set and target status make bill restore safe? Current restore clears one timestamp and authoritative docs require broader checks without selecting the exact rule. | Keep current runtime fact documented; block any expansion/claim of safe general restoration. Never rewrite prior money facts. | #961 synthesis → #722 focused money runtime and #724 dependency policy; `G-PRODUCT/G-MONEY/G-RET` pending if eligibility semantics change. |
| `FIN-CHOICE-002` | Server bill/component draft disposition and cross-domain dependency proof | May a positively dependency-free financial draft be hard-deleted, and what proves “dependency-free”? Source permits the concept but implements no complete graph or accepted action. | Retain the draft; no hard delete or purge. | #724 retention/dependency policy then #722 focused lanes; `G-DEST/G-MONEY/G-RET` pending. |
| `FIN-CHOICE-003` | Server bill root, revision authority, and downstream settlement meaning | May a finalized/confirmed bill ever reopen, or must correction always be a new revision/new bill? Current statuses/docs do not select one answer. | No ordinary reopen; use only currently implemented revision paths where eligible. | Product/money owner after #961; blocks bill reopen API/schema/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-004` | Server bill participant acknowledgements, rejected bill roots, revision rejection authority, and revision cancellation | Is bill/participant rejection reversible by resubmitting the same root, which acknowledgements reset, should the current broad creator/owner/participant/payer authority remain the intended revision-rejection rule, and who may accept revision cancellation? Submit source can reset certain rejected participant rows only from a draft root; current capability and mutation paths align on the broad four-category predicate, but authoritative requirements do not select that as future policy; and no rejected-root or revision-cancel transition exists. | Preserve the aligned broad runtime behavior as current fact without elevating it to intended policy. Rejected roots remain rejected, revision cancellation remains unavailable, and any authority or re-entry change is blocked pending an explicit decision. | Bill product/money owner via #722; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-005` | Server bill-component tombstones, active-row mutation/disposition, and revision/history authority | Can a draft item tombstone be restored; when must removal use a revision; and what exact retained snapshot/revision evidence and audit make current participant overwrite and payer-row physical replacement/deletion historically sufficient? `DeletedAtUtc` lacks a lifecycle service/actor/reason/version, while revision apply mutates participants and can delete active payer rows without a separate lifecycle outcome. | Retain tombstoned items; do not infer restore/delete expansion; accepted changes use only current revision paths. Treat snapshot coverage or active-row disposal proof as incomplete until deterministic pre/post history rebuild and bounded audit prove it. | Bill runtime/schema owners via #722, retention via #724; `G-SCHEMA/G-MONEY/G-RET/G-PRIV/G-DEST` pending as applicable. |
| `FIN-CHOICE-006` | Server accepted revision and settlement/payment dependency authority | After settlement dependencies exist, should an accepted bill revision flag, reopen, adjust, or leave settlement records unchanged? Authoritative docs deliberately leave this explicit policy unresolved and current apply blocks. | Preserve current block; no silent settlement mutation. | Money-settlement owner after #961/#722; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-007` | Server settlement request, payment, line, allocation, and residual workflow | Is settlement/payment rejection distinct from dispute, and may a disputed/cancelled/confirmed workflow reopen? Current runtime has cancel/dispute/confirm but no reject/reopen transition. | Keep terminal/review state retained; no reopen or aliasing reject to cancel/dispute. | Settlement product/money owner via #722; `G-PRODUCT/G-MONEY` pending. Refund/reversal remains Day 2. |
| `FIN-CHOICE-008` | Server settlement-request archive dimension and financial-history presentation | What does settlement-request archive mean when `ArchivedAtUtc` exists but no mutation, audit, actor, or history UI policy exists? | Do not mutate it; archive may not change money effect or terminal state by implication. | #961/#722/#723/#724 split; `G-PRODUCT/G-MONEY/G-RET/G-CLIENT` pending as applicable. |
| `FIN-CHOICE-009` | Server derived monthly-report/balance reads and their source archive filters | Should archived bills/settlements appear in ordinary monthly reports and historical balance views, and under what explicit filter? Current monthly/balance queries exclude them, while requirements say history remains explainable. | Preserve current read behavior as current fact; require an explicit “archived records excluded/included” presentation before claiming complete historical reporting. Never change formulas here. | Report/product/money owner after #961; blocks report/UI acceptance; `G-PRODUCT/G-MONEY/G-CLIENT` pending if accepted semantics change. |
| `FIN-CHOICE-010` | Every server financial family, retained copies, exports, snapshots, backups, and replicas | What exact retention durations, triggers, holds, minimum tombstones, and backup/export/snapshot/replica disposition apply to each family? No current authority supplies complete values. | Retain authoritative financial history; no purge. | #724 plus record-family owner; `G-RET/G-PRIV/G-DEST` pending. |
| `FIN-CHOICE-011` | Server recurring-template lifecycle, group actor authority, and generated-bill/history dependencies | Should any active group member remain authorized to pause, resume, archive, and generate from a group template, or should one or more actions be owner/editor-restricted; and can an archived template be restored to active or paused after schedule, membership, payload, and policy drift? Current source implements broad active-group-member authority and rejects archived resume, while requirements do not select the intended actor rule or restore target. | Preserve current broad group-member behavior only as implemented fact; do not expand it or call it intended policy. Archived remains archived; generated bills/history remain independent. | Recurring product/money owner via #722/#723; `G-PRODUCT/G-MONEY/G-CLIENT` pending. |
| `FIN-CHOICE-012` | Server recurring-occurrence lifecycle and schedule/generation authority | How are occurrence skip/cancel initiated and can either be reversed? Enum/schema and generation guards exist but requirements do not choose actors, target states, or recurrence effects. | Do not expose mutation/re-entry; preserve any retained row. | Recurring owner via #722/#723; `G-PRODUCT/G-MONEY/G-CLIENT` pending where semantics are selected. |
| `FIN-CHOICE-013` | Local-only financial records, local authority, and later server sync/import acceptance | What locally authoritative financial lifecycle, sync identity, conflict rule, and server acceptance contract exists for offline/local-only mode? Current mobile source does not prove one. | Treat local UI/queue state as pending presentation; never claim server acceptance or rewrite server history. | sync-import-export-restore, mobile, money, privacy, schema/contract owners after #961/#722; `G-SYNC/G-MONEY/G-PRIV/G-PRODUCT` and conditional `G-SCHEMA/G-CONTRACT/G-CLIENT` pending. |

An open choice that remains blocked as above does not block this documentation
task. Selecting any of these answers would be a separate product, money,
schema, contract, UI, privacy, sync, retention, or destructive gate.

## 7. Historical Explainability And Derived Outputs

The authoritative explanation chain is:

```text
bill root + accepted revision baseline/proposed snapshot and revision components
  → current items, splits, participants, payers, adjustments
    (active participant/payer rows may differ from pre-apply state)
  → concrete settlement request lines
  → payment claims + immutable allocations + resolved residuals
  → deterministic balance/report projection under a named policy/as-of view
```

Archive, cancellation, rejection, dispute, pause, or an inactive relationship
may change future selection and ordinary presentation, but it must not sever
that chain. Stable IDs and restrictive references are useful evidence, not a
complete lifecycle policy. Where a future migration cannot retain a direct
reference, it must use an explicit reviewed tombstone/snapshot strategy owned
by the focused schema/domain issue; this document does not choose one.

Any report or balance that omits archived or terminal records must say what it
omits. A historical explanation must still be reconstructable from authorized
retained source facts and applicable policy/calculation versions. A projection
must fail closed on inconsistent source coverage rather than inventing a
balance. No projection row may become the authoritative source merely because
it is cached or exported.

## 8. Manual-Gate Registry

These gates are not required to merge this docs-only policy. They remain
separate pending gates for downstream work; satisfying one never satisfies
another.

| Gate ID | Required / status | Gate and owner | Downstream work blocked |
| --- | --- | --- | --- |
| `G-MONEY` | Yes / pending for changed accepted semantics or runtime | Money/settlement/bill authority; focused domain owner plus human money review | Any new/changed formula, transition eligibility, reopen, adjustment, allocation, residual, projection semantics, or payment acceptance |
| `G-PRODUCT` | Yes / pending where an open choice selects behavior | Tommy/product owner | Reopen/resubmit/restore/reject/skip/cancel wording and accepted behavior not already determined |
| `G-SCHEMA` | Yes / pending where persistence changes | Focused schema/migration owner and human schema review | New lifecycle/version/tombstone fields, constraints, migration, disposal state |
| `G-CONTRACT` | Yes / pending where API/OpenAPI changes | Focused API/OpenAPI/generated-client owner | New endpoints, state/result/error shapes, generated clients |
| `G-CLIENT` | Yes / pending where UI changes | #723 and platform owner/Figma loop | Controls, warnings, confirmations, archive/history filters, accessibility |
| `G-RET` | Yes / pending | #724 plus record-family owner | Retention clocks, holds, tombstones, copy disposition, expiry processing |
| `G-DEST` | Yes / pending | Human destructive-operation owner | Hard delete, purge, physical cleanup, destructive migration/data action |
| `G-PRIV` | Yes / pending where data exposure/minimization changes | Privacy/storage/auth owners | New history/audit/export readouts or minimum-data decisions |
| `G-SYNC` | Yes / pending | sync-import-export-restore owner | Local/server acceptance, conflict, replay, import/restore lifecycle behavior |

## 9. Follow-Up Ownership And Canonical Lanes

No new issue is created by #718 because live owners already exist:

- #961 consumes this policy only after #720 also completes; it may normalize
  terminology but cannot resolve the open choices.
- #722 owns the post-synthesis split into focused money runtime,
  schema/migration, API/OpenAPI/generated-client, and client issues.
- #723 owns separately approved lifecycle UX/Figma behavior.
- #724 owns cross-domain retention, holds, dependency proof, tombstones, and
  terminal disposition planning.
- #719 remains authoritative for settlement proofs, receipt/supporting files,
  and file bytes/links. #720 owns membership and historical participants. #721
  owns auth/security lifecycle. Existing sync/import/export/restore owners keep
  those boundaries.
- #722/#724 and later implementation owners must consume #961 synthesis; this
  child is not authorization to bypass that dependency. Day 2 lock, refund,
  reversal, and governance behavior remains out of scope.

## 10. Evidence Index

All source citations below refer to repository commit
`5d313cb2745b5c9b1239ce1196d1eb883eeba9f5`.

| Evidence | Exact symbol / section | Policy fact supported |
| --- | --- | --- |
| `PROGRAM_ARCHITECTURE.md` | Authority Boundaries; Money Rules; Audit Coverage Rules | API/domain financial authority, decimal/currency/rounding, bounded audit |
| `docs/prd/MVP_DAY1_SCOPE.md` | Expenses and bills; Settlement workflow; Soft delete and archive | Archive/restore intent, retained history, draft-only conditional hard-delete concept, no ordinary financial deletion |
| `docs/architecture/EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md` | Bill Lifecycle And Statuses; Settlement Workflow; Audit Rules | Intended states and distinct bill/participant/settlement concepts |
| `docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md` | Status Transitions; Balance Projection; Validation Expectations | Explicit settlement transition and rebuild requirements |
| `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md` | Core Principles; Suggested Data Model; Balance Projection Rules | Concrete lines, allocations/residuals, deterministic explainability |
| `docs/architecture/BILL_REVISION_APPROVAL_POLICY.md` | State model and approval rules | Revision/approval distinction and no approval carry-forward |
| `docs/architecture/BILL_REVISION_SNAPSHOT_ARCHITECTURE.md` | Snapshot and policy-version contract | Retained baseline/proposed evidence and calculation policy identity |
| `ExpenseBill`, `ExpenseBillStatuses`, `ExpenseBillLifecycleService` | domain and lifecycle source | Separate status/archive dimensions and implemented archive/restore guard |
| `ExpenseBillWorkflowEndpoints` | `SubmitBillAsync`, `AcceptBillParticipantAsync`, `RejectBillParticipantAsync` | Implemented bill/participant transitions |
| expense domain entities | item/split/participant/payer/adjustment types | Persisted dependent financial facts and item deletion marker |
| revision domain/endpoints/policies | revision statuses, approvals, proposal/apply services | Implemented revision lifecycle and settlement apply block |
| settlement domain entities | request/line/payment/allocation/residual status types | Exact current states and retained relationships |
| settlement endpoint/runtime source | create, basket, claim, confirmation, cancellation, dispute, allocation/residual runtime | Current transition actors, guards, and derived coverage behavior |
| recurring domain/endpoints | template/occurrence status types; pause/resume/archive/generate methods | Current recurring transitions and one-way archive/generation behavior |
| `SettlementBalanceProjectionEndpoints` | `VisibleSettlementBalanceRequestQuery`, `TryProjectSettlementRequest` | Read-only source derivation and current inactive filters |
| `MonthlyReportEndpoints` | `VisibleBillsQuery`, settlement count queries | Current archived-root exclusion from monthly presentation |
| API tests named throughout section 5 | endpoint, schema, policy, and calculation test classes | Bounded current behavior; tests do not authorize future policy |
| OpenAPI `packages/contracts/openapi/settleora.v1.yaml` | existing bill, revision, recurring, settlement, report paths | Evidence of current public contract only; no contract change here |

Current prose and runtime differ in important places: the architecture lists
bill `archived` as a root status while runtime uses `ArchivedAtUtc`; a
settlement archive field exists without a transition; recurring archive has no
restore; and monthly reports omit archived bills even though Day 1 policy
requires retained explainability. Runtime is the current-fact authority for
those contradictions. Intended requirements and open choices remain explicit
rather than being silently treated as implemented.

## 11. Non-Goals, Stop Conditions, And Acceptance

This policy does not authorize runtime, schema/migration, API/OpenAPI/client,
UI/Figma, formula, rounding, FX, split, allocation, residual, settlement,
payment, storage/file-byte, membership, auth/security, sync/import/restore,
retention duration, purge, destructive operation, deployment, secret, or
production change. It does not close #717/#716 or start #720/#961.

Future implementation must stop when it would silently choose an open choice,
rewrite financial history, make a client/projection authoritative, reactivate
against an immutable/finalized dependency, infer authorization from
presentation, treat archive/cancel/reject/dispute as deletion, or proceed
without exact money, product, schema, contract, UI, retention, privacy, sync,
or destructive gates.

Issue #718 policy acceptance requires exact one-file scope; every row above
remaining distinguishable and source-grounded; the current/future/open-choice
classification remaining explicit; exact-head `api-money` validation; fresh
strong independent and local Codex review; successful hosted checks/review;
zero unresolved threads; and the required issue/parent/dependency hygiene.
