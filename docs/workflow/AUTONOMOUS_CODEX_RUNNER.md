# Autonomous Codex Runner

## Shared recursive source-failure authority

Post-implementation failures do not gain a separate controller or accounting
system. Local validation, GitHub checks, CodeQL, Semgrep, Trivy, Gemini, local
Codex, and GitHub Codex use one bounded normalized finding contract. Structured
exact-head evidence is sanitized, fingerprinted, frozen, deduplicated, and
classified before action; an unstructured red status is
`unsafe_or_ambiguous`, never an inferred source fix.

An actionable in-contract batch may invoke only the focused source-fix handler.
The resulting normal candidate invalidates all head-bound evidence and restarts
complete local validation, fresh strong-independent review, and fresh local
Codex mechanics/integration/recovery/security review before push to the same
PR. Pending/transient failures wait or retry. Credentials/auth, manual
authority, unsupported evidence, out-of-contract changes, scanner weakening,
and deterministic no-progress/oscillation stop fail-closed. Fix rounds reuse
the #923 counters and never add a #932 accepted-task charge.

## Post-implementation continuation authorities

The ordinary issue path and startup recovery share an idempotent continuation spanning exact candidate reconciliation, validation, independent and local/structured review, convergence, push, PR recovery, GitHub convergence, exact-head merge, and post-merge hygiene. Durable exact-target effects are adopted rather than replayed, a source change invalidates review and downstream effects, and the accepted logical-task charge remains the root task charge across execution/session continuations.

For a deterministic feature-bundle split, the bundle orchestrator—not the PR-stack executor—materializes exact branches from the frozen base and proven checkpoint ranges. It verifies the actual per-slice file digest and semantic own delta, normally pushes and creates or reuses the exact dependent PR relationship, persists each step, then hands the created PR stack to the existing stack executor. Incomplete proof or conflicting live state fails closed before mutation.

## Accepted-task and convergence budget authority

The top-level task budget is charged at the accepted claim boundary, not by
issue search pages, skipped candidates, validation or review cycles, GitHub
polling, retries, recovery continuation, or session rotation. A passing claim
reread receives one durable logical-task charge before source mutation.
Replaying the same repository, issue, task-lineage, and claim identity discovers
that marker and does not charge again; corrupt or incomplete identity fails
closed.

Review correction uses two nested limits independent of logical-task count.
The inner local epoch permits at most 50 source-changing batches and requires
validation, fresh Gemini review, and fresh local Codex review bound to one exact
candidate. The outer PR loop permits at most 50 frozen actionable GitHub
finding batches per PR. Each starts a new local epoch and resets only its local
round counter. Lifetime local source-changing rounds are telemetry only.

Existing-PR stack correction uses a durable inner-local candidate journal.
Validation, fresh Gemini, and fresh local Codex sessions bind to the same
committed-but-unpushed cumulative candidate. Material findings from both
reviewers are frozen and deduplicated into one bounded batch; a safe in-scope
fix invalidates all candidate evidence and repeats all three gates. Commit and
push intents are restart-idempotent, and no push occurs until both fresh
reviews pass. Manual, unsafe, out-of-contract, contradictory, replayed/
no-progress, and round-51 findings stop fail-closed.

`two_loop_v1` is the only blocking source-round authority. Migration labels
legacy `sourceChangingCycle` and stack `sourceCycles` values as non-
authoritative compatibility projections, binds reservations to the GitHub
epoch and complete cumulative candidate chain, and leaves lifetime telemetry
and logical-task charging independent.

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

