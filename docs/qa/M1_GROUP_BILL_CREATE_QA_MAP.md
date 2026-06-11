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
| Minimal manual bill can be entered | Merchant/payee, date, currency, item, split member, payer, and review checklist remain in group context. | `group bill create happy path smoke reaches submitted detail`; `group bill create maps member split and payer draft strings` |
| Group create uses group repository path only | `createGroupBill` receives the selected group ID and no personal bill create is called. | `group bill create happy path smoke reaches submitted detail`; `group bill create maps member split and payer draft strings` |
| Submit uses returned bill ID and group context | `submitGroupBill` is called once with the created group bill ID and group ID. | `group bill create happy path smoke reaches submitted detail`; `group bill create submit calls repository once in group context` |
| Returned detail opens after create/submit | Detail route shows returned bill content and can refresh/list back without offline queue UI. | `group bill create happy path smoke reaches submitted detail`; `group bill create uses returned detail without offline queueing` |
| Validation blocks unsafe local drafts before mutation | Blank fields, invalid money, payer mismatch, and split mismatch stop create and attachment upload. | Existing `group bill create validation ...` widget tests |
| Submit/upload retry is bounded | Submit retry does not duplicate create; attachment retry preserves remaining uploads. | Existing submit and attachment retry widget tests |

## Manual Smoke Checklist

Use a server-mode test account that owns or can create group bills in a group with at least two active members.

- Open Groups, select the target group, and open group bills.
- Confirm the group name, group bill filters, refresh action, and `Create group bill` action are visible.
- Start `Create group bill`, verify the guided sections: Start, Basics, Receipt & Items, Split, Payers, and Review.
- Enter a manual bill with merchant/payee, date, currency, one item, one selected split member, and one payer whose amount matches the item total.
- Review the checklist and confirm selected members, item rows, split rows, and payer rows are understandable.
- Submit the bill.
- Confirm the returned group bill detail opens with the created merchant/payee and submitted/pending state.
- Navigate back and confirm the group bill list refreshes in the same group context.

## Stop Conditions

Stop and require human review if QA discovers that readiness needs any of the following:

- Backend/API, OpenAPI, generated-client, auth/session/security, schema/migration, Docker/env/deployment, or CI changes.
- Settlement, payment, bill calculation, or money behavior changes.
- Secrets or secret references.
- Main branch merge or direct push.
