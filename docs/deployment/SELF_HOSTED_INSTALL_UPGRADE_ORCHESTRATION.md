# Self-Hosted Install/Upgrade Orchestration

## Status

This document defines the planned operator orchestration for Settleora
self-hosted install and upgrade flows. It is a planning and runbook document
only. It does not implement install automation, upgrade automation, migration
automation, rollback automation, backup automation, restore automation, catalog
packaging, catalog publishing, image publishing, Docker or Compose behavior,
runtime API behavior, schema migrations, production deployment, public
exposure, reverse proxy/TLS configuration, or admin exposure.

Current runnable evidence remains the trusted LAN Docker path in
[TrueNAS LAN Docker testing](TRUENAS_LAN_DOCKER_TESTING.md). Future polished
TrueNAS catalog packaging is planned in
[TrueNAS catalog app packaging plan](TRUENAS_CATALOG_APP_PACKAGING_PLAN.md).
Backup and restore consistency is planned in
[TrueNAS backup/restore consistency runbook](TRUENAS_BACKUP_RESTORE_RUNBOOK.md).
Exposure defaults and public/admin stop conditions are governed by
[Self-hosting exposure guardrails](SELF_HOSTING_EXPOSURE_GUARDRAILS.md).

## Purpose And Boundaries

The goal is to define how a self-hosted operator should reason about first
install, routine upgrade, unsafe migration blocking, failed startup, rollback
limits, health checks, and evidence collection before a future implementation or
catalog task automates any part of the flow.

This plan covers:

- First install flow for the current LAN Docker package and a future catalog
  app.
- Routine upgrade flow using versioned images or source-built artifacts.
- Migration mode selection and safe migration blocking.
- Image tag/update expectations.
- Pre-upgrade backup expectations.
- Failed-start recovery path.
- Rollback limitations after migrations or file interpretation changes.
- Health and readiness checks.
- Operator evidence and redaction rules.
- Private service exposure defaults.
- Stop conditions that require a manual decision.
- Clear separation between current LAN Docker testing, future catalog app work,
  production deployment, public exposure, and runtime implementation.

This plan does not approve:

- Production deployment or production readiness.
- Public internet exposure, reverse proxy/TLS, DNS, public tunnel, CORS,
  trusted-proxy, cookie/session, or allowed-host behavior changes.
- Admin web/API exposure beyond trusted LAN/private access.
- Runtime auth/session/security, storage/privacy/file-byte, OpenAPI/generated
  client, API behavior, OCR, money, settlement, payment, bill-calculation,
  Docker, Compose, CI, schema, migration, backup, restore, or deployment
  behavior changes.
- Catalog publishing, image publishing, or mobile store release actions.

## Current And Future Tracks

| Track | Current status | Orchestration meaning |
| --- | --- | --- |
| LAN Docker package | Current trusted-LAN testing path using `infra/docker-compose.truenas-lan.yml` and `infra/docker-compose.truenas-lan.image.yml`. | Operators can follow documented commands manually. This is not production readiness or catalog publishing. |
| Future catalog app | Planned package with form fields, datasets, image tags, install/upgrade hooks, and warnings. | This document defines desired flow semantics before implementation. |
| Production deployment | Future manual-gated track. | Not approved by this plan. Requires release, security, backup/restore, rollback, exposure, and acceptance evidence. |
| Public/user exposure | Future manual-gated track. | Not approved by this plan. LAN/private defaults remain authoritative. |
| Runtime implementation | Current API and migration runner behavior only. | This plan does not change code, migrations, Docker, or deployment behavior. |

## Private Service Defaults

Self-hosted installs must default to private dependencies:

| Surface | Default posture |
| --- | --- |
| PostgreSQL | Private app-network dependency; do not publish port `5432`. |
| RabbitMQ AMQP | Private app-network dependency; do not publish port `5672`. |
| RabbitMQ management UI | Disabled or private; do not publish port `15672` for normal self-hosted installs. |
| API local storage dataset | Private mounted dataset; do not serve by SMB, NFS, HTTP, or a direct file endpoint for app access. |
| Migration job | Private install/upgrade job or one-shot service; publishes no host ports. |
| API | Trusted LAN/VPN only by default; publish only the configured API port needed by trusted clients. |
| Admin surfaces | LAN, trusted VPN, Cloudflare Access-style protection, or equivalent reviewed access gate only after runtime exists and gates pass. |
| Workers | Private app-network workloads; current OCR worker runtime is placeholder only. |

