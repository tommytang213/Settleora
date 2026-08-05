# Trusted Interactive DevBox Deployment

Status: accepted for the self-hosted Day 1 operator workflow.

## Decision

The administrator manually opens an authenticated interactive SSH session to
the DevBox and runs the repository-owned local deployment coordinator from the
canonical Settleora checkout. The DevBox, the `tommytang213` account, that
authenticated session, and its interactive login shell are trusted operational
infrastructure. No Windows-to-VM command orchestration, custom SSH account,
forced command, pre-login dispatcher, PAM boundary, dedicated sshd service, or
special login shell is required or supported by this workflow.

The coordinator defends against stale or wrong source, dirty or contradictory
Git state, malformed or duplicate operations, partial execution, ambiguous
completion, unsafe paths and links, installed-state drift, and failed readback
or health. A malicious administrator account, malicious interactive shell, or
hostile operator who already controls the trusted session is outside this
tool's threat model. Compromise of that account is host compromise.

This proportional operator trust decision does not change the Settleora
product boundary. Public traffic remains hostile. API/web authentication,
authorization, file privacy, storage, money and settlement authority, audit,
and exposure rules remain unchanged.

## Privilege and retry contract

Planning and verification are unprivileged. Apply requires the real local TTY
and the exact immutable operation ID. The operator locally initiates the sole
permitted sudo attempt; the password travels only between the terminal and
sudo and is never read, proxied, parsed, retained, or reported by the
coordinator. No passwordless sudo policy is added.

Before the attempt, the operation durably records `sudoAttemptCount: 1`.
Thereafter every apply retry is readback/reconciliation only. Cancellation,
authentication failure, lost output, process loss, an absent final result, or
an ambiguous root result never permits a second sudo call for that operation.
A later privileged attempt requires a new source-authenticated operation and a
new operator authorization. Root remains responsible for independent source
authentication, plan derivation, atomic/idempotent publication, root journals,
and exact installed readback.

The sole sudo argv carries fixed source-owned first-stage Python bytes and
validated scalar identities only. With all three streams attached to the real
TTY, that stage independently proves public `main`, fetches and fscks its exact
Git objects without credentials, verifies the selected bootstrap blob, and
atomically installs or adopts only the fixed root bootstrap before execing the
existing root-authoritative protocol. This is how a stale bootstrap is advanced
without a preliminary sudo or caller-supplied path. A failure at any point
consumes the operation and permits unprivileged readback only.

## Supported commands

From exact clean, fetched, canonical `main`:

```bash
cd /workspace/repos/Settleora
node tools/auto-runner/settleora-local-runtime-deploy.mjs plan
node tools/auto-runner/settleora-local-runtime-deploy.mjs apply --operation <operation-id>
node tools/auto-runner/settleora-local-runtime-deploy.mjs verify --operation <operation-id>
```

`plan` authenticates local/origin/public `main`, source closure, current
runtime/profile/approval/launcher/service identities, and prospective runtime
bundle bytes, then atomically publishes an owner-private operation. It performs
no sudo, installation, service action, SSH command, or product mutation.

`apply` reauthenticates the exact source and operation, checks installed state,
adopts an already exact verified result without privilege, or enters the one
interactive native-install attempt. A zero sudo exit is not success; installed
readback and loopback health must still pass.

`verify` is idempotent and unprivileged. It never invokes sudo, restarts or
repairs a service, or continues Issue #959. It distinguishes installed and
healthy, installed with failed health, no effect, conflicting installed state,
blocked retained evidence, and uncertain privilege effect, and prints the next
operator action.

## Superseded evidence

The Windows remote handoff and dedicated trusted-SSH-boundary designs are not
supported operator workflows. Draft PRs #1048 and #1049 remain open, unmerged,
and unmodified as preserved superseded evidence pending a later explicit owner
decision. Retained handoff `20260804-1825` and its failed operation remain
immutable and permanently non-replayable.

Merging this source is not deployment authorization. Deployment is a later
manual gate. Issue #959 is a still-later independent gate permitted only after
installed readback and health succeed.
