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

- Personal, group, future, CSV-import, and recurring-generation paths create
  draft `ExpenseBill` roots, calculated component rows, payer-confirmation
  basis, and bounded audit under different authorization and input contracts.
  None accepts an idempotency key, so an uncertain response does not prove
  whether a retry returns prior state or creates another root. Imported drafts
  remain import-domain accepted outputs; recurring-generated drafts retain
  their occurrence link and then follow bill authority.
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
  makes the root `rejected`. Separately, `FutureBillEndpoints` lets the visible
  creator or bill owner update the merchant and due date of an unarchived draft
  future bill, or cancel it by setting status `cancelled` and
  `ArchivedAtUtc`. Both paths write purpose-specific audit events; cancellation
  removes the bill from ordinary future-bill lists. No current general bill-workflow
  endpoint implements cancellation; no endpoint implements finalization,
  status-`archived`, reopening, or hard deletion.
- `MVP_DAY1_SCOPE.md` and `DAY1_MANUAL_FX_SNAPSHOT_MONEY_POLICY.md` require a
  bill-level manual FX snapshot to be retained as financial truth when original
  and target/share currency differ. Current bill schema and runtime implement
  same-currency behavior and no such snapshot family. Future implementation
  must preserve original/target amounts and currencies, canonical rate
  direction, effective/as-of date, manual source/reason, actor/review basis,
  precision and policy/calculation identity, and audit; later rate changes may
  never recalculate accepted history. This accepted requirement does not
  authorize an FX formula or choose a storage/API shape. Open #352 remains the
  canonical implementation owner and retains its manual money and Figma gates.
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
- Active bill payer creation uses `ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy`:
  a self-created payer is immediately `confirmed`, while a payer created by
  another actor is `pending_confirmation`. The active payer entity/schema also
  supports `rejected` and confirmation/rejection timestamps, but no current
  endpoint confirms or rejects an active payer row. Participant status support
  likewise includes `partially_settled`, `settled`, `waived`, `claimed_paid`,
  and `confirmed_paid` plus `SettledAtUtc`; current settlement runtime does not
  assign those participant statuses or timestamp.
- `ExpenseBillReconciliationEndpoints` lets a personal bill owner/creator or a
  currently authorized group member set any unarchived bill reconciliation
  status to `unreconciled`, `reconciled`, or `ignored`, including same-state
  writes. It records updater/time, conditionally records `ReconciledAtUtc`, may
  replace/clear the bounded note, and writes `bill.reconciliation_updated`.
  Bill search, exports, and monthly reports consume this separate dimension.
- `ExpenseBillRevisionStatuses` defines `draft_revision`,
  `submitted_for_review`, `withdrawn_by_proposer`,
  `superseded_by_resubmission`, `rejected`, `accepted_applied`, and
  `cancelled_by_authorized_editor`. Revision rows retain baseline/proposed
  snapshots, calculation and policy-version hashes, affected-user and payer
  confirmation basis, approvals, timestamps, and supersession links.
- Revision payer rows support `pending_confirmation`, `confirmed`, and
  `rejected`. The current payer-confirmation endpoint lets the exact required
  payer confirm only a submitted revision with the matching calculation hash;
  it writes audit/notification evidence. No current endpoint or domain method
  accepts payer rejection, even though the supported status and persistence
  constraint admit it.
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
- Either the debtor or creditor may dispute a request root while its status is
  `requested`, `partially_paid`, or `marked_paid`; this moves the retained
  request and its dependent line/pending-residual state to `disputed`.
- A payment claim creates a `SettlementPayment` in `marked_paid`, allocation
  rows, and any explicit supported pending residual. Receiver confirmation
  moves an eligible claim to `confirmed`; current request status is recomputed
  from persisted active/confirmed coverage.
- A debtor-created `marked_paid` payment may be cancelled while its request is
  `partially_paid` or `marked_paid`; allocations remain stored but cease to be
  active because cancelled payments are excluded. The request and line states
  are recomputed. A creditor may dispute eligible marked-paid payment/request
  state; history is retained and affected pending residuals become disputed.
- Receiver confirmation accepts a `marked_paid` payment only while its parent
  request is `partially_paid` or `marked_paid`, the debtor/creditor/currency and
  amount invariants still match, and every residual is already resolved to the
  receiver-confirmed status derived by residual policy. A pending, unsafe, or
  mismatched residual blocks payment confirmation.
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

- Template creation persists an `active` personal template for its owner or an
  `active` group template for an authorized active member after payload-
  visibility and forecast-money validation, and stages
  `recurring_bill.template_created`. No idempotency key makes a retry a proven
  prior-result replay.
