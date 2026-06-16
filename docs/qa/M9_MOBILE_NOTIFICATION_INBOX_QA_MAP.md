# M9 Mobile In-App Notification Inbox QA Map

Status: `M9 finalized and UI-test ready; no remaining automated M9 work; manual UI/code review deferred until Day 1 acceptance`

## Boundary

M9 hardens the mobile in-app notification inbox UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy or file byte behavior changes, money/bill/settlement/recurring/OCR authority changes, notification delivery providers, push/email delivery, notification preferences, reminder scheduling, background delivery, notification queue/worker behavior, linked-resource authorization changes, deployment, Docker, CI, secrets, web/admin runtime UI, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M9.

## Selection Basis

- `README.md` records guarded current-user in-app notification list/summary/read/archive endpoints and a starter authenticated mobile in-app notification list/summary/read/archive surface.
- `docs/prd/MVP_DAY1_SCOPE.md` requires basic in-app notifications for bills, bill approvals/corrections, item claim states, settlements, recurring due soon, sync conflict/failure, security/session events, and OCR completion/failure where server OCR is used.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` says notification visibility is presentation only, and linked bill, settlement, or recurring data must still be re-fetched through its own server-authorized route before future deep-link behavior.
- `docs/features/expenses-bills/TECHNICAL_SPEC.md` requires bill revision notifications to use safe summaries, template keys, and stable IDs, while excluding receipt/OCR content, private notes, payment details, proof bytes, storage internals, raw request bodies, tokens, unrelated user data, email, push delivery, preferences, and deep-link behavior.
- The OpenAPI contract already has current-user notification list, unread summary, mark-all-read, mark-one-read, and archive endpoints. This QA map does not authorize contract edits.
- Current mobile files under `apps/mobile/lib/notifications/` and focused tests under `apps/mobile/test/notification_*` provide bounded seams for mobile-only inbox hardening.

## M9-001 Reconciliation Summary

M9-001 reconciled the current mobile in-app notification summary, inbox list, local filters, read/archive actions, optional restore seam, generated-client mapping, app-shell entry points, and typed handoffs without changing runtime behavior.

Current state:

- Mobile notification rows preserve server-returned safe presentation fields and typed target IDs, while display helpers bound unknown values and suppress unsafe raw strings.
- The generated notification repository is session-gated per call, normalizes supported list filters and cursors, bounds list limits to 1-100, trims route IDs, rejects blank IDs before generated calls, maps generated responses into mobile models, and reduces generated/transport failures to safe mobile failure kinds.
- The mobile inbox loads summary plus a bounded list, shows unread/attention/urgent counts, filters only already-loaded rows, excludes archived rows from active filters, exposes row/bulk read/archive actions, supports optional restore only when a repository implements that seam, refreshes after successful mutations, and keeps raw action URLs non-authoritative.
- App-shell notification affordances and dashboard readouts are discovery hints backed by server-returned summary data; the notification screen receives bill, group, settlement, recurring, attachment, OCR review, and bill-revision repositories through authenticated shell injection.
- Typed handoffs to personal bill, group bill, bill revision, settlement, and recurring screens use typed IDs as navigation hints and route into existing destination screens/repositories that re-fetch linked resources through their own authorized seams.

M9-001 changed only `.ai` control files and this QA map. No runtime product behavior, backend/API behavior, OpenAPI/generated-client output, auth/session/security configuration, schema/migration, storage/privacy/file byte behavior, money/bill/settlement/recurring/OCR authority, notification delivery/provider/preference/queue/worker behavior, deployment, secrets, web/admin runtime, broad offline sync/cache, or linked-resource authorization behavior was changed.

## Current Repository And Model Inventory

`apps/mobile/lib/notifications/notification_repository.dart` is the hand-written mobile boundary.

- Notification rows preserve server-returned ID, event type, status, priority, subject type, safe summary, optional action URL, typed group/bill/revision/settlement/recurring IDs, and created/read/archive timestamps: `id`, `eventType`, `status`, `priority`, `subjectType`, `safeSummary`, `actionUrl`, `groupId`, `expenseBillId`, `expenseBillRevisionId`, `settlementRequestId`, `settlementPaymentId`, `recurringBillTemplateId`, `recurringBillOccurrenceId`, `createdAtUtc`, `readAtUtc`, and `archivedAtUtc`.
- Status values are `unread`, `read`, and `archived`; priority values are `normal`, `attention`, and `urgent`; subject values currently modeled are `expense_bill`, `settlement_request`, `settlement_payment`, and `recurring_bill_occurrence`.
- Event/status/priority/subject display helpers provide bounded labels for known bill, bill-revision, settlement, proof-attached, and recurring-draft events. Unknown safe codes are title-cased, while UUIDs, tokens, secrets, bearer strings, raw HTTP URLs, `/api/` paths, and query strings fall back to generic labels.
- Target helpers identify bill revision (`expenseBillId` plus `expenseBillRevisionId` on bill-revision events), group bill (`groupId` plus `expenseBillId`), personal bill (`expenseBillId` without group), settlement (`settlementRequestId` on settlement request/payment subjects), and recurring (`recurringBillTemplateId`) targets only as typed navigation possibilities.
- `hasTypedOpenTarget` is a UI affordance only. It is not permission and does not authorize linked-resource display or actions.
- Failure kinds are bounded as session-required, session-expired, denied, unavailable, conflict, validation, network, and server.
- Optional restore support is represented by `SettleoraNotificationRestoreRepository`, but the generated current API seam exposes archive only.

## Generated-Client Repository Mapping

`apps/mobile/lib/notifications/generated_notification_repository.dart` adapts the generated Dart client into the hand-written notification seam.

- Token/session handling reads the access token through `SettleoraAccessTokenProvider` per operation and returns a session-required failure without calling the generated client when no usable token exists.
- List filters trim and normalize optional status to the generated enum, reject unsupported statuses before generated calls, cap result limits to 1-100, and convert the `before` cursor to UTC before calling the generated client.
- Summary/list/read/archive responses are mapped into bounded mobile models without exposing recipient IDs, actor IDs, auth/session data, payment details, storage/file internals, proof bytes, raw OCR text, or unrelated users.
- Route IDs for read/archive actions are trimmed and blank IDs fail before generated calls.
- Generated failures are mapped to safe mobile categories: 400/422 validation, 401 expired session, 403 denied, 404/410 unavailable, 409 conflict, 5xx/unknown generated errors as server, and socket/HTTP/handshake/timeout/IO failures as network.
- Generated-client availability is not permission; the API remains authoritative for notification visibility and linked-resource authorization.

## Mobile Notification UI Inventory

`apps/mobile/lib/notifications/notification_screen.dart` provides the in-app inbox screen.

- Initial load requests unread summary and a bounded notification list with `limit: 50`.
- The summary displays unread, attention, and urgent counts.
- Filters include all, unread, read, attention, urgent, bills, settlements, recurring, actionable, and archived. Active filters exclude archived rows unless the archived filter is selected; local counts are derived from loaded rows and do not represent server-wide visibility.
- List rows display bounded event labels, priority/status/subject labels, safe summaries, received timestamps, updated timestamps in detail, destination labels/status, openable/not-safely-openable chips, and archived boundary copy without showing raw notification IDs, linked-resource IDs, raw action URLs, API paths, tokens, storage paths, payment details, proof bytes, receipt/OCR content, or unrelated-user data.
- Row actions include mark read and archive for active rows, and restore when a repository implements the optional restore seam.
- Bulk actions include mark all read and mark visible read over currently visible unread rows.
- Existing duplicate-action flags block conflicting row, mark-all, and mark-visible mutations while a notification action is in progress.
- Action success refreshes server state through the repository seam.
- Loading, empty, filtered-empty, retry, session-required/expired, and action-failure states exist with bounded messages.
- Typed handoffs can open existing personal bill, group bill, bill-revision, settlement, and recurring screens when matching repositories, current-user context where required, and typed IDs exist. Handoffs must continue to re-fetch linked resources through their own authorized repository seams.
- Raw action URLs are not permission. They must remain hidden or treated as non-authoritative hints only.

## App-Shell And Notification Handoffs

- `apps/mobile/lib/app/server_mode_shell.dart` injects the notification repository after current-user validation and exposes notification entry points through the dashboard header and the dashboard needs-attention section.
- The authenticated shell loads notification summary alongside bill, settlement, recurring, and sync overview data, displays unread/attention/urgent counts as dashboard hints, opens the notification screen with the current user profile ID and destination repositories, and refreshes overview state when returning from notifications.
- Dashboard/header notification affordances are discovery hints only and must not decide notification visibility, linked-resource authorization, or unread truth without server responses.
- Existing handoff tests verify that supported notification destinations open through destination screens/repositories and that opening unread destinations marks the notification read afterward. Linked-resource re-fetch remains expected in the destination repository seam, not from cached notification metadata.

## Automated Coverage Inventory

`apps/mobile/test/notification_screen_test.dart` covers:

- Loading and loaded inbox content.
- Empty state.
- Filter counts and filtered-empty behavior.
- Archived filter behavior and active-filter archived exclusion.
- Read filter state after read action refresh.
- Retry after bounded load failures.
- Server-state refresh after notification actions.
- Mark read, mark all read, mark visible read, archive, restore when supported, duplicate-action guards, and safe action failures.
- Bill, bill-revision, settlement, and recurring handoff behavior through existing repository seams.
- Suppression of raw notification IDs, linked-resource IDs, action URLs, and unsafe visible text.

`apps/mobile/test/notification_generated_repository_test.dart` covers:

- Session-required failure before generated-client calls.
- Mapping of notification summary and row fields.
- Status/limit/before normalization.
- Trimming IDs and wrapping read/archive actions.
- Pre-call validation for unsupported statuses, invalid limits, and blank IDs.
- Safe generated failure mapping and network retry text.

Other notification-adjacent coverage:

- `apps/mobile/test/server_mode_shell_dashboard_test.dart` covers authenticated shell notification loading and entry behavior.
- `apps/mobile/test/dashboard_preview_screen_test.dart` covers static dashboard notification preview copy.
- Existing bill, bill-revision, settlement, recurring, group, dashboard, and shell tests cover destination screens and linked-resource repository behavior only where relevant to notification entry or handoff. M9 does not re-scope those domains.
- Settlement, recurring, and bill tests cover destination screens separately; M9 must not re-scope those domains except through notification handoff assertions.

## Day 1 Requirement Map

| Day 1 notification requirement | Current state | M9 implication |
| --- | --- | --- |
| Basic in-app notification inbox | Current-user summary/list/read/archive API and mobile inbox exist. | M9-001 reconciled coverage; M9-002 may harden inbox/action UX only. |
| New shared bill / bill updated / bill requires acknowledgement or approval | Notification model supports expense-bill subject and known bill submitted/participant accepted/participant rejected/confirmed labels plus bill-revision event keys. | M9-003 may harden typed handoff copy, but linked bill/revision authorization stays in bill repositories/API. |
| Bill correction proposed/revised/withdrawn/accepted/rejected/applied | Bill revision event keys exist in mobile model. | M9-003 may verify safe labels and re-fetch behavior. |
| Item claim notifications | Not currently modeled as distinct mobile event constants. | Future API/contract or product behavior; non-goal for M9 unless already server-returned as safe unknown events. |
| Settlement requested/marked paid/confirmed/disputed/proof attached | Settlement request/payment subject types and IDs exist, and labels cover request created, marked/partially paid, confirmed, disputed, cancelled, and proof attached events. | M9-003 may harden settlement handoff authority without changing settlement runtime. |
| Recurring bill due soon | Recurring occurrence subject and template/occurrence IDs exist, with current label coverage for generated drafts but no reminder/due-soon delivery behavior. | M9-003 may harden recurring handoff authority without adding reminders/background generation. |
| Sync conflict/failure | No dedicated mobile notification subject/handoff currently identified in the notification model. | Future sync/offline slice; non-goal for M9. |
| Security/session event | Backend auth/session event notification behavior is outside this mobile inbox hardening slice. | Non-goal for M9 beyond safe display of server-returned rows. |
| OCR completed/failed if server OCR is used | Server OCR worker/runtime is not implemented. | Non-goal for M9. |
| Email/push can be Day 2 or later | Not implemented. | Explicitly forbidden in M9. |

## Gap Focus For M9-001

M9-001 is complete. It stayed inside docs/control inventory and completed:

- Current notification repository/model, generated-client mapping, UI, app-shell, and automated coverage inventory.
- Day 1 notification requirement mapping, including what is supported by existing current-user in-app seams and what remains non-goal.
- QA expectations for M9-002 inbox/action hardening and M9-003 typed handoff authority hardening.
- Stop conditions for delivery providers, push/email, preferences, reminders, notification generation policy, queue/worker behavior, API/contracts/generated clients, auth/session/security, schema, storage/privacy, money/bill/settlement/recurring/OCR authority, linked-resource authorization changes, deployment, web/admin, and unrelated scope.
- No runtime behavior changes.

## Gap Focus For M9-002

M9-002 is complete. It stayed inside existing mobile notification inbox seams and hardened:

- Summary/list count clarity, local loaded-row filter copy, archived-row boundary, and filtered-empty states.
- Read/archive/restore-if-present/mark-all/mark-visible success and status copy where current behavior was ambiguous.
- Duplicate-action prevention across row and bulk notification mutations.
- Safe bounded failure copy and retry behavior for session, denied, unavailable, conflict, validation, network, and server failures.
- Refresh-after-mutation behavior that avoids stale repeated actions when the action succeeds but follow-up refresh fails.
- Server-authority messaging that the API decides notification visibility, read/archive state, and linked-resource access.
- Focused notification screen coverage for the above, including a refresh-after-success/list-failure recovery case.

Recorded M9-002 validation:

- Focused notification-screen validation passed with 98 tests.
- Full mobile validation passed with 698 Flutter tests.

M9-002 changed only `.ai` control files, this QA map, `apps/mobile/lib/notifications/notification_screen.dart`, and focused notification screen tests. It did not change backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime, schema/migrations, storage/privacy/file byte behavior, money/bill/settlement/recurring/OCR authority, notification delivery/provider/preference/queue/worker behavior, linked-resource authorization, deployment/CI, web/admin runtime, broad offline sync/cache, secrets, or unrelated major-domain behavior.

## Gap Focus For M9-003

M9-003 is complete. It stayed inside existing notification handoff seams and hardened:

- Copy that notification metadata, action URLs, raw notification IDs, linked-resource IDs, cached rows, and generated-client methods are navigation hints only.
- Bill, bill-revision, settlement, and recurring destination handoffs that re-fetch through existing authorized repositories, with copy that the destination API re-checks access and current state before linked details or actions are shown.
- Missing repository, missing typed ID, unsupported action URL, and archived/stale notification states with bounded fallback copy that keeps users in the inbox or existing destination route.
- Notification-origin personal/group bill destination failure suppression so unsafe generated-client, API path, token, storage/provider, proof, receipt/OCR, payment-detail, filesystem, stack-trace, and unrelated-user strings are not rendered.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/notification_screen_test.dart` passed with 57 notification screen tests.
- Focused notification command validation passed with 99 tests.
- Full mobile validation passed with 699 Flutter tests.
- Added coverage that a personal bill handoff still uses the authorized bill repository seam before detail display, denied destination failure copy stays bounded, no read mutation occurs on denied destination failure, and unsafe raw IDs, API paths, action URLs, tokens/secrets, generated-client internals, storage/provider internals, payment details, proof, receipt/OCR content, filesystem paths, stack traces, and unrelated-user strings remain suppressed.

