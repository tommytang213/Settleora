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
  adjustments do not expose a generic delete lifecycle. Current creation,
  calculation, revision, settlement, report, and audit behavior retains these
  financial dependents. An item marker alone is not proof that a confirmed
  source fact is disposable.
- `ExpenseBillRevisionStatuses` defines `draft_revision`,
  `submitted_for_review`, `withdrawn_by_proposer`,
  `superseded_by_resubmission`, `rejected`, `accepted_applied`, and
  `cancelled_by_authorized_editor`. Revision rows retain baseline/proposed
  snapshots, calculation and policy-version hashes, affected-user and payer
  confirmation basis, approvals, timestamps, and supersession links.
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

## 5. Lifecycle Policy Rows

### 5.1 Transition, authority, wording, and current evidence

| Row ID | Record / relationship and user wording | Accepted transition and actor/authority | Current implementation state and exact evidence |
| --- | --- | --- | --- |
| `FIN-BILL-001` | Expense bill root — **Archive bill** | Authorized creator/owner requests archive overlay `ArchivedAtUtc: null → timestamp`; API accepts only after current dependencies pass. Underlying financial `Status` is unchanged. | **Implemented current fact, partial safety.** `ExpenseBillLifecycleEndpoints`; `ExpenseBillLifecycleService.ApplyLifecycleAsync`; `BillLifecycleEndpointTests`. Direct active linked requests block archive, but other dependency categories and acceptance-time concurrency are incomplete. |
| `FIN-BILL-002` | Archived expense bill — **Restore bill** | Authorized creator/owner requests archive overlay `timestamp → null`; target is the same retained bill/status, not a recalculated or reopened bill. | **Implemented current fact, incomplete revalidation.** Same lifecycle service/tests; sequential replay is a no-op success. No complete revision, participant, settlement-history, policy-version, or stale-auth guard. |
| `FIN-BILL-003` | Draft bill and participant acknowledgements — **Submit for confirmation** | Creator submits `draft → pending_confirmation|confirmed`; eligible participant rows reset and creator is accepted. | **Implemented current fact.** `ExpenseBillWorkflowEndpoints.SubmitBillAsync`; `ExpenseBillWorkflowEndpointTests`. Archived roots are excluded by query. No idempotency key/version token. |
| `FIN-BILL-004` | Pending participant acknowledgement — **Accept bill** / **Reject bill** | Exact pending participant accepts `pending_acceptance → accepted`, possibly confirming root; or rejects `→ rejected`, making root `rejected`. API/actor participant accepts. | **Implemented current fact.** `AcceptBillParticipantAsync`, `RejectBillParticipantAsync`; workflow tests. Re-entry after rejection is unresolved under `FIN-CHOICE-004`. |
| `FIN-BILL-005` | Confirmed/finalized/rejected/cancelled bill — **Correct with revision**; no “reopen” claim | Ordinary edit/reopen is blocked until focused policy chooses revision/new-record behavior. A later transition must preserve previous accepted meaning. | **Documented accepted requirement; partially implemented through revision workflow.** `EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md`; no current cancel/finalize/reopen endpoint. `FIN-CHOICE-003/004`. |
| `FIN-COMP-001` | Bill item — proposed **Remove draft item** / historical **Item retained** | Draft-only logical removal may set `DeletedAtUtc`; confirmed/history-bearing item removal must use a revision and retain source meaning. | **Partial current fact.** `ExpenseBillItem.DeletedAtUtc`; active queries filter it, but no general item lifecycle endpoint or complete retention/dependency policy exists. `FIN-CHOICE-005`. |
| `FIN-COMP-002` | Item splits, participants, payers, adjustments — not independently user-removable after acceptance | Changes are draft edits or revision snapshot/application inputs; no independent archive/restore. Accepted rows remain bound to the bill/revision whose money they explain. | **Implemented persistence; lifecycle partial/unimplemented.** domain entities, `ExpenseBillCalculationService`, revision snapshot/proposal services, schema tests. |
| `FIN-REV-001` | Bill revision root — **Propose changes** / **Submit changes for review** | Authorized proposer creates `draft_revision` then submits `→ submitted_for_review`; one active pending official revision. | **Implemented current fact.** `ExpenseBillRevisionEndpoints`, `ExpenseBillRevisionProposalService`, revision endpoint/service tests. Snapshot/version/hash facts are retained. |
| `FIN-REV-002` | Pending revision — **Withdraw proposal** / **Revise and resubmit** | Proposer withdraws pending proposal or creates successor; predecessor becomes `withdrawn_by_proposer` or `superseded_by_resubmission` with stable links. | **Implemented current fact.** revision endpoints and statuses; approval invalidation is retained. Terminal predecessor is not restored. |
| `FIN-REV-003` | Revision approval — **Approve changes** / **Reject changes** | Affected participant decides the exact revision/calculation hash; `pending_review → approved|rejected`. Supersession invalidates prior approval rather than carrying it forward. | **Implemented current fact.** `ExpenseBillRevisionApproval`, `ExpenseBillRevisionApprovalStatuses`, approval policy/tests. |
| `FIN-REV-004` | Fully approved revision — **Apply approved changes** | Authorized API applies `submitted_for_review → accepted_applied` only after current approvals/hash and settlement-impact guard pass; becomes active accepted revision without rewriting old snapshots. | **Implemented current fact with settlement block.** revision apply endpoints, `ExpenseBillRevisionSettlementApplyPolicy`, tests. Future settled-impact behavior remains `FIN-CHOICE-006`. |
| `FIN-REV-005` | Pending revision — **Reject proposal** / **Cancel proposal** | Authorized outcome `→ rejected|cancelled_by_authorized_editor`; retained terminal history, no restore. A new proposal is a new revision. | **Implemented current fact.** revision endpoints/status timestamps/audit. Exact product distinction is source-defined; neither means archive or delete. |
| `FIN-SET-001` | Settlement request and concrete basket — **Request payment** | Authorized API derives eligible source facts and creates `requested` root plus immutable selected request lines. | **Implemented current fact.** `SettlementRequestCreateEndpoints`, `SettlementBasketCreateEndpoints`, expansion service/tests. Retry identity is absent; stale selection is re-derived but concurrent duplicate behavior needs acceptance proof. |
| `FIN-SET-002` | Unpaid request — **Cancel request** | Requester may move an unpaid `requested` root and its lines/pending residuals to `cancelled`; it remains retained history. | **Implemented current fact.** `SettlementCancellationEndpoints.CanCancelSettlementRequest`; cancellation tests. No restore. |
| `FIN-SET-003` | Marked-paid/eligible request — **Dispute settlement** | Authorized counterparty moves eligible request/lines/pending residuals to `disputed`; history remains. **Reopen settlement** is future blocked wording, not current behavior. | **Implemented dispute; reopen unimplemented.** `SettlementDisputeEndpoints`; tests; `FIN-CHOICE-007`. |
| `FIN-SET-004` | Settlement request archive dimension — proposed **Archive settlement history** / **Restore settlement history** | No transition is accepted today. Any future presentation-only archive must preserve all money meaning and cannot reactivate a terminal workflow. | **Schema field only; runtime unimplemented.** `SettlementRequest.ArchivedAtUtc`; read queries filter it; no mutation endpoint. `FIN-CHOICE-008/009`. |
| `FIN-LINE-001` | Settlement request line — not independently user-visible for lifecycle | Parent payment/request operation drives `open ↔ partially_cleared|cleared|waived` or terminal `disputed|cancelled`; source bill/revision and exact amount remain stable. | **Implemented dependent transitions.** `SettlementPaymentAllocationRuntime`; request creation/read tests. No independent restore/delete. |
| `FIN-PAY-001` | Payment claim — **Mark as paid** | Debtor creates `marked_paid` claim, allocations, and supported residual proposal; API validates amount/currency/current request. | **Implemented current fact.** `SettlementPaymentClaimEndpoints`, allocation/residual runtime, claim tests. No idempotency key; timeout/concurrency result can be uncertain. |
| `FIN-PAY-002` | Marked-paid claim — **Confirm payment** | Receiver moves eligible claim `marked_paid → confirmed`; request/line coverage is recomputed from retained allocations/residuals. | **Implemented current fact.** `SettlementPaymentConfirmationEndpoints`; claim/confirmation tests. Confirmed result is not ordinarily reversible. |
| `FIN-PAY-003` | Debtor’s marked-paid claim — **Cancel payment claim** | Debtor moves eligible claim `marked_paid → cancelled`; retained allocations stop contributing and request/lines recompute. | **Implemented current fact.** `SettlementCancellationEndpoints.CanCancelSettlementPayment`; tests. No restore. |
| `FIN-PAY-004` | Marked-paid claim — **Dispute payment** | Receiver moves eligible claim `marked_paid → disputed`, request/lines to disputed, and pending residuals to disputed. | **Implemented current fact.** `SettlementDisputeEndpoints`; tests. Reopen/rejection distinction is unresolved by `FIN-CHOICE-007`. |
| `FIN-ALLOC-001` | Payment allocation — not independently user-visible | Created with claim; remains immutable evidence. Active effect is determined by parent payment status and centralized projection/runtime policy. | **Implemented current fact.** `SettlementPaymentAllocation`; `SettlementPaymentAllocationRuntime`; balance projection tests. No edit/archive/delete endpoint. |
| `FIN-RES-001` | Payment residual proposal — **Propose handling** | Supported non-exact claim creates `pending_receiver_confirmation`; proposal is not final money truth. | **Implemented current fact.** residual policy service, payment claim endpoint/tests. |
| `FIN-RES-002` | Pending residual — **Confirm residual handling** / dependent cancel/dispute | Receiver maps pending residual to policy-derived `confirmed|carried_forward|waived|credited`; parent cancel/dispute maps unresolved residual to `cancelled|disputed`. | **Implemented current fact.** `SettlementPaymentResidualConfirmationEndpoints`, `SettlementResidualRuntime`, policy tests. No restore or expiry. |
| `FIN-REC-001` | Recurring template — **Pause schedule** / **Resume schedule** | Authorized owner changes `active ↔ paused`; resume recalculates next occurrence from current schedule without rewriting old bills. | **Implemented current fact.** `RecurringBillEndpoints`, recurring endpoint/schedule tests. Repeated same-state calls write again; no concurrency key. |
| `FIN-REC-002` | Recurring template — **Archive recurring bill** / proposed **Restore recurring bill** | Archive `active|paused → archived`, sets timestamp and stops future forecast generation. Restore is blocked pending current dependency/policy revalidation and named target state. | **Archive implemented; restore unimplemented.** `RecurringBillEndpoints.ArchiveTemplateAsync`; resume/update reject archived. `FIN-CHOICE-011`. |
| `FIN-REC-003` | Forecast occurrence — **Generate draft bill** | Authorized explicit generation `forecasted → draft_generated` links one new draft bill; retry returns existing linked bill. Generated bill then has independent lifecycle. | **Implemented current fact with database uniqueness.** `GenerateDraftAsync`; recurring tests/schema constraint. Uncertain commit response and concurrent loser behavior still need proof. |
| `FIN-REC-004` | Occurrence — proposed **Skip occurrence** / **Cancel occurrence** / **Reopen occurrence** | No current transition accepted. `skipped` and `cancelled` are terminal blockers for generation; any re-entry target is unresolved. | **Statuses/schema only; runtime unimplemented.** `RecurringBillOccurrenceStatuses`; generation guard. `FIN-CHOICE-012`. |
| `FIN-DER-001` | Settlement balance projection — **View balances** | Read-only deterministic derivation from retained authoritative settlement records; no archive/restore mutation of a projection. | **Implemented current fact.** `SettlementBalanceProjectionEndpoints`, response and endpoint tests. Active read filters archived/disputed/cancelled roots as described in section 3. |
| `FIN-DER-002` | Monthly report and recurring forecast — **View report** / **View forecast** | Read-only derivation. Regeneration uses authoritative source records/current policy; it never changes source lifecycle. | **Implemented current fact, presentation gap.** `MonthlyReportEndpoints`, `RecurringBillEndpoints.ListForecastAsync`, tests. Monthly reads exclude archived bills; `FIN-CHOICE-009`. |
| `LOCAL-BILL-001` | Local-only bill/revision/dependents — **Archive** / **Restore** only after a local domain exists | Local store would own local transition; server acceptance later is a separate sync/import request with full revalidation and conflict handling. | **Unimplemented.** Current mobile queue models server archive/restore requests, not a proven locally authoritative financial lifecycle store. `FIN-CHOICE-013`. |
| `LOCAL-SET-001` | Local-only settlement/payment/allocation/residual records | Money-moving local acceptance and later server merge are blocked; no client may claim server settlement finality. | **Unimplemented.** No source proves safe local settlement authority, idempotency, or merge semantics. `FIN-CHOICE-013`. |
| `LOCAL-REC-001` | Local-only recurring template/occurrence | Local schedule state, generation identity, and later server acceptance are blocked pending an explicit local authority/sync contract. | **Unimplemented.** Mobile current state is server-mode reads/generation. `FIN-CHOICE-013`. |
| `LOCAL-DER-001` | Local-only cached report/balance/forecast | Cache is derived presentation only; it must name source version/staleness and never become accepted financial truth. | **Partial presentation/caching only; no authoritative local projection lifecycle proven.** `FIN-CHOICE-013`. |

