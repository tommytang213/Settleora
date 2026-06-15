# M9 Mobile In-App Notification Inbox QA Map

Status: `M9 queued; first task pending; manual UI/code review deferred until Day 1 acceptance`

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

## Current Repository And Model Inventory

`apps/mobile/lib/notifications/notification_repository.dart` is the hand-written mobile boundary.

- Notification rows preserve server-returned ID, event type, status, priority, subject type, safe summary, optional action URL, typed group/bill/revision/settlement/recurring IDs, and created/read/archive timestamps.
- Display helpers provide bounded labels for known status, priority, subject, and event codes and suppress unsafe-looking raw strings.
- Target helpers identify bill revision, group bill, personal bill, settlement, and recurring targets only as typed navigation possibilities.
- `hasTypedOpenTarget` is a UI affordance only. It is not permission and does not authorize linked-resource display or actions.
- Failure kinds are bounded as session-required, session-expired, denied, unavailable, conflict, validation, network, and server.
- Optional restore support is represented by `SettleoraNotificationRestoreRepository`, but the generated current API seam exposes archive only.

## Generated-Client Repository Mapping

`apps/mobile/lib/notifications/generated_notification_repository.dart` adapts the generated Dart client into the hand-written notification seam.

- Token/session handling reads the access token through `SettleoraAccessTokenProvider` per operation and returns a session-required failure without calling the generated client when no usable token exists.
- List filters normalize the optional status, cap result limits, and convert the `before` cursor to UTC before calling the generated client.
- Summary/list/read/archive responses are mapped into bounded mobile models without exposing recipient IDs, actor IDs, auth/session data, payment details, storage/file internals, proof bytes, raw OCR text, or unrelated users.
- Route IDs for read/archive actions are trimmed and blank IDs fail before generated calls.
- Generated failures are mapped to safe mobile categories: validation, expired session, denied, unavailable, conflict, server, and network.
- Generated-client availability is not permission; the API remains authoritative for notification visibility and linked-resource authorization.

## Mobile Notification UI Inventory

`apps/mobile/lib/notifications/notification_screen.dart` provides the in-app inbox screen.

- Initial load requests unread summary and a bounded notification list.
- The summary displays unread, attention, and urgent counts.
- Filters include all, unread, read, attention, urgent, bills, settlements, recurring, actionable, and archived, with active filters excluding archived rows unless the archived filter is selected.
- List rows display bounded event labels, priority/status labels, safe summaries, and created/read/archive timestamps without showing raw notification IDs or linked-resource IDs.
- Row actions include mark read and archive for active rows, and restore when a repository implements the optional restore seam.
- Bulk actions include mark all read and mark visible read over currently visible unread rows.
- Existing duplicate-action flags block conflicting row, mark-all, and mark-visible mutations while a notification action is in progress.
- Action success refreshes server state through the repository seam.
- Loading, empty, filtered-empty, retry, session-required/expired, and action-failure states exist with bounded messages.
- Typed handoffs can open existing bill, bill-revision, settlement, and recurring screens when matching repositories and IDs exist. Handoffs must continue to re-fetch linked resources through their own authorized repository seams.
- Raw action URLs are not permission. They must remain hidden or treated as non-authoritative hints only.

## App-Shell And Notification Handoffs

- `apps/mobile/lib/app/server_mode_shell.dart` injects the notification repository after current-user validation and exposes notification entry points in the authenticated shell.
- Dashboard/header notification affordances are discovery hints only and must not decide notification visibility, linked-resource authorization, or unread truth without server responses.
- Existing notification tests cover settlement handoff and generated-client settlement ID mapping. M9 should broaden the notification-specific QA map before hardening runtime behavior.

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
- Settlement, recurring, and bill tests cover destination screens separately; M9 must not re-scope those domains except through notification handoff assertions.

## Day 1 Requirement Map

