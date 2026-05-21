# Mobile Bill Revision Proposal UX Gate

## Purpose

This document defines the mobile UX gate for creating, revising, previewing, submitting, and withdrawing bill revision proposals.

It is a design and implementation-planning artifact only. It does not authorize Flutter implementation, API runtime changes, OpenAPI edits, generated-client edits, migrations, notification behavior changes, offline sync work, settlement logic, component-library work, or Day 2/Day 3 expansion.

The goal is to keep the future create/revise flow safe and understandable before any full editor is built. Mobile should help the user shape a proposal, but server-mode financial truth, authorization, active bill state, affected-user state, payer confirmation, and final mutation remain API/domain-authoritative.

## Current Foundation

The current backend and generated Dart client expose bill revision proposal lifecycle APIs:

- `POST /api/v1/bills/{billId}/revisions` creates a draft revision proposal from a bounded candidate money snapshot.
- `PATCH /api/v1/bills/{billId}/revisions/{revisionId}` supersedes an active pending proposal and creates the replacement submitted proposal.
- `POST /api/v1/bills/{billId}/revisions/{revisionId}/submit` submits a draft revision.
- `POST /api/v1/bills/{billId}/revisions/{revisionId}/withdraw` withdraws an eligible proposal.
- Existing review actions cover approve, reject, payer confirmation, and apply.

The generated Dart client already includes `createBillRevision` and `reviseBillRevision`, but the handwritten mobile `SettleoraBillRevisionRepository` currently exposes review/lifecycle actions only. A future implementation branch must add a handwritten repository seam for create/revise instead of calling generated client code directly from widgets.

The current proposal request accepts only:

- `totalAmount`
- `totalCurrency`
- `participants[]` with `userProfileId`, `resolvedShareAmount`, and `resolvedShareCurrency`
- `payers[]` with `userProfileId`, `amount`, and `currency`

The current API does not accept item rows, item splits, adjustments, attachments, receipt/OCR fields, notes, free-text reasons, actor identity, group identity, settlement fields, audit metadata, auth/session fields, storage fields, proof fields, or internal database fields in the proposal body.

## Entry Points

### Personal Bill Detail

Personal bill detail is the primary entry point for starting a proposal from the current accepted bill.

The future detail screen should show a proposal action only when a refreshed server response or revision capability surface supports it. Until a dedicated bill-detail capability response exists, mobile must not infer create rights from bill status labels, route ownership, cached profile IDs, or hidden buttons.

If the create action is unavailable, show read-only state near the bill actions:

```text
Propose change unavailable
Refresh the bill or contact the bill owner if this looks wrong.
```

### Group Bill Detail

Group bill detail should use the same proposal flow while preserving group context in the header and return navigation.

The route group ID is navigation context only. The API must decide whether the actor still has active group/bill access. If group access is removed, deleted, inactive, or unrelated, mobile should show the same safe unavailable state used by existing bill/revision reads.

### Revision Review When `viewerActions.canRevise` Is True

The existing revision review screen should expose `Revise proposal` only when the fresh revision response has `viewerActions.canRevise == true`.

The entry opens the proposal editor seeded from the latest visible pending revision response. Because the current `PATCH` endpoint supersedes and creates the replacement submitted proposal, the revise flow must warn that prior approvals on the superseded proposal do not carry forward.

Suggested copy:

```text
Revise proposal
Your replacement will be submitted for review, and previous approvals on this proposal will not carry over.
```

### Notification Navigation

Bill revision notifications may route to bill revision review using typed `expenseBillId` and `expenseBillRevisionId`. Notification metadata must not authorize create/revise actions.

When the user opens a revision notification, mobile should:

1. Route to the revision review screen with bill and revision IDs only.
2. Refresh the revision through the authenticated repository.
3. Render `viewerActions` from the server response.
4. Offer `Revise proposal` only if the refreshed response allows it.

If the notification points to a withdrawn, superseded, applied, rejected, denied, or unavailable revision, show terminal/read-only state and offer a safe route back to bill detail when available.

## User Flows

### Create Proposal From Current Accepted Bill

