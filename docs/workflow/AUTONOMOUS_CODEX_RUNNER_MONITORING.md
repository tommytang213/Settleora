# Autonomous Codex Runner Monitoring

## Project-bound monitoring identity

Health, notifier, status, supervisor, session, recovery, budget, effect, and
report records are scoped to the explicit `projectId`, `repositorySlug`,
canonical `repoRoot`, and state namespace. Monitoring reads controller code
from `runtimeRoot` and project evidence from `logsRoot`; colliding run/task IDs
from another project are not adoption authority. Shared runtime files are
read-only inputs and do not create a cross-project mutation lock.

References below to `/workspace/logs/settleora-auto-runner` are retained
historical/development examples. Accepted live Settleora monitoring reads
`/workspace/logs/auto-runner/Settleora`.

## Status

This document is the authoritative Settleora auto-runner monitoring design.
It supersedes the earlier provisional SSH-primary TrueNAS direction. The
project-bound loopback health service and terminal notifier timer were
installed and accepted under #912. Uptime Kuma/TrueNAS deployment, LAN/public
exposure, and selection or mutation of notification credentials remain outside
that acceptance.

Repository implementation foundation now exists for the repo-only portion:

- `tools/auto-runner/settleora-auto-runner-health-service.mjs` starts a
  separate read-only Node HTTP process.
- `tools/auto-runner/lib/health-service.mjs` evaluates persisted
  supervisor/runner health using bounded trusted state reads, existing
  heartbeat constants, existing lifecycle state sets, strict report-correlation
  status, and runner lock semantics without deleting locks.
- `tools/auto-runner/lib/notifier-dedupe-state.mjs` provides a future notifier
  dedupe-state writer keyed by immutable supervisor run ID plus terminal event
  kind. The health endpoint does not call it.
- `tools/auto-runner/settleora-auto-runner-terminal-notifier.mjs` provides a
  separate one-shot terminal notifier entry point for healthy terminal
  activity summaries.
- `tools/auto-runner/lib/ntfy-terminal-notifier.mjs` implements the
  provider-specific ntfy publisher behind a fixed external config boundary and
  local confirmed-delivery dedupe.
- `tools/auto-runner/systemd/settleora-auto-runner-health.service` is the
  reviewed source for the installed project-bound unit. The live service
  remains bound to `127.0.0.1:8787` and is not connected to Uptime Kuma.
- `tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.service`
  and `.timer` are the reviewed sources for the installed one-shot notifier and
  enabled timer. They use the existing owner-only external provider
  configuration; #912 did not create or rotate credentials.

Approved architecture:

```text
Uptime Kuma on TrueNAS
  -> publishes failure/recovery notifications

DevBox terminal notifier
  -> publishes successful completion/no-work notifications

Both -> self-hosted ntfy on TrueNAS -> ntfy iPhone app
```

SSH remains useful for operator diagnostics and manual wrapper readback, but it
is no longer the primary monitoring architecture.

## Verified Tool Context

Access date: 2026-07-12.

Official sources checked:

- Uptime Kuma latest upstream release: `2.4.0`, published 2026-05-31.
- Uptime Kuma upstream source confirms HTTP monitor fields for method, request
  headers, accepted status codes, interval, retry interval, max retries, resend
  interval, Basic auth, Bearer token, and OAuth2 client credentials.
- Uptime Kuma upstream source documents status values `DOWN`, `UP`,
  `PENDING`, and `MAINTENANCE`, and notification transitions for `UP -> DOWN`,
  `PENDING -> DOWN`, and `DOWN -> UP`. It also describes retries as the maximum
  retries before the service is marked down and a notification is sent.
- Uptime Kuma upstream wiki marks the internal API as unsupported for
  third-party integrations and subject to breaking changes.
- TrueNAS Apps Market lists Uptime Kuma in the community train. The catalog
  page says community app support, maintenance, and documentation are handled
  by the TrueNAS community and that the market hosts but does not validate or
  maintain linked resources.
- TrueNAS official app catalog metadata lists community Uptime Kuma app
  version `1.2.11`, app version `2.4.0`, minimum SCALE version `24.10.2.2`,
  default WebUI port `31050`, host IP binding configuration, and source links
  to the TrueNAS app page plus upstream Uptime Kuma.
- ntfy upstream docs support title, priority, tags, Bearer-token publishing,
  and custom sequence IDs for updating/replacing client notifications.
- ntfy self-hosted iOS instant notification support requires the documented
  upstream poll-request setting, currently `upstream-base-url:
  "https://ntfy.sh"` for self-hosted servers.