- `RecurringBillTemplateStatuses` defines `active`, `paused`, and `archived`.
  Current endpoints implement update, active/paused movement, and archive.
  Update accepts active or paused templates, may replace schedule, payload,
  merchant/description, next-occurrence, and forecast money, and stages a
  `recurring_bill.template_updated` audit. Archive sets `ArchivedAtUtc`, clears
  `NextOccurrenceDate`, and is idempotent only in its resulting values;
  repeated calls still stage an archive audit. Update, pause, and resume reject
  archived templates. There is no restore endpoint.
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
  explicit draft is generated. The usual path creates a new persisted
  `draft_generated` occurrence directly from a synthesized, unpersisted
  forecast; only a separately existing persisted `forecasted` row transitions
  to `draft_generated`. Both paths link exactly one generated draft bill
  through a uniqueness constraint and return that bill on a sequential retry.
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
  must not become hidden mutable financial truth. Current forecast listing is
  nevertheless not side-effect-free: it deduplicates and may persist self-
  addressed `recurring_bill.due_soon` notifications for forecasted occurrences,
  and returns a write failure when notification persistence fails. Notification
  lifecycle/retention remains notification-domain authority and does not make
  the derived forecast authoritative.

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
- **User-visible action surface:** `FIN-BILL-011/012` use personal/group bill
  creation, `FIN-BILL-013/014` future-bill creation, `FIN-BILL-015/016` bill
  import/review, and `FIN-BILL-017/018` recurring occurrence generation;
  remaining `FIN-BILL-*`, `FIN-COMP-*`, and `FIN-PART-*` use bill
  detail/history or receipt-review apply as named by the row; `FIN-REV-*` uses
  bill revision review/history;
  `FIN-SET-*`, `FIN-LINE-*`, `FIN-PAY-*`, `FIN-ALLOC-*`, `FIN-RES-*`, and
  `FIN-PROOF-*` use settlement payment detail/history; `FIN-RECON-*` uses bill
  detail/reconciliation and report/search readouts; `FIN-REC-*`
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
| `FIN-BILL-003` | Draft bill and participant acknowledgements — **Submit for confirmation** | Creator submits `draft → pending_confirmation|confirmed`; eligible participant rows reset and creator is accepted. | **Implemented current fact.** `ExpenseBillWorkflowEndpoints.SubmitBillAsync`; `BillWorkflowEndpointTests`. Archived roots are excluded by query. No idempotency key/version token. |
| `FIN-BILL-004` | Pending participant acknowledgement — **Accept bill** | Exact pending participant accepts `pending_acceptance → accepted`; the root becomes confirmed only when every required acknowledgement is accepted. | **Implemented current fact.** `AcceptBillParticipantAsync`; workflow tests. This row does not describe rejection. |
| `FIN-BILL-005` | Confirmed/finalized/rejected/cancelled bill — **Correct with revision**; no “reopen” claim | Ordinary edit/reopen is blocked until focused policy chooses revision/new-record behavior. A later transition must preserve previous accepted meaning. | **Documented accepted requirement; partially implemented through revision workflow.** `EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md`; no general bill-workflow cancel, finalize, or reopen endpoint. Rejected-root recovery is `FIN-CHOICE-004`; narrow future-draft cancellation/re-entry is separately `FIN-BILL-007`/`FIN-CHOICE-029`; confirmed/finalized correction is `FIN-CHOICE-003`. |
| `FIN-BILL-006` | Pending participant acknowledgement — **Reject bill** | Exact pending participant rejects `pending_acceptance → rejected`, which makes the root `rejected`; the server participant workflow accepts the transition. | **Implemented current fact.** `RejectBillParticipantAsync`; workflow tests. Re-entry after rejection is unresolved under `FIN-CHOICE-004`. |
| `FIN-BILL-007` | Draft future bill — **Cancel future bill** | The visible creator or bill owner moves an unarchived `draft → cancelled`, sets `ArchivedAtUtc`, and retains the same bill as audited history; ordinary future-bill lists no longer select it. | **Implemented current fact.** `FutureBillEndpoints.CancelFutureBillAsync`; `FutureBillEndpointTests.CancelFutureBillArchivesDraftAndHidesItFromDefaultList`. No restore/re-entry transition is implemented; the exact recovery target remains `FIN-CHOICE-029` and retention remains `FIN-CHOICE-010`. |
| `FIN-BILL-008` | Non-finalized bill — proposed **Finalize bill** | No transition is accepted today. `finalized` is a supported root status, but no endpoint/domain transition, actor, dependency rule, or re-entry behavior implements it. | **Status/schema possibility; runtime unimplemented.** `ExpenseBillStatuses.Finalized`; intended activation versus inert/deprecated status is `FIN-CHOICE-025`; `G-PRODUCT/G-MONEY`. |
| `FIN-BILL-009` | Bill root status — proposed **Archive bill status** | No transition is accepted today. Status `archived` is supported but is distinct from the implemented `ArchivedAtUtc` overlay in `FIN-BILL-001/002`; the two must not be conflated. | **Status/schema possibility; runtime unimplemented.** `ExpenseBillStatuses.Archived`; intended activation versus remaining unsupported is `FIN-CHOICE-026`; `G-PRODUCT/G-MONEY`. |
| `FIN-BILL-010` | Unarchived draft future bill — **Update future bill** | The visible creator or bill owner performs a same-state `draft → draft` update of merchant and/or due date; the root remains unarchived and no accepted participant, payer, split, settlement, or prior money fact is rewritten. | **Implemented current fact.** `FutureBillEndpoints.UpdateFutureBillAsync`; future-bill endpoint tests; `future_bill.updated` audit. No entity version/idempotency key proves concurrent or uncertain-result replay safety. |
| `FIN-BILL-011` | New personal bill root and calculated dependents — **Create personal bill** | The current profile actor creates one personal `draft` owned/created by that actor, with actor participant, items/splits/adjustments, a self-confirmed payer, calculated totals/shares, and `bill.created` audit accepted atomically by the API/domain boundary. | **Implemented current fact.** `PersonalBillEndpoints.CreatePersonalBillAsync`; `PersonalBillEndpointTests`. Profile authorization, payload/currency validation, and both calculation passes precede save; no idempotency key makes uncertain-response retry a prior-result replay. |
| `FIN-BILL-012` | New group bill root and calculated dependents — **Create group bill** | A current active group member creates one group `draft`; every submitted participant/payer profile must be an active group member, the acting member is creator/owner, payer confirmation basis is actor-relative, and calculation plus `bill.created` audit commit through the API/domain boundary. | **Implemented current fact.** `GroupBillEndpoints.CreateGroupBillAsync`; `GroupBillEndpointTests`. Group/membership and payload validation differ materially from personal creation; no idempotency key. |
| `FIN-BILL-013` | New personal future-bill draft — **Create future bill** | The current profile actor creates a personal future `draft` owned/created by that actor after due-date, payload-visibility, money, and calculation validation; `future_bill.created` is staged with the root. | **Implemented current fact.** `FutureBillEndpoints.CreateFutureBillAsync`; personal future-bill tests. This entry is not posting, cancellation, or recurrence generation; no idempotency key. |
| `FIN-BILL-014` | New group future-bill draft — **Create future bill** | A currently authorized group actor creates a group future `draft` only when every payload profile is visible in the active group-member set; the actor is creator/owner and group audit records `future_bill.created`. | **Implemented current fact.** `FutureBillEndpoints.CreateFutureBillAsync`; group future-bill tests. Group membership/payload checks differ from personal future creation; no idempotency key. |
| `FIN-BILL-015` | Personal CSV-imported draft bill — **Import bills** | The current profile actor supplies validated CSV rows; import planning groups client keys, creates actor-owned personal drafts with actor-only participant/payer basis, runs authoritative calculation, and the immediate or confirmed-session path accepts the resulting roots under import authority. | **Implemented current fact with separate import workflow.** `BillCsvImportEndpoints.ImportPersonalBillsCsvAsync`, plan/create and confirmation paths; `BillCsvImportEndpointTests`. Raw CSV/session lifecycle, replay, discard, restore, and sync remain import-owner concerns; created bills then follow this policy. |
| `FIN-BILL-016` | Group CSV-imported draft bill — **Import bills** | A current active group member supplies validated rows whose referenced profiles satisfy group visibility; import planning creates group drafts and authoritative calculated components, and the immediate or confirmed-session path accepts them under group/import authority. | **Implemented current fact with separate group/import checks.** `ImportGroupBillsCsvAsync`; plan/create and confirmation paths; group CSV tests. Import session/replay/discard stays with its canonical owner; created bills then follow this policy. |
| `FIN-BILL-017` | Personal recurring-generated draft bill — **Generate draft bill** | The personal template owner generates a draft whose creator/owner and component calculation derive from the accepted template payload; the bill is linked to one occurrence and then becomes an independent bill root. | **Implemented current fact.** `RecurringBillEndpoints.GenerateDraftAsync`; `RecurringBillDraftBuilder.CreateDraftBill`; recurring tests. Occurrence uniqueness/replay is `FIN-REC-003`; template archive never rewrites this bill. |
| `FIN-BILL-018` | Group recurring-generated draft bill — **Generate draft bill** | A current active group member admitted by group/template authority generates a draft; current builder source records that actor as creator and bill owner, validates payload visibility, links one occurrence, and then hands lifecycle authority to the independent bill root. | **Implemented current fact with unresolved intended actor/ownership policy.** `GenerateDraftAsync`; `RecurringBillDraftBuilder.CreateDraftBill`; `FIN-REC-011`; `FIN-CHOICE-011/014`. |
| `FIN-COMP-001` | Bill item — proposed **Remove draft item** / historical **Item retained** | Draft-only logical removal may set `DeletedAtUtc`; confirmed/history-bearing item removal must use a revision and retain source meaning. | **Partial current fact.** `ExpenseBillItem.DeletedAtUtc`; active queries filter it, but no general item lifecycle endpoint or complete retention/dependency policy exists. `FIN-CHOICE-005`. |
| `FIN-COMP-002` | Bill item split / assignment — no independent lifecycle action after acceptance | Split rows are calculation inputs created with their item. Current revision application does not independently mutate or archive split rows; any accepted change must preserve the prior calculation basis through reviewed revision evidence. | **Implemented persistence; independent lifecycle unimplemented.** `ExpenseBillItemSplit`; bill create/calculation source and tests. Exact revision coverage, removal/disposition, and history proof remain `FIN-CHOICE-005`. |
| `FIN-COMP-003` | Bill participant/share relationship — no independent remove/restore after acceptance | Draft creation establishes the relationship. Revision apply mutates current share and acknowledgement fields in place; it does not retain each former active participant-row value as a separate row. | **Implemented persistence and in-place apply mutation; lifecycle/history safety partial.** `ExpenseBillRevisionProposalService.ApplyParticipantState`; revision apply tests; `FIN-CHOICE-005`. Membership/historical-person eligibility remains #720. |
| `FIN-COMP-004` | Bill payer/contribution relationship — no independent remove/restore after acceptance | Draft creation establishes payer rows. Revision apply may overwrite a retained matching row, insert a new row, or physically remove absent/duplicate active payer rows. | **Implemented persistence and replacement/removal behavior; lifecycle/history safety partial.** `ExpenseBillRevisionEndpoints.SynchronizeAppliedPayers`; revision apply tests; `FIN-CHOICE-005`. |
| `FIN-COMP-005` | Bill adjustment and its derived allocation result — no independent lifecycle action after acceptance | The adjustment row and its allocation method are accepted calculation inputs at bill creation; the calculation service derives allocation output rather than persisting a separate adjustment-allocation entity. Current revision snapshots do not prove an independent adjustment archive, restore, or replacement transition. | **Implemented adjustment persistence and derived calculation; independent lifecycle unimplemented.** `ExpenseBillAdjustment`; `ExpenseBillCalculationService` and `ExpenseBillCalculatedAdjustmentAllocation`; bill create/calculation tests; `FIN-CHOICE-005`. |
| `FIN-COMP-006` | Active bill payer confirmation basis — no separate user action at creation | Payer creation records the creating actor; self-created payer facts start `confirmed` with confirmation time, while facts created for another payer start `pending_confirmation`. | **Implemented current initialization fact.** `ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy`; personal/group/recurring/import creation callers and tests. Later active-payer acceptance authority/effect remains `FIN-CHOICE-020..023`. |
| `FIN-COMP-007` | Pending active bill payer — proposed **Confirm payer contribution** | No post-creation active-payer transition is accepted today. Availability, exact actor, effect on bill confirmation/settlement selection, audit, and retry remain blocked. | **Persistence/status only; runtime unimplemented.** `ExpenseBillPayerConfirmationStatuses.Confirmed` and timestamps are evidence, not an endpoint. `FIN-CHOICE-020/021/023`; `G-PRODUCT/G-MONEY`. |
| `FIN-COMP-008` | Pending active bill payer — proposed **Reject payer contribution** | No active-payer rejection transition is accepted today. Availability, actor, immutable action basis, bill-root/selection effect, and correction/re-entry are independently blocked. | **Persistence/status only; runtime unimplemented.** `ExpenseBillPayerConfirmationStatuses.Rejected` and timestamp; `FIN-CHOICE-022/023/030..032`; `G-PRODUCT/G-MONEY`. |
| `FIN-COMP-009` | Draft bill OCR-derived items, splits, payer, shares, and total — **Apply reviewed receipt** | The visible bill creator/owner applies an exact reviewed OCR source/version to an eligible draft with no downstream settlement state: prior items from that review are soft-replaced, new items/splits are added, the sole payer and participant shares/residual allocation are recalculated, and `bill_attachment.ocr_review_applied` commits with the bill mutation. | **Implemented current money-affecting mutation with narrow guards.** `ReceiptOcrReviewEndpoints.ApplyReceiptOcrReviewAsync`; OCR review apply tests. It requires supported reviewed source, expected review update time, write-time preview validity, eligible draft shape/sole participant, readable receipt link, and transactional relational save; no idempotency key proves uncertain retry. OCR/file object lifecycle remains #719, while calculated bill history and future revision/settlement effects remain financial authority. |
| `FIN-FX-001` | Converted bill’s bill-level manual FX snapshot — **Record exchange-rate snapshot** / historical **Rate retained** | A later accepted converted-bill create or revision must atomically retain original/target amounts and currencies, manual rate in canonical `original_to_target` direction, effective/as-of date, manual source/reason, actor/review basis, precision and policy/calculation identity. Once accepted, that snapshot is immutable financial truth; correction creates a reviewed successor/new bill fact rather than recalculating history. | **Documented accepted requirement; runtime/schema unimplemented.** `MVP_DAY1_SCOPE.md` “Money handling”; `DAY1_MANUAL_FX_SNAPSHOT_MONEY_POLICY.md`; settlement architectures’ same-currency boundary. Current bill runtime remains same-currency. Open #352 owns focused implementation and its manual money/Figma gates; it must consume #961 synthesis and coordinate any #722 split. This row defines no new formula. |
| `FIN-PART-001` | Bill participant `partially_settled` — proposed dependent settlement projection | No transition is accepted today; settlement runtime does not assign this supported participant status or `SettledAtUtc`. | **Status/schema only; runtime unimplemented.** `ExpenseBillParticipantStatuses.PartiallySettled`; `FIN-CHOICE-024`; `G-PRODUCT/G-MONEY`. |
| `FIN-PART-002` | Bill participant `settled` — proposed dependent settlement projection | No transition is accepted today; settlement finality comes from retained settlement records, not this inert field by implication. | **Status/schema only; runtime unimplemented.** `ExpenseBillParticipantStatuses.Settled`; `ExpenseBillParticipant.SettledAtUtc`; `FIN-CHOICE-024`; `G-PRODUCT/G-MONEY`. |
| `FIN-PART-003` | Bill participant `waived` — proposed dependent settlement projection | No transition is accepted today; no current participant-status write authorizes waiver or changes a balance. | **Status/schema only; runtime unimplemented.** `ExpenseBillParticipantStatuses.Waived`; `FIN-CHOICE-024`; `G-PRODUCT/G-MONEY`. |
| `FIN-PART-004` | Bill participant `claimed_paid` — proposed dependent settlement projection | No transition is accepted today; current payment-claim truth is owned by settlement request/payment records. | **Status/schema only; runtime unimplemented.** `ExpenseBillParticipantStatuses.ClaimedPaid`; `FIN-CHOICE-024`; `G-PRODUCT/G-MONEY`. |
| `FIN-PART-005` | Bill participant `confirmed_paid` — proposed dependent settlement projection | No transition is accepted today; current confirmed-payment truth is owned by retained settlement records. | **Status/schema only; runtime unimplemented.** `ExpenseBillParticipantStatuses.ConfirmedPaid`; `FIN-CHOICE-024`; `G-PRODUCT/G-MONEY`. |
| `FIN-REV-001` | Confirmed/rejected bill with no active pending revision — **Propose changes** | A current visible bill creator, bill owner, participant, or payer creates `draft_revision` with a retained baseline/proposed snapshot and calculation/policy identity; archived bills are ineligible. | **Implemented current fact.** `ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision`; broadly defined `ExpenseBillRevisionProposalService.IsBillParticipant`; revision create endpoint/tests. Submission is separately `FIN-REV-006`. |
| `FIN-REV-002` | Draft or submitted active-pending revision — **Withdraw proposal** | The proposer moves the exact `draft_revision|submitted_for_review → withdrawn_by_proposer`; the revision and existing approval rows remain retained, but withdrawal itself does not change approval-row status or mark approvals invalidated. | **Implemented current fact.** `ExpenseBillRevisionProposalService.WithdrawProposal` accepts `ExpenseBillRevisionStatuses.IsActivePending`; withdraw endpoint/tests. Resubmission is separately `FIN-REV-007`; no restore. |
| `FIN-REV-003` | Revision approval — **Approve changes** | Affected participant accepts the exact revision/calculation hash; its approval row moves `pending_review → approved`. Supersession invalidates that approval rather than carrying it forward. This row does not describe proposal rejection. | **Implemented current fact.** `ExpenseBillRevisionProposalService.RecordApproval`; `ExpenseBillRevisionApproval`; `ExpenseBillRevisionApprovalStatuses`; approval policy/tests. Proposal rejection is separately and accurately classified by `FIN-REV-005`. |
| `FIN-REV-004` | Fully approved revision — **Apply approved changes** | The bill owner applies `submitted_for_review → accepted_applied` only when the revision is the latest submitted proposal, its supported apply basis/hash and participant approvals match, every revision payer is `confirmed`, and the settlement-impact guard passes; it becomes the active accepted revision without rewriting old snapshots. | **Implemented current fact with settlement block.** `ExpenseBillRevisionProposalService.CanApplyProposal`; revision apply endpoints; `ExpenseBillRevisionSettlementApplyPolicy`; tests. Future settled-impact behavior remains `FIN-CHOICE-006`. |
| `FIN-REV-005` | Pending revision — **Reject proposal** | Current capability and mutation paths both admit a visible creator, owner, participant, or payer: `CanReject` calls the broadly defined `IsBillParticipant`, while the endpoint uses the equivalent `LoadVisibleBillAsync` categories. The accepted transition is `submitted_for_review → rejected` and does not require an approval row. If the rejecting actor has an existing non-superseded approval row, `RejectProposal` also changes it to `rejected`, sets its rejection time, and clears its approval time; an admitted actor without such a row changes only the revision root. | **Implemented current fact with unresolved intended authority.** `RejectBillRevisionAsync`; `LoadVisibleBillAsync`; `ExpenseBillRevisionProposalService.IsBillParticipant` and `RejectProposal`; `ExpenseBillRevisionActionCapabilityPolicy.CanReject`; revision tests. Whether all four actor categories should remain authorized is `FIN-CHOICE-027`/`G-PRODUCT/G-MONEY`; no current mismatch is claimed. |
| `FIN-REV-006` | Draft revision — **Submit changes for review** | The same proposal creator—admitted at creation as a current bill creator, owner, participant, or payer—moves `draft_revision → submitted_for_review`; exact snapshots, hashes, affected users, approvals, and payer-confirmation basis become the review basis. | **Implemented current fact.** submit endpoint/proposal service and revision tests. One active pending official revision is enforced by current service rules. |
| `FIN-REV-007` | Draft or submitted active-pending revision — **Revise and resubmit** | Proposer creates a successor from `draft_revision|submitted_for_review`; predecessor becomes `superseded_by_resubmission`, approval evidence is invalidated, and stable supersession links remain. | **Implemented current fact.** `ExpenseBillRevisionProposalService.ReviseAndResubmit` accepts `ExpenseBillRevisionStatuses.IsActivePending`; endpoint/tests. The predecessor is not restored. |
| `FIN-REV-008` | Pending revision — proposed **Cancel proposal** | `cancelled_by_authorized_editor` exists only as a supported status. No endpoint/domain transition, accepted actor, precondition, or re-entry rule implements it. | **Schema/status possibility; runtime unimplemented.** `ExpenseBillRevisionStatuses`; action availability is `FIN-CHOICE-028` and actor authority is `FIN-CHOICE-034`; `G-PRODUCT/G-MONEY`. It must remain unavailable until separately decided. |
| `FIN-REV-009` | Required revision payer confirmation — **Confirm payer change** | The exact revision payer whose row is `pending_confirmation` and requires confirmation submits the matching calculation hash, moving that row to `confirmed`; the submitted revision remains pending until its independent apply transition. | **Implemented current fact.** `ExpenseBillRevisionEndpoints.ConfirmBillRevisionPayerAsync`; `ExpenseBillRevisionProposalService.RecordPayerConfirmation`; payer-confirmation endpoint tests; `bill.revision_payer_confirmed` audit and notification writer. No retry/version token proves exact-result replay. |
| `FIN-REV-010` | Pending revision payer confirmation — proposed **Reject payer change** | No transition is accepted today. The `rejected` payer-confirmation status exists in domain/schema support, but availability, actor, evidence, revision-root effect, and correction/re-entry are separately unresolved. | **Status/schema possibility; runtime unimplemented.** `ExpenseBillPayerConfirmationStatuses.Rejected`; persistence constraint; apply tests may seed rejected state only as guard evidence. `FIN-CHOICE-015..019`; `G-PRODUCT/G-MONEY`. |
| `FIN-RECON-001` | Personal bill reconciliation — **Mark reconciled**, **Ignore**, or **Mark unreconciled** | The personal bill owner or creator may set any current reconciliation status to any supported target `unreconciled|reconciled|ignored`, including same-state writes, only while the bill is unarchived and visible. | **Implemented current fact.** `ExpenseBillReconciliationEndpoints.UpdatePersonalBillReconciliationAsync`; reporting endpoint tests. Update persists actor/times/note and writes bounded audit; no version/idempotency key. |
| `FIN-RECON-002` | Group bill reconciliation — **Mark reconciled**, **Ignore**, or **Mark unreconciled** | Any actor currently authorized for the group may set any current reconciliation status to any supported target, including same-state writes, only while group/bill/creator dependencies remain visible and the bill is unarchived. | **Implemented current fact with group-member authority.** `UpdateGroupBillReconciliationAsync`; reconciliation/reporting tests. Membership/historical-person policy remains #720; no version/idempotency key. |
| `FIN-SET-001` | Settlement request root — **Request payment** | The current actor must be the server-derived debtor or creditor for the selected candidate/basket direction, pass current profile and any group visibility checks, and ask the API to derive eligible source facts and create a `requested` root. Concrete request-line selection and its dependent lifecycle are separately `FIN-LINE-001`. | **Implemented current fact.** `SettlementRequestCreateEndpoints` candidate actor check; `SettlementBasketCreateEndpoints` direction expansion; expansion service/tests. Retry identity is absent; stale selection is re-derived but concurrent duplicate behavior needs acceptance proof. |
| `FIN-SET-002` | Unpaid request — **Cancel request** | Requester may move an unpaid `requested` root and its lines/pending residuals to `cancelled`; it remains retained history. | **Implemented current fact.** `SettlementCancellationEndpoints.CanCancelSettlementRequest`; cancellation tests. No restore. |
| `FIN-SET-003` | Requested/partially-paid/marked-paid request — **Dispute settlement** | Either the debtor or creditor moves an eligible `requested|partially_paid|marked_paid → disputed`, with dependent lines/pending residuals moved to `disputed`; history remains. | **Implemented current fact.** `SettlementDisputeEndpoints.CanDisputeSettlementRequest`; `CanDisputeRequestStatus`; dispute tests including requested-root acceptance. Re-entry is separately blocked by `FIN-SET-005`. |
| `FIN-SET-004` | Settlement request archive dimension — proposed **Archive settlement history** | No transition is accepted today. Any future presentation-only archive must preserve all money meaning and cannot change payment progression. | **Schema field only; runtime unimplemented.** `SettlementRequest.ArchivedAtUtc`; read queries filter it; no mutation endpoint. `FIN-CHOICE-008/009`. |
| `FIN-SET-005` | Disputed/cancelled/confirmed settlement request — proposed **Reopen settlement** | No current transition is accepted. Any re-entry target and effect on lines, payments, allocations, residuals, and balances is unresolved. | **Unimplemented.** `FIN-CHOICE-007`; `G-PRODUCT/G-MONEY`. Current terminal/review history is retained. |
| `FIN-SET-006` | Archived settlement request — proposed **Restore settlement history** | No current transition is accepted. A future presentation restore may not reopen or recalculate the workflow and must name its target archive state independently. | **Unimplemented.** `FIN-CHOICE-008/009`; archive field/read filters are evidence only. |
| `FIN-LINE-001` | Settlement request line — not independently user-visible for lifecycle | Parent payment/request operation drives `open ↔ partially_cleared|cleared|waived` or terminal `disputed|cancelled`; source bill/revision and exact amount remain stable. | **Implemented dependent transitions.** `SettlementPaymentAllocationRuntime`; request creation/read tests. No independent restore/delete. |
| `FIN-PAY-001` | Payment claim — **Mark as paid** | Debtor creates `marked_paid` claim, allocations, and supported residual proposal; API validates amount/currency/current request. | **Implemented current fact.** `SettlementPaymentClaimEndpoints`, allocation/residual runtime, claim tests. No idempotency key; timeout/concurrency result can be uncertain. |
| `FIN-PAY-002` | Marked-paid claim — **Confirm payment** | The exact receiver moves `marked_paid → confirmed` only while the parent request is `partially_paid|marked_paid`, debtor/creditor/currency/amount invariants still match, and every residual is safely resolved to its policy-derived receiver-confirmed status; request/line coverage is then recomputed from retained allocations/residuals. | **Implemented current fact with explicit parent/residual guards.** `SettlementPaymentConfirmationEndpoints.CanConfirmPayment`; `SettlementResidualRuntime.CanConfirmPaymentWithResiduals`; claim/confirmation/residual tests. A pending, unsafe, or mismatched residual blocks confirmation; confirmed result is not ordinarily reversible. |
| `FIN-PAY-003` | Debtor’s marked-paid claim — **Cancel payment claim** | Debtor moves eligible claim `marked_paid → cancelled`; retained allocations stop contributing and request/lines recompute. | **Implemented current fact.** `SettlementCancellationEndpoints.CanCancelSettlementPayment`; tests. No restore. |
| `FIN-PAY-004` | Marked-paid claim — **Dispute payment** | Receiver moves eligible claim `marked_paid → disputed`, request/lines to disputed, and pending residuals to disputed. | **Implemented current fact.** `SettlementDisputeEndpoints`; tests. Reopen/rejection distinction is unresolved by `FIN-CHOICE-007`. |
| `FIN-ALLOC-001` | Payment allocation — not independently user-visible | Created with claim; remains immutable evidence. Active effect is determined by parent payment status and centralized projection/runtime policy. | **Implemented current fact.** `SettlementPaymentAllocation`; `SettlementPaymentAllocationRuntime`; balance projection tests. No edit/archive/delete endpoint. |
| `FIN-RES-001` | Payment residual proposal — **Propose handling** | Supported non-exact claim creates `pending_receiver_confirmation`; proposal is not final money truth. | **Implemented current fact.** residual policy service, payment claim endpoint/tests. |
| `FIN-RES-002` | Pending residual — **Confirm residual handling** | Receiver maps the exact pending residual to its policy-derived `confirmed|carried_forward|waived|credited` outcome. | **Implemented current fact.** `SettlementPaymentResidualConfirmationEndpoints`, `SettlementResidualRuntime`, policy tests. No restore or expiry. |
| `FIN-RES-003` | Pending residual — dependent **Cancel residual** | Accepted parent request/payment cancellation maps unresolved residual evidence to `cancelled`; there is no independent residual action or restore. | **Implemented dependent transition.** `SettlementCancellationEndpoints`, `SettlementResidualRuntime`, cancellation tests. |
| `FIN-RES-004` | Pending residual — dependent **Dispute residual** | Accepted parent request/payment dispute maps unresolved residual evidence to `disputed`; there is no independent residual action or restore. | **Implemented dependent transition.** `SettlementDisputeEndpoints`, `SettlementResidualRuntime`, dispute tests. |
| `FIN-REC-001` | Active/paused personal recurring template — **Pause schedule** | The personal template owner moves `active|paused → paused`; a same-state pause still updates time and stages another pause audit. Future forecast selection/generation stops without rewriting old bills. | **Implemented current fact.** `VisibleTemplates`; `ChangeTemplateStatusAsync`; pause endpoint/tests. This is not prior-result replay and has no concurrency key. Group authority is separately `FIN-REC-009`. |
| `FIN-REC-002` | Active/paused/archived personal recurring template — **Archive recurring bill** | The personal template owner moves `active|paused|archived → archived`, preserves the first archive timestamp, clears next occurrence, updates time, and stages another archive audit even for an already archived template. | **Implemented current fact.** `VisibleTemplates`; `ArchiveTemplateAsync`; endpoint tests. Same-state archive is not prior-result replay. Restore is separately `FIN-REC-006`; group authority is `FIN-REC-010`. |
| `FIN-REC-003` | Personal synthesized/persisted occurrence — **Generate draft bill** | The personal template owner normally creates a new persisted occurrence directly as `no row → draft_generated` from a synthesized forecast; if a persisted `forecasted` row already exists, generation instead performs `forecasted → draft_generated`. Both outcomes link one new draft bill, and sequential retry returns the existing linked bill. | **Implemented current fact with database uniqueness.** `VisibleTemplates`; `GenerateDraftAsync`; occurrence create/update branch; recurring tests/schema constraint. An unpersisted forecast is not prior lifecycle state. Uncertain commit response and concurrent loser behavior still need proof. Group authority is `FIN-REC-011`. |
| `FIN-REC-004` | Forecast occurrence — proposed **Skip occurrence** | No current transition is accepted. `skipped` is supported vocabulary and a generation blocker; availability, actor, schedule effect/metadata, and re-entry are separately unresolved. | **Status/schema only; runtime unimplemented.** `RecurringBillOccurrenceStatuses`; generation guard; `FIN-CHOICE-012/035..037`. |
| `FIN-REC-005` | Active/paused personal recurring template — **Resume schedule** | The personal template owner moves `paused|active → active` and recalculates the next occurrence from the current schedule without rewriting generated bills; an already active call still updates time and stages another resume audit. | **Implemented current fact.** `VisibleTemplates`; resume endpoint/schedule tests. Same-state resume is not prior-result replay; archived templates are rejected; no concurrency key. Group authority is `FIN-REC-012`. |
| `FIN-REC-006` | Archived recurring template — proposed **Restore recurring bill** | No current transition is accepted. Target `active` versus `paused` and schedule/dependency/policy revalidation are unresolved. | **Unimplemented.** resume/update reject archived; `FIN-CHOICE-033`; `G-PRODUCT/G-MONEY`. |
| `FIN-REC-007` | Forecast occurrence — proposed **Cancel occurrence** | No current transition is accepted. `cancelled` is supported vocabulary and a generation blocker; availability, actor, schedule effect/metadata, and re-entry are separately unresolved. | **Status/schema only; runtime unimplemented.** `RecurringBillOccurrenceStatuses`; generation guard; `FIN-CHOICE-038..041`. |
| `FIN-REC-008` | Skipped/cancelled occurrence — proposed **Reopen occurrence** | No current transition is accepted. Skip and cancel have separate unresolved target states and protections against duplicate or historically inconsistent generation. | **Unimplemented.** Skip re-entry is `FIN-CHOICE-037`; cancel re-entry is `FIN-CHOICE-041`; `G-PRODUCT/G-MONEY`. |
| `FIN-REC-009` | Active/paused group recurring template — **Pause schedule** | Any current active group member admitted by `VisibleTemplates` and `CanAccessGroupAsync` may move `active|paused → paused`; same-state pause updates time and stages another audit, and the handler adds no owner-only predicate. | **Implemented current fact with broad group-member authority.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; `ChangeTemplateStatusAsync`; pause endpoint/tests. Whether this remains intended authority is `FIN-CHOICE-011`. |
| `FIN-REC-010` | Active/paused/archived group recurring template — **Archive recurring bill** | Any current active group member admitted by the group visibility/authorization path may move `active|paused|archived → archived`; same-state archive preserves the first archive timestamp but updates time and stages another audit, and the handler adds no owner-only predicate. | **Implemented current fact with broad group-member authority.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; `ArchiveTemplateAsync`; tests. Restore remains `FIN-REC-006`; intended actor policy remains `FIN-CHOICE-011`. |
| `FIN-REC-011` | Group forecast occurrence — **Generate draft bill** | Any current active group member admitted by the group visibility/authorization path may generate the occurrence; current builder source records that acting member as both generated bill creator and bill owner, while the template keeps its distinct owner. | **Implemented current fact with database uniqueness and broad group-member authority; focused owner assertion missing.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; `GenerateDraftAsync`; `RecurringBillDraftBuilder.CreateDraftBill`; `GroupMemberGenerateDraftNotifiesTemplateOwnerWithSafeRecurringMetadataAndAuthorizedRoute` distinguishes notification recipient/template owner from actor but does not assert `BillOwnerUserProfileId`. Intended generated-bill ownership is separately unresolved by `FIN-CHOICE-014`; intended generation actor remains `FIN-CHOICE-011`. |
| `FIN-REC-012` | Active/paused group recurring template — **Resume schedule** | Any current active group member admitted by the group visibility/authorization path may move `paused|active → active` and recalculate next occurrence; same-state resume updates time and stages another audit, and the handler adds no owner-only predicate. | **Implemented current fact with broad group-member authority.** `VisibleTemplates`; `AuthorizeTemplateAccessAsync`; resume tests. Archived is rejected; intended actor policy remains `FIN-CHOICE-011`. |
| `FIN-REC-013` | Active/paused personal recurring template — **Update recurring bill** | The personal template owner may perform a same-state template update that replaces supplied merchant/description, schedule, or payload, recalculates next occurrence and forecast money, and leaves generated bills/history unchanged. | **Implemented current fact.** `RecurringBillEndpoints.UpdateTemplateAsync`; recurring endpoint tests; `recurring_bill.template_updated` audit. Archived templates are rejected; no version/idempotency key proves replay or concurrent-write safety. |
| `FIN-REC-014` | Active/paused group recurring template — **Update recurring bill** | Any current active group member admitted by visibility plus `CanAccessGroupAsync` may replace supplied merchant/description, schedule, or payload and recalculate next occurrence/forecast money; payload profiles must remain visible, and no owner-only predicate is added. | **Implemented current fact with broad group-member authority.** `UpdateTemplateAsync`; `VisibleTemplates`; recurring endpoint tests; `recurring_bill.template_updated` audit. Intended group update authority remains `FIN-CHOICE-011`; archived templates are rejected. |
| `FIN-REC-015` | New personal recurring template — **Create recurring bill** | The current profile actor creates an `active` personal template owned by that actor after schedule, payload, profile visibility, currency, and forecast-money validation; next occurrence and `recurring_bill.template_created` audit are persisted with the template. | **Implemented current fact.** `RecurringBillEndpoints.CreateTemplateAsync`; recurring personal creation tests. No idempotency key or natural uniqueness makes uncertain retry a proven prior-result replay. |
| `FIN-REC-016` | New group recurring template — **Create recurring bill** | A current active group member creates an `active` group template owned by that actor only after group authorization and payload profiles remain visible in the group; forecast money, next occurrence, and creation audit are persisted. | **Implemented current fact with group-member creation authority.** `CreateTemplateAsync`; `AuthorizeScopeAsync`; recurring group creation tests. Intended later group mutation/generation authority remains `FIN-CHOICE-011`; no idempotency key. |
| `FIN-DER-001` | Settlement balance projection — **View balances** | Read-only deterministic derivation from retained authoritative settlement records; no archive/restore mutation of a projection. | **Implemented current fact.** `SettlementBalanceProjectionEndpoints`, response and endpoint tests. Active read filters archived/disputed/cancelled roots as described in section 3. |
| `FIN-DER-002` | Monthly financial report — **View report** | Read-only derivation from authoritative bills and settlement records. Regeneration never changes source lifecycle. | **Implemented current fact, presentation gap.** `MonthlyReportEndpoints`; tests. Current monthly reads exclude archived bills; `FIN-CHOICE-009`. |
| `FIN-DER-003` | Recurring forecast — **View forecast** | Schedule output is derived and an unmaterialized forecast is not an occurrence lifecycle owner; however, the current read may persist a deduplicated self-notification for each eligible due-soon forecasted occurrence. Explicit bill generation is separately `FIN-REC-003`. | **Implemented derived read with cross-domain write side effect.** `RecurringBillEndpoints.ListForecastAsync`; `WriteDueSoonNotificationsAsync`; recurring notification tests. It never changes a template, occurrence, or bill, but duplicate check/write is not an atomic idempotency guarantee and notification-save failure fails the forecast request. Notification lifecycle remains its existing owner. |
| `FIN-PROOF-001` | Payment-claim proof attachment relationship — **Attach proof** | An authorized debtor uploads proof for an eligible active payment/request; after the file object becomes active, the endpoint creates the stable payment/file relationship. The payment claim, allocation, and settlement history are unchanged. | **Implemented current link behavior with partial atomicity.** `SettlementPaymentProofEndpoints.AttachSettlementPaymentProofAsync`; proof endpoint tests; #719 `FILE-LC-LINK-006`. Authorization/status are observed before upload and not reloaded at link acceptance; audit/notification staging and response reload create pre-save/committed-without-response retry gaps. File metadata/bytes remain #719 authority. |
| `FIN-PROOF-002` | Active payment-claim proof relationship — **View proof** | An authorized debtor or creditor with current payment/request visibility may list active proof metadata and download active proof content. This is a read, not a lifecycle transition or evidence that the payment was accepted. | **Implemented current read surface.** `ListSettlementPaymentProofsAsync`, `GetSettlementPaymentProofContentAsync`, and proof endpoint tests. Both reads require an active link/object and current visible payment/request states; content read writes bounded `settlement.proof_read` audit, while metadata list does not. Byte access, object state, and read-lifecycle gaps remain #719 authority. |
| `FIN-PROOF-003` | Active payment-claim proof relationship — **Remove proof** | The authorized proof creator/debtor, while the payment/request remains mutable, sets the link `RemovedAtUtc` and asks the file lifecycle service to move the linked object `active → deleted`; it does not rewrite the payment claim, allocation, or settlement history. | **Implemented current coupled link/object behavior with cross-domain safety gaps.** `RemoveSettlementPaymentProofAsync`; proof endpoint tests; #719 `FILE-LC-LINK-007`. The current call couples financial unlink and object logical deletion in one context but does not prove reference-safe final-copy disposition; a shared object reference can be made unreadable. Link retention, file metadata/bytes, restore, and disposal remain #719 authority. No financial-record or physical-byte deletion is authorized by this row. |
| `LOCAL-BILL-001` | Local-only bill root — **Archive** only after a local domain exists | A proven local store would own a local archive transition; later server acceptance is a separate sync/import request with full revalidation and conflict handling. | **Unimplemented.** Current mobile queue models a server archive request, not a locally authoritative bill transition. `FIN-CHOICE-013`. |
| `LOCAL-BILL-002` | Local-only archived bill root — **Restore** only after a local domain exists | A proven local store would own local restore to a named local state; it cannot restore or overwrite the server record by implication. | **Unimplemented.** Current mobile queue models a server restore request, not locally authoritative re-entry. `FIN-CHOICE-013`. |
| `LOCAL-RECON-001` | Local-only bill reconciliation state | No local mutation may establish or overwrite server `unreconciled|reconciled|ignored` truth. A future local store would require its own state/version, audit, conflict, and later server-acceptance contract rather than inheriting `FIN-RECON-001/002` authority. | **Unimplemented.** Current source proves server reconciliation authority only; no locally authoritative reconciliation store or sync acceptance exists. `FIN-CHOICE-013`. |
| `LOCAL-REV-001` | Local-only bill revision root | Local proposal/review/apply authority and later server conflict handling are blocked; no local acceptance may rewrite a server bill. | **Unimplemented.** No source proves a locally authoritative revision workflow. `FIN-CHOICE-013`. |
| `LOCAL-ITEM-001` | Local-only bill item | Local item lifecycle, calculation-version identity, disposition, and server acceptance are blocked; no item is disposable by assumption. | **Unimplemented.** No source proves this local financial family. `FIN-CHOICE-013`. |
| `LOCAL-SPLIT-001` | Local-only bill item split / assignment | A local split cannot become accepted server calculation input without conflict-safe server revalidation. | **Unimplemented.** No local split authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-PART-001` | Local-only bill participant/share relationship | Local participant/share state cannot establish server participation, acknowledgement, or historical identity by implication. | **Unimplemented.** No local participant authority is proven; #720 remains the cross-domain dependency. `FIN-CHOICE-013`. |
| `LOCAL-PAYER-001` | Local-only bill payer/contribution relationship | Local payer state cannot establish or rewrite accepted server contribution history. | **Unimplemented.** No local payer authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-ADJ-001` | Local-only bill adjustment/allocation | Local adjustment state cannot change an accepted total, split, payer contribution, or server calculation result. | **Unimplemented.** No local adjustment authority is proven. `FIN-CHOICE-013`. |
| `LOCAL-FX-001` | Local-only bill FX snapshot | A local rate/display conversion cannot become the accepted immutable bill-level FX snapshot without new conflict-safe server validation, explicit calculation/policy identity, and server acceptance. | **Unimplemented.** No local FX-snapshot authority or sync contract is proven. `FIN-CHOICE-013`; the server accepted requirement is `FIN-FX-001`. |
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
| `FIN-BILL-003..018` | Creation rows establish a new draft plus calculated dependents under their exact personal, group, future, import, or recurring authority; they do not restore an old root. Submit/accept/reject changes future selection and settlement eligibility; future-draft update changes only mutable merchant/due date, while cancellation removes the retained cancelled bill from ordinary future lists. Finalized and status-archived entry remain unavailable. | Creation and import/generation are new accepted roots, not restore or replay. Draft future-bill update is a new audited same-state write. Submit, participant decisions, and cancel are not restore; no cancel re-entry exists. Finalized/status-archived are unreachable. Correction/re-entry uses an explicit revision/new root chosen by policy, never status overwrite. | Creation input/payload visibility; calculation and payer-confirmation basis; import session/replay; occurrence/template identity; revisions; settlement candidates; membership/history; sync; audit/notifications; policy/hash. Missing creation idempotency/version, import/occurrence concurrent retry proof, general cancel/finalize/status-archive/reopen, and rejected/cancelled recovery policy. |
| `FIN-COMP-001..009` | Draft removal or OCR apply may change future calculation inputs. Accepted source meaning must remain readable through authorized OCR review/source markers and revision snapshots/component evidence; current active participant/payer rows are not immutable history. Active payer creation may start pending, but no later acceptance transition exists. | OCR apply is a guarded draft recalculation, not restore or replay; same-review prior OCR items are soft-replaced and source markers must remain explainable. Draft item restore is unresolved. Confirmed component change uses a new revision. Active payer confirm/reject is unavailable. | Root/draft state; reviewed OCR ID/version and receipt link #719; no settlement state; payer/participant shape; active payer actor/status; revision snapshot/approval coverage; calculation hash/version; reports/exports/import; audit/copies. Missing OCR idempotency/concurrency, active-payer transitions, item tombstone actor/reason/version, snapshot coverage, active-row disposition audit, and full graph. |
| `FIN-FX-001` | An accepted converted bill must expose its retained bill-level FX snapshot to authorized history/report/revision explanation; later global/provider/manual rates cannot mutate it. No current runtime selection or read exists because the family is unimplemented. | No in-place rate “restore,” refresh, or recalculation. Before acceptance a draft may be replaced under future reviewed rules; after acceptance correction requires a reviewed revision/successor that retains both old and new snapshots. | Original/converted amount and currency; rate direction/precision/source/as-of/override; calculation and rounding policy versions; bill/revision identity; participants/payers/splits; settlement lines; reports/exports/import/sync; audit and authorization. Missing schema/API/UI, snapshot versioning, conversion formula authority, and deterministic history tests. |
| `FIN-PART-001..005` | These supported participant settlement-status values have no current writer and therefore cannot establish payment, waiver, settlement, or balance truth. | No re-entry or projection mapping is accepted. Retained settlement records remain authoritative; do not backfill or clear participant state by inference. | Exact request/line/payment/allocation/residual source, policy/as-of version, participant identity #720, concurrency, audit, report/export/sync. Missing mapping-versus-deprecation decision and golden consistency tests. |
| `FIN-REV-001..010` | Pending rows remain reviewable to authorized actors; payer confirmation changes only its dependent payer row and does not itself apply the revision. Terminal revisions/approvals remain historical and cannot become the active revision except through the exact apply transition. | Withdrawn, superseded, rejected, cancelled, and applied revisions are not restored. Confirmed payer evidence is not independently reversed. Payer rejection is unavailable. A new correction is a new revision. Apply is conditional and irreversible as an accepted event; later correction is another revision. | Active revision identity; snapshot schema/money/rounding policy; affected users; approval/hash; exact payer and payer-confirmation requirement/status; source bill state; settlement state; participant/member authorization; files/OCR #719; notifications/audit; sync/import/copies. Missing future accepted-revision settlement impact, cancellation policy, and payer-rejection authority/effect. |
| `FIN-RECON-001/002` | Reconciliation is a separate presentation/reporting dimension; every supported target, including same-state, rewrites updater/time and optionally note, while `reconciled` alone sets `ReconciledAtUtc`. It must not change bill/settlement money. | Any supported target may follow any supported current status through a new accepted update; this is a new audited write, not restore or idempotent replay. Archived bills are ineligible. | Current personal owner/creator or current group authorization; unarchived bill/visible dependencies; reports/search/export; note redaction; audit; sync/copies. Missing version/idempotency and concurrent-write acceptance proof. |
| `FIN-SET-001..006`, `FIN-LINE-001` | Cancelled/disputed requests leave ordinary active balance but remain history. Archive, if later approved, may affect presentation only and must not change line/payment effects. | Cancel and dispute are retained terminal/review states, not restore. Reopen is blocked pending `FIN-CHOICE-007`. Archive/restore cannot reopen payment progression. | Source bill/revision; exact lines/candidate keys; actors/membership #720; all payments/allocations/residuals/proofs #719; reports/balances; audit/notifications; sync/import/copies. Missing archive actor/reason, reopen policy, complete concurrency/idempotency. |
| `FIN-PAY-001..004`, `FIN-ALLOC-001`, `FIN-RES-001..004`, `FIN-PROOF-001..003` | Parent status determines active balance effect; allocation/residual/proof-link evidence remains readable in authorized history as retention policy requires. Cancel/dispute never deletes allocation evidence. Current proof removal makes the link inactive and the linked object logically deleted, so present readability can be lost even though the relationship remains; file-link/byte lifecycle remains #719-dependent. | Marked-paid may reach confirm, cancel, or dispute only through current policy. Confirmed/cancelled/disputed claims, allocations, resolved residuals, and required proof-link history are not restored or edited. Proof read has no re-entry meaning. Removed-proof restore/reattach is unimplemented and conditional on #719 `FILE-LC-LINK-008`; a correction/reversal requires a separately approved future record/transition, not history rewrite. | Request/line current coverage; counterparty authorization; source bill/revision; currency/policy; residual state; proof link/object references and shared-reference safety #719; membership #720; notifications/audit; report/balance; sync/import/copies. Missing refund/reversal/reopen policy is Day 2/out of scope. |
| `FIN-REC-001..016` | Creation establishes a new active template under exact personal/group authority; paused/archived templates then stop future forecast selection/generation while generated bills and historical occurrences remain. Personal mutations require the owner; current group mutations admit any active group member. Update changes only active/paused template inputs and never generated bills. | Template creation/update is a new audited write, not restore or proven replay. Pause is reversible only through distinct resume. Archive restore target and revalidation are unresolved. Generation may create a `draft_generated` occurrence without a prior persisted forecast row; the linked bill is independent. Skip/cancel availability, actors, and re-entry remain separately unresolved. | Current owner or active group membership #720; payload visibility; forecast calculation; schedule/policy version; occurrence uniqueness and no-row/create versus persisted-row/update path; generated bill/revisions/settlements; notifications; audit; sync/import/copies. Missing creation idempotency, intended group actor policy, focused ownership assertion, archive restore and skip/cancel/reopen APIs, version guards, and local authority. |
| `FIN-DER-001..003` | Projection/report/forecast outputs have no independent source-retention authority; cached outputs may be discarded and rebuilt only where no snapshot/export duty exists. Archived-source inclusion/exclusion must be explicit. Current forecast read can separately create due-soon notification rows, which are cross-domain side effects and never forecast authority. | Recompute, not restore. A persisted historical output is a separate record family requiring its own policy. Repeated forecast reads must use notification-domain duplicate/idempotency policy; notification re-entry/disposition does not alter the forecast. | Every source family above, query policy/version/as-of identity, authorization, archive filters, missing/unsafe input handling, exports/backups/copies; notification duplicate/read-race, retry, retention, and audit owner. Missing historical archived-report presentation and atomic notification idempotency proof. |
| `LOCAL-*` | Local presentation must say local/pending/stale and cannot imply server acceptance. | Local re-entry is bounded to local state; upload/sync/import is new server acceptance, never silent restoration. | Local store/encryption/backup, device identity, sync operation/idempotency/conflict, server authority, all cross-domain dependencies. Current evidence is absent; implementation blocked. |

