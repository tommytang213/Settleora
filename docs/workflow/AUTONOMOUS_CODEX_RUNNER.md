# Autonomous Codex Runner

## Purpose

The DevBox-native auto-runner is a Settleora repo tool because its policy has
to track Settleora architecture boundaries, validation commands, issue labels,
and task prompt rules as they evolve. Keeping the source in this repo lets the
runner change through normal PR review while runtime logs, locks, prompts,
Codex output, review packages, summaries, and local report copies stay outside
the repo at `/workspace/logs/settleora-auto-runner/`.

This is not a Windows start-one-task wrapper. Tommy should be able to launch one
bounded DevBox process and let it process multiple eligible issues until it hits
`--max-iterations`, `--max-runtime`, no eligible work, or a systemic unsafe
condition.

## Relationship To Existing Automation

Manual Windows helper scripts such as `Start-SettleoraCodexTask.ps1` and
`Get-SettleoraCodexReport.ps1` were not present in the repository or working
tree during this implementation. This runner therefore documents the intended
DevBox behavior directly instead of depending on those scripts.

`scripts/ai/v3-controller.mjs` remains the milestone queue controller for
`.ai/task-queue.json` work into `ai/integration`. The auto-runner complements
it rather than replacing it: it polls GitHub issues labeled for automation,
branches from latest `origin/main`, generates issue-specific Codex prompts, and
prepares PRs for human review. It reuses the V3 controller's proven ideas:
single-checkout locking, DevBox-local `codex-vm-full` invocation, external log
roots, no empty commits, explicit stop reasons, and hard gates for unsafe
domains.

## Runtime Boundary

Repository source lives under `tools/auto-runner/` and this document. Runtime
artifacts live under `/workspace/logs/settleora-auto-runner/`:

- `locks/` prevents concurrent runner instances.
- `state/` records per-iteration claim and outcome state.
- `tasks/` stores generated Codex task prompts.
- `codex-runs/` stores full implementation Codex stdout/stderr.
- `reviews/` stores pre-PR review packages, prompts, and review logs.
- `reports/` stores copied local Codex reports.
- `summaries/` stores per-run JSON/Markdown and recent rollups.

Stale locks are removed only when the recorded PID is no longer active. Active
or unparsable locks stop the runner for human inspection.

## Label Contract

Eligible issue labels:

- `auto-ready`
- `auto-bundle`

Default stop labels:

- `needs-tommy`
- `manual-gate`
- `danger-gate`
- `auto-failed`
- `auto-running`
- `auto-pr-opened`
- `blocked`

Real-run claim behavior adds `auto-claimed` and `auto-running`, then posts a
bounded claim comment. The runner re-reads and records claim state locally so a
later stale-claim policy can be implemented. Stale-claim stealing is disabled by
default and must stay disabled unless config explicitly allows it.

Terminal real-run outcomes always remove `auto-running`. `approved_pr_opened`
adds `auto-pr-opened`, which is also a stop label so the issue is not selected
again while a PR is pending. `blocked_needs_tommy` adds `needs-tommy`,
`danger_gate` adds `danger-gate`, and `auto_failed`, `validation_failed`, and
`review_changes_requested_retry_exhausted` add `auto-failed`. `no_changes`
removes `auto-running` and comments the outcome without closing the issue. The
runner never closes issues automatically.

Dry-run mode previews the exact label add/remove/comment operations instead of
calling `gh issue edit`, `gh issue comment`, or `gh issue create`.

`auto-bundle` means the issue may intentionally split into multiple prompts,
branches, or follow-up issues in a future lane policy. Each implementation
branch still has to stay reviewable.

## Lane Policy

Auto-merge is disabled globally by default. Real mutation requires `--run`.
Docs/workflow/tooling issues can be represented as a future safe lane, but PR
creation still requires local validation and pre-PR AI review. The safe
workflow/tooling lane is limited to `tools/auto-runner/**`,
`docs/workflow/**`, and `scripts/ai/**`; other paths are blocked even when the
issue text looks safe. Generic words such as `config` do not by themselves
trigger the secrets/config danger gate, but auth config, security config,
deployment config, `.env`, secrets, credentials, SSH, and token-storage work
remain gated.

The runner must label/comment `danger-gate` or `needs-tommy` instead of
implementing unattended work for auth/session/security, storage/file
privacy/authz, money/settlement/bill calculation, schema/migrations,
OpenAPI/generated clients, sync/restore/import/export, Docker/CI/deploy,
secrets/config, public/admin exposure, mobile store release, production deploy,
destructive operations, branch deletion/cleanup, force-like history changes, or
architecture replacement.

AI review cannot clear these gates.

## Unattended Loop

The intended loop is:

1. Load config, state, and lock.
2. Poll open eligible GitHub issues.
3. Claim one issue safely in real-run mode.
4. Classify lane and manual/danger gates.
5. Record and continue on gated task-level outcomes.
6. Fetch latest `origin/main`.
7. Create `feature/auto-<issue-number>-<slug>-<timestamp>`.
8. Generate a Codex task prompt under the external log root.
9. Invoke DevBox-local Codex with the prompt on stdin.
10. Collect the report and changed-file list.
11. Plan and run scoped validation.
12. Build a mandatory pre-PR review package.
13. Run a separate review-only AI pass outside the mutable checkout.
14. Block PR creation unless the review verdict is `approve`.
15. Stage explicit changed paths only, commit, push the branch, open/update PR,
    watch checks, and comment/label the outcome.