### 5.2 Read, mutation, reversibility, re-entry, and dependencies

| Exact row(s) | Ordinary read and future mutation effect | Reversibility / re-entry rule | Required dependency checks and missing evidence |
| --- | --- | --- | --- |
| `FIN-BILL-001/002` | Archive hides ordinary active bill reads and blocks workflow queries; retained authorized archive/history read remains required. Restore may only re-enable future eligible actions; it cannot change prior money/history. | Archive is conditionally reversible to the same status; restore is conditional. Block on finalized/immutable downstream records, active or completed settlements/payments, replaced revisions, inactive/deleted dependencies, authorization loss, policy/version drift, sync/import conflicts, holds, or stale version. | Current code checks only a direct subset of active request statuses on archive. Future checks: all request lines/payments/allocations/residuals; revisions; participants/payers/splits; reports/exports/import/sync; files via #719; membership via #720; notifications/audit; copies. Missing: complete graph, restore guard, versioning. |
| `FIN-BILL-003/004/005` | Submit/accept/reject changes future selection and settlement eligibility; retained acknowledgements explain current bill status. Terminal or accepted bills are not ordinary editable drafts. | Submit and participant decisions are not “restore.” Correction/re-entry uses an explicit revision/new root chosen by policy, never status overwrite. | Revisions, payer confirmation, settlement candidates, membership/history, sync, audit, notifications, policy/hash. Missing cancel/finalize/reopen and rejection-recovery policy. |
| `FIN-COMP-001/002` | Draft removal may exclude an input from future calculation. Accepted source facts remain readable through authorized history/snapshot and are not independently reselected. | Draft item restore is unresolved. Confirmed component change uses a new revision; old row/snapshot remains historical. | Root state; revision/snapshot; OCR/file #719; participant #720; calculation hash/version; settlement lines; reports/exports/import; audit/copies. Missing item tombstone actor/reason/version and full dependency inventory. |
| `FIN-REV-001..005` | Pending rows remain reviewable to authorized affected users; terminal revisions/approvals remain historical and cannot become the active revision except through the exact apply transition. | Withdrawn, superseded, rejected, cancelled, and applied revisions are not restored. A new correction is a new revision. Apply is conditional and irreversible as an accepted event; later correction is another revision. | Active revision identity; snapshot schema/money/rounding policy; affected users; approval/hash; payer confirmation; source bill state; settlement state; participant/member authorization; files/OCR #719; notifications/audit; sync/import/copies. Missing future accepted-revision settlement impact policy. |
| `FIN-SET-001/002/003/004`, `FIN-LINE-001` | Cancelled/disputed requests leave ordinary active balance but remain history. Archive, if later approved, may affect presentation only and must not change line/payment effects. | Cancel and dispute are retained terminal/review states, not restore. Reopen is blocked pending `FIN-CHOICE-007`. Archive/restore cannot reopen payment progression. | Source bill/revision; exact lines/candidate keys; actors/membership #720; all payments/allocations/residuals/proofs #719; reports/balances; audit/notifications; sync/import/copies. Missing archive actor/reason, reopen policy, complete concurrency/idempotency. |
| `FIN-PAY-001..004`, `FIN-ALLOC-001`, `FIN-RES-001/002` | Parent status determines active balance effect; allocation/residual evidence remains readable in authorized history. Cancel/dispute never deletes proof or allocation evidence. | Marked-paid may reach confirm, cancel, or dispute only through current policy. Confirmed/cancelled/disputed claims, allocations, and resolved residuals are not restored or edited. A correction/reversal requires a separately approved future record/transition, not history rewrite. | Request/line current coverage; counterparty authorization; source bill/revision; currency/policy; residual state; proof links #719; membership #720; notifications/audit; report/balance; sync/import/copies. Missing refund/reversal/reopen policy is Day 2/out of scope. |
| `FIN-REC-001/002/003/004` | Paused/archived templates stop future forecast selection/generation; generated bills and historical occurrences remain. Template edits never mutate generated bills. | Pause is reversible to active. Archive restore target (`active` or `paused`) and revalidation are unresolved. Draft generation is not reversible; the bill is a separate root. Skip/cancel re-entry unresolved. | Current owner/group membership #720; payload participants/payers; schedule/policy version; occurrence uniqueness; generated bill/revisions/settlements; notifications; audit; sync/import/copies. Missing archive restore and skip/cancel APIs, version guards, local authority. |
| `FIN-DER-001/002` | Projection has no independent mutation or retention authority; cached outputs may be discarded and rebuilt, but source history cannot. Archived-source inclusion/exclusion must be explicitly presented. | Recompute, not restore. A historical report snapshot, if later persisted, is a separate record family requiring its own policy. | Every source family above, query policy/version/as-of identity, authorization, archive filters, missing/unsafe input handling, exports/backups/copies. Missing historical archived-report presentation decision. |
| `LOCAL-*` | Local presentation must say local/pending/stale and cannot imply server acceptance. | Local re-entry is bounded to local state; upload/sync/import is new server acceptance, never silent restoration. | Local store/encryption/backup, device identity, sync operation/idempotency/conflict, server authority, all cross-domain dependencies. Current evidence is absent; implementation blocked. |