### 5.3 Metadata, retry, retention, disposal, and audit profiles

| Exact row(s) | Metadata and retry/concurrency profile | Retention / hard-delete / purge | Audit and redaction additions |
| --- | --- | --- | --- |
| `FIN-BILL-001/002` | `ArchivedAtUtc` and `UpdatedAtUtc` exist; actor/reason/version/idempotency are absent from root. Sequential duplicate returns current result; concurrency is last-save/guard-query behavior, not proven serialization. | Confirmed/history-bearing bill: retained, hard delete ineligible. Positively dependency-free draft: unresolved. Purge unresolved/separate. | Current `bill.archived/restored` success audit; future denial/block/conflict and dependency-version evidence. Do not copy items, notes, payment details, OCR/file data. |
| `FIN-BILL-003..018`, `FIN-COMP-*`, `FIN-PART-*` | Creation/import/generation, status/ack/payer, and OCR source timestamps exist, but no bill/component idempotency key or concurrency token. Future-bill update rewrites merchant/due date; cancellation sets status/archive together; OCR apply transactionally soft-replaces same-review items and recalculates draft money; revision apply mutates participants and can remove/replace payers. Future acceptance must bind calculation/source/policy identity and expected version. | Accepted bill meaning is retained through the root plus import/occurrence/OCR source evidence and complete revision snapshots/components. Retention of every former active component row is not implemented. Draft, active-payer, participant-settlement, and active-row disposition classifications remain unresolved. | Current create/import/generate/workflow/future/OCR/revision successes are audited by their owners, but uncertain retries and payer-row removal lack complete lifecycle outcomes. Future create/edit/remove/apply/cancel/finalize/status-archive/payer/participant attempts require inventory, history proof, denial/conflict outcomes, and redacted audit. |
| `FIN-FX-001` | Required snapshot metadata is not persisted today. Future acceptance needs one immutable snapshot/version identity atomically bound to bill/revision calculation acceptance and an idempotent/concurrency-safe correction command. | Accepted snapshots are `FINANCIAL_HISTORY_RETAINED`, hard-delete ineligible, and purge unresolved; draft disposition follows positive dependency proof only. | Audit bounded original/converted currencies, rate direction/source category, as-of/policy version, actor and snapshot ID; redact provider credentials and unrelated money. Never log a formula result without its accepted snapshot identity. |
| `FIN-REV-*` | Rich timestamps, supersession links, request/correlation fields and calculation/policy hashes exist; current retry/concurrent exact-result behavior remains partial. | Every submitted/terminal/applied revision, snapshot, approval, and payer-confirmation basis/outcome is retained financial history; draft disposal unresolved. | Current revision and payer-confirmation audit/notifications exist. Never log snapshot JSON, raw notes/OCR, affected-user private detail, or file IDs beyond approved bounded references. |
| `FIN-RECON-*` | Status, updated actor/time, conditional reconciled time, and bounded note exist; no version/idempotency key. Every accepted call, including same-state, writes/audits again. | Reconciliation evidence is retained with bill history; it has no independent hard-delete. Purge follows the bill and audit retention policy. | Current `bill.reconciliation_updated` audit is bounded and excludes note content. Future denial/conflict/replay audit and concurrent-write proof required. |
| `FIN-SET-*`, `FIN-LINE-001` | Status/timestamps exist; request/line version/idempotency key absent. Request creation retry can duplicate unless database/domain conflicts prevent it; exact prior-result replay is not implemented. | All created requests/lines retained; hard delete ineligible. Archive/purge unresolved. | Current create/cancel/dispute successes audited. Future conflict/replay/archive/restore blocked outcomes and exact source-basis version required. |
| `FIN-PAY-*`, `FIN-ALLOC-001`, `FIN-RES-*`, `FIN-PROOF-*` | Claim/payment/residual/link timestamps exist; allocations have creation time only. No idempotency/version token for money transitions. Future acceptance must atomically bind expected request/line coverage and return prior result on replay; file/link retry behavior stays #719-owned. | All claims, allocations, residuals and required financial proof-link outcomes retained; hard delete ineligible; purge unresolved. File-copy disposition stays #719. | Current claim/confirm/cancel/dispute/residual-confirm and proof-link successes are audited by their owners. Exclude full notes, proof bytes/metadata, payment instructions, and unrelated counterparties. |
| `FIN-REC-001/002/005/006/009/010/012..016` | Status, archive/create/update times exist; create records owner but version/idempotency remains absent. Creation, update, and same-state operations are not proven prior-result replay. | Template retained while generated bills/occurrences or audit depend on it. Draft-like unused template deletion unresolved; purge separate. | Current create/update/pause/resume/archive success audit. Future restore, group-actor-policy, block, replay, and conflict audit; no raw payload JSON or notes. |
| `FIN-REC-003/004/007/008/011` | Occurrence has status, generated IDs/actor/times and unique template/date constraint. No skip/cancel actor/reason/version. Sequential generation replay returns existing bill; concurrent/timeout proof incomplete. | Generated occurrence retained with bill; unmaterialized forecast is derived. Skip/cancel retention and disposition are unresolved. | Generation success audit exists. Future group-actor-policy, skip/cancel/reopen, and duplicate/conflict audit required. |
| `FIN-DER-*` | Require source/as-of/policy/query version for any persisted cache. Current reads create no authoritative projection row. Forecast read uses check-then-write notification deduplication without a database uniqueness/idempotency key; failure after attempted staging can fail the read. | `DERIVED_REBUILDABLE`; discardable only when positive proof says no authoritative snapshot/export duty. Source records remain retained. Notification retention/disposition is separate and cannot change the derived result. | Read audit only where approved; notification creation/retry/racing-read outcomes belong to notification owner. Never copy full source rows, notes, payment details, file data, or unrelated identities. |
| `LOCAL-*` | Entire metadata/idempotency/concurrency contract unresolved; local operation ID plus later server sync identity would be required. | `LOCAL_UNACCEPTED_UNRESOLVED`; device cache cleanup cannot delete accepted server history or authoritative local-only records by assumption. | Local audit/privacy/backup rules unresolved; never upload logs/material as acceptance evidence. |

