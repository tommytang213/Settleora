# Mobile Web Bill Revision Diff Reference V1

## Status

Approved dark-mode mobile and user-web reference.

- Reference name: `Day 1 Bill Revision Diff #425`
- Related item: #425
- Asset folder: `docs/design/mobile/assets/bill-revision-diff-v1/`

This reference records the approved Day 1 bill revision review-diff visual direction for future mobile and user-web implementation tasks. It does not authorize runtime implementation, API behavior, OpenAPI/generated-client changes, storage behavior, schema/migration changes, auth/session/security behavior, or money, bill, settlement, or payment calculation changes.

## Screens Represented

Mobile screens:

- M01 Revision review entry
- M02 Changed-only review
- M03 Full bill review
- M04 Approval saved status
- M05 Blocked revision
- M06 Propose changes / change request input
- M07 Stale revision
- M08 Access denied

User web screens:

- W01 Desktop app overview
- W02 Desktop full review
- W03 Desktop change request
- W04 Desktop settlement impact
- W05 Desktop activity

## Screenshot Inventory

| Screen | Asset | Purpose |
| --- | --- | --- |
| M01 Revision review entry | [m01-revision-review-entry-part-01.png](assets/bill-revision-diff-v1/m01-revision-review-entry-part-01.png) | Introduces a pending revision that needs review, including status, action context, and entry points. |
| M01 Revision review entry | [m01-revision-review-entry-part-02.png](assets/bill-revision-diff-v1/m01-revision-review-entry-part-02.png) | Continues the review entry state with supporting context and available actions. |
| M02 Changed-only review | [m02-changed-only-review-part-01.png](assets/bill-revision-diff-v1/m02-changed-only-review-part-01.png) | Shows changed-only diff review for the fields or bill details affected by the revision. |
| M02 Changed-only review | [m02-changed-only-review-part-02.png](assets/bill-revision-diff-v1/m02-changed-only-review-part-02.png) | Continues changed-only review with additional changed details and review actions. |
| M03 Full bill review | [m03-full-bill-review-part-01.png](assets/bill-revision-diff-v1/m03-full-bill-review-part-01.png) | Shows full bill review as a sibling view for users who need complete context. |
| M03 Full bill review | [m03-full-bill-review-part-02.png](assets/bill-revision-diff-v1/m03-full-bill-review-part-02.png) | Continues full bill review with remaining bill context and actions. |
| M04 Approval saved status | [m04-approval-saved-status-part-01.png](assets/bill-revision-diff-v1/m04-approval-saved-status-part-01.png) | Confirms that the viewer's approval was saved for the current revision. |
| M04 Approval saved status | [m04-approval-saved-status-part-02.png](assets/bill-revision-diff-v1/m04-approval-saved-status-part-02.png) | Continues the saved approval state with follow-up status context. |
| M05 Blocked revision | [m05-blocked-revision.png](assets/bill-revision-diff-v1/m05-blocked-revision.png) | Shows a revision that cannot proceed because settlement or review conditions block it. |
| M06 Propose changes / change request input | [m06-propose-changes-part-01.png](assets/bill-revision-diff-v1/m06-propose-changes-part-01.png) | Shows the entry state for proposing changes instead of approving or keeping the original bill. |
| M06 Propose changes / change request input | [m06-propose-changes-part-02.png](assets/bill-revision-diff-v1/m06-propose-changes-part-02.png) | Continues change request input, including targeted fields and supporting notes. |
| M07 Stale revision | [m07-stale-revision.png](assets/bill-revision-diff-v1/m07-stale-revision.png) | Shows a superseded or stale revision state that is no longer actionable. |
| M08 Access denied | [m08-access-denied.png](assets/bill-revision-diff-v1/m08-access-denied.png) | Shows an authorization-denied state without exposing hidden bill or file details. |
| W01 Desktop app overview | [w01-desktop-overview-part-01.png](assets/bill-revision-diff-v1/w01-desktop-overview-part-01.png) | Shows the desktop overview for reviewing a pending bill revision. |
| W01 Desktop app overview | [w01-desktop-overview-part-02.png](assets/bill-revision-diff-v1/w01-desktop-overview-part-02.png) | Continues the desktop overview with supporting review and activity context. |
| W02 Desktop full review | [w02-desktop-full-review-part-01.png](assets/bill-revision-diff-v1/w02-desktop-full-review-part-01.png) | Shows full bill review on desktop with broader bill context. |
| W02 Desktop full review | [w02-desktop-full-review-part-02.png](assets/bill-revision-diff-v1/w02-desktop-full-review-part-02.png) | Continues desktop full review with remaining bill details and review actions. |
| W03 Desktop change request | [w03-desktop-change-request-part-01.png](assets/bill-revision-diff-v1/w03-desktop-change-request-part-01.png) | Shows desktop change request composition for a bill revision. |
| W03 Desktop change request | [w03-desktop-change-request-part-02.png](assets/bill-revision-diff-v1/w03-desktop-change-request-part-02.png) | Continues desktop change request composition with additional targets or notes. |
| W04 Desktop settlement impact | [w04-desktop-settlement-impact-part-01.png](assets/bill-revision-diff-v1/w04-desktop-settlement-impact-part-01.png) | Shows person-by-person settlement impact and repayment changes for the revision. |
| W04 Desktop settlement impact | [w04-desktop-settlement-impact-part-02.png](assets/bill-revision-diff-v1/w04-desktop-settlement-impact-part-02.png) | Continues desktop settlement impact details and supporting status context. |
| W05 Desktop activity | [w05-desktop-activity.png](assets/bill-revision-diff-v1/w05-desktop-activity.png) | Shows latest-first activity feed entries for revision status and actions. |

## Accepted UX Decisions

- Affected users can approve revision, keep original bill, or propose changes.
- Changed-only review and full-bill review are sibling views, not forced sequential steps.
- Proposed changes can target changed fields, unchanged bill items, charges, participants, notes, or receipt details.
- Settlement impact shows person-by-person repayment changes.
- Activity is latest-first because this behaves like a status/activity feed.
- Dedicated discussion/comment threads may use chronological order separately.
- Original bill payer review is domain review status, not a manual "request confirmation" action.
- If the original bill payer submitted the revision, bill-payer review is already covered for that version.

## Guardrails

- This is reference material only, not runtime implementation.
- API/domain services remain authoritative for money impact, status transitions, authorization, settlement blocking, and audit.
- Clients render server-provided revision, review, and settlement context and must not compute authoritative money impact or authorization.
- Do not expose implementation terms such as calculation hash, API/domain, storage path, object key, raw secrets, tokens, or internal file identifiers in user-facing UI.
- File and receipt access remains API-authorized.
- Money remains decimal-safe with currency attached and centralized rounding.

## Implementation Notes

- Use shared design tokens/components for cards, chips, buttons, review rows, status panels, timeline rows, and diff rows.
- Do not implement one-off styling for repeated patterns.
- Keep button labels action-specific.
- Preserve safe empty, stale, blocked, and denied states.
- Keep activity timestamps visible.

## Acceptance Checklist

- All screenshot assets in `docs/design/mobile/assets/bill-revision-diff-v1/` are represented.
- Mobile and user-web references remain documented as visual reference only.
- Changed-only and full-bill review remain sibling views.
- Server/API authority for money, authorization, status transitions, settlement blocking, and audit is preserved.
- User-facing UI avoids internal implementation terms.