16. Write a per-iteration summary and continue to the next eligible issue.
17. Write a final run summary.

Normal per-issue terminal outcomes do not stop the whole session:
`approved_pr_opened`, `blocked_needs_tommy`, `danger_gate`, `auto_failed`,
`no_changes`, `validation_failed`,
`review_changes_requested_retry_exhausted`, and
`issue_created_for_followup`.

Systemic stop conditions include dirty real-run workspace, unavailable GitHub
auth in real-run mode, unavailable Codex in real-run mode, ambiguous repository
state, lock corruption, repeated infrastructure failure, or config/policy
corruption.

## Pre-PR AI Review Gate

Every implementation requires a separate pre-PR review before PR creation or PR
update. The review package includes the source issue, task prompt path, lane
decision, changed-file list, bounded diff, validation results, report summary,
and runner policy decisions.

The reviewer prompt says review only and do not edit files. The runner compares
branch, status, changed files, diff hash, and `HEAD` before and after review.
Any mutation blocks PR creation and marks the task failed/needs human review.

Reviewer output must contain:

```json
{
  "verdict": "approve | changes_requested | needs_tommy | danger_gate | unable_to_review",
  "confidence": "low | medium | high",
  "requirement_match": "pass | partial | fail | unclear",
  "code_quality": "pass | partial | fail | unclear",
  "scope_control": "pass | fail | unclear",
  "validation_adequacy": "pass | partial | fail | unclear",
  "blocking_findings": [],
  "non_blocking_findings": [],
  "recommended_next_action": "open_pr | run_safe_fix_cycle | mark_needs_tommy | mark_auto_failed | mark_danger_gate"
}
```

`changes_requested` may trigger a bounded safe fix cycle only when the lane
allows it, the requested changes stay inside original scope, and retry budget
remains. `needs_tommy`, `danger_gate`, and `unable_to_review` block PR creation.
Reviewer verdict JSON is parsed against the allowed enum values. Missing,
malformed, or out-of-enum verdicts fail closed as `unable_to_review`. Dry-run
review diagnostics never approve PR creation.

## Follow-Up Issues

The runner may create follow-up GitHub issues in a future real-run lane when
Codex, review, or report evidence identifies prerequisite work, split-worthy
scope, defects, or manual decisions. Creation is policy-gated, bounded, labeled
`auto-followup`/`needs-triage`, linked to the source issue/PR, and duplicate
spam must be avoided. Dry-run only previews follow-up creation.

## Git And PR Rules

Real-run mode fetches latest `origin/main`, starts every task branch from
`origin/main`, never pushes directly to `main`, never force pushes, never
deletes branches, never amends commits, and refuses a dirty worktree.

Staging uses explicit paths from `git diff --name-only` plus untracked files
from `git ls-files --others --exclude-standard`. The runner never uses
`git add .` and never fabricates empty commits.

PR creation/update is allowed only when validation passes, pre-PR review
approves, the review did not mutate the checkout, lane policy does not require
manual/danger gate before PR, and the task report is present enough to link.
The runner does not merge into `main` by default.

## Running

Preflight:

```bash
cd /workspace/repos/Settleora
node tools/auto-runner/settleora-auto-runner.mjs --preflight
```

Preflight prints a bounded JSON result with pass/warn/fail checks for the repo
root, branch/worktree status and whether real-run would refuse, `gh`
availability, `gh repo view tommytang213/Settleora`, issue polling,
`codex-vm-full` resolution, logs-root writability, config parseability, disabled
auto-merge/follow-up/stale-claim-steal defaults, and the fact that this command
does not install or enable systemd. Preflight does not acquire the runner lock,
run implementation Codex, run review Codex, mutate GitHub, create branches, or
enable systemd units.

Dry-run:

```bash
cd /workspace/repos/Settleora
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once --require-pre-pr-review
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
```

`--fixture-issues <json>` is accepted only with `--dry-run`. Fixture mode uses
local issue objects to simulate multiple eligible issues in one trigger,
continues after terminal dry-run outcomes, skips issues that already carry stop
labels such as `auto-pr-opened`, and stops on no eligible fixture work or
`--max-iterations`. It does not call real GitHub mutation commands, create
branches, push, open PRs, run real Codex, mutate `.codex`, or enable auto-merge.

Bounded real-run:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --once
node tools/auto-runner/settleora-auto-runner.mjs --run --max-iterations 20
node tools/auto-runner/settleora-auto-runner.mjs --run --max-runtime 8h
```

Review-package diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --review-package /workspace/logs/settleora-auto-runner/reviews/<package>.json
```

Summaries:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --write-summary --since 24h
ls /workspace/logs/settleora-auto-runner/summaries/
```

To stop a foreground run, send `Ctrl+C`. For a future service run, stop the user
service or disable the timer. This PR only provides example systemd user
templates and does not install or enable them.

## Known Limitations

- Real issue mutation is guarded but not yet trusted for unattended production
  use.
- Follow-up issue creation is modeled and gated, not enabled by default.
- Stale-claim stealing is disabled.
- Safe review-fix cycles are modeled but intentionally conservative.
- Auto-merge to `main` is disabled.
- Manual review is still required before enabling real unattended mutation.