### 5.3 Metadata, retry, retention, disposal, and audit profiles

| Exact row(s) | Metadata and retry/concurrency profile | Retention / hard-delete / purge | Audit and redaction additions |
| --- | --- | --- | --- |
| `FIN-BILL-001/002` | `ArchivedAtUtc` and `UpdatedAtUtc` exist; actor/reason/version/idempotency are absent from root. Sequential duplicate returns current result; concurrency is last-save/guard-query behavior, not proven serialization. | Confirmed/history-bearing bill: retained, hard delete ineligible. Positively dependency-free draft: unresolved. Purge unresolved/separate. | Current `bill.archived/restored` success audit; future denial/block/conflict and dependency-version evidence. Do not copy items, notes, payment details, OCR/file data. |
| `FIN-BILL-003..005`, `FIN-COMP-*` | Status/ack timestamps exist; no entity concurrency token/idempotency key. Future accepted mutation must bind calculation hash/policy and expected version. | Accepted/confirmed/finalized/rejected/cancelled facts retained. Draft classification unresolved. | Current workflow successes are audited; future edit/remove/cancel/finalize/reopen attempts require bounded outcomes. |
| `FIN-REV-*` | Rich timestamps, supersession links, request/correlation fields and calculation/policy hashes exist; current retry/concurrent exact-result behavior remains partial. | Every submitted/terminal/applied revision, snapshot and approval is retained financial history; draft disposal unresolved. | Current revision audit/notifications exist. Never log snapshot JSON, raw notes/OCR, affected-user private detail, or file IDs beyond approved bounded references. |
| `FIN-SET-*`, `FIN-LINE-001` | Status/timestamps exist; request/line version/idempotency key absent. Request creation retry can duplicate unless database/domain conflicts prevent it; exact prior-result replay is not implemented. | All created requests/lines retained; hard delete ineligible. Archive/purge unresolved. | Current create/cancel/dispute successes audited. Future conflict/replay/archive/restore blocked outcomes and exact source-basis version required. |
| `FIN-PAY-*`, `FIN-ALLOC-001`, `FIN-RES-*` | Claim/payment/residual timestamps exist; allocations have creation time only. No idempotency/version token. Future acceptance must atomically bind expected request/line coverage and return prior result on replay. | All claims, allocations, residuals and terminal outcomes retained; hard delete ineligible; purge unresolved. | Current claim/confirm/cancel/dispute/residual-confirm successes audited. Exclude full notes, proof bytes/metadata, payment instructions, and unrelated counterparties. |
| `FIN-REC-001/002` | Status, archive/create/update times exist; actor/reason/version/idempotency missing on root. Same-state operations are not proven prior-result replay. | Template retained while generated bills/occurrences or audit depend on it. Draft-like unused template deletion unresolved; purge separate. | Current create/update/pause/resume/archive success audit. Future restore/block/conflict audit; no raw payload JSON or notes. |
| `FIN-REC-003/004` | Occurrence has status, generated IDs/actor/times and unique template/date constraint. No skip/cancel actor/reason/version. Sequential generation replay returns existing bill; concurrent/timeout proof incomplete. | Generated occurrence retained with bill; unmaterialized forecast is derived. Skip/cancel retention and disposal unresolved. | Generation success audit exists. Future skip/cancel/reopen and duplicate/conflict audit required. |
| `FIN-DER-*` | Require source/as-of/policy/query version for any persisted cache. Current reads are request-time and create no authoritative projection row. | `DERIVED_REBUILDABLE`; discardable only when positive proof says no authoritative snapshot/export duty. Source records remain retained. | Read audit only where approved; never copy full source rows, notes, payment details, file data, or unrelated identities. |
| `LOCAL-*` | Entire metadata/idempotency/concurrency contract unresolved; local operation ID plus later server sync identity would be required. | `LOCAL_UNACCEPTED_UNRESOLVED`; device cache cleanup cannot delete accepted server history or authoritative local-only records by assumption. | Local audit/privacy/backup rules unresolved; never upload logs/material as acceptance evidence. |

