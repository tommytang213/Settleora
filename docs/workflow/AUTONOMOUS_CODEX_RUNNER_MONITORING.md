# Autonomous Codex Runner Monitoring

## Status

This document is the authoritative design for future Settleora auto-runner
health monitoring. It supersedes the earlier provisional SSH-primary TrueNAS
monitoring direction. It does not implement the health service, install or
enable a DevBox unit, install Uptime Kuma, configure TrueNAS SCALE, expose a
network port, configure notification credentials, or prove deployment
acceptance.

Approved architecture:

```text
TrueNAS SCALE
  Uptime Kuma HTTP monitor
          |
          | trusted-LAN read-only GET
          v
DevBox permanent health service
          |
          | reads owner-only persisted supervisor/runner state
          v
Temporary supervisor/runner jobs and correlated summaries
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

The future health service is separate. It remains callable after a runner exits
and may use `Restart=on-failure` because it is read-only and has no runner,
GitHub, branch, lock-removal, resume, retry, or merge authority.

The service reads only bounded owner-only persisted state:

- supervisor state and heartbeat files;
- strict supervisor/runner report-correlation results;
- sanitized runner summaries and counts already present in trusted summaries;
- runner active/lock readback;
- bounded systemd readback for the selected/current supervisor unit.

Uptime Kuma must not poll GitHub for eligible issues on every health check. No
eligible work is a successful terminal result, not an outage. Idle does not
become unhealthy merely because time passes when no run was scheduled. A dead
or unreachable DevBox is detected because Uptime Kuma cannot reach the endpoint.

## Endpoint Contract

Future implementation should expose one narrow route:

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
- unreadable required state where fail-closed behavior is safer;
- any other fail-closed inconsistency.

The implementation must reconcile freshness with current supervisor constants:
heartbeats are written every 60 seconds and carry a five-minute lease. A
heartbeat is stale only while non-terminal and after the lease expires.
Terminal heartbeat age alone must not make an unchanged completed/idle run
unhealthy.

Lock orphan detection should use the existing runner lock semantics: active or
unparsable locks require inspection; stale locks are removable only by the
runner code when the recorded PID is no longer active. The health service must
never delete locks.

## Health Service Boundary

Future repository implementation constraints:

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
- A separate narrow notifier adapter handles one-time healthy-terminal
  summaries using an externally configured notification destination.
- Provider choice and credentials are manual deployment decisions.
- No notifier destination is enabled by default.

Deduplication key:

```text
<immutable-supervisor-run-id>:<terminal-event-kind>
```

Notifier state should be persisted atomically outside the repo, tentatively:

```text
/workspace/logs/settleora-auto-runner/monitoring/notifier-state.json
```

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

Do not select or configure live email, Slack, Discord, Telegram, ntfy, Gotify,
webhook, or other credentials in repository code or docs examples for this
task.

## Follow-Up Slices

Focused child issues under #800:

1. #879: repository implementation for the read-only DevBox health service,
   state evaluator, tests, systemd template, docs, and terminal-event dedupe
   foundation. No installation or deployment.
2. #880: manual deployment and acceptance to install/enable the health service
   on the DevBox, install/configure Uptime Kuma on TrueNAS SCALE, choose
   notification destination, prove alert/recovery/completion dedupe, and
   document rollback. No automatic runner restart.

Both slices must preserve #865/#866 as unrelated protected canaries and must
not expose the health endpoint publicly or configure secrets without explicit
approval.