Publishing the API port for LAN testing does not approve public user access,
admin access, database access, queue access, storage access, TLS/proxy
configuration, or catalog publishing.

## First Install Flow

A safe first install should follow this order:

1. Select the install track: current LAN Docker package or future catalog app.
2. Confirm the environment remains trusted LAN/private access only.
3. Create persistent private datasets for PostgreSQL, RabbitMQ, and API local
   file storage.
4. Create or capture private app configuration through the supported env file
   or future catalog form. Use generated secrets; never use example placeholder
   values for persistent data.
5. Select the image/source version and record the commit SHA, image tag, and
   image digest where available.
6. Select the migration mode. Easy LAN installs may use `managed-auto`;
   stricter operators should use `manual`, `check-only`, `validate-only`, or
   explicit `apply-safe`.
7. Start private dependencies.
8. Run the private migration job before API startup.
9. Start the API only after dependency readiness and migration job success are
   understood.
10. Check `GET /health`, `GET /health/ready`, and
    `GET /api/v1/auth/bootstrap/status`.
11. If bootstrap is required, perform first-owner bootstrap from a trusted LAN
    client using a strong private password.
12. Perform a minimal trusted-client smoke test without creating production
    claims of readiness.
13. Record redacted operator evidence.

The first install flow must stop if the selected path requires public exposure,
admin exposure, unsupported services, direct storage access, manual database
edits, destructive migrations, secrets in logs/reports, or any runtime behavior
change outside an approved task.

## Routine Upgrade Flow

A routine upgrade should be conservative and evidence-driven:

1. Read release notes or task notes for the target Settleora source revision,
   image tag, and known migration or runtime limitations.
2. Record current app version, source commit SHA or image digest/tag, compose or
   catalog package version, migration mode, dataset roles, and private-service
   posture.
3. Confirm no public/admin exposure or unsupported service change is being
   bundled into the upgrade.
4. Take or confirm a pre-upgrade backup consistency set covering PostgreSQL, API
   local file storage, RabbitMQ when queued state must be preserved, and private
   app config/secrets.
5. Stop or quiesce client writes before replacing images or running migrations.
6. Pull or select the target image tag/digest, or build from the intended source
   revision for LAN testing.
7. Run the migration job in the selected mode before API startup.
8. If the migration job succeeds, start or restart the API with the target
   image.
9. Run health, readiness, bootstrap-status, and trusted-client smoke checks.
10. Record redacted post-upgrade evidence and any unresolved limitations.

Routine upgrades must not silently change Docker/Compose files, env defaults,
CI workflows, auth/session/security behavior, storage/file handling, OpenAPI,
generated clients, schema/migrations, API behavior, money/settlement/bill
calculation authority, OCR runtime, or exposure posture.

## Image Tag And Update Flow

Operators should prefer immutable or traceable version references:

- Record the current and target image tags, image digests where available, and
  source commit SHA.
- Avoid relying on `latest` as the only version selector for catalog or
  production-shaped installs.
- Catalog app versions, image tags, release notes, and migration sets should
  map to the same Settleora source revision.
- Branch-preview or commit tags are acceptable only for clearly labeled testing
  installs.
- If a future catalog app offers an update selector, it should show the target
  app version, image tag/digest, migration expectation, backup requirement, and
  rollback warning before the operator proceeds.

This document does not publish images or define a registry workflow. Registry
and release rules remain governed by
[CI/CD and publishing requirements](../architecture/CI_CD_AND_PUBLISHING_REQUIREMENTS.md)
and future release tasks.

## Migration Mode Selection

The current migration runner supports these operator modes:

