# Bill Revision Review UX Gate

## Purpose

This document defines the mobile-first UX gate for bill revision review, highlighting, changed-only filtering, financial-impact summary, and approval or rejection actions.

It is a design and implementation-planning artifact only. It does not authorize Flutter, web, API, OpenAPI, generated-client, database, settlement, money, worker, cloud, subscription, or Day 2/Day 3 implementation work by itself.

The goal is to make pending bill revisions understandable before any approval-sensitive UI is built. Users must see what changed, what it means for them, what baseline the server used, and what action they are taking.

## Current Foundation

The current API and generated clients expose server-authoritative revision review context on bill revision responses. The relevant transport object is `reviewContext`, including:

- `viewerUserProfileId`
- `baseline`
- `defaultViewMode`
- `fullViewRecommendedReason`
- `viewerFinancialImpact`
- `changeSummary`
- `changes`
- `limitations`

The current mobile app has starter personal bill list/detail surfaces, starter read-only group bill list/detail surfaces, and server-mode shell navigation. It does not yet have a dedicated bill revision review UI.

There is no existing approved bill revision review UX spec that fully covers this flow. This document is the gate future UI branches should read before implementation.

## Authority Rules

Clients render server-provided `reviewContext`. They must not compute financial truth, affected-user state, payer-confirmation truth, authorization, or money impact from raw revision rows.

Clients may do presentation-only work:

- group and sort server-provided changes
- show icons, color, typography, and spacing
- map server-provided accessible labels to visible markers
- run local view filters over server-provided change data
- collapse or expand sections
- preserve the user's local view-mode toggle while the current revision response remains fresh

Clients must not:

- decide who is affected
- decide whether payer confirmation is required
- decide whether a user can approve, reject, apply, withdraw, or revise
- calculate accepted amounts or deltas for approval binding
- infer hidden item, split, attachment, OCR, note, or metadata diffs that the server marked unsupported
- carry approval from a superseded revision to a newer revision
- treat cached visibility, hidden controls, group membership rows, or route IDs as authorization

## User Journeys

### Creator Or Proposer

The proposer needs proof that the proposed revision is the version now under review. The review entry should show revision status, submitted or superseded state, affected-user summary, and whether the proposer still has available actions such as revise or withdraw in a future implementation slice.

If the proposer is also an affected participant or proposed payer, they see the same financial impact and payer-confirmation requirements as any other viewer. The proposer role does not reduce approval clarity.

### Affected Participant

An affected participant sees the pending revision banner from bill detail and opens review before approving or rejecting. The first view emphasizes:

- how their share changed
- the previous and proposed amounts when a safe baseline exists
- the delta amount and currency
- why they are being asked to review
- whether changed-only or full-bill review is the recommended starting mode

Approval copy must state that the user is approving this exact pending revision, amount, currency, and calculation state. Rejection copy must state that they are rejecting the proposed revision, not deleting the bill.

### Paid-By Or Payer Confirmation User

A user who is the proposed payer or whose payer contribution changes needs a separate, obvious payer-confirmation section when `viewerFinancialImpact.payerImpact.requiresPayerConfirmation` is true.

Payer confirmation must not be visually merged into a generic participant approval. The action area should distinguish:

- participant approval of the viewer's share
- confirmation of payer role or payer contribution
- blocked state when payer confirmation is still required

Copy should make the consequence explicit: confirming means the user acknowledges the proposed payer role, paid amount, or contribution shown by the server.

### Unaffected Participant

An unaffected participant may still open the review from bill detail or an inbox action, but the financial impact summary should say that the server marked them as not directly affected by this revision.

The UI should still make the full bill available for context. If no action is required, the action area should show read-only state rather than hiding the explanation.

### User With No Prior Baseline

If `baseline.baselineType` is `no_prior_baseline`, the default review experience is full bill review with highlighted changes. The explanation should say that Settleora cannot safely derive a previous accepted, approved, or rejected review baseline for this viewer.

Changed-only may be unavailable or visually de-emphasized because it could hide necessary first-review context. Users who never approved the first bill should see the full current bill with highlighted changes.

### User With Safe Active Or Prior Revision Baseline

If the server returns `active_accepted_bill`, `previous_revision_approval`, or `previous_revision_rejection`, the UI may default to changed-only when `defaultViewMode` is `changed_only`.

Full bill review must remain available from the same screen. The explanation should show the baseline type and, when present, the baseline review timestamp. It should not imply that passive viewing timestamps exist when the API exposes `last_view_without_approval_or_rejection_not_persisted`.

## Mobile Screen Model

### Bill Detail Pending Revision Banner

Bill detail should show a pending revision banner when the loaded bill or related revision state indicates a submitted revision requiring review.