### 5.4 Unresolved-choice references, implementation owner, gates, and acceptance

| Exact row(s) | Open choices | Implementation status | Focused future owner / canonical lane | Manual gates and focused acceptance evidence |
| --- | --- | --- | --- | --- |
| `FIN-BILL-001/002` | `FIN-CHOICE-001/009/010` | Partial | #722 split: money-settlement-payment runtime; schema-migrations and OpenAPI/generated-client only if required; UI via #723 | `G-MONEY`, `G-RET`, and conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; dependency graph, stale auth/state, concurrent archive/restore, report/history tests. |
| `FIN-BILL-003/004/005` | `FIN-CHOICE-003/004` | Partial | Existing bill/revision owners, then #722 split | `G-MONEY`, product decision where row chooses reopen/resubmit semantics, conditional contract/client/schema; transition/history tests. |
| `FIN-COMP-001/002` | `FIN-CHOICE-002/005/010` | Partial | #722 money runtime plus schema if tombstone/version fields; #724 retention | `G-MONEY`, `G-RET`, conditional `G-DEST/G-SCHEMA`; positive dependency and deterministic history rebuild tests. |
| `FIN-REV-001..005` | `FIN-CHOICE-006/010` | Implemented/partial | Existing revision lane; #722/#724 follow-ups | `G-MONEY`; any new settled-impact behavior is manual money/product policy; concurrency/snapshot/hash/history tests. |
| `FIN-SET-001..004`, `FIN-LINE-001` | `FIN-CHOICE-007/008/009/010` | Implemented/partial/unimplemented by row | #722 money runtime; #724 retention; #723 UI | `G-MONEY`, `G-RET`, conditional product/schema/contract/client; exact line/source, cancellation/dispute/reopen/archive, concurrency, rebuild tests. |
| `FIN-PAY-001..004`, `FIN-ALLOC-001`, `FIN-RES-001/002` | `FIN-CHOICE-007/010` | Implemented/partial | Existing settlement owners; #722/#724 | `G-MONEY`, `G-RET`; any rejection/reopen/reversal/refund choice manual and outside this task; hostile replay/atomicity/projection tests. |
| `FIN-REC-001/002` | `FIN-CHOICE-011/010` | Partial | #722 money runtime; #724 retention; #723 UI | `G-MONEY`, product choice for restore target, conditional schema/contract/client; generated-history and schedule-policy tests. |
| `FIN-REC-003/004` | `FIN-CHOICE-012/010` | Partial/unimplemented | Recurring owner through #722 split | `G-MONEY`, product choice for skip/cancel/re-entry; uniqueness/replay/generated-bill independence tests. |
| `FIN-DER-001/002` | `FIN-CHOICE-009/010` | Implemented read/partial policy | Report/balance owner after #961 synthesis; UI separately | `G-MONEY` if calculation semantics change; otherwise contract/client gates as applicable. Golden rebuild, archive presentation, inconsistent-source fail-closed tests. |
| `LOCAL-*` | `FIN-CHOICE-013` | Unimplemented | sync-import-export-restore plus local/mobile and money lanes, after #961/#722 split | `G-MONEY`, `G-SYNC`, `G-PRIV`, conditional schema/contract/client; offline conflict, replay, encryption/backup, server acceptance tests. |

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