- ntfy private deployments should use authentication/access control and
  private topics instead of relying on guessable topic names.
- TrueNAS Apps Market listed the community ntfy app at upstream app version
  `v2.26.0`, last updated 2026-07-10.

Current official Uptime Kuma sources did not show a supported generic API for
emitting arbitrary one-shot informational events. The design therefore splits
availability/failure/recovery monitoring from healthy-terminal summary
notifications and does not depend on Uptime Kuma private APIs.

## Runner Boundary

The existing auto-runner and detached supervisor are bounded mutation jobs.
They exit after success, no eligible work, budget exhaustion, failure,
cancellation, or another terminal condition. They intentionally remain
`Restart=no`; failed, incomplete, killed, reboot-interrupted, or ambiguous
mutation runs require operator review.

The installed health service is separate. It remains callable after a runner
exits and uses `Restart=on-failure` because it is read-only and has no runner,
GitHub, branch, lock-removal, resume, retry, or merge authority.

The service reads only bounded owner-only persisted state:

- supervisor state and heartbeat files;
- strict supervisor/runner report-correlation results;
- sanitized runner summaries and counts already present in trusted summaries;
- runner active/lock readback;
- persisted deployment and runtime identity recorded under the project logs
  root. Operators inspect systemd unit state separately with `systemctl --user`;
  the HTTP endpoint does not call systemd.

Uptime Kuma must not poll GitHub for eligible issues on every health check. No
eligible work is a successful terminal result, not an outage. Idle does not
become unhealthy merely because time passes when no run was scheduled. A dead
or unreachable DevBox is detected because Uptime Kuma cannot reach the endpoint.

## Endpoint Contract

The repository foundation exposes one narrow route:

```text
GET /health/auto-runner
```

The response is sanitized JSON only. Suggested contract:

```json
{
  "schemaVersion": 1,
  "status": "healthy",
  "mode": "idle",
  "reasonCode": "terminal_success",
  "supervisor": {
    "latestRunId": "supervised-YYYYMMDDTHHMMSSZ-xxxxxxxxxxxx",
    "state": "completed",
    "terminalOutcome": "completed",
    "terminalReason": "child_exit_mapped",
    "startedAt": "2026-07-12T00:00:00.000Z",
    "finishedAt": "2026-07-12T00:05:00.000Z"
  },
  "runner": {
    "latestRunId": "run-YYYY-MM-DDTHHMMSSZ",
    "active": false,
    "lockPresent": false,
    "lockOrphaned": false
  },
  "heartbeat": {
    "lastAt": "2026-07-12T00:05:00.000Z",
    "ageSeconds": null,
    "heartbeatIntervalSeconds": 60,
    "heartbeatLeaseSeconds": 300
  },
  "reportResolution": {
    "status": "matched"
  },
  "summary": {
    "tasksProcessed": 1,
    "prsOpened": 1,
    "prsMerged": 1,
    "failedCount": 0,
    "blockedCount": 0,
    "latestMainSha": "0000000000000000000000000000000000000000"
  }
}
```

Fields may be omitted or `null` when not safely available. The service should
use one bounded machine-readable `reasonCode`; examples include
`initializing`, `active_fresh`, `terminal_success`, `no_eligible_work`,
`budget_exhausted_success`, `cancelled_attention`, `stale_heartbeat`,
`terminal_failed`, `terminal_blocked`, `terminal_partial`,
`report_mapping_missing`, `report_mapping_ambiguous`, `orphaned_lock`,
`runner_disappeared`, `malformed_state`, and `untrusted_state`.

Do not expose filesystem paths, config paths or contents, secrets, tokens,
credentials, environment values, webhook URLs, authorization headers, raw logs,
model output, prompts, issue bodies, diffs, receipt/OCR/user data, provider
payloads, arbitrary command output, mutation routes, control routes, or raw
systemd journal output.

## HTTP Behavior

Return HTTP `200` for:

- service initialization with no run history when the state root is readable
  and no active runner/lock inconsistency exists;
- active supervisor/runner with a fresh heartbeat;
- healthy idle after successful terminal completion;
- `completed` with `stopReason=no-eligible-work`;
- normal successful budget exhaustion or another explicitly successful stop
  reason;
- unchanged completed/idle state, indefinitely.

Return HTTP `200` with `mode=attention` for operator-requested cancellation
when available evidence shows a bounded operator stop and no failure or
inconsistency. Do not silently classify cancellation as a system failure, but
also do not call it ordinary success.