M9-003 changed only `.ai` control files, this QA map, `apps/mobile/lib/notifications/notification_screen.dart`, and focused notification screen tests. It did not change backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime, schema/migrations, storage/privacy/file byte behavior, money/bill/settlement/recurring/OCR authority, notification delivery/provider/preference/queue/worker behavior, linked-resource authorization, deployment/CI, web/admin runtime, broad offline sync/cache, secrets, or unrelated major-domain behavior.

## M9-004 Finalization Summary

M9-004 is complete. It finalized the QA/control state for M9 without changing runtime behavior, tests, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime, schema/migrations, storage/privacy/file byte behavior, money/bill/settlement/recurring/OCR authority, notification delivery/provider/preference/queue/worker behavior, linked-resource authorization, deployment/CI, web/admin runtime, broad offline sync/cache, secrets, or unrelated major-domain behavior.

Final M9 state:

- M9-001, M9-002, M9-003, and M9-004 are complete.
- `STOP-M9-001` remains preserved.
- M9 is finalized and UI-test ready.
- There is no remaining automated M9 work.
- Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not marked passed.

M9-004 final validation performed in this task includes docs validation, scaffold validation, OpenAPI validation, mobile doctor, full mobile validation, scope guard, and final controller dry run. The final full mobile validation count is 699 Flutter tests.