### 5.4 Unresolved-choice references, implementation owner, gates, and acceptance

| Exact row(s) | Open choices | Implementation status | Focused future owner / canonical lane | Manual gates and focused acceptance evidence |
| --- | --- | --- | --- | --- |
| `FIN-BILL-001/002` | `FIN-CHOICE-001/009/010` | Partial | #722 split: money-settlement-payment runtime; schema-migrations and OpenAPI/generated-client only if required; UI via #723 | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`, and conditional `G-SCHEMA/G-CONTRACT`; dependency graph, stale auth/state, concurrent archive/restore, report/history tests. |
| `FIN-BILL-003..018` | `FIN-CHOICE-003/004/011/013/014/025/026/029/010` as applicable | Implemented/partial/unimplemented by row | Existing bill, import, recurring, and revision owners, then #722/#724 split | `G-MONEY/G-PRODUCT/G-RET/G-PRIV/G-DEST`, conditional `G-CONTRACT/G-CLIENT/G-SCHEMA/G-SYNC`; per-path creation authority, payload visibility, calculation/payer basis, retry/duplicate behavior, import/occurrence identity, transition/history, cancelled re-entry, finalized/status-archive distinction, retention, copy-disposition, and dependency tests. |
| `FIN-COMP-001..009` | `FIN-CHOICE-002/005/020..023/030..032/010` | Partial/unimplemented by row | #722 money runtime plus OCR/file owner #719 and schema if tombstone/version fields; #724 retention | `G-MONEY/G-PRODUCT/G-RET/G-PRIV/G-DEST`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; OCR reviewed-source/version, no-settlement, transaction/retry, and calculation-history tests; active-payer availability/actor/basis/effect/correction; positive dependency; component inventory; removed-payer and snapshot coverage; redacted audit; deterministic rebuild. |
| `FIN-FX-001` | `FIN-CHOICE-010` (retention only; required snapshot semantics are already accepted) | Documented accepted requirement; runtime/schema unimplemented | Existing #352 after #961 synthesis, coordinated with #722 money/schema/API split, #723 Figma/UI, and #724 retention | `G-MONEY/G-SCHEMA/G-CONTRACT/G-CLIENT/G-RET/G-PRIV/G-DEST`; #352 manual money/Figma gates; exact snapshot/version linkage, decimal/rounding policy, immutable history, correction, authorization, audit, and golden recalculation-refusal tests. |
| `FIN-PART-001..005` | `FIN-CHOICE-024/010` | Status/schema only; runtime unimplemented | #961 synthesis then #722 money/schema/API split | `G-MONEY/G-PRODUCT/G-RET/G-PRIV`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; mapping-or-deprecation decision, golden projection/history tests, no formula duplication. |
| `FIN-REV-001..010` | `FIN-CHOICE-006/015..019/027/028/034/010` | Implemented/partial/unimplemented by row | Existing revision lane; #722/#724 follow-ups | `G-MONEY/G-PRODUCT/G-RET/G-PRIV/G-DEST`, conditional `G-CONTRACT/G-CLIENT/G-SCHEMA`; any changed rejection authority, new cancellation, payer-rejection, or settled-impact behavior remains pending; actor/concurrency/snapshot/hash/payer/history tests. |
| `FIN-RECON-001/002` | `FIN-CHOICE-010` | Implemented current fact | Existing reconciliation/reporting owner; retention via #724 | `G-RET/G-PRIV/G-DEST`, conditional `G-MONEY/G-PRODUCT/G-CONTRACT/G-CLIENT` only for changed semantics; personal/group authority, all-state, same-state audit, concurrency, report/search/export tests. |
| `FIN-SET-001..006`, `FIN-LINE-001` | `FIN-CHOICE-007/008/009/010` | Implemented/partial/unimplemented by row | #722 money runtime; #724 retention; #723 UI | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`, conditional `G-SCHEMA/G-CONTRACT`; exact line/source, cancellation/dispute/reopen/archive, concurrency, rebuild tests. |
| `FIN-PAY-001..004`, `FIN-ALLOC-001`, `FIN-RES-001..004`, `FIN-PROOF-001..003` | `FIN-CHOICE-007/010` | Implemented/partial | Existing settlement owners; #719 for file/link lifecycle; #722/#724 | `G-MONEY/G-PRODUCT/G-RET/G-PRIV/G-DEST`; rejection/reopen/reversal/refund choices remain pending and outside this task; hostile replay/atomicity/projection and proof-link dependency tests, including proof read auditing and shared-object removal safety. |
| `FIN-REC-001/002/005/006/009/010/012..016` | `FIN-CHOICE-011/033/010` | Implemented/unimplemented by row | #722 money runtime; #724 retention; #723 UI | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`, conditional `G-SCHEMA/G-CONTRACT`; personal/group creation authority and retry, intended group update/pause/resume/archive authority, archive-restore target, update concurrency, generated-history, and schedule/payload-policy tests. |
| `FIN-REC-003/004/007/008/011` | `FIN-CHOICE-011/012/014/035..041/010` | Implemented/unimplemented by row | Recurring owner through #722 split | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST`; intended group-generation actor and generated-bill owner plus atomic skip/cancel availability, actor, schedule effect, and re-entry choices remain pending; no-row creation versus persisted-row update, uniqueness/replay, and generated-bill independence tests. |
| `FIN-DER-001..003` | `FIN-CHOICE-009/010` | Implemented read/partial policy; forecast has notification write side effect | Report/balance/recurring owner after #961 synthesis; notification lifecycle owner for due-soon rows; UI separately | `G-MONEY/G-PRODUCT/G-RET/G-CLIENT/G-PRIV/G-DEST` for future accepted semantics/retention; conditional `G-CONTRACT`. Golden rebuild, archive presentation, inconsistent-source fail-closed, notification race/deduplication/retry/redaction tests. |
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
| `FIN-CHOICE-004` | Server rejected bill root and participant acknowledgements | May a rejected bill root be resubmitted, and if so which rejected/pending/accepted participant acknowledgements reset? Current submit code can reset eligible rows only from a draft root; no rejected-root transition or accepted reset rule exists. | Rejected roots remain rejected; do not reset acknowledgement history or infer draft re-entry. | Bill product/money owner via #722; blocks rejected-root re-entry/runtime/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-005` | Server bill-component tombstones, active-row mutation/disposition, and revision/history authority | Can a draft item tombstone be restored; when must removal use a revision; and what exact retained snapshot/revision evidence and audit make current participant overwrite and payer-row physical replacement/deletion historically sufficient? `DeletedAtUtc` lacks a lifecycle service/actor/reason/version, while revision apply mutates participants and can delete active payer rows without a separate lifecycle outcome. | Retain tombstoned items; do not infer restore/delete expansion; accepted changes use only current revision paths. Treat snapshot coverage or active-row disposal proof as incomplete until deterministic pre/post history rebuild and bounded audit prove it. | Bill runtime/schema owners via #722, retention via #724; `G-SCHEMA/G-MONEY/G-RET/G-PRIV/G-DEST` pending as applicable. |
| `FIN-CHOICE-006` | Server accepted revision and settlement/payment dependency authority | After settlement dependencies exist, should an accepted bill revision flag, reopen, adjust, or leave settlement records unchanged? Authoritative docs deliberately leave this explicit policy unresolved and current apply blocks. | Preserve current block; no silent settlement mutation. | Money-settlement owner after #961/#722; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-007` | Server settlement request, payment, line, allocation, and residual workflow | Is settlement/payment rejection distinct from dispute, and may a disputed/cancelled/confirmed workflow reopen? Current runtime has cancel/dispute/confirm but no reject/reopen transition. | Keep terminal/review state retained; no reopen or aliasing reject to cancel/dispute. | Settlement product/money owner via #722; `G-PRODUCT/G-MONEY` pending. Refund/reversal remains Day 2. |
| `FIN-CHOICE-008` | Server settlement-request archive dimension and financial-history presentation | What does settlement-request archive mean when `ArchivedAtUtc` exists but no mutation, audit, actor, or history UI policy exists? | Do not mutate it; archive may not change money effect or terminal state by implication. | #961/#722/#723/#724 split; `G-PRODUCT/G-MONEY/G-RET/G-CLIENT` pending as applicable. |
| `FIN-CHOICE-009` | Server derived monthly-report/balance reads and their source archive filters | Should archived bills/settlements appear in ordinary monthly reports and historical balance views, and under what explicit filter? Current monthly/balance queries exclude them, while requirements say history remains explainable. | Preserve current read behavior as current fact; require an explicit “archived records excluded/included” presentation before claiming complete historical reporting. Never change formulas here. | Report/product/money owner after #961; blocks report/UI acceptance; `G-PRODUCT/G-MONEY/G-CLIENT` pending if accepted semantics change. |
| `FIN-CHOICE-010` | Every server financial family, retained copies, exports, snapshots, backups, and replicas | What exact retention durations, triggers, holds, minimum tombstones, and backup/export/snapshot/replica disposition apply to each family? No current authority supplies complete values. | Retain authoritative financial history; no purge. | #724 plus record-family owner; `G-RET/G-PRIV/G-DEST` pending. |
| `FIN-CHOICE-011` | Server recurring-template group actor authority | Should any active group member remain authorized to update, pause, resume, archive, and generate from a group template, or which exact actions require the template owner/editor? Current source implements broad active-group-member authority for every named mutation, but requirements do not select the intended actor rule. | Preserve current broad group-member behavior only as implemented fact; do not expand it or call it intended policy. | Recurring product/money owner via #722/#723; blocks changed authorization/API/UI; `G-PRODUCT/G-MONEY/G-CLIENT` pending. |
| `FIN-CHOICE-012` | Server recurring occurrence skip availability | Should **Skip occurrence** be a Day 1 accepted action at all? `skipped` vocabulary and a generation guard do not establish a mutation. | Do not expose skip. | Recurring product/money owner via #722; blocks skip runtime/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-013` | Local-only financial records, local authority, and later server sync/import acceptance | What locally authoritative financial lifecycle, sync identity, conflict rule, and server acceptance contract exists for offline/local-only mode? Current mobile source does not prove one. | Treat local UI/queue state as pending presentation; never claim server acceptance or rewrite server history. | sync-import-export-restore, mobile, money, privacy, schema/contract owners after #961/#722; `G-SYNC/G-MONEY/G-PRIV/G-PRODUCT` and conditional `G-SCHEMA/G-CONTRACT/G-CLIENT` pending. |
| `FIN-CHOICE-014` | Server group recurring occurrence and generated bill ownership | When a group member generates an occurrence, should the generated bill be owned by the acting member as current builder source does, by the recurring-template owner, or by another explicitly authorized actor? Source proves only current actor-owned behavior; requirements do not select intended ownership, and the existing notification test does not directly assert bill ownership. | Preserve actor-owned generated bills only as implemented current fact; do not call it intended policy or change owner identity. | Recurring product/money owner via #722 after #961; blocks any ownership/API/schema/UI change; `G-PRODUCT/G-MONEY` and conditional `G-SCHEMA/G-CONTRACT/G-CLIENT` pending. |
| `FIN-CHOICE-015` | Server revision payer-confirmation action availability | Is revision-payer rejection a supported Day 1 user action, or must `rejected` remain persistence/guard vocabulary only? No endpoint or accepted requirement selects either answer. | Treat it as unavailable and preserve any stored value as history only. | Bill revision product/money owner via #722 after #961; blocks any rejection surface/runtime; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-016` | Server revision payer-confirmation rejection actor | If rejection is approved, is the exact named revision payer the sole accepting actor? Current confirmation uses that actor, but no authority defines rejection. | No actor is authorized to reject. | Bill revision product/money owner via #722; blocks authorization/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-017` | Server revision root effect of payer rejection | If an accepted payer rejection occurs, must it reject the revision root or leave the submitted root pending but ineligible to apply? Source and requirements do not decide this single root-effect question. | Do not mutate either payer or revision root; current apply remains blocked unless every payer is confirmed. | Bill revision product/money owner via #722; blocks state/runtime/schema/contract work; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-018` | Server revision payer-rejection correction path | If payer rejection is approved, is correction only a new revise/resubmit successor, or may rejected payer evidence reset in place? No re-entry rule exists. | No reset/re-entry; use only existing revision-root paths. | Bill revision product/money owner via #722; blocks correction/re-entry behavior; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-019` | Server revision payer-rejection immutable basis | If payer rejection is approved, what exact immutable basis must the action bind: revision ID, calculation hash, payer identity, and bounded reason/evidence contract? Current authority defines confirmation binding only. | No rejection request is accepted; never infer a basis from confirmation alone. | Bill revision/API/audit owners via #722; blocks API/audit/UI acceptance; `G-MONEY/G-PRODUCT` and conditional `G-CONTRACT/G-CLIENT/G-PRIV` pending. |
| `FIN-CHOICE-020` | Active bill payer confirmation availability | Should an active payer row created `pending_confirmation` be confirmable after creation? Current source initializes the state but implements no transition. | Keep pending; no confirmation action. | Bill product/money owner via #722 after #961; blocks runtime/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-021` | Active bill payer confirmation actor | If active-payer confirmation is approved, must the exact named payer be the sole accepting actor? No current authority answers this actor question. | No actor is authorized to confirm a pending active payer. | Bill product/money owner via #722; blocks authorization/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-022` | Active bill payer rejection availability | Should an active payer be able to reject payer facts created on their behalf? Supported persistence does not establish a Day 1 action. | No rejection action; retain pending state/history. | Bill product/money owner via #722; blocks runtime/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-023` | Active payer status effect on bill and settlement eligibility | Are active payer `pending_confirmation`/`rejected` states gating for bill confirmation and settlement selection, or informational only? Current participant workflow can confirm the bill without resolving them. | Preserve current runtime fact without claiming payer acceptance; do not add a new gate or treat pending/rejected as accepted. | Bill/settlement product-money owner via #722 after #961; blocks changed confirmation/selection semantics; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-024` | Participant settlement-status field authority | Are `partially_settled`, `settled`, `waived`, `claimed_paid`, `confirmed_paid`, and `SettledAtUtc` deprecated/inert fields, or an exact derived projection of authoritative settlement records? Current runtime never writes them. | Treat them as inert and non-authoritative; do not backfill, clear, or use them for balances/settlement eligibility. | #961 synthesis then bill/settlement owner via #722; blocks schema cleanup or projection runtime; `G-PRODUCT/G-MONEY` and conditional `G-SCHEMA/G-CONTRACT/G-CLIENT` pending. |
| `FIN-CHOICE-025` | Bill finalized status activation | Is `finalized` an active Day 1 root transition, or must it remain unsupported/inert vocabulary? Source supports the value but no authority or transition. | Do not finalize or infer finality from downstream records. | Bill product/money owner via #722 after #961; blocks finalize runtime/API/schema/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-026` | Bill status-archived activation | Is root status `archived` an active transition distinct from `ArchivedAtUtc`, or must it remain unsupported/inert vocabulary? Current runtime uses only the overlay. | Do not set status `archived`; preserve the implemented overlay distinction. | Bill product/money owner via #722 after #961; blocks status-archive runtime/API/schema/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-027` | Server revision rejection intended actor authority | Should the current creator/owner/participant/payer rejection predicate remain intended Day 1 authority, or should rejection be narrowed to a separately approved role? Source proves the broad current acceptance but requirements do not select its intended future form. | Preserve the broad predicate only as implemented fact; do not expand or narrow it without a focused decision. | Bill revision product/money owner via #722; blocks authorization/API/UI semantic change; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-028` | Server revision cancellation action availability | Should `cancelled_by_authorized_editor` become a Day 1 transition, or remain unsupported status vocabulary? The supported status has no endpoint, accepted precondition, or requirement. | Cancellation remains unavailable. | Bill revision product/money owner via #722; blocks cancellation runtime/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-029` | Cancelled future-bill recovery | May a cancelled future bill be restored, corrected in place, or reposted as a new draft/root, and what exact target preserves cancellation history? Current cancellation is one-way and requirements do not select a recovery path. | Keep the cancelled root archived and retained; no restore, in-place correction, or repost implication. | Future-bill product/money owner via #722 after #961; blocks recovery runtime/API/schema/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-030` | Active bill payer rejection actor | If active-payer rejection is approved, is the exact named payer the sole accepting actor, or may another current bill relationship reject? No current authority answers this actor question. | No actor is authorized to reject an active payer row. | Bill product/money owner via #722; blocks authorization/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-031` | Active bill payer rejection correction and re-entry | If active-payer rejection is approved, must correction create a revision/new payer fact, or may rejected evidence be replaced/reset in place? No current re-entry rule preserves the prior outcome. | No reset/re-entry; retain the current row and use only existing bill/revision paths. | Bill product/money owner via #722; blocks correction/re-entry runtime/schema/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-032` | Active bill payer rejection immutable action basis | If active-payer rejection is approved, what immutable basis must it bind—bill/payer identity, accepted calculation or contribution hash/version, rejecting actor, and bounded reason/evidence? Current source defines no rejection command. | No rejection request is accepted and no basis may be inferred from revision-payer confirmation. | Bill/API/audit owners via #722; blocks API/audit/UI acceptance; `G-MONEY/G-PRODUCT` and conditional `G-CONTRACT/G-CLIENT/G-PRIV` pending. |
| `FIN-CHOICE-033` | Archived recurring-template restore target | If restore is approved, does an archived template re-enter `active` or `paused`, and what current schedule, membership, payload, generated-history, and policy-version checks are required? Current update/resume reject archived templates and no requirement selects a target. | Archived remains archived; generated bills and occurrences remain independent history. | Recurring product/money owner via #722/#723; blocks restore runtime/API/schema/UI; `G-PRODUCT/G-MONEY/G-CLIENT` pending. |
| `FIN-CHOICE-034` | Server revision cancellation actor | If revision cancellation is approved, which exact current bill/revision relationship may accept it? No source or requirement defines an authorized editor for this status. | No actor is authorized to cancel a revision. | Bill revision product/money owner via #722; blocks authorization/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-035` | Server recurring occurrence skip actor | If skip availability is approved, which exact template/group relationship may request and accept it? No source or requirement defines the actor. | No actor is authorized to skip. | Recurring product owner via #722/#723; blocks authorization/API/UI; `G-PRODUCT/G-MONEY/G-CLIENT` pending. |
| `FIN-CHOICE-036` | Server recurring occurrence skip schedule effect | If skip is accepted, does it mark only the named occurrence or also advance/change template schedule state? Current vocabulary does not define that one effect. | Do not mutate the occurrence or template schedule. | Recurring product/money owner via #722; blocks calculation/schedule/runtime acceptance; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-037` | Server skipped-occurrence re-entry | May a retained `skipped` occurrence re-enter generation eligibility, and to which exact state without duplicating history? No restore/reopen rule exists. | Skipped remains a retained generation blocker. | Recurring product/money owner via #722/#723; blocks reopen/runtime/API/UI; `G-PRODUCT/G-MONEY/G-CLIENT` pending. |
| `FIN-CHOICE-038` | Server recurring occurrence cancellation availability | Should **Cancel occurrence** be a Day 1 accepted action at all? `cancelled` vocabulary and a generation guard do not establish a mutation. | Do not expose cancellation. | Recurring product/money owner via #722; blocks cancel runtime/API/UI; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-039` | Server recurring occurrence cancellation actor | If cancellation availability is approved, which exact template/group relationship may request and accept it? No source or requirement defines the actor. | No actor is authorized to cancel an occurrence. | Recurring product owner via #722/#723; blocks authorization/API/UI; `G-PRODUCT/G-MONEY/G-CLIENT` pending. |
| `FIN-CHOICE-040` | Server recurring occurrence cancellation schedule effect | If cancellation is accepted, does it mark only the named occurrence or also advance/change template schedule state? Current vocabulary does not define that one effect. | Do not mutate the occurrence or template schedule. | Recurring product/money owner via #722; blocks calculation/schedule/runtime acceptance; `G-PRODUCT/G-MONEY` pending. |
| `FIN-CHOICE-041` | Server cancelled-occurrence re-entry | May a retained `cancelled` occurrence re-enter generation eligibility, and to which exact state without duplicating history? No restore/reopen rule exists. | Cancelled remains a retained generation blocker. | Recurring product/money owner via #722/#723; blocks reopen/runtime/API/UI; `G-PRODUCT/G-MONEY/G-CLIENT` pending. |

