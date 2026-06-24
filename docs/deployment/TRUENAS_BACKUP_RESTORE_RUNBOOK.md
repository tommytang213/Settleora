# TrueNAS Backup/Restore Consistency Runbook

## Status

This runbook defines the deployment-level backup and restore consistency plan for the current Day 1 TrueNAS LAN Docker posture. It is operator guidance and evidence structure only. Future catalog app metadata, form fields, dataset mappings, image tags, upgrade/rollback notes, and operator stop conditions are planned in [TrueNAS catalog app packaging plan](TRUENAS_CATALOG_APP_PACKAGING_PLAN.md). Public, reverse-proxy/TLS, trusted private access, and admin exposure requirements are defined separately in [Self-hosting exposure guardrails](SELF_HOSTING_EXPOSURE_GUARDRAILS.md).

It does not implement backup automation, execute a backup, execute a restore, mutate TrueNAS datasets, change Docker/Compose behavior, change runtime configuration, or approve production or public exposure. Any real restore against maintainer or production-like data requires a manual deployment/storage/privacy gate before execution.

This runbook is separate from product-level import, export, and local backup work such as #454, #456, and #467. Those issues concern application/user-facing data portability, local-mode backup UX, admin backup surfaces, or product restore behavior. This document covers deployment consistency for the self-hosted TrueNAS stack.

## Current Deployment Shape

The current LAN deployment path is documented in [TrueNAS LAN Docker testing](TRUENAS_LAN_DOCKER_TESTING.md) and uses these services:

| Service | Role | Persistent state |
| --- | --- | --- |
| `postgres` | API-owned PostgreSQL database. | Required. Mounted from `SETTLEORA_POSTGRES_HOST_PATH` to `/var/lib/postgresql/data`. |
| `rabbitmq` | Queue foundation for async jobs and future workers. | Required for preserving queued work and RabbitMQ definitions/state. Mounted from `SETTLEORA_RABBITMQ_HOST_PATH` to `/var/lib/rabbitmq`. |
| `api` | ASP.NET Core API and storage abstraction owner. | Required API local file bytes. Mounted from `SETTLEORA_API_STORAGE_HOST_PATH` to `SETTLEORA_STORAGE_ROOT`, default `/var/lib/settleora/storage`. |
| `migrate` | One-shot EF Core migration runner using the API image. | No separate persistent dataset. Migration metadata is stored in PostgreSQL. |

The LAN package publishes only the API port by default. PostgreSQL, RabbitMQ, and API local file storage remain private to the app host/network and must not be exposed directly for app access.

## Consistency Set

Back up or snapshot the following as one consistency set whenever preserving an environment:

| Item | Source of truth | Include in same backup set | Notes |
| --- | --- | --- | --- |
| PostgreSQL data | `SETTLEORA_POSTGRES_HOST_PATH` | Yes, always. | Contains API-owned business records, auth/session rows, file metadata, audit metadata, and EF migration metadata. |
| API local file storage | `SETTLEORA_API_STORAGE_HOST_PATH` | Yes, always. | Contains sensitive file bytes such as receipts, supporting attachments, settlement proofs, and QR files. PostgreSQL metadata must match these bytes. |
| RabbitMQ data | `SETTLEORA_RABBITMQ_HOST_PATH` | Yes for whole-environment restore. | Preserves queued work, broker state, and future worker job continuity. If intentionally discarded, document the reason and expected lost/retried work. |
| Private environment/config file | Private copy of `infra/env/.env.truenas-lan` or equivalent TrueNAS app settings | Yes, securely. | Required to reconnect restored services. Contains secrets and must never be committed, pasted into issue comments, or shown unredacted in screenshots. |
| API image or commit reference | Image tag/digest or repo commit SHA | Record with backup evidence. | Needed to know which runtime and migration set created the data. Prefer immutable image digests or exact commit SHAs in operator notes. |
| Compose/app package version | `infra/docker-compose.truenas-lan.yml`, `infra/docker-compose.truenas-lan.image.yml`, or future catalog app version | Record with backup evidence. | Needed to reconstruct service wiring and mount paths. |

PostgreSQL and API local file storage must be treated as coupled. Restoring a database snapshot without the matching file-storage snapshot can leave file metadata pointing at missing or mismatched bytes. Restoring file bytes without the matching database can leave orphaned bytes or unavailable attachments.

RabbitMQ is part of the environment consistency set because the API currently checks RabbitMQ readiness and future workers depend on queue state. If the operator chooses a database-plus-files-only restore, the report must explicitly state that RabbitMQ state was not restored and queued or in-flight work may be lost, duplicated, or retried depending on future worker behavior.

## Snapshot And Backup Planning

For a TrueNAS dataset layout, prefer separate child datasets under one app parent so they can be snapshotted with a common timestamp or coordinated recursively:

```text
/mnt/POOL/apps/settleora/
  postgres/
  rabbitmq/
  storage/
```

The exact pool and dataset names are operator-specific and must be redacted in shared reports unless the maintainer explicitly approves disclosure. Do not put real dataset paths, credentials, or private file names into public issue comments.

Minimum backup metadata to record privately:

- Backup timestamp and timezone.
- TrueNAS version, expected Day 1 target `25.10.1` when applicable.
- Settleora commit SHA or API image digest/tag.
- Compose file or app package version used.
- Redacted dataset mapping for PostgreSQL, RabbitMQ, and API local storage.
- Migration mode configured for the environment.
- Whether services were quiesced, and which service states were observed.
- Whether PostgreSQL, RabbitMQ, and storage snapshots share a coordinated timestamp.
- Where encrypted/private operator evidence is stored.

Do not include raw secrets, raw env files, database dumps, receipt/proof/QR bytes, object keys, direct storage internals, access tokens, passwords, or raw user data in public task reports.

## Service Quiescing For Backup

The safest current Day 1 LAN backup posture is an offline or quiesced snapshot. The current repo does not provide online backup orchestration, database dump automation, queue draining, or application-level backup locks.

Recommended planning order for a quiesced snapshot:

1. Enter a manual maintenance window and stop client writes.
2. Record the current API image/tag or commit SHA and compose/app package version.
3. Stop or pause the API first so no new business writes or file writes begin.
4. Ensure the `migrate` service is not running. Do not start a migration during backup.
5. Stop any future workers before PostgreSQL, RabbitMQ, or storage snapshots. The current repo has no running OCR worker container in the TrueNAS LAN package.
6. Stop RabbitMQ after publishers/consumers are stopped if preserving queue state exactly.
7. Stop PostgreSQL last for a fully offline filesystem snapshot, or use a PostgreSQL-native backup method in a future manually reviewed backup procedure.
8. Snapshot or back up PostgreSQL data, RabbitMQ data, and API local file storage as one consistency set.
9. Restart PostgreSQL, RabbitMQ, the migration service according to the existing LAN package behavior, and then API.
10. Run validation checks after services return.

Do not run `docker compose down -v` for maintainer data. Do not delete, prune, reinitialize, or overwrite datasets as part of backup collection.

If a future operator uses online TrueNAS snapshots while services are running, that choice needs a separate manual storage/database review. A crash-consistent filesystem snapshot is not the same as a validated PostgreSQL backup, and it is not enough to claim restore readiness until a restore test passes.

## Restore Planning And Ordering

Real restore execution is manual-gated. The steps below are planning requirements for a reviewed restore, not permission to run them against maintainer data.

Before restore:

- Confirm the target environment is intentionally disposable or approved for restore.
- Confirm the backup set contains matching PostgreSQL, API storage, and RabbitMQ data, or document any intentionally omitted RabbitMQ state.
- Confirm the exact API image/commit and compose/app package expected by the backup.
- Confirm secrets and private env/app settings are available through a secure operator channel.
- Confirm no clients are writing to the target environment.
- Preserve current target-state evidence before overwriting anything, if the target contains any maintainer data.

Restore ordering for a fully stopped target:

1. Stop API and future workers first.
2. Ensure `migrate` is not running and no migration job is queued.
3. Stop RabbitMQ.
4. Stop PostgreSQL.
5. Restore PostgreSQL data to the target PostgreSQL dataset.
6. Restore API local file storage to the target storage dataset.
7. Restore RabbitMQ data if the backup set includes it and queued work must be preserved.
8. Restore private env/app settings through the operator's secure mechanism without committing or exposing them.
9. Start PostgreSQL and RabbitMQ.
10. Run the migration service in a non-mutating status mode first, such as `check-only` or `validate-only`, when supported by the existing deployment package.
11. If pending migrations exist, stop and escalate to migration/backup review. Do not silently apply schema changes as part of restore validation.
12. Start API only after dependency health and migration state are understood.

Production API startup must not be described or treated as silently applying migrations. The TrueNAS LAN package uses a separate `migrate` service, defaulting to `managed-auto`, before API startup. For restore validation, prefer non-mutating migration checks first so the operator can distinguish "restored data is valid for this runtime" from "restore plus upgrade changed the database."

## Restore Validation

Validation should prove the restored deployment is internally consistent without exposing private data.

Required checks:

1. Confirm service state shows `postgres`, `rabbitmq`, and `api` running after the restore plan completes.
2. Check migration metadata with the repo-supported migration command in a non-mutating mode before any apply mode:

   ```bash
   cd /workspace/repos/Settleora
   docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan run --rm migrate migrate-database --mode=check-only
   ```

   A clean/current schema result is acceptable. Pending migrations, missing migration history, destructive migration warnings, or connection failures require manual review before proceeding.

