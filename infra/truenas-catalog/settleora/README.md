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
hostname. This repository cannot prove that live trust relationship.

Before install or upgrade, verify a coordinated backup of PostgreSQL, API local
file storage, RabbitMQ state where required, and app configuration/secrets.
Rolling back only an image after a schema or file-interpretation change may not
restore compatibility; matching database and file-storage backups can be
required. Automatic rollback is not promised.

Source and support: <https://github.com/tommytang213/Settleora> and its issue
tracker. The project is licensed under the PolyForm Noncommercial License
1.0.0; commercial use requires separate written permission. The software is
provided without warranty and at the operator's own risk. See the repository
README, LICENSE, deployment runbooks, and security policy for the full posture.