End-state note: the auto-runner foundation A-H scope is complete through PR
#908. PR #907 merged the final high-risk lane correction from exact source head
`9472142f69b5db443d1d1693f4a68e38e491d96f` as merge SHA
`e58340855ab5f700342ce1bfa02d12d2e287b5b3`; PR #908 merged the final closure
documentation from exact source head
`f12d3ad1721506d1b9fa3d72f78a1417d457ff85` as current-main merge SHA
`4cbb807d09eb732699fb82acc0336f985b94b617`. Final current-main
validation/check/scanner proof passed, and #800, #894, and #889 are closed
completed. The low-risk/canary defaults are fail-closed deployment defaults,
not a permanent policy limit. The authoritative current audit is
[Auto-Runner End-State Gap Audit](../planning/AUTO_RUNNER_END_STATE_GAP_AUDIT.md),
and the durable final matrix is
[Auto-Runner Final Acceptance Matrix #894](../planning/AUTO_RUNNER_FINAL_ACCEPTANCE_894.md).
#887 through #893 plus the #889/#907 correction are completed foundation code
children. #902 remains the next separate post-foundation enhancement and is
not implemented yet. Completing the runner foundation does not mean the
Settleora product Day 1 milestone is complete. Fail-closed defaults and
genuine manual actions remain in force.

The detached supervisor foundation adds an optional systemd-backed control
surface around this runner. It submits immutable bounded run specs, starts a
validated user-unit instance after later manual installation, writes
heartbeat/state files, records sanitized local monitoring events, and returns
control to the operator without waiting for the runner to finish. Supervisor
filesystem paths use SHA-256 storage keys derived from validated logical run
IDs and logical profile names; immutable specs store `profile` plus
`runnerConfigSha256`, not arbitrary config paths. It is documented in
[AUTONOMOUS_CODEX_RUNNER_SUPERVISOR.md](AUTONOMOUS_CODEX_RUNNER_SUPERVISOR.md).
It does not replace this runner, reinterpret issue contracts, install or
enable services, enable linger, deploy monitoring, send outbound webhooks,
auto-restart mutation runs, or approve broader lanes. Future TrueNAS monitoring
uses Uptime Kuma HTTP pull checks against a separate read-only DevBox health
service, as defined in
[Autonomous Codex Runner Monitoring](AUTONOMOUS_CODEX_RUNNER_MONITORING.md).
SSH remains an operator diagnostic and wrapper-readback path, not the primary
monitor architecture.

Supervised runs are correlated explicitly. The supervisor passes
`--supervisor-run-id <validated-supervisor-run-id>` only for normal real
`--run` launches, and the runner stores that bounded logical ID in the
sanitized JSON and Markdown summary. The flag is invalid for dry-run,
readiness/preflight, status/list/control, reviewer smoke, review-package, and
summary-only modes. It is metadata only and does not alter lane policy,
issue selection, budgets, review, validation, CI, PR creation, or merge
authority. The supervisor uses this field for exact report mapping and never
uses newest-summary guessing.

## Launch And Mutation Workspaces

The runner has two separate workspace boundaries.

The launch/control-plane checkout may be a clean `main` checkout or a clean
named non-main checkout. Detached or unnamed real-run launch fails closed. A
real run still refuses a dirty worktree before polling issues or mutating
anything. Clean `main` is approved only for control-plane startup: acquire the
runner lock, resolve and record exact `origin/main`, poll eligible issues,
stop with `no-eligible-work`, release the lock, and write a complete summary.
It is not an implementation, commit, push, or PR branch.

Before any fresh task implementation can generate a task prompt or invoke
Codex, the runner fetches `origin/main`, creates the generated task branch from
that exact SHA, and verifies the task-mutation workspace. The mutation guard
fails closed on `main`, detached or unnamed checkout state, an unexpected
branch name, a dirty worktree or index, changed `origin/main`, or task-branch
`HEAD` that no longer equals the expected freshly created base. This guard is
separate from the launch check so a no-work supervised run can complete from
clean `main` without weakening the rule that implementation never happens on
`main`.

Run summaries record the exact launch `origin/main` SHA before later
workspace-policy checks can reject when that SHA is resolvable. If
`origin/main` cannot be resolved, the run fails closed instead of fabricating a
base. The supervisor resolver remains strict and continues to require an exact
supervisor ID, runner ID, mode, base SHA, and JSON/Markdown pair.

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
- `auto-merge/` stores sanitized low-risk auto-merge decision evidence.
- `security-findings/` stores sanitized security-finding ingestion state from
  the explicit non-mutating dry-run mode. False-positive disposition readiness
  evidence is bounded to packet, review, precondition, reconciliation,
  completion, and recovery digests, never raw SARIF, provider payloads, source
  snippets, request/response bodies, credentials, tokens, prompts, or user
  data.
- `canary/` stores trusted-real-run canary evidence JSON for dry-run fixture
  exercises and any future manually approved canary real-run.
- `readiness/` stores report-only overnight readiness preflight JSON and
  Markdown.
- `bundles/` stores sanitized durable feature-bundle state. Bundle state is
  versioned JSON written atomically through a temporary file plus rename and is
  keyed from the validated issue/bundle identity. It records plan digest, issue,
  run/supervisor correlation, branch, exact base/head, ordered slice state,
  prompt/report paths, checkpoint validation, checkpoint commits, final review,
  PR, CI, and bounded stop reasons. It never stores raw prompts, provider
  output, full diffs, secrets, environment data, or credential material.
- `generated-work/` stores sanitized generated-issue mutation intent and
  result evidence. Issue creation remains default-off and requires explicit
  runtime capability plus proposal, duplicate, label, path, contract,
  validation, and lane checks. Dry-run writes exact previews only.
- `recovery/` stores sanitized durable recovery and continuation state. It is
  versioned JSON written atomically through a temporary file plus rename and
  keyed from validated task/issue/run/branch/base identity. It records
  branch/base/head, PR number/URL, current phase, first incomplete action,
  bounded retry attempts by outcome class and fingerprint, validation/review/
  CI/scanner evidence bindings, feature-bundle and generated-work linkage,
  idempotent mutation markers, stop reason, next safe action, timestamps, and
  schema version. It never stores raw prompts, provider responses, full diffs,
  secrets, environment dumps, tokens, credentials, or unbounded logs.
- `recovery/outage-resubmission/` stores sanitized bounded outage
  resubmission state linked to the authoritative recovery record. The
  controller is supervisor-side, default-off, recovery-first, and finite. It
  persists exact task/run/supervisor/issue/branch/base/head/PR/profile/config/
  spec-digest correlation, sanitized outage class/fingerprint, attempt,
  deadline, next eligible time, circuit state, child supervisor run ID, and an
  `outage_resubmission` marker. It never stores raw provider bodies, prompts,
  arbitrary commands, config paths, secrets, tokens, source snippets, or full
  diffs.
  Outage child specs also persist the task key, current head SHA, and paired
  PR number/head SHA plus an exact recovery-only target required by later
  reconciliation; incomplete historical child specs remain fail-closed
  operator evidence and are not repaired with mutable source values. Canonical
  corrupt, schema-invalid, symlinked, group/world-writable, or otherwise
  untrusted outage-state files are counted as operator-action inventory and
  make health fail closed instead of disappearing from status.

Bounded outage resubmission is eligible only for recognized prolonged
transient infrastructure/provider failures: trusted GitHub API/Actions
rate-limit, 5xx, timeout, or transport evidence; Codex/reviewer/scanner
429/5xx/timeout/transport evidence; or explicit DevBox DNS/routing/TLS/
connection failures. It is not eligible for 401, ordinary 403, 404,
missing/invalid secrets or config, dirty worktrees, corrupt state, stale
evidence, identity drift, merge conflicts, failed tests or validation, code
defects, review/scanner findings, policy/manual/destructive gates,
unsupported sources, unknown failures, or terminal application failures.
Minimum outage age, backoff, jitter, max attempts, wall-clock deadline, and
provider/global circuit breaker are explicit config values. Production
activation remains separate/manual under #912.
- `pr-stacks/` and task-scoped live-stack directories store sanitized durable
  dependent-PR stack state. Stack execution is available only through the
  explicit `--run-pr-stack --config <absolute-path> --stack-plan
  <absolute-path>` entry. It is mutually exclusive with normal issue polling,
  canary, security-finding, smoke, preflight, status/control, and
  review-package modes. It consumes an immutable 1-4 PR plan, calls
  `nextStackAction(...)`, persists before and after each external mutation,
  records mutation markers for exact-once retarget/ready/merge/hygiene
  behavior, and returns durable wait reasons for GitHub Codex, checks,
  scanners, and merge-state refresh. Repository defaults keep this disabled;
  task-scoped config must enable only existing-PR convergence, exact-head
  review request, CI/scanner polling, exact-head merge, base retarget, ready
  transition, semantic proof, and final hygiene capabilities. Production
  profile activation, issue polling/claiming, generated issue creation,
  supervisor/systemd/outage child launch, canary mutation, deploy/release,
  secret/auth config mutation, public/admin/network exposure, branch deletion,
  force-like history, direct `main` push, and product authority changes remain
  refused.

Stale locks are removed only when the recorded PID is no longer active. Active
or unparsable locks stop the runner for human inspection.

## Status And Local Control

The local status surface is:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
```

It reads the lock, active-run state, latest summaries, and the local control
file. Output reports whether a runner appears active, active run id, mode and
config path, started time, elapsed/max/remaining runtime, PR/iteration budget
and remaining count, completed/merged/failed/blocked/skipped counts, current
or latest issue and PR with head SHA where known, terminal outcome or stop
reason, last event time, summary/report/log paths, and active control flags.
`--json` also exposes `maxPrs`, `completedPrs`, and `estimatedRemainingPrs`
aliases for the same iteration budget used by current canary/trusted runner
loops. It must remain sanitized: no provider payloads, raw Gemini output,
raw Codex mechanics output, provider request/response bodies, environment
variables, API keys, authorization headers, `.env` values, or secrets. Run
summaries, iteration state, active-run state, recent summaries, and event
listings persist sanitized metadata plus evidence paths only. Supervised run
summaries include a bounded `supervisorRunId` correlation field; unsupervised
historical and foreground summaries remain compatible without that field. Raw model
output, selected response payloads, prompts, stdout/stderr, full diffs, and
provider payloads belong in dedicated local evidence files under the approved
`/workspace/logs/settleora-auto-runner/` subdirectories. Historical local
summary/state files are operator-controlled evidence and are not
automatically rewritten by newer runner versions; new readback surfaces
sanitize old files before re-emitting them.

Recent run and event inspection is local and read-only:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run <run-id>
```

Run listing reads `/workspace/logs/settleora-auto-runner/summaries/`. Event
listing reconstructs issue, branch, PR, review, checks, merge/failure, and
outcome evidence from existing summary/state/evidence files where available.
It includes issue numbers, PR numbers, branch names, head SHAs, review
verdicts, independent AI provider/tier/verdict, validation commands,
check-wait attempts, merge SHAs, and final outcomes where recoverable. Missing
or partially written evidence is `unknown`, not inferred.

## Generated Work And Completion Hygiene

Generated work is modeled as a strict proposal before any GitHub mutation.
Each proposal carries a schema version, deterministic correlation key,
idempotency digest, source issue/PR/report/run references, parent/related
issues, scope/non-goals, architecture guardrails, allowed paths, validation
profile, reviewer tier, exact-head gates, acceptance criteria, close rule,
safe labels, and a machine-readable auto-runner contract.

Duplicate prevention searches bounded current and historical evidence:
open/closed issues, open/merged PRs, comments, review outcomes, sanitized
reports/summaries/events, the issue progress ledger, source issue/PR evidence,
and prior generated-work correlation state. Exact correlation/idempotency
markers take priority. Title-only and near-number matches never cause reuse by
themselves; ambiguous matches fail closed into one bounded manual triage item.
Closed completed duplicates are reused as evidence, while closed incomplete or
not-planned duplicates require explicit classification.

Issue creation/reuse/queueing is handled by the generated-work mutation
pipeline. It is idempotent across retries and uncertain create responses by
re-reading correlation markers before creating and after ambiguous failures.
It records component-level results for create, correlation comment, labels,
project/status, and ledger reconciliation; a confirmed issue creation is not
misreported as failed merely because a later component failed. Transient runner
labels are never copied into generated issues.

After an exact-head merge, completion hygiene treats the merge as
authoritative even when later issue hygiene partially fails. The runner
refreshes PR/issue/label/relationship evidence, closes only narrow issues whose
explicit close rule is satisfied, keeps umbrellas and partially complete work
open, posts evidence-backed completion and parent progress comments, removes
only transient runner labels, and records project fields as `not_updated`
unless a supported tested mapping exists. Ledger reconciliation is represented
as generated docs-planning work for a later branch/PR; the runner never commits
directly to `main` after merge.

Security finding false-positive disposition is stricter than ordinary issue
hygiene and remains default-off. A finding may only become disposition-ready
after a versioned strongly-proven packet binds exact repository/source/tool/
rule/fingerprint/ref/SHA/dependency identity, classification and
reconciliation digests, deterministic analysis proofs, current-main proof, and
no-weakening proof. Strong independent review and separate Codex
mechanics/security review must bind to the exact packet; a tie-breaker is
required for disagreement, conditional results, findings, digest drift, or
changed evidence. Code-scanning disposition is limited to the provider
`false positive` reason, Dependabot alert disposition is limited to
`inaccurate`, and Semgrep/Trivy artifact findings have no assumed mutable
endpoint. Any 403/404/provider failure is inaccessible, not resolved. Before a
future mutation, the adapter must reread the exact alert, produce a
precondition digest, reread again immediately before mutation, confirm by
post-mutation reread, reconcile current-main/scanner state, and only then allow
linked narrow issue completion hygiene. Repository defaults and the example
config keep all live disposition capabilities false.

Security finding duplicate handling is authoritative before proposal,
false-positive, retry, disposition, or completion planning. Exactly one active
authoritative match from live issues, PRs, reports, or durable state routes to
`reuse_existing_work`, increments duplicate/reuse counts, keeps mutation and
proposal authority false, and persists only bounded duplicate metadata. A
completed/merged duplicate while the provider finding remains current open
blocks as ambiguous for reconciliation; ledger-only evidence remains
supporting and cannot suppress genuinely new work.

Safe local control is file-based under
`/workspace/logs/settleora-auto-runner/state/runner-control.json`:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-iterations +N
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +N
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

The runner observes control only at safe boundaries before selecting new work.
It does not pause or stop mid-commit, mid-review, mid-check wait, or mid-merge.
Extensions are explicit and bounded, and they increase only loop budgets. They
do not override lane safety, manual gates, danger gates, provider budget hard
stops, independent-review gates, changed-file policy, checks, code scanning,
secrets policy, stop labels, auto-merge gates, or max-frequency/safety policy.
If no active runner exists, control commands fail gracefully without writing a
misleading pending control state.

At startup the runner discovers any non-terminal recovery state before polling
eligible issues. One active issue/branch/PR ownership record is supported; more
than one recoverable state fails closed. Existing-PR recovery remains
default-off, so a discovered recovery state blocks unrelated polling until a
bounded trusted profile explicitly enables recovery or an operator resolves the
state. When enabled, continuation resumes from the first safe incomplete phase
and uses idempotent markers to avoid duplicate PR creation, comments,
generated issue creation, merge attempts, source-branch restoration, closure,
parent progress, or ledger hygiene.

The detached supervisor control wrapper adds selected-run protection on top of
that global runner control file. `settleora-auto-runnerctl pause`,
`stop-after-current`, and `extend` first prove that the selected supervisor run
is in a controllable lifecycle state and that the current active runner's
sanitized `supervisorRunId` exactly equals the selected supervisor run ID.
Terminal supervisor runs reject controls without mutating supervisor state,
heartbeat files, report mapping, or the global runner control file. Foreground
runners and unrelated supervised runners cannot be controlled through an
arbitrary supervisor run. Accepted supervisor controls never replace the
primary lifecycle state with the command name; they store only bounded
`lastControl` metadata.

Operator command card for a future manually approved long-running run:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run <run-id>
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

The current budget is still stored internally as iterations because each
selected issue can stop as blocked, failed, skipped, PR-opened, or merged. In
canary/trusted operator language `--max-prs` is a documented alias for that
same completed PR/iteration loop budget. A `99 PR / 240h` run remains manually
gated and is not approved by this operator surface.

## Overnight Readiness Preflight

The report-only readiness command is:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --readiness
```

`--preflight` remains an alias-compatible diagnostic path; `--readiness` is the
preferred spelling when checking whether the DevBox is safe to consider for a
future overnight approval. The command writes machine-readable JSON and
human-readable Markdown under:

```text
/workspace/logs/settleora-auto-runner/readiness/
```

It also prints a concise pass/warn/fail summary to stderr and the full JSON
object to stdout. `pass` means the checked condition matched the conservative
readiness expectation. `warn` means the operator should inspect the condition
before trusting unattended operation, but the check did not prove an unsafe
configuration. `fail` means the current state is not suitable for unattended
operation.

The readiness preflight checks repository existence, clean worktree state,
`origin/main` reachability, local `HEAD` relation to `origin/main`, GitHub
authentication and repository reachability, #910/#805 state, eligible issue
searches using simple per-label queries, trusted real-run refusal, separate
canary approval state, risky gate defaults, active claim labels, stale-claim
stealing posture, active `auto-pr-opened` issues, open auto-runner PRs, Codex
command resolution without invocation, Node version, log write sanity, and
disk-space sanity.

The readiness command does not approve trusted overnight operation. It does not
install or enable systemd units, run Codex implementation or review prompts,
create branches, commit, push, open/update/merge PRs, request auto-merge,
change labels, comment on issues, steal stale claims, create follow-up issues,
or run review-fix mutation. `allowAutoMerge`,
`allowFollowupIssueCreation`, `allowStaleClaimSteal`,
`allowReviewFixMutation`, and `allowSystemdEnablement` remain false by
default. Enabling any of them is reported as `fail` unless a future explicit
approval flag and documentation are added.

The readiness output also reports the reviewer-tier and reviewer-budget
configuration without exposing command strings or secrets. Missing accounting
state means current reviewer spend is treated as USD 0. If accounting is added
by a future approved slice, it must live under
`/workspace/logs/settleora-auto-runner/state/`, not committed repository
paths.

## Approved-Domain Auto-Merge

The final merge-policy direction is approved-domain, not low-risk-only.
Repository defaults remain fail-closed: `allowAutoMerge` is false and
`autoMergePolicy.approvedLanes` is empty. A deployment/profile that enables
auto-merge must explicitly list supported canonical runnable lane IDs such as
`workflow-docs-tooling`, `docs-planning`, `client-ui-low-risk`,
`mobile-application`, `mobile-build-config`, `web-user-ui`, `web-admin-ui`, and
`api-domain-runtime`, `auth-session-security`,
`storage-file-privacy-authz`, `money-settlement-payment`,
`schema-migrations`, `openapi-generated-clients`,
`sync-import-export-restore`, and `docker-compose-ci-deployment`.
Alias-only, unknown, disabled, and split-required lanes are rejected by config
normalization or the merge gate.

An approved lane is only a capability. Auto-merge still requires a valid issue
contract with `autoMergeEligible=true` and `manualMergeRequired=false`, no
genuine manual action, exact changed-file matches against both the issue
contract and lane manifest, the lane-appropriate branch strategy, structured
validation evidence bound to exact head/base/files/profile, the configured
external review tier on that same evidence, independent Codex mechanics/security
approval, required GitHub checks and security scans, all observed exact-head
checks in acceptable final states, no open code-scanning alerts, no unresolved
review threads or requested changes, an open issue with
no stop labels, and an unchanged base/head through the final refresh. The
merge command uses `gh pr merge --merge --match-head-commit <exact-head>`.

Sensitive implementation is not a human decision by itself when the lane is
explicitly auto-merge supported. Repository code changes in auth/security,
storage/privacy/authz, money/settlement/payment, schema migrations,
OpenAPI/generated clients, sync/import/export/restore, and Docker/CI/deployment
may auto-merge only after their stronger exact-head gates pass. The live/manual
actions still block regardless of review quality: production deployment,
mobile store release, destructive migration or data execution, secret or
credential/auth-config mutation, public/admin exposure, architecture
replacement, force-like history, branch deletion/cleanup, Day 1 scope cuts,
and unresolved product/policy/authorization/privacy/security/financial
authority decisions.

## External Reviewer Tiers

External reviewer execution is independent of Codex mechanics/security review.
The external provider can satisfy `cheap_independent`, `strong_independent`,
or a configured bounded `tie_breaker` tier, but it cannot replace the Codex
mechanics/security reviewer. Codex review also cannot replace required
external review.

Reviewer routing starts from the validated lane metadata. Size and path
analysis may escalate from cheap to strong or split/block, but it must not
downgrade a lane-required strong tier. Split-required or huge cross-domain
work blocks for a split or human escalation. Sensitive/high-risk lanes,
reviewer-policy/merge-policy changes, auth/security, storage/privacy, money,
schema, OpenAPI/generated-client, sync/restore, deployment/CI, and other
policy-critical tooling require strong external review evidence before a gate
can pass.

The non-mutating package entrypoint is:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --review-package <package.json> --config <task-scoped-config.json>
```

It writes sanitized evidence under the configured logs root. Evidence binds the
review to the exact head, base SHA when supplied, sorted changed files,
changed-file digest, package digest, route/tier, provider profile/model,
attempt count, verdict schema version, bounded pricing, budget/accounting, and
sanitized evidence path. Any head/base/file/digest mismatch detected by a gate,
missing or malformed verdict, provider failure, disabled tier, unavailable
model, timeout, budget hard stop, secret-like path/diff, or non-pass verdict
blocks. This package mode does not start the issue loop, mutate GitHub, or
enable approved-domain auto-merge by itself.

## Low-Risk Auto-Merge Wait And Recovery Evidence

Low-risk canary auto-merge keeps fail-closed semantics while waiting long
enough for normal GitHub check latency. The default bounded wait is 60
attempts with a 30-second delay bucket, giving slow ordinary validation checks
up to 30 minutes before the runner fails closed. External config values are
normalized to fixed safe bounds and delay buckets, with a hard cap of 60
attempts, so operator-provided values are not passed directly into timers.

Every wait attempt rechecks the exact PR head, base, mergeability, merge state,
checks, review threads, code scanning, issue state, changed-file scope, and
blocking labels/comments/reviews. Pending or refreshable merge states can be
retried. Stale heads or bases, failed or cancelled checks, unresolved threads,
open code-scanning alerts, stop labels, changed files outside the contract, or
manual blockers remain terminal blockers. Sanitized evidence records each
attempt, elapsed wait, pending check names, final outcome, and whether pending
check counts were decreasing.

Existing-PR recovery is default-off and only applies when an external config
names the issue/PR. The recovery inspection reads current PR metadata,
including title and body, then passes sanitized issue-linkage evidence into the
decision. A PR is linked only when current PR title or body contains the exact
`#<issue>` reference with numeric boundary safety. Near-misses such as
`#8250`, `#0825`, embedded token text, or regex-looking text do not match.
Missing title/body evidence, stale exact-head evidence, broad changed files,
unresolved review threads, open PR-ref code-scanning alerts, issue stop labels,
manual blockers, failed checks, or missing exact-head validation/review
evidence all fail closed. When all recovery evidence and terminal gates pass
and only required checks are pending or mergeability is in a refreshable state,
existing-PR recovery enters the same bounded wait loop as normal auto-merge
instead of requiring a second operator invocation.

Fresh implementation runs create the runner-owned commit locally before any
independent Gemini or Codex mechanics review runs. That local commit stays
unpushed until local validation and both required reviews pass. Review packages
use the committed `origin/main...HEAD` diff, record the reviewed commit SHA and
exact changed-file set, and the later push/PR step must use that same SHA. If a
review-fix mode is separately approved and changes files, the runner creates a
new normal local follow-up commit and reruns exact-head reviews for the new
head; old evidence cannot authorize the new commit. Stale, missing-head, or
changed-file-mismatched review evidence fails closed.

Codex mechanics review evidence is machine-readable. Each attempt records
status, signal, selected response boundary, parse/contract diagnostics, final
verdict when present, sanitized prompt/log paths, reviewed head, and changed
files. Reviewer stdout is the primary response boundary. If stdout is empty,
stderr may be selected only when it contains exactly one valid verdict object;
multiple verdict objects across stdout/stderr are ambiguous and fail closed.
The runner captures stdout/stderr through files to avoid buffered-output
transport failures. A bounded retry, capped at two total attempts, is reserved
for process/transport categories such as missing selected payload or launch
transport failure. Valid non-approve verdicts, ambiguous output, malformed
contract output, scope/policy failures, manual/security blockers, and
substantive `unable_to_review` verdicts are not retried into approval.

For `client-ui-low-risk` and any future real-code auto-merge lane,
independent review evidence must be unambiguous in PR bodies, PR comments,
issue comments, summaries, and event listings:

```text
Independent AI review: required; provider/tier: Gemini cheap_independent; verdict: pass; exact head: <sha>; evidence: <sanitized local path>
```

Disabled, skipped, missing, malformed, stale-head, mismatched-file,
provider-failed, or non-pass independent review evidence is reported as
blocked/fail-closed. The runner must not describe required real-code
independent review as optional wording such as `Gemini when configured`, and
must not post raw Gemini output to GitHub.

Positive-scope danger scanning also stays fail-closed before implementation.
Validated `client-ui-low-risk` contracts may use financial-domain display
nouns only through a narrow presentation-only proof. The exception is
available solely when the contract is valid, the lane is exactly
`client-ui-low-risk`, the validation profile is exactly
`mobile-ui-low-risk`, every contracted path remains within the lane manifest
and under `apps/mobile/lib/ui/**` or `apps/mobile/test/ui/**`, and the only
detected danger reason is `money_settlement`. The positive scope must contain
explicit presentation proof such as accessibility, semantics, visible display
text, UI copy, layout/style-only behavior, or read-only shared-widget
rendering, and must contain no money-authority or mutation signal.

Money authority and mutation still block. This includes arithmetic,
calculation, rounding or precision policy, currency conversion, exchange
rates/FX, amount entry or persistence, payment/settlement/refund transitions,
balance/debt/owed mutations, split/allocation math, amount-derived
authorization or policy, API/domain/database/storage writes, and settlement,
payment, or billing behavior. Multiple danger reasons, auth/security,
storage/privacy, schema, OpenAPI/generated-client, sync/import/export,
deployment, secrets, public/admin exposure, release, destructive, branch, or
architecture danger cannot use the exception. The lane decision records
bounded sanitized classifier evidence and does not emit full issue bodies.

## Reviewer Tier And Budget Policy

Reviewer routing is a disabled-by-default policy foundation. Codex remains the
implementation engine, and the legacy `reviewerCommand` behavior is preserved
unless a future approved config explicitly enables a separate provider tier.
The built-in tier names are:

- `cheap_independent`
- `strong_independent`
- `tie_breaker`
- `codex_mechanics`

External independent tiers are unconfigured and disabled by default. Tier
configuration may name a provider profile, command, model, and token prices,
but repository source must not contain provider API keys, tokens, `.env`
values, or personal credentials. Readiness and review-package summaries report
only sanitized provider profile names, whether a command is configured, model
names, and token-price numbers.

The first approved provider profile direction is Google-only. When explicitly
configured outside the repository, `cheap_independent` should use a supported
Gemini Flash or Flash-Lite class model for routine PRs. `strong_independent`
and any enabled `tie_breaker` profile should use a specific stable Gemini
model, currently `gemini-3.5-flash`, rather than a moving `latest` alias.
Provider model lifecycle changes are operational failures, not review verdicts:
do not silently fall back to weaker, preview, or alias models after an
unavailable-model response. Model changes require official model,
deprecation, and pricing verification; explicit endpoint support; token-price
updates; a bounded smoke or integrated provider proof; and exact-head
rereview. This policy does not add or approve Claude or OpenAI reviewer
provider wiring.

Gemini API keys must be supplied from the process environment as
`GEMINI_API_KEY` or from an explicitly configured external env file under
`/workspace/logs/settleora-auto-runner/secrets/`, such as
`/workspace/logs/settleora-auto-runner/secrets/reviewer.env`. The repository
must not store live provider config from `/workspace/logs/**`, API keys,
authorization headers, `.env` files, or secrets.

The Gemini smoke-test command is standalone and non-mutating:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --live-external-reviewer-calls --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
```

It does not run Codex implementation, create branches, commit, push, open or
update PRs, mutate labels, comment on issues, merge, enable canary/real-run,
enable auto-merge, enable stale-claim stealing, enable follow-up issue
creation, enable review-fix mutation, or install/enable systemd. With the live
flag, it may make one tiny Gemini call only if the API key is available through
the approved secret boundary, projected reviewer spend stays below the hard
stop, and the estimated smoke cost stays below the tiny cap. Missing keys are
reported as `blocked_for_live_smoke_test_key_missing` rather than leaking
environment details.

The first integrated Gemini reviewer gate runs inside the normal pre-PR review
flow before branch push or PR creation, but only when external config enables
the Gemini `cheap_independent` tier. Built-in defaults keep that tier disabled.
When enabled, the integrated gate is limited to low-risk
`workflow-docs-tooling`, `docs-planning`, and `client-ui-low-risk` work:

- `workflow-docs-tooling`: `tools/auto-runner/**`, `docs/workflow/**`, and
  `scripts/ai/**`.
- `docs-planning`: `docs/planning/**` and `docs/qa/**`.
- `client-ui-low-risk`: `apps/mobile/lib/ui/**` and
  `apps/mobile/test/ui/**`.

The gate reuses the reviewer routing and budget policy. It requires an
explicit strict-JSON Gemini pass verdict before PR creation, writes sanitized
local evidence under
`/workspace/logs/settleora-auto-runner/reviews/integrated/`, and records
sanitized accounting under
`/workspace/logs/settleora-auto-runner/state/reviewer-accounting.json`.
Missing keys, unsupported or host-like model values, malformed or ambiguous
verdicts, non-pass verdicts, provider failures, budget hard stops, per-call
cap failures, malformed accounting, accounting write failures, disallowed
lanes/paths, secret-boundary risks, strong-review routes, and
`block_split_or_escalate` routes fail closed before PR creation. The Gemini
reviewer itself does not mutate GitHub and does not post comments.

The default reviewer budget policy assumes the Codex subscription is already
about USD 200/month and leaves normal reviewer budget at USD 80/month, with a
USD 95/month reviewer hard stop inside a USD 300/month total automation ceiling:

```json
{
  "reviewerBudget": {
    "monthlyReviewerBudgetUsd": 80,
    "monthlyReviewerHardStopUsd": 95,
    "totalMonthlyAutomationBudgetUsd": 300,
    "codexSubscriptionBudgetUsd": 200,
    "warnAtPercent": 80
  }
}
```

Cost estimates are local arithmetic only:

```text
(estimated input tokens / 1,000,000 * input USD per million tokens)
+ (estimated output tokens / 1,000,000 * output USD per million tokens)
```

The runner does not call external provider billing APIs. Budget checks warn at
the configured percentage of the normal reviewer budget and block when the
projected reviewer spend exceeds the hard stop.

Transient integrated Gemini/provider failures are retried only for bounded
transport or provider availability cases: HTTP `429`, HTTP `503` or
`UNAVAILABLE`, fetch/network failures, and timeout-style errors. The default
is one retry after the initial attempt. Non-pass verdicts, malformed verdicts,
missing keys, unsupported models, per-call caps, monthly hard stops,
accounting failures, and secret-boundary failures are terminal and are not
retried as transient provider errors.

Deterministic routing uses changed paths, lane, changed-file count, estimated
additions/deletions when known, and broad domain count:

- Docs-only, ledger, and workflow docs route to `cheap_independent`.
- Auto-runner tooling routes to `cheap_independent`, escalating to
  `strong_independent` when large or sensitive.
- Normal app feature work routes to `cheap_independent` by default,
  escalating to `strong_independent` when large or risky.
- Auth/security/storage/privacy/money/schema/OpenAPI/generated-client paths
  require `strong_independent` review.
- Huge or cross-domain PRs route to `block_split_or_escalate` unless a future
  explicit large-bundle lane is approved.

This policy does not approve real canary runs, normal trusted real-runs,
overnight operation, auto-merge lanes, stale-claim stealing, follow-up issue
creation, review-fix mutation, or systemd enablement.

## Label Contract

Eligible issue labels:

- `auto-ready`
- `auto-bundle`

Configured eligible labels are polled with one simple GitHub issue search per
label, such as `repo:tommytang213/Settleora is:issue is:open label:auto-ready`.
Results from multiple labels are aggregated and deduplicated by issue number.
Dedicated canary configs may set `eligibleLabels` to only
`auto-canary-ready`; the runner still requires the body-level contract before
implementation.

GitHub issue-search results are advisory only. At each safe iteration boundary
the runner discards stale candidate authority, scans a bounded candidate list,
excludes issue numbers already attempted in the same run, and live-refreshes
each remaining candidate by exact issue number before any label mutation,
branch creation, task prompt generation, Codex launch, review, or PR work. The
live issue must be open, carry a currently configured eligible label, carry no
stop or in-flight claim label, and still parse into an allowed lane/profile/path
contract. Closed, stale, stop-labeled, malformed, refresh-failed, or
already-attempted candidates are skipped with sanitized evidence and the next
distinct candidate is evaluated. If no distinct live-eligible candidate remains,
the runner stops cleanly as no eligible work.

Default stop labels:

- `needs-tommy`
- `manual-gate`
- `danger-gate`
- `auto-failed`
- `auto-running`
- `auto-pr-opened`
- `blocked`

Real-run claim behavior adds `auto-claimed` and `auto-running`, then posts a
bounded claim comment. Both labels are active in-flight claim labels, not
durable terminal labels. Immediately after claim mutation, the runner re-reads
the exact issue and requires that it is still open, still the same issue, still
has the expected current-run claim labels, and has not gained a stop/manual/
danger label. Ambiguous or conflicting claim state stops before implementation.
Stale-claim stealing is disabled by default and must stay disabled unless
config explicitly allows it.

A run-scoped attempted issue set is maintained in active-run, iteration,
summary, status, and event evidence. An issue number is added before
implementation work can start and is never selected again in that same run,
even if GitHub search or live refresh later reports it open and eligible, even
if issue closure or label cleanup fails, and regardless of terminal outcome:
merged, PR opened, blocked/manual, danger gate, validation failed, review
failed, no changes, or auto failed. A future runner invocation starts with a
fresh attempted set.

Terminal real-run outcomes always remove `auto-running` and `auto-claimed`.
`approved_pr_opened` adds `auto-pr-opened`, which is also a stop label so the
issue is not selected again while a PR is pending. `blocked_needs_tommy` adds
`needs-tommy`, `danger_gate` adds `danger-gate`, and `auto_failed`,
`validation_failed`, and `review_changes_requested_retry_exhausted` add
`auto-failed`. `no_changes` removes both active claim labels and comments the
outcome without closing the issue. The runner never closes issues
automatically.

Dry-run mode previews the exact label add/remove/comment operations instead of
calling `gh issue edit`, `gh issue comment`, or `gh issue create`.

`auto-bundle` means the issue may use the feature-bundle path when the
body-level contract includes a strict `bundle` object. A valid bundle uses one
branch, two to four ordered slices, one generated prompt/report per slice,
one explicit-path checkpoint commit per completed slice, one final aggregate
validation and review package, and one final PR. Completed slices are not
rerun during recovery; corrupt, stale, missing, mismatched, partial, dirty, or
ambiguous state fails closed. The runner observes pause/stop controls only at
safe boundaries between slices.

Feature bundles are allowed only for runnable normal lanes that explicitly
support the parent validation profile and paths. Focused, split-required,
manual-gated, disabled, alias-only, unknown, or cross-domain lanes remain
separate focused branches. Auth/security, storage/privacy/authz, money/
settlement/payment, schema/migrations, OpenAPI/generated clients, sync/restore
authority, Docker/CI/deployment, production, destructive, secret, public/admin
exposure, and unresolved authority decisions do not become bundle-eligible
because `auto-bundle` is present.

## Issue Contract

`auto-ready` and `auto-bundle` are eligibility signals only. They do not
authorize implementation, path scope, validation commands, PR creation, or
merge behavior.

Every issue that the runner may implement must include a body-level contract:

````markdown
## Auto-runner contract

```json
{
  "contractVersion": 1,
  "lane": "workflow-docs-tooling",
  "allowedPaths": [
    "tools/auto-runner/**",
    "docs/workflow/**"
  ],
  "validationProfile": "workflow-tooling",
  "manualMergeRequired": true,
  "autoMergeEligible": false,
  "requiredReading": [
    "PROGRAM_ARCHITECTURE.md",
    "docs/workflow/CODEX_TASK_GUIDE.md",
    "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"
  ],
  "bundle": {
    "bundleVersion": 1,
    "strategy": "feature-bundle",
    "slices": [
      {
        "id": "contract",
        "title": "Bundle contract",
        "objective": "Implement strict bundle parsing",
        "allowedPaths": ["tools/auto-runner/lib/**"],
        "validationProfile": "runner-tests",
        "requiredReading": ["tools/auto-runner/README.md"]
      },
      {
        "id": "state",
        "title": "Bundle state",
        "objective": "Persist durable bundle checkpoint state",
        "allowedPaths": ["tools/auto-runner/lib/**"],
        "validationProfile": "runner-tests",
        "requiredReading": ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
        "dependsOn": ["contract"]
      }
    ]
  }
}
```
````

The first supported contract version is `1`. The contract is parsed from the
issue body only. Issue comments do not override the contract in this slice.

The parser fails closed for a missing contract, malformed JSON, missing fields,
unknown fields, unsupported contract version, unsupported lane, unsupported
validation profile, or contract `allowedPaths` outside the lane manifest. In
real-run these cases become a safe blocked outcome such as
`blocked_needs_tommy`; in dry-run the same outcome is previewed without GitHub
mutation.

Issue text cannot provide shell commands. It can only name a
`validationProfile`, and that profile must exist in trusted runner code.

## Lane Policy

Auto-merge is disabled globally by default. Real mutation requires `--run`.
Lane classification is contract-first and backed by a trusted lane manifest in
`tools/auto-runner/lib/lane-policy.mjs`. Text heuristics may still force
danger/manual gates, but they never authorize implementation or allowed paths.
For eligible auto-runner issues, explicit exclusion sections such as
`Non-goals`, `Out of scope`, and `Prohibited actions` are treated as negative
scope rather than positive implementation requests. Positive scope text,
dangerous `allowedPaths`, malformed contracts, disabled lanes, and
disabled lanes still fail closed.

Implemented lane matrix:

| Lane | Sensitivity | Branch strategy | Reviewer tier | Validation profile | Current posture |
| --- | --- | --- | --- | --- | --- |
| `workflow-docs-tooling` | low | normal | cheap | `workflow-tooling` / `runner-tests` | implementation, PR, and existing low-risk auto-merge gates remain available when explicitly configured |
| `docs-planning` | low | normal | cheap | `docs-only` | implementation, PR, and existing low-risk auto-merge gates remain available when explicitly configured |
| `client-ui-low-risk` | low | normal | cheap | `mobile-ui-low-risk` | narrow protected canary lane preserved |
| `mobile-application` | standard | normal | cheap | `mobile` | implementation and PR creation only |
| `mobile-build-config` | high | focused | strong | `mobile-build-config` | checked-in Flutter/native build inputs through stronger exact gates; signing, release, generated output, and credentials remain manual/forbidden |
| `web-user-ui` | standard | normal | cheap | `web-ui` | implementation and PR creation only |
| `web-admin-ui` | sensitive | focused | strong | `web-ui` | implementation and PR creation only |
| `api-domain-runtime` | sensitive | focused | strong | `api-domain` | implementation and PR creation only |
| `auth-session-security` | high | focused | strong | `api-security` | implementation and PR creation only |
| `storage-file-privacy-authz` | high | focused | strong | `api-storage` | implementation and PR creation only |
| `money-settlement-payment` | high | focused | strong | `api-money` | implementation and PR creation only |
| `schema-migrations` | high | focused | strong | `api-migrations` | migration code review only; destructive application remains manual |
| `openapi-generated-clients` | high | focused | strong | `openapi-generated-clients` | contract plus generated clients through repo generation only |
| `sync-import-export-restore` | high | focused | strong | `sync-import-export` | implementation under API-authoritative acceptance only |
| `docker-compose-ci-deployment` | high | focused | strong | `compose-ci` | repo code only; live deployment/env/secret mutation remains manual |
| `cross-domain` | split | split-required | split/escalate | none | blocked until future bundle/split policy |

Compatibility aliases map deterministically where safe:
`security-runtime` to `auth-session-security`, `storage-privacy` to
`storage-file-privacy-authz`, `money-settlement` to
`money-settlement-payment`, and `deployment-ci-env` to
`docker-compose-ci-deployment`. `product-runtime` remains a disabled
placeholder until a narrower domain lane is selected.

Sensitive and high-risk lanes are not categorically PR-only. #888
operationalized external reviewer tiers, and #889 plus the #907 correction
implement exact-head auto-merge expansion for supported canonical runnable
domains. Reviewer providers and approved lanes remain disabled by default until
an external profile explicitly enables them.

The contract `allowedPaths` must be a subset of the lane manifest allowlist.
PR creation is blocked if any changed file is outside either the contract
allowlist or the lane allowlist. Generic words such as `config` do not by
themselves trigger a manual gate; secret files, `.env`, local credentials,
SSH material, and credential mutation remain forbidden.

`mobile-build-config` is a focused high-sensitivity lane for source-controlled
Flutter/native platform build inputs. It is intentionally separate from
`mobile-application`: product runtime code under `apps/mobile/lib/**` and
Flutter app tests under `apps/mobile/test/**` stay in the application lane,
while build-config contracts may target exact checked-in inputs such as
`apps/mobile/pubspec.yaml`, `apps/mobile/pubspec.lock`, tracked assets or
localizations when present, Android manifests/resources/Kotlin/Gradle wrapper
metadata, iOS and macOS plist/project/workspace/scheme/xcconfig/Podfile files,
non-secret entitlements, Linux/Windows CMake and runner resources, and web
manifest/index/icon inputs. Issue contracts must remain narrower than the
lane maximum.

The lane forbids generated output and caches including
`apps/mobile/build/**`, `apps/mobile/.dart_tool/**`,
`apps/mobile/**/build/**`, `apps/mobile/android/.gradle/**`,
`apps/mobile/ios/Pods/**`, and `**/DerivedData/**`; signing/provisioning and
credential material including `*.p12`, `*.pfx`, `*.cer`,
`*.mobileprovision`, `*.jks`, `*.keystore`, private SSH keys, `.env` files,
and private-key material; TestFlight/App Store/Play publication or live
release actions; generated OpenAPI Dart clients; CI/deployment workflow
changes; and unrelated product/runtime/API/auth/security/money/storage/schema
paths. Ordinary non-secret `Info.plist`, manifests, Gradle files, Xcode
metadata, non-secret entitlements, `Podfile`, and checked-in native
source/resources are not manual solely because they are native build inputs.

The base `mobile-build-config` validation profile runs `git status --short`,
`git diff --name-only`, `git diff --check`,
`PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`, then
`/opt/flutter/bin/flutter pub get`, `analyze`, and full `test` from
`apps/mobile`. The validation planner then derives platform proof from actual
changed files, not from broad contract globs alone. Android project/config
changes append `flutter build apk --debug`, Gradle debug runtime dependency
resolution, and `:app:assembleDebug`. Web project/config changes append
`flutter build web`.

Linux, iOS, macOS, and Windows project inputs are fail-closed unless exact
platform evidence is available for the current head. Current Linux DevBox
validation cannot complete `flutter build linux` because
`flutter_secure_storage_linux` requires `libsecret-1>=0.18.4`, so Linux
project changes require the canonical external check
`mobile-build:linux:external-ci` until that host dependency is present in the
validated runner. iOS, macOS, and Windows builds cannot be proven by the Linux
runner and require `mobile-build:ios:external-ci`,
`mobile-build:macos:external-ci`, or `mobile-build:windows:external-ci`
respectively. External platform evidence must be bound to the exact head SHA,
base SHA, changed-file digest, inferred platform set, and canonical check
identifier. Missing, skipped, neutral, stale, wrong-head, wrong-digest, or
similarly named checks block auto-merge.

`apps/mobile/pubspec.yaml`, `apps/mobile/pubspec.lock`, tracked assets, and
localization inputs are treated as cross-platform build/dependency inputs, not
Dart-only proof. They require Android and web local proof plus the unavailable
host-platform external checks described above. Xcode compile/archive, signing
credentials, TestFlight, App Store, and Play submission remain macOS CI/manual
gates where unavoidable. The lane does not activate #912 external production
profiles and does not claim Settleora Day 1 product completion.

The runner must label/comment a bounded manual/split stop instead of
implementing unattended work for genuine human actions or decisions:
production deploy/promotion, mobile store/TestFlight/Play submission,
destructive migrations or destructive data operations, secret/auth credential
creation/rotation/disclosure/mutation, public/admin exposure or network/TLS/
DNS/proxy/router/firewall changes, architecture replacement, force-like
history changes, branch deletion/cleanup, Day 1 scope cuts, or unresolved
product/policy/authority/financial semantics.

AI review cannot clear these gates.

## Trusted Real-Run Canary Policy

Normal `--run` is not trusted by default. It is refused before issue polling,
claiming, branch creation, or GitHub mutation unless config explicitly sets
`trustedRealRunApproved: true` and all trusted mutation toggles remain disabled.

Canary real-run is a separate narrower approval path for a future manually
approved live test. It requires both CLI intent (`--canary` or
`--trusted-real-run-canary`) and config approval
(`trustedRealRunCanaryApproved: true`). Canary dry-run may be used with local
fixtures to exercise policy and evidence writing without GitHub mutation.

Canary mode is limited to contracted issues in these manifest lanes:

- `workflow-docs-tooling`
- `docs-planning`
- `client-ui-low-risk`

Normal canary mode refuses product/runtime/danger placeholder lanes, contracts
with `autoMergeEligible: true`, contracts with `manualMergeRequired: false`,
auto-merge, follow-up issue creation, stale-claim stealing, review-fix
mutation, and systemd enablement. Canary iteration count is capped by
`trustedRealRunCanaryMaxIterations`, defaulting to `2`.

Canary tasks still run scoped validation and the separate pre-PR AI review gate
before any PR creation. Canary PRs are human-review and human-merge only. This
policy does not approve overnight operation, follow-up issue creation,
stale-claim stealing, review-fix mutation, or systemd service/timer
installation or enablement.

A bounded low-risk auto-merge canary is a separate explicit approval mode, not
a normal canary default. It is allowed only when an external, uncommitted
config sets `trustedRealRunCanaryApproved: true`,
`trustedRealRunApproved: false`, `lowRiskAutoMergeCanaryApproved: true`, and
`allowAutoMerge: true`, the runner is invoked with `--run --canary`, and the
requested max iteration count is no greater than `2`. This max-2 path exists
only to prove the live low-risk auto-merge gates in a separate task; it does
not approve overnight operation or broader unattended operation.

The auto-merge canary accepts only issue-contract `allowedPaths` that are
non-empty safe subsets of these approved low-risk lane prefixes:

- `workflow-docs-tooling`: `tools/auto-runner/**` and `docs/workflow/**`.
- `docs-planning`: `docs/planning/**` and `docs/qa/**`.
- `client-ui-low-risk`: `apps/mobile/lib/ui/**` and
  `apps/mobile/test/ui/**`.

Contracts do not need to list every approved lane prefix. Least-privilege
single-file contracts are preferred for live canary issues, for example
`docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md` or
`docs/planning/ISSUE_PROGRESS_LEDGER.md`, as long as every entry is under one
of the approved prefixes. Those contracts must set `autoMergeEligible: true`
and `manualMergeRequired: false`. Broad root paths, `**`, `docs/**`,
`apps/mobile/**`, `scripts/ai/**`, generated clients, product/security/
storage/money/schema/OpenAPI/generated-client/Docker/deployment/env/secret/
public/admin scope, stop labels, missing Gemini pass when Gemini is
configured, missing Codex mechanics
approval, failing or mismatched-head checks, unresolved review threads, PR-ref
code-scanning alerts, stale PR heads, base mismatch, dirty worktree, and
issue-state mismatches all remain fail-closed gates.

The `client-ui-low-risk` validation profile is fixed in runner source and
runs `git status --short`, `git diff --name-only`, `git diff --check`,
Flutter `pub get`, Flutter `analyze`, and
`flutter test test/ui/settleora_component_guardrail_test.dart` from
`apps/mobile`. Issue contracts cannot provide shell commands or substitute a
broader mobile validation profile.

Canary evidence is written under:

```text
/workspace/logs/settleora-auto-runner/canary/
```

Each evidence JSON records the selected mode, issue number/title/labels/url,
the parsed contract, lane decision, canary policy decision, changed files,
validation results, review verdict, PR URL when available, and terminal
outcome.

Checkpoint: after the #818/#820 canary completed, a normal trusted real-run
pilot exercised the integrated Gemini pre-PR gate through the DevBox
auto-runner path for a low-risk workflow-docs task. This was a bounded pilot
only; it did not approve overnight operation, auto-merge, stale-claim stealing,
follow-up issue creation, review-fix mutation, or systemd enablement.

## Low-Risk Review-Fix Mutation Foundation

Review-fix mutation remains disabled in built-in defaults:
`allowReviewFixMutation: false` and `maxReviewFixCycles: 0`. Pathological
external values are normalized to a safe maximum of one attempt. A fix attempt
requires an external, uncommitted config path and the bounded low-risk canary
approval shape: `--run --canary`, `trustedRealRunCanaryApproved: true`,
`trustedRealRunApproved: false`, `lowRiskAutoMergeCanaryApproved: true`,
`allowAutoMerge: true`, `allowReviewFixMutation: true`, and
`maxReviewFixCycles` greater than zero. It cannot be mixed with stale-claim
stealing, follow-up issue creation, systemd enablement, or broad trusted
real-run approval.

The first eligible lanes are only `workflow-docs-tooling` and `docs-planning`.
The issue contract must set `autoMergeEligible: true` and
`manualMergeRequired: false`, and changed files must remain inside the exact
contract `allowedPaths` plus low-risk lane prefixes. Broad root paths, `**`,
`docs/**`, traversal, generated clients, `scripts/ai/**`, product/runtime,
API, auth/session/security, storage/privacy, money/settlement, schema/
migration, OpenAPI/generated-client, Docker/deployment/env/secret, public/
admin, mobile, OCR, sync, import/export, backup/restore, stop labels, dirty or
stale branches, and missing local validation remain fail-closed blockers.

A review-fix attempt is considered only after local validation has passed and a
structured actionable review result blocks PR creation: either integrated
Gemini returns a strict JSON non-pass finding with bounded findings, or Codex
mechanics review returns `changes_requested` with
`recommended_next_action: "run_safe_fix_cycle"` and bounded blocking findings.
Malformed reviewer output, missing output, provider/accounting/secret-boundary
failures, unsupported models, budget hard stops, non-actionable findings,
GitHub checks/code-scanning/review-thread failures, manual blocker comments,
and dangerous lane/path/scope do not trigger mutation.

The fix prompt uses the issue contract as authority, includes only sanitized
finding summaries, restricts Codex to the existing branch and exact
`allowedPaths`, and prohibits broad refactors, unrelated cleanup, generated
client edits, secrets/env files, product/runtime/security/money/schema/
OpenAPI changes, pushes, PR updates, GitHub comments, merges, branch deletion,
and live provider calls. The runner still owns explicit-path staging; no
`git add .` rule is relaxed.

After a fix attempt, the runner rechecks changed files against the contract,
reruns local validation, reruns any required or active integrated independent
review gate, reruns Codex mechanics review, and fails closed if any review
remains blocking. Sanitized
attempt evidence is written under:

```text
/workspace/logs/settleora-auto-runner/review-fix/
```

Evidence records issue/lane, branch and SHA context, changed files before and
after, reviewer source, sanitized findings, validation and review before/after,
whether a fix attempt happened, stop reason, whether PR/merge eligibility
continued, and a secret-boundary confirmation. Provider payloads, tokens,
`reviewer.env` values, authorization headers, raw local config data, and
secrets must not be logged, prompted, commented, or committed.

Post-fix Codex mechanics review receives a dedicated
`post-review-fix-mechanics` package. That package labels the initial
implementation report as `pre_fix_report` and stale background only, then
provides the structured finding that triggered the fix, the review-fix
decision, changed files before/after, post-fix validation, final integrated
review or fixture pass status, and current authoritative status. Missing,
malformed, stale-head, wrong-issue, or wrong-file post-fix evidence fails
closed before mechanics review.

### Deterministic Review-Fix Canary Fixture

The review-fix canary fixture is a local deterministic review source for a
future one-issue live canary. It is disabled in built-in config and requires
external, uncommitted config. It is accepted only with `--run --canary`, the
trusted real-run canary approval, broad trusted real-run disabled, low-risk
auto-merge canary approval, `allowAutoMerge: true`, review-fix mutation
enabled, and a positive review-fix cycle count clamped to one.

The fixture is restricted to `workflow-docs-tooling` and `docs-planning`
contracts with `autoMergeEligible: true`, `manualMergeRequired: false`, and
non-empty exact `allowedPaths` under the approved low-risk canary prefixes. It
refuses broad paths, dangerous product/runtime/API/auth/session/security/
storage/privacy/money/settlement/schema/migration/OpenAPI/generated-client/
Docker/deployment/env/secret/public/admin/mobile/OCR/sync/import/export/
backup/restore paths, missing validation, stop-label scopes, and malformed
fixture config.

When enabled, the fixture replaces only the integrated reviewer source for that
explicit canary mode; normal Gemini and Codex mechanics review paths are
unchanged when it is disabled. It scans the changed allowed files for the exact
configured marker, for example `review-fix-cycle: completed`. If absent, it
returns the same structured actionable failure shape consumed by the
review-fix loop. If present after the fix cycle, it returns a pass verdict.
Sanitized fixture evidence is written under:

```text
/workspace/logs/settleora-auto-runner/review-fix/
```

Fixture evidence includes fixture mode, issue number, lane, allowed paths,
reviewed head, marker identifier, finding count, and pre/post-fix phase. It
does not include raw provider payloads, secrets, local config bodies, or raw
marker values.

## Low-Risk Auto-Merge Foundation

Auto-merge remains disabled in built-in defaults. A normal trusted run may only
evaluate a low-risk auto-merge when external, uncommitted config sets
`allowAutoMerge: true` and the issue contract sets
`autoMergeEligible: true` with `manualMergeRequired: false`. A canary trusted
run also requires `lowRiskAutoMergeCanaryApproved: true` and the max-2 exact
path rules above.

The eligible low-risk auto-merge lanes are limited to
`workflow-docs-tooling`, `docs-planning`, and `client-ui-low-risk`. The runner
still fails closed unless changed files are exactly
inside the issue contract and lane allowlists, local validation passed,
Codex mechanics review approved, the
PR is open/non-draft/mergeable/clean on `main`, the PR head exactly matches the
runner-created commit, `origin/main` still matches the expected base, required
GitHub checks passed on the exact head, no unresolved review threads exist, no
open code-scanning alerts exist for the PR ref, no blocking comments/reviews
or manual gate markers are present, and the issue is still open without stop
labels such as `needs-tommy`, `danger-gate`, `blocked`, or `auto-failed`.

Because `client-ui-low-risk` is real code, auto-merge for that lane also
requires a passing independent Gemini review on the same head and changed-file
set. Disabled, skipped, missing, malformed, stale-head, mismatched-file,
provider-failed, or non-pass independent review evidence fails closed.
Codex mechanics review remains required, but it is not sufficient by itself
for real-code auto-merge. Existing-PR recovery for this lane requires both
independent Gemini evidence and Codex mechanics evidence on the exact PR head.

The only merge method for this foundation is normal GitHub merge-commit
semantics, equivalent to `gh pr merge <number> --merge`. The runner must not
direct-push to `main`, force-push, squash, rebase, delete branches, or merge
stale PR heads. If GitHub auto-deletes the source branch, the runner restores
the reviewed source branch SHA with a normal non-force push.

The auto-merge decision uses a bounded refresh loop for GitHub mergeability
states that can lag behind newly completed checks. While checks are pending or
the PR reports a refreshable state such as `BLOCKED` or `UNKNOWN`, the runner
rechecks PR metadata, exact head SHA, base branch, mergeability, merge state,
checks, review threads, code scanning, issue state, and blocking comments or
reviews. It still proceeds only when every existing gate passes on the exact
head. A stale head, changed base, failed check, unresolved review thread, open
code-scanning alert, stop label, manual marker, broad changed file, or wait
timeout fails closed with sanitized evidence.

Existing-PR recovery is disabled by default. A later explicit external config
may enable `allowExistingPrRecovery` for a specific low-risk canary issue and
PR. Recovery requires the PR branch/body to link the issue, exact changed
files within the issue contract, exact-head local validation evidence,
exact-head Gemini and/or Codex mechanics evidence, current successful checks,
clean mergeability, resolved review threads, no open PR-ref code-scanning
alerts, no issue stop labels, no blocking comments/reviews, and the unchanged
expected PR head. Missing or stale evidence fails closed.

Successful auto-merge closes the linked issue as completed and posts concise
sanitized PR/issue comments only after the merge succeeds. After a successful
normal merge, the runner re-reads the linked issue labels and removes only
the transient lifecycle labels it actually finds: `auto-running`,
`auto-claimed`, `auto-pr-opened`, and `auto-failed`. Durable classification
labels such as area labels, `workflow`, `canary`, `auto-canary-ready`,
priority, day-scope, and project labels are preserved. If label cleanup or
post-merge comments fail, merge success remains authoritative; the result
stays `merged`, issue closure/comment attempts continue independently, and
the cleanup failure is recorded for operator follow-up. Dry-run mode previews
the exact transient labels that would be removed without mutating GitHub.

Blocked auto-merge leaves the PR and issue open, records a terminal runner
outcome, and writes sanitized local evidence under
`/workspace/logs/settleora-auto-runner/auto-merge/`. Summaries report
eligibility, attempted state, result, exact PR head SHA, merge SHA when
available, issue closure result, issue label-cleanup result, and blocked
reason. This foundation does not run a live auto-merge canary or approve
trusted overnight operation.

## Validation Profiles

Validation profiles are named, trusted command lists in runner code. Supported
profiles are:

- `docs-only`
- `workflow-tooling`
- `runner-tests`
- `scaffold-docs`

Issue text cannot add, replace, append, or interpolate commands. Unknown or
injected profile names fail closed before implementation.

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
10. Collect the report and post-Codex changed-file list from the checkout.
    Implementation Codex must leave intended changes as local files for the
    runner to own. It must not push, open/update PRs, merge, or mutate GitHub
    labels/issues/comments.
11. Plan and run scoped validation.
12. Check for unexpected pre-review GitHub mutation evidence, including a
    remote task branch or any PR for the task branch.
13. Build a mandatory pre-PR review package.
14. Run the integrated external reviewer gate when the configured tier and
    low-risk lane policy require it.
15. Run a separate Codex mechanics review-only AI pass outside the mutable
    checkout.
16. Block PR creation unless required external review passes and the mechanics
    review verdict is `approve`.
17. Stage explicit changed paths only, commit, push the branch, open/update PR,
    watch checks, and comment/label the outcome.
18. Write a per-iteration summary and continue to the next eligible issue.
19. Write a final run summary.

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
Reviewer verdict JSON is parsed against the allowed enum values. The parser
does not parse the full diagnostic review log. The runner treats the reviewer
process `stdout` stream as the selected machine-parseable response payload and
keeps `stderr`/session transcript material only in the raw review log for human
diagnostics. If the selected `stdout` payload is empty or invalid, the review
fails closed; the runner must not fall back to parsing the combined raw log.

Within the selected response payload, the parser extracts JSON object
candidates from raw JSON, fenced `json` blocks, and JSON surrounded by
prose/tool output, then validates each object against the strict verdict
schema. It accepts only when exactly one schema-valid verdict object exists.
Invalid schema/example candidates, including placeholder enum strings such as
`approve | changes_requested | needs_tommy | danger_gate | unable_to_review`,
are counted and ignored only when there is exactly one valid verdict object.
Malformed JSON candidates, oversized candidates, non-object raw JSON, missing
required fields, unknown fields, out-of-enum values without a valid verdict,
zero valid verdicts, or multiple valid verdicts fail closed as
`unable_to_review`. Review results, canary evidence, and summaries record the
selected response payload boundary (`process.stdout`), the raw review log path,
selected-payload verdict candidate counts, raw-log candidate counts when useful,
selected JSON source (`raw_json`, `fenced_json`, or
`extracted_surrounded_json`) when present, and failure reason when review cannot
be accepted. Dry-run review diagnostics never approve PR creation.

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

After implementation Codex exits, the runner collects changed paths from the
post-Codex checkout: unstaged tracked changes with `git diff --name-only`,
staged/index changes with `git diff --cached --name-only`, and untracked files
with `git ls-files --others --exclude-standard`. The combined set is
deduplicated and sorted before lane/contract allowlist checks, validation
planning, review-package evidence, summaries/canary evidence, and explicit-path
staging/commit. `no_changes` is allowed only when that post-Codex working tree,
index, and untracked-file set is clean.

If any post-Codex changed path is outside the issue contract allowlist or lane
manifest allowlist, the runner fails closed with the offending paths recorded
and does not silently restore or discard implementation changes. Operator
cleanup remains a manual inspection step unless a future explicit safe cleanup
path is designed.

The runner never uses `git add .` and never fabricates empty commits.

PR creation/update is allowed only when validation passes, pre-PR review
approves, the implementation path did not create a remote task branch or PR
before review, the review did not mutate the checkout, lane policy does not
require manual/danger gate before PR, and the task report is present enough to
link. The runner does not merge into `main` by default.

Generated implementation prompts tell implementation Codex to implement
locally, validate locally, write the local report only, and leave intended file
changes in the checkout. The runner owns explicit-path staging, commit, push,
PR creation/update, CI watching, and issue outcome labels/comments after
validation and approved pre-PR review.

## Running

Preflight:

```bash
cd /workspace/repos/Settleora
node tools/auto-runner/settleora-auto-runner.mjs --preflight
```

Preflight prints a bounded JSON result with pass/warn/fail checks for the repo
root, branch/worktree status and whether real-run would refuse, `gh`
availability, `gh repo view tommytang213/Settleora`, issue polling,
`codex-vm-full` resolution, logs-root writability, config parseability, trusted
real-run disabled/enabled state, canary approval state, explicit
low-risk-auto-merge canary approval mode, whether normal `--run` would refuse,
whether canary real-run would refuse and why, disabled or explicitly approved
auto-merge/follow-up/stale-claim-steal/review-fix/systemd defaults, and the
fact that this command does not install or enable systemd. Preflight does not
acquire the runner lock, run implementation Codex, run review Codex, mutate
GitHub, create branches, or enable systemd units.

Dry-run:

```bash
cd /workspace/repos/Settleora
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once --require-pre-pr-review
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --canary --max-iterations 2 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
```

`--fixture-issues <json>` is accepted only with `--dry-run`. Fixture mode uses
local issue objects to simulate multiple eligible issues in one trigger,
continues after terminal dry-run outcomes, skips issues that already carry stop
labels such as `auto-pr-opened`, and stops on no eligible fixture work or
`--max-iterations`. It does not call real GitHub mutation commands, create
branches, push, open PRs, run real Codex, mutate `.codex`, or enable auto-merge.
Canary dry-run writes canary evidence under the external log root.

Bounded real-run, still disabled by default unless config explicitly approves
the selected trusted mode:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --once
node tools/auto-runner/settleora-auto-runner.mjs --run --max-iterations 20
node tools/auto-runner/settleora-auto-runner.mjs --run --max-runtime 8h
node tools/auto-runner/settleora-auto-runner.mjs --run --canary --max-iterations 1 --config /workspace/logs/settleora-auto-runner/canary-approved-config.json
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

To stop a foreground run, send `Ctrl+C`. This tooling only provides example
systemd user templates and does not install or enable them.

## Known Limitations

- Real issue mutation is guarded but not yet trusted for unattended production
  use.
- Follow-up issue creation is modeled and gated, not enabled by default.
- Stale-claim stealing is disabled.
- Safe review-fix cycles are modeled but intentionally conservative.
- Auto-merge to `main` is disabled by default; the first low-risk lane
  foundation exists but requires explicit external config and issue-contract
  opt-in before it can attempt a normal GitHub merge commit.
- Manual review is still required before enabling real unattended mutation.
# Large-candidate review routing

Large-candidate routing is a distinct versioned authority. Size alone routes a
coherent candidate to mandatory strong cumulative Gemini and local Codex
review; it is not a manual gate and does not require routine exact approval
metadata. Mixed architecture-sensitive combinations route to deterministic
split planning and proceed only when exact issue/task ownership, allowed paths,
dependency order, and semantic own-delta proof cover every changed path exactly
once. Otherwise the runner records the conflicting domains/files and minimum
manual scope decision. Historical `blocked_external_reviewer_split_required`
state migrates to split-required state and never counts as a review pass.

Structured review freezes base/head/tree/diff/file-manifest identity, assigns
every changed path to one domain section, records required unchanged integration
boundaries, and requires fresh Gemini and local Codex section passes plus a
final cross-section integration pass from each reviewer. Missing, duplicate,
stale, mismatched, malformed, truncated, over-budget, partial, or uncovered
evidence blocks. Provider/context limits record exact uncovered scope and
resume through recovery/session rotation or a proven deterministic split
without consuming a source-changing round or logical-task charge. Any candidate
identity change invalidates all route, coverage, section, integration, and
verdict evidence.

## Operational projection and ledger boundary

`settleora-auto-runnerctl.mjs export-status --json|--markdown` is the canonical
read-only operator/GPT handoff. A single versioned normalized model reconciles
live Git/repository and GitHub adapters with trusted local operational adapters;
Markdown is rendered from that model. Live identity outranks local compatibility
fields and the planning ledger. Ambiguity, corrupt reads, multiple active
authorities, PR mismatch, repository mismatch, and stale head fail closed with
bounded reason codes and no read repair or mutation.

The model explicitly classifies live/local values as authoritative, evidence as
immutable and head-correlated, the planning ledger as derived, and lifetime
source-changing rounds as telemetry-only. The authoritative blocking counters
remain the #923 per-epoch local rounds and per-PR GitHub fix epochs; accepted
logical-task charging remains #932 authority. Recovery (#928), session rotation
(#929), and large-route/split/stack (#924) values are projected without changing
their policies.

Repository ledger updates are milestone/batched documentation. Ephemeral waits,
retries, heartbeats, polls, source cycles, rotations, and control transitions do
not schedule ledger work. The ledger never selects work or influences completion,
closure, recovery, merge, or duplicate suppression.
