# M1 Group Bill UI Testing Checklist

## Scope

This checklist covers the mobile server-mode owner path for M1 group bill create/list/detail UI testing. It is a human QA checklist only and does not change backend, API, generated clients, auth/session/security, schema, deployment, Docker, CI, settlement, payment, bill calculation, money, storage policy, or secrets.

## Preconditions

- Use a server-mode mobile session with a signed-in owner or group member who can create group bills.
- Use a group with at least two active members visible in the mobile group detail.
- Confirm the app is connected to the intended test server and the session has not expired.
- Keep expected receipt/supporting attachment files available on the test device if attachment checks are included.

## Owner Path

- Open the mobile app in server mode and sign in.
- Open the group list, select the target group, and open the group bill list/detail surface.
- Confirm the group context is visible and personal bill create controls are not shown in the group bill list/detail path.
- Start `Create group bill`.
- Follow the manual create path: enter merchant/payee, choose a date, choose currency, one item, one member split assignment, one payer contribution, and review.
- Confirm the bill date uses a mobile date picker control and that `Today` sets the date directly without a confusing picker detour.
- Confirm visible currency controls are dropdown/selectors for the bill, item rows, and payer rows, and that they keep 3-letter uppercase currency codes.
- Check the receipt/import path behavior: choose the receipt/import route, verify Back returns to Start, and verify attachments are optional for the review checklist.
- If attaching files, verify receipt and supporting-file choices remain distinct and that receipt OCR review remains provisional rather than automatically finalizing a bill.
- On `Receipt & Items`, verify item rows show name, line total amount, quantity/units, currency, and note only; raw split payload controls such as split method, basis value, allocation order, and add split are not shown there.
- Confirm item quantity/units are local split guidance only and do not multiply the line total amount.
- Complete the item/split assignment happy path and confirm selected member rows remain understandable in the review state.
- Check exact amount assignment: enter member amounts in the assign sheet and verify invalid totals block applying the assignment.
- Check share assignment: enter member share weights in the assign sheet and verify preview amounts and basis values remain understandable.
- Check unit/share assignment: set total line units and claimed units, and confirm the UI explains that these are local share weights for the item rather than hidden extra item rows.
- Complete the payer contribution happy path and confirm the current user defaults to the full bill total when available.
- Use payer quick actions such as `Paid by me`, `Paid by selected member`, and `Split payer`, then confirm payer totals match the item total before save.
- Try validation/recovery behavior for blank required fields, invalid money, split mismatch, and payer mismatch; each should block mutation and keep safe bounded copy.
- Save/submit the bill and, if a safe transient retry case is available, verify retry does not duplicate the created bill or submit call.
- Confirm the returned group bill detail opens with the created bill data.
- Navigate back and refresh; confirm the group bill list/detail reflect the created bill in the same group context.

## Known Non-Goals

- Do not test or request backend/API behavior changes during M1 UI testing.
- Do not test OpenAPI/generated-client changes, auth/session/security changes, database schema/migrations, Docker/env/deployment/CI changes, or secret handling changes as part of this milestone.
- Do not validate settlement/payment/bill calculation policy changes in this milestone; mobile should only render and submit through existing server-owned behavior.
- Do not treat receipt/OCR/import UI as automatic OCR-to-bill finalization.
- Do not treat local/offline group bill create lifecycle, recurring bill lifecycle, web/admin UI, push notifications, or broad sync cache hydration as M1 acceptance criteria.
- Future web UX should support keyboard/manual date entry as well as picker and today behavior; this is not a mobile M1 acceptance requirement unless web runtime is implemented in a later task.

## Stop And Escalate

Stop UI testing and require human review if readiness appears to require backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, settlement/payment/bill calculation, Docker/env/deployment/CI, storage/privacy policy, or secret changes.