The banner should include:

- bill or merchant label
- revision status such as submitted, withdrawn, rejected, applied, superseded, or unavailable
- short viewer impact label, such as "Your share changed" or "No direct impact"
- payer-confirmation label when required
- entry action to open revision review

The banner is not authorization. Opening or acting on the revision must revalidate with the API.

### Revision Review Entry Point

Entry points should exist from bill detail and future Action Inbox or notification surfaces. They should route to the authoritative bill and revision IDs, refresh the revision response, and handle stale or denied states before showing actions.

If a pending action deep link resolves to a withdrawn, applied, rejected, or superseded revision, the entry point should show a terminal state and offer a safe route back to bill detail.

### Revision Review Screen

The review screen is the primary decision surface. On mobile it should be a single vertical flow:

1. status and bill identity header
2. financial impact summary card
3. baseline and default-view explanation
4. view-mode control for Full bill and Changed only
5. selected review content
6. category summary and limitations disclosure
7. action area

The screen should support pull-to-refresh or an explicit refresh action. A refreshed response can change the default view, available actions, revision status, and server-provided labels.

### Financial Impact Summary Card

This card should render `viewerFinancialImpact` as the first money-specific content:

- previous share when present
- proposed share
- delta share
- affected or unaffected state
- payer contribution details when present
- payer confirmation requirement and status when present

When previous values are null because there is no safe baseline, the card should say that Settleora can show the proposed share but not a safe previous share for this viewer. It must not compute a previous value from raw rows.

### Baseline And Default-View Explanation

The explanation should render server-selected `baseline` and `fullViewRecommendedReason` in plain language:

- no prior baseline: full bill recommended
- active accepted bill: changed-only can start from the accepted bill baseline
- previous revision approval: changed-only can start from that review state
- previous revision rejection: changed-only can start from that rejection state

If `baselineReviewedAtUtc` exists, show it as contextual metadata. If it is null, do not invent a last-view time.

### Full Bill View With Inline Highlights

Full bill view shows the complete proposed bill state. Rows with matching server-provided `changes` should include inline change markers.

Supported inline highlight targets are currently aggregate categories:

- bill total
- participant share
- payer contribution
- payer role

The marker must use `accessibleLabel` text, such as Added, Removed, Changed, Increased, Decreased, or Requires confirmation. Color can reinforce meaning but must never be the only signal.

Unsupported categories should remain visible as disclosure messages rather than fake row diffs.

### Changed-Only Filter

Changed-only view shows only server-provided `changes`, grouped by safe category or `fieldPath`. It is available when the server provides change data and the baseline allows a safe reduced review.

Changed-only should include:

- before and after display values when provided
- change type
- accessible label
- viewer impact
- related profile context only when safely displayable

If there are no supported change rows, changed-only should explain why it is unavailable and route the user to full bill review.

### Category Summary And Changelog View

The category summary renders `changeSummary` with category, support status, count, and viewer impact.

This section should help users answer:

- which kinds of changes are supported in this revision snapshot
- which kinds are unsupported
- how many supported changes exist
- whether any category directly affects the viewer

For mobile, this can be a collapsible section below the selected view. For web, it can become a side panel or tab while preserving the same server data contract.

### Approve, Reject, And Payer Confirmation Action Area

The action area should sit after the review content on mobile. It should remain clearly associated with the revision version currently displayed.

Approve copy should name the exact consequence, for example:

```text
Approve this revision
You are approving the proposed amount and calculation shown for this pending revision.
```

Reject copy should name the exact consequence, for example:

```text
Reject this revision
You are rejecting this proposed correction. The active bill is not changed by this action.
```

When payer confirmation is required, show a distinct confirmation action or confirmation block. Do not bury it inside a generic approve button. If the API requires exact approval body fields, the client should use server-provided revision response values and generated-client request models, not locally recomputed money.

### Limitations And Unsupported Disclosure

The review screen must visibly disclose `limitations`, including:

- `last_view_without_approval_or_rejection_not_persisted`
- `item_split_attachment_note_diff_unsupported_in_current_revision_snapshot`

Unsupported categories include item, item split, adjustment, attachment, receipt/OCR review, note, and metadata detail diffs until snapshots persist those details. The UI should say that Settleora can show supported aggregate changes, while detailed row-level changes for those categories are not available in this foundation.

## Accessibility

Bill revision review must be accessible by default because it gates money and trust decisions.

Required accessibility behavior:

- Never use color as the only change signal.
- Render visible labels such as Added, Removed, Changed, Increased, Decreased, and Requires confirmation.
- Expose screen-reader labels for every change marker, based on server-provided `accessibleLabel`.
- Put the financial impact summary before the detailed changelog in reading order.
- Keep approval, rejection, and payer confirmation buttons reachable after the review content.
- Preserve focus after view-mode changes.
- Move focus to the first error or stale-state explanation after a failed action.
- For future web, support keyboard navigation across view-mode tabs, expandable categories, changed rows, and action buttons.
- Give unsupported or limitation messages visible text, not only tooltip-only explanations.

Motion should be optional and should not be needed to understand added, removed, or changed state.

## State Model

### Loading

Show a loading state while refreshing bill and revision data. Do not show stale approval buttons as enabled while a revision response is being refreshed.

### Empty Or No Pending Revision

If there is no pending revision, show a neutral state and a route back to bill detail. Do not present approval or rejection actions.

### No Safe Baseline

Default to full bill review. Show that changed-only is unavailable or secondary because there is no safe prior baseline for this viewer.

### Changed-Only Unavailable

Changed-only is unavailable when the server does not provide supported changes, when no safe baseline exists, or when every relevant category is unsupported. The UI should explain this and keep full bill review available.

### Unsupported Detail Categories

For item, split, attachment, receipt/OCR, note, or metadata changes that are unsupported in the current snapshot, show explicit disclosure. Do not synthesize detail diffs from current bill rows.

### Offline Or Read-Only

Offline state may allow reading cached content only if clearly marked stale. Approve, reject, payer confirmation, withdraw, apply, or revise actions should be disabled or queued only after a future sync design explicitly authorizes that operation.

Read-only state should explain whether it comes from offline mode, missing permission, terminal revision state, or unsupported client capability.

### Permission Denied

Permission denied should show a safe generic message and a path back to bill detail or list. It should not reveal unrelated bill, group, participant, payer, or revision details.

### Already Applied, Rejected, Withdrawn, Or Superseded

Terminal states should show what happened and disable action buttons. For superseded revisions, tell the user that prior approval does not carry forward and route to the latest revision only if the API exposes it safely.

### Validation Or Server Error After Action

After approve, reject, or payer confirmation fails, keep the user on the review screen, refresh if safe, and show the server message. Conflicts should emphasize that the revision may have changed and requires a fresh review before any action.

## Action Safety

All final or destructive actions must include consequence text close to the button or confirmation step.

Approval safety rules:

- State that the approval is for this exact pending revision.
- Bind mentally to the shown amount, currency, and calculation state.
- Revalidate before mutation.
- Do not carry approval across superseded revisions.

Rejection safety rules:

- State that rejection applies to the pending revision, not to unrelated bill records.
- State that rejection does not silently delete or mutate the active bill.
- Avoid free-text rejection reasons unless a later API and moderation design authorizes them.

Payer confirmation safety rules:

- Keep payer confirmation visually separate from participant approval.
- State whether the user is confirming payer role, payer contribution, paid amount, or all applicable payer facts.
- Do not let generic approval imply payer confirmation unless the API explicitly models that combined action.

## Web Compatibility Notes

The mobile flow should translate to user web without changing authority rules:

- Full bill and changed-only can become tabs or split-pane sections.
- Category summary can become a side panel.
- Inline markers should use the same accessible labels.
- Keyboard focus order should follow summary, baseline, view mode, content, limitations, and actions.
- Larger screens may keep financial impact sticky while users inspect long change lists.

Future admin web should treat revision review as an audit or support surface only when explicitly authorized. Admin visibility must not imply permission to bypass bill participant authorization, payer confirmation, privacy policy, or audit rules.

## Acceptance Criteria For Future UI Implementation

Future UI branches should satisfy these checks:

- Bill detail exposes a pending revision entry point when the server state supports it.
- Review screen renders `reviewContext` without computing financial truth locally.
- No-baseline users default to full bill review with highlighted changes.
- Safe-baseline users may default to changed-only, with full bill still available.
- Full bill view shows inline non-color-only markers for server-supported changes.
- Changed-only view filters only server-provided changes.
- Financial impact summary shows viewer-specific share and payer impact exactly as provided.
- Payer confirmation is separate and obvious when required.
- Unsupported categories and limitations are visible.
- Terminal, denied, offline, stale, validation, and conflict states are handled without unsafe actions.
- Approval and rejection copy clearly names the consequence.

## Non-Goals

This task does not implement or authorize:

- Flutter implementation.
- Web implementation.
- API/domain changes.
- OpenAPI or generated-client edits.
- Database or EF migrations.
- Settlement, residual, balance, or money algorithm changes.
- Day 2 or Day 3 expansion.
- Day 1 scope reduction.
- OCR engine, worker, or receipt capture work.
- Cloud, subscription, federation, or multi-tenant SaaS runtime work.