An open choice that remains blocked as above does not block this documentation
task. Selecting any of these answers would be a separate product, money,
schema, contract, UI, privacy, sync, retention, or destructive gate.

## 7. Historical Explainability And Derived Outputs

The authoritative explanation chain is:

```text
bill root + retained creation provenance (direct, future, import, or occurrence)
  + reviewed OCR source/version markers when draft receipt review was applied
  + immutable bill-level FX snapshot when converted
  + accepted revision baseline/proposed snapshot and revision components
  → current items, splits, participants, payers, adjustments, reconciliation dimension
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
- Existing #352 remains the canonical focused owner for Day 1 manual bill-level
  FX snapshot implementation and its manual money/Figma gates. It must consume
  #961 synthesis and coordinate with #722/#723/#724 rather than being duplicated
  or treated as implemented by this policy.
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
| `docs/prd/MVP_DAY1_SCOPE.md` | Money handling; Expenses and bills; Settlement workflow; Soft delete and archive | Bill-level manual FX snapshot as accepted financial truth, archive/restore intent, retained history, draft-only conditional hard-delete concept, no ordinary financial deletion |
| `docs/architecture/DAY1_MANUAL_FX_SNAPSHOT_MONEY_POLICY.md`; #352 | Day 1 Scope; Snapshot Model; Money Authority And Rounding; Review And Affected-User Policy | Canonical manual snapshot fields/direction, immutable accepted truth, affected-user review, no provider refresh/recalculation, open focused implementation and manual money/Figma gates |
| `docs/architecture/EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md` | Bill Lifecycle And Statuses; Settlement Workflow; Audit Rules | Intended states and distinct bill/participant/settlement concepts |
| `docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md` | Status Transitions; Balance Projection; Validation Expectations | Explicit settlement transition and rebuild requirements |
| `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md` | Core Principles; Suggested Data Model; Balance Projection Rules | Concrete lines, allocations/residuals, deterministic explainability |
| `docs/architecture/BILL_REVISION_APPROVAL_POLICY.md` | State model and approval rules | Revision/approval distinction and no approval carry-forward |
| `docs/architecture/BILL_REVISION_SNAPSHOT_ARCHITECTURE.md` | Snapshot and policy-version contract | Retained baseline/proposed evidence and calculation policy identity |
| `ExpenseBill`, `ExpenseBillStatuses`, `ExpenseBillLifecycleService` | domain and lifecycle source | Separate status/archive dimensions and implemented archive/restore guard |
| `ExpenseBillWorkflowEndpoints` | `SubmitBillAsync`, `AcceptBillParticipantAsync`, `RejectBillParticipantAsync` | Implemented bill/participant transitions |
| `PersonalBillEndpoints`, `GroupBillEndpoints` and tests | `CreatePersonalBillAsync`; `CreateGroupBillAsync`; create endpoint tests | Distinct personal/group draft-root creation, actor/ownership, component calculation, membership/payload, payer basis, and audit |
| `FutureBillEndpoints`, `FutureBillEndpointTests` | `CreateFutureBillAsync`; `UpdateFutureBillAsync`; `CancelFutureBillAsync`; future-bill endpoint tests | Implemented personal/group future-draft creation, creator/owner update, cancellation, archive timestamp, ordinary-list exclusion, and audit |
| `BillCsvImportEndpoints`, `BillCsvImportEndpointTests` | personal/group immediate and review-session import paths; plan/create/confirm methods | Distinct imported-draft authority, visibility, calculation, session/replay dependency, and handoff to bill lifecycle |
| `ReceiptOcrReviewEndpoints` and tests | `ApplyReceiptOcrReviewAsync`; draft apply guards and transaction | Reviewed-source/version, no-settlement, creator/owner, soft-replace, recalculation, audit, and retry behavior for draft OCR apply |
| `ExpenseBillPayerConfirmationPolicy`, participant status source | `ApplyCreatedBy`; `ExpenseBillParticipantStatuses`; `SettledAtUtc` | Active payer initialization and supported-but-unwritten participant settlement fields |
| expense domain entities | item/split/participant/payer/adjustment types | Persisted dependent financial facts and item deletion marker |
| revision domain/endpoints/policies | `ExpenseBillRevisionCreationCapabilityPolicy`; revision statuses, approvals, payer confirmation, proposal/apply services | Confirmed/rejected source-state and four-category proposal actors; implemented revision and dependent payer-confirmation lifecycle plus settlement apply block |
| `ExpenseBillReconciliationEndpoints` and tests | personal/group update handlers; reconciliation reporting tests | Implemented actor split, all-target/same-state writes, metadata, audit, and downstream search/report/export consumption |
| settlement domain entities | request/line/payment/allocation/residual status types | Exact current states and retained relationships |
| settlement endpoint/runtime source | direct/basket create, claim, `CanConfirmPayment`, `CanConfirmPaymentWithResiduals`, cancellation, dispute, allocation/residual runtime | Debtor-or-creditor request creators; current transition actors; exact parent/residual confirmation guards; derived coverage behavior |
| recurring domain/endpoints | template/occurrence status types; create/update/pause/resume/archive/generate/forecast methods; occurrence create/update branch; `WriteDueSoonNotificationsAsync` | Current personal/group template creation/update and status transitions, direct `draft_generated` occurrence creation versus persisted-forecast transition, one-way archive/generation behavior, and forecast-read notification side effect |
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