1. User opens personal or group bill detail.
2. Mobile refreshes the bill and any active pending revision state.
3. If creation is allowed by the server-supported capability surface, user opens `Propose change`.
4. Editor seeds from the current accepted bill values available in the bill detail response.
5. User edits only supported aggregate money fields.
6. User opens preview/review.
7. Mobile submits `createBillRevision` only after preview confirmation.
8. Server returns a draft revision response.
9. Mobile routes to revision review for the returned revision and shows `Submit proposal` when `viewerActions.canSubmit` is true.

If an active pending revision already exists, creation should not open a competing editor. Route to the pending revision review instead and explain that Day 1 supports one active pending proposal per bill.

### Revise And Resubmit Owned Proposal

1. User opens an existing pending revision review.
2. Mobile refreshes the revision before enabling action.
3. If `viewerActions.canRevise` is true, user opens `Revise proposal`.
4. Editor seeds from the current pending revision response, not stale local form state.
5. User edits supported aggregate money fields.
6. Preview explains that the replacement supersedes the current proposal.
7. Mobile calls `reviseBillRevision`.
8. Server returns the replacement submitted revision.
9. Mobile routes to review for the returned revision ID.

The implementation must not keep the old revision ID selected after a successful revise/resubmit response.

### Save Draft

The current create endpoint creates a server-side draft revision. A future create flow may save a draft by calling `createBillRevision`, then keep the user on the returned draft revision.

Local-only draft UI may exist only as unsynced form state before server create. It must be clearly ephemeral:

```text
Unsaved proposal
This draft is only on this device until you save it to the server.
```

No offline queue for proposal drafts is approved by this gate.

### Submit Proposal

Submit must happen from the returned draft revision response, not from the editor's local calculation. Before submit:

1. Refresh the revision.
2. Check fresh `viewerActions.canSubmit`.
3. Call `submitBillRevision`.
4. Render the returned submitted revision and its server-generated review context.

Suggested submit copy:

```text
Submit proposal
People affected by this proposal will review the server-calculated result.
```

### Withdraw Proposal

Withdraw is available only from fresh server capabilities.

Suggested confirmation copy:

```text
Withdraw proposal?
The active bill will not change. Reviewers will no longer approve this proposal.
```

After a successful withdraw response, stay on revision review in terminal state and offer a route back to bill detail.

### Read-Only Fallback

If the server denies an action, the UI should refresh, keep the user on the safest visible screen, and explain the state without exposing internals.

Examples:

- `404`: `This bill or revision is no longer available.`
- `409`: `Refresh needed. This proposal may have changed or is blocked by current bill state.`
- `401`: `Sign in again before changing this proposal.`
- `400` or `422`: `This proposal includes unsupported fields or amounts. Review the highlighted fields.`

## Editor Structure

### Supported Fields

The first mobile editor should be a narrow aggregate proposal editor:

- bill total amount and currency
- participant shares for the existing participant set
- payer contribution rows for existing related payers

The editor may show bill merchant, date, items, adjustments, attachments, notes, group, and participant names as context, but those values must be read-only unless the API contract is expanded.

Participant and payer rows should be seeded from server-returned bill/revision data. Mobile may let the user edit amount strings, but the server validates totals, same-currency policy, participant set stability, payer relationship, active revision policy, and visibility.

### Out Of Scope Fields

Do not implement editable controls for:

- adding or removing participants
- adding or removing payers not already related to the bill
- merchant, date, category, tags, or notes
- item rows or item-level splits
- tax, service, discount, or adjustment detail rows
- receipt, OCR, attachment, proof, or storage fields
- settlement, residual, payment, or reconciliation fields
- free-text rejection/proposal reasons
- actor, owner, group, role, auth, session, or audit identity fields

If the user needs one of these changes, show a scoped unsupported message:

```text
Item-level changes are not supported by the current proposal contract.
You can propose total, participant share, and payer contribution changes.
```

### Totals, Participants, Shares, And Payers

The editor should make the current aggregate math obvious without making mobile the source of truth:

- Show total amount and currency at the top.
- Show participant share rows below the total.
- Show payer contribution rows separately from participant shares.
- Show a local "needs server validation" state for mismatches.
- Use tabular money display where the platform supports it.
- Keep payer confirmation implications visible when changing payer contribution rows.