## Queue Expectations

- `M9-001-MOBILE-NOTIFICATION-INBOX-STATE-RECONCILE-20260616-0055` - Completed. Reconciled current mobile notification implementation and automated coverage without runtime behavior changes.
- `M9-002-MOBILE-NOTIFICATION-INBOX-ACTION-HARDENING-20260616-0055` - Completed. Hardened notification inbox filters, read/archive/bulk action clarity, duplicate-action guards, failure/retry states, refresh behavior, and server-authority copy inside existing mobile seams.
- `M9-003-MOBILE-NOTIFICATION-HANDOFF-AUTHORITY-HARDENING-20260616-0055` - Completed. Hardened typed handoff authority boundaries for bill, bill revision, settlement, and recurring notification targets.
- `M9-004-MOBILE-NOTIFICATION-INBOX-QA-FINALIZE-20260616-0055` - Completed. Finalized M9 QA/control state, recorded validation, preserved deferred manual UI/code review status, and marked UI-test ready with no remaining automated M9 work.
- `STOP-M9-001` - Preserve. Stop for forbidden API/contracts/generated-client/auth/schema/storage/privacy/money/bill/settlement/recurring/OCR/deployment, notification delivery/provider/preference/queue/worker, linked-resource authorization, web/admin, broad-sync, secrets, or unrelated major-domain scope.

