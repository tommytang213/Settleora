# M3 Mobile Sync + Offline Queue QA Map

## Purpose

This map reconciles the current mobile sync/offline queue implementation against the Day 1 sync/offline requirements and defines the QA targets for M3. It is a documentation and control artifact only. It does not authorize backend/API behavior, OpenAPI or generated-client changes, auth/session/security runtime changes, database schema or migration changes, settlement/payment/bill calculation changes, storage privacy policy changes, Docker/deployment/env/CI changes, push notification behavior, or broad mobile UI work.

## Day 1 Requirement Boundary

Day 1 requires offline queued work, visible sync states, failed/conflict preservation, and server-authoritative acceptance for shared/server-mode data.

Current authority boundaries remain:

- Mobile may cache, validate locally, and queue bounded offline work.
- Server-mode business truth, authorization, bill lifecycle acceptance, money, settlement state, and audit remain API/domain authoritative.
- Local pending edits must be preserved until server acceptance or explicit review.
- Sync states must cover at least `queued`, `synced`, `conflict`, and `failed`.

## Current-State Reconciliation

### Queue Item Model

Current file: `apps/mobile/lib/sync/sync_queue.dart`.

Currently represented operation types:

- `bill_archive`
- `bill_restore`

Currently represented resource types:

- `expense_bill`

Currently represented queue item states:

- `queued`
- `syncing`
- `synced`
- `failed`
- `conflict`
- `cancelled`

Current queue item fields include:

- Stable local item ID and idempotency key.
- Operation type, resource type, resource ID, optional base version, and bounded primitive payload.
- State, safe error code, safe message, created/updated timestamps, last attempt timestamp, and attempt count.

Current queue storage behavior:

- `SecureStorageSyncQueueStore` stores queue JSON under `settleora.sync_queue.v1`.
- Queue length defaults to 100 items.
- Serialized queue payload defaults to 65,536 bytes.
- Queue payloads are bounded and reject sensitive-looking keys or values such as token, password, refresh, credential, payment, OCR, receipt, proof, file path, and auth account values.
- Archive/restore queue items currently use empty payloads.
- Queue capacity failures do not drop existing pending work.

### Processor Behavior

Current file: `apps/mobile/lib/sync/sync_queue_processor.dart`.

Currently represented behavior:

- `flush` serializes concurrent calls by reusing an in-flight future.
- Flush limit is clamped from 1 to 100.
- Processor reads retryable items in queue order.
- Retryable states are currently `queued` and `failed`.
- Accepted and replayed server results become `synced`.
- Rejected server results become `failed` with bounded safe error fields.
- Conflict server results become `conflict` with bounded safe error fields.
- Retryable network/server failures become `failed`, preserve the item, and increment attempt count.
- Session-required and session-expired failures stop the flush without mutating the queue item.
- Failed items remain retryable; conflict items are preserved but not retried automatically.

Current gaps for M3 hardening:

- The `syncing` state exists in the model and labels, but the processor does not persist a transient `syncing` state before submit.
- There is no backoff, max-attempt, manual retry, cancellation, discard, or conflict-resolution policy.
- There is no automatic compaction/removal of old `synced` items.
- There is no per-item user-review workflow for conflict/failed states beyond labels and queue preservation.
- There is no cross-resource dependency ordering beyond current queue order.

### Generated Sync Repository Seam

Current files:

- `apps/mobile/lib/sync/sync_repository.dart`
- `apps/mobile/lib/sync/generated_sync_repository.dart`

Currently represented behavior:

- `submitOperation` maps mobile queue items into generated `SyncOperationRequest` calls.
- `listChanges` maps generated change-feed responses into metadata-only mobile models.
- Access tokens are read through `SettleoraAccessTokenProvider`; missing/blank tokens become `sessionRequired`.
- Generated API failures map to bounded safe mobile sync failures.
- 400/422 become validation failures.
- 401 becomes session-expired.
- 403 becomes denied.
- 404/410 become unavailable.
- 409 becomes conflict.
- 5xx and network/IO/timeout failures become retryable safe failures.
- Unknown API failures become bounded server failures.
- Change feed inputs bound `sinceVersion` to non-negative values and `limit` to 1-100.
- Known resource types are constrained to `expense_bill`.

Current gaps for M3 hardening:

- Change-feed reads are mapped but not yet connected to a persistent offline cache hydration workflow.
- Change feed coverage is metadata-only; no local cache merge or UI refresh policy is implemented.
- Unsupported future resource types intentionally fail closed until contracts and generated clients are extended in a separate approved task.

### App Bootstrap Wiring

Current file: `apps/mobile/lib/app/app_bootstrap.dart`.

Currently represented behavior:

- Server-mode bootstrap creates a `SecureSessionAccessTokenProvider`.
- The authenticated shell receives a `SettleoraBillSyncController`.
- The default bill sync controller uses `SecureStorageSyncQueueStore`.
- The default sync repository is `GeneratedSettleoraSyncRepository.fromConfiguration`.
- Sync wiring is available only after a usable server-mode session is established.
- Local mode still shows server sync as unavailable until local runtime support exists.

Current gaps for M3 hardening:

- Bootstrap wiring is not yet covered by focused tests that assert the default sync controller/repository/store path is assembled.
- There is no app-level automatic startup flush, background sync, connectivity listener, or change-feed hydration trigger.
- No runtime behavior should be added in M3-001; these are targets for later scoped M3 implementation tasks.