Return HTTP `503` for:

- stale active heartbeat;
- `failed`, `submission_failed`, `blocked`, or `partial` terminal state that
  requires action;
- missing or ambiguous required report mapping;
- orphaned lock after the grace period;
- runner disappearance while supervisor state remains active;
- malformed, symlinked, group/world-writable, out-of-root, or otherwise
  untrusted state;
- corrupt, schema-invalid, symlinked, group/world-writable, or otherwise
  untrusted canonical outage resubmission state under
  `recovery/outage-resubmission/`; the outage inventory is surfaced as
  operator-action-required with total, valid, and invalid record counts instead
  of being treated as zero records;
- unreadable required state where fail-closed behavior is safer;
- any other fail-closed inconsistency.

The implementation must reconcile freshness with current supervisor constants:
heartbeats are written every 60 seconds and carry a five-minute lease. A
heartbeat is stale only while non-terminal and after the lease expires.
Terminal heartbeat age alone must not make an unchanged completed/idle run
unhealthy.

Lock orphan detection should use the existing runner lock semantics. A matching
live PID and process-birth identity blocks. Repository authority recovery is
serialized by its owner-only OS lock and may replace only trusted authority
state whose recorded owner is proven stale; PID reuse is not treated as the
original owner. Unparsable, partial, symlinked, foreign-owned, writable, or
otherwise ambiguous state requires inspection and fails closed. The health
service must never delete locks.

## Health Service Boundary

Repository implementation constraints:

- separate systemd user unit, tentatively
  `settleora-auto-runner-health.service`;
- `Restart=on-failure` permitted only for this read-only monitor service;
- existing mutation supervisor remains `Restart=no`;
- run as the current non-root DevBox user;
- owner-only runtime state and logs;
- no shell-command endpoint;
- no arbitrary run-ID path traversal;
- no runner controls, GitHub credentials, branch mutation, label mutation,
  PR mutation, merge authority, resume/retry authority, or write authority to
  repo/GitHub/supervisor state;
- bind to loopback by default in repository examples;
- non-loopback LAN binding requires explicit deployment configuration, exact
  trusted interface/host review, and no public exposure;
- no hard-coded maintainer username, IP address, TrueNAS host, token, webhook,
  or secret in the repo;
- config and secrets remain under the approved external logs/secrets boundary
  with restrictive permissions;
- rollback is stopping/disabling the health unit and removing the Uptime Kuma
  monitor without changing runner state.

Outage resubmission observability reuses local sanitized state and events. The
controller may record local owner-only events for prolonged outage detection,
resubmission planned/deferred, circuit open, half-open probe, child submission
confirmed, recovery succeeded, attempts or wall-clock exhausted, terminal
nonretryable block, operator pause/stop, and uncertain submission
reconciliation. The event schema remains bounded JSONL under the supervisor
run directory; raw provider bodies, prompts, source snippets, arbitrary paths,
webhook URLs, tokens, secrets, and full diffs are not stored.

The health endpoint remains read-only. It exposes only a bounded
`outageResubmission` summary: enabled/default-off posture, active source run,
attempt count/budget, next eligible time, deadline, circuit state, last
sanitized reason, child run ID, terminal outcome, record count, inventory read
status, operator-action requirement, valid record count, and invalid/untrusted
record count. Terminal `recovered`, `exhausted`, and `blocked` outage markers
are not reported as active source runs. Invalid canonical outage state
suppresses trustworthy active-source readout and returns HTTP 503 with bounded
`malformed_state` or `untrusted_state` taxonomy; it never emits raw JSON, parse
text, provider payloads, secrets, arbitrary filesystem paths, or file
contents. Reading health never plans, submits, retries, pauses, resumes,
relabels, comments, branches, merges, deletes locks, repairs state, or writes
notifier dedupe state.

The terminal notifier remains a separate one-shot activity notifier. Outage
notifications are local sanitized intent until an existing notifier path later
confirms provider delivery; the controller itself does not call webhook URLs
or create notification credentials. Dedupe is by immutable run/terminal event
identity, so prolonged-outage, recovery, exhaustion, and terminal-block
messages are sent at most once after confirmed delivery.