## Validation Expectations

M9 kickoff validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

The final M9-004 controller dry run should stop because M9 is marked UI-test ready, or select the next controller-approved Day 1 milestone/queue kickoff if the controller advances after finalized milestones.

## Remaining Out Of Scope

- Item claim-specific event constants if not already returned safely by the server.
- Sync conflict/failure notifications.
- Auth/security/session notification generation behavior.
- OCR completion/failure notifications tied to future server OCR worker/runtime.
- Push/email delivery.
- Device-token registration.
- Notification preferences, quiet hours, digests, and reminder scheduling.
- Server-side notification generation policy.
- Notification queue/worker behavior.
- Linked-resource authorization changes.
- Backend/API behavior, OpenAPI/generated clients, and schema/migrations.
- Storage/privacy/file byte behavior.
- Money/bill/settlement/recurring/OCR authority.
- Deployment/CI/env/secrets.
- Web/admin runtime UI.
- Broad offline cache/sync.

## Stop Conditions And Non-Goals

Stop and report `BLOCKED` if an M9 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy or authorization policy changes, file byte behavior, settlement/payment/bill/recurring/OCR/money authority changes, notification delivery providers, push/email delivery, notification preferences, reminder scheduling, background delivery, notification generation policy, queue/worker behavior, linked-resource authorization changes, client-side permission decisions from notification metadata/action URLs, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Non-goals preserved through M9: no backend/API behavior, no OpenAPI or generated-client changes, no schema/auth/storage/privacy/money/business authority changes, no notification delivery/provider/preference/queue/worker behavior, no linked-resource authorization changes, no manual UI/code review pass, and no merge without the required PR/CI/merge gates.
