# Self-Hosting Exposure Guardrails

## Status

This document is a planning and safety checklist for future Settleora
self-hosted exposure modes. It does not implement a reverse proxy, TLS
automation, public tunnel, production deployment, admin web exposure, API
behavior, Docker/Compose behavior, environment defaults, auth/session policy, or
runtime configuration.

Current Day 1 self-hosting defaults remain LAN-only. Public internet exposure,
admin exposure beyond a trusted boundary, production deployment, and any
reverse-proxy/TLS runtime change are blocked until explicit manual gates pass.

## Current Default

Safe Day 1 default:

- Run the current TrueNAS LAN package only on a trusted LAN or trusted VPN.
- Publish only the API port needed for trusted testing.
- Keep PostgreSQL, RabbitMQ, RabbitMQ management UI, storage datasets, workers,
  migration jobs, and maintenance surfaces private to the app host/network.
- Do not forward router ports to Settleora.
- Do not use public DNS, a public tunnel, or an internet-routable reverse proxy
  for the LAN testing path.
- Treat admin APIs and any future admin web surface as protected even when the
  API is only LAN-exposed.

The current repository does not provide a running web admin portal, web user
portal, reverse proxy, TLS automation, public tunnel configuration, or TrueNAS
catalog exposure form. Future docs may reference those surfaces only after the
runtime exists and the relevant gates pass.

## Exposure Modes

| Mode | Day 1 posture | Requirements before use |
| --- | --- | --- |
| LAN-only testing | Allowed default for trusted household/small-group testing. | API bound only to the needed trusted LAN interface/port; no router port forward; internals private. |
| Trusted VPN/private access | Allowed only after maintainer review of the private network boundary. | VPN users are trusted operators/users; no public direct access; proxy/VPN logs follow redaction rules. |
| Cloudflare Access or equivalent protected admin path | Future manual-gated option for admin and possibly API protection. | Identity-aware access policy reviewed; admin protection evidence captured; no assumption that Cloudflare Access alone makes admin safe for public exposure. |
| Internet-facing/public user access | Blocked by default. | Requires public exposure, production deployment, auth/session/security, storage/privacy, reverse proxy/TLS, logging, rollback, and release gates. |
| Direct public admin access | Not an approved default. | Requires a separate explicit security review and is still expected to remain behind LAN, VPN, Cloudflare Access-style protection, or an equivalent access gate. |

Admin web, admin APIs, user web, and user APIs are separate exposure decisions.
Approving one surface for a network mode does not approve the others.

## Reverse Proxy And TLS Requirements

Future reverse proxy work must define and review these items before it changes
runtime behavior:

- HTTPS termination location, certificate source, renewal ownership, and
  failure mode.
- Whether the API also receives HTTPS directly or only receives private-network
  HTTP from a trusted proxy.
- Exact trusted proxy boundary, including which proxy IPs or networks are
  allowed to supply forwarded headers.
- Forwarded header handling for scheme, host, and client IP. The API must not
  blindly trust client-supplied `X-Forwarded-*` headers from the internet.
- Allowed external hosts and origins for each exposed surface.
- CORS policy, cookie/session behavior, secure-cookie expectations, and any
  mobile self-hosted URL behavior that depends on the external origin.
- Proxy request body limits appropriate for currently implemented upload flows.
- Header, request, idle, and upstream timeouts that do not silently break
  supported API calls.
- Rate/abuse protection posture at the proxy boundary where relevant,
  especially for sign-in, bootstrap, and future password or MFA endpoints.
- Health/readiness routing that does not expose dependency details, secrets,
  storage paths, queue internals, or raw exception output.

WebSocket or SSE proxy handling is not a current runtime requirement because
the current repo docs do not identify an implemented WebSocket/SSE dependency.
If a future feature adds one, the exposure task must document upgrade headers,
timeouts, idle behavior, and auth/session behavior for that protocol.

## Admin Exposure Posture

Admin web defaults to LAN, trusted VPN, Cloudflare Access-style protection, or
an equivalent explicit access gate. It must not be treated as safe for direct
public exposure without a separate security review.

Future admin exposure tasks must prove:

- Which admin surface is exposed: admin web, admin API, operational health,
  logs, backup/restore, migration controls, user management, or policy settings.
- Which protection layer applies before the request reaches Settleora.
- That Settleora application auth/session/admin authorization still applies
  where the runtime surface exists.
- That admin exposure is not being silently bundled with user web/API exposure.
- That public self-registration, invite policy, MFA/passkey policy, storage
  policy, backup/restore controls, and deployment-safe settings stay under
  explicit security review when implemented.

Admin surfaces must not expose secrets, raw environment values, database
connection strings, private storage paths, provider object keys, queue payloads,
raw logs with credentials, or sensitive file contents.

## API Exposure Posture

Server APIs require implemented and reviewed auth, session, authorization, and
abuse controls before any user web or public access path is approved. Generated
client availability or mobile reachability does not imply authorization.

The following are never public:

- PostgreSQL.
- RabbitMQ AMQP.
- RabbitMQ management UI.
- API local file storage datasets or provider object paths.
- Worker internals.
- Migration jobs.
- Backup/restore internals.
- Maintenance shells, admin-only diagnostics, or private app configuration.