3. Check API liveness:

   ```bash
   curl -i http://<truenas-lan-ip>:8080/health
   ```

   Expected result: HTTP `200` with no secrets, connection strings, dataset paths, or raw exception details.

4. Check dependency readiness:

   ```bash
   curl -i http://<truenas-lan-ip>:8080/health/ready
   ```

   Expected result: HTTP `200` only when PostgreSQL, RabbitMQ, and local storage readiness pass. The response must not expose connection strings, storage roots, provider internals, credentials, queue names, or raw exception details.

5. Check bootstrap status:

   ```bash
   curl -i http://<truenas-lan-ip>:8080/api/v1/auth/bootstrap/status
   ```

   Expected result: status matches the restored environment. For an environment that already had an owner, bootstrap should not unexpectedly reopen.

6. Perform safe application smoke checks from a trusted LAN client:
   - Sign in with a test or maintainer-approved account using redacted evidence.
   - Confirm current-user/session validation succeeds.
   - Read a small set of expected records without creating, editing, settling, paying, uploading, deleting, archiving, restoring, or applying OCR/revision changes.
   - If allowed by the reviewer, open attachment/proof metadata and verify one non-sensitive known file can be retrieved through the API, not through direct dataset access. Do not paste file bytes or private filenames into public evidence.
   - Confirm mobile server-mode can reach the restored API URL if iPhone TestFlight smoke evidence is in scope.

If any validation step fails, keep the environment stopped or LAN-restricted and record the failure with redacted logs. Do not "fix" restore failures by manually editing database rows, deleting file bytes, clearing queues, applying destructive migrations, or changing secrets unless a separate manual-gated recovery plan approves the action.

## Evidence And Redaction Rules

Operator reports and screenshots may include:

- Redacted service names and high-level status.
- Redacted dataset role names, such as `postgres dataset`, `rabbitmq dataset`, and `api storage dataset`.
- Commit SHA, image digest/tag, compose file name, and TrueNAS version.
- HTTP status codes and sanitized health/readiness bodies.
- Migration command mode and sanitized result summary.
- Counts or presence checks when they do not identify private users, groups, bills, files, payments, or receipts.

Operator reports and screenshots must not include:

- Raw `.env` files or real env values.
- Passwords, tokens, session credentials, refresh credentials, signing keys, SSH material, API keys, or database connection strings.
- Full private dataset paths when those paths reveal private names or infrastructure details.
- Raw database dumps, SQL rows, or migration table contents with sensitive context.
- Receipt, proof, QR, OCR, attachment, or user-uploaded file contents.
- Storage provider internals, object keys, direct file paths, or physical storage paths where sensitive.
- User email addresses, names, group names, bill names, payment details, or financial amounts unless explicitly approved and redacted.
- RabbitMQ credentials, queue payloads, or management UI details.
- Public network details that would help expose a private maintainer host.

Use placeholders such as `<truenas-lan-ip>`, `<redacted-dataset>`, `<redacted-user>`, `<redacted-token>`, and `<redacted-file-id>` in shared evidence.

## Manual Gates And Stop Conditions

Manual approval is required before:

- Executing any real restore against maintainer, production, or production-like data.
- Replacing, deleting, pruning, reinitializing, or rolling back datasets.
- Running destructive or `force-allow-destructive` migrations.
- Treating a backup as sufficient for production readiness.
- Exposing the API beyond trusted LAN/VPN.
- Publishing PostgreSQL, RabbitMQ, RabbitMQ management UI, or API storage datasets.
- Changing secrets, auth/session policy, storage/privacy policy, Docker/Compose behavior, CI/deployment automation, schema/migrations, OpenAPI/generated clients, runtime behavior, money/settlement/payment/bill calculation authority, OCR runtime, or mobile/web/admin UI behavior.

Stop and escalate if:

- PostgreSQL and API storage snapshots are not from the same consistency window.
- The restored API reports missing storage, missing database state, or readiness failure.
- Migration metadata does not match the intended runtime.
- Bootstrap unexpectedly reopens for a previously initialized environment.
- Secrets are missing, rotated unintentionally, or exposed in logs/screenshots.
- File metadata points to missing bytes, or file bytes exist without matching metadata and the operator cannot explain the mismatch.
- RabbitMQ state is missing when the restore objective required preserving queued work.

## Remaining Follow-Ups

This runbook does not complete TrueNAS backup/restore readiness by itself. Remaining work includes:

- Maintainer-run restore evidence on an approved TrueNAS environment.
- Backup automation or catalog-app backup hooks, if later scoped and manually gated.
- Backup-before-upgrade enforcement for the future catalog app.
- Rollback strategy after migrations have changed schema.
- Public/admin exposure review before any internet-routable deployment.
- Product-level import/export/local backup and admin backup surfaces tracked separately from this deployment runbook.
