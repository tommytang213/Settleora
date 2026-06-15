# Current Milestone

- ID: `M3`
- Name: `Day 1 Mobile Sync + Offline Queue Foundation`
- Target branch: `ai/integration`
- Previous milestone ID: `M2`

## Goal

Advance the next Day 1 blocker after M2 mobile navigation polish by making the existing mobile sync/offline queue foundation concrete, visible, and testable without changing backend authority, OpenAPI contracts, generated clients, schema, money calculation, storage privacy policy, deployment, or auth/session runtime.

Repo-state basis for this milestone:

- `README.md` says the app already has a mobile sync queue foundation and generated sync repository seams, but full offline cache hydration and broader offline support remain future work.
- `PROGRAM_ARCHITECTURE.md` requires queued, synced, conflict, and failed sync states while keeping server-mode sync acceptance and business truth API-authoritative.
- `docs/prd/MVP_DAY1_SCOPE.md` requires local offline queues, explicit sync states, and conflict preservation for Day 1.
- `apps/mobile/lib/sync/` already contains bounded queue, generated repository, and processor primitives, making mobile sync/offline queue hardening a coherent next bundle.

## Allowed Scope For Future M3 Tasks

- Mobile sync/offline queue code in `apps/mobile/lib/sync/`.
- Existing mobile bootstrap wiring for the sync queue in `apps/mobile/lib/app/app_bootstrap.dart`.
- Existing mobile bill sync bridge code in `apps/mobile/lib/bills/bill_sync_controller.dart`.
- Focused mobile tests for sync queue, sync processor, app bootstrap wiring, and existing bill sync bridge behavior.
- M3 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M3 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Settlement/payment/bill calculation logic.
- Storage/file privacy policy.
- Docker/deployment/env/CI config.
- Production secrets.
- Web/admin runtime UI.
- Push notification provider, notification delivery, notification preferences, offline sync protocol expansion beyond the queued M3 scope, or local storage policy changes.
- New broad mobile product UI outside the selected sync/offline queue surfaces.

## Done Criteria

- Current mobile sync/offline queue behavior is reconciled against Day 1 architecture and captured in a QA map.
- Existing queued bill archive/restore behavior has clear, bounded sync state handling, retry/error visibility, and conflict/failed preservation in tests.
- Server-mode change-feed hydration seams are validated without making mobile authoritative for server-mode business truth.
- M3 QA records automated validation and keeps deferred M2 manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.

## Current Task Pointer

- Completed task: `M3-004-SYNC-OFFLINE-QA-FINALIZE-20260615-1509`
- Next queued task: none. `STOP-M3-001` remains as the controller stop sentinel for broad sync/API/auth/schema/storage/money/deployment or unrelated major-domain scope.
