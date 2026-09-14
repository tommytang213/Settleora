# Settleora for TrueNAS (unpublished skeleton)

This is an unpublished TrueNAS 25.10 Docker Apps package skeleton. It is
materialized only from a semantically validated
`settleora.day1-release-identity.v1` manifest and uses immutable Linux/amd64
image digests at runtime. It is not a catalog publication, live install,
deployment, backup, restore, or production-readiness claim.

Repository materialization also requires the manifest's expected identity
digest as a detached caller-supplied trust anchor. A manifest cannot replace
its image index/platform relationships merely by recomputing its own digest.

The package exposes only exact-host private HTTPS through Caddy. API HTTP,
PostgreSQL, RabbitMQ AMQP/management, migration, and all storage stay private.
The package contains no web/admin/OCR-worker service, public mode, automatic
certificate management, or destructive-migration option.

The selected TrueNAS certificate must be externally managed and trusted by the
operator's clients, and its SAN must exactly contain the configured private
hostname. The hostname is immutable after installation because it is the
passkey relying-party identity; changing it requires separately planned user
re-enrollment. IP literals are refused because the relying-party identity must
be a DNS name. This repository cannot prove the live certificate trust
relationship.

Before install or upgrade, verify a coordinated backup of PostgreSQL, API local
file storage and its ASP.NET data-protection key ring, RabbitMQ state where
required, and app configuration/secrets.
The API local-storage dataset must already grant runtime UID/GID `999:999`
read, write, and traverse access through its ownership or ACL. The API performs
a randomly named, atomically created write-probe directory before launch and
fails closed without that access; this
five-service package intentionally does not add a privileged permissions
container or change dataset ownership.
The existing Day 1 API dataset remains mounted at `/var/lib/settleora/storage`;
the package persists ASP.NET data-protection state beneath its private
`.settleora-home` directory without relocating existing stored files. Startup
refuses symlinked, non-directory, or canonically escaping persistent HOME,
ASP.NET state, and data-protection key paths, then probes the actual key
directory for UID/GID `999:999` write access. Existing key entries must be
readable regular non-link files.
All three
dataset mappings are immutable after installation. Live TrueNAS lifecycle
renders also resolve each host path through `filesystem.stat` and refuse
symlinked, aliased, non-directory, duplicate, or nested role paths.
PostgreSQL and RabbitMQ initialization credentials and the RabbitMQ node name
are immutable package fields after installation; changing persisted identities
requires a separately reviewed credential/state migration. In `validate-only`
mode, the migration job validates metadata and then runs `check-only`, so a
pending migration still blocks API startup.
Rolling back only an image after a schema or file-interpretation change may not
restore compatibility; matching database and file-storage backups can be
required. Automatic rollback is not promised.

Source and support: <https://github.com/tommytang213/Settleora> and its issue
tracker. The project is licensed under the PolyForm Noncommercial License
1.0.0; commercial use requires separate written permission. The software is
provided without warranty and at the operator's own risk. See the repository
README, LICENSE, deployment runbooks, and security policy for the full posture.
The unmodified TrueNAS Apps template library bundled under `templates/library/`
retains its upstream LGPL-3.0 license; see the adjacent third-party notice and
license copy for its immutable source and content identities.
