# M1 Group Bill Create QA Map

## Scope

This map covers the mobile server-mode group bill create/list/detail happy path for owner UI testing in milestone `M1`. It is a QA planning artifact only; it does not change backend, API, generated clients, auth/session/security, schema, deployment, Docker, CI, settlement, payment, bill calculation, or money behavior.

## Test Surface

- App area: `apps/mobile/lib/bills/bill_list_screen.dart`
- Widget tests: `apps/mobile/test/group_bill_list_screen_test.dart`
- Entry point: `SettleoraGroupBillListScreen` with a server-authorized group context.
- Repository seams: `SettleoraBillRepository`, `SettleoraGroupRepository`, and optional bill attachment seams.

## Happy Path Map

| QA waypoint | Expected result | Automated coverage |
| --- | --- | --- |
| Group bill list loads for a group workspace | Group name, group bill filters, refresh action, and `Create group bill` action render without personal bill create affordances. | `group bill list renders loading, empty, and refresh states` |
| Members are required before create | Member load failure blocks the create form and does not call personal or group bill create. | `group bill create stays unavailable when members fail to load` |
| Create form exposes guided sections | Start, Basics, Receipt & Items, Split, Payers, and Review waypoints are reachable from the group create flow. | `group bill create happy path smoke reaches submitted detail` |
| Receipt-mode navigation stays predictable | Receipt/import mode skips directly to Receipt & Items and Back returns to Start instead of a skipped Basics section. | `group bill create receipt mode back returns to start` |
| Minimal manual bill can be entered | Merchant/payee, date picker/today action, currency selectors, item, split member, payer, and review checklist remain in group context. | `group bill create happy path smoke reaches submitted detail`; `group bill create maps member split and payer draft strings` |
| Date and currency inputs use mobile controls | Bill date uses a mobile picker affordance with `Today`; bill, item, and payer currency values use dropdown/selectors and submit uppercase 3-letter codes. | `group bill create date today and currency selectors update draft`; `group bill create maps member split and payer draft strings` |
| Receipt & Items stays item-focused | Item cards show line total amount and quantity/units, and do not expose raw split payload controls. | `group bill receipt items hides raw split controls and keeps quantity local` |
| Group create uses group repository path only | `createGroupBill` receives the selected group ID and no personal bill create is called. | `group bill create happy path smoke reaches submitted detail`; `group bill create maps member split and payer draft strings` |
| Submit uses returned bill ID and group context | `submitGroupBill` is called once with the created group bill ID and group ID. | `group bill create happy path smoke reaches submitted detail`; `group bill create submit calls repository once in group context` |
| Returned detail opens after create/submit | Detail route shows returned bill content and can refresh/list back without offline queue UI. | `group bill create happy path smoke reaches submitted detail`; `group bill create uses returned detail without offline queueing` |
| Assignment sheet exposes editable basis values | Exact amount and share-weight assignments expose member-level input fields; unit/share assignment explains that units become item share weights. | `group bill assign item sheet applies exact amounts locally`; `group bill assign item sheet applies share weights locally`; `group bill assign item sheet renders quantity split controls` |
| Item quantity does not change line totals | Quantity/units entered on the item editor is reflected as local assignment guidance and does not multiply the submitted item amount. | `group bill receipt items hides raw split controls and keeps quantity local` |
| Payer step defaults to common one-payer flow | When the current user is available as an active member, the payer step defaults to one payer for the full item total and keeps quick actions for paid-by-me, selected member, and split payer. | `group bill payer step defaults to current user full total` |
| Blank equal-split basis is omitted from generated payload | Mobile no longer serializes blank equal-split `basisValue` as an explicit null key before submit. | `createGroupBill keeps optional blank strings null` in `bill_generated_repository_test.dart` |
| Validation blocks unsafe local drafts before mutation | Blank fields, invalid money, payer mismatch, and split mismatch stop create and attachment upload. | Existing `group bill create validation ...` widget tests |
| Submit/upload retry is bounded | Submit retry does not duplicate create; attachment retry preserves remaining uploads. | Existing submit and attachment retry widget tests |

## Manual Smoke Checklist

Use a server-mode test account that owns or can create group bills in a group with at least two active members.

- Open Groups, select the target group, and open group bills.
- Confirm the group name, group bill filters, refresh action, and `Create group bill` action are visible.
- Start `Create group bill`, verify the guided sections: Start, Basics, Receipt & Items, Split, Payers, and Review.
- Enter a manual bill with merchant/payee, date picker or `Today`, selected currency, one item, one selected split member, and one payer whose amount matches the item total.
- Confirm bill, item, and payer currency controls are selectors/dropdowns rather than free-text fields.
- On Receipt & Items, confirm item amount is the line total, quantity/units are optional local guidance, and raw split-entry controls are absent.
- In the assign item sheet, verify exact amount mode exposes amount inputs, share mode exposes share-weight inputs, and unit/share mode clearly treats units as share weights for the line.
- In the payer step, verify the current user defaults as the full-total payer when available and quick actions can reset the payer rows.
- Review the checklist and confirm selected members, item rows, split rows, payer rows, and optional attachment state are understandable.
- Submit the bill.
- Confirm the returned group bill detail opens with the created merchant/payee and submitted/pending state.
- Navigate back and confirm the group bill list refreshes in the same group context.

## Stop Conditions

Stop and require human review if QA discovers that readiness needs any of the following:

- Backend/API, OpenAPI, generated-client, auth/session/security, schema/migration, Docker/env/deployment, or CI changes.
- Settlement, payment, bill calculation, or money behavior changes.
- Secrets or secret references.
- Main branch merge or direct push.

## Future Web Note

When web group bill create is implemented, date UX should support keyboard/manual date entry along with picker and today actions. This note is not part of mobile M1 acceptance.