| Mode | Use when | Upgrade/startup behavior |
| --- | --- | --- |
| `managed-auto` | Easy trusted-LAN install or upgrade where safe migrations may apply automatically. | Applies pending migrations only when the safety policy classifies them as safe; blocks unsafe/destructive operations. |
| `apply-safe` | Operator intentionally wants to apply safe migrations. | Applies pending migrations subject to the same destructive-operation guard. |
| `manual` | Professional hoster wants strict schema control. | Checks pending migrations and exits non-zero if schema is not current; does not apply. |
| `check-only` | Operator wants a non-mutating pending-migration check. | Does not apply migrations and exits non-zero when migrations are pending. |
| `validate-only` | Operator wants dependency and migration metadata validation without pending-migration failure. | Checks PostgreSQL connectivity and EF migration metadata; does not apply. |
| `force-allow-destructive` | Explicitly reviewed destructive change after backup and manual approval. | Dangerous override. Must not be used as a routine install/upgrade path. |

The migration safety policy is a conservative guard, not a replacement for human
review. If a migration is blocked or classified as unsafe, the API must not be
started against an unknown or mismatched schema as if the upgrade succeeded.

## Blocked Unsafe Migration Flow

When the migration job blocks or reports unsafe/destructive operations:

1. Keep the API stopped, or stop it if it has not already been gated by the
   migration job.
2. Keep PostgreSQL, RabbitMQ, and storage private; do not expose internals to
   work around the failure.
3. Preserve migration logs with secrets and private paths redacted.
4. Confirm the pre-upgrade backup consistency set exists and is usable.
5. Record the current image/source version, target image/source version,
   migration mode, and sanitized blocker summary.
6. Escalate to manual migration/deployment review.

Do not proceed by editing database rows, deleting migration history, deleting
file bytes, clearing queues, running `force-allow-destructive`, changing secrets,
changing Docker/Compose behavior, or exposing database/queue/storage services
unless a separate manual-gated recovery plan approves it.

## Failed-Start Recovery Path

If the API or dependency stack fails to start after install or upgrade:

1. Keep the environment LAN/private only.
2. Check private dependency status for PostgreSQL, RabbitMQ, and API local
   storage.
3. Check the migration job result before retrying API startup.
4. Run non-mutating migration status checks where supported, such as
   `check-only` or `validate-only`.
5. Check `GET /health` only after the API process starts.
6. Check `GET /health/ready` only after dependencies are expected to be ready.
7. Capture sanitized logs and service status evidence.
8. Decide whether to fix configuration, return to the previous image without
   schema rollback, or restore from the matching backup set.

Do not loop retries blindly. Stop and escalate when readiness fails because of
schema mismatch, missing storage bytes, missing database state, secret mismatch,
unexpected bootstrap reopening, unsafe migrations, public exposure pressure, or
evidence redaction failures.

## Rollback Limitations

Rollback is limited because database schema, file metadata, file bytes, and
queued work can change together.

Operators must assume:

- Rolling back only the API image may not restore compatibility after schema
  migrations have run.
- Rolling back after a schema or file-interpretation change requires the
  matching PostgreSQL and API local file storage backup.
- Restoring PostgreSQL without matching API storage can leave metadata pointing
  to missing or mismatched bytes.
- Restoring API storage without matching PostgreSQL can orphan file bytes.
- RabbitMQ state can be discarded only when the operator accepts the release's
  specific lost, retried, or duplicated queued-work risk.
- Automatic rollback must not be promised until a tested rollback path exists.

A rollback decision is manual-gated when it would replace, delete, prune,
reinitialize, or roll back datasets; run destructive migrations; change secrets;
or affect maintainer, production, or production-like data.

## Health And Readiness Checks

Install and upgrade validation should use:

```text
GET /health
GET /health/ready
GET /api/v1/auth/bootstrap/status
```

Expected behavior:

- `/health` returns HTTP `200` when the API process is live.
- `/health/ready` returns HTTP `200` only when PostgreSQL, RabbitMQ, and local
  storage readiness pass.
- `/api/v1/auth/bootstrap/status` reports whether first-owner bootstrap is
  still required.
- Health and readiness responses must not expose secrets, connection strings,
  passwords, private dataset paths, storage roots, provider internals, object
  keys, queue internals, raw exception details, tokens, or user data.

Trusted-client smoke checks may confirm sign-in, current-user/session
validation, and bounded read-only access to expected records. Shared evidence
must avoid real user identifiers, payment details, bill names, group names,
financial amounts, file contents, object keys, and private host details unless
explicitly approved and redacted.