File bytes must continue to move through the API storage abstraction and API
authorization checks. API responses must not expose physical storage paths,
provider object keys, or storage internals.

## Allowed Hosts And Origins

Future implementation tasks must state the exact allowed host/origin policy for
the selected exposure mode. At minimum, evidence should separate:

- Internal service names used only inside Compose or the app network.
- LAN host/IP names used by trusted clients.
- VPN-only names.
- Identity-aware proxy names, such as a Cloudflare Access-protected hostname.
- Public user-facing names, if a future manual gate approves them.
- Admin hostnames, which must be reviewed separately from user web/API
  hostnames.

Wildcard hosts/origins, broad `*` CORS, mixed HTTP/HTTPS assumptions, or
environment defaults that silently allow public origins require explicit manual
review.

## Logging And Redaction

Settleora, reverse proxy, tunnel, access gateway, and operator evidence logs
must avoid:

- Secrets, passwords, bearer/session/refresh tokens, API keys, signing keys,
  certificate private keys, SSH material, raw credentials, and raw env values.
- Database connection strings.
- Private storage paths, storage provider internals, object keys, and raw file
  names where sensitive.
- Receipt, proof, QR, OCR, attachment, or user-uploaded file contents.
- Queue payloads and RabbitMQ management details.
- User data, payment details, group names, bill names, financial amounts, and
  sensitive query strings unless explicitly approved and redacted.

Proxy access logs should avoid sensitive query strings and unnecessary user data
where practical. Shared evidence should use placeholders such as
`<redacted-host>`, `<redacted-user>`, `<redacted-token>`,
`<redacted-dataset>`, and `<redacted-file-id>`.

## Manual Gates

Manual approval is required before:

- Public internet exposure.
- Admin web or admin API exposure beyond trusted LAN/private access.
- Production deployment.
- Auth/session/security runtime or policy changes.
- Docker, Compose, environment, proxy, tunnel, or runtime network behavior
  changes.
- Secrets, TLS, signing, certificate, DNS, or identity-provider configuration.
- CI/deployment workflow changes.
- Storage/privacy/file-byte behavior changes.
- Schema/migrations or destructive data operations.
- OpenAPI/generated-client changes.
- Money, settlement, payment, or bill calculation authority changes.
- Backup/restore execution against maintainer, production, or production-like
  data.

Docs-only planning may describe future requirements, but it must not claim a
gate has passed or that behavior has changed.

## Evidence For Future Implementation Tasks

Any future implementation or release task that touches exposure must report:

- Exact exposure mode: LAN-only, trusted VPN/private, Cloudflare
  Access-equivalent protected, public user, admin, or mixed.
- Exact exposed surfaces and hostnames, with admin and user surfaces separated.
- Redacted proxy/TLS/config snippets only.
- Allowed hosts/origins and trusted proxy boundary.
- Health/readiness evidence for exposed and private paths.
- Auth/session/admin-protection evidence where applicable.
- Confirmation PostgreSQL, RabbitMQ, storage, worker internals, migration jobs,
  backup/restore internals, and maintenance surfaces are not public.
- Logging/redaction evidence and confirmation no secrets or private file/storage
  internals were disclosed.
- Rollback or disable path, such as removing DNS, disabling tunnel rules,
  removing router forwards, stopping proxy routes, or returning to LAN-only
  bind rules.
- Exact validation commands and results.
- Scope guard confirming whether Docker/Compose/env/runtime/API/security/schema
  behavior changed.

## Stop Conditions

Stop and escalate before proceeding if:

- A task would expose Settleora to the public internet without an explicit
  public exposure gate.
- A task would expose admin web/admin APIs directly to the public internet
  without a separate security review.
- A proxy task needs to change auth/session/security behavior, CORS, allowed
  hosts, cookie/session policy, TLS trust, or Docker/Compose behavior outside
  the approved scope.
- A health, log, or admin surface reveals secrets, private storage paths,
  provider keys, raw credentials, queue internals, or sensitive user data.
- PostgreSQL, RabbitMQ, storage datasets, worker internals, migration jobs, or
  maintenance surfaces become reachable outside the private host/app network.
- Rollback to LAN-only/private access is not documented.

## Related Deployment Docs

- [TrueNAS LAN Docker testing](TRUENAS_LAN_DOCKER_TESTING.md)
- [Self-hosted install/upgrade orchestration](SELF_HOSTED_INSTALL_UPGRADE_ORCHESTRATION.md)
- [TrueNAS catalog app readiness](TRUENAS_CATALOG_APP_READINESS.md)
- [TrueNAS catalog app packaging plan](TRUENAS_CATALOG_APP_PACKAGING_PLAN.md)
- [TrueNAS backup/restore consistency runbook](TRUENAS_BACKUP_RESTORE_RUNBOOK.md)
- [CI/CD and publishing requirements](../architecture/CI_CD_AND_PUBLISHING_REQUIREMENTS.md)
- [Branching and release strategy](../architecture/BRANCHING_AND_RELEASE_STRATEGY.md)
