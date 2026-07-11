# Detached Auto-Runner Supervisor

This document defines the repository-side foundation for running the existing
Settleora auto-runner as a detached DevBox background job. It does not install
or enable a service, enable user lingering, deploy monitoring, or approve any
broader runner lane.

## Operator Surface

Default submission is intentionally bounded:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit --profile default
```

Defaults are `1` task and `3h`. Explicit bounded syntax is available:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit \
  --profile default \
  --max-tasks 8 \
  --max-runtime 8h
```

`MaxTasks` accepts `1..500`. `MaxRuntime` accepts `1m..14d`. These are syntax
bounds only. Runner config, issue contracts, lane manifests, manual gates,
danger gates, review routes, provider budgets, changed-file policy, CI,
security rules, and merge policy remain authoritative.

Dry-run submit is non-mutating:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit \
  --dry-run \
  --profile default \
  --max-tasks 8 \
  --max-runtime 8h \
  --json
```

It renders the normalized spec, unit name, runner argv, state and heartbeat
paths, and notification event shapes without writing a durable run spec,
starting systemd, invoking Codex, mutating GitHub, creating branches, or
opening PRs.

## Trust Boundaries

The supervisor is lane-neutral. It does not hard-code `auto-canary-ready`,
`client-ui-low-risk`, `--canary` as a policy override, automatic merge
approval, or a specific issue area. The immutable run spec references an
approved external runner profile/config. That config and the issue contract
decide labels, canary/trusted mode, lanes, validation, review strength, PR
creation, auto-merge eligibility, and manual approval requirements.

Sensitive or manual-gated domains remain gated: auth/session/security,
storage/privacy/authz, money/settlement/payment/bill calculation,
schema/migrations, OpenAPI/generated clients, Docker/CI/deployment/env,
public/admin exposure, production deploys, mobile releases, destructive
operations, and architecture replacement.

## Immutable Run Specs

Run specs live outside the repo:

```text
/workspace/logs/settleora-auto-runner/supervisor/run-specs/<run-id>.json
```

They are written with exclusive-create semantics, `0600` permissions,
canonical deterministic JSON, and an adjacent supervisor-state SHA-256 digest.
The worker re-hashes the spec before launch and revalidates the referenced
config digest. Specs reject unknown fields, malformed types, unsafe run IDs,
arbitrary commands, shell fragments, environment overrides, extra arguments,
symlink paths, group/world-writable files, and paths outside approved roots.

Approved config roots are:

```text
/workspace/logs/settleora-auto-runner/configs/
/workspace/logs/settleora-auto-runner/canary/
```

The spec stores the config path and hash, not config contents or secrets.

## systemd Lifecycle

The repository template is:

```text
tools/auto-runner/systemd/settleora-auto-runner@.service
```

It is intended for later manual installation under:

```text
~/.config/systemd/user/settleora-auto-runner@.service
```

The unit uses `Type=exec`, fixed `WorkingDirectory=/workspace/repos/Settleora`,
the Node worker entry point, validated `%i` run IDs, `UMask=0077`,
`Restart=no`, bounded graceful stop behavior, `SendSIGKILL=no`, journal output,
dedicated worker log files, and an optional environment file only under
`/workspace/logs/settleora-auto-runner/secrets/`.

No instance is enabled by the template. No reboot resume is configured. Failed,
killed, crashed, timed-out, or reboot-interrupted mutation runs require
operator review and explicit recovery.

## Worker Lifecycle

The worker receives only a validated run ID. It derives the spec path,
revalidates spec/config hashes, verifies the initial `origin/main`, writes
`starting`, sends a best-effort `started` event, and spawns the existing runner
with an argv array. It maps `maxTasks` to the existing iteration budget,
`maxRuntime` to the existing runtime limit, `mode` to the existing runner mode,
and config path to `--config`.

On first `SIGTERM` or `SIGINT`, the worker writes `stopping_after_current` and
invokes the existing safe `--stop-after-current` control path. It does not
kill mid-commit, mid-review, mid-check-wait, or mid-merge. A second emergency
hard stop remains a manual operator action outside the normal Windows wrapper.

## State And Heartbeat

Supervisor state lives under:

```text
/workspace/logs/settleora-auto-runner/supervisor/runs/<run-id>/
```

Files include `state.json`, `heartbeat.json`, `stdout.log`, `stderr.log`,
`notification-events.jsonl`, and `delivery-attempts.jsonl`. JSON writes are
atomic and owner-only. Default heartbeat interval is 60 seconds with a
five-minute lease. Heartbeats contain only bounded sanitized metadata: run IDs,
state, unit name, timestamps, lease expiry, max tasks/runtime, counts, public
issue/PR identifiers when already public, report/status paths, and monitoring
delivery status.

Heartbeats never include secrets, environment values, webhook URLs/tokens,
authorization headers, full issue bodies, raw Codex/Gemini output, provider
payloads, full diffs, or config contents.

`health --run <run-id>` returns deterministic JSON and exit codes for healthy
active, healthy terminal success, terminal failure/blocked/partial, stale
heartbeat, and missing run.

## Monitoring Contract

Outbound monitoring is disabled by default. Optional environment variables are:

```text
SETTLEORA_HEARTBEAT_URL
SETTLEORA_NOTIFICATION_URL
SETTLEORA_ALLOW_LAN_HTTP
```

HTTPS is required by default. HTTP requires explicit LAN opt-in and private or
loopback destination validation. Requests time out within five seconds and use
at most one retry for network, timeout, or 5xx failures. Delivery failures are
recorded locally with sanitized status/category and never change the runner
outcome. Redirects to different origins are refused.

Supported events are `submitted`, `started`, `heartbeat`, `completed`,
`partial`, `blocked`, `failed`, and `cancelled`. A dead supervisor cannot emit
`stale`; external monitoring detects death by heartbeat lease expiry.

A later TrueNAS companion should receive heartbeat and terminal JSON, persist
latest state, alert when an active heartbeat lease expires, avoid stale alerts
after terminal events, notify on terminal outcomes, optionally expose a
read-only dashboard, and hold no repo or GitHub write authority.

## Windows Templates

Repository templates live under `tools/auto-runner/windows/`. They use
`ssh.exe`, default SSH target from `SETTLEORA_DEVBOX_SSH_TARGET`, optional
`-SshTarget`, fixed remote repo path, bounded parameter validation, and the
fixed remote `settleora-auto-runnerctl.mjs` entry point. They contain no
host/IP, username, password, token, key path, or arbitrary remote command
parameter. Closing Windows after successful submit is not required for DevBox
execution to continue.

## Installation And Recovery Gates

Remaining manual gates include PR merge, user-unit installation,
`loginctl enable-linger`, Windows wrapper deployment, SSH-disconnect and
Windows-shutdown canary acceptance, TrueNAS monitoring deployment, and any
broader lane/run approval. Recovery from stale or orphaned state is explicit
and evidence-bound; this foundation does not implement automatic resume.