| Day 1 notification requirement | Current state | M9 implication |
| --- | --- | --- |
| Basic in-app notification inbox | Current-user summary/list/read/archive API and mobile inbox exist. | M9-001 reconciles coverage; M9-002 may harden inbox/action UX only. |
| New shared bill / bill updated / bill requires acknowledgement or approval | Notification model supports expense-bill subjects and bill-revision event keys. | M9-003 may harden typed handoff copy, but linked bill/revision authorization stays in bill repositories/API. |
| Bill correction proposed/revised/withdrawn/accepted/rejected/applied | Bill revision event keys exist in mobile model. | M9-003 may verify safe labels and re-fetch behavior. |
| Item claim notifications | Not currently modeled as distinct mobile event constants. | Future API/contract or product behavior; non-goal for M9 unless already server-returned as safe unknown events. |
| Settlement requested/marked paid/confirmed/disputed/proof attached | Settlement request/payment subject types and IDs exist. | M9-003 may harden settlement handoff authority without changing settlement runtime. |
| Recurring bill due soon | Recurring occurrence subject and template/occurrence IDs exist. | M9-003 may harden recurring handoff authority without adding reminders/background generation. |
| Sync conflict/failure | No dedicated mobile notification subject/handoff currently identified in the notification model. | Future sync/offline slice; non-goal for M9. |
| Security/session event | Backend auth/session event notification behavior is outside this mobile inbox hardening slice. | Non-goal for M9 beyond safe display of server-returned rows. |
| OCR completed/failed if server OCR is used | Server OCR worker/runtime is not implemented. | Non-goal for M9. |
| Email/push can be Day 2 or later | Not implemented. | Explicitly forbidden in M9. |

## Gap Focus For M9-001

M9-001 should stay inside docs/control/test inventory and complete:

- Current notification repository/model, generated-client mapping, UI, app-shell, and automated coverage inventory.
- Day 1 notification requirement mapping, including what is supported by existing current-user in-app seams and what remains non-goal.
- QA expectations for M9-002 inbox/action hardening and M9-003 typed handoff authority hardening.
- Stop conditions for delivery providers, push/email, preferences, reminders, notification generation policy, queue/worker behavior, API/contracts/generated clients, auth/session/security, schema, storage/privacy, money/bill/settlement/recurring/OCR authority, linked-resource authorization changes, deployment, web/admin, and unrelated scope.
- No runtime behavior changes.

## Gap Focus For M9-002

M9-002 should stay inside existing mobile notification inbox seams and may harden:

- Summary/list count clarity, local filter copy, archived-row boundary, and filtered-empty states.
- Read/archive/mark-all/mark-visible confirmations or status copy where current behavior is ambiguous.
- Duplicate-action prevention across row and bulk notification mutations.
- Safe bounded failure copy and retry behavior for session, denied, unavailable, conflict, validation, network, and server failures.
- Refresh-after-mutation behavior that avoids stale repeated actions when the action succeeds but follow-up refresh fails.
- Server-authority messaging that the API decides notification visibility/read/archive state.

## Gap Focus For M9-003

M9-003 should stay inside existing notification handoff seams and may harden:

- Copy that notification metadata, action URLs, raw IDs, cached rows, and generated-client methods are navigation hints only.
- Bill, bill-revision, settlement, and recurring handoffs re-fetch linked resources through existing authorized repositories before rendering destination detail/actions.
- Missing repository, missing typed ID, denied/unavailable destination, and stale notification states show bounded terminal or fallback copy.
- Unsafe raw action URLs, raw IDs, API paths, storage paths, tokens, payment details, proof bytes, receipt/OCR content, and unrelated-user data remain suppressed.

## Queue Expectations

- `M9-001-MOBILE-NOTIFICATION-INBOX-STATE-RECONCILE-20260616-0055` - Queued. Reconcile current mobile notification implementation and automated coverage without runtime behavior changes.
- `M9-002-MOBILE-NOTIFICATION-INBOX-ACTION-HARDENING-20260616-0055` - Queued. Harden notification inbox filters, read/archive/bulk action clarity, duplicate-action guards, failure/retry states, refresh behavior, and server-authority copy inside existing mobile seams.
- `M9-003-MOBILE-NOTIFICATION-HANDOFF-AUTHORITY-HARDENING-20260616-0055` - Queued. Harden typed handoff authority boundaries for bill, bill revision, settlement, and recurring notification targets.
- `M9-004-MOBILE-NOTIFICATION-INBOX-QA-FINALIZE-20260616-0055` - Queued. Finalize M9 QA/control state, record validation, and mark UI-test ready only after M9 implementation slices complete.
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

The final kickoff controller dry run should select `M9-001-MOBILE-NOTIFICATION-INBOX-STATE-RECONCILE-20260616-0055`.

## Stop Conditions And Non-Goals

Stop and report `BLOCKED` if an M9 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy or authorization policy changes, file byte behavior, settlement/payment/bill/recurring/OCR/money authority changes, notification delivery providers, push/email delivery, notification preferences, reminder scheduling, background delivery, notification generation policy, queue/worker behavior, linked-resource authorization changes, client-side permission decisions from notification metadata/action URLs, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Non-goals preserved through M9: no backend/API behavior, no OpenAPI or generated-client changes, no schema/auth/storage/privacy/money/business authority changes, no notification delivery/provider/preference/queue/worker behavior, no linked-resource authorization changes, no manual UI/code review pass, and no merge without the required PR/CI/merge gates.