The 2026-07-12 #880 deployment attempt for task `20260712-1609` installed the
repository health and terminal-notifier templates, then rolled back after both
Node-based units crashed under systemd before the health listener or ntfy
publication could run. The failure was traced to `MemoryDenyWriteExecute=yes`:
V8 needs runtime executable-memory permission transitions for normal Node
execution. The Node health and notifier service templates therefore
intentionally omit that directive as a focused runtime compatibility exception.
The least-privilege boundary still keeps `NoNewPrivileges=yes`,
`PrivateTmp=yes`, `ProtectSystem=strict`, `ProtectHome=read-only`, fixed
read-only/read-write path allowlists, `RestrictSUIDSGID=yes`,
`LockPersonality=yes`, `UMask=0077`, fixed Node entry points, and loopback
health binding by default.

The service default bind is `127.0.0.1:8787`. Non-loopback binding is rejected
unless explicit deployment configuration opts in and supplies an external
request-secret file under
`/workspace/logs/auto-runner/Settleora/secrets/`.
The secret is checked as a static request header and is never printed by the
service. No repository code creates a live secret, selects a notification
provider, or configures a Uptime Kuma monitor.

For the initial trusted-LAN deployment, network restriction is necessary but
not sufficient when non-loopback binding is enabled. Uptime Kuma supports
documented HTTP auth/header capabilities in the monitor UI/source, so the
deployment task should require either loopback-only access through an approved
local/private path or a manually configured monitor secret such as a custom
header or Bearer token. Credentials must remain deployment-only and must not be
committed, printed in reports, or enabled by default.

## Uptime Kuma Incident Monitoring

Recommended future Uptime Kuma monitor settings, subject to final UI readback
in the deployment task:

- monitor type: HTTP(s);
- method: `GET`;
- URL: trusted-LAN URL for `/health/auto-runner`;
- accepted status: `200-299`;
- interval: about 60 seconds;
- max retries: 3, or equivalent bounded retry policy;
- retry interval: about 60 seconds;
- resend notification if down: set to approximate 60-minute reminders, or
  disabled if the operator wants one initial incident and one recovery only;
- notification providers: manually chosen and manually configured;
- no public status page unless separately approved.

Expected behavior:

- one initial unhealthy notification per incident after retries are exhausted;
- bounded optional reminders while still down;
- one recovery notification on `DOWN -> UP`;
- unchanged healthy idle remains silent.

Do not abuse false `DOWN`/`UP` transitions to manufacture completion alerts.

## Terminal Completion Notification

Healthy terminal-run summaries are a different concern from availability
incidents. The required behavior is one informational notification when a new
run reaches a healthy terminal state, including `no-eligible-work`, and no
repeat notifications while the same completed run remains idle.

Because no supported Uptime Kuma generic event API was verified, the design is:

- Uptime Kuma handles availability, failure incidents, bounded reminders, and
  recovery.
- A separate narrow ntfy notifier handles one-time healthy-terminal summaries
  to a private activity topic.
- Uptime Kuma should publish DOWN/reminder/recovery incidents to a separate
  private critical topic.
- Live ntfy server URL, topic names, and tokens are manual deployment
  decisions and remain external/redacted.
- No live notifier destination is enabled by default.

Deduplication key:

```text
<immutable-supervisor-run-id>:<terminal-event-kind>
```

Notifier state is persisted atomically outside the repo:

```text
/workspace/logs/auto-runner/Settleora/monitoring/notifier-state.json
```

The repository foundation performs owner-only atomic writes, rejects malformed,
symlinked, out-of-root, group/world-accessible, oversized, and schema-invalid
state, and keeps a bounded deterministic entry set. Health `GET` requests do
not mark or claim terminal events.

Production ntfy configuration is read only from:

```text
/workspace/logs/auto-runner/Settleora/secrets/ntfy-notifier.json
```

The file must be a regular non-symlink owner-only file under the approved
secrets root. The schema is strict and bounded:

```json
{
  "schemaVersion": 1,
  "baseUrl": "http://redacted-trusted-host:port",
  "activityTopic": "redacted-private-topic",
  "accessToken": "redacted"
}
```

The production CLI does not accept `--base-url`, `--topic`, `--token`,
`--config-path`, arbitrary shell commands, environment-provided raw secrets, or
caller-controlled filesystem roots. `baseUrl` must use `http` or `https`,
must not include username/password, query, or fragment, and must pass bounded
host/port/path checks. `activityTopic` is a bounded single topic segment with
no slashes or traversal. The access token is sent as Bearer auth to ntfy and
is never printed, copied into notifier state, or included in message content.

Eligible activity events are:

- successful `completed`;
- `no-eligible-work`;
- successful iteration/runtime budget exhaustion;
- another explicitly successful terminal stop reason already recognized by
  the trusted health summary model.