Local sum checks are allowed as convenience validation only. Copy should say:

```text
Settleora will validate the final totals on the server.
```

### Item-Level Representation

Because the current proposal snapshot does not accept item details, the editor should show items as read-only context.

If the user changes aggregate totals in a way that likely came from an item correction, the preview should label the proposal as aggregate-only and warn that approvers will not see a server-backed item-row diff in this foundation.

## Preview And Review Before Submit

### Full Bill View

Preview should start with a full bill view when the user creates a proposal from a bill detail screen. It should show:

- current bill identity and status
- proposed total
- participant shares
- payer contributions
- unchanged read-only bill context
- unsupported detail categories

This is a proposal preview, not accepted financial truth.

### Changed-Only View

Changed-only preview can show local edited fields before create/revise, but it must be labeled as local preview until the server returns `reviewContext`.

After create/revise/submit, changed-only review must use only server-provided `reviewContext.changes` and `changeSummary`, following `BILL_REVISION_REVIEW_UX.md`.

### Highlighting For Approvers

Approver-facing highlights belong in the revision review response. The editor preview may use visual markers for local edits, but those markers must not be represented as authoritative server diff data.

Use labels such as `Changed`, `Increased`, `Decreased`, and `Requires confirmation`. Color may reinforce the state but cannot be the only signal.

### Safe Baseline Handling

Users who did not approve or reject the previous bill must not be defaulted into a changed-only-only experience. Once the server returns review context, mobile should honor:

- `no_prior_baseline`: full bill recommended
- `active_accepted_bill`: changed-only can be a starting point
- `previous_revision_approval`: changed-only can be a starting point
- `previous_revision_rejection`: changed-only can be a starting point

Do not fabricate passive view timestamps or baselines.

### Unsupported Or Partial Diff Data

Preview and review must disclose when detailed diffs are unsupported, especially for item, item split, adjustment, attachment, receipt/OCR, note, and metadata changes.

Suggested copy:

```text
Detailed item changes are not available in this revision snapshot.
Review the full proposed bill before approving.
```

## Server Authority And Security

Mobile must not compute financial truth.

Mobile must not decide authorization from:

- role strings
- cached user/profile IDs
- group route IDs
- notification metadata
- hidden buttons
- locally remembered capabilities
- local form validity

Mobile must use server-returned `viewerActions` for action availability and server mutation responses for post-action state.

Before every mutation, the future implementation should refresh the bill or revision, then call the mutation only if the fresh response supports the action. A button being enabled is not an authorization boundary.

Mobile must not fabricate proposal snapshots that conflict with API/domain calculation rules. The request body should be built only from supported form fields and visible server-returned participant/payer rows, then accepted or rejected by the API.

## Offline And Sync Behavior

Server-mode proposal edits require online access unless a future offline queue design explicitly approves this operation.

Allowed:

- unsynced local form state while the user remains in the editor
- local validation hints
- cached read-only bill/revision context clearly marked stale

Not allowed by this gate:

- queueing create/revise/submit/withdraw/apply operations offline
- silently changing the effective bill while offline
- treating local preview as accepted or submitted revision state
- merging offline proposal edits with newer server revisions without an approved conflict design

If the device goes offline during editing, keep the form and disable server actions:

```text
Server unavailable
Keep editing locally, or reconnect before saving this proposal.
```

## Navigation And State Behavior

### After Draft Create

Route to revision review for the returned draft revision. If `viewerActions.canSubmit` is true, show `Submit proposal`. If not, show read-only fallback with refresh.

### After Revise And Resubmit

Route to the returned replacement revision. Do not keep the superseded revision selected. Show that previous approvals do not carry over.

### After Submit

Stay on revision review and render the returned submitted revision, including server-generated review context.

### After Withdraw

Stay on revision review in terminal state, disable mutation actions, and offer return to bill detail.

### After Apply

Stay on revision review or return to bill detail only after showing the server-returned applied state. Refresh bill detail if returning.

### After Approval, Rejection, Or Payer Confirmation