### Bill Archive/Restore Sync Bridge

Current file: `apps/mobile/lib/bills/bill_sync_controller.dart`.

Currently represented behavior:

- `queueArchive` enqueues a `bill_archive` operation for an `expense_bill`.
- `queueRestore` enqueues a `bill_restore` operation for an `expense_bill`.
- `flushPending` delegates to the sync queue processor and returns a queue snapshot.
- Snapshots expose queued, syncing, synced, failed, conflict, and pending counts.
- `latestForBill` selects the newest queue item for a bill by updated timestamp, then created timestamp.
- `hasOpenBillOperation` treats `queued`, `syncing`, `failed`, and `conflict` as open states.
- User-facing labels map failed to `Retry later` and conflict to `Needs review`.

Current UI bridge behavior in `apps/mobile/lib/bills/bill_list_screen.dart`:

- Personal bill list can queue archive/restore operations.
- A sync panel and per-bill sync badges expose queued state and flush behavior.
- Group bill create/list tests explicitly expect no offline queueing for group bill creation.

Current gaps for M3 hardening:

- Bill bridge tests do not yet cover rejected/failed and conflict outcomes.
- The UI surface has no full conflict-review route or manual discard/cancel behavior.
- Only archive/restore lifecycle actions use the queue today; create/edit/group bill/recurring/OCR offline work remains future scope.

## Current Test Coverage

Focused existing tests:

- `apps/mobile/test/sync_queue_test.dart`
  - Queue JSON round trip.
  - Capacity failure without dropping work.
  - Archive/restore item creation with empty safe payloads.
  - Secure key-value queue persistence.
  - Session-blocked flush leaves queue untouched.
  - Accepted/replayed results become synced.
  - Rejected results become failed with safe fields.
  - Conflict results become conflict and preserve the item.
  - Network failures remain retryable failed items and increment attempts.
  - Concurrent flush calls reuse the in-flight flush.
  - Generated submit request/response mapping.
  - Generated failure mapping without leaking internal details.
  - Network failure mapping to retryable safe failures.
  - Metadata-only change feed mapping.
- `apps/mobile/test/bill_sync_controller_test.dart`
  - Archive and restore queue empty safe payloads.
  - Session-blocked sync preserves queued work.
  - Accepted sync operations become synced.
- `apps/mobile/test/bill_list_screen_test.dart`
  - Personal bill list queues archive and flushes through sync.
- `apps/mobile/test/group_bill_list_screen_test.dart`
  - Group bill creation does not expose the personal bill archive/restore sync queue surface.

Coverage gaps for upcoming M3 tasks:

- Processor persistence of a transient `syncing` state or an intentional decision not to persist it.
- Processor behavior for failed-to-retry-to-synced transitions.
- Processor behavior for multiple queued items where one session-blocking failure stops later work.
- Bill sync controller conflict and rejected/failed snapshot behavior.
- App bootstrap default sync wiring.
- Change-feed seam validation from app wiring without cache mutation.
- UI expectations for failed/conflict queue visibility and safe retry labels.

## M3 Acceptance Targets

M3 implementation tasks should keep changes within the current mobile sync/offline queue boundary and validate:

- Queued bill archive/restore work survives app restarts through secure storage.
- Session-blocked sync does not mutate pending work.
- Accepted/replayed operations become synced without client-side business authority.
- Rejected operations become failed and remain visible/retryable where safe.
- Conflict operations remain preserved for user review and are not retried automatically.
- Safe error codes/messages are bounded and do not expose tokens, secrets, storage paths, receipt bytes, proof bytes, OCR internals, or generated-client internals.
- Generated sync repository seams map submit and change-feed calls without hand-editing generated clients.
- App bootstrap wires sync queue dependencies only in authenticated server mode.
- No mobile code computes bill, money, settlement, authorization, or conflict-resolution truth client-side.

## Deferred Manual Acceptance Gates

Owner decision recorded on 2026-06-15 14:22:03 HKT: manual UI testing and manual code review are deferred until Day 1 acceptance and are not marked passed.

Manual Day 1 acceptance should eventually verify:

- Pending archive/restore work is visible and understandable after offline or server-unavailable actions.
- Retry later and needs-review labels are understandable without exposing internal details.
- Conflicts preserve the local pending operation until explicit review.
- Sync state remains visible across app restart.
- No queued operation silently changes money, settlement, authorization, storage privacy, or server authority.

## Stop Conditions

Stop and require human review if M3 work requires any of the following:

- Backend/API behavior changes.
- OpenAPI or generated-client changes.
- Auth/session/security runtime or configuration changes.
- Database schema or migrations.
- Settlement/payment/bill calculation authority changes.
- Storage/file privacy policy changes.
- Docker, deployment, environment, or CI changes.
- Web/admin runtime UI changes.
- Push notification provider, notification delivery, preferences, or background delivery behavior.
- Broad mobile UI outside the sync/offline queue scope.
- Secrets, tokens, credentials, `.env`, `.ssh`, or local Codex state changes.
- Reducing Day 1 scope or replacing architecture direction.

## Recommended Next Slice

`M3-002-SYNC-QUEUE-PROCESSOR-HARDENING-20260615-1509` should harden processor and bill-sync state preservation for queued, syncing, synced, failed, and conflict outcomes without changing backend/API contracts, generated clients, auth/session runtime, schema, money logic, storage privacy policy, deployment, or broad mobile UI.