## Operator Evidence Requirements

Record install or upgrade evidence in a private operator log and share only the
redacted subset needed for review:

- Install or upgrade timestamp and timezone.
- TrueNAS version when applicable.
- Deployment track: LAN Docker package or future catalog app.
- Source commit SHA, app package version, image tag, and image digest where
  available.
- Migration mode and sanitized migration result.
- Redacted dataset role mapping for PostgreSQL, RabbitMQ, and API storage.
- Confirmation PostgreSQL, RabbitMQ, RabbitMQ management UI, migration jobs,
  workers, and storage datasets are private.
- Backup consistency-set status before upgrade.
- Service status summary.
- `GET /health`, `GET /health/ready`, and bootstrap-status result summaries.
- Trusted-client smoke result where in scope.
- Known rollback limitations and unresolved manual gates.

Public issue comments and Codex reports should include only high-level evidence
and must not contain secrets, raw env values, private dataset paths, private
hostnames, raw logs, tokens, file contents, payment details, user data, or
financial values.

## Redaction Rules

Use placeholders such as `<truenas-lan-ip>`, `<redacted-host>`,
`<redacted-dataset>`, `<redacted-user>`, `<redacted-token>`,
`<redacted-file-id>`, and `<redacted-secret>`.

Do not share:

- Raw `.env` files or real environment values.
- Passwords, tokens, session credentials, refresh credentials, signing keys,
  SSH material, certificate material, API keys, or database connection strings.
- Full private dataset paths, private hostnames, or public network details that
  identify a maintainer host.
- Raw database dumps, SQL rows, queue payloads, migration table contents with
  sensitive context, or RabbitMQ management details.
- Receipt, proof, QR, OCR, attachment, or uploaded file contents.
- Storage provider internals, object keys, physical storage paths, or raw file
  names where sensitive.
- User email addresses, names, group names, bill names, payment details, or
  financial amounts unless explicitly approved and redacted.

## Manual Decision Stop Conditions

Stop and require a manual decision before proceeding if:

- Public internet exposure, public DNS, reverse proxy, TLS, tunnel, CORS,
  allowed-host, trusted-proxy, cookie/session, or external-origin behavior is
  required.
- Admin web/API exposure beyond trusted LAN/private access is required.
- PostgreSQL, RabbitMQ, RabbitMQ management UI, migration jobs, workers, storage
  datasets, backup/restore internals, or maintenance surfaces would become
  reachable outside the private host/app network.
- A backup consistency set is missing before an upgrade that might run
  migrations or alter file interpretation.
- Migration safety blocks the upgrade, reports destructive operations, or
  requires `force-allow-destructive`.
- API image/source version and database migration state do not match.
- Bootstrap unexpectedly reopens for an initialized environment.
- File metadata points to missing bytes, or file bytes exist without matching
  metadata and the operator cannot explain the mismatch.
- Secrets are missing, exposed, unexpectedly rotated, or pasted into evidence.
- Rollback requires replacing, deleting, pruning, reinitializing, or restoring
  maintainer, production, or production-like datasets.
- Any task would change Docker/Compose/env/CI/deployment behavior, runtime
  API/application behavior, OpenAPI/generated clients, schema/migrations,
  auth/session/security, storage/privacy/file-byte behavior, money/settlement/
  payment/bill-calculation authority, OCR runtime, mobile/web/admin UI, secrets,
  or release/publishing behavior outside an approved manual-gated scope.

## Separation From Implementation

Accepting this plan may close a planning gap for install/upgrade orchestration.
It must not be treated as completing:

- A production deployment guide.
- TrueNAS catalog app implementation or publishing.
- Backup, restore, rollback, install, or upgrade automation.
- Image publishing or release automation.
- Public user exposure or admin exposure.
- Runtime migration behavior beyond the current documented runner.
- Maintainer TrueNAS install/upgrade evidence.
- Day 1 acceptance, release readiness, or production readiness.

Future implementation issues should be split narrowly across catalog form/hooks,
image publishing, backup-before-upgrade enforcement, rollback evidence,
failure-surfacing UI, maintainer-run install evidence, and exposure review.