`FIN-DER-*` request-time projections have no persisted target to purge.
Disposable cache material is eligible only when positively proven
non-authoritative and free of snapshot/export/audit duties; that cleanup does
not affect source rows. `LOCAL-*` remains unresolved because current source
does not prove which local material is authoritative, cached, backed up, or
server-accepted.

## 6. Explicit Open Choices

| Choice ID | Exact question and why current authority does not answer | Safe default / blocked posture | Owner, downstream blocker, and manual gate |
| --- | --- | --- | --- |
| `FIN-CHOICE-001` | Which complete dependency set and target status make bill restore safe? Current restore clears one timestamp and authoritative docs require broader checks without selecting the exact rule. | Keep current runtime fact documented; block any expansion/claim of safe general restoration. Never rewrite prior money facts. | #961 synthesis → #722 focused money runtime and #724 dependency policy; product/money manual gate if eligibility semantics change. |
| `FIN-CHOICE-002` | May a positively dependency-free financial draft be hard-deleted, and what proves “dependency-free”? Source permits the concept but implements no complete graph or accepted action. | Retain the draft; no hard delete or purge. | #724 retention/dependency policy then #722 focused lanes; destructive and money gates. |
| `FIN-CHOICE-003` | May a finalized/confirmed bill ever reopen, or must correction always be a new revision/new bill? Current statuses/docs do not select one answer. | No ordinary reopen; use only currently implemented revision paths where eligible. | Product/money owner after #961; blocks bill reopen API/schema/UI; manual product and money gate. |
| `FIN-CHOICE-004` | Is bill/participant rejection reversible by resubmitting the same root, and which acknowledgements reset? Submit source can reset certain rejected participant rows only from a draft root, but no rejected-root transition exists. | Rejected root remains rejected; no client-side resubmit inference. | Bill product/money owner via #722; manual product/money gate. |
| `FIN-CHOICE-005` | Can a draft item tombstone be restored, and when must removal instead be a revision? `DeletedAtUtc` exists without a lifecycle service, actor/reason/version, or complete policy. | Retain tombstoned row; block restore/delete expansion; accepted bills use revision only. | Bill runtime/schema owners via #722, retention via #724; conditional schema and money gates. |
| `FIN-CHOICE-006` | After settlement dependencies exist, should an accepted bill revision flag, reopen, adjust, or leave settlement records unchanged? Authoritative docs deliberately leave this explicit policy unresolved and current apply blocks. | Preserve current block; no silent settlement mutation. | Money-settlement owner after #961/#722; manual money/product gate. |
| `FIN-CHOICE-007` | Is settlement/payment rejection distinct from dispute, and may a disputed/cancelled/confirmed workflow reopen? Current runtime has cancel/dispute/confirm but no reject/reopen transition. | Keep terminal/review state retained; no reopen or aliasing reject to cancel/dispute. | Settlement product/money owner via #722; manual money/product gate. Refund/reversal remains Day 2. |
| `FIN-CHOICE-008` | What does settlement-request archive mean when `ArchivedAtUtc` exists but no mutation, audit, actor, or history UI policy exists? | Do not mutate it; archive may not change money effect or terminal state by implication. | #961/#722/#723/#724 split; money, retention, and UI gates. |
| `FIN-CHOICE-009` | Should archived bills/settlements appear in ordinary monthly reports and historical balance views, and under what explicit filter? Current monthly/balance queries exclude them, while requirements say history remains explainable. | Preserve current read behavior as current fact; require an explicit “archived records excluded/included” presentation before claiming complete historical reporting. Never change formulas here. | Report/product/money owner after #961; blocks report/UI acceptance; manual product/money gate if accepted semantics change. |
| `FIN-CHOICE-010` | What exact retention durations, triggers, holds, minimum tombstones, and backup/export/snapshot/replica disposition apply to each family? No current authority supplies complete values. | Retain authoritative financial history; no purge. | #724 plus record-family owner; retention/privacy/destructive gates. |
| `FIN-CHOICE-011` | Can an archived recurring template be restored, and should it return active or paused after schedule, membership, payload, and policy drift? Current resume explicitly rejects archived. | Archived remains archived; generated bills/history remain independent. | Recurring product/money owner via #722/#723; manual product/money gate. |
| `FIN-CHOICE-012` | How are occurrence skip/cancel initiated and can either be reversed? Enum/schema and generation guards exist but requirements do not choose actors, target states, or recurrence effects. | Do not expose mutation/re-entry; preserve any retained row. | Recurring owner via #722/#723; manual product gate where semantics are selected. |
| `FIN-CHOICE-013` | What locally authoritative financial lifecycle, sync identity, conflict rule, and server acceptance contract exists for offline/local-only mode? Current mobile source does not prove one. | Treat local UI/queue state as pending presentation; never claim server acceptance or rewrite server history. | sync-import-export-restore, mobile, money, privacy, schema/contract owners after #961/#722; multiple manual gates. |

An open choice that remains blocked as above does not block this documentation
task. Selecting any of these answers would be a separate product, money,
schema, contract, UI, privacy, sync, retention, or destructive gate.

## 7. Historical Explainability And Derived Outputs

The authoritative explanation chain is:

```text
bill root + accepted revision/snapshot
  → retained items, splits, participants, payers, adjustments
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