Use the existing revision review pattern:

- refresh before mutation
- call the server mutation
- render the returned revision
- show a bounded success notice
- keep terminal or blocked states visible

### Conflict And Stale Capabilities

On `409`, refresh the revision and move focus to the conflict message. Do not retry automatically. The user must review the refreshed state before another mutation.

### Session Expiry

On `401`, keep unsaved local form state where possible, route to sign-in or show the existing session-required action, then require a fresh reload before mutation.

## Accessibility And UX Details

Button labels should describe the consequence:

- `Propose change`
- `Save draft proposal`
- `Review proposal`
- `Submit proposal`
- `Revise proposal`
- `Withdraw proposal`
- `Back to bill`

Destructive or terminal actions require confirmation copy close to the action. Withdraw should explicitly say the active bill will not change.

Disabled states should include visible reasons, not only inactive color.

Changed fields must use text labels or icons in addition to color. Screen readers should hear the field label, current value, proposed value, and change label.

Long bill and item lists should not make the user lose the submit decision area:

- keep a compact proposal summary near the top
- collapse read-only items by default when the list is long
- preserve the user's scroll position when toggling preview sections
- use stable row heights for money rows

Loading, empty, error, and unavailable states should follow existing mobile patterns:

- loading: `Loading proposal`
- empty: `No proposal changes yet`
- denied: `Proposal unavailable`
- stale: `Refresh needed`
- server unavailable: `Server unavailable`

## Implementation Readiness Checklist

Likely future implementation files:

- `apps/mobile/lib/bills/bill_revision_repository.dart`
- `apps/mobile/lib/bills/generated_bill_revision_repository.dart`
- `apps/mobile/lib/bills/bill_revision_review_screen.dart`
- `apps/mobile/lib/bills/bill_list_screen.dart`
- new `apps/mobile/lib/bills/bill_revision_proposal_screen.dart`
- related mobile shell/navigation files if deep-link routing changes
- `apps/mobile/test/bill_revision_review_screen_test.dart`
- new `apps/mobile/test/bill_revision_proposal_screen_test.dart`
- `apps/mobile/test/generated_bill_revision_repository_test.dart`
- `apps/mobile/test/notification_screen_test.dart` only if notification entry behavior changes

Required future tests:

- repository maps `createBillRevision` request/response through the generated client
- repository maps `reviseBillRevision` and returns the replacement revision ID
- create editor seeds from personal bill detail and submits only supported fields
- create editor works from group bill detail while preserving group context
- revise entry appears only from fresh `viewerActions.canRevise`
- revise/resubmit warns that old approvals do not carry over
- save draft flow routes to returned draft revision
- submit refreshes capabilities before mutation
- withdraw confirmation says active bill is unchanged
- offline/server-unavailable state preserves local form state but disables server mutations
- denied/conflict/session-expired states refresh or route safely
- changed markers are not color-only
- unsupported item/split/attachment/note diffs are disclosed
- notification entry does not authorize revise from metadata

Contract or schema blockers discovered:

- The handwritten mobile repository does not yet expose create/revise proposal methods.
- The current request body supports aggregate total, participant shares, and payer contributions only.
- The current proposal contract does not support item-level, adjustment, attachment, OCR, note, metadata, or free-text reason editing.
- There is no approved offline queue behavior for proposal create/revise/submit/withdraw/apply.
- There is no dedicated mobile capability response for opening proposal creation from bill detail; implementation must either add a safe server capability surface in a later contract branch or gate entry through an already-approved server response.

Open design decisions requiring manual approval before implementation:

- Whether Day 1 mobile proposal creation should allow direct aggregate share editing or use a guided correction form with fewer free numeric rows.
- Whether `createBillRevision` should create a server draft first, then open review, or whether the editor should collect all values before the first server save.
- Whether personal and group proposal creation should ship together or in separate implementation slices.
- Whether proposal creation needs a server capability field on bill detail before mobile exposes `Propose change`.
- Whether free-text proposer notes are needed, which would require contract, moderation, audit, and privacy review before UI work.
- Whether item-level corrections should wait for snapshot support or use a non-authoritative note-like placeholder in a later API design.