The notifier does not send for active, stale, failed, submission-failed,
blocked, partial, malformed, untrusted, report-missing, report-ambiguous, or
orphan-lock states. It also does not resend unchanged healthy idle after a
delivery has already been confirmed.

Requirements:

- one informational notification for each newly observed terminal supervisor
  run ID;
- repeated endpoint polls for the same terminal run produce no additional
  notification;
- a new run ID may notify again;
- failure incidents and recovery remain deduplicated separately;
- owner-only atomic state;
- bounded schema;
- fail closed on malformed, symlinked, group/world-writable, or out-of-root
  notifier-state paths;
- notification failure must not alter runner outcome or mutate runner or
  supervisor state;
- completion summary is sanitized and may include duration, tasks processed,
  PRs merged/opened, failed/blocked count, terminal reason, and latest main
  SHA only when already present in trusted state.

Delivery guarantee: local state is at-most-once only after confirmed ntfy
delivery. If a timeout, connection failure, non-2xx response, malformed
response, or bounded read failure occurs, delivery is unconfirmed and the
notifier does not mark the event delivered. The next timer tick may retry with
the same deterministic ntfy sequence ID derived from the immutable dedupe key,
so clients that support ntfy sequence IDs can update or replace the visible
notification rather than accumulating duplicates. Exactly-once delivery across
an external network cannot be proven after ambiguous failure.

Deployment boundary:

- self-host ntfy on TrueNAS with authentication/access control and persistent
  app data;
- keep critical and activity topics separate and private;
- configure Uptime Kuma to the critical topic for DOWN/reminder/recovery;
- configure the DevBox terminal notifier to the activity topic for healthy
  terminal summaries;
- configure the documented ntfy iOS upstream poll-request setting during the
  #880 deployment task if instant iPhone push is required;
- keep deployment values external and redacted;
- reuse the existing external health and ntfy secret files from the rolled-back
  deployment when still valid; do not rotate them merely because the units were
  rolled back;
- do not add a public status page, public topic, router forward, tunnel,
  public DNS, or internet exposure without a separate explicit approval.

Do not select or configure live email, Slack, Discord, Telegram, Gotify,
webhook, public ntfy topics, or other credentials in repository code or docs
examples for this task.

## Historical Implementation Slices

These focused child issues under #800 record implementation history; their
pre-deployment wording does not override the accepted #912 live posture:

1. #879: repository implementation for the read-only DevBox health service,
   state evaluator, tests, systemd template, docs, and terminal-event dedupe
   foundation. No installation or deployment.
2. #883: repository implementation for the ntfy terminal notifier foundation,
   fixed external config boundary, confirmed-delivery dedupe, tests, docs, and
   repository-only systemd service/timer templates. No installation,
   deployment, live secrets, or live ntfy calls.
3. #880: originally tracked manual deployment. #912 subsequently accepted the
   DevBox health service, notifier timer, existing private provider
   prerequisites, and dedupe. Uptime Kuma/TrueNAS deployment and any new
   topic/token choice remain separate manual work. No automatic runner restart.
4. #885: repository compatibility fix for the Node-based health and notifier
   systemd templates after the `20260712-1609` rollback. This removes the
   Node/V8-incompatible `MemoryDenyWriteExecute` directive, preserves the
   remaining hardening controls, fixes health unit metadata/enablement, and
   historically left deployment retry gated by #880 before #912 acceptance.

Both slices must preserve #865/#866 as unrelated protected canaries and must
not expose the health endpoint publicly or configure secrets without explicit
approval.
# Large-candidate monitoring

Large-candidate status exposes only route state, immutable identity digests,
section counts, final-integration readiness, bounded uncovered paths or section
identifiers, split-plan status, and the next safe action. It excludes raw
prompts/diffs/provider payloads, unrestricted paths, secrets, credentials,
OCR/user data, and storage internals. Split-required, context-blocked, and
coverage-incomplete states are blocking health evidence, never successful
review verdicts.

## Live Monitoring Acceptance (20260724-0946)

The health service is installed and active on `127.0.0.1:8787` only. The
terminal notifier timer is enabled with owner-only external provider
configuration and confirmed-delivery dedupe. Unit readback retained the
reviewed sandbox posture and intentional Node/V8 exception. Journal/report
inspection found no secret values.

The final post-fix canary
`supervised-20260724T053439Z-282e0da15c99` resolved its exact correlated
summary and reached a healthy terminal state. The rollback drill kept
read-only status and health available while mutation authority was disabled,
then restored the exact production profile. No mutation-worker timer or
recurring queue start was installed.
